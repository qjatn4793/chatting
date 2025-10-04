import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { ws } from '@/ws'
import RequestsPanel from './RequestsPanel'

function BellIcon({ filled = false }: { filled?: boolean }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d={filled
                    ? 'M12 2a7 7 0 0 0-7 7v3.586l-1.707 1.707A1 1 0 0 0 4 16h16a1 1 0 0 0 .707-1.707L19 12.586V9a7 7 0 0 0-7-7Zm0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z'
                    : 'M18 8a6 6 0 1 0-12 0v3.268l-1.894 1.894A1 1 0 0 0 4 15h16a1 1 0 0 0 .707-1.707L18 11.268V8Zm-5 13a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z'}
                fill="currentColor"
            />
        </svg>
    )
}

type Props = { userUuid?: string | number }

export default function NotificationsBell({ userUuid }: Props) {
    const [open, setOpen] = useState(false)
    const [unseenCount, setUnseenCount] = useState(0)
    const overlayRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!userUuid) return
        const unsub = ws.subscribe(`/topic/friend-requests/${userUuid}`, () => {
            setUnseenCount((prev) => (open ? prev : prev + 1))
        })
        return () => unsub()
    }, [userUuid, open])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const toggle = () => setOpen(v => {
        const next = !v
        if (next) setUnseenCount(0)
        return next
    })
    const close = () => setOpen(false)

    const onOverlayClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
        if (e.target === overlayRef.current) close()
    }

    const modal = open ? (
        <div ref={overlayRef} onClick={onOverlayClick} className="modal__overlay" role="dialog" aria-modal="true">
            <div className="modal__panel">
                <div className="modal__header">
                    <strong>친구 요청</strong>
                    <button className="btn btn--icon" onClick={close} aria-label="닫기">✕</button>
                </div>
                <div className="modal__body">
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
                    <span className="badge--notif" aria-label={`${unseenCount}개의 새 친구 요청`}>{unseenCount}</span>
                )}
            </button>
            {modal ? ReactDOM.createPortal(modal, document.body) : null}
        </>
    )
}