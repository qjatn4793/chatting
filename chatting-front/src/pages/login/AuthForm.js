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

    if (!username || !password) {
      setErrorMessage('Please fill in both fields.');
      return;
    }

    const url = isRegistering
      ? `${process.env.REACT_APP_CHATTING_SERVER || 'http://localhost:5000'}/api/auth/register`
      : `${process.env.REACT_APP_CHATTING_SERVER || 'http://localhost:5000'}/api/auth/login`;

    const data = { username, password };

    axios
      .post(url, data, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then((response) => {
        if (isRegistering) {
          if (response.data === 'User registered successfully') {
            alert('Registration successful, you can now log in!');
            setIsRegistering(false);
          } else {
            setErrorMessage('Registration failed. Please try again.');
          }
        } else {
          if (response.data && typeof response.data === 'string') {
            localStorage.setItem('jwtToken', response.data);
            onLogin(response.data);
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