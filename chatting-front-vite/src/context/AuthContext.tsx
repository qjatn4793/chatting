import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ws } from '@/ws'

type AuthCtx = {
  token: string | null
  userId: string | null
  login: (jwt: string, userId: string) => void
  logout: (reason?: string) => void
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('jwt'))
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem('userId'))

  // 토큰 변경 → WS와 동기화
  useEffect(() => {
    ws.setAuthToken(token)
    if (token) {
      ws.ensureConnected() // 토큰 있으면 연결 보장
    } else {
      ws.disconnect()
    }
  }, [token])

  const login = (jwt: string, uid: string) => {
    localStorage.setItem('jwt', jwt)
    localStorage.setItem('userId', uid)
    setToken(jwt)
    setUserId(uid)
  }

  const logout = (reason?: string) => {
    try { console.info('[logout]', reason ?? '') } catch {}
    localStorage.removeItem('jwt')
    localStorage.removeItem('userId')
    setToken(null)
    setUserId(null)
    ws.setAuthToken(null)
    ws.disconnect()
    // 라우팅은 각 페이지에서 처리(가드 훅이 네비게이션 담당)
  }

  const value = useMemo(() => ({ token, userId, login, logout }), [token, userId])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)!
