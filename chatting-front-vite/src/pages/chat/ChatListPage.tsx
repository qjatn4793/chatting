import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import { ws } from '@/ws'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import '@/styles/friends.css'

type ParticipantLike =
    | string
    | {
    id?: string | number
    userId?: string | number
    uuid?: string
    uid?: string | number
    userUUID?: string
    email?: string
    username?: string
    name?: string
    displayName?: string
    nick?: string
    nickname?: string
}

type Room = {
    id: string
    name?: string
    title?: string
    type?: string
    participants?: ParticipantLike[]
    members?: ParticipantLike[]
    lastMessageAt?: string | number
}

/* ==== 타이틀 유틸 ==== */
function keyOf(p: ParticipantLike): string | undefined {
    if (typeof p === 'string') return p.trim() || undefined
    const cand = p.id ?? p.userId ?? p.uuid ?? p.uid ?? p.userUUID
    if (cand === null || cand === undefined) return undefined
    const s = String(cand).trim()
    return s || undefined
}

function nameOfParticipant(p: ParticipantLike): string {
    if (typeof p === 'string') return p
    const pick =
        p.displayName ||
        p.nick ||
        p.nickname ||
        p.username ||
        p.name ||
        p.email
    if (pick && String(pick).trim()) return String(pick).trim()
    const k = keyOf(p) || 'unknown'
    return `사용자 ${k.slice(-6)}`
}

function otherOfDM(room: Room, meKey: string | undefined): ParticipantLike | undefined {
    const list =
        (room.participants && room.participants.length
            ? room.participants
            : room.members) || []
    if (list.length === 0) return undefined
    if (!meKey) return list[0]
    const meKeyNorm = meKey.trim()
    const other = list.find((p) => keyOf(p) !== meKeyNorm)
    return other || list[0]
}

function titleOf(room: Room, meKey?: string): string {
    const list =
        (room.participants && room.participants.length
            ? room.participants
            : room.members) || []
    const isDM =
        (room.type && room.type.toUpperCase() === 'DM') || list.length === 2

    if (isDM) {
        const other = otherOfDM(room, meKey)
        if (other) return nameOfParticipant(other)
    }

    const serverTitle = room.title || room.name
    if (serverTitle && serverTitle.trim()) return serverTitle.trim()

    if (list.length > 0) {
        const names = list.map(nameOfParticipant)
        const preview = names.slice(0, 3).join(', ')
        return names.length > 3 ? `${preview} 외 ${names.length - 3}명` : preview
    }
    return '대화방'
}

/* ==== 컴포넌트 ==== */
export default function ChatListPage(): JSX.Element {
    const navigate = useNavigate()
    const { userId, user } = useAuth() as any
    const { getUnreadByRoom } = useNotifications()

    const [rooms, setRooms] = useState<Room[]>([])

    const meKey: string | undefined = useMemo(() => {
        const cand =
            userId ??
            user?.id ??
            user?.userId ??
            user?.uuid ??
            user?.uid ??
            user?.userUUID ??
            user?.email
        if (cand === null || cand === undefined) return undefined
        const s = String(cand).trim()
        return s || undefined
    }, [userId, user])

    useEffect(() => {
        ;(async () => {
            const res = await http.get<Room[]>('/rooms')
            setRooms(Array.isArray(res.data) ? res.data : [])
        })()
        // 필요 시 방 목록 실시간 갱신
        // ws.subscribe('/topic/rooms', ...)
    }, [])

    const sortedRooms = useMemo(() => {
        return [...rooms].sort((a, b) => {
            const at = Number(a.lastMessageAt ?? 0)
            const bt = Number(b.lastMessageAt ?? 0)
            return bt - at
        })
    }, [rooms])

    return (
        <div className="friends">
            <h2>채팅</h2>
            <ul className="friends__list">
                {sortedRooms.map((r) => {
                    const title = titleOf(r, meKey)
                    const unread = getUnreadByRoom(r.id)

                    return (
                        <li
                            key={r.id}
                            className="friends__item"
                            onClick={() => navigate(`/chat/${r.id}`)}
                        >
                            <div className="friends__title">{title}</div>
                            {unread > 0 && <span className="friends__badge">{unread}</span>}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
