import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ws } from '@/ws'

/**
 * 페이지 진입 시:
 * - token 또는 userId 없으면 즉시 로그아웃(토큰 제거) + /login 이동
 * - 토큰/유저가 있으면 WS 연결을 보장하고, 짧게 기다렸다 여전히 끊겨있으면 로그아웃
 */
export function useSessionGuard(opts?: { graceMs?: number, loginPath?: string }) {
  const { token, userId, logout } = useAuth()
  const nav = useNavigate()
  const graceMs = opts?.graceMs ?? 1500
  const loginPath = opts?.loginPath ?? '/login'

  useEffect(() => {
    // 1) 신원 없음 → 즉시 로그아웃
    if (!token || !userId) {
      logout('no token or userId')
      nav(loginPath, { replace: true })
      return
    }

    // 2) 신원 있음 → 연결 보장 시도
    ws.ensureConnected()

    const t = window.setTimeout(() => {
      // 3) 유예 후에도 여전히 끊김 → 세션 이상으로 보고 로그아웃
      if (!ws.isConnected()) {
        logout('ws disconnected')
        nav(loginPath, { replace: true })
      }
    }, graceMs)

    return () => window.clearTimeout(t)
  }, [token, userId, logout, nav, graceMs, loginPath])
}
