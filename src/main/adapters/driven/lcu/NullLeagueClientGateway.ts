import type {
  ClientSnapshot,
  LeagueClientGateway
} from '../../../application/ports/LeagueClientGateway'

/**
 * A gateway that reports the client as always disconnected (spec 006). Used as
 * the default before the real LCU adapter is wired, and as a convenient test
 * double. With no live identity, `IdentityService` resolves to the cached
 * player (offline) or onboarding — exactly the US2/US3 branches.
 */
export class NullLeagueClientGateway implements LeagueClientGateway {
  async snapshot(): Promise<ClientSnapshot> {
    return { connection: 'disconnected' }
  }

  subscribeToClient(_onChange: (snapshot: ClientSnapshot) => void): () => void {
    return () => { }
  }

  startClientPolling(): void { }
  stopClientPolling(): void { }
}
