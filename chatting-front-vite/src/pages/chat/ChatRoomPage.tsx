import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import '@/styles/chat.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/lib/ws'
import { RoomsAPI, MessageDto, RoomDto } from '@/api/rooms'
import { eqId, toStr } from '@/lib/identity'
import { toMillis, fmtKakaoTimeKST, fmtFullKST } from '@/lib/time'
import { useViewportKB } from '@/hooks/useViewportKB'

type UiMsg = {
    id: string
    roomId?: string
    sender?: string
    username?: string
    content: string
    createdAt: string | number | null
}

const normalize = (raw: MessageDto): UiMsg => {
    const id =
        toStr(raw.messageId) ??
        (raw.id != null ? String(raw.id) : undefined) ??
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
    const candidates = [msg.sender, msg.username].map(toStr)
    for (const me of meKeys) {
        for (const c of candidates) if (c && eqId(me, c)) return true
    }
    return false
}

const renderSenderLabel = (m: UiMsg, mine: boolean, peerLabel: string): string =>
    mine ? '나' : (m.username || m.sender || m.id || peerLabel || 'unknown')

export default function ChatRoomPage(): JSX.Element {
    const { roomId } = useParams<{ roomId: string }>()
    const nav = useNavigate()
    const { userUuid, email } = useAuth() as { userUuid?: string | null; email?: string | null }
    const { setActiveRoom } = useNotifications() as any

    const myKeys = useMemo(() => {
        const keys = [toStr(userUuid)]
        const em = toStr(email)
        if (em) keys.push(em)
        return keys.filter(Boolean) as string[]
    }, [userUuid, email])

    const [peerLabel, setPeerLabel] = useState('')
    const [messages, setMessages] = useState<UiMsg[]>([])
    const [text, setText] = useState('')
    const [connected, setConnected] = useState<boolean>(ws.isConnected())

    const listRef = useRef<HTMLDivElement | null>(null)
    const endRef = useRef<HTMLDivElement | null>(null) // 남겨두지만 직접 scroll을 우선 사용
    const inputRef = useRef<HTMLInputElement | null>(null)

    // “바닥 근접” 상태 추적 → 새 메시지 시 강제 점프 조건
    const nearBottomRef = useRef(true)
    const NEAR_PX = 36

    const measureNearBottom = useCallback(() => {
        const list = listRef.current as HTMLDivElement | null
        if (!list) { nearBottomRef.current = true; return true }
        const diff = list.scrollHeight - list.scrollTop - list.clientHeight
        const near = diff <= NEAR_PX
        nearBottomRef.current = near
        return near
    }, [])

    // 컨테이너 직접 스크롤 방식 (iOS fixed+sticky 조합에서도 안정)
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        const list = listRef.current as HTMLDivElement | null
        if (!list) return

        // 안전한 함수 체크 (in 연산자 X)
        const scrollToFn = (list as any).scrollTo as
            | ((opts: ScrollToOptions) => void)
            | undefined

        const top = list.scrollHeight

        if (typeof scrollToFn === 'function') {
            // call로 this 바인딩 명시
            scrollToFn.call(list, { top, behavior })
        } else {
            // fallback
            ;(list as HTMLDivElement).scrollTop = top
        }
    }, [])

    const { setInputHeightRef, onInputBlur } = useViewportKB({
        onStable: () => {
            // 레이아웃 안정 후: 사용자가 바닥 근처였으면 유지
            if (nearBottomRef.current) scrollToBottom('auto')
        },
        kbThreshold: 80,
        blockDrag: true,
    })

    useEffect(() => {
        const onUp = () => setConnected(true)
        const onDown = () => setConnected(false)
        ws.onConnect(onUp); ws.onDisconnect(onDown)
        ws.ensureConnected(); setConnected(ws.isConnected())
        return () => { ws.offConnect(onUp); ws.offDisconnect(onDown) }
    }, [])

    // 상대 라벨 (members에서 나 제외)
    useEffect(() => {
        if (!roomId) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await RoomsAPI.list()
                const room = (Array.isArray(res.data) ? res.data : []).find((r: RoomDto) => r.id === roomId)
                if (!room) return
                const myLower = (toStr(userUuid) || toStr(email) || '')!.toLowerCase()
                const other = (room.members || []).map(String).find((m) => m && m.toLowerCase() !== myLower) || ''
                if (!cancelled) setPeerLabel(other)
            } catch {}
        })()
        return () => { cancelled = true }
    }, [roomId, userUuid, email])

    // 진입 시: 읽음 + 히스토리
    useEffect(() => {
        if (!roomId) return
        let cancelled = false
        setActiveRoom?.(roomId)
        ;(async () => {
            try { await RoomsAPI.markRead(roomId) } catch {}
            if (cancelled) return
            try {
                const res = await RoomsAPI.messages(roomId, 50)
                const list = (Array.isArray(res.data) ? res.data : []).map(normalize)
                list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
                setMessages(list)
                requestAnimationFrame(() => {
                    measureNearBottom() // 초기엔 항상 true가 되도록
                    scrollToBottom('auto')
                })
            } catch {}
        })()
        return () => {
            cancelled = true
            ;(async () => { try { await RoomsAPI.markRead(roomId) } catch {} })()
        }
    }, [roomId, setActiveRoom, scrollToBottom, measureNearBottom])

    // 리스트 스크롤 → 바닥 근접 상태 갱신
    useEffect(() => {
        const el = listRef.current
        if (!el) return
        const onScroll = () => measureNearBottom()
        el.addEventListener('scroll', onScroll, { passive: true })
        measureNearBottom()
        return () => { el.removeEventListener('scroll', onScroll) }
    }, [measureNearBottom])

    // WS 구독
    useEffect(() => {
        if (!roomId) return
        const markConnected = () => setConnected(true)
        const markDisconnected = () => setConnected(false)
        ws.onConnect(markConnected); ws.onDisconnect(markDisconnected)
        setConnected(ws.isConnected())

        const unsub = ws.subscribe(`/topic/rooms/${roomId}`, (payload: MessageDto) => {
            // 👇 메시지 추가 "이전"의 바닥 근접 여부를 기준으로 유지
            const wasNearBottom = measureNearBottom()
            const msg = normalize(payload)

            setMessages((prev) => {
                if (msg.id && prev.some((p) => p.id === msg.id)) return prev
                const next = [...prev, msg].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
                return next
            })

            const mine = sameUser(myKeys, msg)

            // DOM 반영 후 두 번의 rAF로 안정적으로 스크롤 (iOS에서 paint 이후 보장)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (mine || wasNearBottom) {
                        scrollToBottom('smooth')
                    }
                })
            })
        })

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                ws.ensureConnected()
                if (nearBottomRef.current) scrollToBottom('auto')
            }
        }
        const onOnline = () => { ws.ensureConnected() }

        document.addEventListener('visibilitychange', onVisible, { passive: true } as any)
        window.addEventListener('online', onOnline, { passive: true } as any)
        window.addEventListener('pageshow', onOnline, { passive: true } as any)

        return () => {
            unsub()
            ws.offConnect(markConnected); ws.offDisconnect(markDisconnected)
            document.removeEventListener('visibilitychange', onVisible as any)
            window.removeEventListener('online', onOnline as any)
            window.removeEventListener('pageshow', onOnline as any)
        }
    }, [roomId, scrollToBottom, myKeys, measureNearBottom])

    // 메시지 변경 → 내가 보낸 뒤에는 항상 바닥, 그 외에는 nearBottom이면 유지
    useEffect(() => {
        if (nearBottomRef.current) scrollToBottom('auto')
    }, [messages, scrollToBottom])

    const send = useCallback(async () => {
        const body = text.trim()
        if (!body || !roomId) return
        try {
            await RoomsAPI.send(roomId, { message: body })
            setText('')
            inputRef.current?.focus({ preventScroll: true })
            // 내가 보낸 메시지는 항상 아래로
            setTimeout(() => scrollToBottom('smooth'), 10)
        } catch {}
    }, [roomId, text, scrollToBottom])

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

                            {/* 버블과 시간을 한 줄로 */}
                            <div className="chat__row">
                                <div className="chat__bubble">
                                    <span className="chat__text">{m.content}</span>
                                </div>

                                <time
                                    className="chat__time-outside"
                                    title={fmtFullKST(m.createdAt ?? '')}
                                    dateTime={new Date(toMillis(m.createdAt ?? '')).toISOString()}
                                >
                                    {fmtKakaoTimeKST(m.createdAt ?? '')}
                                </time>
                            </div>
                        </div>
                    )
                })}
                <div ref={endRef} id="chat-end-sentinel" />
            </div>

            {/* 입력 바: 훅이 ref로 높이를 실측하고, 키보드 시 fixed 전환됨 */}
            <div
                className="chat__input"
                ref={setInputHeightRef as any}
                onTouchMoveCapture={(e) => {
                    // 방어적으로 한 번 더 상위 전파를 막아 iOS 체이닝 완화
                    e.stopPropagation()
                }}
            >
                <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
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
