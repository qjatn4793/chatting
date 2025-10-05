// src/api/rooms.ts
import http from '@/api/http'

export type RoomDto = {
    id: string
    type?: string | null
    createdAt?: string | null
    members?: string[] | null
}

export type MessageDto = {
    id?: number | null
    messageId?: string | null
    roomId?: string | null
    sender?: string | null
    username?: string | null
    content?: string | null
    createdAt?: string | number | null
}

export const RoomsAPI = {
    list: (opts?: { signal?: AbortSignal }) =>
        http.get<RoomDto[]>('/rooms', { signal: opts?.signal as any }),
    messages: (roomId: string, limit = 50, opts?: { signal?: AbortSignal }) =>
        http.get<MessageDto[]>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
            params: { limit },
            signal: opts?.signal as any,
        }),
    openDmByIdentifier: (identifier: string) =>
        http.post<{ id: string }>('/rooms/dm/by-identifier', { identifier }),
    markRead: (roomId: string) =>
        http.post(`/rooms/${encodeURIComponent(roomId)}/read`),
    send: (roomId: string, body: { message: string }) =>
        http.post(`/rooms/${encodeURIComponent(roomId)}/send`, body),
}
