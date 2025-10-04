import React, { useEffect, useState } from 'react'
import http from '@/api/http'
import { useAuth } from '@/context/AuthContext'
import { ws } from '@/ws'

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
        } catch (e: any) {
            setErr(e?.response?.data?.message || '요청 목록을 불러오지 못했습니다.')
        }
    }

    useEffect(() => { load() }, [])

    // 실시간 구독(요청 생성/거절/취소/수락 등)
    useEffect(() => {
        if (!userUuid) return
        const unsub = ws.subscribe(`/topic/friend-requests/${userUuid}`, () => {
            load()
        })
        return () => unsub()
    }, [userUuid])

    const getSender = (r: Req) =>
        r.sender || r.from || r.fromUser || r.requester || r.senderUsername || ''
    const getReceiver = (r: Req) =>
        r.receiver || r.to || r.toUser || r.receiverUsername || r.targetUsername || ''

    const notifyFriendsMaybeChanged = () => {
        // ✅ 수락/거절/취소 직후, 전역으로 친구목록 동기화 힌트 브로드캐스트
        try {
            window.dispatchEvent(new CustomEvent('friends:maybe-changed'))
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
