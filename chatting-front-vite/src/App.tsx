// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import RealtimeProvider from './context/RealtimeProvider';
import { NotificationsProvider } from './hooks/useNotifications';

import { ToastProvider } from './pages/toast/Toast';

import AuthForm from './pages/auth/AuthForm';
import FriendsPage from './pages/friends/FriendsPage';
import ChatRoomPage from './pages/chat/ChatRoomPage';
import ChatListPage from './pages/chat/ChatListPage';

import PrivateRoute from './routes/PrivateRoute';
import AfterLoginBootstrap from './bootstrap/AfterLoginBootstrap';
import AppShell from './bootstrap/AppShell';

import './styles/index.css';

export default function App() {
    return (
        <ToastProvider>
            <AuthProvider>
                <NotificationsProvider>
                    <RealtimeProvider>
                        <AfterLoginBootstrap />
                        <Routes>
                            {/* 공개 라우트 */}
                            <Route path="/login" element={<AuthForm />} />

                            {/* 보호 라우트 */}
                            <Route element={<PrivateRoute />}>
                                {/* 공통 레이아웃 아래에 인증 페이지들 중첩 */}
                                <Route element={<AppShell />}>
                                    <Route path="/friends" element={<FriendsPage />} />
                                    <Route path="/chat" element={<ChatListPage />} />
                                    <Route path="/chat/:roomId" element={<ChatRoomPage />} />
                                    <Route index element={<Navigate to="/friends" replace />} />
                                </Route>
                            </Route>

                            {/* 기타 */}
                            <Route path="/" element={<Navigate to="/friends" replace />} />
                            <Route path="*" element={<Navigate to="/friends" replace />} />
                        </Routes>
                    </RealtimeProvider>
                </NotificationsProvider>
            </AuthProvider>
        </ToastProvider>
    );
}