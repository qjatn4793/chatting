// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AuthForm from './pages/auth/AuthForm';
import FriendsPage from './pages/friends/FriendsPage';
import RequestsPanel from './pages/friends/RequestsPanel';
import ChatRoomPage from './pages/chat/ChatRoomPage';
import PrivateRoute from './routes/PrivateRoute';
import './styles/index.css';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthForm />} />
        <Route element={<PrivateRoute />}>
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/friends/requests" element={<RequestsPanel />} />
          <Route path="/chat/:roomId" element={<ChatRoomPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/friends" replace />} />
        <Route path="*" element={<Navigate to="/friends" replace />} />
      </Routes>
    </AuthProvider>
  );
}
