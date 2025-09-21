import React, { useEffect } from 'react'
import { ws } from '@/ws'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'

type Props = { children: React.ReactNode }

const RealtimeProvider: React.FC<Props> = ({ children }) => {
  const { token, userId, logout } = useAuth() as { token: string | null; userId?: string | null; logout: (r?: string)=>void }
  const { pushNotif } = useNotifications()

  useEffect(() => {
    if (!token) {
      ws.disconnect()
      return
    }
    ws.setAuthToken(token)
    ws.connect()

    const unsubKick = ws.subscribe('/user/queue/kick', () => {
      logout('다른 기기에서 로그인되어 현재 세션이 종료되었습니다.')
    })
    const unsubNotify = userId
      ? ws.subscribe(`/topic/chat-notify/${userId}`, (n) => {
          pushNotif(n)
        })
      : () => {}

    return () => {
      unsubKick()
      unsubNotify()
      // 전역 연결은 유지하고 싶으면 ws.disconnect()는 호출하지 않음
    }
  }, [token, userId, logout, pushNotif])

  return <>{children}</>
}

export default RealtimeProvider
