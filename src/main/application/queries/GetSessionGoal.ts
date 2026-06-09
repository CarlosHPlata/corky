import type { SessionGoal } from '@shared/types'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'

/**
 * Reads the saved session goal + notes (or null if never set). Read-only — the
 * renderer calls this on load to restore the goal after app restart.
 */
export class GetSessionGoal {
  constructor(private readonly repo: SessionGoalRepository) {}

  execute(): SessionGoal | null {
    return this.repo.get()
  }
}
