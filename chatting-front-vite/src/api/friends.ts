// src/api/friends.ts
import http from '@/api/http'

export type FriendBriefDto = {
    id?: string | null
    name?: string | null
    email?: string | null
}

const etagCache: { friends?: string } = {}

export const FriendsAPI = {
    list: (opts?: { signal?: AbortSignal }) =>
        http
            .get<FriendBriefDto[]>('/friends', {
                signal: opts?.signal,
                headers: etagCache.friends ? { 'If-None-Match': etagCache.friends } : undefined,
                validateStatus: (s) => s === 200 || s === 304,
            })
            .then((res) => {
                const etag = (res.headers as any)?.etag || (res.headers as any)?.ETag
                if (etag) etagCache.friends = etag
                return res
            }),
    sendRequest: (identifier: string) => http.post('/friends/requests', { identifier }),
    incoming: () => http.get('/friends/requests/incoming'),
    outgoing: () => http.get('/friends/requests/outgoing'),
}
