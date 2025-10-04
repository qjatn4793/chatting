import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import http from '@/api/http'
import { ws } from '@/ws'
import { useAuth } from '@/context/AuthContext'

type Ctx = {
    getUnreadByRoom: (roomId: string) => number
    resetUnread: (roomId: string) => void
    setActiveRoom: (roomId?: string) => void
}

const NotificationsContext = createContext<Ctx | null>(null)
const LS_KEY = 'unreadCounts:v1'
const SERVER_UNREAD_ENDPOINT = '/unread/summary' // => /api/unread/summary
const ROOMS_ENDPOINT = '/rooms'                  // => /api/rooms

// 구독 반환형이 함수/객체 어떤 것이든 통일 clean-up
function toCleanup(x: any): () => void {
    if (!x) return () => {}
    if (typeof x === 'function') return x
    if (typeof x?.unsubscribe === 'function') return () => x.unsubscribe()
    return () => {}
}

// 메시지에서 발신자(문자열) 뽑기: 백엔드는 sender=email 로 발행
function pickSender(msg: any): string | undefined {
    const cand =
        msg?.senderEmail ?? msg?.email ?? msg?.sender ?? msg?.from ?? msg?.user
    if (cand == null) return undefined
    const s = String(cand).trim()
    return s || undefined
}

