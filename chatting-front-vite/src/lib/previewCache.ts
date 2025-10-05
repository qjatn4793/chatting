// src/lib/previewCache.ts
export type RoomPreview = {
    preview: string | null
    at: string | number | null
    dmPeer?: string | null
    updatedAt: number
}

const KEY = 'chat.preview.v1'
let mem = new Map<string, RoomPreview>()

// 세션 저장소에서 복구
try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
        const obj = JSON.parse(raw) as Record<string, RoomPreview>
        mem = new Map(Object.entries(obj))
    }
} catch {
    mem = new Map()
}

const persist = () => {
    try {
        const obj: Record<string, RoomPreview> = {}
        for (const [k, v] of mem.entries()) obj[k] = v
        sessionStorage.setItem(KEY, JSON.stringify(obj))
    } catch {
        /* ignore */
    }
}

export const previewCache = {
    get(roomId: string): RoomPreview | undefined {
        return mem.get(roomId)
    },
    set(roomId: string, data: Partial<RoomPreview>) {
        const prev = mem.get(roomId)
        const next: RoomPreview = {
            preview: data.preview ?? prev?.preview ?? null,
            at: data.at ?? prev?.at ?? null,
            dmPeer: data.dmPeer ?? prev?.dmPeer ?? undefined,
            updatedAt: Date.now(),
        }
        mem.set(roomId, next)
        persist()
    },
    /** 방 배열에 캐시를 병합하여 미리보기/시간/DM 라벨을 즉시 수화 */
    hydrateRooms<T extends { id: string; lastMessagePreview?: any; lastMessageAt?: any; dmPeer?: any }>(
        rooms: T[],
    ): T[] {
        return rooms.map((r) => {
            const c = mem.get(r.id)
            if (!c) return r
            return {
                ...r,
                lastMessagePreview: r.lastMessagePreview ?? c.preview ?? null,
                lastMessageAt: r.lastMessageAt ?? c.at ?? null,
                dmPeer: r.dmPeer ?? c.dmPeer ?? null,
            }
        })
    },
    /** 오래된 항목 정리(선택): N시간 지난 것 제거 */
    gc(maxAgeMs = 1000 * 60 * 60 * 24 * 7) {
        const now = Date.now()
        let changed = false
        for (const [k, v] of mem.entries()) {
            if (now - (v.updatedAt || 0) > maxAgeMs) {
                mem.delete(k)
                changed = true
            }
        }
        if (changed) persist()
    },
}
