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
    const { isAuthed, login } = useAuth()

    // 이미 로그인 상태면 /friends 로
    useEffect(() => {
        if (isAuthed) {
            nav('/friends', { replace: true })
        }
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
        setErr('')
        setLoading(true)
        try {
            if (mode === 'register') {
                const msg = validateRegister()
                if (msg) throw new Error(msg)

                // 가입은 JSON으로만 전송 (프로필 업로드 없음 → 서버 기본 프로필 사용)
                await http.post('/auth/register', {
                    username: username.trim(),
                    email: email.trim() || null,
                    phoneNumber: phoneNumber.trim() || null,
                    password,
                    birthDate: birthDate || null,
                })
                // 가입 후 바로 로그인 UX: identifier 우선순위 (email > phone)
                const autoIdentifier = (email || phoneNumber).trim()
                setIdentifier(autoIdentifier)
                setMode('login')
            }

            // 로그인
            if (mode === 'login') {
                if (!identifier.trim()) throw new Error('이메일 또는 휴대폰 번호를 입력하세요.')
                if (!password) throw new Error('비밀번호를 입력하세요.')

                // 백엔드 규약에 맞춰 identifier + password 로 요청
                const { data } = await http.post('/auth/login', {
                    identifier: identifier.trim(),
                    password,
                })

                // 토큰 필드 대응(accessToken/refreshToken/jwt 등)
                const access =
                    (data as any)?.accessToken ??
                    (data as any)?.token ??
                    (data as any)?.jwt
                const refresh = (data as any)?.refreshToken ?? null

                if (!access) throw new Error('서버 응답에 accessToken이 없습니다.')

                // 컨텍스트 시그니처가 (access, refresh)를 지원하면 둘 다, 아니면 access만
                const anyLogin: any = login
                try {
                    if (typeof anyLogin === 'function' && anyLogin.length >= 2) {
                        anyLogin(access, refresh)
                    } else {
                        anyLogin(access)
                    }
                } catch {
                    // 타입이 단일 인자만 지원해도 문제 없이 동작하게 fallback
                    anyLogin(access)
                }

                const to = loc.state?.from?.pathname ?? '/friends'
                nav(to, { replace: true })
            }
        } catch (e: unknown) {
            const anyErr = e as any
            setErr(
                anyErr?.response?.data?.message ??
                (anyErr instanceof Error ? anyErr.message : '실패했습니다.')
            )
        } finally {
            setLoading(false)
        }
    }

    // 사용자가 치는 즉시 보기 좋게 yyyy-MM-dd 로 "부분 포맷"
    function formatBirthTyping(raw: string): string {
        const digits = raw.replace(/\D/g, '').slice(0, 8); // 숫자만 최대 8자리(yyyyMMdd)
        const y = digits.slice(0, 4);
        const m = digits.slice(4, 6);
        const d = digits.slice(6, 8);

        let out = y;
        if (m) out += '-' + m;
        if (d) out += '-' + d;
        return out;
    }

    // 포커스 아웃 시 최종 보정(1자리 월/일 → 2자리로 보정, 대충 숫자만 쳐도 교정)
    function normalizeBirthOnBlur(raw: string): string {
        const digits = raw.replace(/\D/g, '').slice(0, 8);
        if (digits.length === 0) return ''; // 빈값 허용
        const y = digits.slice(0, 4);
        let m = digits.slice(4, 6);
        let d = digits.slice(6, 8);

        // 자리수 보정(예: 1995-1-2 → 1995-01-02)
        if (m.length === 1) m = '0' + m;
        if (d.length === 1) d = '0' + d;

        // 간단한 유효범위 보정(선택): 01~12, 01~31 범위를 벗어나면 클램프
        const mi = Math.min(Math.max(parseInt(m || '1', 10), 1), 12);
        const di = Math.min(Math.max(parseInt(d || '1', 10), 1), 31);
        const mm = String(mi).padStart(2, '0');
        const dd = String(di).padStart(2, '0');

        return `${y}${m ? '-' + mm : ''}${d ? '-' + dd : ''}`;
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
                            // 로그인 → 가입 전환 시, identifier를 email/phone 초기값으로 깔아줄 수도 있지만
                            // 여기서는 모두 초기화
                            setIdentifier('')
                            setMode('register')
                        } else {
                            // 가입 → 로그인 전환 시, email/phone 중 하나를 identifier로 채워 UX 개선
                            const nextId = (email || phoneNumber || '').trim()
                            setIdentifier(nextId)
                            setMode('login')
                        }
                    }}
                >
                    {mode === 'login' ? '계정이 없어요' : '이미 계정이 있어요'}
                </button>
            </form>

            {/* UX 팁 */}
            {mode === 'register' && (
                <p className="auth__hint">
                    가입 시 프로필 사진은 기본 이미지로 설정됩니다. 나중에 내 정보에서 변경할 수 있어요.
                </p>
            )}
        </div>
    )
}
