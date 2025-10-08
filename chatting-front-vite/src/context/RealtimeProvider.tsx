// src/context/RealtimeProvider.tsx
import React, { useEffect, useMemo } from 'react'
import { ws } from '@/lib/ws'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { useToast } from '@/pages/toast/Toast'
import { useNavigate } from 'react-router-dom'
import {
    bump as blinkBump,
    reset as blinkReset,
    setBaseTitle as blinkSetBaseTitle,
} from '@/lib/tabBlinker'
import { notifyCritical, stopAttention } from '@/lib/nativeNotify'

type AnyPayload = Record<string, any>

// ===== 유틸 =====
const toMillis = (t: unknown): number => {
    if (t == null) return Date.now()
    if (typeof t === 'number' && Number.isFinite(t)) return t
    const n = Number(t)
    if (Number.isFinite(n)) return n
    const d = new Date(String(t))
    return Number.isFinite(d.getTime()) ? d.getTime() : Date.now()
}
const fmtHHMM = (t: unknown): string => {
    const d = new Date(toMillis(t))
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
}
const snippet = (s: unknown, n = 90) => {
    const str = (s ?? '') + ''
    return str.length > n ? str.slice(0, n) + '…' : str
}
const sameId = (a?: string | number | null, b?: string | number | null) => {
    if (a == null || b == null) return false
    const sa = String(a).trim().toLowerCase()
    const sb = String(b).trim().toLowerCase()
    return sa !== '' && sb !== '' && sa === sb
}

// ===== 컴포넌트 =====
type Props = { children: React.ReactNode }

const RealtimeProvider: React.FC<Props> = ({ children }) => {
    const navigate = useNavigate()

    const { token, userId, logout } = useAuth() as {
        token: string | null
        userId?: string | null
        logout: (r?: string) => void
    }

    const { pushNotif, getActiveRoom, getAtBottom } = useNotifications() as {
        pushNotif: (p: AnyPayload) => void
        getActiveRoom: () => string | undefined
        getAtBottom: () => boolean
    }

    const toast = useToast()

    // 나 자신 식별 후보 키
    const myKeys = useMemo(() => {
        return [userId].filter(Boolean).map(String) as string[]
    }, [userId])

    // 베이스 문서 제목 고정 (앱 전역 타이틀)
    useEffect(() => {
        blinkSetBaseTitle('Chatting Front')
    }, [])

    useEffect(() => {
        if (!token) {
            ws.disconnect()
            return
        }

        ws.setAuthToken(token)
        ws.connect()

        // 강제 로그아웃
        const unsubKick = ws.subscribe('/user/queue/kick', () => {
            logout('다른 기기에서 로그인되어 현재 세션이 종료되었습니다.')
        })

        // 전역 알림
        const unsubNotify =
            userId
                ? ws.subscribe(`/topic/chat-notify/${userId}`, (payload: AnyPayload) => {
                    // 1) 알림/언리드 처리
                    try {
                        pushNotif?.(payload)
                    } catch {}

                    // 2) 필드 파싱
                    const type = String(payload?.type ?? '').toUpperCase()
                    const roomId = String(payload?.roomId ?? payload?.room_id ?? payload?.room ?? '')
                    const senderUid = payload?.senderUserId ?? payload?.sender ?? payload?.userId
                    const username =
                        payload?.username ??
                        payload?.senderUsername ??
                        payload?.email ??
                        payload?.from ??
                        ''

                    const content =
                        payload?.content ??
                        payload?.preview ??
                        payload?.message ??
                        payload?.text ??
                        ''

                    const createdAt = payload?.createdAt ?? payload?.time ?? Date.now()

                    // 3) 내 메시지는 제외
                    const mine = myKeys.some(k => sameId(k, senderUid))
                    if (mine) return

                    // 4) 활성 방/바닥 여부
                    const activeRoomId = getActiveRoom?.()
                    const isActiveRoom = !!activeRoomId && roomId && String(activeRoomId) === String(roomId)
                    const atBottom = getAtBottom?.()
                    const isTabHidden = document.hidden

                    // 탭이 가려져 있거나, 활성 방인데 바닥이 아니면 제목 깜빡임
                    if (isTabHidden || (isActiveRoom && !atBottom)) {
                        blinkBump(1)
                    }

                    // 활성 방이 아니고, 포커스/가시화가 아니면 OS 작업표시줄 주의요청
                    const hidden = document.visibilityState === 'hidden' || !document.hasFocus()
                    if (!isActiveRoom && hidden) {
                        notifyCritical()
                    }

                    // 5) 토스트
                    if (type === 'MESSAGE' || content) {
                        const title = username || (roomId ? `Room ${roomId}` : '새 메시지')
                        const msg = snippet(content, 90)
                        const time = fmtHHMM(createdAt)
                        toast.show({
                            title,
                            message: msg,
                            timeText: time,
                            duration: 3800,
                            onClick: roomId ? () => navigate(`/chat/${roomId}`) : undefined,
                        })
                    }
                })
                : () => {}

        // 포커스/가시화 시 바닥이면 제목 깜빡임 해제
        const clearIfVisibleAndBottom = () => {
            if (!document.hidden && getAtBottom?.()) {
                blinkReset()
            }
        }
        window.addEventListener('focus', clearIfVisibleAndBottom, { passive: true } as any)
        document.addEventListener('visibilitychange', clearIfVisibleAndBottom, { passive: true } as any)

        return () => {
            unsubKick()
            unsubNotify()
        }
    }, [token, userId, logout, pushNotif, toast, myKeys, getActiveRoom, getAtBottom, navigate])

    // 창이 다시 보이거나 포커스되면 네이티브 주의중지
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible') stopAttention()
        }
        const onFocus = () => stopAttention()
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVis)
        return () => {
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVis)
        }
    }, [])

    return <>{children}</>
}

export default RealtimeProvider
