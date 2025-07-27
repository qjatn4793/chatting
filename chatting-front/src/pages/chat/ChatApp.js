import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { useAuth } from '../../context/AuthContext';
import '../../styles/ChatApp.css';

const ChatApp = () => {
  const { jwtToken, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stompClient, setStompClient] = useState(null);
  const [userId, setUserId] = useState('');
  const messageBoxRef = useRef(null);
  const messageInputRef = useRef(null);

  // 토큰에서 userId 추출
  useEffect(() => {
    console.log(jwtToken);

    if (jwtToken) {
      try {
        const decoded = jwtDecode(jwtToken);
        console.log('decoded JWT:', decoded);
        const idFromToken =
          decoded.sub ??
          decoded.username ??
          decoded.userId ??
          '';

        setUserId(idFromToken);
        setTimeout(() => {
          sendSystemMessage(`${idFromToken}님이 채팅방에 입장했습니다.`);
        }, 1000);
      } catch (e) {
        console.error('JWT 디코드 실패:', e);
        logout();
      }
    } else {
      console.error('Token missing or expired');
      logout();
    }
  }, [jwtToken, logout]);

  // 채팅 시작 / 종료
  useEffect(() => {
    if (jwtToken && !isConnected) {
      startChat();
    }

    window.onbeforeunload = () => {
      if (isConnected) endChat();
    };
    return () => {
      window.onbeforeunload = null;
    };
  }, [jwtToken, isConnected]);

  // 새 메시지 오면 스크롤
  useEffect(() => {
    if (messageBoxRef.current) {
      messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight;
    }
  }, [messages]);

  const startChat = () => {
    if (isConnected) return;
    if (!jwtToken) return console.error('No token');

    const socket = new SockJS(`${process.env.REACT_APP_CHATTING_SERVER}/chat`, null, {
      transports: ['websocket', 'xhr-streaming', 'xhr-polling'], // jsonp-polling 제거
    });
    const client = Stomp.over(socket);
    client.heartbeat.outgoing = 1000;
    client.heartbeat.incoming = 0;

    setIsLoading(true);
    setIsConnected(true);

    const connect = () => {
      client.connect(
        {},
        (frame) => {
          console.log('Connected: ' + frame);
          setStompClient(client);
          client.subscribe('/topic/messages', ({ body }) => {
            try {
              const { sender, message: msg } = JSON.parse(body);
              setMessages(prev => [...prev, { sender, message: msg }]);
            } catch (e) {
              console.error('Parse error', e);
            }
          });
          setIsLoading(false);
        },
        (err) => {
          console.error('WebSocket error', err);
          setIsConnected(false);
          setTimeout(connect, 1000);
        }
      );
    };
    connect();
  };

  const endChat = () => {
    if (stompClient) {
      sendSystemMessage(`${userId}님이 채팅방을 나갔습니다.`);
      stompClient.disconnect(() => {
        console.log('Disconnected');
        setIsConnected(false);
        logout();
      });
    }
  };

  const sendSystemMessage = (text) => {
    axios.post(
      `${process.env.REACT_APP_CHATTING_SERVER}/api/chat/send`,
      { message: text, sender: 'System' },
      { headers: { Authorization: `Bearer ${jwtToken}` } }
    ).catch(console.error);
  };

  const sendMessage = () => {
    if (!message.trim() || !isConnected) return;
    axios.post(
      `${process.env.REACT_APP_CHATTING_SERVER}/api/chat/send`,
      { message, sender: userId },
      { headers: { Authorization: `Bearer ${jwtToken}` } }
    )
    .then(() => {
      setMessage('');
      messageInputRef.current?.focus();
    })
    .catch((e) => {
      console.error('Error sending', e);
      alert('전송 오류, 다시 시도하세요.');
    });
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
            <div
              className={
                msg.sender === userId ? 'message my-message' : 'message other-message'
              }
            >
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
        <button onClick={sendMessage} disabled={isLoading} className="send-button">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatApp;