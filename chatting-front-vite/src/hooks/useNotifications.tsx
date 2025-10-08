// src/hooks/useNotifications.tsx
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from 'react'
import { useLocation } from 'react-router-dom'
import http from '@/api/http'
import { ws } from '@/lib/ws'
import { useAuth } from '@/context/AuthContext'
import { previewCache } from '@/lib/previewCache'
import { RoomsAPI, MessageDto } from '@/api/rooms'

export type ChatNotify =
    | {
    type?: string
    roomId?: string
    room_id?: string
    room?: string
    senderUserId?: string
    sender?: string
    email?: string
    count?: number
    unread?: number
    delta?: number
    messageId?: string
    id?: string
    uuid?: string
    content?: string
    message?: string
    text?: string
    preview?: string
    createdAt?: string | number
    time?: string | number
    username?: string
    senderName?: string
}
    | any

type Ctx = {
    unread: Record<string, number>
    getUnreadByRoom: (roomId: string) => number
    resetUnread: (roomId: string) => void
    setActiveRoom: (roomId?: string) => void
    getActiveRoom: () => string | undefined
    pushNotif: (n: ChatNotify) => void
    refreshUnreadFromServer: () => Promise<void>

    // 전역 알림 추가
    setAtBottom: (v: boolean) => void
    getAtBottom: () => boolean
}

const NotificationsContext = createContext<Ctx | null>(null)

const LS_KEY = 'unreadCounts:v1'
const SERVER_UNREAD_ENDPOINT = '/unread/summary'
const ROOMS_ENDPOINT = '/rooms'

// 전역으로 방 토픽을 "미리보기 캐시 업데이트 전용"으로 구독할지
const ENABLE_GLOBAL_ROOM_PREVIEW_SUBSCRIBE = true

function toCleanup(x: any): () => void {
    if (!x) return () => {}
    if (typeof x === 'function') return x
    if (typeof x?.unsubscribe === 'function') return () => x.unsubscribe()
    return () => {}
}

function pickSender(msg: any): string | undefined {
    const cand =
        msg?.senderEmail ?? msg?.email ?? msg?.sender ?? msg?.from ?? msg?.user
    if (cand == null) return undefined
    const s = String(cand).trim()
    return s || undefined
}

function pickMsgId(msg: any): string | undefined {
    const cand = msg?.id ?? msg?.messageId ?? msg?.uuid
    return cand ? String(cand) : undefined
}

function pickRoomId(obj: any): string | undefined {
    const cand = obj?.roomId ?? obj?.room_id ?? obj?.room ?? obj?.id
    return cand == null ? undefined : String(cand)
}

const toMillis = (v: any): number => {
    if (v === null || v === undefined) return Date.now()
    if (typeof v === 'number') return v
    const t = Date.parse(String(v))
    return Number.isNaN(t) ? Date.now() : t
}

function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr]
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

