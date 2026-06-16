import type { MatchRepository } from '../ports/MatchRepository'
import type { ChatSessionRepository } from '../ports/ChatSessionRepository'
import type { SemanticMemory } from '../ports/SemanticMemory'
import type { MatchCoachingModel, ExistingMemoryEntry } from '../ports/MatchCoachingModel'
import type { MatchService } from '../services/Match/MatchService'
import { mergeSemanticObjects } from '../../domain/memory/semanticObject'
import type { SemanticObject } from '../../domain/memory/semanticObject'
import { Match } from 'src/main/domain/entities/Match'

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
    private readonly sessions: ChatSessionRepository,
    private readonly semanticMemory: SemanticMemory,
    private readonly matchService: MatchService,
    private readonly model: MatchCoachingModel,
    private readonly chatModel: string,
    private readonly now: () => number = () => Date.now()
  ) { }

  async execute(matchId: string, sessionId: string): Promise<void> {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return
    const session = this.sessions.get(sessionId)
    if (!session || session.turns.length === 0) return

    const match = await this.loadReport(matchId)
    const briefing = match.coachBriefing()

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

  private async loadReport(matchId: string): Promise<Match> {
    const match = await this.matchService.getMatch(matchId)
    if (!match) throw new Error('Match not stored locally')
    return match
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
