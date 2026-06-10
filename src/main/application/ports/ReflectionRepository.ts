import type { Reflection } from '@shared/types'

/**
 * Persists the player's per-match reflections (spec 005). Many per match;
 * player-authored rows come from the manual composer (no model), coach-authored
 * rows only ever land through an accepted proposal (ResolveProposal). Corrupt
 * stored refs JSON is tolerated and read back as no refs — never thrown.
 */
export interface ReflectionRepository {
  /** All reflections for a match, oldest first. */
  list(matchId: string): Reflection[]
  /** One reflection by id, or null. */
  get(id: string): Reflection | null
  /** Insert or replace the full row. */
  upsert(reflection: Reflection): void
  /** Hard delete; deleting a missing id is a no-op. */
  delete(id: string): void
  /** How many reflections a match holds (enforces the per-match cap). */
  countForMatch(matchId: string): number
}
