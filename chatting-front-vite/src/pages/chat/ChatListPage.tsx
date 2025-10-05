// src/pages/chat/ChatListPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import '@/styles/friends.css'
import { ws } from '@/ws'

/* ────────────────────────────────────────────────────────────
 * 1) 백엔드 DTO에 맞춘 타입
 * ──────────────────────────────────────────────────────────── */
type RoomDto = {
    id: string
    type?: string | null
    createdAt?: string | null
    members?: string[] | null // 백엔드: List<String>
}

type MessageDto = {
    id?: number | null
    roomId?: string | null
    messageId?: string | null
    sender?: string | null
    username?: string | null
    content?: string | null
    createdAt?: string | number | null
}

/* ────────────────────────────────────────────────────────────
 * 2) 순수 유틸
 * ──────────────────────────────────────────────────────────── */
const toStr = (x: unknown): string | undefined => {
    if (x === null || x === undefined) return undefined
    const s = String(x).trim()
    return s || undefined
}
const fmtTime = (ts?: string | number | null): string => {
    if (ts === null || ts === undefined) return ''
    const n = Number(ts)
    const d = isNaN(n) ? new Date(ts as any) : new Date(n)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    if (sameDay) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/* ────────────────────────────────────────────────────────────
 * 3) 메시지 정규화 (서버 MessageDto에 맞춤)
 * ──────────────────────────────────────────────────────────── */
type UiMsg = {
    id: string
    content: string
    createdAt?: string | number | null
    sender?: string
    username?: string
}
const normalizeMsg = (m: MessageDto): UiMsg | null => {
    if (!m) return null
    const id =
        toStr(m.messageId) ||
        (m.id != null ? String(m.id) : undefined) ||
        (m.roomId && m.createdAt ? `${m.roomId}-${m.createdAt}` : undefined)
    const content = toStr(m.content)
    if (!id || !content) return null
    return {
        id,
        content,
        createdAt: m.createdAt ?? null,
        sender: toStr(m.sender),
        username: toStr(m.username),
    }
}

/* ────────────────────────────────────────────────────────────
 * 4) API 래퍼 (+ AbortSignal)
 * ──────────────────────────────────────────────────────────── */
const RoomsAPI = {
    list: (opts?: { signal?: AbortSignal }) =>
        http.get<RoomDto[]>('/rooms', { signal: opts?.signal as any }),
    messages: (roomId: string, limit = 2, opts?: { signal?: AbortSignal }) =>
        http.get<MessageDto[]>(`/rooms/${roomId}/messages`, {
            params: { limit },
            signal: opts?.signal as any,
        }),
}

/* ────────────────────────────────────────────────────────────
 * 5) ChatListPage
 * ──────────────────────────────────────────────────────────── */
export default function ChatListPage(): JSX.Element {
    const navigate = useNavigate()
    const { userId, user } = useAuth() as any
    const { unread: unreadMap } = useNotifications() as any

    const [rooms, setRooms] = useState<Array<
        RoomDto & { lastMessageAt?: string | number | null; lastMessagePreview?: string | null; dmPeer?: string | null }
    >>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const meKey: string | undefined = useMemo(() => {
        const cand =
            userId ??
            user?.id ??
            user?.userId ??
            user?.uuid ??
            user?.uid ??
            user?.userUUID ??
            user?.email
        return toStr(cand)
    }, [userId, user])

    /* 호출 최적화: 진행중 중복 방지 + 이벤트 합치기(invalidate) */
    const REFRESH_MIN_GAP = 800 // ms
    const nextTickRef = useRef<number | null>(null)
    const lastRunRef = useRef(0)
    const loadingRef = useRef(false)
    const abortRef = useRef<AbortController | null>(null)

    /** 방 목록 + 최근 2개 메시지로 보강 */
    const fetchRoomsOnce = useCallback(async () => {
        if (loadingRef.current) return
        loadingRef.current = true

        if (abortRef.current) abortRef.current.abort()
        const ac = new AbortController()
        abortRef.current = ac

        setError(null)
        setLoading(true)
        try {
            const res = await RoomsAPI.list({ signal: ac.signal })
            const base: RoomDto[] = Array.isArray(res.data) ? res.data : []

            const enriched = await Promise.all(
                base.map(async (room) => {
                    try {
                        const h = await RoomsAPI.messages(room.id, 2, { signal: ac.signal })
                        const msgs = (Array.isArray(h.data) ? h.data : []).map(normalizeMsg).filter(Boolean) as UiMsg[]

                        const last = msgs[0] || null
                        const preview = last?.content || null
                        const createdAt = (last?.createdAt as any) ?? null

                        let dmPeer: string | null = null
                        if ((room.type || '').toUpperCase() === 'DM' || (room.members?.length || 0) === 2) {
                            dmPeer = toStr(last?.username) || null
                            if (!dmPeer) {
                                const ms = Array.isArray(room.members) ? room.members : []
                                const other = ms.find((m) => toStr(m) && toStr(m) !== meKey)
                                dmPeer = other ? String(other) : null
                            }
                        }

                        return {
                            ...room,
                            dmPeer,
                            lastMessagePreview: preview,
                            lastMessageAt: createdAt,
                        }
                    } catch {
                        return {
                            ...room,
                            dmPeer: null,
                            lastMessagePreview: null,
                            lastMessageAt: null,
                        }
                    }
                }),
            )

            setRooms(enriched)
            lastRunRef.current = Date.now()
        } catch (e) {
            const canceled =
                (e as any)?.name === 'CanceledError' ||
                (e as any)?.code === 'ERR_CANCELED' ||
                (e as any)?.message === 'canceled'
            if (!canceled) setError('방 목록을 불러오지 못했습니다.')
        } finally {
            setLoading(false)
            loadingRef.current = false
        }
    }, [meKey])

    /** 여러 이벤트를 1회 호출로 합치는 invalidate */
    const invalidate = useCallback(() => {
        const now = Date.now()
        const gap = now - lastRunRef.current
        const delay = gap >= REFRESH_MIN_GAP ? 0 : REFRESH_MIN_GAP - gap

        if (nextTickRef.current) window.clearTimeout(nextTickRef.current)
        nextTickRef.current = window.setTimeout(() => {
            fetchRoomsOnce()
            nextTickRef.current = null
        }, delay) as unknown as number
    }, [fetchRoomsOnce])

    /* 초기 1회 */
    useEffect(() => {
        invalidate()
        return () => {
            if (abortRef.current) abortRef.current.abort()
            if (nextTickRef.current) window.clearTimeout(nextTickRef.current)
        }
    }, [invalidate])

    /* ✅ WS 구독: per-user 알림 + per-room 메시지 */
    // ① 사용자 알림: /topic/chat-notify/{meUuid}
    useEffect(() => {
        if (!meKey) return
        const uid = String(meKey)
        const unsubs: Array<() => void> = []

        const onUserNotify = () => invalidate()
        try {
            const off = ws.subscribe(`/topic/chat-notify/${uid}`, onUserNotify)
            unsubs.push(off)
        } catch { /* noop */ }

        const onConn = () => {
            // 재연결 시에도 사용자 알림 구독은 WS 레이어가 유지해 주는 경우가 많지만,
            // 안전하게 invalidate로 최신화
            invalidate()
        }
        try { ws.onConnect(onConn); ws.ensureConnected() } catch {}

        return () => {
            unsubs.forEach(u => { try { u() } catch {} })
            try { ws.offConnect(onConn) } catch {}
        }
    }, [meKey, invalidate])

    // ② 방 브로드캐스트: /topic/rooms/{roomId} (rooms 변경 시 동적 재구독)
    useEffect(() => {
        if (!meKey) return
        const subs: Array<() => void> = []
        const roomIds = rooms.map(r => r.id)

        roomIds.forEach(rid => {
            try {
                const off = ws.subscribe(`/topic/rooms/${rid}`, () => invalidate())
                subs.push(off)
            } catch { /* noop */ }
        })

        return () => {
            subs.forEach(off => { try { off() } catch {} })
        }
    }, [meKey, rooms, invalidate])

    /* 파생값: 최근 메시지 시간 내림차순 */
    const sortedRooms = useMemo(() => {
        return [...rooms].sort((a, b) => {
            const at = Number(a.lastMessageAt ?? 0)
            const bt = Number(b.lastMessageAt ?? 0)
            return bt - at
        })
    }, [rooms])

    /* 타이틀 계산 */
    const titleOf = useCallback((room: RoomDto & { dmPeer?: string | null }): string => {
        const isDM =
            (room.type && room.type.toUpperCase() === 'DM') ||
            ((room.members?.length || 0) === 2)

        if (isDM) {
            if (room.dmPeer) return room.dmPeer!
            const ms = Array.isArray(room.members) ? room.members : []
            const other = ms.find((m) => toStr(m) && toStr(m) !== meKey)
            if (other) return String(other)
        }
        return room.id || '대화방'
    }, [meKey])

    /* 렌더링 */
    return (
        <div className="friends">
            <h2>채팅</h2>

            {loading && <div className="friends__row">불러오는 중…</div>}
            {error && <div className="friends__row">{error}</div>}

            {!loading && !error && (
                <ul className="friends__list">
                    {sortedRooms.map((r) => {
                        const title = titleOf(r)
                        const count = unreadMap?.[r.id] ?? 0
                        const preview = r.lastMessagePreview || ''
                        const timeText = fmtTime(r.lastMessageAt)
                        return (
                            <li
                                key={r.id}
                                className="friends__item"
                                onClick={() => navigate(`/chat/${r.id}`)}
                            >
                                <div className="friends__left">
                                    <div className="friends__nameRow">
                                        <div className="friends__name">{title}</div>
                                        {count > 0 && <span className="badge badge--unread">{count}</span>}
                                    </div>
                                    <div className="friends__preview" title={preview || undefined}>
                                        {preview ? (timeText ? `${preview} · ${timeText}` : preview) : (timeText || '메시지가 없습니다.')}
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            {!loading && !error && sortedRooms.length === 0 && (
                <div className="friends__row">대화방이 없습니다. 친구에게 먼저 말을 걸어보세요!</div>
            )}
        </div>
    )
}