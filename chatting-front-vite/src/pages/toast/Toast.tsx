// src/pages/toast/Toast.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import '@/styles/toast.css'

type ToastItem = {
    id: string
    title?: string
    username?: string
    message?: string
    timeText?: string
    duration?: number
    /** ✅ 토스트 본문 클릭 시 동작 (예: 채팅방으로 이동) */
    onClick?: () => void
}

type ToastCtx = {
    show: (t: Omit<ToastItem, 'id'> & { id?: string }) => string
    remove: (id: string) => void
    clear: () => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
    const [items, setItems] = useState<ToastItem[]>([])
    const timers = useRef(new Map<string, any>())

    const remove = (id: string) => {
        setItems(prev => prev.filter(it => it.id !== id))
        const tm = timers.current.get(id)
        if (tm) {
            clearTimeout(tm)
            timers.current.delete(id)
        }
    }

    const show: ToastCtx['show'] = ({ id, title, username, message, timeText, duration = 3500, onClick }) => {
        const _id = id ?? `t-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const item: ToastItem = { id: _id, title, /* username가 있다면 포함 */ username, message, timeText, duration, onClick }

        // 1) 기존 토스트/타이머 전부 제거 (항상 1개만 유지)
        timers.current.forEach((tm) => clearTimeout(tm))
        timers.current.clear()
        setItems([item]) // ← 항상 최신 1개만

        // 2) 새 타이머 등록
        const tm = setTimeout(() => remove(_id), duration)
        timers.current.set(_id, tm)

        return _id
    }

    const clear = () => {
        setItems([])
        timers.current.forEach((tm) => clearTimeout(tm))
        timers.current.clear()
    }

    useEffect(() => () => clear(), [])

    const value = useMemo<ToastCtx>(() => ({ show, remove, clear }), [])

    return (
        <Ctx.Provider value={value}>
            {children}
            <div className="toast-host" aria-live="polite" aria-atomic="true">
                {items.map((t) => (
                    <div
                        key={t.id}
                        className={`toast ${t.onClick ? 'toast--clickable' : ''}`}
                        role={t.onClick ? 'button' : undefined}
                        tabIndex={t.onClick ? 0 : -1}
                        onClick={(e) => {
                            // 닫기 버튼 클릭은 무시 (버튼에서 stopPropagation 예정)
                            if (!t.onClick) return
                            try { t.onClick() } finally { value.remove(t.id) }
                        }}
                        onKeyDown={(e) => {
                            if (!t.onClick) return
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                try { t.onClick() } finally { value.remove(t.id) }
                            }
                        }}
                    >
                        <div className="toast__title">{t.username ?? t.title ?? '알림'}</div>
                        {t.message && <div className="toast__msg">{t.message}</div>}
                        {t.timeText && <div className="toast__time">{t.timeText}</div>}
                        <button
                            className="toast__close"
                            onClick={(e) => { e.stopPropagation(); value.remove(t.id) }}
                            aria-label="close"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </Ctx.Provider>
    )
}

export const useToast = (): ToastCtx => {
    const ctx = useContext(Ctx)
    if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
    return ctx
}
