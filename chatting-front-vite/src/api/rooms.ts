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

// 초대 API 요청/응답 타입 (백엔드 계약에 맞춰 필요 시 조정)
export type InviteRequest = {
    identifiers: string[] // email, uuid 등 식별자들
}

export type InviteResponse = {
    invited: string[]         // 성공적으로 초대된 식별자
    alreadyMembers?: string[] // 이미 멤버였던 식별자
    notFound?: string[]       // 매칭 실패
    failed?: string[]         // 서버 에러 등
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

    /** 현재 방에 식별자(이메일/UUID 등)로 친구(유저) 초대 */
    invite: (roomId: string, identifiers: string[]) =>
        http.post<InviteResponse>(
            `/rooms/${encodeURIComponent(roomId)}/invite`,
            { identifiers } as InviteRequest
        ),

    /** 방 단건 조회가 필요하면 사용 — 백엔드에 있다면 열어두기 */
    get: (roomId: string, opts?: { signal?: AbortSignal }) =>
        http.get<RoomDto>(`/rooms/${encodeURIComponent(roomId)}`, {
            signal: opts?.signal as any,
        }),

    /**
     * ✅ 벌크 최신 메시지 조회
     * GET /api/rooms/last-messages?roomIds=a&roomIds=b&...
     * - roomIds: 최신 1건을 받고 싶은 방 ID 배열
     * - 백엔드 응답 타입은 MessageDto[] (각 element는 해당 room의 최신 메시지)
     */
    lastMessagesBulk: (roomIds: string[], opts?: { signal?: AbortSignal }) => {
        const qs =
            Array.isArray(roomIds) && roomIds.length > 0
                ? `?${roomIds.map((id) => `roomIds=${encodeURIComponent(id)}`).join('&')}`
                : ''
        return http.get<MessageDto[]>(`/rooms/last-messages${qs}`, {
            signal: opts?.signal as any,
        })
    },
}
