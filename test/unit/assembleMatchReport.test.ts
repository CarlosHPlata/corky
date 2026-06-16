import { describe, it, expect } from 'vitest'
import { assembleMatchReport } from '../../src/main/domain/report/assembleMatchReport'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

describe('assembleMatchReport', () => {
  it('assembles the full report for a win', () => {
    const r = assembleMatchReport(loadMatch('WIN_001'), loadTimeline('WIN_001'), PLAYER_PUUID, new Map())
    expect(r.matchId).toBe('EUW1_WIN_001')
    expect(r.core.win).toBe(true)
    expect(r.matchup.laneOpponent?.champion).toBe('Zed')
    expect(r.timelineAvailable).toBe(true)
    expect(r.timeline).not.toBeNull()
    expect(r.timeline!.frames.length).toBeGreaterThan(0)
    expect(r.timeline!.highlights.length).toBeGreaterThan(0)
    expect(r.deathMap).not.toBeNull()
    expect(r.deathMap!.count).toBe(2)
  })

  it('assembles a loss with a negative end-game gold curve', () => {
    const r = assembleMatchReport(loadMatch('LOSS_002'), loadTimeline('LOSS_002'), PLAYER_PUUID, new Map())
    expect(r.core.win).toBe(false)
    const last = r.timeline!.frames[r.timeline!.frames.length - 1]
    expect(last.goldDiff).toBeLessThan(0)
  })

  it('degrades cleanly when the timeline is missing (FR-025)', () => {
    const r = assembleMatchReport(loadMatch('WIN_001'), null, PLAYER_PUUID, new Map())
    expect(r.timelineAvailable).toBe(false)
    expect(r.timeline).toBeNull()
    expect(r.deathMap).toBeNull()
    // Core + matchup + detail-only breakdown still resolve.
    expect(r.core.champion).toBe('Ahri')
    expect(r.matchup.laneOpponent?.champion).toBe('Zed')
    expect(r.breakdown.visionScore).toBe(28)
    expect(r.breakdown.csAt10).toBeNull()
    expect(r.breakdown.goldAt24).toBeNull()
  })
})
