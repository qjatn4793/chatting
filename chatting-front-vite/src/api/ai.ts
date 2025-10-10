import http from '@/api/http'

export type AiAgent = {
    id: string
    name: string
    intro?: string
    tags?: string[]
    avatarUrl?: string
}

export type Page<T> = {
    content: T[]
    page: number
    size: number
    totalElements: number
}

export const AiAPI = {
    async search(params: { query?: string; page?: number; size?: number }): Promise<Page<AiAgent>> {
        const q = new URLSearchParams()
        if (params.query) q.set('query', params.query)
        if (params.page != null) q.set('page', String(params.page))
        if (params.size != null) q.set('size', String(params.size))
        const { data } = await http.get<Page<AiAgent>>(`/ai/agents?${q.toString()}`)
        return data
    },

    /** 여러 AI 에이전트를 한 번에 초대 (백엔드에서 중복 초대는 무시 처리 권장) */
    async invite(roomId: string, agentIds: string[]): Promise<{ ok: boolean }> {
        const { data } = await http.post(`/rooms/${roomId}/invite/ai`, { agentIds })
        return data
    },
}
