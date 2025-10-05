// src/pages/chat/ChatRoomPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/chat.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'

/* ────────────────────────────────────────────────────────────
 * 1) 타입 (백엔드 DTO에 맞춤)
 * ──────────────────────────────────────────────────────────── */
type MessageDto = {
    id?: number | null
    messageId?: string | null      // UUID
    roomId?: string | null
    sender?: string | null         // UUID 문자열
    username?: string | null
    content?: string | null
    createdAt?: string | number | null
}

type UiMsg = {
    id: string                     // messageId(UUID) → id(Long) → fallback
    roomId?: string
    sender?: string
    username?: string
    content: string
    createdAt: string | number | null
}

type RoomLite = {
    id: string
    members?: string[] | null      // 이메일 또는 UUID 문자열
}

/* ────────────────────────────────────────────────────────────
 * 2) 순수 유틸
 * ──────────────────────────────────────────────────────────── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const toStr = (x: unknown): string | undefined => {
    if (x === null || x === undefined) return undefined
    const s = String(x).trim()
    return s.length ? s : undefined
}
const isUuidLike = (s?: string) => !!s && UUID_RE.test(s)
const isEmailLike = (s?: string) => !!s && EMAIL_RE.test(s)

const eqId = (a?: string, b?: string): boolean => {
    if (!a || !b) return false
    const A = a.trim()
    const B = b.trim()
    const aIsUuid = isUuidLike(A)
    const bIsUuid = isUuidLike(B)
    if (aIsUuid && bIsUuid) {
        return A.toLowerCase().replace(/-/g, '') === B.toLowerCase().replace(/-/g, '')
    }
    return A.toLowerCase() === B.toLowerCase()
}

const toMillis = (v: string | number | null | undefined): number => {
    if (v == null) return -Infinity
    const n = Number(v)
    if (!Number.isNaN(n)) return n
    const t = Date.parse(String(v))
    return Number.isNaN(t) ? -Infinity : t
}

/* ────────────────────────────────────────────────────────────
 * 3) 메시지 정규화/라벨
 * ──────────────────────────────────────────────────────────── */
const normalize = (raw: MessageDto): UiMsg => {
    const id =
        toStr(raw.messageId) ??
        (raw.id != null ? String(raw.id) : undefined) ??
        // 동일 메시지 중복 방지를 위한 안전망(희귀): roomId + createdAt + content 해시성
        `${toStr(raw.roomId) || 'r'}-${toStr(raw.createdAt) || 't'}-${(toStr(raw.content) || '').slice(0, 24)}`
    return {
        id: id!,
        roomId: toStr(raw.roomId),
        sender: toStr(raw.sender),
        username: toStr(raw.username),
        content: toStr(raw.content) || '',
        createdAt: raw.createdAt ?? null,
    }
}

const sameUser = (meKeys: string[], msg: UiMsg): boolean => {
    // sender(UUID)가 1순위, 환경에 따라 username에도 식별자가 올 수 있어서 보조 비교
    const candidates = [msg.sender, msg.username].map(toStr)
    for (const me of meKeys) {
        for (const c of candidates) if (c && eqId(me, c)) return true
    }
    return false
}

const renderSenderLabel = (m: UiMsg, mine: boolean, peerLabel: string): string =>
    mine ? '나'
        : (m.username || m.sender || m.id || peerLabel || 'unknown')

/* ────────────────────────────────────────────────────────────
 * 4) 컴포넌트
 * ──────────────────────────────────────────────────────────── */
