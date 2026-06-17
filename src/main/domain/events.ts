import type { ClientConnection } from '@shared/types'

export type DomainEvent =
  | { type: 'ChampSelectEntered'; sessionId: string }
  | { type: 'GameStarted' }
  | { type: 'GameEnded'; matchId: string }
  // League client identity (spec 006). ActivePlayerChanged fires only when the
  // active player actually switches (drives the renderer reload);
  // ClientConnectionChanged fires on every stable connection transition (drives
  // the status chip even when the player is unchanged).
  | { type: 'ActivePlayerChanged'; puuid: string; source: 'client' | 'cache' }
  | { type: 'ClientConnectionChanged'; connection: ClientConnection }
