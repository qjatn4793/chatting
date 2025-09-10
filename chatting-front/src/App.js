import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider, { useAuth } from './context/AuthContext';
import RealtimeProvider from './context/RealtimeProvider';
import AuthForm from './pages/auth/AuthForm';
import FriendsPage from './pages/friends/FriendsPage';
import ChatRoomPage from './pages/chat/ChatRoomPage';

function PrivateRoute({ children }) {
  const { isAuthed } = useAuth();
  return isAuthed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <Routes>
          <Route path="/login" element={<AuthForm />} />
          <Route path="/friends" element={<PrivateRoute><FriendsPage /></PrivateRoute>} />
          <Route path="/chat/:roomId" element={<PrivateRoute><ChatRoomPage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/friends" replace />} />
        </Routes>
      </RealtimeProvider>
    </AuthProvider>
  );
}
