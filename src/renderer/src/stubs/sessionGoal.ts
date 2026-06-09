// Frontend-first stub data (Constitution VIII). Shapes mirror the `SessionGoal`
// DTO in `@shared/types` exactly, so wiring the backend is a one-line swap in
// `useSessionGoal` with no UI change. These fixtures exercise every state the
// GoalNotes card must render.
import type { SessionGoal } from '@shared/types'

/** Read mode: a sharp goal plus multi-line notes (each non-blank line a bullet). */
export const STUB_SESSION_GOAL: SessionGoal = {
  goal: 'Convert one 20-minute lead into a closed game.',
  notes:
    'Stop forcing river plays when ahead — group mid and take towers instead.\n' +
    'Ward the enemy jungle entrances before each objective spawns.',
  updatedAt: 1_749_470_000_000
}

/** Empty state: no goal ever set → GoalNotes shows the "Set a goal" prompt. */
export const STUB_SESSION_GOAL_EMPTY: SessionGoal | null = null

/** Toggle this to preview the empty vs. read state while building (Constitution VIII). */
export const STUB_INITIAL: SessionGoal | null = STUB_SESSION_GOAL
