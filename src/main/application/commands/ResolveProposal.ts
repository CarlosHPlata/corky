import type {
  ProposalPayload,
  Reflection,
  ResolveProposalInput,
  ResolveProposalOutcome
} from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { ChatSessionRepository } from '../ports/ChatSessionRepository'
import type { ReflectionRepository } from '../ports/ReflectionRepository'
import { isTaskProposalStale, isReflectionProposalStale } from '../../domain/chat/proposal'

/** Reflections per match are capped; a create accepted at the cap goes stale. */
const REFLECTION_CAP = 20

/**
 * The ONLY write path for model-initiated changes (spec 005). Resolves one
 * embedded proposal exactly once: re-validates against CURRENT state at accept
 * time (staleness gate), marks the resolution first (a concurrent second accept
 * then reads non-pending and gets the recorded outcome back), applies the
 * payload, and reverts to pending if applying fails midway so the card stays
 * actionable. Rejection records and applies nothing.
 *
 * `onCoachReflectionAccepted` is the distillation hook (US5): fired
 * best-effort AFTER a coach reflection lands — never awaited, never failing
 * the accept.
 */
export class ResolveProposal {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly sessions: ChatSessionRepository,
    private readonly reflections: ReflectionRepository,
    private readonly now: () => number = () => Date.now(),
    private readonly onCoachReflectionAccepted?: (matchId: string, sessionId: string) => void
  ) {}

  execute(input: ResolveProposalInput): ResolveProposalOutcome {
    const { matchId, sessionId, proposalId, decision } = input
    const session = this.sessions.get(sessionId)
    if (!session || session.matchId !== matchId) throw new Error('Session not found')
    const turn = session.turns.find((t) => t.proposal?.id === proposalId)
    const proposal = turn?.proposal
    if (!proposal) throw new Error('Proposal not found')

    // Exactly-once: an already-resolved proposal returns its recorded outcome
    // unchanged (idempotent for double-clicks and cross-window repeats).
    if (proposal.resolution !== 'pending') {
      return { resolution: proposal.resolution, analysis: null, reflection: null }
    }

    const at = this.now()
    if (decision === 'reject') {
      const recorded = this.sessions.resolveProposal(sessionId, proposalId, 'rejected', at)
      return { resolution: recorded ?? 'rejected', analysis: null, reflection: null }
    }

    // ---- accept: staleness gate against CURRENT state ----
    if (this.isStale(matchId, proposal.payload)) {
      const recorded = this.sessions.resolveProposal(sessionId, proposalId, 'stale', at)
      return { resolution: recorded ?? 'stale', analysis: null, reflection: null }
    }

    // Mark resolved FIRST, then apply; revert on apply failure.
    const recorded = this.sessions.resolveProposal(sessionId, proposalId, 'accepted', at)
    if (recorded !== 'accepted') {
      // Lost a race: another resolve landed between our read and this write.
      return { resolution: recorded ?? 'rejected', analysis: null, reflection: null }
    }
    try {
      return this.apply(matchId, sessionId, proposal.payload, at)
    } catch (err) {
      this.sessions.revertToPending(sessionId, proposalId)
      throw err
    }
  }

  private isStale(matchId: string, payload: ProposalPayload): boolean {
    if (payload.kind === 'update_tasks') {
      const account = this.matchRepo.getCurrentAccount()
      if (!account) return true
      return isTaskProposalStale(payload, this.reportRepo.getStandingTasks(account.puuid))
    }
    if (payload.kind === 'create_reflection') {
      return this.reflections.countForMatch(matchId) >= REFLECTION_CAP
    }
    return isReflectionProposalStale(payload, this.reflections.get(payload.reflectionId))
  }

  private apply(
    matchId: string,
    sessionId: string,
    payload: ProposalPayload,
    at: number
  ): ResolveProposalOutcome {
    if (payload.kind === 'update_tasks') {
      const account = this.matchRepo.getCurrentAccount()
      if (!account) throw new Error('No synced account')
      if (payload.retireIds.length) this.reportRepo.retireStandingTasks(payload.retireIds, at)
      this.reportRepo.saveStandingTasks(account.puuid, payload.set, at)

      // Patch the stored read's Next-game focus so the report re-renders the
      // change without a re-analyse (same contract finalize used to have).
      let analysis: ResolveProposalOutcome['analysis'] = null
      const stored = this.reportRepo.getMatchAnalysis(matchId)
      if (stored?.tasks) {
        analysis = { ...stored, tasks: { ...stored.tasks, standing: payload.set } }
        this.reportRepo.upsertMatchAnalysis(analysis)
      }
      return { resolution: 'accepted', analysis, reflection: null }
    }

    if (payload.kind === 'delete_reflection') {
      this.reflections.delete(payload.reflectionId)
      return { resolution: 'accepted', analysis: null, reflection: null }
    }

    let reflection: Reflection
    if (payload.kind === 'create_reflection') {
      reflection = {
        id: `${matchId}-refl-${at.toString(36)}-0`,
        matchId,
        text: payload.text,
        refs: payload.refs,
        source: 'coach',
        createdAt: at,
        updatedAt: at
      }
    } else {
      const current = this.reflections.get(payload.reflectionId)
      if (!current) throw new Error('Reflection vanished mid-accept')
      reflection = { ...current, text: payload.text, refs: payload.refs, updatedAt: at }
    }
    this.reflections.upsert(reflection)

    // Memory distillation rides coach-reflection acceptance (FR-024) —
    // best-effort, fire-and-forget, never blocks or fails the accept.
    if (payload.kind === 'create_reflection') {
      try {
        this.onCoachReflectionAccepted?.(matchId, sessionId)
      } catch {
        /* distillation must never break an accept */
      }
    }
    return { resolution: 'accepted', analysis: null, reflection }
  }
}
