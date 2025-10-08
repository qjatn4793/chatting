// src/api/friends.ts
import http from '@/api/http'

export type FriendBriefDto = {
    id?: string | null
    name?: string | null
    email?: string | null
}

// ETag 및 데이터 캐시
const cache = {
    etag: undefined as string | undefined,
    friends: [] as FriendBriefDto[],
}

export const FriendsAPI = {
    list: (opts?: { signal?: AbortSignal }) =>
        http
            .get<FriendBriefDto[]>('/friends', {
                signal: opts?.signal as any,
                headers: cache.etag ? { 'If-None-Match': cache.etag } : undefined,
                validateStatus: (s) => s === 200 || s === 304,
            })
            .then((res) => {
                const etag = (res.headers as any)?.etag || (res.headers as any)?.ETag
                if (etag) cache.etag = etag

                if (res.status === 200) {
                    // 최신 데이터로 갱신
                    cache.friends = Array.isArray(res.data) ? res.data : []
                    return cache.friends
                }
                // 304 → 캐시 반환 (최초 호출에서 304면 빈 배열)
                return cache.friends
            }),

    sendRequest: (identifier: string) =>
        http.post('/friends/requests', { identifier }),

    incoming: () => http.get('/friends/requests/incoming'),
    outgoing: () => http.get('/friends/requests/outgoing'),
}
