// 전역 window.NativeWindow 타입 안전 도우미
export enum NotificationType {
    CRITICAL = 'CRITICAL',
    INFORMATIONAL = 'INFORMATIONAL',
}

type NativeWindowAPI = {
    notifyUser: (type: NotificationType | 'CRITICAL' | 'INFORMATIONAL') => void
    stopAttention?: () => void // 선택(있으면 사용)
}

function getAPI(): NativeWindowAPI | null {
    return (window as any).NativeWindow ?? null
}

export function notifyCritical() {
    const api = getAPI()
    if (api?.notifyUser) api.notifyUser(NotificationType.CRITICAL)
}

export function notifyInformational() {
    const api = getAPI()
    if (api?.notifyUser) api.notifyUser(NotificationType.INFORMATIONAL)
}

export function stopAttention() {
    const api = getAPI()
    if (api?.stopAttention) api.stopAttention()
}

export function isNativeAttentionSupported() {
    return !!getAPI()?.notifyUser
}
