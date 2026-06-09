import { describe, it, expect } from 'vitest'
import { extractCore, extractMatchup } from '../../src/main/domain/report/matchReportCore'
import { loadMatch, PLAYER_PUUID } from '../fixtures/load'

describe('extractCore', () => {
  it('computes the headline economy line for the player', () => {
    const core = extractCore(loadMatch('WIN_001'), PLAYER_PUUID)
    expect(core.champion).toBe('Ahri')
    expect(core.role).toBe('Mid')
    expect(core.win).toBe(true)
    expect(core.kills).toBe(9)
    expect(core.deaths).toBe(2) // two player deaths in the fixture
    // KDA ratio = (9 + 7) / 2 = 8.0
    expect(core.kdaRatio).toBe(8)
    expect(core.durationSec).toBe(1920)
    expect(core.csPerMin).toBeGreaterThan(0)
    expect(core.goldPerMin).toBeGreaterThan(0)
    expect(core.queue).toBe(420)
  })

  it('guards divide-by-zero on deaths', () => {
    const core = extractCore(loadMatch('WIN_001'), 'NOT_A_PLAYER')
    expect(core.kdaRatio).toBe(0)
    expect(core.champion).toBe('Unknown')
  })
})

describe('extractMatchup', () => {
  it('resolves the lane opponent for a mid game and orders both teams', () => {
    const mu = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID)
    expect(mu.you.isYou).toBe(true)
    expect(mu.you.role).toBe('Mid')
    expect(mu.allies).toHaveLength(5)
    expect(mu.enemies).toHaveLength(5)
    expect(mu.allies.map((a) => a.role)).toEqual(['Top', 'Jungle', 'Mid', 'Bot', 'Support'])
    expect(mu.laneOpponent).not.toBeNull()
    expect(mu.laneOpponent?.role).toBe('Mid')
    expect(mu.laneOpponent?.champion).toBe('Zed')
    expect(mu.enemies.filter((e) => e.isLaneOpponent)).toHaveLength(1)
  })

  it('carries per-player KDA, CS and gold for every roster entry', () => {
    const mu = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID)
    const you = mu.allies.find((a) => a.isYou)!
    expect(you.kills).toBe(9)
    expect(you.deaths).toBe(2)
    expect(you.assists).toBe(7)
    expect(you.cs).toBeGreaterThan(0)
    expect(you.gold).toBeGreaterThan(0)
    // every player on both teams has a populated line
    for (const e of [...mu.allies, ...mu.enemies]) {
      expect(e.cs).toBeGreaterThan(0)
      expect(e.gold).toBeGreaterThan(0)
    }
  })

  it('returns no fixed lane opponent for a jungle player', () => {
    const mu = extractMatchup(loadMatch('JUNGLE_004'), PLAYER_PUUID)
    expect(mu.you.role).toBe('Jungle')
    expect(mu.laneOpponent).toBeNull()
    expect(mu.enemies.every((e) => !e.isLaneOpponent)).toBe(true)
  })
})
