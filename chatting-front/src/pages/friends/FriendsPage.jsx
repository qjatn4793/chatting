import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../api/http';
import '../../styles/friends.css';
import RequestsPanel from './RequestsPanel';

export default function FriendsPage() {
  const [friends, setFriends] = useState([]);       // backend: List<String>
  const [usernameToAdd, setUsernameToAdd] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState('');       // DM 열기 진행중인 친구명
  const nav = useNavigate();

  const load = async () => {
    try {
      const res = await http.get('/api/friends');
      setFriends(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.message || '친구 목록을 불러오지 못했습니다.');
    }
  };

  const addFriend = async () => {
    const name = usernameToAdd.trim();
    if (!name) return;
    setError('');
    setSending(true);
    try {
      await http.post(`/api/friends/requests/${encodeURIComponent(name)}`);
      setUsernameToAdd('');
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || '친구 요청을 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const openDm = async (friendUsername) => {
    setOpening(friendUsername);
    try {
      // 신규 방 생성 후 그 roomId로 이동
      const res = await http.post(`/api/rooms/dm/${encodeURIComponent(friendUsername)}`);
      const room = res.data;
      if (!room?.id) throw new Error('room id missing');
      nav(`/chat/${encodeURIComponent(room.id)}`);
    } catch (e) {
      setError(e?.response?.data?.message || 'DM 방을 열지 못했습니다.');
    } finally {
      setOpening('');
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="friends">
      <h2>친구</h2>

      <div className="friends__add">
        <input
          value={usernameToAdd}
          onChange={(e)=>setUsernameToAdd(e.target.value)}
          placeholder="사용자 아이디"
        />
        <button onClick={addFriend} disabled={sending}>
          {sending ? '요청 중…' : '친구 요청 보내기'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <ul className="friends__list">
        {friends.map((u) => (
          <li key={u} className="friends__row">
            <span className="status off" />
            <span>{u}</span>
            <button onClick={() => openDm(u)} disabled={opening === u}>
              {opening === u ? '열는 중…' : 'DM'}
            </button>
          </li>
        ))}
      </ul>

      <RequestsPanel />
    </div>
  );
}
