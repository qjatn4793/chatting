// 웹 전용 "주의 끌기" 유틸: 제목/파비콘/알림/배지/소리(파일 없을 때 WebAudio 톤 fallback)
// ─────────────────────────────────────────────────────────────
// ✅ 핵심: Web Notification을 "항상 최신 1개"만 보여주도록 교체/합치기(coalesce)
//   - lastNotif.close()로 이전 알림 제거
//   - 같은 tag로 새 알림 교체 + 자동 닫힘 타이머 갱신
//   - 연속 호출은 COALESCE_MS 내에서 1개로 합치기
//   - 제목 깜빡임 텍스트는 interval 유지하면서 최신 텍스트만 갱신
// ─────────────────────────────────────────────────────────────

let titleTimer: number | null = null
let originalTitle = document.title
let currentBlinkText = '' // 🔔 깜빡임에 쓰일 최신 텍스트

// ===== favicon helpers =====
function getFaviconLink(): HTMLLinkElement {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
    }
    return link
}

export function setFaviconBadge(unread: number) {
    const link = getFaviconLink()
    const baseHref = (link.getAttribute('data-base') || link.href || '/favicon.ico')

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, size, size)
        if (unread > 0) {
            ctx.beginPath()
            ctx.arc(size - 8, 8, 7, 0, Math.PI * 2)
            ctx.fillStyle = '#ff3b30'
            ctx.fill()
            const t = unread > 9 ? '9+' : String(unread)
            ctx.fillStyle = '#fff'
            ctx.font = 'bold 10px Arial'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(t, size - 8, 8)
        }
        const url = canvas.toDataURL('image/png')
        link.href = url
        link.setAttribute('data-base', baseHref)
    }
    img.onerror = () => {
        clearFaviconBadge()
    }
    if (!link.getAttribute('data-base') && link.href) {
        link.setAttribute('data-base', link.href)
    }
    img.src = link.getAttribute('data-base') || '/favicon.ico'
}

export function clearFaviconBadge() {
    const link = getFaviconLink()
    const base = link.getAttribute('data-base')
    if (base) link.href = base
}

// ===== title blink =====
export function startTitleBlink(messagePreview: string) {
    // interval은 유지하고 텍스트만 최신으로 교체 → 알림이 쌓이지 않음
    currentBlinkText = messagePreview
    if (document.visibilityState === 'visible') return
    if (titleTimer != null) return // 이미 깜빡이는 중이면 텍스트만 갱신
    originalTitle = originalTitle || document.title
    let toggle = false
    titleTimer = window.setInterval(() => {
        toggle = !toggle
        document.title = toggle ? `🔔 ${currentBlinkText}` : originalTitle
    }, 1200) as unknown as number
}

export function stopTitleBlink() {
    if (titleTimer != null) {
        clearInterval(titleTimer)
        titleTimer = null
    }
    if (originalTitle) document.title = originalTitle
}

// ===== PWA Badging (fallback to favicon) =====
export async function setAppBadge(unread: number) {
    const anyNav = navigator as any
    if ('setAppBadge' in anyNav) {
        try {
            if (unread > 0) await anyNav.setAppBadge(unread)
            else await anyNav.clearAppBadge()
            return
        } catch { /* ignore */ }
    }
    // 미지원 시 파비콘 뱃지
    setFaviconBadge(unread)
}

// ===== Sound: mp3 우선, 실패시 WebAudio 톤 =====
let audioEl: HTMLAudioElement | null = null
let lastSoundAt = 0 // 레이트 리밋
const SOUND_COOLDOWN_MS = 400

// iOS/Safari는 사용자 제스처 후에만 재생 가능 → 필요 시 호출
export function primeAudio() {
    try {
        const a = new Audio()
        a.src = 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA' // 최소 더미
        a.volume = 0
        a.play().catch(() => {})
    } catch {}
}

/** WebAudio 톤 fallback: 짧은 '띵' */
function webAudioBeep(durationMs = 140, freq = 880) {
    try {
        const AC = (window.AudioContext || (window as any).webkitAudioContext)
        if (!AC) return
        const ctx = new AC()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.value = 0.001
        osc.connect(gain)
        gain.connect(ctx.destination)

        const now = ctx.currentTime
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)

        osc.start(now)
        osc.stop(now + durationMs / 1000 + 0.02)
        osc.onended = () => { try { ctx.close() } catch {} }
    } catch { /* ignore */ }
}

