import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const RAW = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
export const API_BASE_URL = RAW.replace(/\/+$/, '')

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('jwt')
  if (token) {
    // AxiosHeaders 인스턴스 또는 일반 객체 모두 대응
    const anyHeaders = config.headers as any
    if (typeof anyHeaders?.set === 'function') {
      anyHeaders.set('Authorization', `Bearer ${token}`)
    } else {
      config.headers = { ...(config.headers as any), Authorization: `Bearer ${token}` } as any
    }
  }
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError<any>) => {
    const status  = error.response?.status
    const body    = error.response?.data as any
    const headers = (error.response?.headers || {}) as Record<string, string>

    const code = body?.code ?? body?.errorCode
    const isAuthError    = status === 401 || status === 403
    const isCustomExpiry = status === 419 || status === 440
    const isKickedCode   = ['SESSION_KICKED', 'TOKEN_EXPIRED', 'NEED_RELOGIN'].includes(code)
    const isKickedHeader =
      headers['x-session-state'] === 'kicked' || headers['x-token-state'] === 'expired'

    if (isAuthError || isCustomExpiry || isKickedCode || isKickedHeader) {
      window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'session' } }))
      return new Promise<never>(() => {}) // 체인 중단
    }
    return Promise.reject(error)
  }
)

export default http