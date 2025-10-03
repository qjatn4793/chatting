// src/ws.ts
import { Client, IMessage, StompSubscription, IFrame } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const NATIVE_WS = import.meta.env.VITE_WS_URL as string | undefined
const SOCK_PATH =
  (import.meta.env.VITE_SOCKJS_PATH as string | undefined) || '/ws/'

type SubCb = (payload: any) => void

type SubRec = {
  destination: string
  cb: SubCb
  sub?: StompSubscription | null
}

class WS {
  private client: Client | null = null
  private token: string | null = null

  /** 중복 방지용: 동일 destination+cb 등록을 막기 위한 레지스트리 */
  private subs: SubRec[] = []

  /** 연결 상태 콜백 */
  private onConnectCbs: Array<(c: Client) => void> = []
  private onDisconnectCbs: Array<() => void> = []
  private onErrorCbs: Array<(e: unknown) => void> = []

  /** 라이프사이클 이벤트 바인딩 중복 방지 */
  private lifecycleBound = false

  setAuthToken(jwt: string | null) {
    this.token = jwt
    // 이미 연결된 상태에서 토큰이 바뀌었다면 재연결을 강제하도록
    if (this.client?.connected) {
      this.disconnect()
      this.connect()
    }
  }

  isActive() { return !!this.client?.active }
  isConnected() { return !!this.client?.connected }

  onConnect(cb: (c: Client) => void) { this.onConnectCbs.push(cb) }
  offConnect(cb: (c: Client) => void) {
    this.onConnectCbs = this.onConnectCbs.filter(f => f !== cb)
  }

  onDisconnect(cb: () => void) { this.onDisconnectCbs.push(cb) }
  offDisconnect(cb: () => void) {
    this.onDisconnectCbs = this.onDisconnectCbs.filter(f => f !== cb)
  }

  onError(cb: (e: unknown) => void) { this.onErrorCbs.push(cb) }
  offError(cb: (e: unknown) => void) {
    this.onErrorCbs = this.onErrorCbs.filter(f => f !== cb)
  }

  /**
   * 외부에서 “지금 연결 보장”을 요청할 때 호출
   * - active가 아니면 connect();
   * - active지만 연결 실패 루프 중이라면 그대로 두되, stompjs가 재시도 중이니 기다림
   */
  ensureConnected() {
    if (!this.client?.active) {
      this.connect()
    }
  }

  connect() {
    if (this.client?.active) return

    const client = new Client({
      ...(NATIVE_WS
        ? { brokerURL: NATIVE_WS }
        : { webSocketFactory: () => new SockJS(SOCK_PATH) }
      ),

      // 중요: 매(재)연결 직전에 최신 토큰을 connectHeaders에 주입
      beforeConnect: () => {
        client.connectHeaders = this.token
          ? { Authorization: `Bearer ${this.token}` }
          : {}
      },

      // 자동 재연결(고정 딜레이). 필요 시 5초 → 10초 등으로 조정
      reconnectDelay: 5000,

      // 서버와 맞춰 튜닝
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      debug: () => {},
    })

    client.onConnect = () => {
      // 끊겼던 구독 전부 복구
      this.subs.forEach((r) => {
        r.sub = client.subscribe(r.destination, (frame: IMessage) => {
          try { r.cb(JSON.parse(frame.body)) } catch { r.cb(frame.body) }
        })
      })
      this.onConnectCbs.forEach((f) => f(client))
    }

    client.onDisconnect = () => {
      this.onDisconnectCbs.forEach((f) => f())
    }

    client.onStompError = (frame: IFrame) => {
      this.onErrorCbs.forEach((h) => h(frame))
      // 에러 발생 시 재시도 보강
      this.ensureConnected()
    }

    client.onWebSocketClose = (e: CloseEvent) => {
      this.onDisconnectCbs.forEach((f) => f())
      // 브라우저/네트워크 이벤트와 무관하게 즉시 재시도 한번 보강
      this.ensureConnected()
    }

    client.onWebSocketError = (e: Event) => {
      this.onErrorCbs.forEach((h) => h(e))
      this.ensureConnected()
    }

    client.activate()
    this.client = client

    // 전역 라이프사이클 이벤트는 최초 1회만 바인딩
    this.bindLifecycleOnce()
  }

  disconnect() {
    if (this.client?.active) {
      try { this.client.deactivate() } catch {}
    }
    this.client = null
  }

  /**
   * 같은 destination+cb가 이미 등록되어 있으면 중복 구독을 막음
   */
  subscribe(destination: string, cb: SubCb): () => void {
    const dup = this.subs.find(s => s.destination === destination && s.cb === cb)
    if (dup) {
      // 이미 존재: 현재 연결되어 있고 서버 구독이 없다면 다시 서버 구독만 붙여줌
      if (this.client?.connected && !dup.sub) {
        dup.sub = this.client.subscribe(destination, (frame: IMessage) => {
          try { cb(JSON.parse(frame.body)) } catch { cb(frame.body) }
        })
      }
      return () => this._unsubscribeRecord(dup)
    }

    const rec: SubRec = { destination, cb, sub: null }
    this.subs.push(rec)

    if (this.client?.connected) {
      rec.sub = this.client.subscribe(destination, (frame: IMessage) => {
        try { cb(JSON.parse(frame.body)) } catch { cb(frame.body) }
      })
    }

    return () => this._unsubscribeRecord(rec)
  }

  private _unsubscribeRecord(rec: SubRec) {
    try { rec.sub?.unsubscribe() } catch {}
    rec.sub = null
    this.subs = this.subs.filter((x) => x !== rec)
  }

  publish(destination: string, body: any, headers: Record<string, string> = {}) {
    if (!this.client?.connected) return
    const h = { ...headers }
    if (this.token) h.Authorization = `Bearer ${this.token}`
    this.client.publish({
      destination,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: h,
    })
  }

  /** 페이지/네트워크 라이프사이클 이벤트 → 재연결 트리거 */
  private bindLifecycleOnce() {
    if (this.lifecycleBound || typeof window === 'undefined') return
    this.lifecycleBound = true

    const tryReconnect = () => this.ensureConnected()

    window.addEventListener('online', tryReconnect)
    // iOS/Safari bfcache 복원 포함
    window.addEventListener('pageshow', tryReconnect)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        tryReconnect()
      }
    })
  }
}

export const ws = new WS()
