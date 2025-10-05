// src/lib/identity.ts
export const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const toStr = (x: unknown): string | undefined => {
    if (x == null) return undefined
    const s = String(x).trim()
    return s.length ? s : undefined
}

export const isUuidLike = (s?: string) => !!s && UUID_RE.test(s)
export const isEmailLike = (s?: string) => !!s && EMAIL_RE.test(s)

/** ID 동등 비교 (UUID 하이픈 유무 무시, 대소문자 무시) */
export const eqId = (a?: string, b?: string): boolean => {
    if (!a || !b) return false
    const A = a.trim()
    const B = b.trim()
    const aIsUuid = isUuidLike(A)
    const bIsUuid = isUuidLike(B)
    if (aIsUuid && bIsUuid) {
        return A.toLowerCase().replace(/-/g, '') === B.toLowerCase().replace(/-/g, '')
    }
    return A.toLowerCase() === B.toLowerCase()
}
