// src/lib/format.ts
import { toStr, EMAIL_RE } from './identity'

export const isEmail = (s?: string) => !!(s && EMAIL_RE.test(s))

export const formatNameEmail = (name?: string, email?: string): string => {
    const n = toStr(name)
    const e = toStr(email)
    if (n && e) return `${n} (${e})`
    if (n) return n
    if (e) return e
    return '알 수 없음'
}

export const errMsg = (e: any, fallback: string) =>
    e?.response?.data?.message || e?.message || fallback
