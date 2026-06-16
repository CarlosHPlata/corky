import { describe, it, expect } from 'vitest'
import { toCompactContext } from '../../src/main/domain/report/compactContext'
import { buildAnchorCatalog } from '../../src/main/domain/report/anchorCatalog'
import { assembleMatchReport } from '../../src/main/domain/report/assembleMatchReport'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const win = assembleMatchReport(loadMatch('WIN_001'), loadTimeline('WIN_001'), PLAYER_PUUID, new Map())
const catalog = buildAnchorCatalog(win)

describe('toCompactContext', () => {
  it('lists every catalog id so the model can cite them', () => {
    const ctx = toCompactContext(win, catalog)
    for (const id of catalog.keys()) {
      expect(ctx).toContain(id)
    }
  })

  it('carries the core figures and is not JSON', () => {
    const ctx = toCompactContext(win, catalog)
    expect(ctx).toContain(`champ=${win.core.champion}`)
    expect(ctx).toContain(`cs=${win.core.cs}`)
    expect(ctx.trim().startsWith('{')).toBe(false)
  })

  it('is deterministic for a given report', () => {
    expect(toCompactContext(win, catalog)).toBe(toCompactContext(win, catalog))
  })

  it('renders not-reached breakpoints as n/r, never a fabricated 0', () => {
    const short = assembleMatchReport(loadMatch('SHORT_003'), loadTimeline('SHORT_003'), PLAYER_PUUID, new Map())
    const c = buildAnchorCatalog(short)
    const ctx = toCompactContext(short, c)
    // SHORT game never reaches 24:00 → gold_at_24 must be n/r.
    expect(ctx).toMatch(/stat:gold_at_24=n\/r/)
  })

  it('appends extras (benchmark, goal, framing) for the heavy passes', () => {
    const ctx = toCompactContext(win, catalog, {
      benchmark: { metric: 'cs_per_min', basis: 'champion_patch', ref: 7.0, patch: '14.10' },
      goal: 'convert one 20-minute lead into a closed game',
      framing: 'quick="clean snowball"'
    })
    expect(ctx).toContain('BENCH cs_per_min basis=champion_patch ref=7')
    expect(ctx).toContain('NOTE goal=')
    expect(ctx).toContain('FRAMING quick=')
  })

  it('flags timeline_unavailable when there is no timeline', () => {
    const noTl = assembleMatchReport(loadMatch('WIN_001'), null, PLAYER_PUUID, new Map())
    const c = buildAnchorCatalog(noTl)
    expect(toCompactContext(noTl, c)).toContain('timeline_unavailable=true')
  })
})
