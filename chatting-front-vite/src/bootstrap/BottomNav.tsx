// src/bootstrap/BottomNav.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import http from '@/api/http'
import { ws } from '@/lib/ws'

type Room = { id: string }

const isFiniteNumber = (x: unknown): x is number =>
    typeof x === 'number' && Number.isFinite(x)

/** 안전 합산 */
const sum = (arr: Array<number | null | undefined>): number =>
    arr.reduce<number>((acc, v) => acc + (isFiniteNumber(v) ? v : 0), 0)

export default function BottomNav(): JSX.Element {
    const { userUuid } = useAuth() as any
    const { getUnread, getUnreadByRoom } = useNotifications() as any

    const [unreadTotal, setUnreadTotal] = useState(0)

    // 현재 보유한 방 목록 & 방별 구독 레지스트리
    const roomsRef = useRef<string[]>([])
    const roomSubsRef = useRef<Map<string, () => void>>(new Map())

    /** 방 목록 동기화 */
    const syncRooms = useCallback(async () => {
        try {
            const res = await http.get<Room[]>('/rooms')
            const ids = (Array.isArray(res.data) ? res.data : [])
                .map(r => String(r?.id))
                .filter(Boolean)
            const unique = Array.from(new Set(ids))
            roomsRef.current = unique
            return unique
        } catch {
            roomsRef.current = []
            return []
        }
    }, [])

    /** 전체 미읽음 즉시 재계산 (항상 최신 훅을 캡쳐하도록 useCallback) */
    const recalcNow = useCallback(async () => {
        // 1) 방 기준 우선
        let total = 0
        if (typeof getUnreadByRoom === 'function' && roomsRef.current.length > 0) {
            total = sum(roomsRef.current.map(id => getUnreadByRoom(id)))
        }

        // 2) 보조 경로: 친구 기준
        if ((!total || total === 0) && typeof getUnread === 'function') {
            try {
                const fr = await http.get<any[]>('/friends')
                const friends = Array.isArray(fr.data) ? fr.data : []
                total = sum(
                    friends.map(f =>
                        getUnread(
                            f?.id ?? f?.username ?? f?.name ?? f // 문자열 배열일 수도 있음
                        )
                    )
                )
            } catch { /* ignore */ }
        }

        setUnreadTotal(total || 0)
    }, [getUnread, getUnreadByRoom])

    /** 방별 메시지 토픽 재구독(있을 때만 효과) */
    const resubscribeRoomTopics = useCallback(() => {
        // 1) 기존 구독 clean
        for (const un of roomSubsRef.current.values()) {
            try { un() } catch {}
        }
        roomSubsRef.current.clear()

        // 2) 재구독
        roomsRef.current.forEach(roomId => {
            const trySub = (dest: string) => {
                try {
                    const un = ws.subscribe(dest, () => {
                        // 콜백 → 항상 최신 recalcNow 호출 (useCallback 덕분에 스테일 클로저 방지)
                        recalcNow()
                    })
                    roomSubsRef.current.set(dest, un)
                    return true
                } catch { return false }
            }
            // 서버 규칙에 맞게 하나 쓰세요. 기본 A → 실패 시 B로 시도.
            if (!trySub(`/topic/messages/room/${roomId}`)) {
                trySub(`/topic/rooms/${roomId}/messages`)
            }
        })
    }, [recalcNow])

    // 크로스탭 신호 유틸: 다른 탭에서 이벤트 발생 시 현재 탭도 깨어나서 재계산
    const bumpCrossTab = useCallback(() => {
        try {
            localStorage.setItem('unread-bump', String(Date.now()))
        } catch {}
    }, [])
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'unread-bump') recalcNow()
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [recalcNow])

    // 메인 이펙트
    useEffect(() => {
        if (!userUuid) return
        let coreUnsubs: Array<() => void> = []
        let pollId: number | null = null

        ;(async () => {
            await syncRooms()
            resubscribeRoomTopics()
            await recalcNow()
        })()

        // 사용자/개인 큐 이벤트 → 즉시 합산
        coreUnsubs.push(ws.subscribe(`/topic/messages/${userUuid}`, () => { recalcNow(); bumpCrossTab() }))
        coreUnsubs.push(ws.subscribe(`/user/queue/messages`, () => { recalcNow(); bumpCrossTab() }))

        // 방 변경 → 동기화 → 방별 재구독 → 즉시 합산
        const onRoomsChanged = async () => {
            await syncRooms()
            resubscribeRoomTopics()
            await recalcNow()
            bumpCrossTab()
        }
        coreUnsubs.push(ws.subscribe(`/topic/rooms/${userUuid}`, onRoomsChanged))
        coreUnsubs.push(ws.subscribe(`/user/queue/rooms`, onRoomsChanged))

        // 재연결 시에도 동일 절차
        const onConnect = async () => {
            await syncRooms()
            resubscribeRoomTopics()
            await recalcNow()
        }
        ws.onConnect(onConnect)
        ws.ensureConnected()

        // 가시성/포커스/온라인 전환 시 복구
        const onVisible = () => { if (document.visibilityState === 'visible') recalcNow() }
        const onFocus = () => recalcNow()
        const onOnline = () => recalcNow()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onFocus)
        window.addEventListener('online', onOnline)

        // 가벼운 폴링(visible일 때만 3초): 이벤트 누락/백그라운드 누수 대비
        const startPoll = () => {
            if (pollId) return
            pollId = window.setInterval(() => {
                if (document.visibilityState === 'visible') recalcNow()
            }, 3000) as unknown as number
        }
        const stopPoll = () => {
            if (pollId) { clearInterval(pollId); pollId = null }
        }
        startPoll()

        return () => {
            coreUnsubs.forEach(u => { try { u() } catch {} })
            coreUnsubs = []

            for (const un of roomSubsRef.current.values()) { try { un() } catch {} }
            roomSubsRef.current.clear()

            try { ws.offConnect(onConnect) } catch {}
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('online', onOnline)
            stopPoll()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userUuid, recalcNow, resubscribeRoomTopics, syncRooms, bumpCrossTab])

    return (
        <nav className="bottomnav">
            <NavLink
                to="/friends"
                className={({ isActive }) => `bottomnav__item ${isActive ? 'is-active' : ''}`}
                title="친구"
            >
                <span className="bottomnav__icon">👥</span>
                <span className="bottomnav__label">친구</span>
            </NavLink>

            <NavLink
                to="/chat"
                className={({ isActive }) => `bottomnav__item bottomnav__item--chat ${isActive ? 'is-active' : ''}`}
                title="채팅"
            >
                <span className="bottomnav__icon">💬</span>
                <span className="bottomnav__label">채팅</span>

                {unreadTotal > 0 && (
                    <span className="badge badge--nav">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
                )}
            </NavLink>
        </nav>
    )
}
