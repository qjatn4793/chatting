import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('jwt'));
  const isAuthed = !!token;

  useEffect(() => {
    if (!token) {
      localStorage.removeItem('jwt');
    } else {
      localStorage.setItem('jwt', token);
    }
  }, [token]);

  const login = (jwt) => setToken(jwt);
  const logout = () => setToken(null);

  const value = useMemo(() => ({ token, isAuthed, login, logout }), [token, isAuthed]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
