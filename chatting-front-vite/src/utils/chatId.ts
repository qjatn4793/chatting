/**
 * 공통 ID 정규화 유틸
 * - 서버/브로커마다 제각각인 필드를 일관된 문자열로 변환
 */

export function keyOf(x: any): string | undefined {
    const cand = x?.id ?? x?.userId ?? x?.uuid ?? x?.uid ?? x?.userUUID ?? x
    if (cand === null || cand === undefined) return undefined
    const s = String(cand).trim()
    return s || undefined
}

/** 메시지/페이로드에서 roomId 추출 */
export function roomIdOf(msg: any): string | undefined {
    const cand =
        msg?.roomId ??
        msg?.room ??
        msg?.channelId ??
        msg?.chatRoomId ??
        msg?.conversationId
    if (cand !== undefined && cand !== null) return String(cand)

    // STOMP destination에서 추출 (예: /topic/room.{id} 또는 /topic/rooms/{id})
    const dest = msg?.destination || msg?.headers?.destination
    if (typeof dest === 'string') {
        const m =
            dest.match(/room[./-]([A-Za-z0-9:_-]+)/) ||
            dest.match(/rooms[./-]([A-Za-z0-9:_-]+)/)
        if (m) return m[1]
    }
    return undefined
}

/** 메시지 발신자 식별자 추출 */
export function senderKeyOf(msg: any): string | undefined {
    const cand =
        msg?.senderId ??
        msg?.sender ??
        msg?.from ??
        msg?.user ??
        msg?.senderUUID ??
        msg?.email ??
        msg?.senderEmail
    return keyOf(cand)
}

/** 메시지 고유 ID 추출 */
export function messageIdOf(msg: any): string | undefined {
    const cand = msg?.id ?? msg?.messageId ?? msg?.uuid
    return cand ? String(cand) : undefined
}
