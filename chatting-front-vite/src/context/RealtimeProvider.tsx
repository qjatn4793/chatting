// src/context/RealtimeProvider.tsx
import React, { useEffect, useRef } from 'react'
import { Client, type StompSubscription } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useAuth } from '@/context/AuthContext'
import { API_BASE_URL } from '@/api/http'
import { useNotifications } from '@/hooks/useNotifications'

const SOCK_PATH = import.meta.env.VITE_SOCKJS_PATH || '/ws'

type Props = { children: React.ReactNode }
type AuthLike = {
  token: string | null
  userId?: string | null
  logout: (reason?: string) => void
}

// React.FC 사용: 반환타입은 ReactElement | null 로 안전
const RealtimeProvider: React.FC<Props> = ({ children }) => {
  const { token, userId, logout } = useAuth() as AuthLike

  // useNotifications()의 반환을 unknown으로 먼저 캐스팅 → 안전하게 좁히기
  const notifUnsafe = useNotifications() as unknown as { pushNotif?: (n: any) => void } | null
  const pushNotif = notifUnsafe?.pushNotif

  const clientRef = useRef<Client | null>(null)
  const subsRef = useRef<StompSubscription[]>([])

  useEffect(() => {
    // 토큰 없으면 연결 해제
    if (!token) {
      subsRef.current.forEach(s => { try { s?.unsubscribe() } catch {} })
      subsRef.current = []
      if (clientRef.current?.active) clientRef.current.deactivate()
      clientRef.current = null
      return
    }

    // 알림 권한 요청(최초 1회)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const client = new Client({
      webSocketFactory: () => new SockJS(SOCK_PATH),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {},
    })

    client.onConnect = () => {
      // 세션 킥 알림
      const subKick = client.subscribe('/user/queue/kick', () => {
        logout('다른 기기에서 로그인되어 현재 세션이 종료되었습니다.')
      })

      // 새 메시지 알림
      let subNotify: StompSubscription | undefined
      if (userId) {
        subNotify = client.subscribe(`/topic/chat-notify/${userId}`, (frame) => {
          try {
            const n = JSON.parse(frame.body) // { roomId, sender, preview, ts }
            pushNotif?.(n)
          } catch {
            pushNotif?.({ preview: String(frame.body), ts: Date.now() })
          }
        })
      }

      subsRef.current = [subKick, ...(subNotify ? [subNotify] : [])]
    }

    client.activate()
    clientRef.current = client

    return () => {
      subsRef.current.forEach(s => { try { s?.unsubscribe() } catch {} })
      subsRef.current = []
      if (client.active) client.deactivate()
      clientRef.current = null
    }
  }, [token, userId, logout, pushNotif])

  // 항상 ReactElement 반환 (children이 boolean이어도 Fragment가 감싸서 OK)
  return <>{children}</>
}

export default RealtimeProvider