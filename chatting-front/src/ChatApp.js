import React, { useState, useEffect } from 'react';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';
import axios from 'axios';
import {jwtDecode} from 'jwt-decode';

const ChatApp = () => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [stompClient, setStompClient] = useState(null);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('jwtToken');
    if (token) {
      const decodedToken = jwtDecode(token);
      const isTokenExpired = decodedToken.exp * 1000 < Date.now(); // 만료 시간 확인
      if (!isTokenExpired) {
        setUserId(decodedToken.sub || '');  // 만료되지 않은 경우 userId 설정
      } else {
        console.error("Token has expired");
        localStorage.removeItem('jwtToken');  // 만료된 토큰을 로컬스토리지에서 제거
      }
    }
  }, []);

  const startChat = () => {
    if (isConnected) return;

    const token = localStorage.getItem('jwtToken');
    if (!token) {
      console.error("Token not found");
      return;
    }

    const socket = new SockJS(`${process.env.REACT_APP_CHATTING_SERVER}/chat`);
    const client = Stomp.over(socket);

    client.connect(
      {},
      (frame) => {
        console.log('Connected: ' + frame);
        setIsConnected(true);
        setStompClient(client);

        client.subscribe('/topic/messages', (messageOutput) => {
            console.log(messageOutput.body);

            try {
                const parsedMessage = JSON.parse(messageOutput.body); // JSON으로 파싱
            
                // sender와 message를 상태에 추가
                setMessages((prevMessages) => [
                    ...prevMessages,
                    { sender: parsedMessage.sender, message: parsedMessage.message },
                ]);
            } catch (error) {
            console.error('Error parsing message:', error);
            }
        });
      },
      (error) => {
        console.error('WebSocket error:', error);
      }
    );
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

    axios.post(`${process.env.REACT_APP_CHATTING_SERVER}/api/chat/send`, {
      message,
      sender: userId,
    }, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwtToken')}`,
      }
    })
    .then((response) => {
      console.log('Message sent:', response);
      setMessage('');
    })
    .catch((error) => {
      console.error('Error sending message:', error);
      alert("Error sending message. Please try again.");
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
        {messages.map((msg, index) => (
            <div key={index}>
            <strong>{msg.sender}: </strong>{msg.message}
            </div>
        ))}
      </div>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
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
