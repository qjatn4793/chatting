// src/pages/friends/FriendsPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'

/* ────────────────────────────────────────────────────────────
 * 1) 타입 정의 (백엔드 DTO와 일치)
 * ──────────────────────────────────────────────────────────── */
export type FriendBriefDto = {
    id?: string | null        // UUID 문자열(선택)
    name?: string | null      // 화면 표기용 이름
    email?: string | null     // 식별용 이메일
}

type FriendCard = {
    id: string                // 내부 식별자(없으면 email로 대체)
    name?: string
    email?: string
}

/* ────────────────────────────────────────────────────────────
 * 2) 순수 유틸
 * ──────────────────────────────────────────────────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const toStr = (x: unknown): string | undefined => {
    if (x == null) return undefined
    const s = String(x).trim()
    return s || undefined
}
const isEmail = (s?: string) => !!(s && EMAIL_RE.test(s))
const formatNameEmail = (name?: string, email?: string): string => {
    const n = toStr(name)
    const e = toStr(email)
    if (n && e) return `${n} (${e})`
    if (n) return n
    if (e) return e
    return '알 수 없음'
}
const errMsg = (e: any, fallback: string) =>
    e?.response?.data?.message || e?.message || fallback

/* ────────────────────────────────────────────────────────────
 * 3) API 래퍼 (/api 프리픽스 없음)
 *   - in-flight 취소를 위해 AbortSignal 지원
 *   - (옵션) ETag 캐싱으로 304 수용
 * ──────────────────────────────────────────────────────────── */
const etagCache: { friends?: string } = {}

const FriendsAPI = {
    list: (opts?: { signal?: AbortSignal }) =>
        http.get<FriendBriefDto[]>('/friends', {
            signal: opts?.signal,
            // 서버가 ETag를 지원한다면 304로 네트워크 절감
            headers: etagCache.friends ? { 'If-None-Match': etagCache.friends } : undefined,
            validateStatus: (s) => s === 200 || s === 304,
        }).then((res) => {
            const etag = res.headers?.etag || res.headers?.ETag
            if (etag) etagCache.friends = etag
            return res
        }),
    sendRequest: (identifier: string) => http.post('/friends/requests', { identifier }),
    incoming: () => http.get('/friends/requests/incoming'),
    outgoing: () => http.get('/friends/requests/outgoing'),
}

const RoomsAPI = {
    openDmByIdentifier: (identifier: string) =>
        http.post<{ id: string }>('/rooms/dm/by-identifier', { identifier }),
    markRead: (roomId: string) =>
        http.post(`/rooms/${encodeURIComponent(roomId)}/read`),
}

/* ────────────────────────────────────────────────────────────
 * 4) FriendsPage
 * ──────────────────────────────────────────────────────────── */
