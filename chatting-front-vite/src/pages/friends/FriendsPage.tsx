// src/pages/friends/FriendsPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'
import { FriendsAPI, FriendBriefDto } from '@/api/friends'
import { RoomsAPI } from '@/api/rooms'
import { toStr } from '@/lib/identity'
import { formatNameEmail, errMsg } from '@/lib/format'
import { useInvalidate } from '@/hooks/useInvalidate'

type FriendCard = { id: string; name?: string; email?: string }

export default function FriendsPage(): JSX.Element {
    const [friends, setFriends] = useState<FriendCard[]>([])
    const [identifier, setIdentifier] = useState('')
    const [sending, setSending] = useState(false)
    const [openingKey, setOpeningKey] = useState<string>('')
    const [error, setError] = useState<string>('')

    const nav = useNavigate()
    const { userUuid, logout } = useAuth() as any
    const { clearFriend, setActiveRoom } = useNotifications() as any

    const abortRef = useRef<AbortController | null>(null)

    const normalize = useCallback((raw: FriendBriefDto): FriendCard | null => {
        const id = toStr(raw?.id)
        const name = toStr(raw?.name)
        const email = toStr(raw?.email)
        const key = id || email
        if (!key && !name) return null
        return { id: key || String(name), name, email }
    }, [])

    const setList = useCallback((arr: FriendBriefDto[]) => {
        const converted = (arr || []).map(normalize).filter(Boolean) as FriendCard[]
        setFriends(converted)
    }, [normalize])

    const fetchOnce = useCallback(async () => {
        if (abortRef.current) abortRef.current.abort()
        const ctrl = new AbortController()
        abortRef.current = ctrl
        try {
            const res = await FriendsAPI.list({ signal: ctrl.signal })
            if (res.status === 200) setList(Array.isArray(res.data) ? res.data : [])
        } catch (e: any) {
            const canceled = e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || e?.message === 'canceled'
            if (!canceled) {
                const st = e?.response?.status
                if ([401, 403, 419, 440].includes(st)) {
                    logout?.('세션이 만료되었습니다. 다시 로그인해 주세요.')
                } else {
                    setError(errMsg(e, '친구 목록을 불러오지 못했습니다.'))
                }
            }
        }
    }, [logout, setList])

    const { invalidate } = useInvalidate(fetchOnce, 800)

    useEffect(() => { invalidate(); return () => abortRef.current?.abort() }, [invalidate])

    const onSend = useCallback(async () => {
        const idf = identifier.trim()
        if (!idf) { setError('이메일/휴대폰/이름 중 하나를 입력하세요.'); return }
        setError('')
        setSending(true)
        try {
            await FriendsAPI.sendRequest(idf)
            setIdentifier('')
            invalidate()
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
                                .map((v) => (v == null ? undefined : String(v).toLowerCase()))
                                .includes(idf.toLowerCase())
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
                        } else setError(errMsg(e, fallback))
                    }
                } catch { setError(errMsg(e, fallback)) }
            } else if (st === 404) setError('해당 사용자를 찾을 수 없습니다.')
            else if (st === 400) setError(errMsg(e, '요청 형식이 올바르지 않습니다.'))
            else if (st === 401 || st === 403) {
                setError('세션이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.')
                window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'session' } }))
            } else setError(errMsg(e, fallback))
        } finally { setSending(false) }
    }, [identifier, invalidate])

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
        } finally { setOpeningKey('') }
    }, [clearFriend, setActiveRoom, nav])

    // WS & 가시성 이벤트 → invalidate 통일
    useEffect(() => {
        if (!userUuid) return
        const uid = String(userUuid)
        const unsubs: Array<() => void> = []

        const onEvent = () => invalidate()
        const subscribe = () => {
            ;['/topic/friend-requests/', '/topic/friends/'].forEach((prefix) => {
                try { unsubs.push(ws.subscribe(`${prefix}${uid}`, onEvent)) } catch {}
            })
        }
        const onConn = () => { subscribe(); invalidate() }
        ws.onConnect(onConn); ws.ensureConnected(); subscribe()

        const onVisible = () => { if (document.visibilityState === 'visible') invalidate() }
        const onFocus = () => invalidate()
        const onOnline = () => invalidate()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onFocus)
        window.addEventListener('online', onOnline)

        return () => {
            unsubs.forEach((u) => { try { u() } catch {} })
            try { ws.offConnect(onConn) } catch {}
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('online', onOnline)
        }
    }, [userUuid, invalidate])

    const sortedFriends = useMemo(
        () => [...friends].sort((a, b) =>
            formatNameEmail(a.name, a.email).toLowerCase()
                .localeCompare(formatNameEmail(b.name, b.email).toLowerCase())),
        [friends]
    )

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
                <button className="btn" onClick={onSend} disabled={sending || !identifier.trim()}>
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
