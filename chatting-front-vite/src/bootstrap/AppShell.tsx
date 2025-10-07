// src/bootstrap/AppShell.tsx
import React from 'react'
import { Outlet, useMatch } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import NotificationsBell from '@/pages/friends/NotificationsBell'
import BottomNav from '@/bootstrap/BottomNav'
import SidebarNav from '@/bootstrap/SidebarNav'
import '@/styles/app-shell.css'

export default function AppShell(): JSX.Element {
    const { userUuid, email, logout } = useAuth() as any

    // ✅ /chat/:roomId 일 때만 "상세"
    const isChatDetail = !!useMatch('/chat/:roomId')

    return (
        <div className={`app ${isChatDetail ? 'app--detail' : ''}`}>
            {/* 데스크톱(넓은 화면)에서만 보이는 사이드 내비게이션 */}
            {!isChatDetail && <SidebarNav />}

            <div className={`app__main ${isChatDetail ? 'app__main--noheader' : ''}`}>
                {/* 상단바: 모바일/태블릿에선 유지, 데스크톱에서도 유지 */}
                {!isChatDetail && (
                    <header className="app__topbar app-shell__header">
                        <div className="app__topbar__left">
                            <div className="me-pill" title={email || '알 수 없음'}>
                                <span className="me-pill__label">사용자명 : </span>
                                <strong className="me-pill__name">{email || '알 수 없음'}</strong>
                            </div>
                        </div>
                        <div className="app__topbar__right">
                            <NotificationsBell userUuid={userUuid} />
                            <button
                                type="button"
                                className="btn btn--logout app__logout"
                                onClick={() => logout?.()}
                                title="로그아웃"
                            >
                                로그아웃
                            </button>
                        </div>
                    </header>
                )}

                <main className={`app__content ${isChatDetail ? 'app__content--nopad' : ''}`}>
                    <Outlet />
                </main>
            </div>

            {/* 모바일/태블릿에서만 보이는 바텀 내비게이션 */}
            {!isChatDetail && <BottomNav />}
        </div>
    )
}
