// src/lib/tabBlinker.ts
let baseTitle = 'Chatting Front'
let count = 0
let blinking = false

let timeoutId: number | null = null
let watchdogId: number | null = null
let lastFlip = 0

const VISIBLE_MS = 1000
const HIDDEN_MS = 1500
const WATCHDOG_MS = 15000        // 15초마다 점검
const STALE_THRESHOLD_MS = 60000 // 60초 넘게 flip 없으면 재시작

function altTitle() {
    return `🔔 새 메시지 ${count}개`
}

function now() {
    return Date.now()
}

function flip() {
    if (typeof document === 'undefined') return
    const want = (document.title === baseTitle) ? altTitle() : baseTitle
    document.title = want
    lastFlip = now()
}

function nextDelay() {
    if (typeof document === 'undefined') return VISIBLE_MS
    return document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS
}

function loop() {
    if (!blinking) return
    flip()
    timeoutId = window.setTimeout(loop, nextDelay())
}

function startWatchdog() {
    if (watchdogId != null) return
    const tick = () => {
        if (!blinking) { stopWatchdog(); return }
        const elapsed = now() - lastFlip
        // flip이 너무 오래 안 일어났으면(브라우저가 타이머를 심하게 클램프) 강제 재가동
        if (elapsed > STALE_THRESHOLD_MS) {
            if (timeoutId != null) { clearTimeout(timeoutId); timeoutId = null }
            loop()
        }
        watchdogId = window.setTimeout(tick, WATCHDOG_MS)
    }
    watchdogId = window.setTimeout(tick, WATCHDOG_MS)
}

function stopWatchdog() {
    if (watchdogId != null) {
        clearTimeout(watchdogId)
        watchdogId = null
    }
}

export function setBaseTitle(title: string = 'Chatting Front') {
    baseTitle = title || 'Chatting Front'
    if (!blinking && typeof document !== 'undefined') {
        document.title = baseTitle
    }
}

export function bump(n = 1) {
    count += Math.max(1, n)
    if (!blinking) {
        blinking = true
        lastFlip = 0
        loop()
        startWatchdog()
    }
}

export function start() {
    if (blinking) return
    blinking = true
    lastFlip = 0
    loop()
    startWatchdog()
}

export function stop() {
    blinking = false
    if (timeoutId != null) { clearTimeout(timeoutId); timeoutId = null }
    stopWatchdog()
}

export function reset() {
    stop()
    count = 0
    if (typeof document !== 'undefined') {
        document.title = baseTitle
    }
}

export function isBlinking() { return blinking }
export function getCount() { return count }

// 탭 가시성 바뀌면 루프를 재스케줄(브라우저 클램프 완화)
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (!blinking) {
            // 읽힘 상태면 기본 제목으로
            document.title = baseTitle
            return
        }
        // 깜빡임 중이면 즉시 다시 스케줄
        if (timeoutId != null) { clearTimeout(timeoutId); timeoutId = null }
        loop()
    })
}
