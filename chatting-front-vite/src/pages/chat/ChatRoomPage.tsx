import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/chat.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws' // 전역 WS 싱글톤

type RawMsg = {
    id?: string
    senderId?: string | number
    sender?: string
    senderUsername?: string
    user?: string
    from?: string
    message?: string
    text?: string
    content?: string
    body?: string
    createdAt?: string | number
    time?: string | number
}

type UiMsg = {
    id: string
    senderId?: string
    sender?: string
    senderUsername?: string
    user?: string
    from?: string
    content: string
    createdAt: string | number | null
}

function toStr(x: unknown): string | undefined {
    if (x === null || x === undefined) return undefined
    const s = String(x).trim()
    return s.length ? s : undefined
}

function normalize(raw: RawMsg): UiMsg {
    const id = raw.id ?? crypto.randomUUID()
    const content =
        toStr(raw.message) ??
        toStr(raw.text) ??
        toStr(raw.content) ??
        toStr(raw.body) ??
        ''
    const createdAt = (raw.createdAt as any) ?? (raw.time as any) ?? null

    return {
        id,
        senderId: toStr(raw.senderId),
        sender: toStr(raw.sender),
        senderUsername: toStr(raw.senderUsername),
        user: toStr(raw.user),
        from: toStr(raw.from),
        content,
        createdAt,
    }
}

/** 사용자 동일성 판단 */
function sameUser(meKey: string | undefined | null, msg: UiMsg): boolean {
    const key = toStr(meKey)?.toLowerCase()
    if (!key) return false
    const candidates = [msg.senderId, msg.sender, msg.senderUsername, msg.user, msg.from]
    for (const c of candidates) if (toStr(c)?.toLowerCase() === key) return true
    return false
}

