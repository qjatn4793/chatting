import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:8080';

const AuthForm = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!username || !password) {
      setErrorMessage('아이디와 비밀번호를 입력하세요.');
      return;
    }

    setLoading(true);
    try {
      const url = isRegistering
        ? `${API_BASE}/api/auth/register`
        : `${API_BASE}/api/auth/login`;

      const res = await axios.post(url, { username, password });

      if (isRegistering) {
        setIsRegistering(false);
        alert('등록 완료! 로그인 해주세요.');
      } else {
        const token = typeof res.data === 'string' ? res.data : res.data?.token;
        if (!token) throw new Error('서버가 토큰을 반환하지 않았습니다.');
        login(token);                 // ← localStorage까지 저장
        navigate('/friends', { replace: true });
      }
    } catch (err) {
      const msg = err?.response?.data || err.message || '인증 실패';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }}>
      <h2>{isRegistering ? '회원가입' : '로그인'}</h2>
      <form onSubmit={submit}>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="아이디"
          disabled={loading}
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="비밀번호"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {isRegistering ? '가입' : '로그인'}
        </button>
      </form>
      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
      <button
        onClick={() => setIsRegistering(v => !v)}
        style={{ marginTop: 12 }}
        disabled={loading}
      >
        {isRegistering ? '이미 계정이 있어요' : '계정이 없어요'}
      </button>
    </div>
  );
};

export default AuthForm;
