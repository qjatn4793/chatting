import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmail = (s?: string) => !!(s && EMAIL_RE.test(s || ''))

function toStr(x: unknown): string | undefined {
    if (x == null) return undefined
    const s = String(x).trim()
    return s || undefined
}

/** 이름(이메일) 규칙 포맷 */
function formatNameEmail(name?: string, email?: string): string {
    const n = toStr(name)
    const e = toStr(email)
    if (n && e) return `${n} (${e})`
    if (n) return n
    if (e) return e
    return '알 수 없음'
}

type FriendCard = {
    id: string             // 내부 키 (식별자)
    name?: string
    email?: string
}

export default function FriendsPage(): JSX.Element {
    const [friends, setFriends] = useState<FriendCard[]>([])
    const [identifierToAdd, setIdentifierToAdd] = useState('')
    const [error, setError] = useState('')
    const [sending, setSending] = useState(false)
    const [opening, setOpening] = useState('')

    const nav = useNavigate()
    const { userUuid, logout } = useAuth() as any

    const { clearFriend, setActiveRoom } = useNotifications() as any
    const pollTimerRef = useRef<number | null>(null)

    /** 식별자 문자열을 FriendCard로 변환(간이) */
    const enrichFriend = (idv: string): FriendCard => {
        const id = idv.trim()
        if (isEmail(id)) return { id, email: id }
        return { id, name: id } // 이메일이 아니면 이름으로 노출
    }

    const load = async () => {
        try {
            // GET /friends → string[] (식별자)
            const res = await http.get<string[]>('/friends')
            const arr = Array.isArray(res.data) ? res.data : []
            setFriends(arr.map(enrichFriend))
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
        setFriends((prev) => {
            if (prev.some((f) => f.id === v)) return prev
            return [enrichFriend(v), ...prev]
        })
    }

    const startShortConvergencePoll = () => {
        const delays = [0, 400, 1200]
        delays.forEach((ms) => {
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
                try {
                    const { data: incoming } = await http.get('/friends/requests/incoming')
                    const hasFromTarget =
                        Array.isArray(incoming) &&
                        incoming.some((r: any) =>
                            [r.requester, r.requesterEmail, r.requesterId].some(
                                (v) => String(v).toLowerCase() === identifier.toLowerCase()
                            )
                        )

                    if (hasFromTarget) {
                        setError('상대가 이미 보낸 요청이 있어요. “받은 요청”에서 수락하세요.')
                    } else {
                        const { data: fr } = await http.get('/friends')
                        const isAlreadyFriend =
                            Array.isArray(fr) &&
                            fr.some((f: any) => String(f).toLowerCase() === identifier.toLowerCase())

                        setError(
                            isAlreadyFriend
                                ? '이미 친구예요.'
                                : msg || '이미 보냈거나 상대가 보낸 요청이 있어요.'
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
            const res = await http.post<{ id: string }>('/rooms/dm/by-identifier', { identifier: idf })
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

    useEffect(() => {
        load()
    }, [])

    useEffect(() => {
        if (!userUuid) return
        const unsubs: Array<() => void> = []

        unsubs.push(ws.subscribe(`/topic/friend-requests/${userUuid}`, () => load()))
        unsubs.push(ws.subscribe(`/topic/friends/${userUuid}`, () => load()))
        unsubs.push(ws.subscribe(`/user/queue/friends`, () => load()))
        const onWsConnect = () => load()
        ws.onConnect(onWsConnect)
        ws.ensureConnected()
        return () => {
            unsubs.forEach((u) => {
                try {
                    u()
                } catch {}
            })
            try {
                ws.offConnect(onWsConnect)
            } catch {}
            if (pollTimerRef.current) {
                try {
                    clearTimeout(pollTimerRef.current as unknown as number)
                } catch {}
            }
        }
    }, [userUuid])

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

    const sortedFriends = useMemo(() => {
        return [...friends].sort((a, b) => {
            const A = formatNameEmail(a.name, a.email).toLowerCase()
            const B = formatNameEmail(b.name, b.email).toLowerCase()
            return A.localeCompare(B)
        })
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
                {sortedFriends.map((f) => (
                    <li key={f.id} className="friends__item">
                        <div className="friends__left">
                            <div className="friends__nameRow">
                                <span className="friends__name">{formatNameEmail(f.name, f.email)}</span>
                            </div>
                        </div>
                        <button className="btn" onClick={() => openDm(f.id)} disabled={opening === f.id}>
                            {opening === f.id ? '열기...' : '대화'}
                        </button>
                    </li>
                ))}
                {!friends.length && <li className="friends__empty">친구가 없습니다.</li>}
            </ul>
        </div>
    )
}
