import { useEffect } from 'react'
import http from '@/api/http'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'

export default function AfterLoginBootstrap(): React.ReactElement | null {
  const { isAuthed } = useAuth()
  const { setBulkUnread, setBulkPreview } = useNotifications() as any

  useEffect(() => {
    if (!isAuthed) return
    ;(async () => {
      try {
        const { data } = await http.get('/unread/summary') // baseURL=/api 가정
        setBulkUnread?.(data ?? [])
        setBulkPreview?.(data ?? [])
      } catch {
        /* no-op */
      }
    })()
  }, [isAuthed, setBulkUnread, setBulkPreview])

  return null
}