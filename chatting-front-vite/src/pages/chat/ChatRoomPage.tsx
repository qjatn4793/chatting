// src/pages/chat/ChatRoomPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import '@/styles/chat.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/lib/ws'
import { RoomsAPI, MessageDto, RoomDto, AttachmentDto } from '@/api/rooms'
import { eqId, toStr } from '@/lib/identity'
import { toMillis, fmtKakaoTimeKST, fmtFullKST } from '@/lib/time'
import { useViewportKB } from '@/hooks/useViewportKB'
import InviteModal from '@/pages/chat/InviteModal'
import SmartImage from '@/components/SmartImage'

type UiMsg = {
    id: string
    roomId?: string
    sender?: string
    username?: string
    content: string
    createdAt: string | number | null
    attachments?: AttachmentDto[]
}

// ===== 이미지/파일 판별 유틸 =====
const isImageAttachment = (a: AttachmentDto) => {
    const ct = (a.contentType || '').toLowerCase()
    if (ct.startsWith('image/')) return true
    const name = `${a.originalName || ''}${a.url || ''}`.toLowerCase()
    return /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/.test(name)
}

// <input type="file"> 의 File 기준 이미지 판별
const isImageFile = (f: File) => {
    const ct = (f.type || '').toLowerCase()
    if (ct.startsWith('image/')) return true
    const name = (f.name || '').toLowerCase()
    return /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/.test(name)
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
        attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    }
}

const sameUser = (meKeys: string[], msg: UiMsg): boolean => {
    const candidates = [msg.sender, msg.username].map(toStr)
    for (const me of meKeys) for (const c of candidates) if (c && eqId(me, c)) return true
    return false
}
const renderSenderLabel = (m: UiMsg, mine: boolean, peerLabel: string): string =>
    mine ? '나' : (m.username || m.sender || m.id || peerLabel || 'unknown')

