// src/pages/chat/ChatListPage.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import { ws } from '@/ws'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import '@/styles/friends.css'

type ParticipantLike =
    | string
    | { id?: string | number; userId?: string | number; username?: string; name?: string }

type Room = {
    id: string
    name?: string
    title?: string
    type?: string           // 'DM' | 'GROUP' 등
    isGroup?: boolean
    isChannel?: boolean
    peer?: string
    partner?: string
    counterpart?: string
    friendUsername?: string
    username?: string
    participants?: ParticipantLike[]
    members?: ParticipantLike[]
    updatedAt?: number | string
    // 서버 응답에 unread/preview는 없음(클라가 friends 기반으로 보강)
}

const norm = (x: unknown) => (x == null ? '' : String(x))
const toUser = (p: ParticipantLike) =>
    typeof p === 'string'
        ? p
        : p?.username ??
        (p?.id != null ? String(p.id) : undefined) ??
        (p?.userId != null ? String(p.userId) : undefined) ??
        p?.name ??
        ''

const toMillis = (ts?: number | string) =>
    typeof ts === 'number' ? ts : (ts ? new Date(ts).getTime() : 0)

/** DM 방에서 상대(친구) username 추출 */
function friendKeyForDM(room: Room, me: string): string {
    const explicit =
        room.peer ||
        room.partner ||
        room.counterpart ||
        room.friendUsername ||
        room.username
    if (explicit) return explicit

    const arr = (room.participants || room.members || []) as ParticipantLike[]
    const others = arr.map(toUser).filter(Boolean).filter(u => u !== me)
    return others[0] || ''
}

/** 표시용 타이틀 */
function peerLabel(room: Room, me: string) {
    const fk = friendKeyForDM(room, me)
    if (fk) return fk
    const isGroup = room.isGroup || room.isChannel || (room.type && room.type !== 'DM')
    if (isGroup) return room.title || room.name || '그룹 대화'
    return room.title || room.name || '대화'
}

export default function ChatListPage(): JSX.Element {
    const [rooms, setRooms] = useState<Room[]>([])
    const [friends, setFriends] = useState<string[]>([])   // 🔸 /friends 기반 알림용
    const [tick, setTick] = useState(0)                    // 🔸 미세 갱신 트리거
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const nav = useNavigate()
    const { userId, logout } = useAuth() as any
    const me = norm(userId)

    // FriendsPage에서 쓰던 훅 그대로 활용(친구 username 키 기반)
    const { getUnread, getPreview, getPreviewTime } = useNotifications() as any

    /** 방 목록 로드: /rooms */
    const loadRooms = async () => {
        setLoading(true)
        try {
            const res = await http.get<Room[]>('/rooms')
            setRooms(Array.isArray(res.data) ? res.data : [])
        } catch (e: any) {
            const status = e?.response?.status
            if ([401, 403, 419, 440].includes(status)) {
                logout?.('세션이 만료되었거나 다른 기기에서 로그인되어 로그아웃됩니다.')
                return
            }
            setError(e?.response?.data?.message || '채팅 목록을 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }

    /** 친구 목록 로드: /friends (알림/미리보기 조회에 사용) */
    const loadFriends = async () => {
        try {
            const res = await http.get<string[]>('/friends')
            setFriends(Array.isArray(res.data) ? res.data : [])
            setTick(t => t + 1) // 훅 내부 캐시 변화를 즉시 반영하도록 렌더 트리거
        } catch (e) {
            // 친구 목록 실패는 치명적이지 않으니 조용히 무시(원하면 에러 표시 가능)
        }
    }

    useEffect(() => {
        loadRooms()
        loadFriends()
    }, [])

    /** WS 구독:
     *  - 방 관련 이벤트 → /rooms 새로고침
     *  - 메시지 관련 이벤트 → /friends 새로고침 (알림/미리보기 갱신)
     *  - 연결 재수립 → 둘 다 한 번 동기화
     */
    useEffect(() => {
        if (!userId) return
        const unsubs: Array<() => void> = []

        // 방 변경/생성/멤버 변경 등
        unsubs.push(ws.subscribe(`/topic/rooms/${userId}`, () => loadRooms()))
        unsubs.push(ws.subscribe(`/user/queue/rooms`, () => loadRooms()))

        // 메시지 수신: 알림/미리보기는 friends 기반 → friends 만 새로고침
        unsubs.push(ws.subscribe(`/topic/messages/${userId}`, () => loadFriends()))
        unsubs.push(ws.subscribe(`/user/queue/messages`, () => loadFriends()))

        const onConnect = () => {
            loadRooms()
            loadFriends()
        }
        ws.onConnect(onConnect)
        ws.ensureConnected()

        return () => {
            unsubs.forEach(u => { try { u() } catch {} })
            try { ws.offConnect(onConnect) } catch {}
        }
    }, [userId])

    /** 정렬:
     *  - DM은 친구 키가 friends 배열에 존재할 때만 getPreviewTime(friend) 사용
     *  - 그 외(그룹/친구 아님)는 updatedAt fallback
     *  - tick 의존성으로 훅 캐시 변경도 즉시 재계산
     */
    const sortedRooms = useMemo(() => {
        return [...rooms].sort((a, b) => {
            const aFriend = friendKeyForDM(a, me)
            const bFriend = friendKeyForDM(b, me)
            const aIsFriend = !!aFriend && friends.includes(aFriend)
            const bIsFriend = !!bFriend && friends.includes(bFriend)

            const ta = aIsFriend
                ? (getPreviewTime?.(aFriend) || 0)
                : toMillis(a.updatedAt)
            const tb = bIsFriend
                ? (getPreviewTime?.(bFriend) || 0)
                : toMillis(b.updatedAt)

            return (tb || 0) - (ta || 0)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rooms, friends, getPreviewTime, me, tick])

    const openRoom = (roomId: string) => {
        nav(`/chat/${encodeURIComponent(roomId)}`)
    }

    return (
        <div className="friends">
            <h2>채팅</h2>
            {error && <p className="error">{error}</p>}
            {loading && <p className="muted">불러오는 중…</p>}

            <ul className="friends__list">
                {sortedRooms.map((r) => {
                    const title = peerLabel(r, me)
                    const fk = friendKeyForDM(r, me)
                    const isFriend = !!fk && friends.includes(fk)

                    // ✅ 알림/미리보기는 friends 기반 훅으로 처리(친구가 아닐 땐 0/공란)
                    const cnt = isFriend ? (getUnread?.(fk) || 0) : 0
                    const preview = isFriend ? (getPreview?.(fk) || '') : ''

                    return (
                        <li key={r.id} className="friends__item">
                            <div className="friends__left">
                                <div className="friends__nameRow">
                                    <span className="friends__name">{title}</span>
                                    {cnt > 0 && <span className="badge badge--unread">{cnt}</span>}
                                </div>
                                {preview && (
                                    <div className="friends__preview" title={preview}>
                                        {preview}
                                    </div>
                                )}
                            </div>
                            <button className="btn" onClick={() => openRoom(r.id)}>열기</button>
                        </li>
                    )
                })}
                {!sortedRooms.length && !loading && (
                    <li className="friends__empty">채팅방이 없습니다.</li>
                )}
            </ul>
        </div>
    )
}
