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
  const { userId } = useAuth() as { userId?: string | null }
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

  /** ---- iOS 키보드 애니메이션 억제/정리 ---- */
  const suppressRef = useRef(false)           // 키보드 애니메이션 동안 true
  const settleTimerRef = useRef<number | null>(null)
  const rafTokenRef = useRef<number | null>(null)

  const beginKeyboardPhase = (ms = 450) => {
    suppressRef.current = true
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => {
      suppressRef.current = false
      scrollToEnd()
      document.documentElement.classList.remove('kb-open')
    }, ms)
    document.documentElement.classList.add('kb-open')
  }

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

  /** visualViewport 기반 높이/키보드 변수 갱신 */
  const setViewportVars = () => {
    const root = document.documentElement.style
    const vv: any = (window as any).visualViewport
    if (vv && typeof vv.height === 'number') {
      root.setProperty('--vvh', `${vv.height}px`)
      const kb = Math.max(0, (window.innerHeight || 0) - vv.height)
      root.setProperty('--kb', `${kb}px`)
    } else {
      root.setProperty('--vvh', `${window.innerHeight}px`)
      root.setProperty('--kb', `0px`)
    }
  }

  /** 입력바 실제 높이 1회/회전 시만 측정 */
  const setInputHeightVar = () => {
    const h = Math.round(inputWrapRef.current?.getBoundingClientRect().height ?? 56)
    document.documentElement.style.setProperty('--input-h', `${h}px`)
  }

  /** 입력 포커스/블러 */
  const onInputFocus = () => beginKeyboardPhase(450)
  const onInputBlur = () => {
    suppressRef.current = false
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
    document.documentElement.classList.remove('kb-open')
  }

  /** mount: 초기 세팅 */
  useEffect(() => {
    setViewportVars()
    // 입력바 높이는 초기 1회 + 회전 시만 갱신
    requestAnimationFrame(setInputHeightVar)

    const vv: any = (window as any).visualViewport

    // visualViewport 이벤트: rAF 스로틀 + passive + 억제 가드
    const onVv = () => {
      if (rafTokenRef.current) return
      rafTokenRef.current = requestAnimationFrame(() => {
        rafTokenRef.current = null
        setViewportVars()
        if (!suppressRef.current) scrollToEnd()
      })
    }

    if (vv) {
      vv.addEventListener('resize', onVv, { passive: true })
      vv.addEventListener('scroll', onVv, { passive: true })
    }

    const onResize = () => {
      setViewportVars()
      setInputHeightVar()
      if (!suppressRef.current) scrollToEnd()
    }

    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('orientationchange', onResize, { passive: true })

    return () => {
      if (vv) {
        vv.removeEventListener('resize', onVv as any)
        vv.removeEventListener('scroll', onVv as any)
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
        <button onClick={() => nav('/friends')}>← Friends</button>
        <h2>Room: {roomId}</h2>
        <span className="me">나: {toStr(userId) || '알 수 없음'}</span>
        <span className="muted">
          {connected ? `connected${toStr(userId) ? ' as ' + toStr(userId) : ''}` : 'connecting...'}
        </span>
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