// src/bootstrap/BottomNav.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import http from '@/api/http'
import { ws } from '@/lib/ws'

type Room = { id: string }

const isFiniteNumber = (x: unknown): x is number =>
    typeof x === 'number' && Number.isFinite(x)
const sum = (arr: Array<number | null | undefined>): number =>
    arr.reduce<number>((acc, v) => acc + (isFiniteNumber(v) ? v : 0), 0)

export default function BottomNav(): JSX.Element {
    const { userUuid } = useAuth() as any
    const { unread, getUnreadByRoom } = useNotifications() as any

    const [unreadTotal, setUnreadTotal] = useState(0)
    const roomsRef = useRef<string[]>([])
    const roomSubsRef = useRef<Map<string, () => void>>(new Map())

    const syncRooms = useCallback(async () => {
        try {
            const res = await http.get<Room[]>('/rooms')
            const ids = (Array.isArray(res.data) ? res.data : [])
                .map(r => String(r?.id))
                .filter(Boolean)
            roomsRef.current = Array.from(new Set(ids))
            return roomsRef.current
        } catch {
            roomsRef.current = []
            return []
        }
    }, [])

    /** ✅ 방 목록이 있으면 방 기준 합산, 없으면 unread 맵 전체 합산(즉시) */
    const recalcNow = useCallback(() => {
        let total = 0
        if (roomsRef.current.length > 0 && typeof getUnreadByRoom === 'function') {
            total = sum(roomsRef.current.map(id => getUnreadByRoom(id)))
        } else {
            total = sum(Object.values(unread || {}) as any)
        }
        setUnreadTotal(total || 0)
    }, [getUnreadByRoom, unread])

    const resubscribeRoomTopics = useCallback(() => {
        for (const un of roomSubsRef.current.values()) { try { un() } catch {} }
        roomSubsRef.current.clear()
        roomsRef.current.forEach(roomId => {
            const trySub = (dest: string) => {
                try {
                    const un = ws.subscribe(dest, () => { recalcNow() })
                    roomSubsRef.current.set(dest, un)
                    return true
                } catch { return false }
            }
            if (!trySub(`/topic/messages/room/${roomId}`)) {
                trySub(`/topic/rooms/${roomId}/messages`)
            }
        })
    }, [recalcNow])

    // 초기 진입: 방 동기화 → 재구독 → 합산 (❌ 서버 요약 호출 없음)
    useEffect(() => {
        if (!userUuid) return
            ;(async () => {
            await syncRooms()
            resubscribeRoomTopics()
            recalcNow()
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userUuid])

    // 컨텍스트 unread 변동 시 즉시 재계산(서버 요약/WS 반영을 빠르게 UI에 반영)
    useEffect(() => { recalcNow() }, [unread, recalcNow])

    // 가벼운 기타들
    useEffect(() => {
        if (!userUuid) return
        let coreUnsubs: Array<() => void> = []
        let pollId: number | null = null

        const onRoomsChanged = async () => {
            await syncRooms()
            resubscribeRoomTopics()
            recalcNow()
        }

        coreUnsubs.push(ws.subscribe(`/topic/messages/${userUuid}`, () => recalcNow()))
        coreUnsubs.push(ws.subscribe(`/user/queue/messages`, () => recalcNow()))
        coreUnsubs.push(ws.subscribe(`/topic/rooms/${userUuid}`, onRoomsChanged))
        coreUnsubs.push(ws.subscribe(`/user/queue/rooms`, onRoomsChanged))

        const onConnect = async () => {
            await syncRooms()
            resubscribeRoomTopics()
            recalcNow()
        }
        ws.onConnect(onConnect)
        ws.ensureConnected()

        const onVisible = () => { if (document.visibilityState === 'visible') recalcNow() }
        const onFocus = () => recalcNow()
        const onOnline = () => recalcNow()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onFocus)
        window.addEventListener('online', onOnline)

        const startPoll = () => {
            if (pollId) return
            pollId = window.setInterval(() => {
                if (document.visibilityState === 'visible') recalcNow()
            }, 3000) as unknown as number
        }
        const stopPoll = () => { if (pollId) { clearInterval(pollId); pollId = null } }
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
    }, [userUuid, recalcNow, resubscribeRoomTopics, syncRooms])

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
