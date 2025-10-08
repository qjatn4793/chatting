import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import http from '@/api/http'
import { ws } from '@/lib/ws'
import { useAuth } from '@/context/AuthContext'
import { previewCache } from '@/lib/previewCache'
import { RoomsAPI, MessageDto } from '@/api/rooms'

// ✅ 웹 전용 주의 끌기 유틸
import {
    setAppBadge,
    setFaviconBadge,
    clearFaviconBadge,
    startTitleBlink,
    stopTitleBlink,
    showWebNotification,
    playPing,
} from '@/attn/attention'

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
    setAtBottom: (v: boolean) => void
    getAtBottom: () => boolean
}

const NotificationsContext = createContext<Ctx | null>(null)

const LS_KEY = 'unreadCounts:v1'
const SERVER_UNREAD_ENDPOINT = '/unread/summary'
const ROOMS_ENDPOINT = '/rooms'

// 미리보기 캐시 전용 글로벌 구독
const ENABLE_GLOBAL_ROOM_PREVIEW_SUBSCRIBE = true

function toCleanup(x: any): () => void {
    if (!x) return () => {}
    if (typeof x === 'function') return x
    if (typeof x?.unsubscribe === 'function') return () => x.unsubscribe()
    return () => {}
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

/** 미리보기 캐시용 정규화 */
function normalizeForPreview(raw: any): {
    roomId?: string
    content?: string
    createdAt?: number
    username?: string
} {
    const roomId = pickRoomId(raw)
    const body = raw?.content ?? raw?.message ?? raw?.text ?? raw?.preview ?? undefined
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
    const navigate = useNavigate()

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
    const atBottomRef = useRef<boolean>(true)

    const previewRoomSubsRef = useRef<Map<string, () => void>>(new Map())
    const primedRef = useRef(false)

    // 라우트 변화 → 활성 방 추출
    useEffect(() => {
        const m = location.pathname.match(/^\/chat\/([^/]+)/)
        activeRoomRef.current = m ? m[1] : undefined
    }, [location.pathname])

    // ======= helpers =======
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

    const getTotalUnread = useCallback(
        (src?: Record<string, number>) => {
            const o = src ?? unread
            let s = 0
            for (const k in o) s += o[k] || 0
            return s
        },
        [unread]
    )

    // ======= 서버에서 unread 요약 =======
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
            /* ignore */
        }
    }, [])

    useEffect(() => {
        if (!isAuthed || onAuthPage) return
        void refreshUnreadFromServer()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed, onAuthPage])

    // ======= 방 목록 로딩 =======
    useEffect(() => {
        if (!isAuthed || onAuthPage) return
            ;(async () => {
            try {
                const res = await http.get(ROOMS_ENDPOINT)
                const arr = Array.isArray(res.data) ? res.data : []
                const list: Array<{ id: string }> = []
                for (const r of arr) if (r?.id) list.push({ id: String(r.id) })
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
        const total = getTotalUnread()
        if (total <= 0) {
            stopTitleBlink()
            clearFaviconBadge()
            setAppBadge(0).catch(() => {})
        } else {
            setAppBadge(total).catch(() => setFaviconBadge(total))
        }
    }

    async function markRead(roomId: string, lastMessageId?: string) {
        try {
            await http.post(`/rooms/${roomId}/read`, { lastMessageId })
        } catch {
            /* ignore */
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

    // 가시성/포커스 복귀 → 읽음 및 시그널 정리
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible') {
                stopTitleBlink()
                clearFaviconBadge()
                if (activeRoomRef.current) void markRead(activeRoomRef.current)
                const total = getTotalUnread()
                if (total > 0) setAppBadge(total).catch(() => setFaviconBadge(total))
                else setAppBadge(0).catch(() => clearFaviconBadge())
            }
        }
        document.addEventListener('visibilitychange', onVis)
        window.addEventListener('focus', onVis)
        return () => {
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('focus', onVis)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ======= 새 메시지 시 주의 끌기(웹 전용) =======
    const triggerAttention = useCallback(
        (payload: ChatNotify) => {
            const roomId = pickRoomId(payload)
            const preview =
                (payload?.content ?? payload?.message ?? payload?.text ?? payload?.preview ?? '') as string

            const isHidden = document.visibilityState === 'hidden' || !document.hasFocus()
            const activeRoom = activeRoomRef.current
            const atBottom = getAtBottom()

            // 배지는 최신 유지 (숨김 여부와 무관)
            const total = getTotalUnread()
            setAppBadge(total).catch(() => setFaviconBadge(total))

            console.log(isHidden)
            console.log(activeRoom)
            console.log(roomId)

            // ⬇️ 숨김/비포커스일 때만 OS 알림
            if (isHidden) {
                const head = (preview || '(새 메시지)').slice(0, 30)
                startTitleBlink(head)
                showWebNotification({
                    title: '새 메시지',
                    body: head,
                    onClick: roomId ? () => navigate(`/chat/${roomId}`) : undefined,
                    tag: roomId ?? 'chat',
                })
                playPing()
                return
            } else {
                // ✅ 같은 방이고 탭이 보이며(포커스) 사용자가 대화 중이면: 어떤 알림도 띄우지 않음
                if (activeRoom === roomId) {
                    // (원한다면 여기서 배지/파비콘도 건드리지 않도록 return 위로 올릴 수 있음)
                    return
                } else {
                    const head = (preview || '(새 메시지)').slice(0, 30)
                    startTitleBlink(head)
                    showWebNotification({
                        title: '새 메시지',
                        body: head,
                        onClick: roomId ? () => navigate(`/chat/${roomId}`) : undefined,
                        tag: roomId ?? 'chat',
                    })
                    playPing()
                    return
                }
            }

            // visible 상태에서는 웹 알림/사운드 모두 없음
        },
        [getAtBottom, getTotalUnread, navigate]
    )

    // ======= unread 반영 + attention 트리거 =======
    const pushNotif = useCallback(
        (n: ChatNotify) => {
            try {
                const type = (n?.type || '').toString().toUpperCase()
                const roomId = pickRoomId(n)
                if (!roomId) return

                // 내가 보낸 메시지는 카운트/주의 제외
                const sender =
                    n?.senderUserId ?? n?.sender ?? n?.email ?? n?.from ?? n?.user
                if (meKey && sender && String(sender).trim() === meKey) return

                const isActive = activeRoomRef.current === roomId

                // ✅ 활성 방이 아닐 때만 미읽음 카운트 갱신
                if (!isActive) {
                    if (typeof n?.unread === 'number') {
                        applyAbsolute(roomId, n.unread)
                    } else if (typeof n?.count === 'number') {
                        applyDelta(roomId, n.count)
                    } else if (typeof n?.delta === 'number') {
                        applyDelta(roomId, n.delta)
                    } else {
                        switch (type) {
                            case 'UNREAD_SET':
                                // @ts-ignore 백엔드 value 케이스
                                applyAbsolute(roomId, Number(n?.value ?? 0))
                                break
                            case 'UNREAD_INC':
                            case 'MESSAGE':
                            default:
                                applyDelta(roomId, 1)
                                break
                        }
                    }
                }

                // ✅ 주의 신호는 활성 방이어도 필요 시 보낸다
                triggerAttention(n)
            } catch (e) {
                console.warn('[useNotifications] pushNotif error', e, n)
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [meKey, triggerAttention]
    )

    /** ✅ 개인 큐/유저 토픽 → previewCache + pushNotif */
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
                    try {
                        localStorage.setItem('preview-bump', String(Date.now()))
                    } catch {}
                }
            } catch {
                /* ignore */
            }
            // 카운트 + 주의 신호
            pushNotif(payload)
        }

        const un1 = toCleanup(
            ws.subscribe(`/topic/messages/${userUuid}`, onIncoming)
        )
        const un2 = toCleanup(ws.subscribe(`/user/queue/messages`, onIncoming))
        try {
            ws.ensureConnected()
        } catch {}

        return () => {
            un1()
            un2()
        }
    }, [isAuthed, user, pushNotif])

    /** ✅ 로그인 직후 1회: 방별 마지막 메시지 벌크 프라이밍 */
    useEffect(() => {
        if (!isAuthed || onAuthPage) return
        if (primedRef.current) return
        if (!rooms || rooms.length === 0) return

        primedRef.current = true
        const ac = new AbortController()

        ;(async () => {
            try {
                const ids = rooms.map((r) => r.id)
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
                        /* skip batch */
                    }
                }
                try {
                    localStorage.setItem('preview-bump', String(Date.now()))
                } catch {}
            } catch {
                /* ignore */
            }
        })()

        return () => ac.abort()
    }, [isAuthed, onAuthPage, rooms])

    /** (옵션) ✅ 전역: 방 토픽의 미리보기만 갱신 */
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
                            try {
                                localStorage.setItem('preview-bump', String(Date.now()))
                            } catch {}
                        }
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

    // ======= 총 unread 변화 → 배지 동기화 =======
    const prevTotalRef = useRef<number>(getTotalUnread())
    useEffect(() => {
        const total = getTotalUnread()
        if (prevTotalRef.current !== total) {
            prevTotalRef.current = total
            if (total > 0) {
                setAppBadge(total).catch(() => setFaviconBadge(total))
            } else {
                setAppBadge(0).catch(() => clearFaviconBadge())
                stopTitleBlink()
            }
        }
    }, [unread, getTotalUnread])

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
