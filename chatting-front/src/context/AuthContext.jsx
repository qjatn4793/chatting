import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { getLoginIdFromToken } from '../utils/jwt';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();

  // 1) 초기 토큰 로드 (localStorage 우선)
  const [token, setToken] = useState(() => localStorage.getItem('jwt') || null);
  const isAuthed = Boolean(token);

  // 2) 로그인: 토큰 저장 + 라우팅 필요 시 여기서 처리(필요 없다면 생략)
  const login = useCallback((jwt) => {
    setToken(jwt);
    localStorage.setItem('jwt', jwt);
  }, []);

  /**
   * 3) 로그아웃: 토큰/상태 정리 + 로그인 화면으로 이동
   *    - 컴포넌트 내부에서는 이 함수를 직접 호출하세요.
   *    - 컴포넌트 외부(axios 인터셉터 등)에서는 'auth:logout' 커스텀 이벤트를 쏘면 여기로 연결됩니다.
   */
  const logout = useCallback(
    (reason) => {
      try {
        setToken(null);
        localStorage.removeItem('jwt');
        sessionStorage.removeItem('jwt'); // 혹시 쓰고 있다면 함께 제거
        // TODO: 유저/알림/소켓 등 전역 상태 초기화가 필요하면 여기에 추가
      } finally {
        if (reason) console.warn('[LOGOUT]', reason);
        navigate('/login', { replace: true });
      }
    },
    [navigate]
  );

  // 4) 토큰에서 사용자 ID 파생
  const userId = useMemo(() => getLoginIdFromToken(token), [token]);

  // 5) 바깥(훅 외부)에서 로그아웃 요청을 받을 커스텀 이벤트 핸들러
  useEffect(() => {
    const onExternalLogout = (e) => {
      const reason = e?.detail?.reason;
      logout(reason);
    };
    window.addEventListener('auth:logout', onExternalLogout);
    return () => window.removeEventListener('auth:logout', onExternalLogout);
  }, [logout]);

  // 6) 멀티 탭 동기화 (다른 탭에서 로그아웃하면 이 탭도 따라 로그아웃)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'jwt' && e.newValue == null && isAuthed) {
        logout('다른 탭에서 로그아웃');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isAuthed, logout]);

  const value = useMemo(
    () => ({ token, isAuthed, userId, login, logout }),
    [token, isAuthed, userId, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
