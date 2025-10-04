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

/** refresh 호출 */
async function refreshAccessToken(): Promise<string | null> {
    // 이미 진행 중이면 그걸 기다림
    if (refreshPromise) return refreshPromise

    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) return null

    // 같은 axios 인스턴스를 쓰면 인터셉터가 다시 타서 루프가 생길 수 있어
    // refresh 전용 임시 인스턴스를 사용
    const refreshClient = axios.create({
        baseURL: API_BASE_URL,
        withCredentials: false,
        headers: { 'Content-Type': 'application/json' },
    })

    refreshPromise = (async () => {
        try {
            // 백엔드 계약:
            //  - POST /auth/refresh
            //  - body: { refreshToken }
            //  - response: { accessToken, refreshToken? } (refresh 회전 시 새 refresh 도착 가능)
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
            // 다음 만료 이벤트를 위해 락 해제
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
    return axios.request(cloned)
}

const http = axios.create({
    baseURL: API_BASE_URL,
    // GET에 Content-Type을 강제로 넣으면 일부 서버/프록시에서 싫어하는 경우가 있어 공통 헤더는 비워두고,
    // 메서드별로 필요 시 세팅
    // headers: { },
})

/** 요청 인터셉터: Bearer 자동 부착 + 메서드별 Content-Type 지정 */
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(ACCESS_KEY)
    const anyHeaders = (config.headers ?? {}) as any

    if (token) {
        if (typeof anyHeaders.set === 'function') {
            anyHeaders.set('Authorization', `Bearer ${token}`)
        } else {
            anyHeaders['Authorization'] = `Bearer ${token}`
        }
    }

    // POST/PUT/PATCH일 때만 Content-Type 지정
    const method = (config.method || 'get').toLowerCase()
    if (['post', 'put', 'patch'].includes(method)) {
        if (typeof anyHeaders.set === 'function') {
            if (!anyHeaders.get?.('Content-Type')) anyHeaders.set('Content-Type', 'application/json')
        } else {
            if (!anyHeaders['Content-Type']) anyHeaders['Content-Type'] = 'application/json'
        }
    }

    // 일부 보안/프록시 친화용 헤더(옵션)
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
        // 네트워크 오류 등 response 자체가 없는 경우는 그대로 throw
        if (!error.response || !error.config) {
            return Promise.reject(error)
        }

        // 이미 refresh 재시도 후 실패한 요청을 또 돌지 않게 플래그
        const cfg = error.config as AxiosRequestConfig & { _retryByRefresh?: boolean }

        if (isAuthOrExpired(error) && !cfg._retryByRefresh) {
            // refresh 시도
            const newAccess = await refreshAccessToken()
            if (newAccess) {
                cfg._retryByRefresh = true
                try {
                    const res = await retryWithNewAccess(cfg, newAccess)
                    return res
                } catch (e) {
                    // 재시도 실패 → 아래로 떨어져 로그아웃 처리
                }
            }

            // refresh 실패 or 재시도 실패 → 글로벌 로그아웃 이벤트
            try { localStorage.removeItem(ACCESS_KEY) } catch {}
            // refresh 토큰도 더 이상 유효하지 않을 가능성이 크므로 제거
            try { localStorage.removeItem(REFRESH_KEY) } catch {}

            window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'session' } }))
            // 체인 중단 (이후 화면에서 리다이렉트/컨텍스트 정리)
            return new Promise<never>(() => {})
        }

        // 기타 에러는 그대로 throw
        return Promise.reject(error)
    }
)

export default http
