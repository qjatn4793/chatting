// src/hooks/useViewportKB.ts
import { useCallback, useEffect, useRef } from 'react'

/**
 * iOS/모바일 키보드 & 주소창 변동 대응 훅
 *
 * CSS 변수:
 *  --vvh     : 현재 보이는 viewport height(px) = visualViewport.height
 *  --kb      : 키보드로 줄어든 높이(px). kbThreshold 이상일 때만 반영
 *  --input-h : 입력창(래퍼) 실측 높이(px) = setInputHeightRef로 지정한 요소의 height
 *
 * 상태 클래스:
 *  html.kb-open : 키보드가 열린 상태로 판단될 때 추가 (CSS에서 sticky→fixed 스위칭 등에 활용)
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
    /** 입력창을 드래그로 끌어올릴 때 상위로 스크롤이 새지 않도록 차단 (기본 true) */
    blockDrag?: boolean
}) {
    const kbPxRef = useRef<number>(0)
    const baseVhRef = useRef<number>(0)
    const rafTokenRef = useRef<number | null>(null)
    const settleTimerRef = useRef<number | null>(null)
    const inputWrapRef = useRef<HTMLElement | null>(null)

    // 드래그 차단 관련
    const dragActiveRef = useRef<boolean>(false)
    const dragStartXRef = useRef<number>(0)
    const dragStartYRef = useRef<number>(0)
    const dragAxisLockedRef = useRef<'x' | 'y' | null>(null)

    const hasFocusRef = useRef<boolean>(false) // input focus 상태 추정용
    const KB_THRESHOLD = opts?.kbThreshold ?? 80
    const BLOCK_DRAG = opts?.blockDrag ?? true

    const setCSSVar = (k: string, v: string) =>
        document.documentElement.style.setProperty(k, v)

    /** baseVh는 "키보드가 닫힌 상태의 가장 큰 vvh"를 기준으로 재보정 */
    const calibrateBaseVh = useCallback((currentVh: number) => {
        // baseVh가 0이거나, 주소창 노출 등으로 vvh가 증가한 경우에는 baseVh를 키움
        if (baseVhRef.current === 0 || currentVh > baseVhRef.current) {
            baseVhRef.current = currentVh
        }
    }, [])

    /** visualViewport/innerHeight 기반으로 CSS 변수 갱신 */
    const setViewportVars = useCallback(() => {
        const vv: any = (window as any).visualViewport
        const currentVh = Math.round(vv?.height ?? window.innerHeight)

        // baseVh 보정
        calibrateBaseVh(currentVh)

        // 실제 보이는 높이
        setCSSVar('--vvh', `${currentVh}px`)

        // 키보드로 줄어든 높이 계산 (임계값 미만이면 0)
        const rawKb = Math.max(0, baseVhRef.current - currentVh)
        const kb = rawKb >= KB_THRESHOLD ? rawKb : 0
        kbPxRef.current = kb
        setCSSVar('--kb', `${kb}px`)

        // 키보드 오픈 판정 (포커스 + kb>0 이면 강하게 open, 그 외에는 kb 기준)
        const shouldOpen = kb > 0 || (hasFocusRef.current && rawKb >= KB_THRESHOLD)
        if (shouldOpen) {
            document.documentElement.classList.add('kb-open')
        } else {
            document.documentElement.classList.remove('kb-open')
        }
    }, [KB_THRESHOLD, calibrateBaseVh])

    /** 입력창 래퍼 높이 측정 → --input-h */
    const setInputHeightVar = useCallback(() => {
        const h = Math.round(inputWrapRef.current?.getBoundingClientRect().height ?? 56)
        if (h > 0) setCSSVar('--input-h', `${h}px`)
    }, [])

    /** 입력창 래퍼 ref (이벤트 바인딩 포함) */
    const setInputHeightRef = useCallback((el: HTMLElement | null) => {
        // 기존 바인딩 정리
        const prev = inputWrapRef.current
        if (prev) {
            prev.removeEventListener('touchstart', onTouchStart as any)
            prev.removeEventListener('touchmove', onTouchMove as any)
            prev.removeEventListener('touchend', onTouchEnd as any)
            prev.removeEventListener('touchcancel', onTouchEnd as any)
        }

        inputWrapRef.current = el

        // 새 타겟에 바인딩
        if (el && BLOCK_DRAG) {
            // passive: false 여야 preventDefault 가능
            el.addEventListener('touchstart', onTouchStart, { passive: false })
            el.addEventListener('touchmove', onTouchMove, { passive: false })
            el.addEventListener('touchend', onTouchEnd, { passive: true })
            el.addEventListener('touchcancel', onTouchEnd, { passive: true })
        }

        // 높이 반영
        setInputHeightVar()
    }, [setInputHeightVar, BLOCK_DRAG])

    /** onStable을 안전하게 호출 (layout 안정 후) */
    const scheduleStableCallback = useCallback(() => {
        if (typeof opts?.onStable !== 'function') return
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
        // 키보드/주소창 애니메이션이 끝나도록 살짝 늦게 호출
        settleTimerRef.current = window.setTimeout(() => {
            opts.onStable?.()
        }, 60) as unknown as number
    }, [opts])

    /** visualViewport 이벤트 → 변수 갱신 스케줄 */
    const scheduleViewportUpdate = useCallback(() => {
        if (rafTokenRef.current != null) return
        rafTokenRef.current = requestAnimationFrame(() => {
            rafTokenRef.current = null
            setViewportVars()
            setInputHeightVar()
            // 키보드가 열려 있거나 포커스가 있으면 안정 콜백
            if (kbPxRef.current > 0 || hasFocusRef.current) scheduleStableCallback()
        })
    }, [setViewportVars, setInputHeightVar, scheduleStableCallback])

    /** 포커스인/아웃으로 키보드 상태 힌트 */
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
            // 포커스가 바로 사라져도 키보드는 애니메이션으로 남아있을 수 있으므로
            // 뷰포트 업데이트를 한 번 더 예약
            scheduleViewportUpdate()
        }
        document.addEventListener('focusin', onFocusIn)
        document.addEventListener('focusout', onFocusOut)
        return () => {
            document.removeEventListener('focusin', onFocusIn)
            document.removeEventListener('focusout', onFocusOut)
        }
    }, [scheduleViewportUpdate])

    /** 초기 세팅 & 리스너 */
    useEffect(() => {
        // 최초 동기화
        setViewportVars()
        requestAnimationFrame(setInputHeightVar)

        const vv: any = (window as any).visualViewport
        if (vv) {
            const type = 'ongeometrychange' in vv ? 'geometrychange' : 'resize'
            vv.addEventListener(type, scheduleViewportUpdate, { passive: true })
            vv.addEventListener('scroll', scheduleViewportUpdate, { passive: true })
        }

        const onResize = () => {
            // 화면 회전/주소창 확장 등으로 기준이 바뀌면 baseVh 리셋
            baseVhRef.current = 0
            scheduleViewportUpdate()
        }
        window.addEventListener('resize', onResize, { passive: true })
        window.addEventListener('orientationchange', onResize, { passive: true })

        return () => {
            if (vv) {
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

    /** 입력 요소에서 blur 시 kb-open 제거 보조 */
    const onInputBlur = useCallback(() => {
        hasFocusRef.current = false
        // 약간의 지연 후 상태 정리 (IME/키보드 잔상 고려)
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = window.setTimeout(() => {
            scheduleViewportUpdate()
        }, 120) as unknown as number
    }, [scheduleViewportUpdate])

    /**
     * ──────────────────────────────────────────────
     *  입력바 드래그 시 상위 스크롤 체이닝 방지 처리
     *  - 수직 제스처로 판단되면 preventDefault + stopPropagation
     *  - 수평 제스처(뒤로가기 제스처 등)는 그대로 허용
     * ──────────────────────────────────────────────
     */
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

        // 축 잠금: 처음 큰 이동 방향으로 결정
        if (dragAxisLockedRef.current == null) {
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 4) {
                dragAxisLockedRef.current = 'y'
            } else if (Math.abs(dx) > 6) {
                dragAxisLockedRef.current = 'x'
            } else {
                return
            }
        }

        // 세로 스와이프만 차단 (수평 제스처는 허용)
        if (dragAxisLockedRef.current === 'y') {
            // 키보드가 열려 있다고 판단되면 상위로 스크롤 새는 것을 차단
            if (kbPxRef.current > 0 || document.documentElement.classList.contains('kb-open')) {
                e.preventDefault()
                e.stopPropagation()
            }
        }
    }, [BLOCK_DRAG])

    const onTouchEnd = useCallback(() => {
        dragActiveRef.current = false
        dragAxisLockedRef.current = null
    }, [])

    return { setInputHeightRef, onInputBlur }
}
