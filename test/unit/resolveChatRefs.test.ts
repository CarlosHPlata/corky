import { describe, it, expect } from 'vitest'
import { renderRefLines } from '../../src/main/domain/report/resolveChatRefs'
import type { MatchReport, MatchCore, EvidenceRef } from '../../src/shared/types'

const core: MatchCore = {
  champion: 'Ahri', role: 'Mid', win: false,
  kills: 4, deaths: 6, assists: 7, kdaRatio: 1.83,
  cs: 201, csPerMin: 6.4, gold: 11200, goldPerMin: 360,
  durationSec: 1884, queue: 420
}

const report = {
  matchId: 'M1',
  core,
  breakdown: { csAt10: 55, csPerMin: 6.4, goldAt14: -350, goldAt24: null, visionScore: 18, soloDeaths: 2, killParticipation: 0.52 },
  timeline: {
    frames: [], endMin: 31,
    highlights: [{ tMin: 8.2, kind: 'objective', label: 'Dragon — Blue', side: 'ally' }]
  },
  deathMap: { deaths: [{ n: 3, tMin: 20.2, xPct: 43.4, yPct: 60.8 }], count: 1 },
  timelineAvailable: true
} as unknown as MatchReport

const ref = (id: string, kind: EvidenceRef['kind'] = 'stat'): EvidenceRef => ({ id, kind })

describe('renderRefLines', () => {
  it('renders a stat ref with its value and label', () => {
    const out = renderRefLines(report, [ref('stat:cs_at_10')])
    expect(out).toEqual(['REF stat:cs_at_10=55 (CS at 10:00)'])
  })

  it('renders n/r for a not-reached stat, never 0', () => {
    const out = renderRefLines(report, [ref('stat:gold_at_24')])
    expect(out).toEqual(['REF stat:gold_at_24=n/r (Gold diff at 24:00)'])
  })

  it('renders a death marker with time, position and label', () => {
    const out = renderRefLines(report, [ref('marker:death#3', 'marker')])
    expect(out).toEqual(['REF marker:death#3 t=20:12 x=43 y=61 "Death 3"'])
  })

  it('renders a highlight marker with time and side', () => {
    const out = renderRefLines(report, [ref('marker:objective#1', 'marker')])
    expect(out).toEqual(['REF marker:objective#1 t=8:12 side=ally "Dragon — Blue"'])
  })

  it('renders a not-found line for an unknown ref', () => {
    const out = renderRefLines(report, [ref('marker:death#9', 'marker')])
    expect(out).toEqual(['REF marker:death#9 (not found in this match)'])
  })

  it('dedupes refs by id', () => {
    const out = renderRefLines(report, [ref('stat:kda'), ref('stat:kda'), ref('stat:cs')])
    expect(out).toEqual(['REF stat:kda=1.83 (KDA ratio)', 'REF stat:cs=201 (CS)'])
  })

  it('caps at 5 lines per turn', () => {
    const refs = ['stat:kda', 'stat:cs', 'stat:gold', 'stat:cs_per_min', 'stat:gold_per_min', 'stat:vision_score', 'stat:solo_deaths'].map((id) => ref(id))
    const out = renderRefLines(report, refs)
    expect(out).toHaveLength(5)
    expect(out[4]).toBe('REF stat:gold_per_min=360 (Gold per minute)')
  })
})
