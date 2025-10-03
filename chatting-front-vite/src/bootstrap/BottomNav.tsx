// src/bootstrap/BottomNav.tsx
import React, { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import NotificationsBell from '@/pages/friends/NotificationsBell'
import http from '@/api/http'
import { ws } from '@/ws'

type Room = { id: string }

export default function BottomNav(): JSX.Element {
    const { userId } = useAuth() as any
    const {
        getUnread,          // ✅ 친구 기준 미읽음 (FriendsPage에서 쓰던 것)
        getUnreadByRoom,    // ✅ 방 기준 미읽음 (있으면 우선 사용)
    } = useNotifications() as any

    const [unreadTotal, setUnreadTotal] = useState<number>(0)
    const roomsRef = useRef<string[]>([])
    const timerRef = useRef<number | null>(null)
    const fetchingRoomsRef = useRef(false)

    // 방 목록 확보 (최초 1회 + 방 변경 시)
    const ensureRooms = async () => {
        if (fetchingRoomsRef.current) return
        try {
            fetchingRoomsRef.current = true
            const res = await http.get<Room[]>('/rooms')
            roomsRef.current = (Array.isArray(res.data) ? res.data : []).map(r => r.id)
        } catch {
            roomsRef.current = []
        } finally {
            fetchingRoomsRef.current = false
        }
    }

    // 합산: 1) 방 기준 → 2) (보조) 친구 기준
    const recalc = async () => {
        try {
            if (roomsRef.current.length === 0) {
                await ensureRooms()
            }

            let total = 0

            // 1) 방 기준 합산이 가능하면 우선 사용
            if (typeof getUnreadByRoom === 'function' && roomsRef.current.length > 0) {
                total = roomsRef.current.reduce((acc, id) => acc + (getUnreadByRoom(id) || 0), 0)
            }

            // 2) 보조 경로: 방 기준 합계가 0이거나 함수가 없으면 친구 기준으로 시도
            if ((!total || total === 0) && typeof getUnread === 'function') {
                try {
                    const fr = await http.get<string[]>('/friends')
                    const friends: string[] = Array.isArray(fr.data) ? fr.data : []
                    total = friends.reduce((acc, name) => acc + (getUnread(name) || 0), 0)
                } catch {
                    // ignore
                }
            }

            setUnreadTotal(total || 0)
        } catch {
            setUnreadTotal(0)
        }
    }

    const scheduleRecalc = (ms = 120) => {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => { recalc() }, ms) as unknown as number
    }

    useEffect(() => {
        if (!userId) return

        // 초기 1회
        recalc()

        // WS 이벤트: 메시지/방 변경 시 재계산
        const unsubs: Array<() => void> = []
        unsubs.push(ws.subscribe(`/topic/messages/${userId}`, () => scheduleRecalc()))
        unsubs.push(ws.subscribe(`/user/queue/messages`, () => scheduleRecalc()))
        unsubs.push(ws.subscribe(`/topic/rooms/${userId}`, async () => {
            roomsRef.current = []
            scheduleRecalc(30)
        }))
        unsubs.push(ws.subscribe(`/user/queue/rooms`, async () => {
            roomsRef.current = []
            scheduleRecalc(30)
        }))
        // 친구 요청/수락 등도 뱃지에 영향(미리보기/읽음 로직과 연동 시) 있을 수 있으니 보조로 포함
        unsubs.push(ws.subscribe(`/topic/friend-requests/${userId}`, () => scheduleRecalc(60)))
        unsubs.push(ws.subscribe(`/user/queue/friends`, () => scheduleRecalc(60)))

        // 연결(재연결) 또는 탭 활성화 시 동기화
        const onConnect = () => scheduleRecalc(30)
        const onVisible = () => { if (document.visibilityState === 'visible') scheduleRecalc(30) }

        ws.onConnect(onConnect)
        ws.ensureConnected()
        document.addEventListener('visibilitychange', onVisible)

        return () => {
            unsubs.forEach(u => { try { u() } catch {} })
            try { ws.offConnect(onConnect) } catch {}
            document.removeEventListener('visibilitychange', onVisible)
            if (timerRef.current) {
                try { window.clearTimeout(timerRef.current) } catch {}
                timerRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])

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

                {/* ✅ 전체 미읽음 합계 배지 */}
                {unreadTotal > 0 && (
                    <span className="badge badge--nav">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
                )}
            </NavLink>

            {/* 알림(친구 요청 팝업) */}
            <button className="bottomnav__item bottomnav__button" title="알림">
        <span className="bottomnav__icon">
          <NotificationsBell userId={userId} />
        </span>
                <span className="bottomnav__label">알림</span>
            </button>
        </nav>
    )
}