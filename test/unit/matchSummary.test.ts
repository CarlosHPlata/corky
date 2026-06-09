import { describe, it, expect } from 'vitest'
import { extractMatchSummary } from '../../src/main/domain/matchSummary'

function raw(participantOverrides: Record<string, unknown> = {}, infoOverrides: Record<string, unknown> = {}) {
  return {
    metadata: { matchId: 'EUW1_1' },
    info: {
      queueId: 420,
      gameCreation: 1700000000000,
      gameDuration: 1500, // 25 minutes
      participants: [
        {
          puuid: 'me',
          championName: 'Ahri',
          win: true,
          kills: 8,
          deaths: 4,
          assists: 10,
          totalMinionsKilled: 180,
          neutralMinionsKilled: 20,
          goldEarned: 12500,
          teamPosition: 'MIDDLE',
          ...participantOverrides
        },
        { puuid: 'other', championName: 'Zed', win: false }
      ],
      ...infoOverrides
    }
  }
}

describe('extractMatchSummary', () => {
  it('projects the player participant onto the summary', () => {
    const s = extractMatchSummary(raw(), 'me')
    expect(s).toEqual({
      matchId: 'EUW1_1',
      puuid: 'me',
      queue: 420,
      champion: 'Ahri',
      role: 'Mid',
      win: true,
      kills: 8,
      deaths: 4,
      assists: 10,
      cs: 200,
      csPerMin: 8, // 200 / 25
      gold: 12500,
      goldPerMin: 500, // 12500 / 25
      gameCreation: 1700000000000,
      gameDuration: 1500
    })
  })

  it('normalizes every team position to a UI role label', () => {
    const role = (pos: string) => extractMatchSummary(raw({ teamPosition: pos }), 'me').role
    expect(role('TOP')).toBe('Top')
    expect(role('JUNGLE')).toBe('Jungle')
    expect(role('MIDDLE')).toBe('Mid')
    expect(role('BOTTOM')).toBe('Bot')
    expect(role('UTILITY')).toBe('Support')
    expect(role('')).toBe('Unknown')
  })

  it('counts CS as minions plus jungle monsters', () => {
    const s = extractMatchSummary(raw({ totalMinionsKilled: 150, neutralMinionsKilled: 90 }), 'me')
    expect(s.cs).toBe(240)
  })

  it('guards against zero duration without dividing by zero', () => {
    const s = extractMatchSummary(raw({}, { gameDuration: 0 }), 'me')
    expect(s.csPerMin).toBe(0)
    expect(s.goldPerMin).toBe(0)
  })

  it('falls back safely when the player is not in the match', () => {
    const s = extractMatchSummary(raw(), 'ghost')
    expect(s.champion).toBe('Unknown')
    expect(s.role).toBe('Unknown')
    expect(s.win).toBe(false)
    expect(s.kills).toBe(0)
  })
})
