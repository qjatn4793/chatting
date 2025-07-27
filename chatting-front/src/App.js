import React, { useEffect, useState } from 'react';
import AuthForm from './pages/login/AuthForm';
import ChatApp from './pages/chat/ChatApp';
import axios from 'axios';
import './styles/App.css';
import { useAuth } from './context/AuthContext';

const App = () => {
  const { jwtToken, login, logout } = useAuth();
  const [protectedData, setProtectedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchData = async () => {
    if (!jwtToken) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data } = await axios.get(
        `${process.env.REACT_APP_CHATTING_SERVER}/protected`,
        { headers: { Authorization: `Bearer ${jwtToken}` } }
      );
      setProtectedData(data);
    } catch (error) {
      if (error.response?.status === 401) {
        setErrorMessage('Session expired. Please log in again.');
        logout();
      } else {
        setErrorMessage('Failed to fetch data. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (jwtToken) {
      fetchData();
    }
  }, [jwtToken]);

  return (
    <div>
      {jwtToken ? (
        <div>
          <ChatApp jwtToken={jwtToken} onLogout={logout} />
          {isLoading && <p>Loading protected data...</p>}
          {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
          {/* 필요하다면 보호된 데이터 표시
          {protectedData && (
            <div>
              <h2>Protected Data:</h2>
              <pre>{JSON.stringify(protectedData, null, 2)}</pre>
            </div>
          )} */}
        </div>
      ) : (
        <AuthForm onLogin={login} />
      )}
    </div>
  );
};

export default App;