import type { MatchReport } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'

/**
 * The factual, computed report for one match (US2–US4). Built on read from the
 * stored raw match + timeline JSON — no LLM, no network, no persistence. Returns
 * null when the match isn't stored; degrades gracefully when its timeline is
 * missing (FR-025). Deterministic and offline (Constitution VII).
 */
export class GetMatchReport {
  constructor(private readonly repository: MatchRepository) {}

  execute(matchId: string): MatchReport | null {
    const account = this.repository.getCurrentAccount()
    if (!account) return null

    const detail = this.repository.getMatchDetail(matchId)
    if (!detail) return null

    let rawMatch: unknown
    try {
      rawMatch = JSON.parse(detail.rawJson)
    } catch {
      return null
    }

    const timelineRow = this.repository.getTimeline(matchId)
    let rawTimeline: unknown | null = null
    if (timelineRow) {
      try {
        rawTimeline = JSON.parse(timelineRow.rawJson)
      } catch {
        rawTimeline = null // unparseable timeline ⇒ degrade, don't fail
      }
    }

    return assembleMatchReport(rawMatch, rawTimeline, account.puuid)
  }
}
