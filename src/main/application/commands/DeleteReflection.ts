import type { ReflectionRepository } from '../ports/ReflectionRepository'

/** Hard-delete one reflection (spec 005). Idempotent: a missing id is a no-op;
 * an id belonging to another match is refused. No model call, fully offline. */
export class DeleteReflection {
  constructor(private readonly reflections: ReflectionRepository) {}

  execute(matchId: string, reflectionId: string): void {
    const current = this.reflections.get(reflectionId)
    if (!current) return
    if (current.matchId !== matchId) throw new Error('Reflection belongs to another match')
    this.reflections.delete(reflectionId)
  }
}
