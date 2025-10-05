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
import { previewCache } from '@/lib/previewCache'

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

// 간단한 동시성 제한 실행기
async function pLimitAll<T, R>(items: T[], limit: number, worker: (t: T) => Promise<R>): Promise<R[]> {
    const ret: R[] = []
    let idx = 0
    let active = 0

    return await new Promise<R[]>((resolve) => {
        const kick = () => {
            if (idx >= items.length && active === 0) return resolve(ret)
            while (active < limit && idx < items.length) {
                const cur = items[idx++]
                active++
                worker(cur)
                    .then((r) => ret.push(r as any))
                    .catch(() => void 0)
                    .finally(() => {
                        active--
                        kick()
                    })
            }
        }
        kick()
    })
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
    const subsRef = useRef<Map<string, () => void>>(new Map())
    const prefetchOnceRef = useRef(false)

    /** rooms 1회 로드 → 캐시로 즉시 수화 → 구독 동기화 → 결손 프리패치(1회) */
    const loadRoomsOnce = useCallback(async () => {
        if (abortRef.current) abortRef.current.abort()
        const ac = new AbortController()
        abortRef.current = ac
        setError(null)
        setLoading(true)
        try {
            const res = await RoomsAPI.list({ signal: ac.signal })
            const base: RoomDto[] = Array.isArray(res.data) ? res.data : []

            // (1) 기본 배열 구성
            let enriched = base.map((room) => ({
                ...room,
                dmPeer: null,
                lastMessagePreview: null,
                lastMessageAt: null,
            }))

            // (2) 캐시 수화(즉시 화면 반영)
            enriched = previewCache.hydrateRooms(enriched)
            setRooms(enriched)

            // (3) 방 구독 동기화
            syncRoomSubscriptions(enriched.map((r) => r.id))

            // (4) 캐시에 없는 방만, 소량/동시제한으로 마지막 메시지 1개 프리패치 (마운트당 1회)
            if (!prefetchOnceRef.current) {
                prefetchOnceRef.current = true
                const missing = enriched
                    .filter((r) => !r.lastMessageAt && !r.lastMessagePreview)
                    .slice(0, 20) // 너무 많으면 상위 20개만
                    .map((r) => r.id)

                await pLimitAll(missing, 4, async (rid) => {
                    try {
                        const h = await RoomsAPI.messages(rid, 1, { signal: ac.signal })
                        const m = (Array.isArray(h.data) ? h.data : [])
                            .map(normalizeMsg)
                            .filter(Boolean)[0] as UiMsg | undefined
                        if (!m) return
                        setRooms((prev) => {
                            const idx = prev.findIndex((x) => x.id === rid)
                            if (idx < 0) return prev
                            const next = prev.slice()
                            const r = { ...next[idx] }
                            r.lastMessagePreview = m.content
                            r.lastMessageAt = m.createdAt ?? r.lastMessageAt ?? null
                            // dmPeer 보강
                            if ((r.type || '').toUpperCase() === 'DM' || (r.members?.length || 0) === 2) {
                                if (!r.dmPeer) {
                                    r.dmPeer =
                                        m.username ||
                                        (Array.isArray(r.members)
                                            ? (r.members.find((mm) => toStr(mm) && toStr(mm) !== meKey) as string | undefined)
                                            : undefined) ||
                                        null
                                }
                            }
                            next[idx] = r
                            // 캐시에도 저장
                            previewCache.set(rid, { preview: r.lastMessagePreview, at: r.lastMessageAt, dmPeer: r.dmPeer })
                            return next
                        })
                    } catch {
                        /* ignore */
                    }
                })
            }
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

    /** 구독 레지스트리 동기화 */
    const syncRoomSubscriptions = useCallback((targetIds: string[]) => {
        const current = subsRef.current
        const targetSet = new Set(targetIds)

        // 제거
        for (const [rid, off] of current.entries()) {
            if (!targetSet.has(rid)) {
                try { off() } catch {}
                current.delete(rid)
            }
        }
        // 추가
        targetIds.forEach((rid) => {
            if (current.has(rid)) return
            try {
                const off = ws.subscribe(`/topic/rooms/${rid}`, (payload: MessageDto) => {
                    const m = normalizeMsg(payload)
                    if (!m || m.roomId !== rid) return
                    setRooms((prev) => {
                        const idx = prev.findIndex((r) => r.id === rid)
                        if (idx < 0) return prev
                        const next = prev.slice()
                        const r = { ...next[idx] }
                        r.lastMessagePreview = m.content
                        r.lastMessageAt = m.createdAt ?? r.lastMessageAt ?? null
                        if ((r.type || '').toUpperCase() === 'DM' || (r.members?.length || 0) === 2) {
                            if (!r.dmPeer) {
                                r.dmPeer =
                                    m.username ||
                                    (Array.isArray(r.members)
                                        ? (r.members.find((mm) => toStr(mm) && toStr(mm) !== meKey) as string | undefined)
                                        : undefined) ||
                                    null
                            }
                        }
                        next[idx] = r
                        // ▶ 캐시 저장 (다음에 다시 들어와도 즉시 보이도록)
                        previewCache.set(rid, { preview: r.lastMessagePreview, at: r.lastMessageAt, dmPeer: r.dmPeer })
                        return next
                    })
                })
                current.set(rid, off)
            } catch { /* ignore */ }
        })
    }, [meKey])

    // 마운트/가시성/온라인에서 드문 보강
    useEffect(() => {
        loadRoomsOnce()
        try { ws.ensureConnected() } catch {}
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                // 캐시 수화만 먼저
                setRooms((prev) => previewCache.hydrateRooms(prev))
                loadRoomsOnce()
            }
        }
        const onOnline = () => loadRoomsOnce()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('online', onOnline)
        return () => {
            abortRef.current?.abort()
            for (const [, off] of subsRef.current) { try { off() } catch {} }
            subsRef.current.clear()
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('online', onOnline)
        }
    }, [loadRoomsOnce])

    // 정렬
    const sortedRooms = useMemo(
        () => [...rooms].sort((a, b) => Number(b.lastMessageAt ?? 0) - Number(a.lastMessageAt ?? 0)),
        [rooms]
    )

    // 타이틀
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

    const { unread: unreadState } = useNotifications() as any

    return (
        <div className="friends">
            <h2>채팅</h2>

            {loading && <div className="friends__row">불러오는 중...</div>}
            {error && <div className="friends__row">{error}</div>}

            {!loading && !error && (
                <ul className="friends__list">
                    {sortedRooms.map((r) => {
                        const title = titleOf(r)
                        const count = unreadState?.[r.id] ?? 0
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
