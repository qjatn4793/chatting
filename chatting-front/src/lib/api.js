import axios from 'axios';

export const API_BASE_URL = (
  process.env.REACT_APP_CHATTING_SERVER || 'http://localhost:8080'
).replace(/\/+$/, ''); // 혹시 모르는 끝 슬래시 제거

let onUnauthorized = null;
export function setOnUnauthorized(handler) { onUnauthorized = handler; }

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  // 필요하면 timeout 등 추가
});

// 매 요청에 토큰 자동 첨부
export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('token', token);
  } else {
    delete api.defaults.headers.common['Authorization'];
    localStorage.removeItem('token');
  }
}

// 응답 인터셉터: 세션 만료/강제 로그아웃 감지
api.interceptors.response.use(
  (res) => {
    const exp = res?.headers?.['x-session-expired'];
    if (exp === 'true' && onUnauthorized) onUnauthorized();
    return res;
  },
  (err) => {
    const exp = err?.response?.headers?.['x-session-expired'];
    const status = err?.response?.status;
    if ((exp === 'true' || status === 401) && onUnauthorized) onUnauthorized();
    return Promise.reject(err);
  }
);
