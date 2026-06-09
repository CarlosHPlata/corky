import { describe, it, expect } from 'vitest'
import { extractGoldTimeline } from '../../src/main/domain/report/goldTimeline'
import { loadTimeline } from '../fixtures/load'

describe('extractGoldTimeline', () => {
  it('builds a player-team-positive curve over the game', () => {
    // Player is team 100 in WIN_001 and the fixture ramps team 100 ahead.
    const { frames, endMin } = extractGoldTimeline(loadTimeline('WIN_001'), 100)
    expect(frames.length).toBeGreaterThan(20)
    expect(frames[0].goldDiff).toBeCloseTo(0, 0) // even at minute 0
    expect(frames[frames.length - 1].goldDiff).toBeGreaterThan(0) // ahead by the end
    expect(endMin).toBeGreaterThan(30)
    // timestamps are monotonic
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].tMin).toBeGreaterThan(frames[i - 1].tMin)
    }
  })

  it('flips sign when viewed from the other team', () => {
    const ally = extractGoldTimeline(loadTimeline('WIN_001'), 100)
    const enemy = extractGoldTimeline(loadTimeline('WIN_001'), 200)
    const lastA = ally.frames[ally.frames.length - 1].goldDiff
    const lastE = enemy.frames[enemy.frames.length - 1].goldDiff
    expect(lastA).toBeCloseTo(-lastE, 0)
  })

  it('reflects a losing game as a negative curve', () => {
    const { frames } = extractGoldTimeline(loadTimeline('LOSS_002'), 100)
    expect(frames[frames.length - 1].goldDiff).toBeLessThan(0)
  })
})