export default function FriendsPage(): JSX.Element {
    // 상태
    const [friends, setFriends] = useState<FriendCard[]>([])
    const [identifier, setIdentifier] = useState('')
    const [sending, setSending] = useState(false)
    const [openingKey, setOpeningKey] = useState<string>('') // DM 열기 진행 표시
    const [error, setError] = useState<string>('')

    const nav = useNavigate()
    const { userUuid, logout } = useAuth() as any
    const { clearFriend, setActiveRoom } = useNotifications() as any

    /* ──────────────────────────────────────────────────────────
     * 호출 줄이기 핵심: 진행중 중복 방지 + 이벤트 합치기
     * ────────────────────────────────────────────────────────── */
    const REFRESH_MIN_GAP = 800 // ms: 여러 신호가 와도 0.8초에 1회만 실제 호출
    const nextTickRef = useRef<number | null>(null)
    const lastRunRef = useRef(0)
    const loadingRef = useRef(false)
    const abortRef = useRef<AbortController | null>(null)

    // 정규화
    const normalize = useCallback((raw: FriendBriefDto): FriendCard | null => {
        const id = toStr(raw?.id)
        const name = toStr(raw?.name)
        const email = toStr(raw?.email)
        const key = id || email
        if (!key && !name) return null
        return { id: key || String(name), name, email }
    }, [])

    const setList = useCallback((arr: FriendBriefDto[]) => {
        const converted = (arr || [])
            .map(normalize)
            .filter(Boolean) as FriendCard[]
        setFriends(converted)
    }, [normalize])

    const ensurePrependUnique = useCallback((card: FriendCard) => {
        setFriends(prev => (prev.some(x => x.id === card.id) ? prev : [card, ...prev]))
    }, [])

    /** 실제 GET /friends 1회 수행 (중복요청/취소 처리) */
    const doFetchOnce = useCallback(async () => {
        if (loadingRef.current) return // 이미 진행 중이면 스킵
        loadingRef.current = true

        // 이전 요청 취소
        if (abortRef.current) abortRef.current.abort()
        const ctrl = new AbortController()
        abortRef.current = ctrl

        try {
            const res = await FriendsAPI.list({ signal: ctrl.signal })
            if (res.status === 304) {
                // 변경 없음 → 아무 것도 하지 않음
            } else {
                setList(Array.isArray(res.data) ? res.data : [])
            }
            lastRunRef.current = Date.now()
        } catch (e: any) {
            // axios 취소는 name/message 다양 → 최대한 조용히 스킵
            const canceled = e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || e?.message === 'canceled'
            if (!canceled) {
                const st = e?.response?.status
                if ([401, 403, 419, 440].includes(st)) {
                    logout?.('세션이 만료되었거나 다른 기기에서 로그인되어 로그아웃됩니다.')
                } else {
                    setError(errMsg(e, '친구 목록을 불러오지 못했습니다.'))
                }
            }
        } finally {
            loadingRef.current = false
        }
    }, [logout, setList])

    /** 여러 이벤트를 1회 호출로 합치는 invalidate */
    const invalidate = useCallback(() => {
        const now = Date.now()
        const gap = now - lastRunRef.current
        const delay = gap >= REFRESH_MIN_GAP ? 0 : (REFRESH_MIN_GAP - gap)

        if (nextTickRef.current) window.clearTimeout(nextTickRef.current)
        nextTickRef.current = window.setTimeout(() => {
            doFetchOnce()
            nextTickRef.current = null
        }, delay) as unknown as number
    }, [doFetchOnce])

    /* 초기 1회 */
    useEffect(() => { invalidate() }, [invalidate])

    /* 친구 요청 보내기 */
    const onSend = useCallback(async () => {
        const idf = identifier.trim()
        if (!idf) {
            setError('이메일/휴대폰/이름 중 하나를 입력하세요.')
            return
        }
        setError('')
        setSending(true)
        try {
            await FriendsAPI.sendRequest(idf)
            setIdentifier('')
            // 즉시 1회 갱신
            invalidate()
            // (옵션) WS 신뢰 낮은 환경이면 1.2초 후 한 번 더
            window.setTimeout(() => invalidate(), 1200)
        } catch (e: any) {
            const st = e?.response?.status
            const fallback = '친구 요청을 보내지 못했습니다.'
            if (st === 409) {
                try {
                    const { data: incoming } = await FriendsAPI.incoming()
                    const hasFromTarget =
                        Array.isArray(incoming) &&
                        incoming.some((r: any) =>
                            [r.requester, r.requesterEmail, r.requesterId]
                                .map(v => (v == null ? undefined : String(v).toLowerCase()))
                                .includes(idf.toLowerCase()),
                        )
                    if (hasFromTarget) {
                        setError('상대가 이미 보낸 요청이 있어요. “받은 요청”에서 수락하세요.')
                    } else {
                        const listRes = await FriendsAPI.list()
                        if (listRes.status !== 304) {
                            const exists = (Array.isArray(listRes.data) ? listRes.data : []).some((it: any) => {
                                const id = toStr(it?.id)?.toLowerCase()
                                const em = toStr(it?.email)?.toLowerCase()
                                return id === idf.toLowerCase() || em === idf.toLowerCase()
                            })
                            setError(exists ? '이미 친구예요.' : errMsg(e, fallback))
                        } else {
                            setError(errMsg(e, fallback))
                        }
                    }
                } catch {
                    setError(errMsg(e, fallback))
                }
            } else if (st === 404) {
                setError('해당 사용자를 찾을 수 없습니다.')
            } else if (st === 400) {
                setError(errMsg(e, '요청 형식이 올바르지 않습니다.'))
            } else if (st === 401 || st === 403) {
                setError('세션이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.')
                window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'session' } }))
            } else {
                setError(errMsg(e, fallback))
            }
        } finally {
            setSending(false)
        }
    }, [identifier, invalidate])

    /* DM 열기 (email 우선, 없으면 id) */
    const openDm = useCallback(async (friend: FriendCard) => {
        const key = friend.email || friend.id
        if (!key) return
        setOpeningKey(key)
        try {
            const { data: room } = await RoomsAPI.openDmByIdentifier(key)
            if (!room?.id) throw new Error('room id missing')
            await RoomsAPI.markRead(room.id)
            clearFriend?.(key)
            setActiveRoom?.(room.id)
            nav(`/chat/${encodeURIComponent(room.id)}`)
        } catch (e: any) {
            setError(errMsg(e, 'DM 방을 열지 못했습니다.'))
        } finally {
            setOpeningKey('')
        }
    }, [clearFriend, setActiveRoom, nav])

    /* Cross-panel 브로드캐스트: 수락 등 */
    useEffect(() => {
        const onCross = (e: Event) => {
            const ce = e as CustomEvent<{ type?: string; friend?: FriendBriefDto }>
            if (ce?.detail?.type === 'accepted' && ce.detail.friend) {
                const card = normalize(ce.detail.friend)
                if (card) ensurePrependUnique(card)
            }
            invalidate()
        }
        window.addEventListener('friends:maybe-changed', onCross as EventListener)
        return () => window.removeEventListener('friends:maybe-changed', onCross as EventListener)
    }, [ensurePrependUnique, normalize, invalidate])

    /* WS + 가시성/포커스/온라인: 모두 invalidate로 통일 */
    useEffect(() => {
        if (!userUuid) return
        const uid = String(userUuid)
        const unsubs: Array<() => void> = []

        const onEvent = () => invalidate()

        const subscribe = () => {
            ;[
                `/topic/friend-requests/${uid}`,
                `/topic/friends/${uid}`,
            ].forEach(dest => {
                try {
                    const off = ws.subscribe(dest, onEvent)
                    unsubs.push(off)
                } catch { /* noop */ }
            })
        }

        const onConn = () => {
            subscribe()
            invalidate()
        }

        ws.onConnect(onConn)
        ws.ensureConnected()
        subscribe()

        const onVisible = () => { if (document.visibilityState === 'visible') invalidate() }
        const onFocus = () => invalidate()
        const onOnline = () => invalidate()

        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onFocus)
        window.addEventListener('online', onOnline)

        // (권장: 폴링 제거) 필요 시 아주 길게
        // const pollId = window.setInterval(() => {
        //   if (document.visibilityState === 'visible') invalidate()
        // }, 60000)

        return () => {
            unsubs.forEach(u => { try { u() } catch {} })
            try { ws.offConnect(onConn) } catch {}
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('online', onOnline)
            // window.clearInterval(pollId)
        }
    }, [userUuid, invalidate])

    /* 파생 값: 이름(이메일) 기준 정렬 */
    const sortedFriends = useMemo(() => {
        return [...friends].sort((a, b) => {
            const A = formatNameEmail(a.name, a.email).toLowerCase()
            const B = formatNameEmail(b.name, b.email).toLowerCase()
            return A.localeCompare(B)
        })
    }, [friends])

    /* 렌더링 */
    return (
        <div className="friends">
            <h2>친구</h2>

            {error && <p className="error">{error}</p>}

            <div className="friends__add">
                <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="친구 식별자 (이메일/휴대폰/이름)"
                    inputMode="text"
                    autoComplete="off"
                />
                <button
                    className="btn"
                    onClick={onSend}
                    disabled={sending || !identifier.trim()}
                    aria-disabled={sending || !identifier.trim()}
                >
                    {sending ? '요청 중…' : '친구 요청 보내기'}
                </button>
            </div>

            <ul className="friends__list">
                {sortedFriends.map((f) => {
                    const openKey = f.email || f.id
                    return (
                        <li key={f.id} className="friends__item">
                            <div className="friends__left">
                                <div className="friends__nameRow">
                                    <span className="friends__name">{formatNameEmail(f.name, f.email)}</span>
                                </div>
                            </div>
                            <button
                                className="btn"
                                onClick={() => openDm(f)}
                                disabled={openingKey === openKey}
                                aria-disabled={openingKey === openKey}
                            >
                                {openingKey === openKey ? '열기…' : '대화'}
                            </button>
                        </li>
                    )
                })}
                {!friends.length && <li className="friends__empty">친구가 없습니다.</li>}
            </ul>
        </div>
    )
}