// 메시지 id (중복 방지용)
function pickMsgId(msg: any): string | undefined {
    const cand = msg?.id ?? msg?.messageId ?? msg?.uuid
    return cand ? String(cand) : undefined
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth() as any
    // ✅ meKey는 이메일 우선 (백엔드 sender=email 기준)
    const meKey = useMemo(() => {
        const cand =
            user?.email ??
            user?.username ?? // fallback
            user?.id ??
            user?.userId ??
            user?.uuid ??
            user?.uid
        return cand ? String(cand).trim() : undefined
    }, [user])

    const [unread, setUnread] = useState<Record<string, number>>(() => {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
    })
    const [rooms, setRooms] = useState<Array<{ id: string }>>([])

    const activeRoomRef = useRef<string | undefined>(undefined)
    const recentMsgIds = useRef<Set<string>>(new Set())

    // 방별 구독 레지스트리: roomId -> cleanup
    const roomSubsRef = useRef<Map<string, () => void>>(new Map())

    const location = useLocation()

    // 라우트 기준 활성 방 설정
    useEffect(() => {
        const m = location.pathname.match(/^\/chat\/([^/]+)/)
        activeRoomRef.current = m ? m[1] : undefined
    }, [location.pathname])

    const persist = (obj: Record<string, number>) => {
        setUnread(obj)
        try { localStorage.setItem(LS_KEY, JSON.stringify(obj)) } catch {}
    }

    // ✅ 초기 미확인 요약 동기화
    useEffect(() => {
        (async () => {
            try {
                const res = await http.get(SERVER_UNREAD_ENDPOINT) // [{ roomId, count }]
                if (Array.isArray(res.data)) {
                    const merged = { ...unread }
                    for (const row of res.data) {
                        const rid =
                            row?.roomId ?? row?.room_id ?? row?.id ?? row?.room
                        if (rid != null) merged[String(rid)] = Number(row?.count ?? row?.unread ?? row?.unreadCount ?? 0)
                    }
                    persist(merged)
                }
            } catch {
                // 서버 미구현/권한 문제는 무시 (WS로도 증분 동작)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ✅ 내 방 목록 가져와서 각 방 토픽 구독 (/topic/room.{id})
    useEffect(() => {
        (async () => {
            try {
                const res = await http.get(ROOMS_ENDPOINT)
                const arr = Array.isArray(res.data) ? res.data : []
                const list: Array<{ id: string }> = []
                for (const r of arr) {
                    if (!r?.id) continue
                    list.push({ id: String(r.id) })
                }
                setRooms(list)
            } catch (e) {
                // 방 목록 실패는 무시하되 콘솔만
                console.warn('[useNotifications] /rooms fetch failed', e)
            }
        })()
    }, [])

    // ✅ 방 목록이 바뀔 때마다 개별 구독 재구성
    useEffect(() => {
        const subs = roomSubsRef.current

        // 1) 이미 구독 중인데 목록에 없는 방 → 해제
        for (const [rid, cleanup] of subs) {
            if (!rooms.some((r) => r.id === rid)) {
                cleanup()
                subs.delete(rid)
            }
        }

        // 2) 새 방 → 구독 추가
        for (const r of rooms) {
            if (subs.has(r.id)) continue

            try {
                const sub = ws.subscribe(`/topic/room.${r.id}`, (payload: any) => {
                    try {
                        const msg = typeof payload === 'string' ? JSON.parse(payload) : payload

                        // 중복 방지
                        const mid = pickMsgId(msg) || `${r.id}:${Date.now()}`
                        if (recentMsgIds.current.has(mid)) return
                        recentMsgIds.current.add(mid)
                        if (recentMsgIds.current.size > 1000) {
                            recentMsgIds.current = new Set(Array.from(recentMsgIds.current).slice(-400))
                        }

                        // 내 메시지는 제외
                        const sender = pickSender(msg)
                        if (meKey && sender === meKey) return

                        // 활성 방이면 증가 X (읽음 처리 트리거는 ChatRoomPage에서)
                        if (activeRoomRef.current === r.id) return

                        // ✅ unread +1
                        setUnread((prev) => {
                            const next = { ...prev, [r.id]: (prev[r.id] || 0) + 1 }
                            try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {}
                            return next
                        })
                    } catch (err) {
                        console.error('[useNotifications] room message parse error:', err, payload)
                    }
                })
                const cleanup = toCleanup(sub)
                subs.set(r.id, cleanup)
            } catch (e) {
                console.error('[useNotifications] subscribe failed for room', r.id, e)
            }
        }

        return () => {
            // 컴포넌트 언마운트 시 전체 해제
            for (const [, cleanup] of subs) cleanup()
            subs.clear()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rooms, meKey])

    // 선택: 전역 브로드캐스트가 있다면 유지 (없으면 제거해도 됩니다)
    // useEffect(() => {
    //   const sub = ws.subscribe('/topic/messages', ...) // 프로젝트에 있다면
    //   return toCleanup(sub)
    // }, [meKey])

    function getUnreadByRoom(roomId: string): number {
        return unread[roomId] || 0
    }

    function resetUnread(roomId: string) {
        const next = { ...unread }
        if (next[roomId]) {
            next[roomId] = 0
            persist(next)
            try {
                const bc = new BroadcastChannel('unread-sync')
                bc.postMessage({ type: 'unread-merge', payload: { [roomId]: 0 } })
                bc.close()
            } catch {}
        }
    }

    async function markRead(roomId: string, lastMessageId?: string) {
        try {
            await http.post(`/rooms/${roomId}/read`, { lastMessageId })
        } catch {
            // 서버 반영 실패해도 로컬은 0으로
        }
        resetUnread(roomId)
    }

    function setActiveRoom(roomId?: string) {
        activeRoomRef.current = roomId
        if (roomId) {
            // 활성화 직후 바로 0으로 (서버 커서 반영은 ChatRoomPage에서 메시지 렌더 후 트리거해도 됨)
            resetUnread(roomId)
        }
    }

    // 페이지 가시화 시 현재 방 읽음 처리
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible' && activeRoomRef.current) {
                void markRead(activeRoomRef.current)
            }
        }
        document.addEventListener('visibilitychange', onVis)
        return () => document.removeEventListener('visibilitychange', onVis)
    }, [])

    const value = useMemo<Ctx>(
        () => ({
            getUnreadByRoom,
            resetUnread,
            setActiveRoom,
        }),
        [unread]
    )

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    )
}

export function useNotifications() {
    const ctx = useContext(NotificationsContext)
    if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
    return ctx
}
