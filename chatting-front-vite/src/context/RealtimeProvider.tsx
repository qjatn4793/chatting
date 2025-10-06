// src/context/RealtimeProvider.tsx
import React, { useEffect, useMemo } from 'react'
import { ws } from '@/lib/ws'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { useToast } from '@/pages/toast/Toast'
import { useNavigate } from 'react-router-dom'

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
    const { pushNotif, getActiveRoom } = useNotifications() as {
        pushNotif: (p: AnyPayload) => void
        getActiveRoom: () => string | undefined
    }
    const toast = useToast()

    // 나 자신 식별 후보 키 (백엔드가 senderUserId=UUID 를 보냄)
    const myKeys = useMemo(() => {
        return [userId].filter(Boolean).map(String) as string[]
    }, [userId])

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

        // 전역 알림 (백엔드 ChatNotify 규격과 일치하도록 파싱)
        const unsubNotify = userId
            ? ws.subscribe(`/topic/chat-notify/${userId}`, (payload: AnyPayload) => {
                // 1) 알림 스토어에 먼저 전달(미리보기/언리드 반영)
                try { pushNotif?.(payload) } catch {}

                // 2) 필드 파싱 (백엔드 규격 우선 → 과거 키 fallback)
                const type      = String(payload?.type ?? '').toUpperCase()
                const roomId    = String(payload?.roomId ?? payload?.room_id ?? payload?.room ?? '')
                const senderUid = payload?.senderUserId ?? payload?.sender ?? payload?.userId
                const username  = payload?.username
                    ?? payload?.senderUsername
                    ?? payload?.email
                    ?? payload?.from
                    ?? '' // 표시용

                // 내용: content → preview → 기타 텍스트 계열
                const content   = payload?.content
                    ?? payload?.preview
                    ?? payload?.message
                    ?? payload?.text
                    ?? ''

                const createdAt = payload?.createdAt ?? payload?.time ?? Date.now()

                // 3) 내 메시지 제외
                const mine = myKeys.some(k => sameId(k, senderUid))
                if (mine) return

                // 4) 활성 방이면 토스트 생략
                const active = getActiveRoom?.()
                if (active && roomId && String(active) === String(roomId)) return

                // 5) 표시 조건: MESSAGE 이거나, 내용(preview 포함)이 있으면 토스트
                if (type === 'MESSAGE' || content) {
                    const title = username || (roomId ? `Room ${roomId}` : '새 메시지')
                    const msg   = snippet(content, 90)
                    const time  = fmtHHMM(createdAt)

                    // (선택) 같은 방 알림은 하나만 유지하고 싶다면 id를 고정하세요:
                    // id: `room:${roomId}`,
                    toast.show({
                        // username 필드를 Toast로 넘기고 싶다면 ToastItem에 username 추가한 버전 사용
                        // id: `user:${username}`, // ← 사용자 단위로 하나만 유지하고 싶으면
                        title,
                        message: msg,
                        timeText: time,
                        duration: 3800,
                        onClick: roomId ? () => navigate(`/chat/${roomId}`) : undefined,
                    })
                }
            })
            : () => {}

        return () => {
            unsubKick()
            unsubNotify()
            // 전역 연결 유지 목적이면 disconnect 호출하지 않음
        }
    }, [token, userId, logout, pushNotif, toast, myKeys, getActiveRoom, navigate])

    return <>{children}</>
}

export default RealtimeProvider
