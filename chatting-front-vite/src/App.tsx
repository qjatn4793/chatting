// src/App.tsx
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
                <Routes>
                    {/* 공개 라우트: 로그인에서는 아래 실시간/알림 프로바이더를 마운트하지 않음 */}
                    <Route path="/login" element={<AuthForm />} />

                    {/* 보호 라우트: 여기 안에서만 알림/실시간/부트스트랩을 마운트 */}
                    <Route element={<PrivateRoute />}>
                        <Route
                            element={
                                <NotificationsProvider>
                                    <RealtimeProvider>
                                        <AfterLoginBootstrap />
                                        <AppShell />
                                    </RealtimeProvider>
                                </NotificationsProvider>
                            }
                        >
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
            </AuthProvider>
        </ToastProvider>
    );
}
