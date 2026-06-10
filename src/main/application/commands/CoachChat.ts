import type { ChatTurn, CoachChatReply, MatchReport } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import type { MatchCoachingModel } from '../ports/MatchCoachingModel'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildCoachBriefing } from '../../domain/report/coachBriefing'
import { makeRefLineRenderer } from '../../domain/report/resolveChatRefs'

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
    const reply = await this.model.chat(briefing, this.groundRefs(report, messages), this.chatModel)
    return { reply }
  }

  /**
   * Ground evidence-referenced turns: each message carrying refs gets its REF
   * lines prepended to the text, so the model sees the fact behind the thing the
   * player pointed at. The anchor catalog is built lazily, once, on the first ref
   * encountered; turns without refs pass through untouched.
   */
  private groundRefs(report: MatchReport, messages: ChatTurn[]): ChatTurn[] {
    const render = makeRefLineRenderer(report)
    return messages.map((m) => {
      if (!m.refs?.length) return m
      const lines = render(m.refs)
      if (!lines.length) return m
      return { ...m, text: `${lines.join('\n')}\n\n${m.text}` }
    })
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
