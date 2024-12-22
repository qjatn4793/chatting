import React, { useState } from 'react';
import axios from 'axios';

const AuthForm = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    console.log(`${process.env.REACT_APP_CHATTING_SERVER}/api/auth/register`);
  
    const handleSubmit = (e) => {
      e.preventDefault();
      const url = isRegistering
        ? `${process.env.REACT_APP_CHATTING_SERVER}/api/auth/register`
        : `${process.env.REACT_APP_CHATTING_SERVER}/api/auth/login`;
  
      const data = { username, password };
  
      axios.post(url, data, {
        headers: {
            'Content-Type': 'application/json'
        }
      })
        .then((response) => {
          console.log(response);

          if (isRegistering) {
            // 회원가입 성공 후 처리
            if (response.data === 'User registered successfully') {
              alert('Registration successful, you can now log in!');
              setIsRegistering(false);  // 회원가입 후 로그인 폼으로 변경
            } else {
              alert('Registration failed');
            }
          } else {
            // 로그인 성공 후 처리
            if (response.data) {  // 응답에서 토큰이 있는지 확인
              localStorage.setItem('jwtToken', response.data);  // JWT 토큰 저장
              onLogin(response.data); // 로그인 성공 후 상위 컴포넌트로 토큰 전달
            } else {
              alert('Invalid credentials');
            }
          }
        })
        .catch((error) => {
          console.error('Error during authentication:', error);
          alert('An error occurred. Please try again.');
        });
    };
  
    return (
      <div>
        <h2>{isRegistering ? 'Register' : 'Login'}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">{isRegistering ? 'Register' : 'Login'}</button>
        </form>
        <button onClick={() => setIsRegistering(!isRegistering)}>
          {isRegistering ? "Already have an account? Login" : "Don't have an account? Register"}
        </button>
      </div>
    );
};
  
export default AuthForm;
