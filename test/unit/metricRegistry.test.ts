import { describe, it, expect } from 'vitest'
import { computeMetric, isComputable, METRIC_KEYS } from '../../src/main/domain/report/metricRegistry'
import { assembleMatchReport } from '../../src/main/domain/report/assembleMatchReport'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const win = assembleMatchReport(loadMatch('WIN_001'), loadTimeline('WIN_001'), PLAYER_PUUID)
const short = assembleMatchReport(loadMatch('SHORT_003'), loadTimeline('SHORT_003'), PLAYER_PUUID)

describe('metricRegistry', () => {
  it('computes metrics straight off the report', () => {
    expect(computeMetric('cs_at_10', win)).toBe(win.breakdown.csAt10)
    expect(computeMetric('deaths', win)).toBe(win.core.deaths)
    expect(computeMetric('solo_deaths', win)).toBe(win.breakdown.soloDeaths)
    expect(computeMetric('kill_participation', win)).toBe(win.breakdown.killParticipation)
  })

  it('returns null for a breakpoint the game never reached (never 0)', () => {
    expect(computeMetric('gold_at_24', short)).toBeNull()
  })

  it('gates non-computable metrics', () => {
    expect(isComputable('cs_at_10')).toBe(true)
    expect(isComputable('vibes_per_min')).toBe(false)
    expect(METRIC_KEYS).toContain('vision_score')
  })
})
