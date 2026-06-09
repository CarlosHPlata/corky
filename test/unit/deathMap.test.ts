import { describe, it, expect } from 'vitest'
import { extractDeathMap } from '../../src/main/domain/report/deathMap'
import { loadTimeline } from '../fixtures/load'

function tl(events: object[]): unknown {
  return { info: { frames: [{ timestamp: 0, participantFrames: {}, events }] } }
}

describe('extractDeathMap', () => {
  it('marks each of the player’s deaths, ordered, with count == deaths (SC-006)', () => {
    // Player is participantId 3 in WIN_001 with two deaths.
    const dm = extractDeathMap(loadTimeline('WIN_001'), 3)
    expect(dm.count).toBe(2)
    expect(dm.deaths).toHaveLength(2)
    expect(dm.deaths.map((d) => d.n)).toEqual([1, 2])
    expect(dm.deaths[0].tMin).toBeLessThan(dm.deaths[1].tMin) // time-ordered
  })

  it('normalizes coordinates to 0–100 with Y inverted', () => {
    // A death at world (0,0) → bottom-left → xPct 0, yPct 100 (Y inverted).
    const t = tl([{ type: 'CHAMPION_KILL', victimId: 3, timestamp: 60_000, position: { x: 0, y: 0 } }])
    const dm = extractDeathMap(t, 3)
    expect(dm.deaths[0].xPct).toBe(0)
    expect(dm.deaths[0].yPct).toBe(100)
    expect(dm.deaths[0].xPct).toBeGreaterThanOrEqual(0)
    expect(dm.deaths[0].yPct).toBeLessThanOrEqual(100)
  })

  it('handles a deathless game cleanly', () => {
    const dm = extractDeathMap(tl([]), 3)
    expect(dm.count).toBe(0)
    expect(dm.deaths).toEqual([])
  })
})
