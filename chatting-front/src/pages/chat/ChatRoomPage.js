import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../lib/api';
import '../../styles/chat.css';

export default function ChatRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { api, token, user, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const listRef = useRef(null);
  const clientRef = useRef(null);

  const me = user || 'me';

  // 초기 이력 로드
  useEffect(() => {
    api.get(`/api/rooms/${roomId}/messages?limit=100`)
      .then(res => setMessages(res.data || []))
      .catch(console.error);
  }, [api, roomId]);

  // 실시간 구독
  useEffect(() => {
    if (!token) return;
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 1500,
      debug: () => {},
    });

    client.onConnect = () => {
      setConnected(true);
      // 1) 방 주제
      client.subscribe(`/topic/room.${roomId}`, (frame) => {
        try {
          const msg = JSON.parse(frame.body);
          setMessages(prev => [...prev, msg]);
        } catch (e) { console.error(e); }
      });
      // 2) fallback: 서버가 /topic/messages 로만 보내는 경우, roomId 필터
      client.subscribe('/topic/messages', (frame) => {
        try {
          const msg = JSON.parse(frame.body);
          if (!msg.roomId || msg.roomId === roomId) {
            setMessages(prev => [...prev, msg]);
          }
        } catch (e) { /* ignore */ }
      });
      // 3) 세션 킥
      client.subscribe('/user/queue/kick', () => {
        logout();
      });
    };

    client.onStompError = () => {};
    client.onWebSocketClose = () => setConnected(false);

    client.activate();
    clientRef.current = client;

    return () => {
      if (client.active) client.deactivate();
      clientRef.current = null;
    };
  }, [token, roomId, logout]);

  // 자동 스크롤
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const m = text.trim();
    if (!m) return;
    try {
      await api.post(`/api/rooms/${roomId}/send`, { message: m });
      setText('');
    } catch (e) {
      console.error(e);
      alert('전송 실패');
    }
  };

  const leave = () => navigate('/friends');

  return (
    <div className="chat">
      <div className="chat__header">
        <button className="btn btn--ghost" onClick={leave}>← Back</button>
        <h3 className="chat__title">Room {roomId}</h3>
        <div />
      </div>

      <div className="chat__list" ref={listRef}>
        {messages.map((m, i) => {
          const mine = (m.sender === me);
          return (
            <div key={i} className={`bubble ${mine ? 'bubble--me' : 'bubble--other'}`}>
              <div className="bubble__sender">{m.sender || 'unknown'}</div>
              <div className="bubble__body">{m.message || m.text}</div>
              {m.sentAt && <div className="bubble__time">{new Date(m.sentAt).toLocaleTimeString()}</div>}
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="chat__empty">아직 메시지가 없습니다. 첫 메시지를 보내보세요!</div>
        )}
      </div>

      <div className="chat__input">
        <input
          placeholder="메시지를 입력하세요"
          value={text}
          onChange={e=>setText(e.target.value)}
          onKeyDown={e => (e.key === 'Enter') && send()}
        />
        <button className="btn" disabled={!connected || !text.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}
