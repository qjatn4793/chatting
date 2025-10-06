import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUserUuidFromToken, getEmailFromToken, getNameFromToken } from '@/lib/jwt'
import { ws } from '@/lib/ws'

type AuthCtx = {
    token: string | null
    userId: string | null          // ✅ 과거 호환(실제 식별자: UUID)
    userUuid: string | null        // ✅ 명시적 필드 (동일값, 점진적 전환용)
    email: string | null           // ✅ 화면 표시에 사용할 이메일
    name: string | null            // (옵션) 표시명
    isAuthed: boolean
    login: (jwt: string) => void
    logout: (reason?: string) => void
}

const AuthContext = createContext<AuthCtx | null>(null)

const LS_TOKEN_KEY = 'jwt' // 유지

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const nav = useNavigate()

    const [token, setToken] = useState<string | null>(null)
    const [userUuid, setUserUuid] = useState<string | null>(null)
    const [email, setEmail] = useState<string | null>(null)
    const [name, setName] = useState<string | null>(null)

    // 초기 부팅: localStorage에서 불러오기
    useEffect(() => {
        const saved = localStorage.getItem(LS_TOKEN_KEY)
        if (saved) {
            setToken(saved)
            setUserUuid(getUserUuidFromToken(saved))
            setEmail(getEmailFromToken(saved))
            setName(getNameFromToken(saved))
        }
    }, [])

    // 토큰 변경 시 클레임 동기화
    useEffect(() => {
        setUserUuid(getUserUuidFromToken(token))
        setEmail(getEmailFromToken(token))
        setName(getNameFromToken(token))
    }, [token])

    const login = useCallback((jwt: string) => {
        try { localStorage.setItem(LS_TOKEN_KEY, jwt) } catch {}
        setToken(jwt)
        setUserUuid(getUserUuidFromToken(jwt))
        setEmail(getEmailFromToken(jwt))
        setName(getNameFromToken(jwt))
    }, [])

    const logout = useCallback((reason?: string) => {
        try { localStorage.removeItem(LS_TOKEN_KEY) } catch {}
        setToken(null)
        setUserUuid(null)
        setEmail(null)
        setName(null)
        ws.disconnect()
        nav('/auth', { replace: true, state: reason ? { reason } : undefined })
    }, [nav])

    // 과거 호환: userId는 내부적으로 userUuid를 그대로 노출
    const userId = userUuid

    const value = useMemo<AuthCtx>(() => ({
        token,
        userId,
        userUuid,
        email,
        name,
        isAuthed: !!token,
        login,
        logout
    }), [token, userId, userUuid, email, name, login, logout])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthCtx => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
    return ctx
}
