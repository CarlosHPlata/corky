import { describe, it, expect, beforeEach } from 'vitest'
import type { Account } from '@shared/types'
import type { MatchRepository } from '../../src/main/application/ports/MatchRepository'
import type {
  ClientSnapshot,
  LeagueClientGateway
} from '../../src/main/application/ports/LeagueClientGateway'
import type { DomainEvent } from '../../src/main/domain/events'
import {
  IdentityService,
  type AccountResolver,
  type IdentityServiceOptions
} from '../../src/main/application/services/Identity/IdentityService'

// --- fakes ---

/** A 78-char "encrypted" puuid (what the Riot API / our cache stores). The client
 *  only exposes a short UNENCRYPTED puuid, so anything we persist must be 78 chars. */
const ENC = (name: string): string => `enc-${name}`.padEnd(78, '0')

class FakeMatchRepo {
  accounts = new Map<string, Account>()
  active: string | null = null

  upsertAccount(a: Account): void {
    this.accounts.set(a.puuid, a)
  }
  getAccount(puuid: string): Account | null {
    return this.accounts.get(puuid) ?? null
  }
  getCurrentAccount(): Account | null {
    if (this.active && this.accounts.has(this.active)) return this.accounts.get(this.active)!
    const first = this.accounts.values().next().value
    return first ?? null
  }
  setActivePlayer(puuid: string): void {
    this.active = puuid
  }
  getActivePlayer(): string | null {
    return this.active
  }
}

class FakeGateway implements LeagueClientGateway {
  current: ClientSnapshot = { connection: 'disconnected' }
  private cb: ((s: ClientSnapshot) => void) | null = null

  async snapshot(): Promise<ClientSnapshot> {
    return this.current
  }
  subscribeToClient(onChange: (s: ClientSnapshot) => void): () => void {
    this.cb = onChange
    return () => {
      this.cb = null
    }
  }
  startClientPolling(): void {}
  stopClientPolling(): void {}

  set(s: ClientSnapshot): void {
    this.current = s
  }
}

const acc = (name: string): Account => ({
  puuid: ENC(name),
  gameName: name,
  tagLine: 'EUW',
  platform: 'euw1',
  region: 'europe'
})

const connected = (name: string, routed = true): ClientSnapshot => ({
  connection: 'connected',
  summoner: {
    unencrypted_puuid: `u-${name}`,
    gameName: name,
    tagLine: 'EUW',
    riotId: `${name}#EUW`
  },
  ...(routed ? { platform: 'euw1', region: 'europe' } : {})
})

/** The client only gives an unencrypted puuid, so every fresh client login goes
 *  through the resolver to obtain the real (encrypted) Account. */
const defaultResolver: AccountResolver = {
  resolveAccount: async (riotId, platform, region) => {
    const [gameName, tagLine] = riotId.split('#')
    return { puuid: ENC(gameName), gameName, tagLine, platform, region }
  }
}

function make(repo: FakeMatchRepo, gw: FakeGateway, opts: Partial<IdentityServiceOptions> = {}) {
  const events: DomainEvent[] = []
  const svc = new IdentityService(gw, repo as unknown as MatchRepository, {
    accountResolver: defaultResolver,
    emit: (e) => events.push(e),
    ...opts
  })
  return { svc, events }
}

