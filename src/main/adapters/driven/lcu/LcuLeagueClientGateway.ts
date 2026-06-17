import type {
  ClientSnapshot,
  CurrentSummoner,
  LeagueClientGateway
} from '../../../application/ports/LeagueClientGateway'
import { mapRegion } from '../../../domain/identity/region'
import { LockfileSource } from './lockfileSource'
import { lcuGet } from './lcuHttp'

const POLL_MS = 40000
// const POLL_MS = 99999999

/**
 * The League client (LCU) adapter (spec 006) — Corky's first local-client
 * integration. Implements `LeagueClientGateway` by lockfile-authenticated
 * loopback reads of `current-summoner` + `region-locale`, with a debounced poll
 * driving `subscribe`. A WebSocket upgrade later keeps this same contract.
 *
 * Reads ONLY the player's own identity/region (Principle I). Never throws across
 * the port — every expected condition maps to a `ClientConnection` state.
 */
export class LcuLeagueClientGateway implements LeagueClientGateway {
  private readonly lockfile = new LockfileSource()
  private timer: ReturnType<typeof setInterval> | null = null
  private cb: ((snapshot: ClientSnapshot) => void) | null = null
  private lastSignature = 'disconnected:'

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
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), POLL_MS)
  }

  stopClientPolling(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async poll(): Promise<void> {
    const snapshot = await this.snapshot()
    const signature = `${snapshot.connection}:${snapshot.summoner?.unencrypted_puuid ?? ''}`
    if (signature === this.lastSignature) return // debounce: only stable changes
    this.lastSignature = signature
    this.cb?.(snapshot)
  }
}
