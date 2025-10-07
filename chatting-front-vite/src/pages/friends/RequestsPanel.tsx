import React, { useEffect, useState } from 'react'
import http from '@/api/http'
import { useAuth } from '@/context/AuthContext'
import { ws } from '@/lib/ws'

type Req = {
    id: string | number
    status?: string
    sender?: string
    from?: string
    fromUser?: string
    requester?: string
    senderUsername?: string
    receiver?: string
    to?: string
    toUser?: string
    receiverUsername?: string
    targetUsername?: string
}

export default function RequestsPanel(): JSX.Element {
    const [incoming, setIncoming] = useState<Req[]>([])
    const [outgoing, setOutgoing] = useState<Req[]>([])
    const [err, setErr] = useState('')
    const [busyId, setBusyId] = useState<string | number | null>(null)
    const { userUuid } = useAuth() as any

    const load = async () => {
        try {
            const [inc, out] = await Promise.all([
                http.get<Req[]>('/friends/requests/incoming').catch(() => ({ data: [] as Req[] })),
                http.get<Req[]>('/friends/requests/outgoing').catch(() => ({ data: [] as Req[] })),
            ])
            setIncoming(inc.data ?? [])
            setOutgoing(out.data ?? [])
            setErr('')
        } catch (e: any) {
            setErr(e?.response?.data?.message || '요청 목록을 불러오지 못했습니다.')
        }
    }

    // 최초 로드 + 다른 패널로의 힌트 브로드캐스트 유지
    useEffect(() => {
        load()
        try { window.dispatchEvent(new CustomEvent('friends:maybe-changed')) } catch {}
    }, [])

    // 실시간 구독(다중 경로) + 재연결 복구 + 포커스/가시성/온라인 복귀 + (옵션) 가벼운 폴링
    useEffect(() => {
        if (!userUuid) return
        const uid = String(userUuid)
        let unsubs: Array<() => void> = []
        let pollId: number | null = null

        const onEvent = () => load()

        const subscribeAll = () => {
            const dests = [
                `/topic/friend-requests/${uid}`,
                `/topic/friends/${uid}`
            ]
            dests.forEach((d) => {
                try { unsubs.push(ws.subscribe(d, onEvent)) } catch {}
            })
        }

        const onConnect = () => { subscribeAll(); load() }

        ws.onConnect(onConnect)
        ws.ensureConnected()
        subscribeAll()

        const onVisible = () => { if (document.visibilityState === 'visible') load() }
        const onFocus = () => load()
        const onOnline = () => load()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onFocus)
        window.addEventListener('online', onOnline)

        // (옵션) 이벤트 누락 보정: 보이는 동안 5초마다 동기화
        pollId = window.setInterval(() => {
            if (document.visibilityState === 'visible') load()
        }, 5000) as unknown as number

        return () => {
            unsubs.forEach((u) => { try { u() } catch {} })
            unsubs = []
            try { ws.offConnect(onConnect) } catch {}
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('online', onOnline)
            if (pollId) clearInterval(pollId)
        }
    }, [userUuid])

    const getSender = (r: Req) =>
        r.sender || r.from || r.fromUser || r.requester || r.senderUsername || ''
    const getReceiver = (r: Req) =>
        r.receiver || r.to || r.toUser || r.receiverUsername || r.targetUsername || ''

    const notifyFriendsMaybeChanged = () => {
        try {
            window.dispatchEvent(new CustomEvent('friends:maybe-changed'))
            load().then()
        } catch {}
    }

    const accept = async (id: Req['id']) => {
        setBusyId(id)
        try {
            await http.post(`/friends/requests/${id}/accept`)
            notifyFriendsMaybeChanged()
            await load()
        } finally {
            setBusyId(null)
        }
    }

    const decline = async (id: Req['id']) => {
        setBusyId(id)
        try {
            await http.post(`/friends/requests/${id}/decline`)
            notifyFriendsMaybeChanged()
            await load()
        } finally {
            setBusyId(null)
        }
    }

    const cancel = async (id: Req['id']) => {
        setBusyId(id)
        try {
            await http.delete(`/friends/requests/${id}`)
            notifyFriendsMaybeChanged()
            await load()
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div className="requests">
            <h3>친구 요청</h3>
            {err && <p className="error">{err}</p>}

            <div className="requests__cols">
                {/* 받은 요청 */}
                <section>
                    <h4>받은 요청</h4>
                    {incoming.length === 0 && <div className="muted">받은 요청이 없습니다.</div>}
                    {incoming.map((r) => (
                        <div key={`in-${r.id}`} className="req">
              <span>
                <strong>{getSender(r)}</strong> → {getReceiver(r)}
              </span>
                            <span className="muted">{r.status}</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => accept(r.id)} disabled={busyId === r.id}>수락</button>
                                <button onClick={() => decline(r.id)} disabled={busyId === r.id} style={{ background: '#e11d48' }}>
                                    거절
                                </button>
                            </div>
                        </div>
                    ))}
                </section>

                {/* 보낸 요청 */}
                <section>
                    <h4>보낸 요청</h4>
                    {outgoing.length === 0 && <div className="muted">보낸 요청이 없습니다.</div>}
                    {outgoing.map((r) => (
                        <div key={`out-${r.id}`} className="req">
              <span>
                <strong>{getSender(r)}</strong> → {getReceiver(r)}
              </span>
                            <span className="muted">{r.status}</span>
                            <div>
                                <button onClick={() => cancel(r.id)} disabled={busyId === r.id} style={{ background: '#475569' }}>
                                    취소
                                </button>
                            </div>
                        </div>
                    ))}
                </section>
            </div>
        </div>
    )
}
