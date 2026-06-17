import type { Account, ClientStatus } from '@shared/types'
import type { MatchRepository } from '../../ports/MatchRepository'
import type {
  ClientSnapshot,
  LeagueClientGateway
} from '../../ports/LeagueClientGateway'
import type { DomainEvent } from '../../../domain/events'
import { PlayerIdentity } from '../../../domain/identity/playerIdentity'
import { ActivePlayerResolution, resolveActivePlayer } from '../../../domain/identity/resolution'

export type IdentityListener = (status: ClientStatus) => void
export type GatewayUnsubscribeClient = () => void
/** Minimal account resolver (a slice of MatchDataSource) — used ONLY for the
 *  dev-seed → puuid path; the normal flow never needs it. */
export interface AccountResolver {
  resolveAccount(riotId: string, platform: string, region: string): Promise<Account>
}

export interface IdentityServiceOptions {
  /** Optional dev-only identity seed (config). Used only when there is neither a
   *  live nor a cached player; always superseded by a detected/known player. */
  devSeed?: { riotId: string; platform: string; region: string }
  /** Resolves the dev seed's riotId to a puuid (Riot account-v1). Dev path only. */
  accountResolver?: AccountResolver
  /** Optional sink for domain events (ActivePlayerChanged / ClientConnectionChanged). */
  emit?: (event: DomainEvent) => void
}

const DISCONNECTED: ClientStatus = { connection: 'disconnected', source: 'none', player: null }

/**
 * The facade the use cases go through (spec 006): command/query → IdentityService
 * → LeagueClientGateway port → LCU adapter. The single place that resolves the
 * active player (live → cache → none) and the only writer of the active pointer.
 * Framework-free: ports + domain only, no electron/SDK imports.
 */
export class IdentityService {
  private status: ClientStatus = DISCONNECTED
  private listenerFn: IdentityListener | null = null
  private unsubscribeFromClientGatewayFn: GatewayUnsubscribeClient | null = null

  constructor(
    private readonly gateway: LeagueClientGateway,
    private readonly matchRepo: MatchRepository,
    private readonly opts: IdentityServiceOptions = {},
  ) { }

  /** Register a sink (the driving listener) that receives the fresh ClientStatus
   *  whenever the player or connection changes. Keeps electron out of the service. */
  setListener(callback: IdentityListener): void {
    this.listenerFn = callback
  }

  /**
   * Starts the identity service.
   * first it  starts the pooling f
   * 
   */
  async start(): Promise<void> {
    this.gateway.startClientPolling()

    const subscribeResponse = this.gateway.subscribeToClient(clientSnapshot => {
      void this.process(clientSnapshot).catch((err) => {
        console.error('IdentityService: process failed:', err)
      })
    })
    this.unsubscribeFromClientGatewayFn = subscribeResponse

    await this.refreshFromClient()
  }

  stop(): void {
    this.unsubscribeFromClientGatewayFn?.()
    this.unsubscribeFromClientGatewayFn = null
    this.gateway.stopClientPolling()
  }

  getStatus(): ClientStatus {
    return this.status
  }

  async refreshFromClient(): Promise<void> {
    const snapshot = await this.gateway.snapshot()
    await this.process(snapshot)
  }

  private async process(clientSnapshot: ClientSnapshot): Promise<void> {
    const clientIdentity = this.resolveClientIdentity(clientSnapshot)
    const currentIdentity = this.resolveCurrentIdentity()

    const switchedResolution = resolveActivePlayer({
      live: clientIdentity,
      lastKnown: currentIdentity
    })

    let activeAccount: Account | null = await this.resolveAccount(switchedResolution);
    if (switchedResolution.switched && activeAccount) {
      this.persistLatestAccount(activeAccount)
    }

    this.emitIdentityChangedEvents(clientSnapshot, activeAccount, switchedResolution)
  }

  private emitIdentityChangedEvents(clientSnapshot: ClientSnapshot, activeAccount: Account | null, switchedResolution: ActivePlayerResolution) {
    const next: ClientStatus = {
      connection: clientSnapshot.connection,
      source: switchedResolution.source,
      player: activeAccount ? PlayerIdentity.fromAccount(activeAccount) : null
    }

    const connectionChanged = this.status.connection !== next.connection
    const sourceChanged = this.status.source !== next.source
    this.status = next

    if (switchedResolution.switched && activeAccount) {
      this.opts.emit?.({
        type: 'ActivePlayerChanged',
        puuid: activeAccount.puuid,
        source: switchedResolution.source === 'client' ? 'client' : 'cache'
      })
    }

    if (connectionChanged) {
      this.opts.emit?.({
        type: 'ClientConnectionChanged',
        connection: next.connection
      })
    }

    if (switchedResolution.switched || connectionChanged || sourceChanged) {
      this.listenerFn?.(this.status)
    }
  }

  private persistLatestAccount(account: Account): void {
    this.matchRepo.upsertAccount(account)
    this.matchRepo.setActivePlayer(account.puuid)
  }

  private async resolveAccount(switchedResolution: ActivePlayerResolution): Promise<Account | null> {
    let activeAccount: Account | null = null;
    if (switchedResolution.active) {
      const activeIdentity = switchedResolution.active

      if (activeIdentity.hasEncryptedPuuid()) {
        activeAccount = activeIdentity.toAccount()
      } else {
        const { accountResolver } = this.opts

        if (!accountResolver) throw new Error('No account resolver available')
        activeAccount = await accountResolver.resolveAccount(activeIdentity.riotId, activeIdentity.platform, activeIdentity.region)
      }
    }

    return activeAccount
  }

  private resolveClientIdentity(clientSnapshot: ClientSnapshot): PlayerIdentity | null {
    if (clientSnapshot.connection !== 'connected' || !clientSnapshot.summoner) return null;

    let platform = clientSnapshot.platform
    let region = clientSnapshot.region
    if (!platform || !region) {
      const stored = this.matchRepo.getCurrentAccount()
      if (!stored) return null
      platform = stored.platform
      region = stored.region
    }

    const { unencrypted_puuid, gameName, tagLine } = clientSnapshot.summoner
    return new PlayerIdentity(unencrypted_puuid, gameName, tagLine, platform, region)
  }

  private resolveCurrentIdentity(): PlayerIdentity | null {
    const currentAccount = this.matchRepo.getCurrentAccount()

    if (!currentAccount) return null
    return PlayerIdentity.fromAccount(currentAccount)
  }

}