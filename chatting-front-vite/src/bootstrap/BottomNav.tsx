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
    const { getUnreadByRoom } = useNotifications() as any

    const [unreadTotal, setUnreadTotal] = useState<number>(0)
    const roomsRef = useRef<string[]>([])
    const timerRef = useRef<number | null>(null)

    // rooms 가져와서 합산
    const recalc = async () => {
        try {
            // 방 목록 보유(최소 1회)
            if (roomsRef.current.length === 0) {
                const res = await http.get<Room[]>('/rooms')
                roomsRef.current = (Array.isArray(res.data) ? res.data : []).map(r => r.id)
            }
            // 합산
            const total = roomsRef.current.reduce((acc, id) => acc + (getUnreadByRoom?.(id) || 0), 0)
            setUnreadTotal(total)
        } catch {
            // 실패해도 배지 0으로
            setUnreadTotal(0)
        }
    }

    // 짧은 디바운스 스케줄러
    const scheduleRecalc = () => {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => { recalc() }, 120) as unknown as number
    }

    useEffect(() => {
        if (!userId) return

        // 최초 계산
        recalc()

        // 메시지/방 변경 이벤트 → 합계 재계산
        const unsubs: Array<() => void> = []
        unsubs.push(ws.subscribe(`/topic/messages/${userId}`, scheduleRecalc))
        unsubs.push(ws.subscribe(`/user/queue/messages`, scheduleRecalc))
        unsubs.push(ws.subscribe(`/topic/rooms/${userId}`, async () => {
            // 방이 바뀌면 목록 다시 불러온 뒤 합산
            roomsRef.current = []
            scheduleRecalc()
        }))
        unsubs.push(ws.subscribe(`/user/queue/rooms`, async () => {
            roomsRef.current = []
            scheduleRecalc()
        }))

        const onConnect = () => scheduleRecalc()
        ws.onConnect(onConnect)
        ws.ensureConnected()

        return () => {
            unsubs.forEach(u => { try { u() } catch {} })
            try { ws.offConnect(onConnect) } catch {}
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
