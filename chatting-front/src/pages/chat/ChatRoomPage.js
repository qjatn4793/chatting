import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { jwtDecode } from 'jwt-decode';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ChatRoomPage = () => {
  const { roomId } = useParams();
  const { jwtToken } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const clientRef = useRef(null);
  const me = useRef(null);

  useEffect(() => {
    if (!jwtToken) return;
    try {
      const { sub } = jwtDecode(jwtToken);
      me.current = sub;
    } catch (e) { console.error(e); }
  }, [jwtToken]);

  useEffect(() => {
    if (!jwtToken) return;
    axios.get(`http://localhost:8080/api/rooms/${roomId}/messages?limit=50`, {
      headers: { Authorization: `Bearer ${jwtToken}` }
    }).then(res => setMessages(res.data)).catch(console.error);
  }, [jwtToken, roomId]);

  useEffect(() => {
    if (!jwtToken) return;
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/chat'),
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/rooms/${roomId}`, ({ body }) => {
          try { setMessages(prev => [...prev, JSON.parse(body)]); }
          catch (e) { console.error('parse', e); }
        });
      }
    });
    client.activate();
    clientRef.current = client;
    return () => { client.deactivate(); };
  }, [jwtToken, roomId]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await axios.post(`http://localhost:8080/api/rooms/${roomId}/send`, { message: text }, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      setText('');
    } catch (e) { console.error(e); }
  };
  const onKey = (e) => e.key === 'Enter' && send();

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h3>Room: {roomId}</h3>
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, height: 420, overflowY: 'auto', marginBottom: 12 }}>
        {messages.map(m => (
          <div key={m.id ?? (m.sender+m.createdAt)} style={{ textAlign: m.sender === me.current ? 'right' : 'left', margin: '8px 0' }}>
            <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 16, background: m.sender === me.current ? '#e6f3ff' : '#f6f6f6' }}>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{m.sender}</div>
              <div>{m.content ?? m.message}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ flex: 1 }} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder="메시지를 입력하세요" />
        <button onClick={send}>보내기</button>
      </div>
    </div>
  );
};

export default ChatRoomPage;
