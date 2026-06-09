import { describe, it, expect } from 'vitest'
import { inferHighlights } from '../../src/main/domain/report/highlights'
import { extractGoldTimeline } from '../../src/main/domain/report/goldTimeline'
import { loadTimeline } from '../fixtures/load'
import type { GoldFrame } from '../../src/shared/types'

// Minimal inline timeline for precise threshold control.
function tl(events: object[]): unknown {
  return { info: { frames: [{ timestamp: 0, participantFrames: {}, events }] } }
}
function kill(victimId: number, timestamp: number) {
  return { type: 'CHAMPION_KILL', victimId, timestamp, position: { x: 9000, y: 9000 } }
}

describe('inferHighlights — objectives', () => {
  it('marks every dragon, herald, baron and inhibitor in the game (SC-005)', () => {
    const goldFrames = extractGoldTimeline(loadTimeline('WIN_001'), 100).frames
    const hl = inferHighlights(loadTimeline('WIN_001'), 100, 3, goldFrames)
    const objectives = hl.filter((h) => h.kind === 'objective')
    expect(objectives).toHaveLength(5) // 2 dragons, herald, baron, inhibitor
    expect(objectives.every((o) => o.side === 'ally')).toBe(true) // team 100 took them all
    expect(objectives.some((o) => o.label.startsWith('Baron'))).toBe(true)
    expect(objectives.some((o) => o.label.startsWith('Inhibitor'))).toBe(true)
    expect(objectives.some((o) => o.label.includes('drake'))).toBe(true)
  })

  it('outputs highlights sorted by time', () => {
    const goldFrames = extractGoldTimeline(loadTimeline('WIN_001'), 100).frames
    const hl = inferHighlights(loadTimeline('WIN_001'), 100, 3, goldFrames)
    for (let i = 1; i < hl.length; i++) expect(hl[i].tMin).toBeGreaterThanOrEqual(hl[i - 1].tMin)
  })
})

describe('inferHighlights — team-wipe', () => {
  it('flags a 4-for-0 cluster as a team wipe in the player team’s favour', () => {
    const t = tl([kill(6, 1_440_000), kill(7, 1_442_000), kill(8, 1_444_000), kill(9, 1_446_000)])
    const hl = inferHighlights(t, 100, 3, [])
    const fight = hl.find((h) => h.kind === 'teamfight')
    expect(fight).toBeDefined()
    expect(fight!.label).toContain('Team wiped')
    expect(fight!.side).toBe('ally')
  })

  it('does NOT flag an even 3-for-3 brawl', () => {
    const t = tl([
      kill(6, 1_000), kill(7, 3_000), kill(8, 5_000),
      kill(1, 6_000), kill(2, 8_000), kill(3, 10_000)
    ])
    const hl = inferHighlights(t, 100, 99, [])
    expect(hl.some((h) => h.kind === 'teamfight')).toBe(false)
  })
})

describe('inferHighlights — death → gold swing', () => {
  const goldFrames: GoldFrame[] = [
    { tMin: 9, goldDiff: 2100 },
    { tMin: 10, goldDiff: 2000 },
    { tMin: 11, goldDiff: 500 },
    { tMin: 12, goldDiff: 400 }
  ]

  it('flags a player death followed by a ≥1k swing against the team', () => {
    const t = tl([kill(3, 600_000)]) // death at 10:00
    const hl = inferHighlights(t, 100, 3, goldFrames)
    const death = hl.find((h) => h.kind === 'death')
    expect(death).toBeDefined()
    expect(death!.label).toContain('Death')
  })

  it('does not flag a death with only a small swing', () => {
    const small: GoldFrame[] = [
      { tMin: 10, goldDiff: 2000 },
      { tMin: 11, goldDiff: 1700 }
    ]
    const t = tl([kill(3, 600_000)])
    const hl = inferHighlights(t, 100, 3, small)
    expect(hl.some((h) => h.kind === 'death')).toBe(false)
  })
})
