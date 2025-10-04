// src/pages/chat/ChatRoomPage.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/chat.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws'

type RawMsg = {
    id?: string            // DB PK
    messageId?: string     // 논리적 메시지 ID
    roomId?: string
    sender?: string
    username?: string

    message?: string
    text?: string
    content?: string
    body?: string
    createdAt?: string | number
    time?: string | number
}

type UiMsg = {
    id: string                  // 화면/중복제거용: messageId > id > uuid
    roomId?: string
    sender?: string
    username?: string
    content: string
    createdAt: string | number | null
}

type RoomLite = {
    id: string
    members?: Array<string> // 이메일 또는 UUID 문자열들
}

function toStr(x: unknown): string | undefined {
    if (x === null || x === undefined) return undefined
    const s = String(x).trim()
    return s.length ? s : undefined
}

function normalize(raw: RawMsg): UiMsg {
    const normId =
        toStr(raw.messageId) ??
        toStr(raw.id) ??
        crypto.randomUUID()

    const content =
        toStr(raw.message) ??
        toStr(raw.text) ??
        toStr(raw.content) ??
        toStr(raw.body) ??
        ''

    const createdAt = (raw.createdAt as any) ?? (raw.time as any) ?? null

    return {
        id: normId!,
        roomId: toStr(raw.roomId),
        sender: toStr(raw.sender),
        username: toStr(raw.username),
        content,
        createdAt,
    }
}

/** 식별자 형태 판별 */
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isUuidLike(s?: string) { return !!s && UUID_RE.test(s) }
function isEmailLike(s?: string) { return !!s && EMAIL_RE.test(s) }

/** UUID는 하이픈 제거 + 소문자, 그 외는 소문자 비교 */
function eqId(a?: string, b?: string): boolean {
    if (!a || !b) return false
    const A = a.trim()
    const B = b.trim()
    const aIsUuid = isUuidLike(A)
    const bIsUuid = isUuidLike(B)
    if (aIsUuid && bIsUuid) {
        const na = A.toLowerCase().replace(/-/g, '')
        const nb = B.toLowerCase().replace(/-/g, '')
        return na === nb
    }
    // 이메일/기타는 소문자 비교
    return A.toLowerCase() === B.toLowerCase()
}

/** 나/상대 판정
 * - 내 후보키: userUuid, email (둘 다 비교)
 * - 메시지에서 비교대상: sender(1순위), username(보조: username에 이메일/UUID가 올 수 있는 환경 대비)
 * - 메시지 id는 사용자 식별과 무관 → 비교 제외
 */
function sameUser(meKeys: (string | undefined | null)[], msg: UiMsg): boolean {
    const candidates: (string | undefined)[] = [msg.sender, msg.username]
    for (const me of meKeys) {
        const mk = toStr(me)
        if (!mk) continue
        for (const c of candidates) {
            const ck = toStr(c)
            if (ck && eqId(mk, ck)) return true
        }
    }
    return false
}

/** 메시지 라벨: 내 메시지면 '나', 아니면 username 우선 표시(fallback 포함) */
function renderSenderLabel(m: UiMsg, mine: boolean, peerLabel: string): string {
    if (mine) return '나'
    return (
        m.username ||   // ① 서버가 내려주는 표시용 이름
        m.sender ||     // ② 식별자(이메일/UUID 등)
        m.id ||         // ③ 메시지 ID로라도 구분
        peerLabel ||    // ④ 방 정보 라벨
        'unknown'       // ⑤ 최종 폴백
    )
}

