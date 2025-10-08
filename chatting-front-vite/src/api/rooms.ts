import http from '@/api/http'

export type RoomDto = {
    id: string
    type?: string | null
    createdAt?: string | null
    members?: string[] | null
    title?: string | null   // ◀ 그룹 방 제목(선택)
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

// 초대 API 요청/응답 타입
export type InviteRequest = { identifiers: string[] }
export type InviteResponse = {
    invited: string[]
    alreadyMembers?: string[]
    notFound?: string[]
    failed?: string[]
}

/** ◀ 방 생성 요청 */
export type CreateRoomRequest = {
    type?: 'GROUP' | 'DM'   // 여기서는 'GROUP'만 사용
    title?: string
    identifiers?: string[]  // 선택: 함께 초대할 식별자들(이메일/UUID)
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

    /** ◀ 신규: 방 생성 */
    create: (body: CreateRoomRequest) =>
        http.post<RoomDto>('/rooms', body),
}
