import type { ChatTurn, ReflectionOutcome, MatchReport, StandingFocusTask } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import type { SemanticMemory } from '../ports/SemanticMemory'
import type { MatchCoachingModel } from '../ports/MatchCoachingModel'
import { assembleMatchReport } from '../../domain/report/assembleMatchReport'
import { buildCoachBriefing } from '../../domain/report/coachBriefing'
import { mergeStanding, enforceStandingSet } from '../../domain/report/focusTask'
import { mergeSemanticObjects } from '../../domain/memory/semanticObject'
import type { SemanticObject } from '../../domain/memory/semanticObject'
import { METRIC_KEYS } from '../../domain/report/metricRegistry'
import type { TaskProposal, ReflectionExtras } from '../ports/MatchCoachingModel'

/**
 * Finalise a coaching session (spec 004): Corky writes the player's reflection
 * from the conversation and may adjust the standing focus tasks off the back of
 * it. Task changes are persisted (the standing set is global per user); the
 * written reflection is returned to the renderer, which owns reflection storage
 * (renderer-local, like the raw note). When the standing set changes, the stored
 * MatchAnalysis is patched and returned so the report's Next-game focus section
 * re-renders without a re-analyse.
 *
 * The same model call also distills 0–3 durable coaching facts (semantic memory),
 * merged ADDITIVELY into the player's memory store — an empty proposal is the
 * common outcome and never removes anything.
 */
export class FinalizeReflection {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly goalRepo: SessionGoalRepository,
    private readonly semanticMemory: SemanticMemory,
    private readonly model: MatchCoachingModel,
    private readonly chatModel: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  async execute(matchId: string, messages: ChatTurn[]): Promise<ReflectionOutcome> {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) throw new Error('No synced account')

    const report = this.loadReport(matchId, account.puuid)
    const stored = this.reportRepo.getMatchAnalysis(matchId)
    const goal = this.goalRepo.get()?.goal?.trim() || undefined
    const standing = this.reportRepo.getStandingTasks(account.puuid)
    // Current semantic memory, queried up front: a compact projection rides the
    // model call so it refreshes known subjects instead of duplicating them, and
    // the same rows are the merge baseline afterwards.
    const existingMemory = this.semanticMemory.query({
      puuid: account.puuid,
      statuses: ['active', 'confirmed'],
      limit: 50
    })

    const briefing = buildCoachBriefing(report, stored, goal)
    const proposal = await this.model.summarizeReflection(
      briefing,
      messages,
      { standing, catalogMetricKeys: METRIC_KEYS, goal, existingMemory: projectMemory(existingMemory) },
      this.chatModel
    )

    // Distill the session into semantic memory ADDITIVELY: a known subject is
    // refreshed in place, a new one is minted, and nothing is ever removed by
    // omission — an empty `memory` proposal is the common "nothing durable" case.
    const memoryUpserts = mergeSemanticObjects(proposal.memory, existingMemory, matchId, this.now())
    if (memoryUpserts.length) this.semanticMemory.upsert(account.puuid, memoryUpserts)

    // Apply the task adjustment ADDITIVELY. A reflection chat can add a new focus
    // or explicitly retire one, but it must NEVER wipe the standing set by
    // omission — the light model often returns an empty/partial `set` rather than
    // echoing the existing tasks. So we start from the current set (minus any
    // explicitly-retired ids) and only fold in genuinely new proposed tasks.
    const newStanding = this.applyProposal(standing, proposal.tasks, matchId)
    const tasksUpdated = !sameSet(standing, newStanding)

    let analysis: ReflectionOutcome['analysis'] = null
    if (tasksUpdated) {
      const at = this.now()
      const keepIds = new Set(newStanding.map((t) => t.id))
      const toRetire = standing.filter((s) => !keepIds.has(s.id)).map((s) => s.id)
      this.reportRepo.retireStandingTasks([...new Set(toRetire)], at)
      this.reportRepo.saveStandingTasks(account.puuid, newStanding, at)

      // Patch the stored read's Next-game focus so the report reflects the change.
      if (stored?.tasks) {
        analysis = { ...stored, tasks: { ...stored.tasks, standing: newStanding } }
        this.reportRepo.upsertMatchAnalysis(analysis)
      }
    }

    return { reflection: proposal.reflection, analysis, tasksUpdated }
  }

  /**
   * Fold a reflection's task proposal into the standing set additively: keep every
   * current task except those whose id is explicitly retired, then append any
   * proposed task that isn't already present (matched by its checkable shape).
   * Capped at the 1–3 invariant, existing tasks kept ahead of new ones. This can
   * never empty a non-empty set by omission — only an explicit `retire` removes.
   */
  private applyProposal(
    standing: StandingFocusTask[],
    proposal: TaskProposal,
    matchId: string
  ): StandingFocusTask[] {
    const retire = new Set(proposal.retire)
    const kept = standing.filter((t) => !retire.has(t.id))
    // mergeStanding validates the proposed tasks (computable metrics only),
    // preserves ids of ones already present, and mints `${matchId}-refl-*` ids for
    // genuinely new ones (a distinct seed avoids colliding with analysis ids).
    const proposed = mergeStanding(proposal.set, standing, `${matchId}-refl`)
    const union = [...kept]
    for (const p of proposed) {
      if (!union.some((u) => sameShape(u, p))) union.push(p)
    }
    return enforceStandingSet(union)
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
function projectMemory(objects: SemanticObject[]): ReflectionExtras['existingMemory'] {
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

/** Two tasks share a checkable shape (so they're "the same task" for merge). */
function sameShape(a: StandingFocusTask, b: StandingFocusTask): boolean {
  return a.metric === b.metric && a.comparator === b.comparator && a.target === b.target && a.scope === b.scope
}

/** Two standing sets are equal when the same task ids carry the same checkable
 * shape (description/metric/comparator/target/scope), order-independent. */
function sameSet(a: StandingFocusTask[], b: StandingFocusTask[]): boolean {
  if (a.length !== b.length) return false
  const sig = (t: StandingFocusTask): string =>
    `${t.id}|${t.description}|${t.metric}|${t.comparator}|${t.target}|${t.scope}`
  const as = new Set(a.map(sig))
  return b.every((t) => as.has(sig(t)))
}
