import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { jwtDecode } from 'jwt-decode';
import { useAuth } from '../../context/AuthContext';
import { api, API_BASE_URL } from '../../lib/api';
import '../../styles/ChatApp.css';

const ChatApp = () => {
  const { token, user, logout } = useAuth(); // AuthContext: token/user/api 사용
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const stompRef = useRef(null); // STOMP 인스턴스는 ref로 관리
  const [userId, setUserId] = useState('');
  const messageBoxRef = useRef(null);
  const messageInputRef = useRef(null);

  // 토큰에서 userId 추출(가능하면 컨텍스트 user 사용)
  useEffect(() => {
    if (!token) {
      console.error('Token missing or expired');
      logout();
      return;
    }
    try {
      const id = user ?? (jwtDecode(token)?.sub ?? jwtDecode(token)?.username ?? jwtDecode(token)?.userId ?? '');
      setUserId(id);
      // 입장 시스템 메시지 (선택)
      setTimeout(() => {
        sendSystemMessage(`${id}님이 채팅방에 입장했습니다.`);
      }, 600);
    } catch (e) {
      console.error('JWT 디코드 실패:', e);
      logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, logout]);

  // 채팅 시작 / 종료
  useEffect(() => {
    if (token && !isConnected) {
      startChat();
    }

    const beforeUnload = () => {
      if (stompRef.current && stompRef.current.active) {
        try {
          sendSystemMessage(`${userId}님이 채팅방을 나갔습니다.`);
          stompRef.current.deactivate();
        } catch {}
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isConnected, userId]);

  // 새 메시지 오면 스크롤 맨 아래로
  useEffect(() => {
    if (messageBoxRef.current) {
      messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight;
    }
  }, [messages]);

  const startChat = () => {
    if (isConnected || !token) return;

    setIsLoading(true);
    // WebSocket(SockJS) 엔드포인트를 env 기반으로
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`), // <-- 서버가 /chat이면 /chat로 변경
      connectHeaders: { Authorization: `Bearer ${token}` }, // 필요하면 서버 측에서 사용
      debug: () => {},            // 콘솔 디버깅 원하면 (msg) => console.log(msg)
      reconnectDelay: 1500,       // 자동 재연결
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
    });

    client.onConnect = () => {
      setIsConnected(true);
      setIsLoading(false);

      // 브로드캐스트 메시지 구독
      client.subscribe('/topic/messages', ({ body }) => {
        try {
          const { sender, message: msg } = JSON.parse(body);
          setMessages(prev => [...prev, { sender, message: msg }]);
        } catch (e) {
          console.error('Parse error', e);
        }
      });

      // (선택) 단일 세션 킥 시그널 구독
      client.subscribe('/user/queue/kick', () => {
        logout();
      });
    };

    client.onStompError = (f) => {
      console.error('STOMP error', f);
    };

    client.onWebSocketClose = () => {
      setIsConnected(false);
      setIsLoading(false);
    };

    client.activate();
    stompRef.current = client;
  };

  const endChat = () => {
    try {
      sendSystemMessage(`${userId}님이 채팅방을 나갔습니다.`);
    } catch {}
    if (stompRef.current && stompRef.current.active) {
      stompRef.current.deactivate().finally(() => {
        setIsConnected(false);
        logout();
      });
    } else {
      logout();
    }
  };

  const sendSystemMessage = (text) => {
    // 공용 api 사용 (Authorization 헤더 자동 첨부)
    api.post('/api/chat/send', { message: text, sender: 'System' }).catch(console.error);
  };

  const sendMessage = async () => {
    if (!message.trim() || !isConnected) return;
    try {
      await api.post('/api/chat/send', { message, sender: userId });
      setMessage('');
      messageInputRef.current?.focus();
    } catch (e) {
      console.error('Error sending', e);
      alert('전송 오류, 다시 시도하세요.');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1 className="chat-title">Meow Chat!</h1>
        <button onClick={endChat} className="end-chat-button">Logout</button>
      </div>

      {isLoading && <p>Loading...</p>}

      <div className="message-box" ref={messageBoxRef}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.sender === userId
                ? 'message-container my-message-container'
                : 'message-container other-message-container'
            }
          >
            <div className="message-sender">{msg.sender}</div>
            <div className={msg.sender === userId ? 'message my-message' : 'message other-message'}>
              {msg.message}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          ref={messageInputRef}
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message"
          className="input-field"
        />
        <button onClick={sendMessage} disabled={isLoading || !isConnected} className="send-button">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatApp;
