import type { SessionGoal, SessionGoalInput } from '@shared/types'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import { normalizeSessionGoal } from '../../domain/sessionGoal'

/**
 * Normalizes (trim + cap) the player's goal + notes and persists them, returning
 * the stored record so the renderer shows exactly what was saved. `now` is
 * injected for testability.
 */
export class SaveSessionGoal {
  constructor(
    private readonly repo: SessionGoalRepository,
    private readonly now: () => number = () => Date.now()
  ) {}

  execute(input: SessionGoalInput): SessionGoal {
    const normalized = normalizeSessionGoal(input)
    return this.repo.save(normalized, this.now())
  }
}
