import type { Reflection } from '@shared/types'
import type { ReflectionRepository } from '../ports/ReflectionRepository'

/** All reflections for one match, oldest first (spec 005). */
export class ListReflections {
  constructor(private readonly reflections: ReflectionRepository) {}

  execute(matchId: string): Reflection[] {
    return this.reflections.list(matchId)
  }
}
