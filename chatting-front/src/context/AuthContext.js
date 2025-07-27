import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // 초기값: 세션 스토리지에서 가져오기
  const [jwtToken, setJwtToken] = useState(() => {
    return sessionStorage.getItem('jwtToken');
  });

  // jwtToken 변화 시 세션 스토리지에 동기화
  useEffect(() => {
    if (jwtToken) {
      sessionStorage.setItem('jwtToken', jwtToken);
    } else {
      sessionStorage.removeItem('jwtToken');
    }
  }, [jwtToken]);

  const login = (token) => setJwtToken(token);
  const logout = () => setJwtToken(null);

  return (
    <AuthContext.Provider value={{ jwtToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// 컴포넌트에서 쉽게 꺼내 쓰는 커스텀 훅
export const useAuth = () => useContext(AuthContext);