describe('IdentityService', () => {
  let repo: FakeMatchRepo
  let gw: FakeGateway

  beforeEach(() => {
    repo = new FakeMatchRepo()
    gw = new FakeGateway()
  })

  it('disconnected + cached → loads cache, no ActivePlayerChanged', async () => {
    repo.upsertAccount(acc('Ahri'))
    repo.setActivePlayer(ENC('Ahri'))
    const { svc, events } = make(repo, gw)
    await svc.refreshFromClient()
    expect(svc.getStatus()).toMatchObject({ connection: 'disconnected', source: 'cache' })
    expect(svc.getStatus().player?.puuid).toBe(ENC('Ahri'))
    expect(events.some((e) => e.type === 'ActivePlayerChanged')).toBe(false)
  })

  it('disconnected + no cache → onboarding (source none, player null)', async () => {
    const { svc } = make(repo, gw)
    await svc.refreshFromClient()
    expect(svc.getStatus()).toEqual({ connection: 'disconnected', source: 'none', player: null })
  })

  it('login of the same cached player → keeps pointer, no ActivePlayerChanged', async () => {
    repo.upsertAccount(acc('Ahri'))
    repo.setActivePlayer(ENC('Ahri'))
    const { svc, events } = make(repo, gw)
    gw.set(connected('Ahri'))
    await svc.refreshFromClient()
    expect(repo.getActivePlayer()).toBe(ENC('Ahri'))
    expect(svc.getStatus()).toMatchObject({ connection: 'connected', source: 'client' })
    expect(events.some((e) => e.type === 'ActivePlayerChanged')).toBe(false)
  })

  it('a different player logs in → switches pointer, emits ActivePlayerChanged, keeps prior data', async () => {
    repo.upsertAccount(acc('Ahri'))
    repo.setActivePlayer(ENC('Ahri'))
    const { svc, events } = make(repo, gw)
    gw.set(connected('Zed'))
    await svc.refreshFromClient()
    expect(repo.getActivePlayer()).toBe(ENC('Zed'))
    expect(svc.getStatus().player?.puuid).toBe(ENC('Zed'))
    expect(events.filter((e) => e.type === 'ActivePlayerChanged')).toHaveLength(1)
    // Ahri's data is intact (switch is a pointer move, not a wipe)
    expect(repo.getAccount(ENC('Ahri'))).not.toBeNull()
  })

  it('connected with unknown region but stored routing → activates using stored routing', async () => {
    repo.upsertAccount(acc('Ahri')) // stored routing euw1/europe, not active yet
    const { svc } = make(repo, gw)
    gw.set(connected('Ahri', false)) // no platform/region from client
    await svc.refreshFromClient()
    expect(svc.getStatus()).toMatchObject({ connection: 'connected', source: 'client' })
    expect(svc.getStatus().player).toMatchObject({ platform: 'euw1', region: 'europe' })
  })

  it('connected with unknown region AND no routing anywhere → not activated (FR-006)', async () => {
    // No stored account → no routing to borrow → identity stays incomplete and is
    // never activated, so the client is reported connected but the player is null.
    const { svc, events } = make(repo, gw)
    gw.set(connected('Newbie', false)) // unknown player, client can't resolve region
    await svc.refreshFromClient()
    expect(svc.getStatus().connection).toBe('connected')
    expect(svc.getStatus().player).toBeNull() // Newbie was NOT activated
    expect(repo.getActivePlayer()).toBeNull()
    expect(events.some((e) => e.type === 'ActivePlayerChanged')).toBe(false)
  })

  it('connected then logged out → keeps the player as cache, only ClientConnectionChanged', async () => {
    repo.upsertAccount(acc('Ahri'))
    repo.setActivePlayer(ENC('Ahri'))
    const { svc, events } = make(repo, gw)
    gw.set(connected('Ahri'))
    await svc.refreshFromClient()
    events.length = 0
    gw.set({ connection: 'loggedOut' })
    await svc.refreshFromClient()
    expect(svc.getStatus()).toMatchObject({ connection: 'loggedOut', source: 'cache' })
    expect(svc.getStatus().player?.puuid).toBe(ENC('Ahri')) // not blanked
    expect(events.some((e) => e.type === 'ClientConnectionChanged')).toBe(true)
    expect(events.some((e) => e.type === 'ActivePlayerChanged')).toBe(false)
  })

  it('unreadable client → active unchanged, connection reported, no throw', async () => {
    repo.upsertAccount(acc('Ahri'))
    repo.setActivePlayer(ENC('Ahri'))
    const { svc } = make(repo, gw)
    gw.set({ connection: 'unreadable' })
    await expect(svc.refreshFromClient()).resolves.toBeUndefined()
    expect(svc.getStatus()).toMatchObject({ connection: 'unreadable', source: 'cache' })
    expect(svc.getStatus().player?.puuid).toBe(ENC('Ahri'))
  })

  it('start() with nothing known → onboarding; a later login activates the player', async () => {
    const { svc } = make(repo, gw)
    await svc.start()
    expect(svc.getStatus()).toEqual({ connection: 'disconnected', source: 'none', player: null })

    gw.set(connected('Ahri'))
    await svc.refreshFromClient()
    expect(svc.getStatus().player?.puuid).toBe(ENC('Ahri'))
    expect(repo.getActivePlayer()).toBe(ENC('Ahri'))
  })
})
