import type {
  ClientSnapshot,
  CurrentSummoner,
  LeagueClientGateway
} from '../../../application/ports/LeagueClientGateway'
import { mapRegion } from '../../../domain/identity/region'
import type { LockfileSource } from './lockfileSource'
import { lcuGet } from './lcuHttp'
import type { LcuConnectionService, LcuConnectionState } from './LcuConnectionService'

/** While the client stays up, re-snapshot identity on this slow cadence so an
 *  account switch on a never-closed client is still picked up. Connection
 *  up/down edges arrive instantly from the observer; this only catches the
 *  rarer same-client login change, and runs ONLY while up (no idle polling). */
const IDENTITY_RECHECK_MS = 30_000

/**
 * The League client (LCU) adapter (spec 006) — Corky's first local-client
 * integration. Implements `LeagueClientGateway` by lockfile-authenticated
 * loopback reads of `current-summoner` + `region-locale`.
 *
 * Connection detection (spec 007) is delegated to the shared
 * `LcuConnectionService` observer: this gateway no longer runs its own fixed
 * poll. It reacts to the observer's up/down edges — a present lockfile alone is
 * not enough, the observer confirms the API is actually serving — re-snapshots
 * identity on each, and keeps a slow re-check only while up.
 *
 * Reads ONLY the player's own identity/region (Principle I). Never throws across
 * the port — every expected condition maps to a `ClientConnection` state.
 */
export class LcuLeagueClientGateway implements LeagueClientGateway {
  private cb: ((snapshot: ClientSnapshot) => void) | null = null
  private unsubscribeConnection: (() => void) | null = null
  private recheck: ReturnType<typeof setInterval> | null = null
  private lastSignature = 'disconnected:'

  constructor(
    private readonly lockfile: LockfileSource,
    private readonly connection: LcuConnectionService
  ) {}

  async snapshot(): Promise<ClientSnapshot> {
    const info = await this.lockfile.read()
    if (!info) return { connection: 'disconnected' }

    let summonerRes: Awaited<ReturnType<typeof lcuGet>>
    try {
      summonerRes = await lcuGet(info, '/lol-summoner/v1/current-summoner')
    } catch {
      // Lockfile present but the API isn't reachable (client still starting,
      // port closing) — honest degraded state; the next poll resolves it.
      return { connection: 'unreadable' }
    }

    // 404 / not-ready / empty puuid → at the login screen, no live identity.
    const body = summonerRes.data as Record<string, unknown> | null
    const puuid = body && typeof body.puuid === 'string' ? body.puuid : ''
    if (summonerRes.status === 404 || !puuid) {
      return { connection: 'loggedOut' }
    }
    if (summonerRes.status !== 200) {
      return { connection: 'unreadable' }
    }

    const summoner: CurrentSummoner = {
      unencrypted_puuid: puuid,
      gameName: (body?.gameName as string) || (body?.displayName as string) || '',
      tagLine: (body?.tagLine as string) || '',
      riotId: `${body?.gameName}#${body?.tagLine}`
    }

    // Routing from the client region (best-effort; absent → caller falls back).
    let platform: string | undefined
    let region: string | undefined
    try {
      const locale = (await lcuGet(info, '/riotclient/region-locale')).data as
        | { region?: string }
        | null
      const routing = locale?.region ? mapRegion(locale.region) : null
      if (routing) {
        platform = routing.platform
        region = routing.region
      }
    } catch {
      /* leave routing undefined — IdentityService borrows stored routing */
    }

    return { connection: 'connected', summoner, platform, region }
  }

  subscribeToClient(onChange: (snapshot: ClientSnapshot) => void): () => void {
    this.cb = onChange
    return () => {
      if (this.cb === onChange) this.cb = null
    }
  }

  startClientPolling(): void {
    if (this.unsubscribeConnection) return
    // React to the shared connection observer rather than a standalone timer.
    // The observer owns lifecycle (start/stop); we only listen for edges. Read
    // the current state once so an already-established connection is picked up.
    this.unsubscribeConnection = this.connection.subscribe((s) => this.onConnectionState(s))
    this.onConnectionState(this.connection.current())
  }

  stopClientPolling(): void {
    this.unsubscribeConnection?.()
    this.unsubscribeConnection = null
    this.clearRecheck()
  }

  private onConnectionState(state: LcuConnectionState): void {
    // 'starting' is the transient startup window — don't surface a flash of
    // 'unreadable'; wait for the observer to settle on up or down.
    if (state.status === 'starting') return
    void this.poll()
    if (state.status === 'up') this.ensureRecheck()
    else this.clearRecheck()
  }

  private ensureRecheck(): void {
    if (this.recheck) return
    this.recheck = setInterval(() => void this.poll(), IDENTITY_RECHECK_MS)
  }

  private clearRecheck(): void {
    if (this.recheck) clearInterval(this.recheck)
    this.recheck = null
  }

  private async poll(): Promise<void> {
    const snapshot = await this.snapshot()
    const signature = `${snapshot.connection}:${snapshot.summoner?.unencrypted_puuid ?? ''}`
    if (signature === this.lastSignature) return // debounce: only stable changes
    this.lastSignature = signature
    this.cb?.(snapshot)
  }
}