/** 메시지/알림 payload → 미리보기 캐시에 넣기 위한 공통 정규화 */
function normalizeForPreview(raw: any): {
    roomId?: string
    content?: string
    createdAt?: number
    username?: string
} {
    const roomId = pickRoomId(raw)
    const body =
        raw?.content ?? raw?.message ?? raw?.text ?? raw?.preview ?? undefined
    const createdAt = toMillis(raw?.createdAt ?? raw?.time)
    const username =
        raw?.username ?? raw?.senderName ?? raw?.sender ?? raw?.email ?? undefined

    return {
        roomId: roomId ? String(roomId) : undefined,
        content: body != null ? String(body) : undefined,
        createdAt,
        username: username != null ? String(username) : undefined,
    }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { user, isAuthed } = useAuth() as any
    const location = useLocation()
    const onAuthPage = location.pathname === '/login'

    const meKey = useMemo(() => {
        const cand =
            user?.email ??
            user?.username ??
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
    const atBottomRef = useRef<boolean>(true) // 현재 활성방 리스트에서 "바닥 근접" 여부
    const recentMsgIds = useRef<Set<string>>(new Set())

    // 전역 방 토픽(미리보기 전용) 구독 레지스트리
    const previewRoomSubsRef = useRef<Map<string, () => void>>(new Map())
    // 로그인 직후 벌크 미리보기 프라이밍(one-shot)
    const primedRef = useRef(false)

    // 라우트 기준 활성 방 설정
    useEffect(() => {
        const m = location.pathname.match(/^\/chat\/([^/]+)/)
        activeRoomRef.current = m ? m[1] : undefined
    }, [location.pathname])

    const setAtBottom = useCallback((v: boolean) => {
        atBottomRef.current = !!v
    }, [])

    const getAtBottom = useCallback(() => atBottomRef.current, [])

    const persist = (obj: Record<string, number>) => {
        setUnread(obj)
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(obj))
        } catch {}
    }

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

    const refreshUnreadFromServer = useCallback(async () => {
        try {
            const res = await http.get(SERVER_UNREAD_ENDPOINT)
            if (Array.isArray(res.data)) {
                const merged: Record<string, number> = {}
                for (const row of res.data) {
                    const rid = row?.roomId ?? row?.room_id ?? row?.id ?? row?.room
                    if (rid != null) {
                        merged[String(rid)] = Number(
                            row?.count ?? row?.unread ?? row?.unreadCount ?? 0
                        )
                    }
                }
                persist(merged)
            }
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        if (!isAuthed || onAuthPage) return
        void refreshUnreadFromServer()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed, onAuthPage])

    useEffect(() => {
        if (!isAuthed || onAuthPage) return
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
    }, [isAuthed, onAuthPage])

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
            // ignore
        }
        resetUnread(roomId)
    }

    function setActiveRoom(roomId?: string) {
        activeRoomRef.current = roomId
        if (roomId) resetUnread(roomId)
    }

    const getActiveRoom = useCallback((): string | undefined => {
        return activeRoomRef.current
    }, [])

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible' && activeRoomRef.current) {
                void markRead(activeRoomRef.current)
            }
        }
        document.addEventListener('visibilitychange', onVis)
        return () => document.removeEventListener('visibilitychange', onVis)
    }, [])

    const pushNotif = (n: ChatNotify) => {
        try {
            const type = (n?.type || '').toString().toUpperCase()
            const roomId = pickRoomId(n)
            if (!roomId) return

            const sender =
                n?.senderUserId ??
                n?.sender ??
                n?.email ??
                n?.from ??
                n?.user
            if (meKey && sender && String(sender).trim() === meKey) return

            if (activeRoomRef.current === roomId) return

            if (typeof n?.unread === 'number') {
                applyAbsolute(roomId, n.unread)
                return
            }
            if (typeof n?.count === 'number') {
                applyDelta(roomId, n.count)
                return
            }
            if (typeof n?.delta === 'number') {
                applyDelta(roomId, n.delta)
                return
            }

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

    /** ✅ 전역: 개인 토픽/유저 큐 → previewCache 업데이트 + pushNotif */
    useEffect(() => {
        if (!isAuthed) return

        const userUuid =
            user?.id ?? user?.userId ?? user?.uuid ?? user?.uid ?? user?.userUUID
        if (!userUuid) return

        const onIncoming = (payload: any) => {
            try {
                const norm = normalizeForPreview(payload)
                if (norm.roomId && norm.content) {
                    previewCache.set(norm.roomId, {
                        preview: norm.content,
                        at: norm.createdAt!,
                        dmPeer: norm.username as any,
                    })
                    try { localStorage.setItem('preview-bump', String(Date.now())) } catch {}
                }
            } catch {
                /* ignore */
            }
            // 카운트는 기존대로
            pushNotif(payload)
        }

        const un1 = toCleanup(ws.subscribe(`/topic/messages/${userUuid}`, onIncoming))
        const un2 = toCleanup(ws.subscribe(`/user/queue/messages`, onIncoming))
        try { ws.ensureConnected() } catch {}

        return () => {
            un1()
            un2()
        }
    }, [isAuthed, user, pushNotif])

    /** ✅ 로그인 직후 1회: 모든 방의 마지막 메시지를 벌크로 받아 previewCache 프라이밍 */
    useEffect(() => {
        if (!isAuthed || onAuthPage) return
        if (primedRef.current) return
        if (!rooms || rooms.length === 0) return

        primedRef.current = true
        const ac = new AbortController()

        ;(async () => {
            try {
                const ids = rooms.map(r => r.id)
                // URL 길이/서버 로드 고려해 배치 호출
                for (const batch of chunk(ids, 80)) {
                    try {
                        const resp = await RoomsAPI.lastMessagesBulk(batch, { signal: ac.signal })
                        const arr: MessageDto[] = Array.isArray(resp.data) ? resp.data : []
                        for (const raw of arr) {
                            const norm = normalizeForPreview(raw)
                            if (norm.roomId && norm.content) {
                                previewCache.set(norm.roomId, {
                                    preview: norm.content,
                                    at: norm.createdAt!,
                                    dmPeer: norm.username as any,
                                })
                            }
                        }
                    } catch {
                        // 배치 하나 실패는 무시(다음 배치/WS/개별 조회로 보완)
                    }
                }
                try { localStorage.setItem('preview-bump', String(Date.now())) } catch {}
            } catch {
                // ignore
            }
        })()

        return () => ac.abort()
    }, [isAuthed, onAuthPage, rooms])

    /** (옵션) ✅ 전역: 방 토픽을 "캐시 업데이트 전용"으로 구독 — 미리보기만 갱신 */
    useEffect(() => {
        if (!ENABLE_GLOBAL_ROOM_PREVIEW_SUBSCRIBE) return
        if (!isAuthed || rooms.length === 0) return

        const subs = previewRoomSubsRef.current

        for (const [rid, cleanup] of subs) {
            if (!rooms.some((r) => r.id === rid)) {
                cleanup()
                subs.delete(rid)
            }
        }

        for (const r of rooms) {
            if (subs.has(r.id)) continue

            try {
                const sub = ws.subscribe(`/topic/rooms/${r.id}`, (payload: any) => {
                    try {
                        const norm = normalizeForPreview(payload)
                        if (norm.roomId && norm.content) {
                            previewCache.set(norm.roomId, {
                                preview: norm.content,
                                at: norm.createdAt!,
                                dmPeer: norm.username as any,
                            })
                            try { localStorage.setItem('preview-bump', String(Date.now())) } catch {}
                        }
                        // 미읽음 카운트는 여기서 건드리지 않음(개인 토픽으로만 처리)
                    } catch {
                        /* ignore */
                    }
                })
                const cleanup = toCleanup(sub)
                subs.set(r.id, cleanup)
            } catch {
                /* ignore */
            }
        }

        return () => {
            for (const [, cleanup] of subs) cleanup()
            subs.clear()
        }
    }, [isAuthed, rooms])

    const value = useMemo<Ctx>(
        () => ({
            unread,
            getUnreadByRoom,
            resetUnread,
            setActiveRoom,
            getActiveRoom,
            pushNotif,
            refreshUnreadFromServer,
            setAtBottom,
            getAtBottom,
        }),
        [unread, getActiveRoom, pushNotif, refreshUnreadFromServer, setAtBottom, getAtBottom]
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
