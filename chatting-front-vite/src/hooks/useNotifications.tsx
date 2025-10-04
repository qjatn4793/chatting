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

/**
 * 서버가 사용자 개인 큐(/topic/chat-notify/{userId} 등)로 보내주는 알림 payload 예시를
 * 유연하게 수용하기 위한 타입. 다양한 키를 다 받아들일 수 있게 넉넉하게 잡는다.
 */
export type ChatNotify =
    | {
    type?: string // 'MESSAGE' | 'UNREAD_INC' | 'UNREAD_SET' 등 자유
    roomId?: string
    room_id?: string
    room?: string
    senderUserId?: string
    sender?: string
    email?: string
    count?: number // 절대값 or 증분값이 들어올 수 있음
    unread?: number
    delta?: number
    messageId?: string
    id?: string
    uuid?: string
}
    | any

type Ctx = {
    /** 컨텍스트 상태를 직접 노출 — 변경 시 소비자 리렌더 보장 */
    unread: Record<string, number>
    getUnreadByRoom: (roomId: string) => number
    resetUnread: (roomId: string) => void
    setActiveRoom: (roomId?: string) => void
    /** ✅ 외부(RealtimeProvider)에서 WS 수신 시 호출할 엔트리포인트 */
    pushNotif: (n: ChatNotify) => void
}

const NotificationsContext = createContext<Ctx | null>(null)
const LS_KEY = 'unreadCounts:v1'
const SERVER_UNREAD_ENDPOINT = '/unread/summary' // => /api/unread/summary
const ROOMS_ENDPOINT = '/rooms' // => /api/rooms

// 프로젝트에 따라 방 토픽(/topic/room.{id})를 따로 구독할 수도 있음.
// 지금은 RealtimeProvider가 per-user notify를 밀어주므로 중복증분을 피하려고 false.
const ENABLE_ROOM_TOPIC_SUBSCRIBE = false

// 구독 반환형이 함수/객체 어떤 것이든 통일 clean-up
function toCleanup(x: any): () => void {
    if (!x) return () => {}
    if (typeof x === 'function') return x
    if (typeof x?.unsubscribe === 'function') return () => x.unsubscribe()
    return () => {}
}

// 메시지/알림에서 발신자 추출
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

// payload에서 roomId 유연히 뽑기
function pickRoomId(obj: any): string | undefined {
    const cand = obj?.roomId ?? obj?.room_id ?? obj?.room ?? obj?.id
    return cand == null ? undefined : String(cand)
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth() as any

    // ✅ meKey는 이메일 우선 (서버에서 sender=email로 보낼 가능성高)
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
        try {
            return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
        } catch {
            return {}
        }
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
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(obj))
        } catch {}
    }

    // 공용 증분/세팅 헬퍼
    const applyDelta = (roomId: string, delta: number) => {
        setUnread((prev) => {
            const next = { ...prev, [roomId]: Math.max(0, (prev[roomId] || 0) + delta) }
            try {
                localStorage.setItem(LS_KEY, JSON.stringify(next))
            } catch {}
            return next
        })
    }
    const applyAbsolute = (roomId: string, value: number) => {
        setUnread((prev) => {
            const next = { ...prev, [roomId]: Math.max(0, value) }
            try {
                localStorage.setItem(LS_KEY, JSON.stringify(next))
            } catch {}
            return next
        })
    }

    // ✅ 초기 미확인 요약 동기화
    useEffect(() => {
        ;(async () => {
            try {
                const res = await http.get(SERVER_UNREAD_ENDPOINT) // [{ roomId, count }]
                if (Array.isArray(res.data)) {
                    const merged = { ...unread }
                    for (const row of res.data) {
                        const rid =
                            row?.roomId ?? row?.room_id ?? row?.id ?? row?.room
                        if (rid != null)
                            merged[String(rid)] = Number(
                                row?.count ?? row?.unread ?? row?.unreadCount ?? 0
                            )
                    }
                    persist(merged)
                }
            } catch {
                // 서버 미구현/권한 문제는 무시 (WS notify로도 증분 동작)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ✅ 내 방 목록 (roomId 리스트 확보 — 선택)
    useEffect(() => {
        ;(async () => {
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
                console.warn('[useNotifications] /rooms fetch failed', e)
            }
        })()
    }, [])

    // (옵션) 방 토픽 구독 — 현재는 per-user notify가 있으므로 끔.
    useEffect(() => {
        if (!ENABLE_ROOM_TOPIC_SUBSCRIBE) return

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
                        const msg =
                            typeof payload === 'string' ? JSON.parse(payload) : payload

                        // 중복 방지
                        const mid = pickMsgId(msg) || `${r.id}:${Date.now()}`
                        if (recentMsgIds.current.has(mid)) return
                        recentMsgIds.current.add(mid)
                        if (recentMsgIds.current.size > 1000) {
                            recentMsgIds.current = new Set(
                                Array.from(recentMsgIds.current).slice(-400)
                            )
                        }

                        // 내 메시지는 제외
                        const sender = pickSender(msg)
                        if (meKey && sender === meKey) return

                        // 활성 방이면 증가 X (읽음 처리 트리거는 ChatRoomPage에서)
                        if (activeRoomRef.current === r.id) return

                        applyDelta(r.id, 1)
                    } catch (err) {
                        console.error(
                            '[useNotifications] room message parse error:',
                            err,
                            payload
                        )
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
            // 활성화 직후 바로 0으로 (서버 커서 반영은 ChatRoomPage에서 메시지 렌더 후 트리거)
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

    /**
     * ✅ RealtimeProvider에서 WS로 받은 알림을 주입하는 엔트리
     * 다양한 payload를 방어적으로 처리한다.
     */
    const pushNotif = (n: ChatNotify) => {
        try {
            const type = (n?.type || '').toString().toUpperCase()
            const roomId = pickRoomId(n)
            if (!roomId) return

            // 내가 보낸 거면 무시 (senderUserId 또는 sender/email 중 하나로 매칭)
            const sender =
                n?.senderUserId ??
                n?.sender ??
                n?.email ??
                n?.from ??
                n?.user
            if (meKey && sender && String(sender).trim() === meKey) return

            // 현재 보고 있는 방이면 증가하지 않음 (원한다면 즉시 markRead도 가능)
            if (activeRoomRef.current === roomId) return

            // 우선순위: 절대값 → delta/count → 기본 +1
            if (typeof n?.unread === 'number') {
                applyAbsolute(roomId, n.unread)
                return
            }
            if (typeof n?.count === 'number') {
                // count를 delta로 보내는 서버도 있으니 음수/양수 모두 수용
                applyDelta(roomId, n.count)
                return
            }
            if (typeof n?.delta === 'number') {
                applyDelta(roomId, n.delta)
                return
            }

            // 타입 힌트 기반 (필요시 더 늘려도 OK)
            switch (type) {
                case 'UNREAD_SET':
                    applyAbsolute(roomId, Number(n?.value ?? 0))
                    return
                case 'UNREAD_INC':
                case 'MESSAGE':
                default:
                    applyDelta(roomId, 1)
                    return
            }
        } catch (e) {
            console.warn('[useNotifications] pushNotif error', e, n)
        }
    }

    const value = useMemo<Ctx>(
        () => ({
            unread,
            getUnreadByRoom,
            resetUnread,
            setActiveRoom,
            pushNotif, // ✅ 컨텍스트에 노출
        }),
        [unread, pushNotif]
    )

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    )
}

export function useNotifications() {
    const ctx = useContext(NotificationsContext)
    if (!ctx)
        throw new Error('useNotifications must be used within NotificationsProvider')
    return ctx
}