export default function ChatRoomPage(): React.ReactElement {
    const { roomId } = useParams<{ roomId: string }>()
    const nav = useNavigate()
    const { userId, logout } = useAuth() as { userId?: string | null; logout: (reason?: string)=>void }
    const { setActiveRoom, clearFriend } = useNotifications()

    const meKey = useMemo(() => toStr(userId)?.toLowerCase() ?? '', [userId])

    const [messages, setMessages] = useState<UiMsg[]>([])
    const [text, setText] = useState('')
    const [connected, setConnected] = useState<boolean>(ws.isConnected())

    const listRef = useRef<HTMLDivElement | null>(null)
    const endRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const inputWrapRef = useRef<HTMLDivElement | null>(null)
    const peerRef = useRef<string | null>(null)

    /** ----- iOS 키보드/뷰포트 제어용 상태 ----- */
    const suppressRef = useRef(false)                 // 강제 스크롤 억제 중 여부
    const settleTimerRef = useRef<number | null>(null)
    const rafTokenRef = useRef<number | null>(null)

    const baseVhRef = useRef<number>(0)               // 최초 visualViewport 높이(baseline)
    const kbPxRef = useRef<number>(0)                 // 추정 키보드 높이(px)
    const closingRef = useRef<boolean>(false)         // blur 이후 키보드 닫힘 진행 중 플래그
    const KB_THRESHOLD = 80                           // 키보드 판단 임계값(px)

    const setCSSVar = (k: string, v: string) =>
        document.documentElement.style.setProperty(k, v)

    /** 즉시 맨 아래로 (fallback 포함) */
    const scrollToEnd = () => {
        const el = endRef.current
        if (!el) return
        try {
            el.scrollIntoView({ behavior: 'auto', block: 'end' })
        } catch {
            const list = listRef.current
            if (list) list.scrollTop = list.scrollHeight
        }
    }

    /** visualViewport 기반 높이/키보드 변수 갱신 (키보드 “실측” 판정) */
    const setViewportVars = () => {
        const vv: any = (window as any).visualViewport;
        const currentVh = Math.round(vv?.height ?? window.innerHeight);
        if (!baseVhRef.current) baseVhRef.current = currentVh;

        setCSSVar('--vvh', `${currentVh}px`);

        const rawKb = Math.max(0, baseVhRef.current - currentVh);
        const kb = rawKb >= KB_THRESHOLD ? rawKb : 0;
        kbPxRef.current = kb;
        setCSSVar('--kb', `${kb}px`);

        if (kb > 0) {
            document.documentElement.classList.add('kb-open');
        } else {
            if (closingRef.current) {
                document.documentElement.classList.remove('kb-open');
                closingRef.current = false;
            } else {
                document.documentElement.classList.remove('kb-open');
            }
            // geometrychange가 정상적으로 왔으니 failsafe 타이머 제거
            if (settleTimerRef.current) {
                window.clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
        }
    };

    /** 입력바 실제 높이 1회/회전 시만 측정 */
    const setInputHeightVar = () => {
        const h = Math.round(inputWrapRef.current?.getBoundingClientRect().height ?? 56)
        setCSSVar('--input-h', `${h}px`)
    }

    /** 입력 포커스/블러 */
    const onInputFocus = () => {
        // 선점프 방지: 여기선 아무 스타일 변경 X
    }

    const onInputBlur = () => {
        closingRef.current = true;
        suppressRef.current = false;

        // failsafe: 혹시 geometrychange가 오지 않는 구형/특정 웹뷰 대비
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = window.setTimeout(() => {
            document.documentElement.classList.remove('kb-open');
            closingRef.current = false;
        }, 500); // 300~500ms 권장
    };

    /** ---- 세션 가드: 진입 시 userId/WS 연결 확인 ---- */
    useEffect(() => {
        // 필수 가드: 토큰/사용자 없음 > 로그아웃
        if (!userId) {
            // alert('no userId')
            logout('no userId')
            nav('/login', { replace: true })
            return
        }

        let graceTimer: number | null = null
        let tried = 0
        const MAX_GRACE_MS = 10000           // 10s (처음 콜드 스타트/프록시 지연 커버)
        const RETRY_BASE_MS = 800            // 재시도 백오프 시작
        const RETRY_MAX_MS  = 5000

        const startGrace = () => {
            if (graceTimer) window.clearTimeout(graceTimer)
            graceTimer = window.setTimeout(() => {
                // 여기서 곧장 로그아웃하지 말고, UI 표시 + 재시도
                console.warn('WS still disconnected: showing offline but keep retrying')
                //alert('ws disconnected (retrying)')
                ws.ensureConnected()             // 내부 재시도 트리거
            }, MAX_GRACE_MS)
        }

        const clearGrace = () => {
            if (graceTimer) { window.clearTimeout(graceTimer); graceTimer = null }
        }

        const onUp = () => {
            clearGrace()
            tried = 0
        }

        const onDown = () => {
            // 끊김 감지: 점진 백오프로 재연결 시도
            tried += 1
            const delay = Math.min(RETRY_BASE_MS * Math.pow(2, tried - 1), RETRY_MAX_MS)
            window.setTimeout(() => ws.ensureConnected(), delay)
        }

        // 이벤트 먼저 구독 → 연결 시도 (레이스 방지)
        ws.onConnect(onUp)
        ws.onDisconnect(onDown)

        // 최초 연결 시도 + 그레이스 타이머 가동
        ws.ensureConnected()
        startGrace()

        return () => {
            clearGrace()
            ws.offConnect(onUp)
            ws.offDisconnect(onDown)
        }
    }, [userId, logout, nav])

    /** mount: 초기 세팅 */
    useEffect(() => {
        setViewportVars()
        requestAnimationFrame(setInputHeightVar)

        const vv: any = (window as any).visualViewport

        const onVV = () => {
            if (rafTokenRef.current) return
            rafTokenRef.current = requestAnimationFrame(() => {
                rafTokenRef.current = null
                setViewportVars()
                // 키보드가 열린 뒤에만 자동 스크롤
                if (kbPxRef.current > 0 && !suppressRef.current) scrollToEnd()
            })
        }

        if (vv) {
            // iOS 16+ 에서는 geometrychange 가 가장 정확
            const type = ('ongeometrychange' in vv) ? 'geometrychange' : 'resize'
            vv.addEventListener(type, onVV, { passive: true })
            vv.addEventListener('scroll', onVV, { passive: true })
        }

        const onResize = () => {
            // 회전 등 큰 변화 시 baseline 리셋 후 재계산
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
    }, [])

    /** 방 진입/이동: 읽음 + 히스토리 */
    useEffect(() => {
        if (!roomId) return
        let cancelled = false
        setActiveRoom(roomId)

        ;(async () => {
            try {
                const { data } = await http.post(`/rooms/${encodeURIComponent(roomId)}/read`)
                const friend = data?.friendUsername || null
                if (friend) {
                    peerRef.current = friend
                    clearFriend(friend)
                }
            } catch {}

            if (cancelled) return

            try {
                const res = await http.get(`/rooms/${encodeURIComponent(roomId)}/messages?limit=50`)
                const list = Array.isArray(res.data) ? res.data.map(normalize) : []
                setMessages(list)
                requestAnimationFrame(scrollToEnd)
            } catch {}
        })()

        return () => {
            cancelled = true
            setActiveRoom(null)
            const friend = peerRef.current
            ;(async () => {
                try { await http.post(`/rooms/${encodeURIComponent(roomId)}/read`) } catch {}
                if (friend) clearFriend(friend)
            })()
            setActiveRoom(null)
        }
    }, [roomId, setActiveRoom, clearFriend])

    /** WebSocket 구독 */
    useEffect(() => {
        if (!roomId) return

        const markConnected = () => setConnected(true)
        const markDisconnected = () => setConnected(false)
        ws.onConnect(markConnected)
        ws.onDisconnect(markDisconnected)
        setConnected(ws.isConnected())

        const unsub = ws.subscribe(`/topic/rooms/${roomId}`, (payload: any) => {
            try {
                setMessages((prev) => {
                    const msg = normalize(payload as RawMsg)
                    if (msg.id && prev.some((p) => p.id === msg.id)) return prev
                    return [...prev, msg]
                })
                requestAnimationFrame(() => { if (!suppressRef.current) scrollToEnd() })
            } catch {
                setMessages((prev) => [...prev, normalize({ sender: 'system', message: String(payload) } as any)])
                requestAnimationFrame(() => { if (!suppressRef.current) scrollToEnd() })
            }
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
    }, [roomId])

    /** 메시지 변경 시 하단 정렬 (억제 중이면 skip) */
    useEffect(() => { if (!suppressRef.current) scrollToEnd() }, [messages])

    const send = async () => {
        const body = text.trim()
        if (!body || !roomId) return
        try {
            await http.post(`/rooms/${encodeURIComponent(roomId)}/send`, { message: body })
            setText('')
            inputRef.current?.focus({ preventScroll: true })
            setTimeout(() => { if (!suppressRef.current) scrollToEnd() }, 10)
        } catch {}
    }

    const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        const composing = (e as any).isComposing || (e.nativeEvent as any)?.isComposing
        if (!composing && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    }

    return (
        <div className="chat">
            <div className="chat__header">
                <button onClick={() => nav('/chat')}>← chat</button>
                <h2>Room: {roomId}</h2>
                <span className="me">사용자명 : {toStr(userId) || '알 수 없음'}</span>
            </div>

            <div className="chat__list" id="chat-list" ref={listRef}>
                {messages.map((m) => {
                    const mine = sameUser(meKey, m)
                    return (
                        <div key={m.id} className={`chat__msg ${mine ? 'me' : ''}`}>
                            <div className="chat__sender">
                                {m.senderUsername ?? m.sender ?? m.user ?? m.from ?? m.senderId ?? 'unknown'}
                            </div>
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
                    onFocus={onInputFocus}
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
