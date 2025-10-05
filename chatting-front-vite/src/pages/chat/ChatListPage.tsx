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

// 메시지 → UI 보강 (여기서는 WS payload만 반영하므로 최소 필드)
type UiMsg = {
    id: string
    roomId?: string
    content: string
    createdAt?: string | number | null
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
        roomId: toStr(m.roomId),
        content,
        createdAt: m.createdAt ?? null,
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
    // 현재 구독중인 roomId → unsubscribe
    const subsRef = useRef<Map<string, () => void>>(new Map())

    /** rooms 목록 1회 로드 (초기/드문 보강용) */
    const loadRoomsOnce = useCallback(async () => {
        if (abortRef.current) abortRef.current.abort()
        const ac = new AbortController()
        abortRef.current = ac
        setError(null)
        setLoading(true)
        try {
            const res = await RoomsAPI.list({ signal: ac.signal })
            const base: RoomDto[] = Array.isArray(res.data) ? res.data : []
            // 여기서는 /messages 재호출을 하지 않음 (WS로만 최신화)
            const enriched = base.map((room) => ({
                ...room,
                dmPeer: null,
                lastMessagePreview: null,
                lastMessageAt: null,
            }))
            setRooms(enriched)
            // 방 구독 동기화
            syncRoomSubscriptions(enriched.map(r => r.id))
        } catch (e) {
            const canceled =
                (e as any)?.name === 'CanceledError' ||
                (e as any)?.code === 'ERR_CANCELED' ||
                (e as any)?.message === 'canceled'
            if (!canceled) setError('방 목록을 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    /** 구독 레지스트리와 목표 roomId[]를 동기화 */
    const syncRoomSubscriptions = useCallback((targetRoomIds: string[]) => {
        const current = subsRef.current
        const targetSet = new Set(targetRoomIds)

        // 제거: 더 이상 존재하지 않는 방
        for (const [rid, off] of current.entries()) {
            if (!targetSet.has(rid)) {
                try { off() } catch {}
                current.delete(rid)
            }
        }
        // 추가: 새로 생긴 방만 구독
        targetRoomIds.forEach((rid) => {
            if (current.has(rid)) return
            try {
                const off = ws.subscribe(`/topic/rooms/${rid}`, (payload: MessageDto) => {
                    // 메시지 수신시, 로컬 rooms 상태만 갱신 — API 호출 금지!
                    const m = normalizeMsg(payload)
                    if (!m || m.roomId !== rid) return
                    setRooms((prev) => {
                        const idx = prev.findIndex((r) => r.id === rid)
                        if (idx < 0) return prev
                        const next = prev.slice()
                        const r = { ...next[idx] }
                        r.lastMessagePreview = m.content
                        r.lastMessageAt = m.createdAt ?? r.lastMessageAt ?? null
                        // DM 상대 추정(없을 때만): username 또는 members에서 나 제외
                        if ((r.type || '').toUpperCase() === 'DM' || (r.members?.length || 0) === 2) {
                            if (!r.dmPeer) {
                                r.dmPeer = m.username ||
                                    (Array.isArray(r.members) ? (r.members.find((mm) => toStr(mm) && toStr(mm) !== meKey) as string | undefined) : undefined) ||
                                    null
                            }
                        }
                        next[idx] = r
                        return next
                    })
                })
                current.set(rid, off)
            } catch { /* ignore */ }
        })
    }, [meKey])

    /** mount: 초기 1회 로드 + WS 연결 보장 */
    useEffect(() => {
        loadRoomsOnce()
        try { ws.ensureConnected() } catch {}
        return () => {
            abortRef.current?.abort()
            // 전체 구독 해제
            for (const [, off] of subsRef.current) { try { off() } catch {} }
            subsRef.current.clear()
        }
    }, [loadRoomsOnce])

    /**
     * ⚠️중요: ChatListPage에서는 **per-room 토픽만** 구독합니다.
     * `/topic/chat-notify/{uid}`는 이 페이지에서 구독하지 않습니다.
     * (같은 메시지에 대해 중복 invalidate를 유발했기 때문)
     * 만약 신규 방 생성/초대 등 구조 변화 이벤트가 `chat-notify`로만 오면,
     * 해당 이벤트에서 **roomId 목록을 전달**해 주시거나,
     * 아래처럼 이벤트성 트리거에 한해 `loadRoomsOnce()`를 1회 호출하세요.
     */
    useEffect(() => {
        // 예: 가시성/재연결 시에만 드물게 보강
        const onVisible = () => { if (document.visibilityState === 'visible') loadRoomsOnce() }
        const onOnline = () => loadRoomsOnce()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('online', onOnline)
        return () => {
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('online', onOnline)
        }
    }, [loadRoomsOnce])

    // rooms 정렬: 가장 최근 메시지 순
    const sortedRooms = useMemo(
        () => [...rooms].sort((a, b) => Number(b.lastMessageAt ?? 0) - Number(a.lastMessageAt ?? 0)),
        [rooms]
    )

    // 타이틀 계산
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
