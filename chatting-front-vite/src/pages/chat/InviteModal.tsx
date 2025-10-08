import React, { useEffect, useMemo, useState } from 'react'
import { FriendsAPI, FriendBriefDto } from '@/api/friends'
import { RoomsAPI, InviteResponse, RoomDto } from '@/api/rooms'
import '@/styles/invite-modal.css'

type InviteModalProps = {
    open: boolean
    onClose: () => void
    roomId: string
    /** 초대 성공 시 결과를 부모로 전달(토스트/로그 등에 활용) */
    onInvited?: (result: InviteResponse, identifiers: string[]) => void
}

/** 키 생성: email > id > name (충돌 가능성 최소화) */
const keyOf = (f: FriendBriefDto) =>
    (f.email && f.email.trim()) || (f.id ?? '') || (f.name ?? '') || ''

/** 초대 식별자: email > id */
const identifierOf = (f: FriendBriefDto) =>
    (f.email && f.email.trim()) || (f.id ?? '') || ''

/** 표시명: name > email > id */
const displayNameOf = (f: FriendBriefDto) =>
    (f.name && f.name.trim()) || (f.email && f.email.trim()) || (f.id ?? '') || ''

/** 서브: name과 email이 다를 때만 email 노출 */
const subOf = (f: FriendBriefDto) => {
    const nm = f.name?.trim()
    const em = f.email?.trim()
    return nm && em && nm !== em ? em : ''
}

export default function InviteModal({ open, onClose, roomId, onInvited }: InviteModalProps) {
    const [loading, setLoading] = useState(false)
    const [friends, setFriends] = useState<FriendBriefDto[]>([])
    const [sel, setSel] = useState<Record<string, boolean>>({})
    const [err, setErr] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    // 현재 방 멤버 세트(소문자 비교; email 우선, 없으면 uuid 문자열)
    const [memberSet, setMemberSet] = useState<Set<string>>(new Set())

    // 열릴 때 친구목록 + 방 멤버 병렬 로딩 (FriendsAPI.list는 항상 배열 반환)
    useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoading(true); setErr(null); setFriends([]); setSel({}); setMemberSet(new Set())

        ;(async () => {
            try {
                const [arr, roomRes] = await Promise.all([
                    FriendsAPI.list(),
                    RoomsAPI.get(roomId),
                ])

                if (cancelled) return

                setFriends(Array.isArray(arr) ? arr : [])

                const r: RoomDto | undefined = roomRes?.data
                const members = Array.isArray(r?.members) ? r!.members! : []
                const s = new Set<string>()
                for (const m of members) {
                    const k = (m ?? '').toString().trim().toLowerCase()
                    if (k) s.add(k)
                }
                setMemberSet(s)

            } catch {
                if (!cancelled) setErr('친구/멤버 정보를 불러오지 못했습니다.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()

        return () => { cancelled = true }
    }, [open, roomId])

    const isAlreadyInRoom = (f: FriendBriefDto) => {
        const em = (f.email ?? '').trim().toLowerCase()
        const id = (f.id ?? '').trim().toLowerCase()
        return (!!em && memberSet.has(em)) || (!!id && memberSet.has(id))
    }

    // 선택 가능한 대상만 기준으로 "전체 선택" 상태 계산
    const allChecked = useMemo(() => {
        const selectable = friends.filter((f) => !isAlreadyInRoom(f))
        if (selectable.length === 0) return false
        return selectable.every((f) => !!sel[keyOf(f)])
    }, [friends, sel, memberSet])

    // 선택된 식별자(이미 멤버는 제외)
    const selectedIdentifiers = useMemo(() => {
        const ids: string[] = []
        for (const f of friends) {
            if (isAlreadyInRoom(f)) continue
            const k = keyOf(f)
            if (k && sel[k]) {
                const ident = identifierOf(f)
                if (ident) ids.push(ident)
            }
        }
        return ids
    }, [friends, sel, memberSet])

    const toggle = (k: string) => setSel((prev) => ({ ...prev, [k]: !prev[k] }))

    // 전체선택: 참여중이 아닌 대상만 토글
    const toggleAll = () => {
        const selectable = friends.filter((f) => !isAlreadyInRoom(f))
        const value = !selectable.every((f) => !!sel[keyOf(f)])
        const next: Record<string, boolean> = { ...sel }
        selectable.forEach((f) => { const k = keyOf(f); if (k) next[k] = value })
        setSel(next)
    }

    const onInvite = async () => {
        setErr(null)
        if (selectedIdentifiers.length < 1) {
            setErr('초대할 친구를 선택하세요. (이미 참여중인 사용자는 초대할 수 없습니다.)')
            return
        }
        try {
            setSubmitting(true)
            const { data } = await RoomsAPI.invite(roomId, selectedIdentifiers)
            onInvited?.(data, selectedIdentifiers)
            onClose() // 성공 시 닫기(원하면 주석 처리 후 결과 표시 UI로 확장)
        } catch (e: any) {
            setErr(e?.response?.data?.message || '초대에 실패했습니다.')
        } finally {
            setSubmitting(false)
        }
    }

    if (!open) return null

    return (
        <div className="modal__backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal__header">
                    <h3>친구 초대</h3>
                    <button className="modal__close" onClick={onClose}>×</button>
                </div>

                <div className="modal__body">
                    {loading && <div>불러오는 중…</div>}
                    {err && <div className="modal__error">{err}</div>}

                    {!loading && friends.length === 0 && <div>등록된 친구가 없습니다.</div>}

                    {!loading && friends.length > 0 && (
                        <>
                            <div className="modal__toolbar">
                                <label className="chk">
                                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                                    전체 선택/해제
                                </label>
                                <span className="muted">선택: {selectedIdentifiers.length}명</span>
                            </div>

                            <ul className="friendlist">
                                {friends.map((f) => {
                                    const k = keyOf(f)
                                    const checked = !!sel[k]
                                    const name = displayNameOf(f)
                                    const sub = subOf(f)
                                    const already = isAlreadyInRoom(f)
                                    return (
                                        <li key={k} className={`friendlist__item ${already ? 'is-member' : ''}`}>
                                            <label className="chk">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={already}
                                                    onChange={() => !already && toggle(k)}
                                                />
                                                <span className="friendlist__name">{name}</span>
                                                {sub && <span className="friendlist__sub">{sub}</span>}
                                                {already && <span className="badge badge--muted">이미 참여중</span>}
                                            </label>
                                        </li>
                                    )
                                })}
                            </ul>
                        </>
                    )}
                </div>

                <div className="modal__footer">
                    <button className="btn" onClick={onClose}>취소</button>
                    <button
                        className="btn btn--primary"
                        disabled={submitting || selectedIdentifiers.length === 0}
                        onClick={onInvite}
                    >
                        {submitting ? '초대 중…' : '초대하기'}
                    </button>
                </div>
            </div>
        </div>
    )
}
