import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import http, { API_BASE_URL } from '../../api/http';
import '../../styles/chat.css';

export default function ChatRoomPage() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('jwt');
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      debug: () => {}, reconnectDelay: 5000,
    });

    client.onConnect = () => {
      setConnected(true);

      console.log(roomId);

      client.subscribe('/topic/room/' + roomId, (frame) => {
        try { setMessages((prev) => [...prev, JSON.parse(frame.body)]); }
        catch { setMessages((prev) => [...prev, { sender: 'system', message: frame.body }]); }
      });
    };

    client.activate();
    clientRef.current = client;
    return () => { if (client.active) client.deactivate(); clientRef.current = null; };
  }, [roomId]);

  const send = async () => {
    if (!text.trim()) return;
    const url = `/api/rooms/${encodeURIComponent(roomId)}/send`;
    try {
      await http.post(url, { message: text.trim() });
      setText('');
    } catch (e) { /* 필요 시 에러 표시 */ }
  };

  return (
    <div className="chat">
      <div className="chat__header">
        <button onClick={() => nav('/friends')}>← Friends</button>
        <h2>Room: {roomId}</h2>
      </div>
      <div className="chat__list">
        {messages.map((m, i) => (
          <div key={i} className={`chat__msg ${m.mine ? 'me' : ''}`}>
            <div className="chat__sender">{m.sender || m.from}</div>
            <div className="chat__bubble">{m.message || m.text}</div>
          </div>
        ))}
      </div>
      <div className="chat__input">
        <input
          value={text}
          onChange={e=>setText(e.target.value)}
          onKeyDown={e => e.key==='Enter' && send()}
          placeholder="메시지를 입력하세요"
        />
        <button disabled={!connected || !text.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}
