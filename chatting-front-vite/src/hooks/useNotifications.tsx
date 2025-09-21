import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type UnreadMap  = Record<string, number>
type PreviewMap = Record<string, string>
type TsMap      = Record<string, number>

type SummaryEntry = {
  friendUsername?: string
  count?: number
  lastPreview?: string
  lastTs?: number
}

type Notif = {
  roomId?: string
  sender?: string
  preview?: string
  ts?: number
}

type NotificationsCtx = {
  unreadTotal: number
  unreadByFriend: UnreadMap
  last: Notif | null

  // setters/업데이트
  setBulkUnread: (entries: SummaryEntry[]) => void
  setBulkPreview: (entries: SummaryEntry[]) => void
  setActiveRoom: (roomId: string | null) => void
  pushNotif: (n: Notif) => void
  clearFriend: (friend: string) => void
  clearAll: () => void

  // getters (null/undefined 안전)
  getUnread: (friend?: string | null) => number
  getPreview: (friend?: string | null) => string
  getPreviewTime: (friend?: string | null) => number | null
}

const NotifCtx = createContext<NotificationsCtx | null>(null)

const LS_KEYS = {
  unread: 'notif.unreadByFriend',
  preview: 'notif.previewByFriend',
  previewTs: 'notif.previewTime',
}

export function NotificationsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [unreadByFriend, setUnreadByFriend] = useState<UnreadMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.unread) || 'null') || {} } catch { return {} }
  })

  const [previewByFriend, setPreviewByFriend] = useState<PreviewMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.preview) || 'null') || {} } catch { return {} }
  })

  const [previewTime, setPreviewTime] = useState<TsMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.previewTs) || 'null') || {} } catch { return {} }
  })

  const [unreadTotal, setUnreadTotal] = useState<number>(0)
  const [activeRoom, setActiveRoom] = useState<string | null>(null) // 현재 보고 있는 방
  const [last, setLast] = useState<Notif | null>(null)

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.unread, JSON.stringify(unreadByFriend)) } catch {}
  }, [unreadByFriend])

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.preview, JSON.stringify(previewByFriend)) } catch {}
  }, [previewByFriend])

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.previewTs, JSON.stringify(previewTime)) } catch {}
  }, [previewTime])

  // 서버에서 내려준 초기 요약 반영
  const setBulkUnread = useCallback((entries: SummaryEntry[]) => {
    const map: UnreadMap = {}
    let total = 0
    for (const e of entries || []) {
      const friend = e.friendUsername
      const cnt = e.count ?? 0
      if (!friend) continue
      map[friend] = cnt
      total += cnt
    }
    setUnreadByFriend(map)
    setUnreadTotal(total)
  }, [])

  // 서버 요약이 미리보기까지 제공
  const setBulkPreview = useCallback((entries: SummaryEntry[]) => {
    const p: PreviewMap = {}
    const t: TsMap = {}
    for (const e of entries || []) {
      if (e.friendUsername && e.lastPreview) {
        p[e.friendUsername] = e.lastPreview
        if (typeof e.lastTs === 'number') t[e.friendUsername] = e.lastTs
      }
    }
    if (Object.keys(p).length) setPreviewByFriend(prev => ({ ...prev, ...p }))
    if (Object.keys(t).length) setPreviewTime(prev => ({ ...prev, ...t }))
  }, [])

  // 새 알림 수신 시 (DM만 friend로 매핑)
  const pushNotif = useCallback((n: Notif) => {
  // 현재 열려있는 방이면 카운트하지 않음
  if (n?.roomId && activeRoom && n.roomId === activeRoom) return
  setLast(n)

  const friend = n?.sender
  if (!friend) return                      // ← 여기서 friend가 string으로 확정됨

  // TS에게 확실히 알려주기 위해 지역 변수로 고정
  const f = friend as string

  if (typeof n.preview === 'string') {     // ← 값도 확정
    setPreviewByFriend((m: PreviewMap) => ({ ...m, [f]: n.preview as string }))
  }
  if (typeof n.ts === 'number') {
    setPreviewTime((m: TsMap) => ({ ...m, [f]: n.ts as number }))
  }

  setUnreadByFriend((map: UnreadMap) => {
    const next: UnreadMap = { ...map, [f]: (map[f] || 0) + 1 }
    return next
  })
  setUnreadTotal((x) => x + 1)
}, [activeRoom])

  const clearFriend = useCallback((friend: string) => {
    if (!friend) return
    setUnreadByFriend(map => {
      const current = map[friend] || 0
      if (!current) return map
      const next = { ...map }
      delete next[friend]
      setUnreadTotal(t => Math.max(0, t - current))
      return next
    })
    // 미리보기는 유지하되 내용을 비움
    setPreviewByFriend(p => ({ ...p, [friend]: '' }))
  }, [])

  const clearAll = useCallback(() => {
    setUnreadByFriend({})
    setUnreadTotal(0)
    try { localStorage.removeItem(LS_KEYS.unread) } catch {}
  }, [])

  // 🔹 인자에 string | null | undefined 허용 → 호출부가 null을 넘겨도 안전
  const getUnread = useCallback((friend?: string | null) => {
    if (!friend) return 0
    return unreadByFriend[friend] || 0
  }, [unreadByFriend])

  const getPreview = useCallback((friend?: string | null) => {
    if (!friend) return ''
    return previewByFriend[friend] || ''
  }, [previewByFriend])

  const getPreviewTime = useCallback((friend?: string | null) => {
    if (!friend) return null
    return previewTime[friend] ?? null
  }, [previewTime])

  const value = useMemo<NotificationsCtx>(() => ({
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
    getPreviewTime,
  }), [
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
    getPreviewTime,
  ])

  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>
}

// 훅: 컨텍스트가 없으면 명확한 에러
export const useNotifications = (): NotificationsCtx => {
  const ctx = useContext(NotifCtx)
  if (!ctx) throw new Error('useNotifications must be used within <NotificationsProvider>')
  return ctx
}