export default function ChatRoomPage(): JSX.Element {
    const { roomId } = useParams<{ roomId: string }>()
    const nav = useNavigate()
    const { userUuid, email } = useAuth() as { userUuid?: string | null; email?: string | null }
    const { setActiveRoom, setAtBottom } = useNotifications() as any

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

    const cameraInputRef = useRef<HTMLInputElement | null>(null)
    const albumInputRef = useRef<HTMLInputElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

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

    // ↑ 무한 스크롤 상태
    const [hasMore, setHasMore] = useState(true)         // 더 가져올 과거가 있는지
    const [loadingOlder, setLoadingOlder] = useState(false)

    const measureNearBottom = useCallback(() => {
        const list = listRef.current as HTMLDivElement | null
        if (!list) {
            nearBottomRef.current = true
            try { setAtBottom?.(true) } catch {}
            return true
        }
        const diff = list.scrollHeight - list.scrollTop - list.clientHeight
        const near = diff <= NEAR_PX
        nearBottomRef.current = near
        try { setAtBottom?.(near) } catch {}
        return near
    }, [setAtBottom])

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

    // 진입: 최신 50
    useEffect(() => {
        if (!roomId) return
        let cancelled = false
        setActiveRoom?.(roomId)
        setHasMore(true)
        ;(async () => {
            try { await RoomsAPI.markRead(roomId) } catch {}
            if (cancelled) return
            try {
                const res = await RoomsAPI.messages(roomId, 50)
                const list = (Array.isArray(res.data) ? res.data : []).map(normalize)
                // ASC 정렬
                list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
                setMessages(list)
                // 첫 페이지가 limit 미만이면 더 없음
                setHasMore(list.length >= 50)
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

    // 리스트 스크롤 → 바닥 근접 상태 갱신 (기존에 + 전역 통지)
    useEffect(() => {
        const el = listRef.current
        if (!el) return
        const onScroll = () => measureNearBottom()
        el.addEventListener('scroll', onScroll, { passive: true })
        measureNearBottom()
        return () => { el.removeEventListener('scroll', onScroll) }
    }, [measureNearBottom])

    // 상단 도달 시 더 불러오기
    const loadOlder = useCallback(async () => {
        if (!roomId || loadingOlder || !hasMore) return
        const list = listRef.current
        if (!list) return
        const oldest = messages[0]
        if (!oldest) return

        try {
            setLoadingOlder(true)
            const before = toMillis(oldest.createdAt) // 커서: 가장 오래된 메시지의 시각
            const prevScrollHeight = list.scrollHeight

            const res = await RoomsAPI.messages(roomId, 50, { before })
            let more = (Array.isArray(res.data) ? res.data : []).map(normalize)

            // 서버는 DESC로 줄 수 있으니 안전하게 ASC로 바꿈
            more.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))

            // 중복 제거 후 prepend
            setMessages((prev) => {
                const seen = new Set(prev.map(p => p.id))
                const onlyNew = more.filter(m => !seen.has(m.id))
                const next = [...onlyNew, ...prev]
                return next
            })

            // 스크롤 위치 보정: prepend 후에도 같은 메시지를 보고 있게
            requestAnimationFrame(() => {
                const newScrollHeight = list.scrollHeight
                list.scrollTop = newScrollHeight - prevScrollHeight
            })

            // 더 이상 없으면 hasMore=false
            if (more.length < 50) setHasMore(false)
        } catch (e) {
            console.error('[loadOlder] failed:', e)
        } finally {
            setLoadingOlder(false)
        }
    }, [roomId, messages, hasMore, loadingOlder])

    // 리스트 스크롤: 바닥 근접 + 상단 로딩
    useEffect(() => {
        const el = listRef.current
        if (!el) return
        const onScroll = () => {
            // 기존 바닥 근접 추적
            measureNearBottom()
            // 최상단 근접 시 과거 로드
            if (el.scrollTop <= 8) {
                loadOlder()
            }
        }
        el.addEventListener('scroll', onScroll, { passive: true })
        measureNearBottom()
        return () => { el.removeEventListener('scroll', onScroll) }
    }, [measureNearBottom, loadOlder])

    // WS 구독 (신규 메시지 하단 추가/치환)
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
                const idx = prev.findIndex((p) => p.id === msg.id);
                if (idx === -1) {
                    return [...prev, msg].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
                }
                const old = prev[idx];
                const oldAtt = old.attachments?.length ?? 0;
                const newAtt = msg.attachments?.length ?? 0;
                const shouldReplace =
                    newAtt > oldAtt || toMillis(msg.createdAt) > toMillis(old.createdAt) || (msg.content && msg.content !== old.content);
                if (!shouldReplace) return prev;
                const next = prev.slice();
                next[idx] = { ...old, ...msg };
                return next.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
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

    /* ========== 첨부 처리 (확장자/타입으로 판별, kind 미전달) ========== */

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

    /** 업로드 + 메시지 갱신 (FileList 또는 File[] 모두 지원) */
    const handleFiles = useCallback(
        async (input: FileList | File[] | null) => {
            if (!input || !roomId) return
            const fileArr = Array.from(input as any as File[])
            if (fileArr.length === 0) return

            try {
                // 실제 타입 기반으로 안내라벨 생성
                const imgCount = fileArr.filter(isImageFile).length
                const fileCount = fileArr.length - imgCount
                let label = '첨부'
                if (imgCount > 0 && fileCount === 0) label = '사진'
                else if (fileCount > 0 && imgCount === 0) label = '파일'

                const names = fileArr.map((f) => f.name || (isImageFile(f) ? '사진' : '파일'))
                const messageText =
                    names.length === 1
                        ? `[${label}] ${names[0]} 업로드`
                        : `[${label}] ${names.length}개 업로드: ${names.join(', ')}`

                // 1) 메시지 생성 → messageId 획득
                const msgRes = await RoomsAPI.send(roomId, { message: messageText })
                const messageId = (msgRes?.data as any)?.messageId || msgRes?.data?.messageId
                if (messageId == null) throw new Error('메시지 ID를 가져오지 못했습니다.')

                // 2) 업로드(들) — kind 미전달(서버가 파일별로 자동판단)
                if (fileArr.length === 1) {
                    await RoomsAPI.uploadFile(fileArr[0], undefined, { messageId })
                } else {
                    await RoomsAPI.uploadFiles(fileArr, undefined, { messageId })
                }

                // 3) 첨부 포함으로 재조회 → state 치환
                try {
                    const fresh = await RoomsAPI.getMessage(messageId)
                    const full = normalize(fresh.data)
                    setMessages((prev) => {
                        const idx = prev.findIndex((m) => m.id === full.id)
                        if (idx === -1) return [...prev, full].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
                        const next = prev.slice()
                        next[idx] = full
                        return next
                    })
                } catch {}

                setTimeout(() => scrollToBottom('smooth'), 10)
            } catch (e) {
                console.error('[handleFiles] upload failed:', e)
            } finally {
                // 동일 파일 재선택 가능하도록 모두 리셋
                if (albumInputRef.current) albumInputRef.current.value = ''
                if (cameraInputRef.current) cameraInputRef.current.value = ''
                if (fileInputRef.current) fileInputRef.current.value = ''
            }
        },
        [roomId, scrollToBottom]
    )

    // ====== 붙여넣기(Paste) 핸들러: 클립보드 이미지 전송 ======
    const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
        const cd = e.clipboardData
        if (!cd) return

        const items = cd.items || []
        const files: File[] = []
        for (const item of Array.from(items)) {
            // 이미지 Blob이 들어온 항목만 수집
            if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                const f = item.getAsFile()
                if (f) files.push(f)
            }
        }

        if (files.length > 0) {
            // 이미지 붙여넣기를 업로드로 전환하고 텍스트 붙여넣기는 막음
            e.preventDefault()
            handleFiles(files)
        }
        // 이미지가 없으면(텍스트만) 브라우저 기본 동작으로 텍스트가 입력창에 붙습니다.
    }

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

                    const images = (m.attachments || []).filter(isImageAttachment)
                    const files  = (m.attachments || []).filter((a) => !isImageAttachment(a))
                    const hasAttachments = images.length > 0 || files.length > 0

                    return (
                        <div key={m.id} className={`chat__msg ${mine ? 'me' : ''}`}>
                            <div className="chat__sender">{label}</div>
                            <div className="chat__row">
                                <div className="chat__bubble">
                                    {/* 텍스트: 첨부가 있으면 숨김 */}
                                    {!hasAttachments && m.content && (
                                        <span className="chat__text">{m.content}</span>
                                    )}

                                    {/* 이미지 첨부: 썸네일 그리드 */}
                                    {images.length > 0 && (
                                        <div className={`chat__attachGrid ${images.length === 1 ? 'single' : 'multi'}`}>
                                            {images.map((a) => (
                                                <a
                                                    key={`${a.id || a.storageKey}-img`}
                                                    className="chat__thumb"
                                                    href={a.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={a.originalName || 'image'}
                                                >
                                                    <SmartImage
                                                        src={a.url}
                                                        alt={a.originalName || 'image'}
                                                        loading="lazy"
                                                        className="chat__thumbImg"   // 필요시
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    {/* 일반 파일 첨부: 다운로드 링크 */}
                                    {files.length > 0 && (
                                        <ul className="chat__files">
                                            {files.map((a) => (
                                                <li key={`${a.id || a.storageKey}-file`} className="chat__file">
                                                    <a
                                                        href={a.url}
                                                        download={a.originalName || undefined}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title={a.originalName || 'download'}
                                                    >
                                                        <span className="chat__fileIcon">📎</span>
                                                        <span className="chat__fileName">{a.originalName || '파일'}</span>
                                                        {!!a.size && (
                                                            <span className="chat__fileSize">({Math.ceil(a.size / 1024)} KB)</span>
                                                        )}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
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
                {/* 첨부(+) */}
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

                    {/* 숨김 input (모두 handleFiles로 연결, kind 미전달) */}
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                    <input
                        ref={albumInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                </div>

                {/* 텍스트 입력 (+ 붙여넣기 이미지 업로드) */}
                <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={onInputBlur}
                    onPaste={handlePaste}
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
