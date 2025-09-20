import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NotifCtx = createContext(null);

export function NotificationsProvider({ children }) {
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadByFriend, setUnreadByFriend] = useState({});
  const [previewByFriend, setPreviewByFriend] = useState({}); // 최근 메시지 미리보기
  const [previewTime, setPreviewTime] = useState({});         // 정렬/표시용 타임스탬프
  const [activeRoom, setActiveRoom] = useState(null);   // 현재 보고 있는 방
  const [last, setLast] = useState(null);

  // 서버에서 내려준 초기 요약 반영
  const setBulkUnread = useCallback((entries) => {
    const map = {};
    let total = 0;
    for (const e of entries || []) {
      map[e.friendUsername] = e.count;
      total += e.count;
    }
    setUnreadByFriend(map);
    setUnreadTotal(total);
  }, []);

  // 서버 요약이 미리보기까지 제공
  const setBulkPreview = useCallback((entries) => {
  const p = {}, t = {};
  for (const e of entries || []) {
     if (e.friendUsername && e.lastPreview) {
     p[e.friendUsername] = e.lastPreview;
     if (e.lastTs) t[e.friendUsername] = e.lastTs;
     }
  }
    if (Object.keys(p).length) setPreviewByFriend((prev) => ({ ...prev, ...p }));
    if (Object.keys(t).length) setPreviewTime((prev) => ({ ...prev, ...t }));
  }, []);

  // 새 알림 수신 시 (DM만 friend로 매핑)
  const pushNotif = useCallback((n) => {
    // 현재 열려있는 방이면 카운트하지 않음
    if (n?.roomId && n.roomId === activeRoom) return;

    setLast(n);
    const friend = n?.sender;
    if (!friend) return;

    if (n.preview) {
        setPreviewByFriend((m) => ({ ...m, [friend]: n.preview }));
    }
    if (n.ts) {
        setPreviewTime((m) => ({ ...m, [friend]: n.ts }));
    }

    setUnreadByFriend((map) => {
      const next = { ...map, [friend]: (map[friend] || 0) + 1 };
      return next;
    });
    setUnreadTotal((x) => x + 1);
  }, [activeRoom]);

  const clearFriend = useCallback((friend) => {
    setUnreadByFriend((map) => {
      if (!map[friend]) return map;
      const next = { ...map };
      const removed = next[friend];
      delete next[friend];
      setUnreadTotal((t) => Math.max(0, t - removed));
      return next;
    });

    // 미리보기는 유지(최근 메시지 정보)
    setPreviewByFriend((p) => ({ ...p, [friend]: '' }));
  }, []);

  const clearAll = useCallback(() => {
    setUnreadByFriend({});
    setUnreadTotal(0);
  }, []);

  const getUnread = useCallback((friend) => unreadByFriend[friend] || 0, [unreadByFriend]);
  const getPreview = useCallback((friend) => previewByFriend[friend] || '', [previewByFriend]);
  const getPreviewTime = useCallback((friend) => previewTime[friend] || null, [previewTime]);

  const value = useMemo(() => ({
    unreadTotal,
    unreadByFriend,
    last,
    pushNotif,
    clearFriend,
    clearAll,
    getUnread,
    setBulkUnread,
    setBulkPreview,
    setActiveRoom,
    getPreview,
    getPreviewTime
  }), [unreadTotal, unreadByFriend, last, pushNotif, clearFriend, clearAll, getUnread, setBulkUnread]);

  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}

export const useNotifications = () => useContext(NotifCtx);