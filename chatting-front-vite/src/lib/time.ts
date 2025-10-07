// src/lib/time.ts

/** unknown까지 수용하는 안전한 파서 */
export const toMillis = (v: unknown): number => {
    if (v == null) return NaN
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
    if (typeof v === 'string') {
        const n = Number(v)
        if (Number.isFinite(n)) return n
        const t = Date.parse(v)
        return Number.isFinite(t) ? t : NaN
    }
    const s = String(v)
    const n = Number(s)
    if (Number.isFinite(n)) return n
    const t = Date.parse(s)
    return Number.isFinite(t) ? t : NaN
}

const toKstDate = (t: unknown): Date => {
    const ms = toMillis(t)
    return Number.isFinite(ms) ? new Date(ms) : new Date()
};

/** Invalid Date를 피하는 Date 생성기 (NaN이면 now 사용) */
const safeDate = (ms: number): Date => (Number.isFinite(ms) ? new Date(ms) : new Date())

/** KST 기준 "같은 날" 판별 */
export const isSameDayKST = (a: unknown, b: unknown = Date.now()): boolean => {
    const fmt = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    return fmt.format(toKstDate(a)) === fmt.format(toKstDate(b))
};

/** YYYY-MM-DD (weekday는 생략) */
const fmtYMDKST = (t: unknown): string => {
    const d = toKstDate(t)
    const parts = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d)

    let y = '', m = '', dd = ''
    for (const p of parts) {
        if (p.type === 'year') y = p.value
        else if (p.type === 'month') m = p.value
        else if (p.type === 'day') dd = p.value
    }
    return `${y}-${m}-${dd}`
};

/** 메시지용 짧은 표기 (KST): 같은 날 HH:mm, 아니면 MM/DD HH:mm */
export const fmtChatTimeKST = (t: unknown, now?: unknown): string => {
    const d = toKstDate(t)
    if (isSameDayKST(d, now)) {
        return new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(d)
    }
    const md = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
    }).format(d)
    const hm = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(d)
    return `${md} ${hm}`
}

/** 상세 툴팁용 (KST) */
export const fmtFullKST = (t: unknown): string => {
    const d = toKstDate(t)

    const ymdParts = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    }).formatToParts(d)

    let year = '', month = '', day = '', weekday = ''
    for (const p of ymdParts) {
        if (p.type === 'year') year = p.value
        else if (p.type === 'month') month = p.value
        else if (p.type === 'day') day = p.value
        else if (p.type === 'weekday') weekday = p.value
    }
    // 일부 환경에서 weekday에 괄호가 붙는 경우가 있어 제거
    weekday = weekday.replace(/[()]/g, '').trim()

    const hms = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(d)

    return `${year}-${month}-${day} ${weekday} ${hms} KST`
}

export const fmtKakaoTimeKST = (t: unknown): string => {
    const d = toKstDate(t)

    const timeStr = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true, // 오전/오후
    }).format(d) // 예: "오후 3:40"

    if (isSameDayKST(d)) {
        return timeStr
    }
    return `${fmtYMDKST(d)} ${timeStr}`
};