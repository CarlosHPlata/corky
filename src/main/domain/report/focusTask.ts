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
