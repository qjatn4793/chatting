// src/hooks/useInvalidate.ts
import { useCallback, useRef } from 'react'

/**
 * 여러 이벤트를 한 번의 실행으로 합치는 간단한 디바운스/스로틀 콤보.
 * - 최소 간격 REFRESH_MIN_GAP(ms)을 보장
 * - 호출이 몰려도 마지막 1회만 실행
 */
export function useInvalidate(
    runner: () => void | Promise<void>,
    REFRESH_MIN_GAP = 800
) {
    const nextTickRef = useRef<number | null>(null)
    const lastRunRef = useRef(0)
    const loadingRef = useRef(false)

    const runOnce = useCallback(async () => {
        if (loadingRef.current) return
        loadingRef.current = true
        try {
            await runner()
            lastRunRef.current = Date.now()
        } finally {
            loadingRef.current = false
        }
    }, [runner])

    const invalidate = useCallback(() => {
        const now = Date.now()
        const gap = now - lastRunRef.current
        const delay = gap >= REFRESH_MIN_GAP ? 0 : REFRESH_MIN_GAP - gap
        if (nextTickRef.current) window.clearTimeout(nextTickRef.current)
        nextTickRef.current = window.setTimeout(() => {
            runOnce()
            nextTickRef.current = null
        }, delay) as unknown as number
    }, [runOnce, REFRESH_MIN_GAP])

    return { invalidate, runOnce, nextTickRef }
}
