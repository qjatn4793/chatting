// src/lib/time.ts
export const toMillis = (v: string | number | null | undefined): number => {
    if (v == null) return -Infinity
    const n = Number(v)
    if (!Number.isNaN(n)) return n
    const t = Date.parse(String(v))
    return Number.isNaN(t) ? -Infinity : t
}

/** 오늘은 HH:mm, 그 외 MM/DD */
export const fmtTime = (ts?: string | number | null): string => {
    if (ts == null) return ''
    const n = Number(ts)
    const d = isNaN(n) ? new Date(ts as any) : new Date(n)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    if (sameDay) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
