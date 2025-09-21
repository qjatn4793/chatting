import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLoginIdFromToken } from '@/utils/jwt'

type AuthCtx = {
  token: string | null
  userId: string | null
  isAuthed: boolean
  login: (jwt: string) => void
  logout: (reason?: string) => void
}

const AuthContext = createContext<AuthCtx | null>(null)

const LS_TOKEN_KEY = 'jwt' // FriendsPage 등에서 이 키로 읽으므로 통일!

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const nav = useNavigate()

  const [token, setToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // 초기 부팅: localStorage에서 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(LS_TOKEN_KEY)
    if (saved) {
      setToken(saved)
      setUserId(getLoginIdFromToken(saved))
    }
  }, [])

  // 토큰 변경 시 userId 동기화
  useEffect(() => {
    setUserId(getLoginIdFromToken(token))
  }, [token])

  const login = useCallback((jwt: string) => {
    try { localStorage.setItem(LS_TOKEN_KEY, jwt) } catch {}
    setToken(jwt)
    setUserId(getLoginIdFromToken(jwt))
  }, [])

  const logout = useCallback((reason?: string) => {
    try { localStorage.removeItem(LS_TOKEN_KEY) } catch {}
    setToken(null)
    setUserId(null)
    // 필요하면 알림/세션 정리 이벤트도 여기서 발생
    nav('/auth', { replace: true, state: reason ? { reason } : undefined })
  }, [nav])

  const value = useMemo<AuthCtx>(() => ({
    token, userId, isAuthed: !!token, login, logout
  }), [token, userId, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthCtx => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
