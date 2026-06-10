import type { CoachingConfigOverrides } from '@shared/config'

/**
 * Stores the coaching configuration as an overrides-only record (one global
 * record, single-user app). Singleton: `save` upserts it. Absence means pure
 * hardcoded defaults — "Restore defaults" is just `clear()`.
 */
export interface CoachingConfigRepository {
  /** The saved overrides, or null when never set (or unreadable). */
  get(): CoachingConfigOverrides | null
  /** Upsert the overrides record. */
  save(overrides: CoachingConfigOverrides): void
  /** Delete the record — back to pure defaults. */
  clear(): void
}
