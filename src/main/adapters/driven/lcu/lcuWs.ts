import WebSocket, { type RawData } from 'ws'
import type { LockfileInfo } from '../../../domain/identity/lockfile'

/**
 * The LCU event WebSocket transport (spec 007). The client exposes a
 * WAMP-derived event stream on the SAME loopback port as the HTTP API
 * (`wss://127.0.0.1:<port>/`, self-signed cert, Basic `riot:<password>` auth).
 * Every frame is a JSON array tagged with a numeric opcode; we only need three:
 *
 *   5  SUBSCRIBE    → send `[5, "<eventName>"]`
 *   6  UNSUBSCRIBE  → send `[6, "<eventName>"]`
 *   8  EVENT        → receive `[8, "<eventName>", { data, eventType, uri }]`
 *
 * An endpoint path maps to an event name by prefixing `OnJsonApiEvent` and
 * turning every `/` into `_` (hyphens kept), e.g.
 * `/lol-gameflow/v1/gameflow-phase` → `OnJsonApiEvent_lol-gameflow_v1_gameflow-phase`.
 * We subscribe per-endpoint (not the catch-all) so each event is delivered once;
 * routing is done on the payload `uri`, which is robust either way.
 *
 * This wraps ONE connection. Reconnect/availability is owned by the gateway
 * (which rides `LcuConnectionService`); this stays a dumb, reusable socket so it
 * can carry any number of topics. The lockfile password is used only to build
 * the auth header and never leaves the main process (Principle VI).
 *
 * Protocol facts verified against hextechdocs, the WAMP 1.0 type table, and the
 * PoniLCU / league-connect reference clients.
 */
const WAMP_SUBSCRIBE = 5
const WAMP_EVENT = 8

export interface LcuWsEvent {
  /** The API path that changed, e.g. `/lol-gameflow/v1/gameflow-phase`. */
  uri: string
  /** `Create` | `Update` | `Delete`. */
  eventType: string
  /** The endpoint's new body — may be object, array, primitive, or null. */
  data: unknown
}

/** Endpoint path → LCU event name: prefix `OnJsonApiEvent`, turn every `/` into `_`. */
export function uriToEventName(uri: string): string {
  return 'OnJsonApiEvent' + uri.replace(/\//g, '_')
}

/** Parse a raw WAMP text frame into an event, or null if it isn't an
 *  `[8, name, { data, eventType, uri }]` event frame. Pure — unit-tested. */
export function parseWampEvent(raw: string): LcuWsEvent | null {
  let arr: unknown
  try {
    arr = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(arr) || arr.length < 3 || arr[0] !== WAMP_EVENT) return null
  const payload = arr[2]
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.uri !== 'string') return null
  return {
    uri: p.uri,
    eventType: typeof p.eventType === 'string' ? p.eventType : '',
    data: p.data ?? null
  }
}

function frameText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  return Buffer.from(data as ArrayBuffer).toString('utf8')
}

export interface LcuWampSocketHandlers {
  onEvent: (e: LcuWsEvent) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: Error) => void
}

export class LcuWampSocket {
  private ws: WebSocket | null = null
  /** Event names to (re)subscribe on open. */
  private readonly topics = new Set<string>()

  constructor(
    private readonly info: LockfileInfo,
    private readonly handlers: LcuWampSocketHandlers
  ) {}

  connect(): void {
    const auth = 'Basic ' + Buffer.from(`riot:${this.info.password}`).toString('base64')
    const ws = new WebSocket(`wss://127.0.0.1:${this.info.port}/`, ['wamp'], {
      headers: { Authorization: auth },
      rejectUnauthorized: false, // scoped to this loopback socket only (self-signed cert)
      handshakeTimeout: 5000,
      perMessageDeflate: false
    })
    this.ws = ws

    ws.on('open', () => {
      for (const name of this.topics) this.send([WAMP_SUBSCRIBE, name])
      this.handlers.onOpen?.()
    })
    ws.on('message', (data: RawData) => {
      const evt = parseWampEvent(frameText(data))
      if (evt) this.handlers.onEvent(evt)
    })
    ws.on('close', () => this.handlers.onClose?.())
    ws.on('error', (err) => this.handlers.onError?.(err))
  }

  /** Subscribe to one endpoint's events (idempotent). Sends immediately when the
   *  socket is open, otherwise the frame is sent on the next `open`. */
  subscribe(uri: string): void {
    const name = uriToEventName(uri)
    if (this.topics.has(name)) return
    this.topics.add(name)
    if (this.ws?.readyState === WebSocket.OPEN) this.send([WAMP_SUBSCRIBE, name])
  }

  private send(frame: [number, string]): void {
    try {
      this.ws?.send(JSON.stringify(frame))
    } catch {
      /* socket racing closed — the gateway's reconnect will re-subscribe */
    }
  }

  /** Close intentionally: detach handlers first so a trailing close/error does
   *  not look like an unexpected drop (which would trigger a reconnect), then
   *  `terminate()` immediately. We don't need the graceful close handshake for a
   *  loopback socket we're discarding, and terminating avoids a lingering
   *  failsafe timer per close (which would pile up under reconnect churn). */
  close(): void {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    ws.removeAllListeners()
    try {
      ws.terminate()
    } catch {
      /* ignore */
    }
  }
}
