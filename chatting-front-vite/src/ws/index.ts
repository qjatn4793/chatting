import { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const NATIVE_WS = import.meta.env.VITE_WS_URL as string | undefined
const SOCK_PATH = (import.meta.env.VITE_SOCKJS_PATH as string | undefined) || '/ws'

type SubCb = (payload: any) => void
type SubRec = { destination: string; cb: SubCb; sub?: StompSubscription }

class WS {
  private client: Client | null = null
  private token: string | null = null
  private subs: SubRec[] = []
  private onConnectCbs: Array<(c: Client) => void> = []
  private onErrorCbs: Array<(e: unknown) => void> = []

  setAuthToken(jwt: string | null) {
    this.token = jwt
    // 다음 연결/재연결에 반영
    if (this.client?.connected) {
      // 필요하면 여기서 DISCONNECT 후 재연결 로직을 넣어도 됨
    }
  }

  isActive() {
    return !!this.client?.active
  }
  isConnected() {
    return !!this.client?.connected
  }

  onConnect(cb: (c: Client) => void) { this.onConnectCbs.push(cb) }
  onError(cb: (e: unknown) => void) { this.onErrorCbs.push(cb) }

  connect() {
    if (this.client?.active) return

    const client = new Client({
      ...(NATIVE_WS ? { brokerURL: NATIVE_WS } : { webSocketFactory: () => new SockJS(SOCK_PATH) }),
      connectHeaders: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {},
    })

    client.onConnect = () => {
      // 끊겼던 구독 복구
      this.subs.forEach((r) => {
        r.sub = client.subscribe(r.destination, (frame: IMessage) => {
          try { r.cb(JSON.parse(frame.body)) } catch { r.cb(frame.body) }
        })
      })
      this.onConnectCbs.forEach((f) => f(client))
    }
    client.onStompError = (f) => this.onErrorCbs.forEach((h) => h(f))
    client.onWebSocketError = (e) => this.onErrorCbs.forEach((h) => h(e))

    client.activate()
    this.client = client
  }

  disconnect() {
    if (this.client?.active) this.client.deactivate()
    this.client = null
  }

  subscribe(destination: string, cb: SubCb): () => void {
    const rec: SubRec = { destination, cb }
    this.subs.push(rec)

    if (this.client?.connected) {
      rec.sub = this.client.subscribe(destination, (frame: IMessage) => {
        try { cb(JSON.parse(frame.body)) } catch { cb(frame.body) }
      })
    }
    return () => {
      try { rec.sub?.unsubscribe() } catch {}
      this.subs = this.subs.filter((x) => x !== rec)
    }
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
}

export const ws = new WS()
