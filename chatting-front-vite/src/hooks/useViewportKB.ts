// src/hooks/useViewportKB.ts
import { useCallback, useEffect, useRef, useMemo } from 'react'

/**
 * iOS / Android(기타) 키보드 & 주소창 변동 대응 훅 (플랫폼 분기 + 공통 인터페이스)
 *
 * 노출 CSS 변수:
 *  --vvh     : 현재 보이는 viewport height(px)
 *  --kb      : 키보드로 줄어든 높이(px). kbThreshold 이상일 때만 반영
 *  --input-h : 입력창(래퍼) 실측 높이(px) = setInputHeightRef로 지정한 요소의 height
 *
 * 상태 클래스:
 *  html.kb-open : 키보드가 열린 상태로 판단될 때 추가
 *
 * 사용 예:
 *  const { setInputHeightRef, onInputBlur } = useViewportKB({ onStable: scrollToEnd })
 *  <div className="chat__input" ref={setInputHeightRef}>
 *    <input onBlur={onInputBlur} ... />
 *  </div>
 */
export function useViewportKB(opts?: {
    onStable?: () => void
    kbThreshold?: number
    blockDrag?: boolean
    /** AOS에서만 입력창 위치를 kb로 보정하고 싶으면 true(기본값 true) */
    applyKbOnAndroid?: boolean
    /** iOS에서 kb 보정을 끄고 싶으면 false로 (기본값 true) */
    applyKbOniOS?: boolean
}) {
    const KB_THRESHOLD = opts?.kbThreshold ?? 80
    const BLOCK_DRAG   = opts?.blockDrag ?? true
    const APPLY_KB_ANDROID = opts?.applyKbOnAndroid ?? true
    const APPLY_KB_IOS     = opts?.applyKbOniOS ?? true

    // ───────────────────────── 플랫폼 판별 ─────────────────────────
    const isIOS = useMemo(() => {
        if (typeof navigator === 'undefined') return false
        const ua = navigator.userAgent || ''
        const touch =
            typeof window !== 'undefined' &&
            ('ontouchstart' in window || (navigator as any).maxTouchPoints > 0)
        // iPadOS 13+는 Mac처럼 보일 수 있으므로 터치 여부로 보강
        return /iPhone|iPad|iPod/i.test(ua) || (touch && /Macintosh/.test(ua))
    }, [])

    // ───────────────────────── 공통 상태 ─────────────────────────
    const inputWrapRef = useRef<HTMLElement | null>(null)
    const kbPxRef = useRef<number>(0)           // 현재 kb(px)
    const rafTokenRef = useRef<number | null>(null)
    const settleTimerRef = useRef<number | null>(null)
    const hasFocusRef = useRef<boolean>(false)  // input focus 힌트

    // Android/기타용 레퍼런스
    const baseHRef = useRef<number>(0) // 키보드 닫힌 상태에서의 "가장 큰" innerHeight

    // 드래그 차단 관련
    const dragActiveRef = useRef<boolean>(false)
    const dragStartXRef = useRef<number>(0)
    const dragStartYRef = useRef<number>(0)
    const dragAxisLockedRef = useRef<'x' | 'y' | null>(null)

    const setCSSVar = (k: string, v: string) => {
        try { document.documentElement.style.setProperty(k, v) } catch {}
    }

    // ───────────────────────── input 높이 반영 ─────────────────────────
    const setInputHeightVar = useCallback(() => {
        const h = Math.round(inputWrapRef.current?.getBoundingClientRect().height ?? 56)
        if (h > 0) setCSSVar('--input-h', `${h}px`)
    }, [])

    // ───────────────────────── iOS 경로 ─────────────────────────
    const updateIOS = useCallback(() => {
        const vv: any = (window as any).visualViewport
        const vh = vv ? vv.height : window.innerHeight
        const layoutH = window.innerHeight
        const used = Math.min(vh, layoutH)

        setCSSVar('--vvh', `${Math.round(used)}px`)

        // 키보드 추정: layoutViewport - visualViewport - offsetTop
        let kb = 0
        if (vv) {
            kb = Math.max(0, layoutH - vv.height - (vv.offsetTop || 0))
        }

        // ⬇️ iOS 보정 적용 여부에 따라 --kb, kb-open 제어
        if (APPLY_KB_IOS) {
            const applyKb = kb >= KB_THRESHOLD ? Math.round(kb) : 0
            kbPxRef.current = applyKb
            setCSSVar('--kb', `${applyKb}px`)
            const shouldOpen = applyKb > 0 || (hasFocusRef.current && kb >= KB_THRESHOLD)
            if (shouldOpen) document.documentElement.classList.add('kb-open')
            else document.documentElement.classList.remove('kb-open')
        } else {
            // iOS에서는 입력창 위치 보정 비활성화: 항상 0, 클래스 제거
            kbPxRef.current = 0
            setCSSVar('--kb', `0px`)
            document.documentElement.classList.remove('kb-open')
        }
    }, [APPLY_KB_IOS, KB_THRESHOLD])

    // ───────────────────────── Android/기타 경로 ─────────────────────────
    const updateAndroid = useCallback(() => {
        const h = window.innerHeight
        // baseH는 가능한 한 "가장 큰 높이"로 유지(주소창 완전 확장, 키보드 닫힘 시 등)
        baseHRef.current = Math.max(baseHRef.current || 0, h)

        setCSSVar('--vvh', `${h}px`)

        // 키보드 추정: baseH - innerHeight
        const rawKb = Math.max(0, baseHRef.current - h)

        if (APPLY_KB_ANDROID) {
            const applyKb = rawKb >= KB_THRESHOLD ? rawKb : 0
            kbPxRef.current = applyKb
            setCSSVar('--kb', `${applyKb}px`)
            const shouldOpen = applyKb > 0 || (hasFocusRef.current && rawKb >= KB_THRESHOLD)
            if (shouldOpen) document.documentElement.classList.add('kb-open')
            else document.documentElement.classList.remove('kb-open')
        } else {
            kbPxRef.current = 0
            setCSSVar('--kb', `0px`)
            document.documentElement.classList.remove('kb-open')
        }
    }, [APPLY_KB_ANDROID, KB_THRESHOLD])

    // ───────────────────────── 공통 스케줄러 ─────────────────────────
    const scheduleStableCallback = useCallback(() => {
        if (typeof opts?.onStable !== 'function') return
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
        // 애니메이션/주소창 변화가 잦으므로 살짝 늦춰서 호출
        settleTimerRef.current = window.setTimeout(() => {
            opts.onStable?.()
        }, 80) as unknown as number
    }, [opts])

    const scheduleViewportUpdate = useCallback(() => {
        if (rafTokenRef.current != null) return
        rafTokenRef.current = requestAnimationFrame(() => {
            rafTokenRef.current = null

            if (isIOS) updateIOS()
            else updateAndroid()

            setInputHeightVar()
            if (kbPxRef.current > 0 || hasFocusRef.current) scheduleStableCallback()
        })
    }, [isIOS, updateIOS, updateAndroid, setInputHeightVar, scheduleStableCallback])

    // ───────────────────────── focus 힌트(공통) ─────────────────────────
    useEffect(() => {
        const onFocusIn = (e: FocusEvent) => {
            const t = e.target as HTMLElement | null
            if (!t) return
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) {
                hasFocusRef.current = true
                scheduleViewportUpdate()
            }
        }
        const onFocusOut = () => {
            hasFocusRef.current = false
            scheduleViewportUpdate()
        }
        document.addEventListener('focusin', onFocusIn)
        document.addEventListener('focusout', onFocusOut)
        return () => {
            document.removeEventListener('focusin', onFocusIn)
            document.removeEventListener('focusout', onFocusOut)
        }
    }, [scheduleViewportUpdate])

    // ───────────────────────── 초기 세팅 & 리스너 설치 ─────────────────────────
    useEffect(() => {
        // 최초 동기화
        if (isIOS) updateIOS(); else updateAndroid()
        requestAnimationFrame(setInputHeightVar)

        // iOS: visualViewport 이벤트 사용
        const vv: any = (window as any).visualViewport
        if (isIOS && vv) {
            const type = 'ongeometrychange' in vv ? 'geometrychange' : 'resize'
            vv.addEventListener(type, scheduleViewportUpdate, { passive: true })
            vv.addEventListener('scroll', scheduleViewportUpdate, { passive: true })
        }

        // 공통: 리사이즈/회전
        const onResize = () => {
            // Android는 baseH를 다시 키울 수 있도록 즉시 업데이트
            if (!isIOS) baseHRef.current = Math.max(baseHRef.current, window.innerHeight)
            scheduleViewportUpdate()
        }
        window.addEventListener('resize', onResize, { passive: true })
        window.addEventListener('orientationchange', onResize, { passive: true })

        return () => {
            if (isIOS && vv) {
                vv.removeEventListener('geometrychange', scheduleViewportUpdate as any)
                vv.removeEventListener('resize', scheduleViewportUpdate as any)
                vv.removeEventListener('scroll', scheduleViewportUpdate as any)
            }
            window.removeEventListener('resize', onResize as any)
            window.removeEventListener('orientationchange', onResize as any)
            if (rafTokenRef.current) cancelAnimationFrame(rafTokenRef.current)
            if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
            document.documentElement.classList.remove('kb-open')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // 최초 1회만 설치

    // ───────────────────────── ref setter (드래그 차단 포함) ─────────────────────────
    const onTouchStart = useCallback((e: TouchEvent) => {
        if (!BLOCK_DRAG) return
        if (!e.touches || e.touches.length !== 1) return
        dragActiveRef.current = true
        dragAxisLockedRef.current = null
        dragStartXRef.current = e.touches[0].clientX
        dragStartYRef.current = e.touches[0].clientY
    }, [BLOCK_DRAG])

    const onTouchMove = useCallback((e: TouchEvent) => {
        if (!BLOCK_DRAG) return
        if (!dragActiveRef.current || !e.touches || e.touches.length !== 1) return
        const dx = e.touches[0].clientX - dragStartXRef.current
        const dy = e.touches[0].clientY - dragStartYRef.current

        if (dragAxisLockedRef.current == null) {
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 4) dragAxisLockedRef.current = 'y'
            else if (Math.abs(dx) > 6) dragAxisLockedRef.current = 'x'
            else return
        }

        if (dragAxisLockedRef.current === 'y') {
            if (kbPxRef.current > 0 || document.documentElement.classList.contains('kb-open')) {
                // 키보드 열림 시 세로 스크롤 체이닝 방지
                e.preventDefault()
                e.stopPropagation()
            }
        }
    }, [BLOCK_DRAG])

    const onTouchEnd = useCallback(() => {
        dragActiveRef.current = false
        dragAxisLockedRef.current = null
    }, [])

    const setInputHeightRef = useCallback((el: HTMLElement | null) => {
        // 기존 바인딩 해제
        const prev = inputWrapRef.current
        if (prev) {
            prev.removeEventListener('touchstart', onTouchStart as any)
            prev.removeEventListener('touchmove', onTouchMove as any)
            prev.removeEventListener('touchend', onTouchEnd as any)
            prev.removeEventListener('touchcancel', onTouchEnd as any)
        }

        inputWrapRef.current = el

        if (el && BLOCK_DRAG) {
            // passive:false 여야 preventDefault 가능
            el.addEventListener('touchstart', onTouchStart, { passive: false })
            el.addEventListener('touchmove', onTouchMove, { passive: false })
            el.addEventListener('touchend', onTouchEnd, { passive: true })
            el.addEventListener('touchcancel', onTouchEnd, { passive: true })
        }

        // 높이 반영
        setInputHeightVar()
    }, [setInputHeightVar, BLOCK_DRAG, onTouchStart, onTouchMove, onTouchEnd])

    // ───────────────────────── blur 보조(플랫폼별 보정) ─────────────────────────
    const onInputBlur = useCallback(() => {
        hasFocusRef.current = false
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)

        // iOS: blur 직후 주소창/툴바 복원 애니메이션이 있으므로 딜레이 후 동기화
        // Android: blur 이후 innerHeight가 커지면 baseH 갱신을 한 번 더 시도
        settleTimerRef.current = window.setTimeout(() => {
            if (!isIOS) baseHRef.current = Math.max(baseHRef.current, window.innerHeight)
            scheduleViewportUpdate()
        }, isIOS ? 120 : 80) as unknown as number
    }, [scheduleViewportUpdate, isIOS])

    return { setInputHeightRef, onInputBlur }
}
