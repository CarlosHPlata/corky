import type { StandingFocusTask } from '@shared/types'
import { isComputable } from './metricRegistry'

// Pure invariants for the standing, global, per-user focus-task set (1–3 active).

const MAX_ACTIVE = 3

/** A task proposed by the model — without the orchestrator-assigned fields. */
export type GeneratedTask = Pick<
  StandingFocusTask,
  'description' | 'metric' | 'comparator' | 'target' | 'scope' | 'champion' | 'role'
>

/** True when a generated task is well-formed and computable (else drop it). */
export function isValidTask(t: GeneratedTask): boolean {
  if (!t.description?.trim()) return false
  if (!isComputable(t.metric)) return false // Constitution: metric must be computable
  if (t.scope === 'champion' && !t.champion) return false
  if (t.scope === 'role' && !t.role) return false
  return true
}

/**
 * Keep the standing set within bounds: only valid/computable active tasks, at
 * most three, retired tasks dropped from the active view. Order preserved.
 */
export function enforceStandingSet(tasks: StandingFocusTask[]): StandingFocusTask[] {
  return tasks
    .filter((t) => t.status === 'active' && isValidTask(t))
    .slice(0, MAX_ACTIVE)
}

/**
 * Merge a model's proposed set into the current standing set, preserving the id
 * (and source match) of any task whose metric/comparator/target/scope already
 * exists, and minting `${idSeed}-task-${i}` for genuinely new ones. Enforces the
 * 1–3 computable-only invariant. Shared by the analysis pass (idSeed = matchId)
 * and the session-reflection finalize (idSeed = `${matchId}-refl`), so the two
 * never collide on ids. Pure.
 */
export function mergeStanding(
  proposed: GeneratedTask[],
  standing: StandingFocusTask[],
  idSeed: string
): StandingFocusTask[] {
  const candidates: StandingFocusTask[] = proposed.map((g, i) => {
    const existing = standing.find(
      (s) => s.metric === g.metric && s.comparator === g.comparator && s.target === g.target && s.scope === g.scope
    )
    return {
      id: existing?.id ?? `${idSeed}-task-${i}`,
      description: g.description,
      metric: g.metric,
      comparator: g.comparator,
      target: g.target,
      scope: g.scope,
      ...(g.champion ? { champion: g.champion } : {}),
      ...(g.role ? { role: g.role } : {}),
      status: 'active',
      sourceMatchId: existing?.sourceMatchId ?? idSeed
    }
  })
  return enforceStandingSet(candidates)
}
