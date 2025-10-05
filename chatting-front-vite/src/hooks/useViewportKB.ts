// src/hooks/useViewportKB.ts
import { useCallback, useEffect, useRef } from 'react'

/**
 * 모바일 키보드/뷰포트 변화에 맞춰 CSS 변수 세팅:
 *  --vvh : 현재 뷰포트 높이(px)
 *  --kb  : 키보드로 줄어든 높이(px, 임계값 이상일 때만)
 *  --input-h : 입력창 높이(px) (옵션: setInputHeightRef로 전달)
 *
 * 사용처에서:
 *   const { setInputHeightRef } = useViewportKB({ onStable: scrollToEnd })
 *   <div ref={setInputHeightRef} />
 */
export function useViewportKB(opts?: { onStable?: () => void; kbThreshold?: number }) {
    const kbPxRef = useRef<number>(0)
    const baseVhRef = useRef<number>(0)
    const rafTokenRef = useRef<number | null>(null)
    const settleTimerRef = useRef<number | null>(null)
    const closingRef = useRef<boolean>(false)
    const inputWrapRef = useRef<HTMLElement | null>(null)
    const KB_THRESHOLD = opts?.kbThreshold ?? 80

    const setCSSVar = (k: string, v: string) =>
        document.documentElement.style.setProperty(k, v)

    const setViewportVars = useCallback(() => {
        const vv: any = (window as any).visualViewport
        const currentVh = Math.round(vv?.height ?? window.innerHeight)
        if (!baseVhRef.current) baseVhRef.current = currentVh
        setCSSVar('--vvh', `${currentVh}px`)
        const rawKb = Math.max(0, baseVhRef.current - currentVh)
        const kb = rawKb >= KB_THRESHOLD ? rawKb : 0
        kbPxRef.current = kb
        setCSSVar('--kb', `${kb}px`)

        if (kb > 0) {
            document.documentElement.classList.add('kb-open')
        } else {
            if (closingRef.current) {
                document.documentElement.classList.remove('kb-open')
                closingRef.current = false
            } else {
                document.documentElement.classList.remove('kb-open')
            }
            if (settleTimerRef.current) {
                window.clearTimeout(settleTimerRef.current)
                settleTimerRef.current = null
            }
        }
    }, [KB_THRESHOLD])

    const setInputHeightVar = useCallback(() => {
        const h = Math.round(inputWrapRef.current?.getBoundingClientRect().height ?? 56)
        setCSSVar('--input-h', `${h}px`)
    }, [])

    const setInputHeightRef = useCallback((el: HTMLElement | null) => {
        inputWrapRef.current = el
        setInputHeightVar()
    }, [setInputHeightVar])

    useEffect(() => {
        setViewportVars()
        requestAnimationFrame(setInputHeightVar)

        const vv: any = (window as any).visualViewport
        const onVV = () => {
            if (rafTokenRef.current) return
            rafTokenRef.current = requestAnimationFrame(() => {
                rafTokenRef.current = null
                setViewportVars()
                if (kbPxRef.current > 0) opts?.onStable?.()
            })
        }

        if (vv) {
            const type = 'ongeometrychange' in vv ? 'geometrychange' : 'resize'
            vv.addEventListener(type, onVV, { passive: true })
            vv.addEventListener('scroll', onVV, { passive: true })
        }

        const onResize = () => {
            baseVhRef.current = 0
            setViewportVars()
            setInputHeightVar()
            opts?.onStable?.()
        }

        window.addEventListener('resize', onResize, { passive: true })
        window.addEventListener('orientationchange', onResize, { passive: true })

        return () => {
            if (vv) {
                vv.removeEventListener('geometrychange', onVV as any)
                vv.removeEventListener('resize', onVV as any)
                vv.removeEventListener('scroll', onVV as any)
            }
            window.removeEventListener('resize', onResize as any)
            window.removeEventListener('orientationchange', onResize as any)
            if (rafTokenRef.current) cancelAnimationFrame(rafTokenRef.current)
            if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
            document.documentElement.classList.remove('kb-open')
        }
    }, [opts, setInputHeightVar, setViewportVars])

    const onInputBlur = useCallback(() => {
        closingRef.current = true
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = window.setTimeout(() => {
            document.documentElement.classList.remove('kb-open')
            closingRef.current = false
        }, 500) as unknown as number
    }, [])

    return { setInputHeightRef, onInputBlur }
}
