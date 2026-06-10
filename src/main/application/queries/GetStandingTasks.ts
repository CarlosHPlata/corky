import type { StandingFocusTask } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { ReportRepository } from '../ports/ReportRepository'

/**
 * The player's current standing focus tasks — the global, per-user set (1–3) that
 * the analysis pass and the reflection chat keep current (spec 004). Read-only:
 * the Home screen restores these on load to show "Next-game focus" for real, no
 * model call. Empty until the first game is analysed.
 */
export class GetStandingTasks {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly reportRepo: ReportRepository
  ) {}

  execute(): StandingFocusTask[] {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return []
    return this.reportRepo.getStandingTasks(account.puuid)
  }
}
