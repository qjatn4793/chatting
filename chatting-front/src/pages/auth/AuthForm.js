import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import '../../styles/auth.css';

export default function AuthForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { login } = useAuth();

  const submit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const url = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const res = await api.post(url, { username, password });
      if (isRegistering) {
        setIsRegistering(false);
        alert('등록 완료! 로그인 해주세요.');
      } else {
        const issued = res.data?.token ?? res.data;
        login(issued);
      }
    } catch (e) {
      console.error(e);
      setErrorMessage('인증 실패');
    }
  };

  return (
    <div className="auth__container">
      <div className="auth__card">
        <h2 className="auth__title">{isRegistering ? '회원가입' : '로그인'}</h2>
        <form onSubmit={submit} className="auth__form">
          <input className="auth__input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="아이디" />
          <input className="auth__input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="비밀번호" />
          <button className="auth__button" type="submit">{isRegistering ? '가입' : '로그인'}</button>
        </form>
        {errorMessage && <p className="auth__error">{errorMessage}</p>}
        <button className="auth__link" onClick={()=>setIsRegistering(v=>!v)}>
          {isRegistering ? '이미 계정이 있어요' : '계정이 없어요'}
        </button>
      </div>
    </div>
  );
}