import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import http from '@/api/http'
import { useAuth } from '@/context/AuthContext'
import '@/styles/auth.css'

type LocationState = { from?: { pathname: string } } | null

export default function AuthForm(): JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [err, setErr] = useState<string>('')

  const nav = useNavigate()
  const loc = useLocation() as ReturnType<typeof useLocation> & { state: LocationState }
  const { isAuthed, login } = useAuth()

  // 이미 로그인 상태면 /friends 로
  useEffect(() => {
    if (isAuthed) {
      nav('/friends', { replace: true })
    }
  }, [isAuthed, nav])

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErr('')
    try {
      // http의 baseURL이 이미 /api 라면, 여기서 다시 /api 붙이면 /api/api/...가 됩니다.
      // 따라서 엔드포인트는 '/auth/login' 같이 작성하세요.
      if (mode === 'register') {
        await http.post('/auth/register', { username, password })
      }
      const { data } = await http.post('/auth/login', { username, password })
      const token = (data as any)?.token ?? (data as any)?.accessToken ?? (data as any)?.jwt
      if (!token) throw new Error('서버 응답에 토큰이 없습니다.')

      login(token) // 컨텍스트에 설정 → 가드 통과

      // 로그인 전 이동하려던 곳이 있으면 그쪽으로, 없으면 /friends
      const to = loc.state?.from?.pathname ?? '/friends'
      nav(to, { replace: true })
    } catch (e: unknown) {
      const anyErr = e as any
      setErr(
        anyErr?.response?.data?.message ??
          (anyErr instanceof Error ? anyErr.message : '실패했습니다.')
      )
    }
  }

  return (
    <div className="auth">
      <form onSubmit={submit}>
        <h2>{mode === 'login' ? '로그인' : '회원가입'}</h2>

        <input
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />

        <input
          placeholder="비밀번호"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />

        <button type="submit">{mode === 'login' ? '로그인' : '가입'}</button>

        {err && <p className="error">{err}</p>}

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '계정이 없어요' : '이미 계정이 있어요'}
        </button>
      </form>
    </div>
  )
}