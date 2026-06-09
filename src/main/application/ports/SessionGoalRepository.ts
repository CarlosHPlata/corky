import type { SessionGoal, SessionGoalInput } from '@shared/types'

/**
 * Stores the single player's session goal + notes (one global record).
 * Singleton: there is at most one SessionGoal; `save` upserts it. No `puuid`
 * key — the goal exists independently of any synced account.
 */
export interface SessionGoalRepository {
  /** The saved goal, or null when never set. */
  get(): SessionGoal | null
  /** Upsert the (already-normalized) goal; returns the stored record. */
  save(value: SessionGoalInput, updatedAt: number): SessionGoal
}
