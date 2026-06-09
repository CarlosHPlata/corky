import { describe, it, expect } from 'vitest'
import { extractBreakdown } from '../../src/main/domain/report/breakdown'
import { resolveLaneOpponentId } from '../../src/main/domain/report/matchReportCore'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

function breakdownFor(name: string) {
  const match = loadMatch(name)
  const timeline = loadTimeline(name)
  const laneOppId = resolveLaneOpponentId(match, PLAYER_PUUID)
  return extractBreakdown(match, timeline, PLAYER_PUUID, laneOppId)
}

describe('extractBreakdown', () => {
  it('computes the full block for a standard game', () => {
    const b = breakdownFor('WIN_001')
    expect(b.csAt10).not.toBeNull()
    expect(b.csAt10!).toBeGreaterThan(0)
    expect(b.goldAt14).not.toBeNull()
    expect(b.goldAt24).not.toBeNull()
    expect(b.visionScore).toBe(28)
    expect(b.killParticipation).toBeCloseTo(0.62, 2) // from challenges
    expect(b.soloDeaths).toBeGreaterThanOrEqual(1) // the river death is solo
  })

  it('marks breakpoints not reached as null for a short game', () => {
    const b = breakdownFor('SHORT_003') // 18-min game, no challenges
    expect(b.goldAt24).toBeNull() // never reached 24:00
    expect(b.csAt10).not.toBeNull() // did reach 10:00
    // kill-participation fallback: (kills + assists) / teamKills
    expect(b.killParticipation).toBeGreaterThan(0)
    expect(b.killParticipation).toBeLessThanOrEqual(1)
  })

  it('nulls gold breakpoints when there is no lane opponent', () => {
    const match = loadMatch('JUNGLE_004')
    const timeline = loadTimeline('JUNGLE_004')
    const b = extractBreakdown(match, timeline, PLAYER_PUUID, null)
    expect(b.goldAt14).toBeNull()
    expect(b.goldAt24).toBeNull()
  })

  it('degrades without a timeline (FR-025)', () => {
    const b = extractBreakdown(loadMatch('WIN_001'), null, PLAYER_PUUID, 8)
    expect(b.csAt10).toBeNull()
    expect(b.goldAt14).toBeNull()
    expect(b.visionScore).toBe(28) // detail-only fields still resolve
  })
})
