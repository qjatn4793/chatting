import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import http, { API_BASE_URL } from '../../api/http';
import '../../styles/chat.css';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';

export default function ChatRoomPage() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const { userId } = useAuth();
  const { setActiveRoom, clearFriend } = useNotifications(); // 현재 방 지정(알림 카운트 제외)
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);
  const endRef = useRef(null);
  const peerRef = useRef(null); // DM 상태 캐시

  const me = userId;

  const isMine = (m) => {
    const sender =
      m.sender || m.from || m.senderUsername || m.user || m.author || '';
    if (!me || !sender) return false;
    return String(sender).toLowerCase() === String(me).toLowerCase();
  };

  const normalize = (m) => {
    const obj = {
      id: m.id ?? crypto.randomUUID(),
      sender: m.sender || m.from || m.senderUsername || m.user || 'unknown',
      content: m.message || m.text || m.content || m.body || '',
      createdAt: m.createdAt || m.time || null,
    };
    return { ...obj, mine: isMine(obj) };
  };

  // 방 진입/이동 시 서버에 읽음 처리 + 현재 방 설정
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    // 현재 방 지정 → 알림 훅에서 이 방의 들어오는 알림은 카운트하지 않음
    setActiveRoom(roomId);

    (async () => {
      try {
        await http.post(`/api/rooms/${encodeURIComponent(roomId)}/read`);
      } catch (e) {
        // 읽음 처리 실패해도 UI 진행은 가능
        // console.warn('[READ] failed', e?.response?.data || e);
      }
      if (cancelled) return;
      // 히스토리 로딩
      try {
        const res = await http.get(
          `/api/rooms/${encodeURIComponent(roomId)}/messages?limit=50`
        );
        const list = Array.isArray(res.data) ? res.data.map(normalize) : [];
        setMessages(list);
      } catch (e) {
        // console.error('[HTTP] history failed', e?.response?.data || e);
      }
    })();

    return () => {
      cancelled = true;
      setActiveRoom(null); // 방 이탈 시 현재 방 해제
    };
  }, [roomId, setActiveRoom]);

  // WebSocket 연결 + 구독
  useEffect(() => {
    if (!roomId) return;

    // 이전 연결 종료
    try { clientRef.current?.deactivate(); } catch {}
    const jwt = localStorage.getItem('jwt');

    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
      connectHeaders: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      // debug: (str) => console.log('[STOMP]', str),
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
    });

    client.onConnect = () => {
      setConnected(true);
      const dest = `/topic/rooms/${roomId}`;
      client.subscribe(dest, (frame) => {
        try {
          const payload = JSON.parse(frame.body);
          setMessages((prev) => {
            const msg = normalize(payload);
            // 중복 방지(같은 id가 이미 있으면 무시)
            if (msg.id && prev.some((p) => p.id === msg.id)) return prev;
            return [...prev, msg];
          });
        } catch {
          setMessages((prev) => [...prev, normalize({ sender: 'system', content: frame.body })]);
        }
      });
    };

    client.onStompError = () => {
      // console.error('[WS] broker error', frame);
    };

    client.activate();
    clientRef.current = client;

    return () => {
      setConnected(false);
      try { client.deactivate(); } catch {}
      clientRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    setActiveRoom(roomId);
    (async () => {
      try {
        const { data } = await http.post(`/api/rooms/${encodeURIComponent(roomId)}/read`);
        const friend = data?.friendUsername || null;
        if (friend) {
          peerRef.current = friend;
          clearFriend(friend); // 로컬 배지 0
        }
      } catch (_) {}
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
      setActiveRoom(null);
      const friend = peerRef.current;
      (async () => {
        try {
          await http.post(`/api/rooms/${encodeURIComponent(roomId)}/read`);
        } catch (_) {}
        if (friend) clearFriend(friend);
      })();
      setActiveRoom(null);
    };

  }, [roomId, setActiveRoom, clearFriend]);

  // 자동 스크롤
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      // 서버가 브로드캐스트를 해주므로 낙관적 추가는 생략
      await http.post(`/api/rooms/${encodeURIComponent(roomId)}/send`, { message: body });
      setText('');
    } catch (e) {
      // console.error('[HTTP] send failed', e?.response?.data || e);
    }
  };

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