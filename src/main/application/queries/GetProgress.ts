import type { ProgressSummary, TaskProgress, TaskEvaluationResult } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'
import type { SemanticMemory } from '../ports/SemanticMemory'

const MAX_RECENT = 5
const MAX_WORKING = 4
const MAX_WINS = 4
/** Memory orders by occurrences first; scan wide enough to re-sort by recency. */
const MEMORY_SCAN_LIMIT = 32

/**
 * The player's coaching progress for the Home screen — a deterministic
 * (zero-LLM) read that closes the product loop: each standing task's recent
 * evaluation track record, what the semantic memory says Corky is still
 * working on, and the wins already banked. Empty until the first game is
 * analysed; never throws when no account is synced yet.
 */
export class GetProgress {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository,
    private readonly semanticMemory: SemanticMemory
  ) {}

  execute(): ProgressSummary {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return { tasks: [], working: [], wins: [], analysedGames: 0 }

    const standing = this.reportRepo.getStandingTasks(account.puuid)
    const evaluations = this.reportRepo.listTaskEvaluations(standing.map((t) => t.id))
    const tasks: TaskProgress[] = standing.map((t) => {
      const results = evaluations.filter((e) => e.taskId === t.id).map((e) => e.result)
      return {
        taskId: t.id,
        description: t.description,
        metric: t.metric,
        recent: results.slice(0, MAX_RECENT),
        streak: streakOf(results)
      }
    })

    // What the coach is still tracking — most-established first (the memory
    // adapter already orders by occurrences, then recency).
    const working = this.semanticMemory
      .query({
        puuid: account.puuid,
        kinds: ['pattern', 'weakness'],
        statuses: ['active', 'confirmed'],
        limit: MAX_WORKING
      })
      .map((o) => ({ statement: o.statement, kind: o.kind, occurrences: o.occurrences }))

    // Wins = anything closed out (resolved) plus standing milestones, freshest
    // first. A resolved milestone only appears once (the queries are disjoint).
    const resolved = this.semanticMemory.query({
      puuid: account.puuid,
      statuses: ['resolved'],
      limit: MEMORY_SCAN_LIMIT
    })
    const milestones = this.semanticMemory.query({
      puuid: account.puuid,
      kinds: ['milestone'],
      statuses: ['active'],
      limit: MEMORY_SCAN_LIMIT
    })
    const wins = [...resolved, ...milestones]
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, MAX_WINS)
      .map((o) => ({ statement: o.statement, kind: o.kind }))

    return { tasks, working, wins, analysedGames: this.reportRepo.countMatchAnalyses() }
  }
}

/** Consecutive 'improved'/'held' run counted from the newest evaluation back. */
function streakOf(results: TaskEvaluationResult[]): number {
  let streak = 0
  for (const r of results) {
    if (r !== 'improved' && r !== 'held') break
    streak++
  }
  return streak
}
