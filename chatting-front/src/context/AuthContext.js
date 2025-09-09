import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// 안전한 최소한의 디코더 (검증 X, payload만 파싱)
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  // 초기 렌더 시 로컬스토리지에서 바로 읽어오면 깜빡임 없이 재로그인 유지
  const [jwtToken, setJwtToken] = useState(() => {
    const t = localStorage.getItem('jwtToken');
    if (!t) return null;
    const payload = parseJwt(t);
    if (payload?.exp && payload.exp * 1000 <= Date.now()) {
      // 만료된 토큰은 버림
      localStorage.removeItem('jwtToken');
      return null;
    }
    return t;
  });

  const login = (token) => {
    setJwtToken(token);
    localStorage.setItem('jwtToken', token);
  };

  const logout = () => {
    setJwtToken(null);
    localStorage.removeItem('jwtToken');
  };

  // 남은 만료 시간만큼 타이머 걸어 자동 로그아웃
  useEffect(() => {
    if (!jwtToken) return;
    const payload = parseJwt(jwtToken);
    if (!payload?.exp) return;
    const ms = payload.exp * 1000 - Date.now();
    if (ms <= 0) {
      logout();
      return;
    }
    const id = setTimeout(() => logout(), ms);
    return () => clearTimeout(id);
  }, [jwtToken]);

  const value = useMemo(() => ({ jwtToken, login, logout }), [jwtToken]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
