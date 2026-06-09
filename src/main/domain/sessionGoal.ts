import type { SessionGoalInput } from '@shared/types'

/** Authoritative caps (spec FR-012 / Edge Cases). The renderer mirrors these. */
export const GOAL_MAX_LEN = 200
export const NOTES_MAX_LEN = 1000

/**
 * Normalize raw goal/notes input before persisting: trim surrounding whitespace,
 * cap to the field limits, and treat whitespace-only as empty. Pure — no I/O.
 * Interior newlines in notes are preserved; the line-per-bullet split is a
 * render concern, not a storage one.
 */
export function normalizeSessionGoal(input: SessionGoalInput): SessionGoalInput {
  return {
    goal: input.goal.trim().slice(0, GOAL_MAX_LEN),
    notes: input.notes.trim().slice(0, NOTES_MAX_LEN)
  }
}

/** True once the goal or notes carry any non-blank content. */
export function hasContent(value: { goal: string; notes: string }): boolean {
  return value.goal.trim().length > 0 || value.notes.trim().length > 0
}
