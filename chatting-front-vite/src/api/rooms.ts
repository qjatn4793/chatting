// src/api/rooms.ts
import http from '@/api/http'

export type RoomDto = {
    id: string
    type?: string | null
    createdAt?: string | null
    members?: string[] | null
    title?: string | null
}

export type AttachmentDto = {
    id?: number | null
    storageKey: string
    url: string
    size?: number | null
    contentType?: string | null
    originalName?: string | null
    width?: number | null
    height?: number | null
    createdAt?: string | null
}

export type MessageDto = {
    id?: number | null
    messageId?: string | null
    roomId?: string | null
    sender?: string | null
    username?: string | null
    content?: string | null
    createdAt?: string | number | null
    attachments?: AttachmentDto[] | null
}

export type StoredObject = {
    storageKey: string
    url: string
    size: number
    contentType: string
    originalName: string
}

export type InviteRequest = { identifiers: string[] }
export type InviteResponse = {
    invited: string[]
    alreadyMembers?: string[]
    notFound?: string[]
    failed?: string[]
}

export type CreateRoomRequest = {
    type?: 'GROUP' | 'DM'
    title?: string
    identifiers?: string[]
}

export const RoomsAPI = {
    list: (opts?: { signal?: AbortSignal }) =>
        http.get<RoomDto[]>('/rooms', { signal: opts?.signal as any }),

    messages: (roomId: string, limit = 50, opts?: { signal?: AbortSignal }) =>
        http.get<MessageDto[]>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
            params: { limit },
            signal: opts?.signal as any,
        }),

    // 단일 메시지 조회(첨부 포함)
    getMessage: (messageId: string, opts?: { signal?: AbortSignal }) =>
        http.get<MessageDto>(`/messages/${encodeURIComponent(messageId)}`, {
            signal: opts?.signal as any,
        }),

    openDmByIdentifier: (identifier: string) =>
        http.post<{ id: string }>('/rooms/dm/by-identifier', { identifier }),

    markRead: (roomId: string) => http.post(`/rooms/${encodeURIComponent(roomId)}/read`),

    send: (roomId: string, body: { message: string }) =>
        http.post<MessageDto>(`/rooms/${encodeURIComponent(roomId)}/send`, body),

    invite: (roomId: string, identifiers: string[]) =>
        http.post<InviteResponse>(`/rooms/${encodeURIComponent(roomId)}/invite`, { identifiers } as InviteRequest),

    get: (roomId: string, opts?: { signal?: AbortSignal }) =>
        http.get<RoomDto>(`/rooms/${encodeURIComponent(roomId)}`, { signal: opts?.signal as any }),

    lastMessagesBulk: (roomIds: string[], opts?: { signal?: AbortSignal }) => {
        const qs =
            Array.isArray(roomIds) && roomIds.length > 0
                ? `?${roomIds.map((id) => `roomIds=${encodeURIComponent(id)}`).join('&')}`
                : ''
        return http.get<MessageDto[]>(`/rooms/last-messages${qs}`, { signal: opts?.signal as any })
    },

    create: (body: CreateRoomRequest) => http.post<RoomDto>('/rooms', body),

    // ============ 파일 업로드 (messageId 전달) ============
    // kind는 선택값. 이번 변경에서는 프론트에서 넘기지 않아 서버가 파일별로 자동 판별합니다.
    uploadFile: async (file: File, kind?: 'image' | 'file', opts?: { messageId?: string }): Promise<StoredObject> => {
        const fd = new FormData()
        fd.append('file', file)
        if (kind) fd.append('kind', kind)
        const url = opts?.messageId != null ? `/files?messageId=${encodeURIComponent(opts.messageId)}` : '/files'
        const { data } = await http.post<StoredObject>(url, fd)
        return data
    },

    uploadFiles: async (files: File[], kind?: 'image' | 'file', opts?: { messageId?: string }): Promise<StoredObject[]> => {
        const fd = new FormData()
        files.forEach((f) => fd.append('files', f))
        if (kind) fd.append('kind', kind)
        const url =
            opts?.messageId != null
                ? `/files/batch?messageId=${encodeURIComponent(opts.messageId)}`
                : '/files/batch'
        const { data } = await http.post<StoredObject[]>(url, fd)
        return data
    },
}
