import { EventEmitter } from 'events'
import type { DomainEvent } from '../../domain/events'
import type { TelemetryEvent } from './telemetry'

/** Everything that can travel on the bus: business events + observability events. */
export type BusEvent = DomainEvent | TelemetryEvent

type Handler<K extends BusEvent['type']> = (
  event: Extract<BusEvent, { type: K }>
) => void | Promise<void>

class EventBus {
  private readonly emitter = new EventEmitter()

  emit(event: BusEvent): boolean {
    return this.emitter.emit(event.type, event)
  }

  on<K extends BusEvent['type']>(type: K, handler: Handler<K>): this {
    this.emitter.on(type, handler as (event: BusEvent) => void)
    return this
  }

  off<K extends BusEvent['type']>(type: K, handler: Handler<K>): this {
    this.emitter.off(type, handler as (event: BusEvent) => void)
    return this
  }
}

export const eventBus = new EventBus()
