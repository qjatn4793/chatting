import React from 'react'
import { Outlet, useMatch } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import NotificationsBell from '@/pages/friends/NotificationsBell'
import BottomNav from '@/bootstrap/BottomNav'
import '@/styles/app-shell.css'

export default function AppShell(): JSX.Element {
    const { userId, logout } = useAuth() as any

    // ✅ 정확히 /chat/:roomId 일 때만 "상세"로 판단
    const isChatDetail = !!useMatch('/chat/:roomId')

    return (
        <div className={`app ${isChatDetail ? 'app--noside' : ''}`}>
            {!isChatDetail && <BottomNav />}

            {/* 메인 영역: 상세 화면이면 헤더 행을 없애는 클래스 부여 */}
            <div className={`app__main ${isChatDetail ? 'app__main--noheader' : ''}`}>
                {/* 공통 상단바: 상세 화면에서는 렌더링 자체를 하지 않음 */}
                {!isChatDetail && (
                    <header className="app__topbar app-shell__header">
                        <div className="app__topbar__left">
                            <div className="me-pill" title={userId || '알 수 없음'}>
                                <span className="me-pill__label">사용자명 : </span>
                                <strong className="me-pill__name">{userId || '알 수 없음'}</strong>
                            </div>
                        </div>
                        <div className="app__topbar__right">
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

                {/* 페이지 본문: 상세 화면에서는 하단 패딩 제거 */}
                <main className={`app__content ${isChatDetail ? 'app__content--nopad' : ''}`}>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
