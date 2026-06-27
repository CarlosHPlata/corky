/**
 * Driven port for the local League client's LIVE event feed (spec 007) — the
 * framework-free seam over the LCU WAMP WebSocket. Distinct from
 * `LeagueClientGateway` (identity reads) and from the future in-game Live Client
 * Data API (port 2999): this is the lockfile-authenticated client event stream.
 *
 * Deliberately generic and multi-topic so future client-aware features (rune
 * import, in-client shop, etc.) attach by subscribing another `uri` — no new
 * transport. ALL WS/lockfile specifics live behind it. Implementations MUST NOT
 * throw across this boundary; connection drops are handled internally.
 */
export interface LiveClientEvent {
  /** The API path that changed, e.g. `/lol-gameflow/v1/gameflow-phase`. */
  uri: string
  /** `Create` | `Update` | `Delete`. */
  eventType: string
  /** The endpoint's new body — object, array, primitive, or null. */
  data: unknown
}

export interface LiveClientGateway {
  /** Begin riding the shared connection observer (open the WS while up, close
   *  while down, reconnect on a client swap). Idempotent. */
  start(): void
  stop(): void
  /** Subscribe to one LCU endpoint's events. Returns an unsubscribe fn. Safe to
   *  call before/after connect — the subscription is (re)applied on each open. */
  subscribe(uri: string, handler: (e: LiveClientEvent) => void): () => void
  /** One-shot REST read of an LCU endpoint over the same loopback (for enriching
   *  events, e.g. the champ-select session id). Resolves null when unreachable. */
  get(path: string): Promise<unknown | null>
}
