import type { ClientConnection } from '@shared/types'

/**
 * Driven port for the local League client (spec 006). The framework-free seam
 * between the application layer and the LCU. ALL client specifics (lockfile,
 * loopback HTTPS, self-signed cert, REST/WS) live behind this interface, so it
 * is the reusable layer future client features (champ select, runes, in-game)
 * extend — it exposes connection + identity generically.
 *
 * Implementations MUST NOT throw across this boundary for the expected
 * "not running / logged out / unreadable" cases — those are connection states.
 */
export interface CurrentSummoner {
  /** puuid is unencrypted in the client, therefore it is NOT usefull for querying RIOT API. */
  unencrypted_puuid: string
  gameName: string
  tagLine: string
  riotId: string
}

export interface ClientSnapshot {
  connection: ClientConnection
  /** Present iff connection === 'connected'. */
  summoner?: CurrentSummoner
  /** Riot routing derived from the client region; present iff connected and the
   *  region mapped. Absent when the region is unknown (caller falls back). */
  platform?: string
  region?: string
}

export interface LeagueClientGateway {
  /** One-shot read of connection + identity. Never throws for the expected
   *  disconnected/logged-out/unreadable states. */
  snapshot(): Promise<ClientSnapshot>
  /** Subscribe to STABLE (debounced) state changes; returns an unsubscribe fn.
   *  Fires on client start/stop, login/logout, and identity change. */
  subscribeToClient(onChange: (snapshot: ClientSnapshot) => void): () => void
  /** Begin/stop the underlying watcher. start() is idempotent. */
  startClientPolling(): void
  stopClientPolling(): void
}
