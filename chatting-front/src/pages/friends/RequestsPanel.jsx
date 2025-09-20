import React, { useEffect, useRef, useState } from 'react';
import http, { API_BASE_URL } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export default function RequestsPanel() {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const { userId } = useAuth();

  const wsRef = useRef(null);
  const subsRef = useRef([]);

  const load = async () => {
    try {
      const [inc, out] = await Promise.all([
        http.get('/api/friends/requests/incoming').catch(() => ({ data: [] })),
        http.get('/api/friends/requests/outgoing').catch(() => ({ data: [] })),
      ]);
      setIncoming(inc.data || []);
      setOutgoing(out.data || []);
    } catch (e) {
      setErr(e?.response?.data?.message || '요청 목록을 불러오지 못했습니다.');
    }
  };

  useEffect(() => { load(); }, []);

  // 실시간 구독: /topic/friend-requests/{userId}
  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem('jwt');
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws`),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 4000,
      debug: () => {} // 필요 시 (m) => console.log('[STOMP]', m)
    });

    client.onConnect = () => {
      const dest = `/topic/friend-requests/${userId}`;
      const sub = client.subscribe(dest, (frame) => {
        // 백엔드 cancel은 "CANCELLED" 같은 순수 문자열을 보내므로,
        // payload 형태와 무관하게 항상 새로고침
        // console.log('[WS] friend-requests <-', frame.body);
        load();
      });
      subsRef.current = [sub];
      // console.log('[WS] subscribed', dest);
    };

    client.onStompError = (frame) => {
      // console.error('[WS] broker error', frame);
    };

    client.activate();
    wsRef.current = client;

    return () => {
      subsRef.current.forEach(s => { try { s?.unsubscribe(); } catch {} });
      subsRef.current = [];
      if (client.active) client.deactivate();
      wsRef.current = null;
    };
  }, [userId]);

  const getSender = (r) =>
    r.sender || r.from || r.fromUser || r.requester || r.senderUsername || r.sourceUsername || '';
  const getReceiver = (r) =>
    r.receiver || r.to || r.toUser || r.receiverUsername || r.targetUsername || '';

  const accept = async (id) => {
    setBusyId(id);
    try {
      await http.post(`/api/friends/requests/${id}/accept`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (id) => {
    setBusyId(id);
    try {
      await http.post(`/api/friends/requests/${id}/decline`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id) => {
    setBusyId(id);
    try {
      await http.delete(`/api/friends/requests/${id}`);
      await load(); // 내 화면은 즉시 갱신
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="requests">
      <h3>친구 요청</h3>
      {err && <p className="error">{err}</p>}

      <div className="requests__cols">
        {/* 받은 요청 */}
        <section>
          <h4>받은 요청</h4>
          {incoming.length === 0 && <div className="muted">받은 요청이 없습니다.</div>}
          {incoming.map((r) => (
            <div key={`in-${r.id}`} className="req">
              <span>
                <strong>{getSender(r)}</strong> → {getReceiver(r)}
              </span>
              <span className="muted">{r.status}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => accept(r.id)} disabled={busyId === r.id}>수락</button>
                <button
                  onClick={() => decline(r.id)}
                  disabled={busyId === r.id}
                  style={{ background: '#e11d48' }}
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </section>

        {/* 보낸 요청 */}
        <section>
          <h4>보낸 요청</h4>
          {outgoing.length === 0 && <div className="muted">보낸 요청이 없습니다.</div>}
          {outgoing.map((r) => (
            <div key={`out-${r.id}`} className="req">
              <span>
                <strong>{getSender(r)}</strong> → {getReceiver(r)}
              </span>
              <span className="muted">{r.status}</span>
              <div>
                <button
                  onClick={() => cancel(r.id)}
                  disabled={busyId === r.id}
                  style={{ background: '#475569' }}
                >
                  취소
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
