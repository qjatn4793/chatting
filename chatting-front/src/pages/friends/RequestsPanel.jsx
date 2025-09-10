import React, { useEffect, useState } from 'react';
import http from '../../api/http';

export default function RequestsPanel() {
  const [incoming, setIncoming] = useState([]); // 내가 받은 요청들
  const [outgoing, setOutgoing] = useState([]); // 내가 보낸 요청들
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);   // 액션 중인 요청 id

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

  // 백엔드 DTO 필드명이 프로젝트마다 조금씩 달 수 있어 안전하게 뽑아주는 헬퍼
  const getSender = (r) => r.sender || r.from || r.fromUser || r.requester || r.senderUsername || r.sourceUsername || '';
  const getReceiver = (r) => r.receiver || r.to || r.toUser || r.receiverUsername || r.targetUsername || '';

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
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="requests">
      <h3>친구 요청</h3>
      {err && <p className="error">{err}</p>}

      <div className="requests__cols">
        {/* 받은 요청: 내가 수락/거절 */}
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
                <button
                  onClick={() => accept(r.id)}
                  disabled={busyId === r.id}
                >
                  수락
                </button>
                <button
                  onClick={() => decline(r.id)}
                  disabled={busyId === r.id}
                  style={{ background: '#e11d48' /* rose-600 */ }}
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </section>

        {/* 보낸 요청: 내가 취소 */}
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
                  style={{ background: '#475569' /* slate-600 */ }}
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
