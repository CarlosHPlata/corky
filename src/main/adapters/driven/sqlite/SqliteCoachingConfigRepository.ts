import type Database from 'better-sqlite3'
import type { CoachingConfigOverrides } from '@shared/config'
import type { CoachingConfigRepository } from '../../../application/ports/CoachingConfigRepository'

/** Persists the coaching config overrides as a single global JSON row (id = 1). */
export class SqliteCoachingConfigRepository implements CoachingConfigRepository {
  constructor(private readonly db: Database.Database) {}

  get(): CoachingConfigOverrides | null {
    const row = this.db.prepare('SELECT json FROM coaching_config WHERE id = 1').get() as
      | { json: string }
      | undefined
    if (!row) return null
    try {
      return JSON.parse(row.json) as CoachingConfigOverrides
    } catch {
      // Corrupt row — behave as never-configured (pure defaults) rather than throw.
      return null
    }
  }

  save(overrides: CoachingConfigOverrides): void {
    this.db
      .prepare(
        `INSERT INTO coaching_config (id, json, updated_at)
         VALUES (1, @json, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET json = @json, updated_at = @updatedAt`
      )
      .run({ json: JSON.stringify(overrides), updatedAt: Date.now() })
  }

  clear(): void {
    this.db.prepare('DELETE FROM coaching_config WHERE id = 1').run()
  }
}
