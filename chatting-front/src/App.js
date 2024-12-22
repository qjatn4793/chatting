import React, { useState, useEffect } from 'react';
import AuthForm from './AuthForm';
import ChatApp from './ChatApp'; // 기존의 채팅 앱 컴포넌트
import axios from 'axios';

const App = () => {
  const [jwtToken, setJwtToken] = useState(localStorage.getItem('jwtToken'));
  const [protectedData, setProtectedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleLogin = (token) => {
    setJwtToken(token);
    localStorage.setItem('jwtToken', token); // JWT 토큰을 로컬 스토리지에 저장
    setErrorMessage(null); // 에러 메시지 초기화
  };

  const handleLogout = () => {
    setJwtToken(null);
    localStorage.removeItem('jwtToken'); // JWT 토큰 삭제
    setProtectedData(null); // 보호된 데이터 초기화
  };

  const fetchData = async () => {
    if (!jwtToken) {
      console.error('No token found');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.get(`${process.env.REACT_APP_CHATTING_SERVER}/protected`, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });
      setProtectedData(response.data); // 받은 데이터를 상태에 저장
    } catch (error) {
      console.error('Error fetching protected data:', error);

      if (error.response?.status === 401) {
        setErrorMessage('Session expired. Please log in again.');
        handleLogout();
      } else {
        setErrorMessage('Failed to fetch data. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (jwtToken) {
      fetchData(); // JWT 토큰이 있을 때만 데이터 가져오기
    }
  }, [jwtToken]); // jwtToken이 변경될 때마다 호출

  return (
    <div>
      {jwtToken ? (
        <div>
          <button onClick={handleLogout} style={{ float: 'right', margin: '10px' }}>
            Logout
          </button>
          <ChatApp jwtToken={jwtToken} />
          {isLoading && <p>Loading protected data...</p>}
          {protectedData && (
            <div>
              <h2>Protected Data:</h2>
              <pre>{JSON.stringify(protectedData, null, 2)}</pre>
            </div>
          )}
          {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
        </div>
      ) : (
        <AuthForm onLogin={handleLogin} />
      )}
    </div>
  );
};

export default App;
