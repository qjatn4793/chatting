import React, { useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../api/http';
import { useNotifications } from '../hooks/useNotifications';

/**
 * 전역 STOMP 연결. 단일 세션 킥(/user/queue/kick) 신호를 받으면 즉시 로그아웃.
 * 각 방의 실시간 메시지는 ChatRoomPage가 별도로 구독합니다.
 */
export default function RealtimeProvider({ children }) {
  const { token, userId, logout } = useAuth();
  const { pushNotif } = useNotifications();
  const clientRef = useRef(null);

  useEffect(() => {
    // 토큰 없으면 연결 해제
    if (!token) {
      if (clientRef.current && clientRef.current.active) clientRef.current.deactivate();
      clientRef.current = null;
      return;
    }

    // Notification 권한(한 번만 요청)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const client = new Client({
      // SockJS 엔드포인트
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
      // STOMP CONNECT 프레임에 토큰 전달(서버에서 쓰면 좋음)
      connectHeaders: { Authorization: `Bearer ${token}` }, // CONNECT에 JWT 전송
      reconnectDelay: 3000, // 자동 재연결
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {} // 필요시 console.log
    });

    client.onConnect = () => {
      // 중복 로그인 킥 구독
      client.subscribe('/user/queue/kick', () => {
        logout('다른 기기에서 로그인되어 현재 세션이 종료되었습니다.');
      });

      // 새 메세지 알림 구독
      if (userId) {
        client.subscribe(`/topic/chat-notify/${userId}`, (frame) => {
          try {
            const n = JSON.parse(frame.body); // { roomId, sender, preview, ts }
            pushNotif(n);
          } catch {
            pushNotif({ preview: String(frame.body), ts: Date.now() });
          }
        });
      }
    };

    client.activate();
    clientRef.current = client;

    return () => {
      if (client && client.active) client.deactivate();
      clientRef.current = null;
    };
  }, [token, logout]);

  return children;
}