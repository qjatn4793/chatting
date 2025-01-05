import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import '../../styles/ChatApp.css';

const ChatApp = ({ jwtToken, onLogout }) => {  // Receive onLogout as prop
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);  // Loading state for WebSocket connection
  const [stompClient, setStompClient] = useState(null);
  const [userId, setUserId] = useState('');
  const messageBoxRef = useRef(null); // useRef를 사용하여 메시지 박스를 참조
  const messageInputRef = useRef(null); // input 필드를 참조

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

  // 로그인 후 자동으로 채팅 시작
  useEffect(() => {
    if (jwtToken && !isConnected) {
      startChat(); // 로그인 후 바로 startChat 호출
    }

    // 화면을 벗어날 때 자동으로 채팅 종료
    window.onbeforeunload = () => {
      if (isConnected) {
        endChat();
      }
    };

    return () => {
      window.onbeforeunload = null; // 컴포넌트가 unmount 될 때 이벤트 리스너 정리
    };
  }, [jwtToken, isConnected]);

  // 새 메시지가 추가될 때마다 메시지 박스를 하단으로 스크롤합니다.
  useEffect(() => {
    if (messageBoxRef.current) {
      messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight;
    }
  }, [messages]);

  const startChat = () => {
    if (isConnected) return; // 이미 연결된 경우, 다시 시도하지 않도록 방지

    const token = localStorage.getItem('jwtToken');
    if (!token) {
      console.error("Token not found");
      return;
    }

    const socket = new SockJS(`${process.env.REACT_APP_CHATTING_SERVER}/chat`);
    const client = Stomp.over(socket);

    // heartbeat 설정 (주기적으로 서버와의 연결을 유지)
    client.heartbeat.outgoing = 1000;  // 서버에 1초마다 heartbeat을 보냄
    client.heartbeat.incoming = 0;  // 서버로부터 heartbeat을 받지 않음 (웹소켓 연결이 끊어지지 않게)

    setIsLoading(true);  // Set loading to true while connecting
    setIsConnected(true);  // 연결 시작 상태

    // WebSocket 연결 후, 자동 재연결 설정
    const connect = () => {
      client.connect(
        {},
        (frame) => {
          console.log('Connected: ' + frame);
          setStompClient(client);

          // WebSocket 연결이 완료된 후, 구독을 시작
          client.subscribe('/topic/messages', (messageOutput) => {
            console.log(messageOutput.body);

            try {
              const parsedMessage = JSON.parse(messageOutput.body); // JSON으로 파싱
              setMessages((prevMessages) => [
                ...prevMessages,
                { sender: parsedMessage.sender, message: parsedMessage.message },
              ]);
            } catch (error) {
              console.error('Error parsing message:', error);
            }
          });
          
          // 시스템 메시지 보내기 (채팅방 입장)
          sendSystemMessage(`${userId} 님이 채팅방에 들어왔습니다.`);
          setIsLoading(false); // Once connected, stop loading
        },
        (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false); // 연결 실패시 상태 업데이트
          setTimeout(connect, 1000); // 1초 후에 재연결 시도
        }
      );
    };

    connect(); // 최초 연결 시도
  };

  const endChat = () => {
    if (stompClient) {
      // 시스템 메시지 보내기 (채팅방 퇴장)
      sendSystemMessage(`${userId} 님이 채팅방에서 나갔습니다.`);
      stompClient.disconnect(() => {
        console.log('Disconnected');
        setIsConnected(false);
        onLogout();  // 로그아웃 처리
      });
    }
  };

  const sendSystemMessage = (message) => {
    // 서버에 시스템 메시지 전송 (모든 구독자에게 전송)
    axios.post(`${process.env.REACT_APP_CHATTING_SERVER}/api/chat/send`, {
      message,
      sender: 'System',
    }, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwtToken')}`,
      }
    })
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
      setMessage(''); // 메시지를 보내고 나서 입력 필드 비우기
      if (messageInputRef.current) {
        messageInputRef.current.focus(); // 엔터 후 커서를 다시 입력 필드로 설정
      }
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
    <div className="chat-container">
      <div className="chat-header">
        <h1 className="chat-title">Meow Chat!</h1>
        <button onClick={endChat} className="end-chat-button">Logout</button>
      </div>
      {/* Display loading message when WebSocket is connecting */}
      {isLoading && <p>Loading...</p>}
      <div className="message-box" ref={messageBoxRef}>
        {messages.map((msg, index) => (
          <div key={index} className={`message-container ${msg.sender === userId ? 'my-message-container' : 'other-message-container'}`}>
            <div className="message-sender">{msg.sender}</div>
            <div className={`message ${msg.sender === userId ? 'my-message' : 'other-message'}`}>
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
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message"
          className="input-field"
        />
        <button onClick={sendMessage} disabled={isLoading} className="send-button">Send</button>
      </div>
    </div>
  );
};

export default ChatApp;
