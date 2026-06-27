import { describe, it, expect, beforeEach } from 'vitest'
import type { ChampSelectState } from '@shared/types'
import type {
  LiveClientEvent,
  LiveClientGateway
} from '../../src/main/application/ports/LiveClientGateway'
import { ChampSelectService } from '../../src/main/application/services/ChampSelect/ChampSelectService'

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
  async fire(uri: string, data: unknown, eventType = 'Update'): Promise<void> {
    const set = this.handlers.get(uri)
    if (!set) return
    for (const h of set) await Promise.resolve(h({ uri, eventType, data }))
  }
  subscriberCount(uri: string): number {
    return this.handlers.get(uri)?.size ?? 0
  }
}

const SESSION_URI = '/lol-champ-select/v1/session'
const PERKS_URI = '/lol-perks/v1/currentpage'

const SESSION = {
  localPlayerCellId: 0,
  bans: { myTeamBans: [157], theirTeamBans: [], numBans: 2 },
  myTeam: [
    { cellId: 0, championId: 103, assignedPosition: 'middle', gameName: 'me', tagLine: 'EUW', spell1Id: 4, spell2Id: 14 }
  ],
  theirTeam: [{ cellId: 5, championId: 0, assignedPosition: '', gameName: '', tagLine: '', spell1Id: 0, spell2Id: 0 }],
  actions: [[{ actorCellId: 0, isInProgress: false, completed: true, type: 'pick' }]],
  timer: { adjustedTimeLeftInPhase: 27000, phase: 'BAN_PICK' }
}

function make() {
  const pushes: ChampSelectState[] = []
  const gw = new FakeGateway()
  const svc = new ChampSelectService(gw)
  svc.setListener((s) => pushes.push(s))
  return { pushes, gw, svc }
}

describe('ChampSelectService', () => {
  let pushes: ChampSelectState[]
  let gw: FakeGateway
  let svc: ChampSelectService

  beforeEach(() => {
    ;({ pushes, gw, svc } = make())
    svc.start()
  })

  it('subscribes to the champ-select session feed and starts inactive', () => {
    expect(gw.subscriberCount(SESSION_URI)).toBe(1)
    expect(svc.getState().active).toBe(false)
  })

  it('maps a session update, attaches the local rune page, and pushes the DTO', async () => {
    gw.responses.set(PERKS_URI, { primaryStyleId: 8200, subStyleId: 8300, selectedPerkIds: [8214, 8226] })
    await gw.fire(SESSION_URI, SESSION)

    expect(pushes).toHaveLength(1)
    const state = pushes[0]
    expect(state.active).toBe(true)
    expect(state.phase).toBe('BAN_PICK')
    expect(state.timeLeftSec).toBe(27)
    expect(state.allies[0]).toMatchObject({ championId: 103, isLocalPlayer: true })
    expect(state.bans).toEqual([{ championId: 157, team: 'ally' }])
    expect(state.localRunes).toEqual({
      primaryStyleId: 8200,
      subStyleId: 8300,
      selectedPerkIds: [8214, 8226]
    })
    expect(svc.getState()).toEqual(state)
  })

  it('tolerates an unreadable rune page (localRunes null)', async () => {
    await gw.fire(SESSION_URI, SESSION) // no perks response stubbed
    expect(pushes[0].localRunes).toBeNull()
    expect(pushes[0].active).toBe(true)
  })

  it('publishes the inactive state on a Delete event (champ select ended)', async () => {
    await gw.fire(SESSION_URI, SESSION)
    expect(svc.getState().active).toBe(true)
    await gw.fire(SESSION_URI, null, 'Delete')
    expect(svc.getState().active).toBe(false)
    expect(pushes.at(-1)?.active).toBe(false)
  })

  it('does not re-push inactive when already inactive', async () => {
    await gw.fire(SESSION_URI, null, 'Delete') // already inactive at start
    expect(pushes).toHaveLength(0)
  })

  it('stop() unsubscribes and resets to inactive', async () => {
    await gw.fire(SESSION_URI, SESSION)
    svc.stop()
    expect(gw.subscriberCount(SESSION_URI)).toBe(0)
    expect(svc.getState().active).toBe(false)
  })
})