export default function ChatRoomPage(): React.ReactElement {
    const { roomId } = useParams<{ roomId: string }>()
    const nav = useNavigate()

    // 내 식별자: UUID 우선, 없으면 email
    const { userUuid, email, logout } = useAuth() as {
        userUuid?: string | null
        email?: string | null
        logout: (reason?: string) => void
    }

    const { setActiveRoom } = useNotifications()

    // 내 후보 키(여러 개를 동시에 보유)
    const myKeys = useMemo(
        () => [toStr(userUuid), toStr(email)].filter(Boolean) as string[],
        [userUuid, email]
    )

    // 상대 정보
    const [peerKey, setPeerKey] = useState<string>('')     // 비교/알림용(이메일 or UUID)
    const [peerLabel, setPeerLabel] = useState<string>('') // 화면 표시용(이메일 권장)

    // 메시지/입력/연결 상태
    const [messages, setMessages] = useState<UiMsg[]>([])
    const [text, setText] = useState('')
    const [connected, setConnected] = useState<boolean>(ws.isConnected())

    // refs
    const listRef = useRef<HTMLDivElement | null>(null)
    const endRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const inputWrapRef = useRef<HTMLDivElement | null>(null)

    // iOS 키보드 제어
    const suppressRef = useRef(false)
    const settleTimerRef = useRef<number | null>(null)
    const rafTokenRef = useRef<number | null>(null)
    const baseVhRef = useRef<number>(0)
    const kbPxRef = useRef<number>(0)
    const closingRef = useRef<boolean>(false)
    const KB_THRESHOLD = 80

    const setCSSVar = (k: string, v: string) =>
        document.documentElement.style.setProperty(k, v)

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

    const setViewportVars = () => {
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
    }

    const setInputHeightVar = () => {
        const h = Math.round(inputWrapRef.current?.getBoundingClientRect().height ?? 56)
        setCSSVar('--input-h', `${h}px`)
    }

    const onInputFocus = () => {}
    const onInputBlur = () => {
        closingRef.current = true
        suppressRef.current = false
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = window.setTimeout(() => {
            document.documentElement.classList.remove('kb-open')
            closingRef.current = false
        }, 500)
    }

    /** 세션 가드 */
    useEffect(() => {
        /*if (!userUuid && !email) {
            logout('no identity')
            nav('/auth', { replace: true })
            return
        }*/

        let graceTimer: number | null = null
        let tried = 0
        const MAX_GRACE_MS = 10000
        const RETRY_BASE_MS = 800
        const RETRY_MAX_MS = 5000

        const startGrace = () => {
            if (graceTimer) window.clearTimeout(graceTimer)
            graceTimer = window.setTimeout(() => {
                ws.ensureConnected()
            }, MAX_GRACE_MS)
        }

        const clearGrace = () => {
            if (graceTimer) {
                window.clearTimeout(graceTimer)
                graceTimer = null
            }
        }

        const onUp = () => {
            clearGrace()
            tried = 0
        }

        const onDown = () => {
            tried += 1
            const delay = Math.min(RETRY_BASE_MS * Math.pow(2, tried - 1), RETRY_MAX_MS)
            window.setTimeout(() => ws.ensureConnected(), delay)
        }

        ws.onConnect(onUp)
        ws.onDisconnect(onDown)

        ws.ensureConnected()
        startGrace()

        return () => {
            clearGrace()
            ws.offConnect(onUp)
            ws.offDisconnect(onDown)
        }
    }, [userUuid, email, logout, nav])

    /** mount: 뷰포트 세팅 */
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
    }, [])

    /** 방 정보에서 상대 라벨/키 구하기 */
    useEffect(() => {
        if (!roomId) return
        let cancelled = false

        ;(async () => {
            try {
                const res = await http.get<RoomLite[]>('/rooms')
                const rooms = Array.isArray(res.data) ? res.data : []
                const room = rooms.find(r => r.id === roomId)
                if (!room) return

                const mk = (toStr(userUuid) || toStr(email) || '')!.toLowerCase()
                const members = (room.members || []).map(m => String(m))
                const other = members.find(m => m && m.toLowerCase() !== mk) || ''

                if (!cancelled) {
                    setPeerKey(other)
                    setPeerLabel(other)
                }
            } catch {
                // ignore
            }
        })()

        return () => { cancelled = true }
    }, [roomId, userUuid, email])

    /** 방 진입/이동: 읽음 + 히스토리 */
    useEffect(() => {
        if (!roomId) return
        let cancelled = false
        setActiveRoom(roomId)

        ;(async () => {
            try {
                await http.post(`/rooms/${encodeURIComponent(roomId)}/read`)
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
            // setActiveRoom(null)
            ;(async () => {
                try { await http.post(`/rooms/${encodeURIComponent(roomId)}/read`) } catch {}
            })()
            // setActiveRoom(null)
        }
    }, [roomId, setActiveRoom])

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
                setMessages((prev) => [
                    ...prev,
                    normalize({ sender: 'system', message: String(payload) } as any),
                ])
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

    /** 메시지 변경 시 하단 정렬 */
    useEffect(() => {
        if (!suppressRef.current) scrollToEnd()
    }, [messages])

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

    const headerTitle = peerLabel || roomId
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
