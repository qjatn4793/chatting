import axios from 'axios';

const BASE = (process.env.REACT_APP_CHATTING_SERVER || 'http://localhost:8080').replace(/\/+$/, '');
const http = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터: 세션 이상 신호 즉시 로그아웃
http.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const code   = error?.response?.data?.code || error?.response?.data?.errorCode;
    const headers = error?.response?.headers || {};

    const isAuthError     = status === 401 || status === 403;
    const isCustomExpiry  = status === 419 || status === 440; // 서버에서 쓰면 커버
    const isKickedCode    = ['SESSION_KICKED', 'TOKEN_EXPIRED', 'NEED_RELOGIN'].includes(code);
    const isKickedHeader  =
      headers['x-session-state'] === 'kicked' || headers['x-token-state'] === 'expired';

    if (isAuthError || isCustomExpiry || isKickedCode || isKickedHeader) {
      window.dispatchEvent(
        new CustomEvent('auth:logout', { detail: { reason: '세션 만료/중복 로그인' } })
      );
      return new Promise(() => {}); // 체인 끊기(중복 처리 방지)
    }
    return Promise.reject(error);
  }
);

export default http;
export { BASE as API_BASE_URL };
