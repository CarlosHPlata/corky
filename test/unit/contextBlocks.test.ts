import { describe, it, expect } from 'vitest'
import {
  CONTEXT_BLOCKS,
  listContextBlocks,
  renderContextBlocks
} from '../../src/main/domain/report/contextBlocks'
import { toCompactContext, type CompactExtras } from '../../src/main/domain/report/compactContext'
import { buildAnchorCatalog } from '../../src/main/domain/report/anchorCatalog'
import { assembleMatchReport } from '../../src/main/domain/report/assembleMatchReport'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const win = assembleMatchReport(loadMatch('WIN_001'), loadTimeline('WIN_001'), PLAYER_PUUID)
const catalog = buildAnchorCatalog(win)

const fullExtras: CompactExtras = {
  benchmark: { metric: 'cs_per_min', basis: 'champion_patch', ref: 7.0, patch: '14.10' },
  goal: 'convert one 20-minute lead into a closed game',
  reflection: 'I kept roaming alone with a lead.',
  framing: 'quick="clean snowball"',
  narration: '22:10 −1.6k: died | 24:40 +2.1k: baron'
}

const ALL_IDS = CONTEXT_BLOCKS.map((b) => b.id)

describe('renderContextBlocks', () => {
  it('with no filter is byte-identical to toCompactContext', () => {
    expect(renderContextBlocks(win, catalog)).toBe(toCompactContext(win, catalog))
    expect(renderContextBlocks(win, catalog, fullExtras)).toBe(
      toCompactContext(win, catalog, fullExtras)
    )
    // Also when the timeline is missing (the NOTE path inside match.markers).
    const noTl = assembleMatchReport(loadMatch('WIN_001'), null, PLAYER_PUUID)
    const c = buildAnchorCatalog(noTl)
    expect(renderContextBlocks(noTl, c)).toBe(toCompactContext(noTl, c))
  })

  it('disabling match.stats removes STAT lines while GAME/CORE remain', () => {
    const enabled = new Set(ALL_IDS.filter((id) => id !== 'match.stats'))
    const ctx = renderContextBlocks(win, catalog, fullExtras, enabled)
    expect(ctx).not.toContain('STAT ')
    expect(ctx).toContain('GAME ')
    expect(ctx).toContain('CORE ')
    expect(ctx).toContain('MARK ')
  })

  it('alwaysOn blocks survive an empty enabled set', () => {
    const ctx = renderContextBlocks(win, catalog, fullExtras, new Set())
    expect(ctx).toContain(`champ=${win.core.champion}`)
    expect(ctx).toContain(`cs=${win.core.cs}`)
    // Everything optional is gone.
    expect(ctx).not.toContain('STAT ')
    expect(ctx).not.toContain('MARK ')
    expect(ctx).not.toContain('BENCH ')
    expect(ctx).not.toContain('NOTE ')
    expect(ctx).not.toContain('FRAMING ')
    expect(ctx).not.toContain('NARRATION ')
  })

  it('lists metadata for every block with no render function exposed', () => {
    const meta = listContextBlocks()
    expect(meta.map((m) => m.id)).toEqual(ALL_IDS)
    for (const m of meta) {
      expect(m).not.toHaveProperty('render')
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.description.length).toBeGreaterThan(0)
      expect(m.typicalTokens).toBeGreaterThan(0)
      expect(['match', 'player', 'carry']).toContain(m.group)
      expect(typeof m.defaultEnabled).toBe('boolean')
    }
    // The benchmark block declares its external source.
    expect(meta.find((m) => m.id === 'match.benchmark')?.requiresSource).toBe('opgg-mcp')
  })
})
