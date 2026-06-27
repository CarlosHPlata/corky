import { describe, it, expect } from 'vitest'
import {
  coercePhase,
  decidePhaseEvent,
  type GameflowPhase
} from '../../src/main/domain/gameflow/gameflowPhase'

describe('coercePhase', () => {
  it('accepts known phase strings', () => {
    expect(coercePhase('ChampSelect')).toBe('ChampSelect')
    expect(coercePhase('InProgress')).toBe('InProgress')
    expect(coercePhase('EndOfGame')).toBe('EndOfGame')
  })

  it('rejects unknown strings and non-strings', () => {
    expect(coercePhase('Bogus')).toBeNull()
    expect(coercePhase('')).toBeNull()
    expect(coercePhase(123)).toBeNull()
    expect(coercePhase(null)).toBeNull()
    expect(coercePhase({ phase: 'ChampSelect' })).toBeNull()
  })
})

describe('decidePhaseEvent', () => {
  it('maps the three acted-on phases on entry', () => {
    expect(decidePhaseEvent('ReadyCheck', 'ChampSelect')).toBe('champSelect')
    expect(decidePhaseEvent('GameStart', 'InProgress')).toBe('gameStarted')
    expect(decidePhaseEvent('WaitingForStats', 'EndOfGame')).toBe('gameEnded')
  })

  it('maps from a cold start (no previous phase)', () => {
    expect(decidePhaseEvent(null, 'ChampSelect')).toBe('champSelect')
  })

  it('never double-fires for a repeated phase', () => {
    expect(decidePhaseEvent('ChampSelect', 'ChampSelect')).toBeNull()
    expect(decidePhaseEvent('InProgress', 'InProgress')).toBeNull()
  })

  it('ignores phases that map to no domain event', () => {
    const ignored: GameflowPhase[] = [
      'None',
      'Lobby',
      'Matchmaking',
      'CheckedIntoTournament',
      'ReadyCheck',
      'GameStart', // the brief load phase — NOT GameStarted; InProgress is
      'FailedToLaunch',
      'Reconnect',
      'WaitingForStats', // precedes EndOfGame — must not fire GameEnded
      'PreEndOfGame',
      'TerminatedInError'
    ]
    for (const phase of ignored) {
      expect(decidePhaseEvent('None', phase)).toBeNull()
    }
  })

  it('does not treat WaitingForStats/PreEndOfGame as game end (only EndOfGame)', () => {
    expect(decidePhaseEvent('InProgress', 'WaitingForStats')).toBeNull()
    expect(decidePhaseEvent('WaitingForStats', 'PreEndOfGame')).toBeNull()
    expect(decidePhaseEvent('PreEndOfGame', 'EndOfGame')).toBe('gameEnded')
  })

  it('treats an in-game reconnect (Reconnect → InProgress) as a continuation, not a new start', () => {
    expect(decidePhaseEvent('InProgress', 'Reconnect')).toBeNull()
    expect(decidePhaseEvent('Reconnect', 'InProgress')).toBeNull()
  })

  it('fires GameStarted exactly once across a load → reconnect cycle', () => {
    // GameStart → InProgress → Reconnect → InProgress: only the first InProgress counts.
    const seq: GameflowPhase[] = ['GameStart', 'InProgress', 'Reconnect', 'InProgress']
    let prev: GameflowPhase | null = null
    const fired = seq.filter((p) => {
      const t = decidePhaseEvent(prev, p)
      prev = p
      return t === 'gameStarted'
    })
    expect(fired).toEqual(['InProgress'])
  })
})
