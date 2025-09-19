import React, { createContext, useContext, useMemo, useState } from 'react';
import { getLoginIdFromToken } from '../utils/jwt';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('jwt') || null);
  const isAuthed = Boolean(token);
  const login = (jwt) => {
    setToken(jwt);
    localStorage.setItem('jwt', jwt);
  };
  const logout = () => {
    setToken(null);
    localStorage.removeItem('jwt');
  };
  
  const userId = useMemo(() => getLoginIdFromToken(token), [token]);
  const value = useMemo(
    () => ({ token, isAuthed, userId, login, logout }),
    [token, isAuthed, userId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
