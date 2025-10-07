// src/bootstrap/SidebarNav.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useNotifications } from '@/hooks/useNotifications'
import http from '@/api/http'

type Room = { id: string }

const isFiniteNumber = (x: unknown): x is number =>
    typeof x === 'number' && Number.isFinite(x)
const sum = (arr: Array<number | null | undefined>): number =>
    arr.reduce<number>((acc, v) => acc + (isFiniteNumber(v) ? v : 0), 0)

export default function SidebarNav(): JSX.Element {
    const { unread, getUnreadByRoom } = useNotifications() as any
    const [unreadTotal, setUnreadTotal] = useState(0)
    const roomsRef = useRef<string[]>([])

    const syncRooms = useCallback(async () => {
        try {
            const res = await http.get<Room[]>('/rooms')
            const ids = (Array.isArray(res.data) ? res.data : [])
                .map((r) => String(r?.id))
                .filter(Boolean)
            roomsRef.current = Array.from(new Set(ids))
        } catch {
            roomsRef.current = []
        }
    }, [])

    /** ✅ 방 목록이 있으면 방 기준, 없으면 unread 맵 전체 합산 */
    const recalcNow = useCallback(() => {
        let total = 0
        if (roomsRef.current.length > 0 && typeof getUnreadByRoom === 'function') {
            total = sum(roomsRef.current.map((id) => getUnreadByRoom(id)))
        } else {
            total = sum(Object.values(unread || {}) as any)
        }
        setUnreadTotal(total || 0)
    }, [getUnreadByRoom, unread])

    // 초기 진입: 방 목록 동기화 후 합산 (❌ 서버 요약 호출 없음)
    useEffect(() => {
        ;(async () => {
            await syncRooms()
            recalcNow()
        })()
    }, [syncRooms, recalcNow])

    // 컨텍스트 unread 변동 시 즉시 재계산
    useEffect(() => { recalcNow() }, [unread, recalcNow])

    return (
        <aside className="sidebar">
            <div className="sidebar__brand">Realtime Chat</div>
            <nav className="sidebar__nav">
                <NavLink
                    to="/friends"
                    className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
                >
                    <span className="sidebar__icon">👥</span>
                    <span className="sidebar__label">친구</span>
                </NavLink>

                <NavLink
                    to="/chat"
                    className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
                >
                    <span className="sidebar__icon">💬</span>
                    <span className="sidebar__label">채팅</span>
                    {unreadTotal > 0 && (
                        <span className="badge badge--nav">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
                    )}
                </NavLink>
            </nav>
        </aside>
    )
}
