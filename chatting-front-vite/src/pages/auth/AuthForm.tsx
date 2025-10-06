import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import http from '@/api/http'
import { useAuth } from '@/context/AuthContext'
import '@/styles/auth.css'

type LocationState = { from?: { pathname: string } } | null

export default function AuthForm(): JSX.Element {
    // 공통
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [err, setErr] = useState<string>('')
    const [loading, setLoading] = useState(false)

    // 로그인 필드
    const [identifier, setIdentifier] = useState('') // email 또는 phone(+82...)
    const [password, setPassword] = useState('')

    // 가입 필드
    const [username, setUsername] = useState('')          // 실명
    const [email, setEmail] = useState('')                // 선택
    const [phoneNumber, setPhoneNumber] = useState('')    // 선택 (E.164 권장: +8210...)
    const [birthDate, setBirthDate] = useState('')        // YYYY-MM-DD

    const nav = useNavigate()
    const loc = useLocation() as ReturnType<typeof useLocation> & { state: LocationState }
    const { isAuthed, login } = useAuth() as any

    // 이미 로그인 상태면 /friends 로
    useEffect(() => {
        if (isAuthed) nav('/friends', { replace: true })
    }, [isAuthed, nav])

    const validateRegister = () => {
        if (!username.trim()) return '이름을 입력하세요.'
        if (!email.trim() && !phoneNumber.trim()) return '이메일 또는 휴대폰 번호 중 하나는 필수입니다.'
        if (!password || password.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
        if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return '생년월일 형식은 YYYY-MM-DD 입니다.'
        return ''
    }

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (loading) return
        setErr('')
        setLoading(true)

        const ac = new AbortController()
        const timeoutId = window.setTimeout(() => ac.abort(), 15000)

        try {
            if (mode === 'register') {
                const msg = validateRegister()
                if (msg) throw new Error(msg)

                await http.post('/auth/register', {
                    username: username.trim(),
                    email: email.trim() || null,
                    phoneNumber: phoneNumber.trim() || null,
                    password,
                    birthDate: birthDate || null,
                }, { signal: ac.signal, headers: { 'X-Skip-Auth': '1' } })

                // 가입 후 바로 로그인 UX
                const autoIdentifier = (email || phoneNumber).trim()
                setIdentifier(autoIdentifier)
                setMode('login')
            }

            if (mode === 'login') {
                if (!identifier.trim()) throw new Error('이메일 또는 휴대폰 번호를 입력하세요.')
                if (!password) throw new Error('비밀번호를 입력하세요.')

                const { data } = await http.post('/auth/login', {
                    identifier: identifier.trim(),
                    password,
                }, { signal: ac.signal, headers: { 'X-Skip-Auth': '1' } })

                const access = (data as any)?.accessToken ?? (data as any)?.token ?? (data as any)?.jwt
                const refresh = (data as any)?.refreshToken ?? null
                if (!access) throw new Error('서버 응답에 accessToken이 없습니다.')

                const anyLogin: any = login
                try { (typeof anyLogin === 'function' && anyLogin.length >= 2) ? anyLogin(access, refresh) : anyLogin(access) }
                catch { anyLogin(access) }

                const to = loc.state?.from?.pathname ?? '/friends'
                nav(to, { replace: true })
            }
        } catch (e: unknown) {
            if ((e as any)?.name === 'AbortError') {
                setErr('요청이 시간 초과되었습니다. 네트워크를 확인해 주세요.')
            } else {
                const r = (e as any)?.response
                const m = r?.data?.message || r?.data?.error || (e as any)?.message || '실패했습니다.'
                setErr(String(m))
            }
        } finally {
            window.clearTimeout(timeoutId)
            setLoading(false)
        }
    }

    // 사용자가 치는 즉시 yyyy-MM-dd 로 부분 포맷
    function formatBirthTyping(raw: string): string {
        const digits = raw.replace(/\D/g, '').slice(0, 8)
        const y = digits.slice(0, 4)
        const m = digits.slice(4, 6)
        const d = digits.slice(6, 8)
        let out = y
        if (m) out += '-' + m
        if (d) out += '-' + d
        return out
    }

    // 포커스 아웃 시 최종 보정
    function normalizeBirthOnBlur(raw: string): string {
        const digits = raw.replace(/\D/g, '').slice(0, 8)
        if (digits.length === 0) return ''
        const y = digits.slice(0, 4)
        let m = digits.slice(4, 6)
        let d = digits.slice(6, 8)
        if (m.length === 1) m = '0' + m
        if (d.length === 1) d = '0' + d
        const mi = Math.min(Math.max(parseInt(m || '1', 10), 1), 12)
        const di = Math.min(Math.max(parseInt(d || '1', 10), 1), 31)
        const mm = String(mi).padStart(2, '0')
        const dd = String(di).padStart(2, '0')
        return `${y}${m ? '-' + mm : ''}${d ? '-' + dd : ''}`
    }

    return (
        <div className="auth">
            <form onSubmit={submit} className={`auth__form auth__form--${mode}`}>
                <h2>{mode === 'login' ? '로그인' : '회원가입'}</h2>

                {mode === 'login' ? (
                    <>
                        <input
                            placeholder="이메일 또는 휴대폰 번호"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            autoComplete="username"
                            inputMode="email"
                        />
                        <input
                            placeholder="비밀번호"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                    </>
                ) : (
                    <>
                        <input
                            placeholder="이름(실명)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="name"
                        />
                        <input
                            placeholder="이메일"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            inputMode="email"
                        />
                        <input
                            placeholder="휴대폰 번호(선택, +82 포함 권장)"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            autoComplete="tel"
                            inputMode="tel"
                        />
                        <input
                            placeholder="생년월일 (YYYY-MM-DD, 선택)"
                            value={birthDate}
                            onChange={(e) => setBirthDate(formatBirthTyping(e.target.value))}
                            onBlur={() => setBirthDate((v) => normalizeBirthOnBlur(v))}
                            type="text"
                            inputMode="numeric"
                        />
                        <input
                            placeholder="비밀번호(8자 이상)"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                    </>
                )}

                <button type="submit" disabled={loading}>
                    {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입'}
                </button>

                {err && <p className="error">{err}</p>}

                <button
                    type="button"
                    className="linklike"
                    onClick={() => {
                        setErr('')
                        setPassword('')
                        if (mode === 'login') {
                            setIdentifier('')
                            setMode('register')
                        } else {
                            const nextId = (email || phoneNumber || '').trim()
                            setIdentifier(nextId)
                            setMode('login')
                        }
                    }}
                >
                    {mode === 'login' ? '계정이 없어요' : '이미 계정이 있어요'}
                </button>
            </form>

            {mode === 'register' && (
                <p className="auth__hint">
                    가입 시 프로필 사진은 기본 이미지로 설정됩니다. 나중에 내 정보에서 변경할 수 있어요.
                </p>
            )}
        </div>
    )
}