export default function ChatRoomPage(): JSX.Element {
    const { roomId } = useParams<{ roomId: string }>()
    const nav = useNavigate()

    const { userUuid, email } = useAuth() as { userUuid?: string | null; email?: string | null }
    const { setActiveRoom } = useNotifications() as any

    // 나의 비교 키: sender는 UUID로 오므로 UUID 우선 + (보조) email
    const myKeys = useMemo(() => {
        const keys = [toStr(userUuid)]
        const em = toStr(email)
        if (em) keys.push(em)
        return keys.filter(Boolean) as string[]
    }, [userUuid, email])

    // 상대 표시
    const [peerKey, setPeerKey] = useState('')
    const [peerLabel, setPeerLabel] = useState('')

    // 메시지/입력/연결
    const [messages, setMessages] = useState<UiMsg[]>([])
    const [text, setText] = useState('')
    const [connected, setConnected] = useState<boolean>(ws.isConnected())

    // refs
    const listRef = useRef<HTMLDivElement | null>(null)
    const endRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const inputWrapRef = useRef<HTMLDivElement | null>(null)

    // 모바일 키보드 대응
    const suppressRef = useRef(false)
    const settleTimerRef = useRef<number | null>(null)
    const rafTokenRef = useRef<number | null>(null)
    const baseVhRef = useRef<number>(0)
    const kbPxRef = useRef<number>(0)
    const closingRef = useRef<boolean>(false)
    const KB_THRESHOLD = 80

    const setCSSVar = (k: string, v: string) => document.documentElement.style.setProperty(k, v)

    const scrollToEnd = useCallback(() => {
        const el = endRef.current
        if (!el) return
        try {
            el.scrollIntoView({ behavior: 'auto', block: 'end' })
        } catch {
            const list = listRef.current
            if (list) list.scrollTop = list.scrollHeight
        }
    }, [])

    const setViewportVars = useCallback(() => {
        const vv: any = (window as any).visualViewport
        const currentVh = Math.round(vv?.height ?? window.innerHeight)
        if (!baseVhRef.current) baseVhRef.current = currentVh
        setCSSVar('--vvh', `${currentVh}px`)

        const rawKb = Math.max(0, baseVhRef.current - currentVh)
        const kb = rawKb >= KB_THRESHOLD ? rawKb : 0
        kbPxRef.current = kb
        setCSSVar('--kb', `${kb}px`)

        if (kb > 0) {
            document.documentElement.classList.add('kb-open')
        } else {
            if (closingRef.current) {
                document.documentElement.classList.remove('kb-open')
                closingRef.current = false
            } else {
                document.documentElement.classList.remove('kb-open')
            }
            if (settleTimerRef.current) {
                window.clearTimeout(settleTimerRef.current)
                settleTimerRef.current = null
            }
        }
    }, [])

    const setInputHeightVar = useCallback(() => {
        const h = Math.round(inputWrapRef.current?.getBoundingClientRect().height ?? 56)
        setCSSVar('--input-h', `${h}px`)
    }, [])

    const onInputBlur = useCallback(() => {
        closingRef.current = true
        suppressRef.current = false
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = window.setTimeout(() => {
            document.documentElement.classList.remove('kb-open')
            closingRef.current = false
        }, 500) as unknown as number
    }, [])

    /* 세션/WS 업다운 핸들링(간단화) */
    useEffect(() => {
        const onUp = () => setConnected(true)
        const onDown = () => setConnected(false)
        ws.onConnect(onUp)
        ws.onDisconnect(onDown)
        ws.ensureConnected()
        setConnected(ws.isConnected())
        return () => {
            ws.offConnect(onUp)
            ws.offDisconnect(onDown)
        }
    }, [])

    /* mount: 뷰포트 변수 */
    useEffect(() => {
        setViewportVars()
        requestAnimationFrame(setInputHeightVar)

        const vv: any = (window as any).visualViewport
        const onVV = () => {
            if (rafTokenRef.current) return
            rafTokenRef.current = requestAnimationFrame(() => {
                rafTokenRef.current = null
                setViewportVars()
                if (kbPxRef.current > 0 && !suppressRef.current) scrollToEnd()
            })
        }

        if (vv) {
            const type = 'ongeometrychange' in vv ? 'geometrychange' : 'resize'
            vv.addEventListener(type, onVV, { passive: true })
            vv.addEventListener('scroll', onVV, { passive: true })
        }

        const onResize = () => {
            baseVhRef.current = 0
            setViewportVars()
            setInputHeightVar()
            if (!suppressRef.current) scrollToEnd()
        }

        window.addEventListener('resize', onResize, { passive: true })
        window.addEventListener('orientationchange', onResize, { passive: true })

        return () => {
            if (vv) {
                vv.removeEventListener('geometrychange', onVV as any)
                vv.removeEventListener('resize', onVV as any)
                vv.removeEventListener('scroll', onVV as any)
            }
            window.removeEventListener('resize', onResize as any)
            window.removeEventListener('orientationchange', onResize as any)
            if (rafTokenRef.current) cancelAnimationFrame(rafTokenRef.current)
            if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
            document.documentElement.classList.remove('kb-open')
        }
    }, [scrollToEnd, setInputHeightVar, setViewportVars])

    /* 상대 라벨/키 추출 (members에서 나 제외) */
    useEffect(() => {
        if (!roomId) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await http.get<RoomLite[]>('/rooms')
                const room = (Array.isArray(res.data) ? res.data : []).find(r => r.id === roomId)
                if (!room) return
                const myLower = (toStr(userUuid) || toStr(email) || '')!.toLowerCase()
                const other = (room.members || []).map(String).find(m => m && m.toLowerCase() !== myLower) || ''
                if (!cancelled) {
                    setPeerKey(other)
                    setPeerLabel(other)
                }
            } catch {/* ignore */}
        })()
        return () => { cancelled = true }
    }, [roomId, userUuid, email])

    /* 방 진입/이동: 읽음 + 히스토리 */
    useEffect(() => {
        if (!roomId) return
        let cancelled = false
        setActiveRoom?.(roomId)

        ;(async () => {
            try { await http.post(`/rooms/${encodeURIComponent(roomId)}/read`) } catch {}

            if (cancelled) return

            try {
                const res = await http.get<MessageDto[]>(`/rooms/${encodeURIComponent(roomId)}/messages`, { params: { limit: 50 } })
                const list = (Array.isArray(res.data) ? res.data : []).map(normalize)

                // 타임라인은 오래된→최신(ASC)로 보이도록 정렬
                list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))

                setMessages(list)
                requestAnimationFrame(scrollToEnd)
            } catch {/* ignore */}
        })()

        return () => {
            cancelled = true
            // 떠날 때도 읽음 처리(미처 반영 못했을 수 있으니)
            ;(async () => { try { await http.post(`/rooms/${encodeURIComponent(roomId)}/read`) } catch {} })()
        }
    }, [roomId, setActiveRoom, scrollToEnd])

    /* WS 구독: /topic/rooms/{roomId} */
    useEffect(() => {
        if (!roomId) return
        const markConnected = () => setConnected(true)
        const markDisconnected = () => setConnected(false)
        ws.onConnect(markConnected)
        ws.onDisconnect(markDisconnected)
        setConnected(ws.isConnected())

        const unsub = ws.subscribe(`/topic/rooms/${roomId}`, (payload: MessageDto) => {
            const msg = normalize(payload)
            // 중복 제거
            setMessages(prev => {
                if (msg.id && prev.some(p => p.id === msg.id)) return prev
                const next = [...prev, msg]
                // 유지: 오래된→최신 정렬
                next.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
                return next
            })
            requestAnimationFrame(() => { if (!suppressRef.current) scrollToEnd() })
        })

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                ws.ensureConnected()
                scrollToEnd()
            }
        }
        const onOnline = () => { ws.ensureConnected() }

        document.addEventListener('visibilitychange', onVisible, { passive: true } as any)
        window.addEventListener('online', onOnline, { passive: true } as any)
        window.addEventListener('pageshow', onOnline, { passive: true } as any)

        return () => {
            unsub()
            ws.offConnect(markConnected)
            ws.offDisconnect(markDisconnected)
            document.removeEventListener('visibilitychange', onVisible as any)
            window.removeEventListener('online', onOnline as any)
            window.removeEventListener('pageshow', onOnline as any)
        }
    }, [roomId, scrollToEnd])

    /* 메시지 변경 시 하단 정렬 */
    useEffect(() => { if (!suppressRef.current) scrollToEnd() }, [messages, scrollToEnd])

    /* 전송 */
    const send = useCallback(async () => {
        const body = text.trim()
        if (!body || !roomId) return
        try {
            await http.post(`/rooms/${encodeURIComponent(roomId)}/send`, { message: body })
            setText('')
            inputRef.current?.focus({ preventScroll: true })
            setTimeout(() => { if (!suppressRef.current) scrollToEnd() }, 10)
        } catch {/* ignore */}
    }, [roomId, text, scrollToEnd])

    const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        const composing = (e as any).isComposing || (e.nativeEvent as any)?.isComposing
        if (!composing && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    }

    const headerTitle = peerLabel || roomId || '대화방'
    const displayMe = toStr(email) || toStr(userUuid) || '알 수 없음'

    return (
        <div className="chat">
            <div className="chat__header">
                <button onClick={() => nav('/chat')}>← chat</button>
                <h2>{headerTitle}</h2>
                <span className="me">사용자: {displayMe}</span>
            </div>

            <div className="chat__list" id="chat-list" ref={listRef}>
                {messages.map((m) => {
                    const mine = sameUser(myKeys, m)
                    const label = renderSenderLabel(m, mine, peerLabel)
                    return (
                        <div key={m.id} className={`chat__msg ${mine ? 'me' : ''}`}>
                            <div className="chat__sender">{label}</div>
                            <div className="chat__bubble">{m.content}</div>
                        </div>
                    )
                })}
                <div ref={endRef} id="chat-end-sentinel" />
            </div>

            <div className="chat__input" ref={inputWrapRef}>
                <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {}}
                    onBlur={onInputBlur}
                    placeholder="메시지를 입력하세요"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                />
                <button
                    type="button"
                    disabled={!connected || !text.trim()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={send}
                >
                    Send
                </button>
            </div>
        </div>
    )
}
