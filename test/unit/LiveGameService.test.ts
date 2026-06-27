import { describe, it, expect, beforeEach } from 'vitest'
import type { DomainEvent } from '../../src/main/domain/events'
import type {
  LiveClientEvent,
  LiveClientGateway
} from '../../src/main/application/ports/LiveClientGateway'
import { LiveGameService } from '../../src/main/application/services/LiveGame/LiveGameService'

/** A controllable LiveClientGateway: drive `fire(uri, data)` to deliver an event
 *  to the subscribed handler, and stub `get(path)` responses for enrichment. */
class FakeGateway implements LiveClientGateway {
  started = false
  stopped = false
  private readonly handlers = new Map<string, Set<(e: LiveClientEvent) => void>>()
  responses = new Map<string, unknown>()

  start(): void {
    this.started = true
  }
  stop(): void {
    this.stopped = true
  }
  subscribe(uri: string, handler: (e: LiveClientEvent) => void): () => void {
    let set = this.handlers.get(uri)
    if (!set) {
      set = new Set()
      this.handlers.set(uri, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }
  async get(path: string): Promise<unknown | null> {
    return this.responses.has(path) ? this.responses.get(path) : null
  }

  /** Test helper: deliver an event and await the (async) handler chain. */
  async fire(uri: string, data: unknown, eventType = 'Update'): Promise<void> {
    const set = this.handlers.get(uri)
    if (!set) return
    for (const h of set) await Promise.resolve(h({ uri, eventType, data }))
  }

  subscriberCount(uri: string): number {
    return this.handlers.get(uri)?.size ?? 0
  }
}

const PHASE = '/lol-gameflow/v1/gameflow-phase'
const CHAMP = '/lol-champ-select/v1/session'
const GFSESSION = '/lol-gameflow/v1/session'

function make() {
  const events: DomainEvent[] = []
  const gw = new FakeGateway()
  const svc = new LiveGameService(gw, { emit: (e) => events.push(e) })
  return { events, gw, svc }
}

describe('LiveGameService', () => {
  let events: DomainEvent[]
  let gw: FakeGateway
  let svc: LiveGameService

  beforeEach(() => {
    ;({ events, gw, svc } = make())
    svc.start()
  })

  it('subscribes to the gameflow phase feed', () => {
    expect(gw.subscriberCount(PHASE)).toBe(1)
    // Champ-select session is owned by ChampSelectService now, not here.
    expect(gw.subscriberCount(CHAMP)).toBe(0)
  })

  it('emits ChampSelectEntered with the session id on entering ChampSelect', async () => {
    gw.responses.set(CHAMP, { id: '289b6ca6-a680-4359-85fc-4067c46d05a7', gameId: 7890544913 })
    await gw.fire(PHASE, 'ChampSelect')
    expect(events).toEqual([
      { type: 'ChampSelectEntered', sessionId: '289b6ca6-a680-4359-85fc-4067c46d05a7' }
    ])
  })

  it('emits ChampSelectEntered with an empty id when the session is unreadable', async () => {
    await gw.fire(PHASE, 'ChampSelect') // no stubbed response → get() returns null
    expect(events).toEqual([{ type: 'ChampSelectEntered', sessionId: '' }])
  })

  it('emits GameStarted, then GameEnded with the composed match id', async () => {
    gw.responses.set(GFSESSION, { gameData: { gameId: 4831234567 }, map: { platformId: 'EUW1' } })
    await gw.fire(PHASE, 'GameStart') // load phase — no event
    await gw.fire(PHASE, 'InProgress') // game live → GameStarted, caches match id
    await gw.fire(PHASE, 'WaitingForStats') // not a terminal phase
    await gw.fire(PHASE, 'EndOfGame') // → GameEnded with the cached id
    expect(events).toEqual([
      { type: 'GameStarted' },
      { type: 'GameEnded', matchId: 'EUW1_4831234567' }
    ])
  })

  it('uses the match id cached at game start even if the session is cleared by end', async () => {
    gw.responses.set(GFSESSION, { gameData: { gameId: 999 }, map: { platformId: 'NA1' } })
    await gw.fire(PHASE, 'InProgress')
    gw.responses.delete(GFSESSION) // client cleared its gameflow session
    await gw.fire(PHASE, 'EndOfGame')
    expect(events).toContainEqual({ type: 'GameEnded', matchId: 'NA1_999' })
  })

  it('acts only on transitions — a repeated ChampSelect payload does not re-fire', async () => {
    gw.responses.set(CHAMP, { id: 's1' })
    await gw.fire(PHASE, 'ChampSelect')
    await gw.fire(PHASE, 'ChampSelect')
    expect(events.filter((e) => e.type === 'ChampSelectEntered')).toHaveLength(1)
  })

  it('ignores unknown phase strings', async () => {
    await gw.fire(PHASE, 'TotallyNotAPhase')
    expect(events).toHaveLength(0)
  })

  it('does not re-fire GameStarted on an in-game reconnect', async () => {
    gw.responses.set(GFSESSION, { gameData: { gameId: 7 }, map: { platformId: 'EUW1' } })
    await gw.fire(PHASE, 'GameStart')
    await gw.fire(PHASE, 'InProgress')
    await gw.fire(PHASE, 'Reconnect') // dropped connection
    await gw.fire(PHASE, 'InProgress') // rejoined — must NOT fire a second GameStarted
    expect(events.filter((e) => e.type === 'GameStarted')).toHaveLength(1)
  })

  it('serializes interleaved phase events so GameEnded keeps the cached match id', async () => {
    gw.responses.set(GFSESSION, { gameData: { gameId: 555 }, map: { platformId: 'KR' } })
    // Fire both without awaiting the first — the serialized queue must still run
    // InProgress (which caches the id) fully before EndOfGame reads it.
    const p1 = gw.fire(PHASE, 'InProgress')
    const p2 = gw.fire(PHASE, 'EndOfGame')
    await Promise.all([p1, p2])
    expect(events).toEqual([
      { type: 'GameStarted' },
      { type: 'GameEnded', matchId: 'KR_555' }
    ])
  })

  it('cold start mid-game: a first InProgress still fires GameStarted', async () => {
    gw.responses.set(GFSESSION, { gameData: { gameId: 12 }, map: { platformId: 'NA1' } })
    await gw.fire(PHASE, 'InProgress') // prevPhase null → still a start
    expect(events).toEqual([{ type: 'GameStarted' }])
  })

  it('cold start at game end with no readable session → GameEnded with empty match id', async () => {
    await gw.fire(PHASE, 'EndOfGame') // no cached id, no stubbed session
    expect(events).toEqual([{ type: 'GameEnded', matchId: '' }])
  })

  it('a partial gameflow session yields an empty match id, never a malformed one', async () => {
    gw.responses.set(GFSESSION, { gameData: { gameId: 0 }, map: {} }) // gameId 0, no platformId
    await gw.fire(PHASE, 'InProgress')
    await gw.fire(PHASE, 'EndOfGame')
    expect(events).toContainEqual({ type: 'GameEnded', matchId: '' })
  })

  it('stop() unsubscribes its handlers (gateway lifecycle is owned elsewhere)', async () => {
    svc.stop()
    expect(gw.subscriberCount(PHASE)).toBe(0)
    gw.responses.set(CHAMP, { id: 's1' })
    await gw.fire(PHASE, 'ChampSelect') // no subscribers → nothing happens
    expect(events).toHaveLength(0)
  })
})
