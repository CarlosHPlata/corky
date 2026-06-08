import { EventEmitter } from 'events'
import type { DomainEvent } from '../../domain/events'

type Handler<T extends DomainEvent> = (event: T) => void | Promise<void>

class EventBus {
  private readonly emitter = new EventEmitter()

  emit<T extends DomainEvent>(event: T): boolean {
    return this.emitter.emit(event.type, event)
  }

  on<T extends DomainEvent>(type: T['type'], handler: Handler<T>): this {
    this.emitter.on(type, handler as (event: DomainEvent) => void)
    return this
  }
}

export const eventBus = new EventBus()
