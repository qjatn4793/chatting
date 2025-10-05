// src/pages/chat/ChatListPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'
import { RoomsAPI, RoomDto, MessageDto } from '@/api/rooms'
import { toStr } from '@/lib/identity'
import { fmtTime } from '@/lib/time'
import { useInvalidate } from '@/hooks/useInvalidate'

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
            userId ?? user?.id ?? user?.userId ?? user?.uuid ?? user?.uid ?? user?.userUUID ?? user?.email
        return toStr(cand)
    }, [userId, user])

    const abortRef = useRef<AbortController | null>(null)

    const fetchRoomsOnce = useCallback(async () => {
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

                        return { ...room, dmPeer, lastMessagePreview: preview, lastMessageAt: createdAt }
                    } catch {
                        return { ...room, dmPeer: null, lastMessagePreview: null, lastMessageAt: null }
                    }
                }),
            )

            setRooms(enriched)
        } catch (e) {
            const canceled =
                (e as any)?.name === 'CanceledError' ||
                (e as any)?.code === 'ERR_CANCELED' ||
                (e as any)?.message === 'canceled'
            if (!canceled) setError('방 목록을 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [meKey])

    const { invalidate } = useInvalidate(fetchRoomsOnce, 800)

    useEffect(() => {
        invalidate()
        return () => abortRef.current?.abort()
    }, [invalidate])

    // 사용자 알림 채널
    useEffect(() => {
        if (!meKey) return
        const uid = String(meKey)
        const unsubs: Array<() => void> = []

        const onUserNotify = () => invalidate()
        try { unsubs.push(ws.subscribe(`/topic/chat-notify/${uid}`, onUserNotify)) } catch {}

        const onConn = () => invalidate()
        try { ws.onConnect(onConn); ws.ensureConnected() } catch {}

        return () => {
            unsubs.forEach((u) => { try { u() } catch {} })
            try { ws.offConnect(onConn) } catch {}
        }
    }, [meKey, invalidate])

    // 방별 브로드캐스트
    useEffect(() => {
        if (!meKey) return
        const subs: Array<() => void> = []
        rooms.map((r) => r.id).forEach((rid) => {
            try { subs.push(ws.subscribe(`/topic/rooms/${rid}`, () => invalidate())) } catch {}
        })
        return () => subs.forEach((off) => { try { off() } catch {} })
    }, [meKey, rooms, invalidate])

    const sortedRooms = useMemo(
        () => [...rooms].sort((a, b) => Number(b.lastMessageAt ?? 0) - Number(a.lastMessageAt ?? 0)),
        [rooms]
    )

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

    return (
        <div className="friends">
            <h2>채팅</h2>

            {loading && <div className="friends__row">불러오는 중...</div>}
            {error && <div className="friends__row">{error}</div>}

            {!loading && !error && (
                <ul className="friends__list">
                    {sortedRooms.map((r) => {
                        const title = titleOf(r)
                        const count = unreadMap?.[r.id] ?? 0
                        const preview = r.lastMessagePreview || ''
                        const timeText = fmtTime(r.lastMessageAt)
                        return (
                            <li key={r.id} className="friends__item" onClick={() => navigate(`/chat/${r.id}`)}>
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
