import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/friends.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'
import NotificationsBell from './NotificationsBell'

export default function FriendsPage(): JSX.Element {
    const [friends, setFriends] = useState<string[]>([])
    const [usernameToAdd, setUsernameToAdd] = useState('')
    const [error, setError] = useState('')
    const [sending, setSending] = useState(false)
    const [opening, setOpening] = useState('')

    const nav = useNavigate()
    const { userId, logout } = useAuth() as any

    const {
        getUnread,
        getPreview,
        getPreviewTime,
        clearFriend,
        setActiveRoom,
    } = useNotifications() as any

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

    // 멀티 토픽 구독: 요청/수락/거절/취소 등 어떤 이벤트가 와도 목록 새로고침
    useEffect(() => {
        if (!userId) return;

        const unsubs: Array<() => void> = [];

        // 1) 필요한 토픽들 구독
        unsubs.push(ws.subscribe(`/topic/friend-requests/${userId}`, () => { load() }));
        unsubs.push(ws.subscribe(`/topic/friends/${userId}`, () => { load() }));
        unsubs.push(ws.subscribe(`/user/queue/friends`, () => { load() }));

        // 2) 연결(재연결) 시에도 목록 싱크
        const onWsConnect = () => {
            load();
        };
        ws.onConnect(onWsConnect);

        // 3) 초기 진입 시 연결 보장 + 첫 로드 (옵션)
        ws.ensureConnected();
        // load();  // 이미 다른 곳에서 해주고 있으면 생략 가능

        return () => {
            // 구독 해제
            for (const u of unsubs) {
                try { u(); } catch {}
            }
            // onConnect 콜백 해제 (반드시 동일한 함수 참조 전달)
            try { ws.offConnect(onWsConnect) } catch {}
        };
    }, [userId]);

    // ✅ RequestsPanel이 로컬 브로드캐스트로 알려주는 이벤트도 수신 (즉시 동기화)
    useEffect(() => {
        const handler = () => load()
        window.addEventListener('friends:maybe-changed', handler as EventListener)
        return () => window.removeEventListener('friends:maybe-changed', handler as EventListener)
    }, [])

    const sortedFriends = useMemo(() => {
        return [...friends].sort((a, b) => {
            const ta = getPreviewTime?.(a) || 0
            const tb = getPreviewTime?.(b) || 0
            return tb - ta
        })
    }, [friends, getPreviewTime])

    return (
        <div className="friends">
            <div className="friends__topbar">
                <div className="friends__me">
                    <span className="me__label">로그인:</span>
                    <strong className="me__name">{userId || '알 수 없음'}</strong>
                </div>

                <div className="friends__actions">
                    <NotificationsBell userId={userId} />
                    <button className="btn btn--logout" onClick={() => logout?.()}>로그아웃</button>
                </div>
            </div>

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
                {sortedFriends.map((f) => {
                    const cnt = getUnread?.(f) || 0
                    const preview = getPreview?.(f) || ''

                    return (
                        <li key={f} className="friends__item">
                            <div className="friends__left">
                                <div className="friends__nameRow">
                                    <span className="friends__name">{f}</span>
                                    {cnt > 0 && <span className="badge badge--unread">{cnt}</span>}
                                </div>

                                {preview && (
                                    <div className="friends__preview" title={preview}>
                                        {preview}
                                    </div>
                                )}
                            </div>

                            <button className="btn" onClick={() => openDm(f)} disabled={opening === f}>
                                {opening === f ? '열기...' : '대화'}
                            </button>
                        </li>
                    )
                })}
                {!friends.length && <li className="friends__empty">친구가 없습니다.</li>}
            </ul>
        </div>
    )
}
