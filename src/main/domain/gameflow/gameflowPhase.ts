/**
 * Pure gameflow-phase logic (spec 007) — the testable heart of the live feed.
 *
 * The LCU publishes the client's lifecycle on `/lol-gameflow/v1/gameflow-phase`
 * as a single phase string. We translate phase TRANSITIONS into the existing
 * domain events. The enum mirrors Riot's generated `LolGameflowGameflowPhase`.
 */
export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'CheckedIntoTournament'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'GameStart'
  | 'FailedToLaunch'
  | 'InProgress'
  | 'Reconnect'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'EndOfGame'
  | 'TerminatedInError'

const PHASES: ReadonlySet<string> = new Set<GameflowPhase>([
  'None',
  'Lobby',
  'Matchmaking',
  'CheckedIntoTournament',
  'ReadyCheck',
  'ChampSelect',
  'GameStart',
  'FailedToLaunch',
  'InProgress',
  'Reconnect',
  'WaitingForStats',
  'PreEndOfGame',
  'EndOfGame',
  'TerminatedInError'
])

/** Coerce a raw WS payload (the phase string) to a known phase, or null. */
export function coercePhase(data: unknown): GameflowPhase | null {
  return typeof data === 'string' && PHASES.has(data) ? (data as GameflowPhase) : null
}

export type GameflowTransition = 'champSelect' | 'gameStarted' | 'gameEnded'

/**
 * Which domain event a phase transition fires, or null for phases we don't act
 * on. Acts ONLY on a real transition (`prev !== next`) so repeated payloads for
 * the same phase never double-fire.
 *
 * - `ChampSelect`  → champSelect  (enter pick/ban)
 * - `InProgress`   → gameStarted  (the game is live; NOT the brief `GameStart` load phase)
 * - `EndOfGame`    → gameEnded    (single terminal phase — NOT WaitingForStats/PreEndOfGame,
 *                                  which precede it and would double-fire)
 *
 * A `Reconnect → InProgress` transition is a rejoin after a drop, NOT a fresh
 * start, so it does not re-fire `gameStarted` (in-game disconnects are common).
 * Abnormal exits (`TerminatedInError`, `FailedToLaunch`) never reach `EndOfGame`
 * and intentionally fire nothing — there is no completed match to react to.
 */
export function decidePhaseEvent(
  prev: GameflowPhase | null,
  next: GameflowPhase
): GameflowTransition | null {
  if (prev === next) return null
  switch (next) {
    case 'ChampSelect':
      return 'champSelect'
    case 'InProgress':
      return prev === 'Reconnect' ? null : 'gameStarted'
    case 'EndOfGame':
      return 'gameEnded'
    default:
      return null
  }
}
