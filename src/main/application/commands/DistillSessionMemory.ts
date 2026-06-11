import type { MatchReport } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import type { ChatSessionRepository } from '../ports/ChatSessionRepository'
import type { SemanticMemory } from '../ports/SemanticMemory'
import type { ItemCatalog } from '../ports/ItemCatalog'
import type { MatchCoachingModel, ExistingMemoryEntry } from '../ports/MatchCoachingModel'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildCoachBriefing } from '../../domain/report/coachBriefing'
import { mergeSemanticObjects } from '../../domain/memory/semanticObject'
import type { SemanticObject } from '../../domain/memory/semanticObject'

/**
 * Memory distillation (spec 005 US5): runs best-effort AFTER a coach-authored
 * reflection is accepted (ResolveProposal's fire-and-forget hook). Distills
 * 0–3 durable facts from the closed session and merges them ADDITIVELY into
 * semantic memory — known subjects refreshed, new ones minted, nothing removed
 * by omission (same semantics finalize had, FR-024). A failure anywhere is the
 * caller's to swallow; this command never touches the accept's outcome.
 */
export class DistillSessionMemory {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly goalRepo: SessionGoalRepository,
    private readonly sessions: ChatSessionRepository,
    private readonly semanticMemory: SemanticMemory,
    private readonly itemCatalog: ItemCatalog,
    private readonly model: MatchCoachingModel,
    private readonly chatModel: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  async execute(matchId: string, sessionId: string): Promise<void> {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return
    const session = this.sessions.get(sessionId)
    if (!session || session.turns.length === 0) return

    const report = this.loadReport(matchId, account.puuid)
    const analysis = this.reportRepo.getMatchAnalysis(matchId)
    const goal = this.goalRepo.get()?.goal?.trim() || undefined
    const itemNames = await this.itemCatalog.getItemNames() // null offline → id fallback
    const briefing = buildCoachBriefing(report, analysis, goal, itemNames)

    const existing = this.semanticMemory.query({
      puuid: account.puuid,
      statuses: ['active', 'confirmed'],
      limit: 50
    })

    const proposed = await this.model.distillMemory(
      briefing,
      session.turns,
      projectMemory(existing),
      this.chatModel
    )

    const upserts = mergeSemanticObjects(proposed, existing, matchId, this.now())
    if (upserts.length) this.semanticMemory.upsert(account.puuid, upserts)
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

/** Project stored semantic objects onto the compact shape the model call carries. */
function projectMemory(objects: SemanticObject[]): ExistingMemoryEntry[] {
  return objects.map((o) => ({
    kind: o.kind,
    ...(o.champion ? { champion: o.champion } : {}),
    ...(o.role ? { role: o.role } : {}),
    ...(o.phase ? { phase: o.phase } : {}),
    ...(o.metric ? { metric: o.metric } : {}),
    statement: o.statement,
    occurrences: o.occurrences
  }))
}
