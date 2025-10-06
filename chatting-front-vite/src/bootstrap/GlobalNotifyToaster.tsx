// src/bootstrap/GlobalNotifyToaster.tsx
import React, { useEffect, useMemo, useRef } from 'react'
import { ws } from '@/lib/ws'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/pages/toast/Toast'
import { eqId, toStr } from '@/lib/identity'

type AnyPayload = Record<string, any>

const toMillis = (t: unknown): number => {
    if (t == null) return Date.now()
    if (typeof t === 'number') return Number.isFinite(t) ? t : Date.now()
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
const snippet = (s: unknown, n = 80) => {
    const str = (s ?? '') + ''
    return str.length > n ? str.slice(0, n) + '…' : str
}

/**
 * 전역 메시지→토스트 브리지.
 * - 유저 전용 토픽(여러 후보) 1회 구독
 * - MESSAGE/UNREAD_INC 등 다양한 페이로드를 관대하게 수용
 * - 내가 보낸 메시지는 기본적으로 토스트 제외(원하면 아래 조건 바꾸면 됨)
 */
export default function GlobalNotifyToaster(): JSX.Element | null {
    const { userUuid, email } = useAuth() as { userUuid?: string | null; email?: string | null }
    const toast = useToast()

    const myKeys = useMemo(() => {
        const arr = [toStr(userUuid), toStr(email)].filter(Boolean) as string[]
        return arr
    }, [userUuid, email])

    // 중복 구독 방지용
    const unsubRef = useRef<Array<() => void>>([])

    useEffect(() => {
        // 로그인 정보 없으면 아무 것도 안 함
        if (!userUuid && !email) return

        // 기존 구독 해제
        unsubRef.current.forEach(fn => fn())
        unsubRef.current = []

        // 후보 토픽들(백엔드 환경에 맞춰 필요 시 조정/추가)
        const uid = toStr(userUuid)
        const em = toStr(email)
        const candidates = [
            uid ? `/topic/chat-notify/${uid}` : null,
            uid ? `/user/${uid}/queue/notify` : null,
            uid ? `/topic/messages/${uid}` : null,
            em  ? `/topic/chat-notify/${em}` : null,
            em  ? `/topic/messages/${em}` : null,
        ].filter(Boolean) as string[]

        const subscribeOne = (dest: string) => {
            try {
                const off = ws.subscribe(dest, (payload: AnyPayload) => {
                    // payload 예시(유연 수용):
                    // { type:'MESSAGE', roomId, content, sender, username, createdAt, ... }
                    // { type:'UNREAD_INC', roomId, delta, preview, sender, createdAt, ... }
                    const type = (payload?.type ?? '').toString().toUpperCase()

                    // 메시지 텍스트/보낸 사람/시각 후보를 관대하게 추출
                    const content = payload?.content ?? payload?.message ?? payload?.text ?? payload?.preview ?? ''
                    const sender  = payload?.senderUsername ?? payload?.username ?? payload?.sender ?? payload?.from ?? ''
                    const createdAt = payload?.createdAt ?? payload?.time ?? Date.now()

                    // 내가 보낸 건 토스트 제외(원하면 이 조건 제거)
                    const mine = myKeys.some(k => k && (eqId(k, sender) || eqId(k, payload?.senderUserId || payload?.userId)))
                    if (mine) return

                    // 토스트 타이틀/본문/시간
                    const title = sender ? `${sender}` : (payload?.roomId ? `Room ${payload.roomId}` : '새 메시지')
                    const message = snippet(content, 90)
                    const timeText = fmtHHMM(createdAt)

                    // MESSAGE 계열이 아니더라도 preview가 있으면 보여주자
                    if (type === 'MESSAGE' || content) {
                        toast.show({ title, message, timeText, duration: 3800 })
                    }
                })
                unsubRef.current.push(off)
            } catch { /* ignore */ }
        }

        // 연결 상태 이벤트 묶기
        const ensure = () => ws.ensureConnected()
        ws.onConnect(ensure); ws.onDisconnect(() => {}); ensure()

        // 구독 등록
        candidates.forEach(subscribeOne)

        // 클린업
        return () => {
            unsubRef.current.forEach(fn => fn())
            unsubRef.current = []
            ws.offConnect(ensure)
        }
    }, [userUuid, email, myKeys, toast])

    return null
}
