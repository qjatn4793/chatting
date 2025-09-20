import { useEffect } from 'react';
import http from '../api/http';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';

export default function AfterLoginBootstrap() {
  const { isAuthed } = useAuth();
  const { setBulkUnread, setBulkPreview } = useNotifications();

  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      try {
        const { data } = await http.get('/api/unread/summary');
        setBulkUnread(data || []);
        setBulkPreview(data || []);
      } catch (_) { /* 무시 */ }
    })();
  }, [isAuthed, setBulkUnread]);

  return null;
}