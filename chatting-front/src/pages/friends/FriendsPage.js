import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const FriendsPage = () => {
  const { jwtToken } = useAuth();
  const [friends, setFriends] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!jwtToken) return;
    axios.get('http://localhost:8080/api/friends', {
      headers: { Authorization: `Bearer ${jwtToken}` }
    }).then(res => setFriends(res.data)).catch(console.error);
  }, [jwtToken]);

  const openDM = async (username) => {
    try {
      const res = await axios.post(`http://localhost:8080/api/rooms/dm/${username}`, {}, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      navigate(`/chat/${res.data.id}`);
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{ maxWidth: 560, margin: '40px auto' }}>
      <h2>Friends</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {friends.map(f => (
          <li key={f.username} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #eee' }}>
            <div>
              <strong>{f.username}</strong>
              {f.online ? <span style={{ marginLeft: 8 }}>🟢</span> : <span style={{ marginLeft: 8 }}>⚪</span>}
            </div>
            <button onClick={() => openDM(f.username)}>메시지</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FriendsPage;
