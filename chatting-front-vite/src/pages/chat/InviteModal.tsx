import React, { useEffect, useMemo, useState } from 'react'
import { FriendsAPI, FriendBriefDto } from '@/api/friends'
import { RoomsAPI, InviteResponse, RoomDto } from '@/api/rooms'
import { AiAPI, AiAgent, Page } from '@/api/ai'
import '@/styles/invite-modal.css'

type InviteModalProps = {
    open: boolean
    onClose: () => void
    roomId: string
    /** 초대 성공 시 결과를 부모로 전달(토스트/로그 등에 활용) */
    onInvited?: (result: InviteResponse | { ok: boolean }, identifiers: string[]) => void
}

type Tab = 'friends' | 'ai'

/** 키 생성: email > id > name (충돌 가능성 최소화) */
const keyOfFriend = (f: FriendBriefDto) =>
    (f.email && f.email.trim()) || (f.id ?? '') || (f.name ?? '') || ''

/** 초대 식별자: email > id */
const identOfFriend = (f: FriendBriefDto) =>
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

/** AI 키/식별자 */
const keyOfAgent = (a: AiAgent) => a.id
const identOfAgent = (a: AiAgent) => a.id

export default function InviteModal({ open, onClose, roomId, onInvited }: InviteModalProps) {
    const [active, setActive] = useState<Tab>('friends')

    // 공통
    const [err, setErr] = useState<string | null>(null)

    // ── 친구 탭 상태 ───────────────────────────────────────────────
    const [loadingFriends, setLoadingFriends] = useState(false)
    const [friends, setFriends] = useState<FriendBriefDto[]>([])
    const [selFriends, setSelFriends] = useState<Record<string, boolean>>({})
    const [submittingFriends, setSubmittingFriends] = useState(false)
    // 현재 방 멤버 세트(소문자 비교; email 우선, 없으면 uuid 문자열)
    const [memberSet, setMemberSet] = useState<Set<string>>(new Set())

    // ── AI 탭 상태 ────────────────────────────────────────────────
    const [loadingAI, setLoadingAI] = useState(false)
    const [agents, setAgents] = useState<AiAgent[]>([])
    const [selAgents, setSelAgents] = useState<Record<string, boolean>>({})
    const [aiQ, setAiQ] = useState('')
    const [aiPage, setAiPage] = useState(0)
    const [aiSize] = useState(12)
    const [aiTotal, setAiTotal] = useState(0)
    const [submittingAI, setSubmittingAI] = useState(false)

    // 열릴 때 초기화 & 필요한 데이터 로드
    useEffect(() => {
        if (!open) return
        setErr(null)
        // 초기화
        setSelFriends({})
        setSelAgents({})
        // 친구/멤버 로딩
        void loadFriendsAndMembers()
        // AI 초기 검색
        void searchAI(0, aiQ)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, roomId])

    /** 친구/멤버 병렬 로딩 */
    const loadFriendsAndMembers = async () => {
        setLoadingFriends(true)
        try {
            const [arr, roomRes] = await Promise.all([FriendsAPI.list(), RoomsAPI.get(roomId)])
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
            setErr('친구/멤버 정보를 불러오지 못했습니다.')
        } finally {
            setLoadingFriends(false)
        }
    }

    const isAlreadyInRoom = (f: FriendBriefDto) => {
        const em = (f.email ?? '').trim().toLowerCase()
        const id = (f.id ?? '').trim().toLowerCase()
        return (!!em && memberSet.has(em)) || (!!id && memberSet.has(id))
    }

    // 선택 가능한 대상만 기준으로 "전체 선택" 상태 계산 (친구)
    const allFriendsChecked = useMemo(() => {
        const selectable = friends.filter((f) => !isAlreadyInRoom(f))
        if (selectable.length === 0) return false
        return selectable.every((f) => !!selFriends[keyOfFriend(f)])
    }, [friends, selFriends, memberSet])

    // 선택된 친구 식별자(이미 멤버는 제외)
    const selectedFriendIdents = useMemo(() => {
        const ids: string[] = []
        for (const f of friends) {
            if (isAlreadyInRoom(f)) continue
            const k = keyOfFriend(f)
            if (k && selFriends[k]) {
                const ident = identOfFriend(f)
                if (ident) ids.push(ident)
            }
        }
        return ids
    }, [friends, selFriends, memberSet])

    const toggleFriend = (k: string) =>
        setSelFriends((prev) => ({ ...prev, [k]: !prev[k] }))

    const toggleAllFriends = () => {
        const selectable = friends.filter((f) => !isAlreadyInRoom(f))
        const value = !selectable.every((f) => !!selFriends[keyOfFriend(f)])
        const next: Record<string, boolean> = { ...selFriends }
        selectable.forEach((f) => {
            const k = keyOfFriend(f)
            if (k) next[k] = value
        })
        setSelFriends(next)
    }

    const onInviteFriends = async () => {
        setErr(null)
        if (selectedFriendIdents.length < 1) {
            setErr('초대할 친구를 선택하세요. (이미 참여중인 사용자는 초대할 수 없습니다.)')
            return
        }
        try {
            setSubmittingFriends(true)
            const { data } = await RoomsAPI.invite(roomId, selectedFriendIdents)
            onInvited?.(data, selectedFriendIdents)
            onClose()
        } catch (e: any) {
            setErr(e?.response?.data?.message || '친구 초대에 실패했습니다.')
        } finally {
            setSubmittingFriends(false)
        }
    }

    /** AI 검색 */
    const searchAI = async (page = 0, q = '') => {
        setLoadingAI(true)
        setErr(null)
        try {
            const r: Page<AiAgent> = await AiAPI.search({ query: q, page, size: aiSize })
            setAgents(r.content)
            setAiPage(r.page)
            setAiTotal(r.totalElements)
        } catch {
            setErr('AI 목록을 불러오지 못했습니다.')
        } finally {
            setLoadingAI(false)
        }
    }

    // AI 전체 선택 상태
    const allAgentsChecked = useMemo(() => {
        if (agents.length === 0) return false
        return agents.every((a) => !!selAgents[keyOfAgent(a)])
    }, [agents, selAgents])

    const selectedAgentIdents = useMemo(() => {
        const ids: string[] = []
        for (const a of agents) {
            const k = keyOfAgent(a)
            if (k && selAgents[k]) {
                const ident = identOfAgent(a)
                if (ident) ids.push(ident)
            }
        }
        return ids
    }, [agents, selAgents])

    const toggleAgent = (k: string) =>
        setSelAgents((prev) => ({ ...prev, [k]: !prev[k] }))

    const toggleAllAgents = () => {
        const value = !agents.every((a) => !!selAgents[keyOfAgent(a)])
        const next: Record<string, boolean> = { ...selAgents }
        agents.forEach((a) => {
            const k = keyOfAgent(a)
            if (k) next[k] = value
        })
        setSelAgents(next)
    }

    const onInviteAgents = async () => {
        setErr(null)
        if (selectedAgentIdents.length < 1) {
            setErr('초대할 AI를 선택하세요.')
            return
        }
        try {
            setSubmittingAI(true)
            const res = await AiAPI.invite(roomId, selectedAgentIdents)
            onInvited?.(res, selectedAgentIdents)
            onClose()
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'AI 초대에 실패했습니다.')
        } finally {
            setSubmittingAI(false)
        }
    }

    if (!open) return null

    return (
        <div className="modal__backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal__header">
                    <h3>초대</h3>
                    <button className="modal__close" onClick={onClose}>×</button>
                </div>

                {/* 탭 */}
                <div className="modal__tabs">
                    <button
                        className={`modal__tab ${active === 'friends' ? 'is-active' : ''}`}
                        onClick={() => setActive('friends')}
                    >
                        친구 초대
                    </button>
                    <button
                        className={`modal__tab ${active === 'ai' ? 'is-active' : ''}`}
                        onClick={() => setActive('ai')}
                    >
                        AI 초대
                    </button>
                </div>

                <div className="modal__body">
                    {err && <div className="modal__error">{err}</div>}

                    {/* 친구 탭 */}
                    {active === 'friends' && (
                        <>
                            {loadingFriends && <div>불러오는 중…</div>}
                            {!loadingFriends && friends.length === 0 && <div>등록된 친구가 없습니다.</div>}

                            {!loadingFriends && friends.length > 0 && (
                                <>
                                    <div className="modal__toolbar">
                                        <label className="chk">
                                            <input type="checkbox" checked={allFriendsChecked} onChange={toggleAllFriends} />
                                            전체 선택/해제
                                        </label>
                                        <span className="muted">선택: {selectedFriendIdents.length}명</span>
                                    </div>

                                    <ul className="friendlist">
                                        {friends.map((f) => {
                                            const k = keyOfFriend(f)
                                            const checked = !!selFriends[k]
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
                                                            onChange={() => !already && toggleFriend(k)}
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
                        </>
                    )}

                    {/* AI 탭 */}
                    {active === 'ai' && (
                        <>
                            <div className="ai__searchbar">
                                <input
                                    value={aiQ}
                                    placeholder="키워드 (예: 영어, 연애, 개발, 요약)"
                                    onChange={(e) => setAiQ(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void searchAI(0, aiQ) }}
                                />
                                <button onClick={() => searchAI(0, aiQ)}>검색</button>
                            </div>

                            {loadingAI && <div>불러오는 중…</div>}

                            {!loadingAI && (
                                <>
                                    <div className="modal__toolbar">
                                        <label className="chk">
                                            <input type="checkbox" checked={allAgentsChecked} onChange={toggleAllAgents} />
                                            전체 선택/해제
                                        </label>
                                        <span className="muted">선택: {selectedAgentIdents.length}개</span>
                                    </div>

                                    <ul className="ailist">
                                        {agents.map((a) => {
                                            const k = keyOfAgent(a)
                                            const checked = !!selAgents[k]
                                            return (
                                                <li key={k} className="ailist__item">
                                                    <label className="chk">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleAgent(k)}
                                                        />
                                                        <div className="ai__meta">
                                                            <div className="ai__avatar">
                                                                {a.avatarUrl ? <img src={a.avatarUrl} alt={a.name} /> : <div className="ai__fallback">AI</div>}
                                                            </div>
                                                            <div>
                                                                <div className="ai__name">{a.name}</div>
                                                                {a.intro && <div className="ai__desc">{a.intro}</div>}
                                                                {!!a.tags?.length && (
                                                                    <div className="ai__tags">
                                                                        {a.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </label>
                                                </li>
                                            )
                                        })}
                                        {agents.length === 0 && <div>검색 결과가 없습니다.</div>}
                                    </ul>

                                    {/* 페이지네이션 */}
                                    <div className="invite__pager">
                                        <button
                                            onClick={() => searchAI(Math.max(0, aiPage - 1), aiQ)}
                                            disabled={aiPage === 0}
                                        >
                                            이전
                                        </button>
                                        <span>{aiPage + 1} / {Math.max(1, Math.ceil(aiTotal / aiSize))}</span>
                                        <button
                                            onClick={() => searchAI(aiPage + 1, aiQ)}
                                            disabled={(aiPage + 1) * aiSize >= aiTotal}
                                        >
                                            다음
                                        </button>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="modal__footer">
                    <button className="btn" onClick={onClose}>취소</button>

                    {active === 'friends' ? (
                        <button
                            className="btn btn--primary"
                            disabled={submittingFriends || selectedFriendIdents.length === 0}
                            onClick={onInviteFriends}
                        >
                            {submittingFriends ? '초대 중…' : '초대하기'}
                        </button>
                    ) : (
                        <button
                            className="btn btn--primary"
                            disabled={submittingAI || selectedAgentIdents.length === 0}
                            onClick={onInviteAgents}
                        >
                            {submittingAI ? '초대 중…' : '초대하기'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
