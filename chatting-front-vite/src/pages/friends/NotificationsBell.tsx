import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { ws } from '@/ws'
import RequestsPanel from './RequestsPanel'

function BellIcon({ filled = false }: { filled?: boolean }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d={
                    filled
                        ? 'M12 2a7 7 0 0 0-7 7v3.586l-1.707 1.707A1 1 0 0 0 4 16h16a1 1 0 0 0 .707-1.707L19 12.586V9a7 7 0 0 0-7-7Zm0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z'
                        : 'M18 8a6 6 0 1 0-12 0v3.268l-1.894 1.894A1 1 0 0 0 4 15h16a1 1 0 0 0 .707-1.707L18 11.268V8Zm-5 13a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z'
                }
                fill="currentColor"
            />
        </svg>
    )
}

type Props = {
    userId?: string | number
}

/** 상단 종 버튼 + 모달 팝업.
 * - WS 구독으로 새로운 친구요청이 오면 배지 카운트 증가
 * - 종 클릭 시 팝업을 열고 배지 초기화
 * - 팝업은 React Portal 로 body 위에 오버레이로 표시
 */
export default function NotificationsBell({ userId }: Props) {
    const [open, setOpen] = useState(false)
    const [unseenCount, setUnseenCount] = useState(0)
    const overlayRef = useRef<HTMLDivElement | null>(null)

    // WS: 친구요청 알림 → 배지 증가 (팝업 열려있을 땐 증가 X)
    useEffect(() => {
        if (!userId) return
        const unsub = ws.subscribe(`/topic/friend-requests/${userId}`, () => {
            setUnseenCount((prev) => (open ? prev : prev + 1))
        })
        return () => unsub()
    }, [userId, open])

    // ESC 키로 닫기
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const toggle = () => {
        setOpen((v) => {
            const next = !v
            if (next) setUnseenCount(0) // 열 때 배지 제거
            return next
        })
    }

    const close = () => setOpen(false)

    // 바깥 클릭으로 닫기
    const onOverlayClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
        if (e.target === overlayRef.current) {
            close()
        }
    }

    // 모달 노드
    const modal = open ? (
        <div
            ref={overlayRef}
            onClick={onOverlayClick}
            className="modal__overlay"
            role="dialog"
            aria-modal="true"
            aria-label="친구 요청 팝업"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 80,
                zIndex: 1000,
            }}
        >
            <div
                className="modal__panel"
                style={{
                    width: 'min(560px, 92vw)',
                    background: 'var(--panel, #11182a)',
                    color: 'var(--text, #e6eefc)',
                    border: 'var(--border, 1px solid #1d2740)',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow, 0 8px 24px rgba(3,10,26,.3))',
                    overflow: 'hidden',
                }}
            >
                <div
                    className="modal__header"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: 'var(--border, 1px solid #1d2740)',
                    }}
                >
                    <strong style={{ fontSize: 16 }}>친구 요청</strong>
                    <button className="btn btn--icon" onClick={close} aria-label="닫기">
                        ✕
                    </button>
                </div>

                <div className="modal__body" style={{ padding: 12 }}>
                    {/* ✅ 기존 RequestsPanel을 그대로 사용 */}
                    <RequestsPanel />
                </div>
            </div>
        </div>
    ) : null

    return (
        <>
            <button
                className={`btn btn--icon friends__bell ${open ? 'is-active' : ''}`}
                onClick={toggle}
                aria-label="친구 요청 알림"
                title="친구 요청"
                style={{ position: 'relative' }}
            >
                <BellIcon filled={unseenCount > 0} />
                {unseenCount > 0 && (
                    <span
                        className="badge badge--notif"
                        aria-label={`${unseenCount}개의 새 친구 요청`}
                        style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            minWidth: 18,
                            height: 18,
                            padding: '0 5px',
                            borderRadius: 9,
                            fontSize: 11,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--danger, #ff4d6d)',
                            color: '#fff',
                            fontWeight: 700,
                        }}
                    >
            {unseenCount}
          </span>
                )}
            </button>

            {/* Portal 로 모달 출력 */}
            {modal ? ReactDOM.createPortal(modal, document.body) : null}
        </>
    )
}
