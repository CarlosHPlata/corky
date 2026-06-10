import { describe, it, expect } from 'vitest'
import {
  resolveCohort,
  computeCohortAggregates,
  renderHistoryBlock,
  type MatchMetricRow
} from '../../src/main/domain/history/cohortAggregates'

let seq = 0

function row(o: Partial<MatchMetricRow> = {}): MatchMetricRow {
  seq++
  return {
    matchId: `M${seq}`,
    win: true,
    champion: 'Ahri',
    role: 'Mid',
    opponentChampion: 'Zed',
    gameCreation: 1000 + seq,
    metrics: { cs_at_10: 80, cs_per_min: 8, deaths: 3 },
    ...o
  }
}

const TARGET = { champion: 'Ahri', role: 'Mid', opponentChampion: 'Zed' }

describe('resolveCohort', () => {
  it('picks the exact matchup when it holds the minimum sample', () => {
    const rows = [row(), row(), row(), row({ champion: 'Lux' })]
    const c = resolveCohort(rows, TARGET)
    expect(c.basis).toBe('matchup')
    expect(c.rows).toHaveLength(3)
  })

  it('falls back to same champion when the matchup is too thin', () => {
    const rows = [row(), row({ opponentChampion: 'Syndra' }), row({ opponentChampion: 'Yone' })]
    const c = resolveCohort(rows, TARGET)
    expect(c.basis).toBe('champion')
    expect(c.rows).toHaveLength(3)
  })

  it('falls back to same role when the champion is too thin', () => {
    const rows = [row(), row({ champion: 'Lux' }), row({ champion: 'Syndra' })]
    const c = resolveCohort(rows, TARGET)
    expect(c.basis).toBe('role')
    expect(c.rows).toHaveLength(3)
  })

  it('falls back to all rows — even below the minimum sample', () => {
    const rows = [row({ champion: 'Lux', role: 'Support' }), row({ champion: 'Jinx', role: 'Bot' })]
    const c = resolveCohort(rows, TARGET)
    expect(c.basis).toBe('overall')
    expect(c.rows).toHaveLength(2)
  })

  it('never considers the matchup tier without an opponent', () => {
    const rows = [row(), row(), row()]
    const c = resolveCohort(rows, { champion: 'Ahri', role: 'Mid' })
    expect(c.basis).toBe('champion')
  })

  it('respects a custom minimum sample', () => {
    const rows = [row(), row(), row()]
    expect(resolveCohort(rows, TARGET, 4).basis).toBe('overall')
  })

  it('defends against the analysed match leaking into its own cohort', () => {
    const rows = [row({ matchId: 'SELF' }), row(), row(), row({ opponentChampion: 'Syndra' })]
    const c = resolveCohort(rows, TARGET, 3, 'SELF')
    expect(c.rows.map((r) => r.matchId)).not.toContain('SELF')
    expect(c.basis).toBe('champion') // matchup drops to 2 without SELF; champion holds 3
  })
})

describe('computeCohortAggregates', () => {
  it('prefers winning games once the cohort holds three wins', () => {
    const rows = [
      row({ metrics: { cs_at_10: 80 } }),
      row({ metrics: { cs_at_10: 82 } }),
      row({ metrics: { cs_at_10: 78 } }),
      row({ win: false, metrics: { cs_at_10: 50 } })
    ]
    const agg = computeCohortAggregates(rows, TARGET)
    expect(agg.preferredWins).toBe(true)
    expect(agg.averages.cs_at_10).toBe(80) // the loss's 50 is excluded
    expect(agg.games).toBe(4) // games/wr still describe the whole cohort
    expect(agg.wins).toBe(3)
    expect(agg.winRate).toBe(0.75)
  })

  it('aggregates over all cohort games below three wins', () => {
    const rows = [
      row({ metrics: { cs_at_10: 80 } }),
      row({ win: false, metrics: { cs_at_10: 60 } }),
      row({ win: false, metrics: { cs_at_10: 70 } })
    ]
    const agg = computeCohortAggregates(rows, TARGET)
    expect(agg.preferredWins).toBe(false)
    expect(agg.averages.cs_at_10).toBe(70)
    expect(agg.wins).toBe(1)
    expect(agg.winRate).toBe(0.33)
  })

  it('ignores nulls in averages and never fabricates 0', () => {
    const rows = [
      row({ win: false, metrics: { cs_at_10: 70, gold_at_14: null } }),
      row({ win: false, metrics: { cs_at_10: null, gold_at_14: null } }),
      row({ win: false, metrics: { cs_at_10: 75, gold_at_14: null } })
    ]
    const agg = computeCohortAggregates(rows, TARGET)
    expect(agg.averages.cs_at_10).toBe(72.5)
    expect(agg.averages.gold_at_14).toBeNull() // no values at all
    expect(agg.averages.vision_score).toBeNull() // metric absent from rows
  })

  it('rounds averages to one decimal', () => {
    const rows = [
      row({ win: false, metrics: { cs_per_min: 7.9 } }),
      row({ win: false, metrics: { cs_per_min: 8.0 } }),
      row({ win: false, metrics: { cs_per_min: 8.2 } })
    ]
    const agg = computeCohortAggregates(rows, TARGET)
    expect(agg.averages.cs_per_min).toBe(8)
  })

  it('honours the excludeMatchId option', () => {
    const rows = [
      row({ matchId: 'SELF', metrics: { cs_at_10: 999 } }),
      row({ win: false, metrics: { cs_at_10: 70 } }),
      row({ win: false, metrics: { cs_at_10: 80 } })
    ]
    const agg = computeCohortAggregates(rows, TARGET, { excludeMatchId: 'SELF' })
    expect(agg.games).toBe(2)
    expect(agg.averages.cs_at_10).toBe(75)
  })
})

describe('renderHistoryBlock', () => {
  it('renders one terse line and skips null metrics', () => {
    const rows = [
      row({ metrics: { cs_at_10: 78, cs_per_min: 7.8, deaths: 3 } }),
      row({ metrics: { cs_at_10: 79, cs_per_min: 8.0, deaths: 4 } }),
      row({ metrics: { cs_at_10: 78.5, cs_per_min: 7.9, deaths: 3 } }),
      row({ win: false, metrics: { cs_at_10: 55, cs_per_min: 6.1, deaths: 7 } })
    ]
    const line = renderHistoryBlock(computeCohortAggregates(rows, TARGET), TARGET)
    expect(line).not.toContain('\n')
    expect(line).toContain('HIST basis=matchup champ=Ahri vs=Zed')
    expect(line).toContain('wins_only=true games=4 wr=75%')
    expect(line).toContain('cs_at_10=78.5')
    expect(line).not.toContain('gold_at_14') // null ⇒ skipped, never 0
  })

  it('labels the champion and role bases with their cohort key only', () => {
    const champRows = [row({ opponentChampion: 'Syndra' }), row({ opponentChampion: 'Yone' }), row()]
    const champ = renderHistoryBlock(
      computeCohortAggregates(champRows, TARGET, { minSample: 3 }),
      TARGET
    )
    expect(champ).toContain('basis=champion champ=Ahri')
    expect(champ).not.toContain('vs=')

    const roleRows = [row({ champion: 'Lux' }), row({ champion: 'Syndra' }), row({ champion: 'Viktor' })]
    const role = renderHistoryBlock(computeCohortAggregates(roleRows, TARGET), TARGET)
    expect(role).toContain('basis=role role=Mid')
    expect(role).not.toContain('champ=')
  })
})
