import type { MatchRepository } from '../ports/MatchRepository'
import {
  computeCohortAggregates,
  type CohortAggregates,
  type MatchMetricRow
} from '../../domain/history/cohortAggregates'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { METRIC_KEYS, computeMetric } from '../../domain/report/metricRegistry'
import { matchInfo } from '../../domain/report/raw'

export interface HistoryAggregatesInput {
  champion: string
  role: string
  opponentChampion?: string
  /** The match being analysed — never part of its own cohort. */
  excludeMatchId?: string
  /** How many recent stored matches to consider (default 50). */
  limit?: number
}

/**
 * Deterministic history aggregates for the analysed game's cohort (the
 * "measured against your own games" baseline). Built entirely on read from
 * stored raw match + timeline JSON — no LLM, no network, offline (Constitution
 * VII). Returns null when no account is synced or nothing is stored yet (cold
 * start — callers fall back to the general benchmark and say so).
 */
export class GetHistoryAggregates {
  constructor(private readonly matchRepo: MatchRepository) {}

  execute(input: HistoryAggregatesInput): CohortAggregates | null {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return null

    const details = this.matchRepo.listMatchDetails(account.puuid, input.limit ?? 50)
    const rows: MatchMetricRow[] = []
    for (const detail of details) {
      if (detail.matchId === input.excludeMatchId) continue

      let rawMatch: unknown
      try {
        rawMatch = JSON.parse(detail.rawJson)
      } catch {
        continue // unparseable stored match ⇒ skip, don't fail the history
      }

      const timelineRow = this.matchRepo.getTimeline(detail.matchId)
      let rawTimeline: unknown | null = null
      if (timelineRow) {
        try {
          rawTimeline = JSON.parse(timelineRow.rawJson)
        } catch {
          rawTimeline = null // unparseable timeline ⇒ degrade, don't fail
        }
      }

      const report = assembleMatchReport(rawMatch, rawTimeline, account.puuid)
      const metrics: Record<string, number | null> = {}
      for (const key of METRIC_KEYS) metrics[key] = computeMetric(key, report)

      rows.push({
        matchId: report.matchId || detail.matchId,
        win: report.core.win,
        champion: report.core.champion,
        role: report.core.role,
        opponentChampion: report.matchup.laneOpponent?.champion,
        gameCreation: matchInfo(rawMatch).gameCreation ?? 0,
        metrics
      })
    }
    if (rows.length === 0) return null

    return computeCohortAggregates(
      rows,
      {
        champion: input.champion,
        role: input.role,
        opponentChampion: input.opponentChampion
      },
      { excludeMatchId: input.excludeMatchId }
    )
  }
}