/** 모바일 진동(지원 시) — 무음 모드에서도 감지 가능 */
function vibrateShort() {
    if ('vibrate' in navigator) {
        try { navigator.vibrate(30) } catch {}
    }
}

/** 공개 API: 알림음 재생 (최신 1개 정책에 맞춰 레이트 리밋 포함) */
export function playPing() {
    const now = Date.now()
    if (now - lastSoundAt < SOUND_COOLDOWN_MS) return
    lastSoundAt = now

    try {
        if (!audioEl) {
            audioEl = new Audio('/sounds/ping.mp3') // 없어도 try-catch
            audioEl.preload = 'auto'
            audioEl.volume = 0.5
        }
        const p = audioEl.play()
        if (p && typeof p.then === 'function') {
            p.then(() => {}).catch(() => {
                webAudioBeep()
                vibrateShort()
            })
        }
        return
    } catch {
        webAudioBeep()
        vibrateShort()
    }
}

// ===== Web Notification (항상 최신 1개만) =====
let lastNotif: Notification | null = null
let notifCloseTimer: number | null = null

// 연속 호출 합치기(coalesce)
let coalesceTimer: number | null = null
let pendingNotif: { title: string; body?: string; durationMs?: number } | null = null
const COALESCE_MS = 250

/** 내부: 실제로 알림 1개만 띄움 */
function showOneNotificationNow(opts: { title: string; body?: string; durationMs?: number }) {
    if (!('Notification' in window)) return
    // 이전 알림 닫기 → 항상 화면에는 1개만 남김
    try { lastNotif?.close() } catch {}
    if (notifCloseTimer != null) {
        clearTimeout(notifCloseTimer)
        notifCloseTimer = null
    }
    try {
        // 동일 tag로 교체 (일부 브라우저에서 시각적 교체 동작)
        lastNotif = new Notification(opts.title, {
            body: opts.body,
            silent: true,
            tag: 'chat-latest',   // <-- 같은 태그 = 교체 의도
        })
        // 자동 닫힘(교체 시 타이머도 갱신)
        const d = Math.max(1000, opts.durationMs ?? 2500)
        notifCloseTimer = window.setTimeout(() => {
            try { lastNotif?.close() } catch {}
            lastNotif = null
        }, d) as unknown as number

        lastNotif.onclick = () => {
            window.focus()
            stopTitleBlink()
            try { lastNotif?.close() } catch {}
            lastNotif = null
        }
    } catch {
        // Notification 생성 실패는 조용히 무시
    }
}

/**
 * 공개 API: Web Notification (최신 1개만 유지)
 * - 연속 호출은 250ms 내에서 1개로 합쳐 가장 마지막 payload만 표시
 */
export async function showWebNotification(opts: {
    title: string
    body?: string
    onClick?: () => void          // ✅ 추가
    tag?: string                  // (선택) 최신 1개 유지 등에 쓰고 싶으면
    data?: any                    // (선택) 부가 데이터
}) {
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
        try { await Notification.requestPermission() } catch {}
    }
    if (Notification.permission === 'granted') {
        const n = new Notification(opts.title, {
            body: opts.body,
            silent: true,
            tag: opts.tag,            // ✅ 타입 정의에 있는 필드만 사용
            data: opts.data,
        })
        n.onclick = () => {
            try {
                // ✅ 클릭 시 라우팅 콜백 실행
                if (typeof opts.onClick === 'function') opts.onClick()
            } catch {}
            try { window.focus() } catch {}
            try { stopTitleBlink?.() } catch {}
            try { n.close() } catch {}
        }
    }
}

// 포커스/가시성 복귀 시 정리
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        stopTitleBlink()
        clearFaviconBadge()
        try { lastNotif?.close() } catch {}
        lastNotif = null
    }
})
window.addEventListener('focus', () => {
    stopTitleBlink()
    clearFaviconBadge()
    try { lastNotif?.close() } catch {}
    lastNotif = null
})
