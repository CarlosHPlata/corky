import { describe, it, expect } from 'vitest'
import { buildAnchorCatalog, isValidStructuredRef } from '../../src/main/domain/report/anchorCatalog'
import { assembleMatchReport } from '../../src/main/domain/report/assembleMatchReport'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const win = assembleMatchReport(loadMatch('WIN_001'), loadTimeline('WIN_001'), PLAYER_PUUID)

describe('buildAnchorCatalog', () => {
  it('emits a stat anchor for every headline + breakdown figure', () => {
    const c = buildAnchorCatalog(win)
    for (const id of [
      'stat:kda', 'stat:cs', 'stat:cs_per_min', 'stat:gold', 'stat:gold_per_min',
      'stat:cs_at_10', 'stat:gold_at_14', 'stat:gold_at_24', 'stat:vision_score',
      'stat:solo_deaths', 'stat:kill_participation'
    ]) {
      expect(c.has(id)).toBe(true)
    }
    expect(c.get('stat:cs')!.value).toBe(win.core.cs)
  })

  it('emits one death marker per death-map dot with positions', () => {
    const c = buildAnchorCatalog(win)
    expect(win.deathMap).not.toBeNull()
    for (const d of win.deathMap!.deaths) {
      const a = c.get(`marker:death#${d.n}`)
      expect(a).toBeDefined()
      expect(a!.xPct).toBe(d.xPct)
      expect(a!.yPct).toBe(d.yPct)
    }
  })

  it('emits marker anchors for every timeline highlight', () => {
    const c = buildAnchorCatalog(win)
    const markerCount = [...c.values()].filter((a) => a.kind === 'marker').length
    const expected = win.timeline!.highlights.length + win.deathMap!.count
    expect(markerCount).toBe(expected)
  })

  it('has no markers when the timeline is unavailable', () => {
    const noTl = assembleMatchReport(loadMatch('WIN_001'), null, PLAYER_PUUID)
    const c = buildAnchorCatalog(noTl)
    expect([...c.values()].some((a) => a.kind === 'marker')).toBe(false)
    expect(c.has('stat:kda')).toBe(true) // stats still present
  })

  it('validates structured refs against the catalog; allows benchmark/note', () => {
    const c = buildAnchorCatalog(win)
    expect(isValidStructuredRef(c, { id: 'stat:cs_at_10', kind: 'stat' })).toBe(true)
    expect(isValidStructuredRef(c, { id: 'marker:bogus#9', kind: 'marker' })).toBe(false)
    expect(isValidStructuredRef(c, { id: 'whatever', kind: 'benchmark' })).toBe(true)
    expect(isValidStructuredRef(c, { id: 'note', kind: 'note' })).toBe(true)
  })
})
