import { eventBus } from '../application/events/EventBus'
import { preview } from '../application/events/telemetry'

export interface ObserveMeta {
  /** 'app' = driving call into a use case; 'outbound' = driven call to an external system. */
  layer: 'app' | 'outbound'
  /** Use case or adapter name, e.g. 'CoachChat' / 'MatchRepository'. */
  name: string
  /** External system id ('sqlite', 'riot-api', 'anthropic'…). Required for outbound. */
  target?: string
}

/**
 * Observability interceptor (observer pattern): wraps any object in a Proxy
 * that times every public method call and emits a telemetry event on the
 * shared bus — without the wrapped class knowing it is observed. Applied at
 * the composition root only (container.ts), so use cases and adapters stay
 * free of logging concerns.
 *
 * Methods are invoked with `this` bound to the RAW instance (not the proxy),
 * so #private fields and internal self-calls keep working; internal calls are
 * intentionally NOT intercepted — only the architectural boundary is.
 */
export function observed<T extends object>(instance: T, meta: ObserveMeta): T {
  return new Proxy(instance, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function' || prop === 'constructor') return value
      const method = String(prop)
      return (...args: unknown[]) => {
        const started = Date.now()
        const finish = (ok: boolean, result?: unknown, error?: unknown): void => {
          const durationMs = Date.now() - started
          if (meta.layer === 'app') {
            eventBus.emit({
              type: 'telemetry.app',
              name: meta.name,
              method,
              durationMs,
              ok,
              ...(ok ? {} : { error: preview(error instanceof Error ? error.message : error, 200) })
            })
          } else {
            eventBus.emit({
              type: 'telemetry.outbound',
              target: meta.target ?? 'unknown',
              name: meta.name,
              method,
              durationMs,
              ok,
              args: preview(args, 120),
              ...(ok ? { preview: preview(result) } : {}),
              ...(ok ? {} : { error: preview(error instanceof Error ? error.message : error, 200) })
            })
          }
        }
        try {
          const out = value.apply(target, args)
          if (out instanceof Promise) {
            return out.then(
              (v) => {
                finish(true, v)
                return v
              },
              (e) => {
                finish(false, undefined, e)
                throw e
              }
            )
          }
          finish(true, out)
          return out
        } catch (e) {
          finish(false, undefined, e)
          throw e
        }
      }
    }
  })
}
