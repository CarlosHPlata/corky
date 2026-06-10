import type { ResolvedCoachingConfig, SaveCoachingConfigInput } from '@shared/config'
import type { CoachingConfigRepository } from '../ports/CoachingConfigRepository'
import { diffOverrides, isEmptyOverrides, resolveConfig } from '../../domain/config/coachingConfig'

export type { SaveCoachingConfigInput } from '@shared/config'

/**
 * Persists the desired coaching configuration as an overrides-only record:
 * diffs against the hardcoded defaults and stores only the deviations — or
 * clears the record entirely when nothing deviates, so all-defaults and
 * never-configured are indistinguishable. Returns the re-resolved config so
 * the renderer shows exactly what took effect.
 */
export class SaveCoachingConfig {
  constructor(private readonly repo: CoachingConfigRepository) {}

  execute(input: SaveCoachingConfigInput): ResolvedCoachingConfig {
    const overrides = diffOverrides(input)
    if (isEmptyOverrides(overrides)) {
      this.repo.clear()
    } else {
      this.repo.save(overrides)
    }
    return resolveConfig(this.repo.get())
  }
}
