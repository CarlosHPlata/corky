import type { ChatTurn, CoachChatReply, MatchReport } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import type { ReflectionRepository } from '../ports/ReflectionRepository'
import type { ItemCatalog } from '../ports/ItemCatalog'
import type { MatchCoachingModel } from '../ports/MatchCoachingModel'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildCoachBriefing } from '../../domain/report/coachBriefing'
import { buildAnchorCatalog } from '../../domain/report/anchorCatalog'
import { makeRefLineRenderer } from '../../domain/report/resolveChatRefs'
import { sanitizeReflectionProposal, mintProposalId } from '../../domain/chat/proposal'

/**
 * "Summarize into a reflection" (spec 005 US5, replaces the finalize ceremony):
 * one forced-tool call writes the session's takeaway in the player's voice,
 * wrapped as a STANDARD create_reflection proposal turn — identical render and
 * accept path to a chat-initiated one. NOTHING persists here: acceptance goes
 * through ResolveProposal (which also triggers memory distillation). Task
 * changes never ride this step (FR-025).
 */
export class SummarizeIntoReflection {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly goalRepo: SessionGoalRepository,
    private readonly reflectionRepo: ReflectionRepository,
    private readonly itemCatalog: ItemCatalog,
    private readonly model: MatchCoachingModel,
    private readonly chatModel: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  async execute(matchId: string, sessionId: string, messages: ChatTurn[]): Promise<CoachChatReply> {
    if (!messages.some((m) => m.role === 'user')) {
      throw new Error('Nothing to summarize — say something first')
    }
    // One pending card at a time, same rule as the chat loop.
    if (messages.some((m) => m.proposal?.resolution === 'pending')) {
      return { reply: "There's already a proposal waiting for your decision — settle that one first." }
    }

    const account = this.matchRepo.getCurrentAccount()
    if (!account) throw new Error('No synced account')
    const report = this.loadReport(matchId, account.puuid)
    const analysis = this.reportRepo.getMatchAnalysis(matchId)
    const goal = this.goalRepo.get()?.goal?.trim() || undefined
    const standing = this.reportRepo.getStandingTasks(account.puuid)
    const itemNames = await this.itemCatalog.getItemNames() // null offline → id fallback
    const briefing = buildCoachBriefing(report, analysis, goal, itemNames)

    const renderRefs = makeRefLineRenderer(report, standing)
    const grounded = messages.map((m) =>
      m.refs?.length ? { ...m, text: `${renderRefs(m.refs).join('\n')}\n\n${m.text}` } : m
    )

    const { text, refIds } = await this.model.summarizeReflectionText(briefing, grounded, this.chatModel)

    const validRefIds = new Set<string>(buildAnchorCatalog(report).keys())
    for (const t of standing) validRefIds.add(`task:${t.id}`)
    const payload = sanitizeReflectionProposal(
      { kind: 'create_reflection', text, refIds },
      validRefIds,
      this.reflectionRepo.list(matchId)
    )
    // An unusable summary degrades to a plain reply, never a broken card.
    if (!payload) return { reply: "I couldn't shape that into a reflection — tell me the takeaway in your own words and I'll save it." }

    const reply = "Here's how I'd write this session down — yours to keep or toss."
    return {
      reply,
      proposalTurn: {
        role: 'assistant',
        text: reply,
        proposal: { id: mintProposalId(sessionId, this.now()), payload, resolution: 'pending' }
      }
    }
  }

  private loadReport(matchId: string, puuid: string): MatchReport {
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
    return assembleMatchReport(rawMatch, rawTimeline, puuid)
  }
}
