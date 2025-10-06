import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import '@/styles/chat.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/lib/ws'
import { RoomsAPI, MessageDto, RoomDto } from '@/api/rooms'
import { eqId, toStr } from '@/lib/identity'
import { toMillis } from '@/lib/time'
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
    const endRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)

    // “바닥 근접” 상태 추적 → 새 메시지 시 강제 점프 방지
    const nearBottomRef = useRef(true)
    const NEAR_PX = 36

    const measureNearBottom = useCallback(() => {
        const el = listRef.current
        if (!el) { nearBottomRef.current = true; return }
        const diff = el.scrollHeight - el.scrollTop - el.clientHeight
        nearBottomRef.current = diff <= NEAR_PX
    }, [])

    const scrollToEnd = useCallback((behavior: ScrollBehavior = 'auto') => {
        const el = endRef.current
        if (!el) return
        try { el.scrollIntoView({ behavior, block: 'end' }) }
        catch {
            const list = listRef.current
            if (list) list.scrollTop = list.scrollHeight
        }
    }, [])

    // ✅ 새 훅: 키보드/주소창 변동 대응(+ 드래그 체이닝 방지)
    const { setInputHeightRef, onInputBlur } = useViewportKB({
        onStable: () => scrollToEnd('auto'),   // 레이아웃 안정 후만 자동 스크롤
        kbThreshold: 80,                       // 80px 이상 변화만 키보드로 간주
        blockDrag: true,                       // 입력바에서 위로 끌어올려도 상위로 새지 않도록
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
                requestAnimationFrame(() => scrollToEnd('auto'))
            } catch {}
        })()
        return () => {
            cancelled = true
            ;(async () => { try { await RoomsAPI.markRead(roomId) } catch {} })()
        }
    }, [roomId, setActiveRoom, scrollToEnd])

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
            const msg = normalize(payload)
            setMessages((prev) => {
                if (msg.id && prev.some((p) => p.id === msg.id)) return prev
                const next = [...prev, msg].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
                return next
            })

            const mine = sameUser(myKeys, msg)
            if (mine || nearBottomRef.current) {
                requestAnimationFrame(() => scrollToEnd('smooth'))
            }
        })

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                ws.ensureConnected()
                if (nearBottomRef.current) scrollToEnd('auto')
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
    }, [roomId, scrollToEnd, myKeys])

    // 메시지 변경 → 바닥 근접이면 한 번 더 정렬
    useEffect(() => {
        if (nearBottomRef.current) scrollToEnd('auto')
    }, [messages, scrollToEnd])

    const send = useCallback(async () => {
        const body = text.trim()
        if (!body || !roomId) return
        try {
            await RoomsAPI.send(roomId, { message: body })
            setText('')
            inputRef.current?.focus({ preventScroll: true })
            // 내가 보낸 메시지는 항상 아래로
            setTimeout(() => scrollToEnd('smooth'), 10)
        } catch {}
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

            {/* 입력 바: 훅이 ref로 높이를 실측하고, 키보드 시 fixed 전환됨 */}
            <div
                className="chat__input"
                ref={setInputHeightRef as any}
                onTouchMoveCapture={(e) => {
                    // 방어적으로 한 번 더 상위 전파를 막아 iOS 체이닝 완화
                    // (hook에서도 차단하지만 중복해도 무해)
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
