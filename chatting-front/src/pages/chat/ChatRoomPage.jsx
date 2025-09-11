import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import http, { API_BASE_URL } from '../../api/http';
import '../../styles/chat.css';

// JWT payload 디코드 (sub/username 등에서 현재 사용자명 추출)
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}
function getMeFromToken() {
  const t = localStorage.getItem('jwt');
  if (!t) return null;
  const p = decodeJwt(t);
  return p?.username || p?.sub || p?.name || p?.user || null;
}

export default function ChatRoomPage() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);
  const endRef = useRef(null);

  // 현재 로그인한 사용자명 (JWT에서 추출)
  const me = useMemo(() => getMeFromToken(), []);

  // 내/남 메시지 구분 함수
  const isMine = (m) => {
    const sender =
      m.sender ||
      m.from ||
      m.senderUsername ||
      m.user ||
      m.author ||
      '';
    if (!me || !sender) return false;
    return String(sender).toLowerCase() === String(me).toLowerCase();
  };

  // 서버에서 오는 다양한 키를 흡수 + mine 세팅
  const normalize = (m) => {
    const obj = {
      id: m.id ?? crypto.randomUUID(),
      sender: m.sender || m.from || m.senderUsername || m.user || 'unknown',
      content: m.message || m.text || m.content || m.body || '',
      createdAt: m.createdAt || m.time || null,
    };
    return { ...obj, mine: isMine(obj) };
  };

  // 히스토리 로딩
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await http.get(`/api/rooms/${encodeURIComponent(roomId)}/messages?limit=50`);
        if (!alive) return;
        const list = Array.isArray(res.data) ? res.data.map(normalize) : [];
        setMessages(list);
      } catch (e) {
        console.error('[HTTP] history failed', e?.response?.data || e);
      }
    })();
    return () => { alive = false; };
  }, [roomId]);

  // WebSocket 연결 + 구독
  useEffect(() => {
    if (clientRef.current?.active) clientRef.current.deactivate();

    const token = localStorage.getItem('jwt');
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      debug: (str) => console.log('[STOMP]', str),
      reconnectDelay: 5000,
    });

    client.onConnect = () => {
      setConnected(true);
      const dest = `/topic/rooms/${roomId}`;  // 백엔드와 동일 경로
      console.log('[WS] subscribing ->', dest);

      client.subscribe(dest, (frame) => {
        try {
          const payload = JSON.parse(frame.body);
          console.log('[WS] message <-', payload);
          setMessages((prev) => [...prev, normalize(payload)]);
        } catch (e) {
          console.warn('[WS] parse failed, raw:', frame.body);
          setMessages((prev) => [...prev, normalize({ sender: 'system', content: frame.body })]);
        }
      });
    };

    client.onStompError = (frame) => {
      console.error('[WS] broker error', frame);
    };

    client.activate();
    clientRef.current = client;

    return () => {
      if (client.active) client.deactivate();
      clientRef.current = null;
      setConnected(false);
    };
  }, [roomId]); // roomId 변경 시 재구독

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      // 서버가 브로드캐스트를 해주므로 낙관적 추가는 생략(중복 방지)
      await http.post(`/api/rooms/${encodeURIComponent(roomId)}/send`, { message: body });
      setText('');
    } catch (e) {
      console.error('[HTTP] send failed', e?.response?.data || e);
    }
  };

  return (
    <div className="chat">
      <div className="chat__header">
        <button onClick={() => nav('/friends')}>← Friends</button>
        <h2>Room: {roomId}</h2>
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="메시지를 입력하세요"
        />
        <button disabled={!connected || !text.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}
