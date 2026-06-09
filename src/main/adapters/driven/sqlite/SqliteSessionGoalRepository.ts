import type Database from 'better-sqlite3'
import type { SessionGoal, SessionGoalInput } from '@shared/types'
import type { SessionGoalRepository } from '../../../application/ports/SessionGoalRepository'

/** Persists the player's session goal + notes as a single global row (id = 1). */
export class SqliteSessionGoalRepository implements SessionGoalRepository {
  constructor(private readonly db: Database.Database) {}

  get(): SessionGoal | null {
    const row = this.db
      .prepare('SELECT goal, notes, updated_at FROM session_goal WHERE id = 1')
      .get() as { goal: string; notes: string; updated_at: number | null } | undefined
    if (!row) return null
    return {
      goal: row.goal,
      notes: row.notes,
      updatedAt: row.updated_at ?? null
    }
  }

  save(value: SessionGoalInput, updatedAt: number): SessionGoal {
    this.db
      .prepare(
        `INSERT INTO session_goal (id, goal, notes, updated_at)
         VALUES (1, @goal, @notes, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET goal = @goal, notes = @notes, updated_at = @updatedAt`
      )
      .run({ goal: value.goal, notes: value.notes, updatedAt })
    return { goal: value.goal, notes: value.notes, updatedAt }
  }
}
