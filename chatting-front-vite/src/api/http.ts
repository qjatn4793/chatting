import axios, { AxiosError, InternalAxiosRequestConfig, AxiosRequestConfig, AxiosResponse } from 'axios'

/**
 * API base URL 결정
 *  - 환경변수(VITE_API_BASE)가 있으면 그걸 쓰고, 없으면 '/api'로 통일
 *  - 말미 슬래시 제거 및 '/api' 중복 방지
 */
const RAW = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
export const API_BASE_URL = RAW.replace(/\/+$/, '') || '/api'

/** 로컬스토리지 키 통일 */
const ACCESS_KEY  = 'jwt'
const REFRESH_KEY = 'refresh_jwt'

/** 동시 만료에 대한 refresh de-dup을 위한 락 */
let refreshPromise: Promise<string | null> | null = null

/** /auth 경로 여부 */
const isAuthPath = (url?: string) => !!url && /(^|\/)auth(\/|$)/.test(url)

/** refresh 호출 */
async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromise) return refreshPromise

    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) return null

    // refresh 전용 임시 인스턴스(인터셉터 비적용)
    const refreshClient = axios.create({
        baseURL: API_BASE_URL,
        withCredentials: false,
        headers: { 'Content-Type': 'application/json' },
    })

    refreshPromise = (async () => {
        try {
            // 계약: POST /auth/refresh { refreshToken } → { accessToken, refreshToken? }
            const { data } = await refreshClient.post('/auth/refresh', { refreshToken })
            const newAccess  = (data as any)?.accessToken ?? (data as any)?.token ?? null
            const newRefresh = (data as any)?.refreshToken ?? null

            if (!newAccess) return null

            try { localStorage.setItem(ACCESS_KEY, newAccess) } catch {}
            if (newRefresh) {
                try { localStorage.setItem(REFRESH_KEY, newRefresh) } catch {}
            }
            return newAccess
        } catch {
            return null
        } finally {
            refreshPromise = null
        }
    })()

    return refreshPromise
}

/** 원 요청 재시도 (헤더만 새 access로 바꿔 재요청) */
async function retryWithNewAccess(originalConfig: AxiosRequestConfig, newAccess: string): Promise<AxiosResponse> {
    const cloned: AxiosRequestConfig = {
        ...originalConfig,
        headers: { ...(originalConfig.headers as any), Authorization: `Bearer ${newAccess}` },
    }
    // 동일 인스턴스 사용: baseURL/기본 설정 유지
    return http.request(cloned)
}

const http = axios.create({
    baseURL: API_BASE_URL,
})

/** 요청 인터셉터: Bearer 자동 부착 + 메서드별 Content-Type 지정 */
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(ACCESS_KEY)
    const anyHeaders = (config.headers ?? {}) as any

    // /auth/** 요청에도 Authorization을 보내도 문제는 없지만, 원하시면 아래 if로 제외 가능:
    // if (!isAuthPath(config.url)) { ... }
    if (token) {
        if (typeof anyHeaders.set === 'function') {
            anyHeaders.set('Authorization', `Bearer ${token}`)
        } else {
            anyHeaders['Authorization'] = `Bearer ${token}`
        }
    }

    const method = (config.method || 'get').toLowerCase()
    if (['post', 'put', 'patch'].includes(method)) {
        if (typeof anyHeaders.set === 'function') {
            if (!anyHeaders.get?.('Content-Type')) anyHeaders.set('Content-Type', 'application/json')
        } else {
            if (!anyHeaders['Content-Type']) anyHeaders['Content-Type'] = 'application/json'
        }
    }

    if (typeof anyHeaders.set === 'function') {
        anyHeaders.set('X-Requested-With', 'XMLHttpRequest')
    } else {
        anyHeaders['X-Requested-With'] = 'XMLHttpRequest'
    }

    config.headers = anyHeaders
    return config
})

/** 만료/키킥 판별 유틸 */
function isAuthOrExpired(error: AxiosError<any>): boolean {
    const status  = error.response?.status
    const body    = error.response?.data as any
    const headers = (error.response?.headers || {}) as Record<string, string>

    const code = body?.code ?? body?.errorCode

    const isAuthError    = status === 401 || status === 403
    const isCustomExpiry = status === 419 || status === 440
    const isKickedCode   = ['SESSION_KICKED', 'TOKEN_EXPIRED', 'NEED_RELOGIN'].includes(code)
    const isKickedHeader =
        headers['x-session-state'] === 'kicked' || headers['x-token-state'] === 'expired' || headers['x-session-expired'] === 'true'

    return !!(isAuthError || isCustomExpiry || isKickedCode || isKickedHeader)
}

http.interceptors.response.use(
    (res) => res,
    async (error: AxiosError<any>) => {
        if (!error.response || !error.config) {
            return Promise.reject(error)
        }

        const cfg = error.config as AxiosRequestConfig & { _retryByRefresh?: boolean }
        const skipByHeader = (cfg.headers as any)?.['X-Skip-Auth'] === '1'
        const skipByPath   = isAuthPath(cfg.url)

        // 1) /auth/** 요청 또는 Skip 지시가 있으면 refresh/로그아웃 스킵 → 즉시 reject
        if (skipByHeader || skipByPath) {
            return Promise.reject(error)
        }

        // 2) 인증/만료 관련 응답이면 refresh 시도
        if (isAuthOrExpired(error) && !cfg._retryByRefresh) {
            const newAccess = await refreshAccessToken()
            if (newAccess) {
                cfg._retryByRefresh = true
                try {
                    const res = await retryWithNewAccess(cfg, newAccess)
                    return res
                } catch {
                    // fallthrough
                }
            }

            // refresh 실패 또는 재시도 실패 → 토큰 제거 + 로그아웃 이벤트
            try { localStorage.removeItem(ACCESS_KEY) } catch {}
            try { localStorage.removeItem(REFRESH_KEY) } catch {}
            window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'session' } }))

            // 이전엔 Promise.pending으로 두어 UI가 멈췄음 → 이제는 reject 해서 호출 측에서 처리/로딩 해제 가능
            return Promise.reject(error)
        }

        // 3) 기타 에러는 그대로 throw
        return Promise.reject(error)
    }
)

export default http
