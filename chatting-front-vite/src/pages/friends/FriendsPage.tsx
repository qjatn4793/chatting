import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'

export default function FriendsPage(): JSX.Element {
    const [friends, setFriends] = useState<string[]>([])
    const [usernameToAdd, setUsernameToAdd] = useState('')
    const [error, setError] = useState('')
    const [sending, setSending] = useState(false)
    const [opening, setOpening] = useState('')

    const nav = useNavigate()
    const { userId, logout } = useAuth() as any

    // ✅ FriendsPage에서는 미리보기/미읽음 훅을 쓰지 않습니다.
    //    DM 오픈에 필요한 함수만 사용
    const { clearFriend, setActiveRoom } = useNotifications() as any

    const pollTimerRef = useRef<number | null>(null)

    const load = async () => {
        try {
            const res = await http.get<string[]>('/friends')
            setFriends(Array.isArray(res.data) ? res.data : [])
        } catch (e: any) {
            const status = e?.response?.status
            if ([401, 403, 419, 440].includes(status)) {
                logout?.('세션이 만료되었거나 다른 기기에서 로그인되어 로그아웃됩니다.')
                return
            }
            setError(e?.response?.data?.message || '목록을 불러오지 못했습니다.')
        }
    }

    const ensureUniquePush = (name: string) => {
        if (!name) return
        setFriends((prev) => (prev.includes(name) ? prev : [...prev, name]))
    }

    const startShortConvergencePoll = () => {
        const delays = [0, 400, 1200]
        delays.forEach((ms) => {
            const t = window.setTimeout(() => load(), ms)
            pollTimerRef.current = t as unknown as number
        })
    }

    const addFriend = async () => {
        const name = usernameToAdd.trim()
        if (!name) return
        setError('')
        setSending(true)
        try {
            await http.post(`/friends/requests/${encodeURIComponent(name)}`)
            setUsernameToAdd('')
            await load()
        } catch (e: any) {
            setError(e?.response?.data?.message || '친구 요청을 보내지 못했습니다.')
        } finally {
            setSending(false)
        }
    }

    const openDm = async (friendUsername: string) => {
        setOpening(friendUsername)
        try {
            const res = await http.post<{ id: string }>(
                `/rooms/dm/${encodeURIComponent(friendUsername)}`
            )
            const room = res.data
            if (!room?.id) throw new Error('room id missing')

            await http.post(`/rooms/${encodeURIComponent(room.id)}/read`)
            clearFriend?.(friendUsername)
            setActiveRoom?.(room.id)
            nav(`/chat/${encodeURIComponent(room.id)}`)
        } catch (e: any) {
            setError(e?.response?.data?.message || 'DM 방을 열지 못했습니다.')
        } finally {
            setOpening('')
        }
    }

    useEffect(() => { load() }, [])

    // 멀티 토픽 구독(친구 목록 변화와만 관련)
    useEffect(() => {
        if (!userId) return
        const unsubs: Array<() => void> = []
        unsubs.push(ws.subscribe(`/topic/friend-requests/${userId}`, () => load()))
        unsubs.push(ws.subscribe(`/topic/friends/${userId}`, () => load()))
        unsubs.push(ws.subscribe(`/user/queue/friends`, () => load()))
        const onWsConnect = () => load()
        ws.onConnect(onWsConnect)
        ws.ensureConnected()
        return () => {
            unsubs.forEach(u => { try { u() } catch {} })
            try { ws.offConnect(onWsConnect) } catch {}
            if (pollTimerRef.current) {
                try { clearTimeout(pollTimerRef.current as unknown as number) } catch {}
            }
        }
    }, [userId])

    // RequestsPanel → 로컬 브로드캐스트 수신(친구 추가/수락 등)
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent<{ type?: string; friend?: string }>
            if (ce?.detail?.type === 'accepted' && ce.detail.friend) {
                ensureUniquePush(ce.detail.friend)
            }
            startShortConvergencePoll()
        }
        window.addEventListener('friends:maybe-changed', handler as EventListener)
        return () => window.removeEventListener('friends:maybe-changed', handler as EventListener)
    }, [])

    // ✅ 메시지 미리보기/시간 기반 정렬 제거 → 알파벳(한글은 기본 locale) 정렬
    const sortedFriends = useMemo(() => {
        return [...friends].sort((a, b) => a.localeCompare(b))
    }, [friends])

    return (
        <div className="friends">
            <h2>친구</h2>
            {error && <p className="error">{error}</p>}

            <div className="friends__add">
                <input
                    value={usernameToAdd}
                    onChange={(e) => setUsernameToAdd(e.target.value)}
                    placeholder="사용자 아이디"
                />
                <button onClick={addFriend} disabled={sending}>
                    {sending ? '요청 중…' : '친구 요청 보내기'}
                </button>
            </div>

            <ul className="friends__list">
                {sortedFriends.map((f) => (
                    <li key={f} className="friends__item">
                        <div className="friends__left">
                            <div className="friends__nameRow">
                                {/* ✅ 미읽음 배지/미리보기 표시 안 함 */}
                                <span className="friends__name">{f}</span>
                            </div>
                        </div>
                        <button className="btn" onClick={() => openDm(f)} disabled={opening === f}>
                            {opening === f ? '열기...' : '대화'}
                        </button>
                    </li>
                ))}
                {!friends.length && <li className="friends__empty">친구가 없습니다.</li>}
            </ul>
        </div>
    )
}
