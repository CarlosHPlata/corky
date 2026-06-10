import type { ChatTurn, CoachChatReply, MatchReport } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import type { MatchCoachingModel } from '../ports/MatchCoachingModel'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildCoachBriefing } from '../../domain/report/coachBriefing'

/**
 * Post-game coaching chat (spec 004). Rebuilds the per-game briefing in the main
 * process from the stored match + the persisted analysis, so the renderer only
 * carries the transcript and no secrets cross preload (Constitution VI). One call
 * = one coach reply; the transcript lives renderer-side. Offline-grounded: the
 * facts come from stored JSON, only the reply needs connectivity.
 */
export class CoachChat {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly goalRepo: SessionGoalRepository,
    private readonly model: MatchCoachingModel,
    private readonly chatModel: string
  ) {}

  async execute(matchId: string, messages: ChatTurn[]): Promise<CoachChatReply> {
    const report = this.loadReport(matchId)
    const analysis = this.reportRepo.getMatchAnalysis(matchId)
    const goal = this.goalRepo.get()?.goal?.trim() || undefined
    const briefing = buildCoachBriefing(report, analysis, goal)
    const reply = await this.model.chat(briefing, messages, this.chatModel)
    return { reply }
  }

  private loadReport(matchId: string): MatchReport {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) throw new Error('No synced account')
    const detail = this.matchRepo.getMatchDetail(matchId)
    if (!detail) throw new Error('Match not stored locally')
    const rawMatch = JSON.parse(detail.rawJson)
    const timelineRow = this.matchRepo.getTimeline(matchId)
    let rawTimeline: unknown | null = null
    if (timelineRow) {
      try {
        rawTimeline = JSON.parse(timelineRow.rawJson)
      } catch {
        rawTimeline = null
      }
    }
    return assembleMatchReport(rawMatch, rawTimeline, account.puuid)
  }
}
