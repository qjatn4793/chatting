import React, { useEffect, useState } from 'react';
import http from '../../api/http';
import '../../styles/friends.css';
import RequestsPanel from './RequestsPanel';

export default function FriendsPage() {
  const [friends, setFriends] = useState([]);         // <- List<String>
  const [usernameToAdd, setUsernameToAdd] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const res = await http.get('/api/friends');
      // backend: List<String>
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

  useEffect(() => { load(); }, []);

  return (
    <div className="friends">
      <h2>친구</h2>

      <div className="friends__add">
        <input
          value={usernameToAdd}
          onChange={e=>setUsernameToAdd(e.target.value)}
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
            <span className={`status off`} />
            <span>{u}</span>
            <a href={`/chat/${encodeURIComponent(u)}`}>DM</a>
          </li>
        ))}
      </ul>

      <RequestsPanel />
    </div>
  );
}
