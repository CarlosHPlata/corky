import { describe, it, expect } from 'vitest'
import { buildCoachBriefing } from '../../src/main/domain/report/coachBriefing'
import type { MatchReport, MatchAnalysis, MatchCore } from '../../src/shared/types'

const core: MatchCore = {
  champion: 'Ahri', role: 'Mid', win: false,
  kills: 4, deaths: 6, assists: 7, kdaRatio: 1.83,
  cs: 201, csPerMin: 6.4, gold: 11200, goldPerMin: 360,
  durationSec: 1884, queue: 420
}

const report = { core } as MatchReport

const analysis: MatchAnalysis = {
  matchId: 'M1', result: 'loss',
  framing: null,
  narration: {
    highlightNarrations: [],
    deathNarrations: [{ ref: { id: 'marker:death#2', kind: 'marker' }, character: 'caught_out', text: 'Alone in the river before Baron.' }],
    turningPoints: [{ time: '22:10', swing: '−1.6k swing', dir: 'down', you: { x: 24, y: 30 }, event: { x: 62, y: 60 }, what: 'Solo death handed them Herald.', better: 'Recall on the lead.' }]
  },
  review: {
    verdict: { lead: 'Even until 24, then you threw it.', gild: 'Two river deaths.' },
    improve: 'Group by 24:00.',
    claims: [], cohort: 'vs general benchmark', benchmarkBasis: 'general', confidence: 'established'
  },
  tasks: {
    standing: [{ id: 't1', description: "Don't die alone in the river.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal', status: 'active', sourceMatchId: 'M1' }],
    sinceLast: [], firstTime: true
  },
  status: 'done',
  sections: { framing: 'skipped', narration: 'done', review: 'done', tasks: 'done' },
  lightModel: 'l', heavyModel: 'h', generatedAt: 0
}

describe('buildCoachBriefing', () => {
  it('grounds the brief in this game: scoreline, verdict, deaths, swings, tasks, goal', () => {
    const out = buildCoachBriefing(report, analysis, 'Climb to Platinum')
    expect(out).toContain('Ahri (Mid)')
    expect(out).toContain('31:24') // durationSec formatted
    expect(out).toContain('DEFEAT')
    expect(out).toContain('4/6/7')
    expect(out).toContain("Corky's verdict: Even until 24")
    expect(out).toContain('Group by 24:00')
    expect(out).toContain('caught out — Alone in the river')
    expect(out).toContain('22:10')
    expect(out).toContain("Don't die alone in the river.")
    expect(out).toContain('Climb to Platinum')
  })

  it('degrades to hard facts when there is no analysis yet', () => {
    const out = buildCoachBriefing(report, null)
    expect(out).toContain('Ahri (Mid)')
    expect(out).not.toContain("Corky's verdict")
    expect(out).not.toContain('Standing focus tasks')
  })
})
