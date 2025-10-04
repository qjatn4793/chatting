// src/pages/friends/FriendsPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'

export default function FriendsPage(): JSX.Element {
    // 서버가 주는 친구 식별자 목록(이메일/UUID/전화/유저명 등 무엇이든 가능)
    const [friends, setFriends] = useState<string[]>([])
    // 추가할 대상 식별자(이메일/휴대폰/이름 아무거나)
    const [identifierToAdd, setIdentifierToAdd] = useState('')
    const [error, setError] = useState('')
    const [sending, setSending] = useState(false)
    const [opening, setOpening] = useState('')

    const nav = useNavigate()
    const { userUuid, logout } = useAuth() as any

    // DM 오픈에 필요한 것만 사용
    const { clearFriend, setActiveRoom } = useNotifications() as any
    const pollTimerRef = useRef<number | null>(null)

    const load = async () => {
        try {
            // 백엔드: GET /api/friends → string[] (이메일/UUID 등 어떤 식별자든 가능)
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

    const ensureUniquePush = (id: string) => {
        const v = (id ?? '').trim()
        if (!v) return
        setFriends(prev => (prev.includes(v) ? prev : [...prev, v]))
    }

    const startShortConvergencePoll = () => {
        const delays = [0, 400, 1200]
        delays.forEach(ms => {
            const t = window.setTimeout(() => load(), ms)
            pollTimerRef.current = t as unknown as number
        })
    }

    const addFriend = async () => {
        const identifier = identifierToAdd.trim()
        if (!identifier) {
            setError('이메일/휴대폰/이름 중 하나를 입력하세요.')
            return
        }
        setError('')
        setSending(true)
        try {
            await http.post('/friends/requests', { identifier })
            setIdentifierToAdd('')
            await load()
        } catch (e: any) {
            const status = e?.response?.status
            const msg = e?.response?.data?.message

            if (status === 409) {
                // 이미 친구이거나 요청이 존재
                // 1) 들어온(상대가 보낸) 요청이 있는지 확인 → 있으면 수락 유도
                try {
                    const { data: incoming } = await http.get('/friends/requests/incoming')
                    // incoming: FriendRequestDto[] (requester, receiver가 email 기준이라면 identifier가 email일 때 매칭)
                    const hasFromTarget =
                        Array.isArray(incoming) &&
                        incoming.some((r: any) =>
                            [r.requester, r.requesterEmail, r.requesterId].some((v) => String(v).toLowerCase() === identifier.toLowerCase())
                        )

                    if (hasFromTarget) {
                        setError('상대가 이미 보낸 요청이 있어요. “받은 요청”에서 수락하세요.')
                    } else {
                        // 2) 이미 친구일 가능성
                        const { data: friends } = await http.get('/friends')
                        const isAlreadyFriend =
                            Array.isArray(friends) &&
                            friends.some((f: any) => String(f).toLowerCase() === identifier.toLowerCase())

                        setError(
                            isAlreadyFriend
                                ? '이미 친구예요.'
                                : (msg || '이미 보냈거나 상대가 보낸 요청이 있어요.')
                        )
                    }
                } catch {
                    setError(msg || '이미 보냈거나 상대가 보낸 요청이 있어요.')
                }
            } else if (status === 404) {
                setError('해당 사용자를 찾을 수 없습니다.')
            } else if (status === 400) {
                setError(msg || '요청 형식이 올바르지 않습니다.')
            } else if (status === 401 || status === 403) {
                setError('세션이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.')
                // 필요 시 자동 로그아웃 유도
                window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'session' } }))
            } else {
                setError(msg || '친구 요청을 보내지 못했습니다.')
            }
        } finally {
            setSending(false)
        }
    }

    const openDm = async (friendIdentifier: string) => {
        const idf = friendIdentifier.trim()
        if (!idf) return
        setOpening(idf)
        try {
            // ✅ 식별자 기반 엔드포인트
            const res = await http.post<{ id: string }>(
                '/rooms/dm/by-identifier',
                { identifier: idf }
            )
            const room = res.data
            if (!room?.id) throw new Error('room id missing')

            await http.post(`/rooms/${encodeURIComponent(room.id)}/read`)
            clearFriend?.(idf)
            setActiveRoom?.(room.id)
            nav(`/chat/${encodeURIComponent(room.id)}`)
        } catch (e: any) {
            setError(e?.response?.data?.message || 'DM 방을 열지 못했습니다.')
        } finally {
            setOpening('')
        }
    }

    useEffect(() => { load() }, [])

    // 멀티 토픽 구독(친구 목록 변화에만 사용)
    useEffect(() => {
        if (!userUuid) return
        const unsubs: Array<() => void> = []

        // ⚠️ 백엔드가 개인 토픽을 UUID 기준으로 운영한다는 전제
        unsubs.push(ws.subscribe(`/topic/friend-requests/${userUuid}`, () => load()))
        unsubs.push(ws.subscribe(`/topic/friends/${userUuid}`, () => load()))
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
    }, [userUuid])

    // RequestsPanel → 로컬 브로드캐스트 수신(친구 추가/수락 등)
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent<{ type?: string; friend?: string }>
            if (ce?.detail?.type === 'accepted' && ce.detail.friend) {
                ensureUniquePush(ce.detail.friend) // friend 값은 서버가 돌려준 식별자 그대로
            }
            startShortConvergencePoll()
        }
        window.addEventListener('friends:maybe-changed', handler as EventListener)
        return () => window.removeEventListener('friends:maybe-changed', handler as EventListener)
    }, [])

    // 문자열 알파벳 정렬(이메일/UUID 구분 없이)
    const sortedFriends = useMemo(() => {
        return [...friends].sort((a, b) => a.localeCompare(b))
    }, [friends])

    return (
        <div className="friends">
            <h2>친구</h2>
            {error && <p className="error">{error}</p>}

            <div className="friends__add">
                <input
                    value={identifierToAdd}
                    onChange={(e) => setIdentifierToAdd(e.target.value)}
                    placeholder="친구 식별자 (이메일/휴대폰/이름)"
                    inputMode="text"
                    autoComplete="off"
                />
                <button onClick={addFriend} disabled={sending || !identifierToAdd.trim()}>
                    {sending ? '요청 중…' : '친구 요청 보내기'}
                </button>
            </div>

            <ul className="friends__list">
                {sortedFriends.map((idv) => (
                    <li key={idv} className="friends__item">
                        <div className="friends__left">
                            <div className="friends__nameRow">
                                <span className="friends__name">{idv}</span>
                            </div>
                        </div>
                        <button className="btn" onClick={() => openDm(idv)} disabled={opening === idv}>
                            {opening === idv ? '열기...' : '대화'}
                        </button>
                    </li>
                ))}
                {!friends.length && <li className="friends__empty">친구가 없습니다.</li>}
            </ul>
        </div>
    )
}
