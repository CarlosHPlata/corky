export type DomainEvent =
  | { type: 'ChampSelectEntered'; sessionId: string }
  | { type: 'GameStarted' }
  | { type: 'GameEnded'; matchId: string }
