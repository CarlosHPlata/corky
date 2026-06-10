import type { ResolvedCoachingConfig } from '@shared/config'
import type { CoachingConfigRepository } from '../ports/CoachingConfigRepository'
import { resolveConfig } from '../../domain/config/coachingConfig'

/**
 * Restores the coaching configuration to its hardcoded defaults by deleting the
 * overrides record (overrides-only storage makes restore a delete). Returns the
 * resolved default config for the renderer to repaint from.
 */
export class RestoreCoachingConfigDefaults {
  constructor(private readonly repo: CoachingConfigRepository) {}

  execute(): ResolvedCoachingConfig {
    this.repo.clear()
    return resolveConfig(null)
  }
}
