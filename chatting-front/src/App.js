import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import FriendsPage from './pages/friends/FriendsPage';
import ChatRoomPage from './pages/chat/ChatRoomPage';
import AuthForm from './pages/login/AuthForm';

const PrivateRoute = ({ children }) => {
  const { jwtToken } = useAuth();
  return jwtToken ? children : <Navigate to="/login" replace />;
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthForm />} />
        <Route path="/friends" element={<PrivateRoute><FriendsPage /></PrivateRoute>} />
        <Route path="/chat/:roomId" element={<PrivateRoute><ChatRoomPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/friends" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
