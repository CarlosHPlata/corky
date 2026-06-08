import { EventEmitter } from 'events'
import type { DomainEvent } from '../../domain/events'

type Handler<T extends DomainEvent> = (event: T) => void | Promise<void>

class EventBus extends EventEmitter {
  emit<T extends DomainEvent>(event: T): boolean {
    return super.emit(event.type, event)
  }

  on<T extends DomainEvent>(type: T['type'], handler: Handler<T>): this {
    return super.on(type, handler as (event: DomainEvent) => void)
  }
}

export const eventBus = new EventBus()
