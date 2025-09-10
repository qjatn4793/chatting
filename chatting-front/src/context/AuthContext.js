import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { api, setAuthToken, setOnUnauthorized } from '../lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem('token');
    try { return t ? jwtDecode(t)?.sub || null : null; } catch { return null; }
  });

  // 초기에 axios 헤더 세팅
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  // 인터셉터에서 401/강제만료 만나면 logout
  useEffect(() => {
    setOnUnauthorized(() => () => { logout(); });
  }, []);

  const login = (newToken) => {
    setToken(newToken);
    try { setUser(jwtDecode(newToken)?.sub || null); } catch { setUser(null); }
    navigate('/friends', { replace: true });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    navigate('/login', { replace: true });
  };

  const value = useMemo(() => ({
    token, user, isAuthed: !!token, login, logout, api
  }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}