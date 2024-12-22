import React, { useState, useEffect } from 'react';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';
import axios from 'axios';

const ChatApp = () => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [stompClient, setStompClient] = useState(null);
  const [userId, setUserId] = useState('user');

  const startChat = () => {
    if (isConnected) return;

    const socket = new SockJS(`${process.env.REACT_APP_CHATTING_SERVER}/chat`);
    const client = Stomp.over(socket);

    client.connect({ userId }, (frame) => {
      console.log('Connected: ' + frame);
      setIsConnected(true);
      setStompClient(client);

      // 수신된 메시지를 처리하여 메시지 상태에 추가
      client.subscribe('/topic/messages', (messageOutput) => {
        setMessages((prevMessages) => [...prevMessages, messageOutput.body]);
      });
    }, (error) => {
      console.error('WebSocket error:', error);
    });
  };

  const endChat = () => {
    if (stompClient) {
      stompClient.disconnect(() => {
        console.log('Disconnected');
        setIsConnected(false);
      });
    }
  };

  const sendMessage = () => {
    if (message.trim() === '' || !isConnected) return;

    // 메시지 전송
    axios.post(`${process.env.REACT_APP_CHATTING_SERVER}/api/chat/send`, {
      message,
      sender: userId,
    })
    .then((response) => {
      console.log('Message sent:', response);
      // 서버에서 메시지가 전송되었을 때, 메시지를 보내는 것과 WebSocket으로 수신한 메시지를 혼동하지 않도록 합니다.
      setMessage(''); // 메시지 전송 후 입력 필드 초기화
    })
    .catch((error) => {
      console.error('Error sending message:', error);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div>
      <h1>Real-time Chat</h1>
      <div>
        {/* 채팅 메시지 표시 */}
        {messages.map((msg, index) => (
          <div key={index}>
            <strong>{userId}: </strong>{msg}
          </div>
        ))}
      </div>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}  // Enter 키 눌렀을 때 메시지 전송
        placeholder="Type your message"
      />
      <button onClick={sendMessage} disabled={!isConnected}>Send</button>
      {!isConnected ? (
        <button onClick={startChat}>Start Chat</button>
      ) : (
        <button onClick={endChat}>End Chat</button>
      )}
    </div>
  );
};

export default ChatApp;
