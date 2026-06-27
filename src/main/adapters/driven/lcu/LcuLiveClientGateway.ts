import type {
  LiveClientEvent,
  LiveClientGateway
} from '../../../application/ports/LiveClientGateway'
import type { LockfileInfo } from '../../../domain/identity/lockfile'
import type { LcuConnectionService, LcuConnectionState } from './LcuConnectionService'
import { lcuGet } from './lcuHttp'
import { LcuWampSocket } from './lcuWs'

/** WebSocket reconnect backoff (within a single connected period). A drop is
 *  driven by the WS itself, not the observer — the observer's HTTP heartbeat
 *  won't notice a WS-only failure, so this gateway reconnects on its own. */
const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 10_000

/**
 * LCU live-feed adapter (spec 007) implementing `LiveClientGateway`. Rides the
 * shared `LcuConnectionService`: opens the WAMP socket when the API is `up`
 * (with the fresh lockfile credentials), closes it on `down`, and reconnects
 * with the new port/password on a client swap. Within a connected period it
 * also reconnects (backoff) if the socket drops unexpectedly.
 *
 * Routes incoming events to subscribers by the payload `uri`, and exposes a
 * one-shot REST `get()` over the same loopback for event enrichment. Never
 * throws across the port.
 */
export class LcuLiveClientGateway implements LiveClientGateway {
  private socket: LcuWampSocket | null = null
  private info: LockfileInfo | null = null
  private unsubscribeConnection: (() => void) | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = RECONNECT_BASE_MS
  /** uri → handlers. The set of uris is also the set of topics to (re)subscribe. */
  private readonly handlers = new Map<string, Set<(e: LiveClientEvent) => void>>()

  constructor(private readonly connection: LcuConnectionService) {}

  start(): void {
    if (this.unsubscribeConnection) return
    this.unsubscribeConnection = this.connection.subscribe((s) => this.onConnectionState(s))
    this.onConnectionState(this.connection.current())
  }

  stop(): void {
    this.unsubscribeConnection?.()
    this.unsubscribeConnection = null
    this.clearReconnect()
    this.closeSocket()
    this.info = null
  }

  subscribe(uri: string, handler: (e: LiveClientEvent) => void): () => void {
    let set = this.handlers.get(uri)
    if (!set) {
      set = new Set()
      this.handlers.set(uri, set)
    }
    set.add(handler)
    this.socket?.subscribe(uri) // ensure the topic is live on the current socket
    return () => {
      const s = this.handlers.get(uri)
      if (!s) return
      s.delete(handler)
      if (s.size === 0) this.handlers.delete(uri)
    }
  }

  async get(path: string): Promise<unknown | null> {
    if (!this.info) return null
    try {
      const res = await lcuGet(this.info, path)
      return res.status === 200 ? res.data : null
    } catch {
      return null
    }
  }

  private onConnectionState(state: LcuConnectionState): void {
    if (state.status === 'up') {
      this.info = state.info // fresh credentials (handles a client swap)
      this.clearReconnect()
      this.reconnectDelay = RECONNECT_BASE_MS
      this.openSocket()
      return
    }
    // 'down' or 'starting' — tear the socket down; a later 'up' reopens it.
    // Keep info during 'starting' for an in-flight REST get, but don't connect.
    this.info = state.status === 'starting' ? state.info : null
    this.clearReconnect()
    this.closeSocket()
  }

  private openSocket(): void {
    if (!this.info) return
    this.closeSocket()
    const socket = new LcuWampSocket(this.info, {
      onEvent: (e) => this.dispatch(e),
      onOpen: () => {
        this.reconnectDelay = RECONNECT_BASE_MS
      },
      onClose: () => this.scheduleReconnect(),
      onError: () => this.scheduleReconnect()
    })
    this.socket = socket
    socket.connect()
    for (const uri of this.handlers.keys()) socket.subscribe(uri)
  }

  private dispatch(e: LiveClientEvent): void {
    const set = this.handlers.get(e.uri)
    if (!set) return
    for (const handler of set) {
      try {
        handler(e)
      } catch (err) {
        console.error('LiveClient handler failed:', err)
      }
    }
  }

  private scheduleReconnect(): void {
    // Reconnect only while the observer still has us up (info present) and we
    // haven't been intentionally stopped. An intentional close detaches the
    // socket's listeners, so this never fires for a deliberate teardown.
    if (!this.info || this.reconnectTimer) return
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private closeSocket(): void {
    this.socket?.close()
    this.socket = null
  }
}
