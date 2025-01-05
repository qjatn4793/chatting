import React, { useState } from 'react';
import axios from 'axios';
import '../../styles/Login.css';

const AuthForm = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const url = isRegistering
      ? `${process.env.REACT_APP_CHATTING_SERVER}/api/auth/register`
      : `${process.env.REACT_APP_CHATTING_SERVER}/api/auth/login`;

    const data = { username, password };

    axios
      .post(url, data, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then((response) => {
        if (isRegistering) {
          // 회원가입 성공 후 처리
          if (response.data === 'User registered successfully') {
            alert('Registration successful, you can now log in!');
            setIsRegistering(false); // 회원가입 후 로그인 폼으로 변경
          } else {
            setErrorMessage('Registration failed. Please try again.');
          }
        } else {
          // 로그인 성공 후 처리
          if (response.data) { // 응답에서 토큰이 있는지 확인
            localStorage.setItem('jwtToken', response.data); // JWT 토큰 저장
            onLogin(response.data); // 로그인 성공 후 상위 컴포넌트로 토큰 전달
          } else {
            setErrorMessage('Invalid credentials. Please try again.');
          }
        }
      })
      .catch((error) => {
        console.error('Error during authentication:', error);
        setErrorMessage('An error occurred. Please try again.');
      });
  };

  return (
    <div className="auth-container">
      <h2 className="auth-title">{isRegistering ? 'Register' : 'Login'}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input-field"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
        />
        <button type="submit" className="submit-button">
          {isRegistering ? 'Register' : 'Login'}
        </button>
      </form>
      <button className="toggle-button" onClick={() => setIsRegistering(!isRegistering)}>
        {isRegistering ? 'Already have an account? Login' : 'Don\'t have an account? Register'}
      </button>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
    </div>
  );
};

export default AuthForm;
