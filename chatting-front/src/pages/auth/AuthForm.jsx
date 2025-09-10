import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import http from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import '../../styles/auth.css';

export default function AuthForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  const { state } = loc;
  const { isAuthed, login } = useAuth();

  // 이미 로그인 상태면 /friends 로
  useEffect(() => {
    if (isAuthed) {
      nav('/api/friends', { replace: true });
    }
  }, [isAuthed, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      if (mode === 'register') {
        await http.post('/api/auth/register', { username, password });
      }
      const { data } = await http.post('/api/auth/login', { username, password });
      const token = data?.token || data?.accessToken || data?.jwt;
      if (!token) throw new Error('서버 응답에 토큰이 없습니다.');
      login(token); // 컨텍스트에 설정 → 가드 통과

      // 로그인 전 가던 위치가 있으면 그쪽으로, 없으면 /api/friends
      const to = state?.from?.pathname || '/api/friends';
      nav(to, { replace: true });

      // 안전망 (라우터 컨텍스트/가드 꼬임 대비)
      setTimeout(() => {
        if (loc.pathname !== to) {
          window.location.replace(to);
        }
      }, 150);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || '실패했습니다.');
    }
  };

  return (
    <div className="auth">
      <form onSubmit={submit}>
        <h2>{mode === 'login' ? '로그인' : '회원가입'}</h2>
        <input placeholder="아이디" value={username} onChange={e=>setUsername(e.target.value)} />
        <input placeholder="비밀번호" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button type="submit">{mode === 'login' ? '로그인' : '가입'}</button>
        {err && <p className="error">{err}</p>}
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? '계정이 없어요' : '이미 계정이 있어요'}
        </button>
      </form>
    </div>
  );
}
