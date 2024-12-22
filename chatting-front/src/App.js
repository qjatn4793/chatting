import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SockJS from 'sockjs-client'; // SockJS 임포트
import Stomp from 'stompjs'; // STOMP 임포트

const ChatApp = () => {
  const [messages, setMessages] = useState([]);  // 화면에 표시할 메시지
  const [message, setMessage] = useState('');     // 사용자 입력 메시지

  // WebSocket 연결 및 메시지 구독
  useEffect(() => {
    const socket = new SockJS('/chat'); // Spring Boot에서 설정한 엔드포인트와 일치
    const stompClient = Stomp.over(socket); // STOMP 클라이언트 설정

    stompClient.connect({}, (frame) => {
      console.log('Connected: ' + frame);
      stompClient.subscribe('/topic/messages', (messageOutput) => {
        // 수신한 메시지를 화면에 추가
        setMessages((prevMessages) => [...prevMessages, messageOutput.body]);
      });
    });

    // 컴포넌트가 unmount 될 때 연결 끊기
    return () => {
      stompClient.disconnect();
    };
  }, []);

  // 메시지 전송 함수 (axios 사용)
  const sendMessage = () => {
    if (message.trim() === '') return; // 빈 메시지는 전송하지 않음

    // axios를 사용하여 메시지 전송
    axios
      .post('/api/chat/send', { message, sender: 'User' })
      .then((response) => {
        console.log('Message sent:', response);
        setMessage('');  // 입력창 초기화
      })
      .catch((error) => {
        console.error('Error sending message:', error);
      });
  };

  return (
    <div>
      <h1>Real-time Chat</h1>
      <div>
        {/* 메시지 출력 */}
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message"
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
};

export default ChatApp;
