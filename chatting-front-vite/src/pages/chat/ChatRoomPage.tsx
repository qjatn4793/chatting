import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import http from '@/api/http'
import '@/styles/chat.css'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { ws } from '@/ws' // 전역 WS 싱글톤

type RawMsg = {
  id?: string
  sender?: string
  from?: string
  senderUsername?: string
  user?: string
  message?: string
  text?: string
  content?: string
  body?: string
  createdAt?: string | number
  time?: string | number
}

type UiMsg = {
  id: string
  sender: string
  content: string
  createdAt: string | number | null
  mine: boolean
}

export default function ChatRoomPage(): React.ReactElement {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { userId } = useAuth() as { userId?: string | null }
  const { setActiveRoom, clearFriend } = useNotifications()

  const [messages, setMessages] = useState<UiMsg[]>([])
  const [text, setText] = useState('')
  const [connected, setConnected] = useState<boolean>(ws.isConnected())
  const endRef = useRef<HTMLDivElement | null>(null)
  const peerRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const me = userId ?? ''

  const isMine = (m: { sender?: string }): boolean => {
    const sender = (m.sender ?? '').toString()
    if (!me || !sender) return false
    return sender.toLowerCase() === me.toString().toLowerCase()
  }

  const normalize = (m: RawMsg): UiMsg => {
    const id = m.id ?? crypto.randomUUID()
    const sender = m.sender || m.from || m.senderUsername || m.user || 'unknown'
    const content = m.message || m.text || m.content || m.body || ''
    const createdAt = (m.createdAt as any) || (m.time as any) || null
    const base = { id, sender: String(sender), content: String(content), createdAt }
    return { ...base, mine: isMine(base) }
  }

  // 방 진입/이동 시: 읽음 처리 + 현재 방 지정 + 히스토리 로드
  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    setActiveRoom(roomId)

    ;(async () => {
      try {
        // baseURL에 /api가 포함되어 있으므로 /rooms 로 호출
        const { data } = await http.post(`/rooms/${encodeURIComponent(roomId)}/read`)
        const friend = data?.friendUsername || null
        if (friend) {
          peerRef.current = friend
          clearFriend(friend) // 로컬 배지 0
        }
      } catch (_) {}

      if (cancelled) return

      try {
        const res = await http.get(`/rooms/${encodeURIComponent(roomId)}/messages?limit=50`)
        const list = Array.isArray(res.data) ? res.data.map(normalize) : []
        setMessages(list)
      } catch (_) {}
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

  // WebSocket 구독 (전역 싱글톤 사용)
  useEffect(() => {
    if (!roomId) return

    // 연결 이벤트: true로 표시
    const markConnected = () => setConnected(true)
    ws.onConnect(markConnected)
    // 현재 연결 상태 반영
    setConnected(ws.isConnected())

    // 방 토픽 구독
    const unsub = ws.subscribe(`/topic/rooms/${roomId}`, (payload: any) => {
      try {
        setMessages((prev) => {
          const msg = normalize(payload as RawMsg)
          if (msg.id && prev.some((p) => p.id === msg.id)) return prev
          return [...prev, msg]
        })
      } catch {
        setMessages((prev) => [
          ...prev,
          normalize({ sender: 'system', content: String(payload) } as any),
        ])
      }
    })

    return () => {
      unsub()
      // 페이지 이탈 시 UI상 연결 표시는 내려둠(실제 소켓은 RealtimeProvider가 관리)
      setConnected(false)
    }
  }, [roomId])

  // 자동 스크롤
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const body = text.trim()
    if (!body || !roomId) return
    try {
      // 서버 브로드캐스트에 의존(낙관적 추가 없음)
      await http.post(`/rooms/${encodeURIComponent(roomId)}/send`, { message: body })
      setText('')
      inputRef.current?.focus({ preventScroll: true })
    } catch (_) {}
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
        <span className="me">나: {me || '알 수 없음'}</span>
        <span className="muted">
          {connected ? `connected${me ? ' as ' + me : ''}` : 'connecting...'}
        </span>
      </div>

      <div className="chat__list">
        {messages.map((m) => (
          <div key={m.id} className={`chat__msg ${m.mine ? 'me' : ''}`}>
            <div className="chat__sender">{m.sender}</div>
            <div className="chat__bubble">{m.content}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat__input">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
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