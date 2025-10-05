import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'

/* ========== 유틸 ========== */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmail = (s?: string) => !!(s && EMAIL_RE.test(s || ''))

function toStr(x: unknown): string | undefined {
    if (x == null) return undefined
    const s = String(x).trim()
    return s || undefined
}

/** “이름(이메일)” 규칙 포맷 */
function formatNameEmail(name?: string, email?: string): string {
    const n = toStr(name)
    const e = toStr(email)
    if (n && e) return `${n} (${e})`
    if (n) return n
    if (e) return e
    return '알 수 없음'
}

/* ========== 타입 ========== */
type FriendBriefDto =
    | string
    | {
    id?: string
    name?: string
    email?: string
}

type FriendCard = {
    id: string            // 내부 식별자(없으면 email로 대체)
    name?: string
    email?: string
}

/* ========== 컴포넌트 ========== */
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

    /** 서버 응답(FriendBriefDto)을 FriendCard로 정규화 */
    const normalizeFriend = (raw: FriendBriefDto): FriendCard | null => {
        if (typeof raw === 'string') {
            const v = raw.trim()
            if (!v) return null
            if (isEmail(v)) return { id: v, email: v }
            return { id: v, name: v }
        }
        const id = toStr(raw?.id) || toStr(raw?.email) // id가 없으면 email을 id로 대체
        const name = toStr(raw?.name)
        const email = toStr(raw?.email)
        if (!id && !email && !name) return null
        return { id: id || email || (name as string), name, email }
    }

    /** friends 배열에 중복 없이 하나 추가 */
    const ensureUniquePush = (f: FriendCard) => {
        setFriends(prev => {
            if (prev.some(x => x.id === f.id)) return prev
            return [f, ...prev]
        })
    }

    /** /friends 로드 */
    const load = async () => {
        try {
            // ✅ 이제 백엔드는 [{id,name,email}] 형태를 반환 (레거시 string[]도 허용)
            const res = await http.get<FriendBriefDto[]>('/friends')
            const arr = Array.isArray(res.data) ? res.data : []
            const normalized = arr
                .map(normalizeFriend)
                .filter(Boolean) as FriendCard[]
            setFriends(normalized)
        } catch (e: any) {
            const status = e?.response?.status
            if ([401, 403, 419, 440].includes(status)) {
                logout?.('세션이 만료되었거나 다른 기기에서 로그인되어 로그아웃됩니다.')
                return
            }
            setError(e?.response?.data?.message || '목록을 불러오지 못했습니다.')
        }
    }

    const startShortConvergencePoll = () => {
        const delays = [0, 400, 1200]
        delays.forEach(ms => {
            const t = window.setTimeout(() => load(), ms)
            pollTimerRef.current = t as unknown as number
        })
    }

    /** 친구 요청 보내기 */
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
                        const list = Array.isArray(fr) ? fr : []
                        const exists = list.some((it: any) => {
                            if (typeof it === 'string') return it.toLowerCase() === identifier.toLowerCase()
                            const id = toStr(it?.id)
                            const email = toStr(it?.email)
                            return (
                                id?.toLowerCase() === identifier.toLowerCase() ||
                                email?.toLowerCase() === identifier.toLowerCase()
                            )
                        })
                        setError(exists ? '이미 친구예요.' : (msg || '이미 보냈거나 상대가 보낸 요청이 있어요.'))
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

    /** DM 열기: email 우선, 없으면 id 사용 */
    const openDm = async (friendIdOrEmail: string) => {
        const idf = friendIdOrEmail.trim()
        if (!idf) return
        setOpening(idf)
        try {
            const identifier = idf // 서버가 식별자 flexible 매칭(이메일/UUID/유저명 등)을 지원한다고 가정
            const res = await http.post<{ id: string }>('/rooms/dm/by-identifier', { identifier })
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

    /* 초기 로드 */
    useEffect(() => {
        load()
    }, [])

    /* 친구 관련 토픽 실시간 갱신 */
    useEffect(() => {
        if (!userUuid) return
        const uid = String(userUuid)
        let unsubs: Array<() => void> = []
        let pollId: number | null = null

        const onEvent = () => load()

        const subscribeAll = () => {
            const dests = [
                `/topic/friend-requests/${uid}`, // 토픽(식별자 일치 시)
                `/topic/friends/${uid}`,        // 토픽(식별자 일치 시)
            ]
            dests.forEach(d => {
                try { unsubs.push(ws.subscribe(d, onEvent)) } catch {}
            })
        }

        const onWsConnect = () => { subscribeAll(); load() }

        ws.onConnect(onWsConnect)
        ws.ensureConnected()
        subscribeAll()

        // 포커스/가시성/온라인 복귀 시 안전 재조회
        const onVisible = () => { if (document.visibilityState === 'visible') load() }
        const onFocus = () => load()
        const onOnline = () => load()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onFocus)
        window.addEventListener('online', onOnline)

        // (옵션) 누락 보정용 짧은 폴링
        pollId = window.setInterval(() => {
            if (document.visibilityState === 'visible') load()
        }, 5000) as unknown as number

        return () => {
            unsubs.forEach(u => { try { u() } catch {} })
            unsubs = []
            try { ws.offConnect(onWsConnect) } catch {}
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('online', onOnline)
            if (pollId) clearInterval(pollId)
        }
    }, [userUuid])

    /* 다른 패널에서의 상태 변화 브로드캐스트 수신 */
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent<{ type?: string; friend?: FriendBriefDto }>

            if (ce?.detail?.type === 'accepted' && ce.detail.friend) {
                const card = normalizeFriend(ce.detail.friend)
                if (card) ensureUniquePush(card)
            }
            startShortConvergencePoll()
        }
        window.addEventListener('friends:maybe-changed', handler as EventListener)
        return () => window.removeEventListener('friends:maybe-changed', handler as EventListener)
    }, [])

    /* 이름(이메일) 기준 정렬 */
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
                {sortedFriends.map((f) => {
                    // DM 열 때는 email을 최우선 식별자로 사용, 없으면 id로
                    const openKey = f.email || f.id
                    return (
                        <li key={f.id} className="friends__item">
                            <div className="friends__left">
                                <div className="friends__nameRow">
                                    <span className="friends__name">{formatNameEmail(f.name, f.email)}</span>
                                </div>
                            </div>
                            <button className="btn" onClick={() => openDm(openKey)} disabled={opening === openKey}>
                                {opening === openKey ? '열기...' : '대화'}
                            </button>
                        </li>
                    )
                })}
                {!friends.length && <li className="friends__empty">친구가 없습니다.</li>}
            </ul>
        </div>
    )
}
