import type { MatchAnalysis } from '@shared/types'
import type { ReportRepository } from '../ports/ReportRepository'

/**
 * Restore the stored AI analysis for a match (spec 004 / FR-027). Read-only: a
 * single SQLite read deserialised to the DTO — no model call, no network, no
 * recompute. Returns null when the match was never analysed (renderer shows the
 * gated "Analyze this match" state). Offline (Constitution VII).
 */
export class GetMatchAnalysis {
  constructor(private readonly reportRepo: ReportRepository) {}

  execute(matchId: string): MatchAnalysis | null {
    if (!matchId) return null
    return this.reportRepo.getMatchAnalysis(matchId)
  }
}
