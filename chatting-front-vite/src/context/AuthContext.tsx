import React, { createContext, useContext, useMemo, useState } from 'react'

type AuthCtx = {
  token: string | null
  isAuthed: boolean
  login: (jwt: string) => void
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('jwt'))
  const isAuthed = !!token

  const login = (jwt: string) => {
    setToken(jwt)
    localStorage.setItem('jwt', jwt)
  }

  const logout = () => {
    setToken(null)
    localStorage.removeItem('jwt')
  }

  const value = useMemo(() => ({ token, isAuthed, login, logout }), [token, isAuthed])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within <AuthProvider> (inside a <Router>)')
  return v
}
