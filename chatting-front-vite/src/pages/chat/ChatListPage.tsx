import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/api/http'
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
    lastMessagePreview?: string
    /** 보강 단계에서 채움 */
    dmPeerName?: string
    dmPeerEmail?: string
}

/* ========= 공통 유틸 ========= */

function toStr(x: unknown): string | undefined {
    if (x === null || x === undefined) return undefined
    const s = String(x).trim()
    return s || undefined
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function isEmail(s?: string) {
    return !!(s && EMAIL_RE.test(s))
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

/** participant 에서 name/email 뽑기 */
function pickNameEmailFromParticipant(p: ParticipantLike): { name?: string; email?: string } {
    if (typeof p === 'string') {
        return isEmail(p) ? { email: p } : { name: p }
    }
    const email = toStr(p.email)
    const name = toStr(p.username)
    return { name: name || undefined, email: email || undefined }
}

/** participant 의 키(id/uuid/email 우선) */
function keyOf(p: ParticipantLike): string | undefined {
    if (typeof p === 'string') return p.trim() || undefined
    const cand =
        p.id ?? p.userId ?? p.uuid ?? p.uid ?? p.userUUID ?? p.email
    return toStr(cand)
}

function otherOfDM(room: Room, meKey?: string): ParticipantLike | undefined {
    const list =
        (room.participants && room.participants.length ? room.participants : room.members) || []
    if (list.length === 0) return undefined
    if (!meKey) return list[0]
    const meKeyNorm = meKey.trim()
    const other = list.find((p) => keyOf(p) !== meKeyNorm)
    return other || list[0]
}

function fmtTime(ts?: string | number): string {
    if (!ts && ts !== 0) return ''
    const n = Number(ts)
    const d = isNaN(n) ? new Date(ts as any) : new Date(n)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    if (sameDay) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** 메시지 normalize */
type RawMsg = any
type UiMsg = {
    id?: string
    content?: string
    createdAt?: number | string
    sender?: string
    username?: string
}
function normalizeMsg(m: RawMsg): UiMsg | null {
    const id = toStr(m?.id) || toStr(m?.messageId) || toStr(m?.uuid) || toStr(m?.pk)
    const content = toStr(m?.content) || toStr(m?.text) || toStr(m?.message) || toStr(m?.body)
    if (!id || !content) return null
    const createdAt = m?.createdAt ?? m?.time ?? m?.created_at ?? null
    return {
        id,
        content,
        createdAt,
        sender: toStr(m?.sender),
        username: toStr(m?.username)
    }
}

function displaySenderOf(m: UiMsg): { name?: string; email?: string } {
    const name = toStr(m.username)
    const email = toStr(m.sender)
    // name이 이메일이면 이메일로만 처리
    if (!email && isEmail(name)) return { email: name, name: undefined }
    return { name: name || undefined, email: email || undefined }
}

/** 최근 메시지들에서 meKey가 아닌 발신자의 이름/이메일 추출 */
function pickDmPeerFromMsgs(msgs: UiMsg[], meKey?: string): { name?: string; email?: string } {
    const cands: Array<{ name?: string; email?: string }> = []
    for (const m of msgs) {
        const disp = displaySenderOf(m)
        const key = disp.email || disp.name
        if (!key) continue
        if (meKey && key === meKey) continue
        cands.push(disp)
    }
    return cands.length ? cands[cands.length - 1] : {}
}

/* ========= 컴포넌트 ========= */

export default function ChatListPage(): JSX.Element {
    const navigate = useNavigate()
    const { userId, user } = useAuth() as any
    const { unread } = useNotifications()

    const [rooms, setRooms] = useState<Room[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const meKey: string | undefined = useMemo(() => {
        const cand =
            userId ??
            user?.id ??
            user?.userId ??
            user?.uuid ??
            user?.uid ??
            user?.userUUID ??
            user?.email
        return toStr(cand)
    }, [userId, user])

    /** rooms 로드 + 각 방 보강 (미리보기/상대 이름·이메일) */
    useEffect(() => {
        let alive = true
        const ac = new AbortController()

        ;(async () => {
            setLoading(true)
            setError(null)
            try {
                // 1) 방 목록
                const res = await http.get<Room[]>('/rooms', { signal: ac.signal as any })
                const base = (Array.isArray(res.data) ? res.data : []).map((r) => ({
                    ...r,
                    lastMessagePreview: r.lastMessagePreview || '',
                }))

                // 2) 최근 메시지 2개로 보강
                const enriched = await Promise.all(
                    base.map(async (room) => {
                        try {
                            const h = await http.get<any[]>(`/rooms/${room.id}/messages`, {
                                params: { limit: 2 },
                                signal: ac.signal as any,
                            })
                            const arr = Array.isArray(h.data) ? h.data : []
                            const msgs = arr.map(normalizeMsg).filter(Boolean) as UiMsg[]

                            const last = msgs[0] || null
                            const preview = last?.content || room.lastMessagePreview || ''
                            const createdAt = (last?.createdAt as any) ?? room.lastMessageAt ?? undefined

                            const peer = pickDmPeerFromMsgs(msgs, meKey)

                            console.log(msgs);
                            console.log(peer);

                            return {
                                ...room,
                                dmPeerName: peer.name || room.dmPeerName,
                                dmPeerEmail: peer.email || room.dmPeerEmail,
                                lastMessagePreview: preview,
                                lastMessageAt: createdAt,
                            } as Room
                        } catch {
                            return room
                        }
                    })
                )

                if (!alive) return
                setRooms(enriched)
            } catch (e) {
                if (!alive) return
                setError('방 목록을 불러오지 못했습니다.')
            } finally {
                if (alive) setLoading(false)
            }
        })()

        return () => {
            alive = false
            ac.abort()
        }
    }, [meKey])

    /** 타이틀 계산: DM → “이름(이메일)” 우선 / 그 외 서버제목 또는 참가자 포맷 */
    function titleOf(room: Room): string {
        const isDM =
            (room.type && room.type.toUpperCase() === 'DM') ||
            ((room.participants?.length || room.members?.length || 0) === 2)

        if (isDM) {
            // 보강에서 얻은 peer name/email이 있으면 우선
            if (room.dmPeerName || room.dmPeerEmail) {
                return formatNameEmail(room.dmPeerName, room.dmPeerEmail)
            }
            // participants/members에서 추출
            const other = otherOfDM(room, meKey)
            if (other) {
                const { name, email } = pickNameEmailFromParticipant(other)
                return formatNameEmail(name, email)
            }
        }

        // 서버가 준 타이틀
        const serverTitle = toStr(room.title || room.name)
        if (serverTitle) return serverTitle

        // 참가자 배열을 이름(이메일) 규칙으로 합치기
        const list = (room.participants?.length ? room.participants : room.members) || []
        if (list.length > 0) {
            const names = list.map((p) => {
                const { name, email } = pickNameEmailFromParticipant(p)
                return formatNameEmail(name, email)
            })
            const preview = names.slice(0, 3).join(', ')
            return names.length > 3 ? `${preview} 외 ${names.length - 3}명` : preview
        }
        return '대화방'
    }

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

            {loading && <div className="friends__row">불러오는 중…</div>}
            {error && <div className="friends__row">{error}</div>}

            {!loading && !error && (
                <ul className="friends__list">
                    {sortedRooms.map((r) => {
                        const title = titleOf(r)
                        const { unread } = useNotifications() // (안전: 상단에서 가져온 걸 써도 OK)
                        const count = unread?.[r.id] ?? 0
                        const preview = r.lastMessagePreview || ''
                        const timeText = fmtTime(r.lastMessageAt)

                        return (
                            <li
                                key={r.id}
                                className="friends__item"
                                onClick={() => navigate(`/chat/${r.id}`)}
                            >
                                <div className="friends__left">
                                    <div className="friends__nameRow">
                                        <div className="friends__name">{title}</div>
                                        {count > 0 && <span className="badge badge--unread">{count}</span>}
                                    </div>
                                    <div className="friends__preview" title={preview}>
                                        {preview ? (timeText ? `${preview} · ${timeText}` : preview) : timeText || '메시지가 없습니다.'}
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            {!loading && !error && sortedRooms.length === 0 && (
                <div className="friends__row">대화방이 없습니다. 친구에게 먼저 말을 걸어보세요!</div>
            )}
        </div>
    )
}
