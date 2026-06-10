import type { ResolvedCoachingConfig } from '@shared/config'
import type { CoachingConfigRepository } from '../ports/CoachingConfigRepository'
import { resolveConfig } from '../../domain/config/coachingConfig'

/**
 * Reads the effective coaching configuration: hardcoded defaults merged with
 * any stored overrides. Read-only — works with zero config (null overrides).
 */
export class GetCoachingConfig {
  constructor(private readonly repo: CoachingConfigRepository) {}

  execute(): ResolvedCoachingConfig {
    return resolveConfig(this.repo.get())
  }
}
