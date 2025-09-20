import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../api/http';
import '../../styles/friends.css';
import RequestsPanel from './RequestsPanel';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';

export default function FriendsPage() {
  const [friends, setFriends] = useState([]);       // backend: List<String>
  const [usernameToAdd, setUsernameToAdd] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState('');       // DM 열기 진행중인 친구명
  const nav = useNavigate();
  const { userId, logout } = useAuth();

  // 미리보기/배지/정렬용
  const {
    getUnread,
    getPreview,
    getPreviewTime,
    clearFriend,
    setActiveRoom,
  } = useNotifications();

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

  // DM 열기: 방 생성 → 읽음 처리 → 로컬 배지 0 → 현재 방 지정 → 이동
  const openDm = async (friendUsername) => {
    setOpening(friendUsername);
    try {
      const res = await http.post(`/api/rooms/dm/${encodeURIComponent(friendUsername)}`);
      const room = res.data;
      if (!room?.id) throw new Error('room id missing');

      await http.post(`/api/rooms/${encodeURIComponent(room.id)}/read`); // 서버 unread=0
      clearFriend(friendUsername);                                       // 로컬 배지=0
      setActiveRoom(room.id);

      nav(`/chat/${encodeURIComponent(room.id)}`);
    } catch (e) {
      setError(e?.response?.data?.message || 'DM 방을 열지 못했습니다.');
    } finally {
      setOpening('');
    }
  };

  useEffect(() => { load(); }, []);

  // (선택) 최근 활동 순 정렬: 미리보기 타임스탬프 desc, 없으면 원래 순서
  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const ta = getPreviewTime(a) || 0;
      const tb = getPreviewTime(b) || 0;
      return tb - ta;
    });
  }, [friends, getPreviewTime]);

  return (
    <div className="friends">
      {/* 상단 사용자 정보 + 로그아웃 */}
      <div className="friends__topbar">
        <div className="friends__me">
          <span className="me__label">로그인:</span>
          <strong className="me__name">{userId || '알 수 없음'}</strong>
        </div>
        <button className="btn btn--logout" onClick={logout}>로그아웃</button>
      </div>

      <h2>친구</h2>

      {error && <p className="error">{error}</p>}

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

      {/* 친구별 미리보기 + 미읽음 배지 표시 */}
      <ul className="friends__list">
        {sortedFriends.map((f) => {
          const cnt = getUnread(f);
          const preview = getPreview(f);     // 최근 메시지 한 줄
          // const ts = getPreviewTime(f);   // 필요하면 시간도 사용

          return (
            <li key={f} className="friends__item">
              <div className="friends__left">
                <div className="friends__nameRow">
                  <span className="friends__name">{f}</span>
                  {cnt > 0 && <span className="badge badge--unread">{cnt}</span>}
                </div>

                {preview && (
                  <div className="friends__preview" title={preview}>
                    {preview}
                  </div>
                )}
              </div>

              <button
                className="btn"
                onClick={() => openDm(f)}
                disabled={opening === f}
              >
                {opening === f ? '열기...' : '대화'}
              </button>
            </li>
          );
        })}
        {!friends.length && <li className="friends__empty">친구가 없습니다.</li>}
      </ul>

      <RequestsPanel />
    </div>
  );
}
