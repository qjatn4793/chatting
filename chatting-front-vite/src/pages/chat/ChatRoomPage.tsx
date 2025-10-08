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
import InviteModal from '@/pages/chat/InviteModal'

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

    const [inviteOpen, setInviteOpen] = useState(false)

    const [attachOpen, setAttachOpen] = useState(false)
    const attachBtnRef = useRef<HTMLButtonElement | null>(null)
    const attachMenuRef = useRef<HTMLDivElement | null>(null)

    // 숨김 input refs
    const cameraInputRef = useRef<HTMLInputElement | null>(null)
    const albumInputRef = useRef<HTMLInputElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    // 모바일 판별: 터치 + UA
    const isMobile = useMemo(() => {
        const ua = navigator.userAgent || ''
        const touch = 'ontouchstart' in window || (navigator as any).maxTouchPoints > 0
        const mobileRe = /Android|iPhone|iPad|iPod/i.test(ua)
        return touch && mobileRe
    }, [])

    const listRef = useRef<HTMLDivElement | null>(null)
    const endRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)

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

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        const list = listRef.current as HTMLDivElement | null
        if (!list) return
        const scrollToFn = (list as any).scrollTo as ((opts: ScrollToOptions) => void) | undefined
        const top = list.scrollHeight
        if (typeof scrollToFn === 'function') scrollToFn.call(list, { top, behavior })
        else (list as HTMLDivElement).scrollTop = top
    }, [])

    const { setInputHeightRef, onInputBlur } = useViewportKB({
        onStable: () => { if (nearBottomRef.current) scrollToBottom('auto') },
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

    // 상대 라벨
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
                    measureNearBottom()
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
            const wasNearBottom = measureNearBottom()
            const msg = normalize(payload)

            setMessages((prev) => {
                if (msg.id && prev.some((p) => p.id === msg.id)) return prev
                const next = [...prev, msg].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
                return next
            })

            const mine = sameUser(myKeys, msg)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (mine || wasNearBottom) scrollToBottom('smooth')
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

    // 메시지 변경 → 바닥 유지
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

    /* ========== 첨부 처리 ========== */

    // 문서 아무 곳이나 클릭하면 attach 메뉴 닫기
    useEffect(() => {
        if (!attachOpen) return
        const onDown = (ev: MouseEvent) => {
            const t = ev.target as Node
            if (attachMenuRef.current?.contains(t) || attachBtnRef.current?.contains(t)) return
            setAttachOpen(false)
        }
        const onEsc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAttachOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onEsc)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onEsc)
        }
    }, [attachOpen])

    const handleFiles = useCallback(async (files: FileList | null, kind: 'image' | 'file') => {
        if (!files || !roomId) return
        // TODO: 실제 업로드 API 연동 지점
        // - 여기서 서버에 업로드 후, 업로드 URL들을 메시지에 담아 보내세요.
        const names = Array.from(files).map((f) => f.name || (kind === 'image' ? '사진' : '파일'))
        const label = kind === 'image' ? '사진' : '파일'
        try {
            await RoomsAPI.send(roomId, { message: `[${label}] ${names.join(', ')}` })
            setTimeout(() => scrollToBottom('smooth'), 10)
        } finally {
            // 같은 파일 다시 선택 가능하도록 value 초기화
            if (kind === 'image') {
                (albumInputRef.current as HTMLInputElement | null)?.setAttribute('value', '')
                ;(cameraInputRef.current as HTMLInputElement | null)?.setAttribute('value', '')
            } else {
                (fileInputRef.current as HTMLInputElement | null)?.setAttribute('value', '')
            }
        }
    }, [roomId, scrollToBottom])

    const onPickCamera = () => {
        if (!isMobile) return
        cameraInputRef.current?.click()
        setAttachOpen(false)
    }
    const onPickAlbum = () => {
        albumInputRef.current?.click()
        setAttachOpen(false)
    }
    const onPickFile = () => {
        fileInputRef.current?.click()
        setAttachOpen(false)
    }

    return (
        <div className="chat">
            <div className="chat__header">
                <button onClick={() => nav('/chat')}>← chat</button>
                <h2></h2>
                <div className="chat__headerRight">
                    {!!roomId && (
                        <button className="btn btn--sm" onClick={() => setInviteOpen(true)}>
                            친구 초대
                        </button>
                    )}
                </div>
            </div>

            <div className="chat__list" id="chat-list" ref={listRef}>
                {messages.map((m) => {
                    const mine = sameUser(myKeys, m)
                    const label = renderSenderLabel(m, mine, peerLabel)
                    return (
                        <div key={m.id} className={`chat__msg ${mine ? 'me' : ''}`}>
                            <div className="chat__sender">{label}</div>
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

            <div
                className="chat__input"
                ref={setInputHeightRef as any}
                onTouchMoveCapture={(e) => { e.stopPropagation() }}
            >
                {/* 첨부(+ 버튼) & 메뉴 */}
                <div className="attach" style={{ position: 'relative' }}>
                    <button
                        ref={attachBtnRef}
                        type="button"
                        className="btn btn--icon"
                        aria-haspopup="menu"
                        aria-expanded={attachOpen}
                        title="+"
                        onClick={() => setAttachOpen((v) => !v)}
                    >
                        +
                    </button>

                    {attachOpen && (
                        <div
                            ref={attachMenuRef}
                            className="attach__menu"
                            role="menu"
                            aria-label="첨부"
                        >
                            <button
                                role="menuitem"
                                className="attach__item"
                                onClick={onPickCamera}
                                disabled={!isMobile}
                                title={isMobile ? '카메라로 촬영' : '모바일에서만 사용 가능'}
                            >
                                📷 사진 촬영
                            </button>
                            <button
                                role="menuitem"
                                className="attach__item"
                                onClick={onPickAlbum}
                                title="앨범에서 선택"
                            >
                                🖼️ 앨범
                            </button>
                            <button
                                role="menuitem"
                                className="attach__item"
                                onClick={onPickFile}
                                title="파일 선택"
                            >
                                📎 파일
                            </button>
                        </div>
                    )}
                </div>

                {/* 텍스트 입력 */}
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

            {/* 초대 모달 */}
            {roomId && (
                <InviteModal
                    open={inviteOpen}
                    onClose={() => setInviteOpen(false)}
                    roomId={roomId}
                />
            )}
        </div>
    )
}
