import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function FriendsPage() {
  const { token, api } = useAuth();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.get('/api/friends')
      .then(res => setFriends(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, api]);

  const openDM = async (username) => {
    try {
      const res = await api.post(`/api/rooms/dm/${username}`, {});
      navigate(`/chat/${res.data.id}`);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="page page--narrow">
      <div className="page__header">
        <h2>Friends</h2>
      </div>
      {loading && <p>Loading...</p>}
      <ul className="friends">
        {friends.map((f) => (
          <li key={f.username} className="friends__item">
            <div className="friends__meta">
              <div className="friends__avatar">{(f.username || '?')[0].toUpperCase()}</div>
              <div className="friends__info">
                <strong>{f.username}</strong>
                <span className={`friends__status ${f.online ? 'on' : 'off'}`}>
                  {f.online ? 'online' : 'offline'}
                </span>
              </div>
            </div>
            <button className="btn" onClick={() => openDM(f.username)}>메시지</button>
          </li>
        ))}
        {!loading && friends.length === 0 && (
          <li className="friends__empty">친구가 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
