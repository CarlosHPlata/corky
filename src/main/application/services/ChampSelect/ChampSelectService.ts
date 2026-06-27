import type { ChampSelectRunes, ChampSelectState } from '@shared/types'
import type { LiveClientEvent, LiveClientGateway } from '../../ports/LiveClientGateway'
import { mapChampSelectSession } from '../../../domain/champSelect/session'

const CHAMP_SELECT_SESSION_URI = '/lol-champ-select/v1/session'
const PERKS_PAGE_URI = '/lol-perks/v1/currentpage'

export type ChampSelectListener = (state: ChampSelectState) => void

/** The state pushed/returned when not in champ select. */
const INACTIVE: ChampSelectState = {
  active: false,
  phase: '',
  timeLeftSec: 0,
  localPlayerCellId: -1,
  allies: [],
  enemies: [],
  bans: [],
  localRunes: null,
  build: null,
  matchup: null
}

/**
 * Champ-select facade (spec 007, slice 1) — mirrors `IdentityService`/
 * `LiveGameService`: framework-free, ports + domain only. It subscribes to the
 * LCU champ-select session feed via `LiveClientGateway`, maps each update into
 * the `ChampSelectState` DTO (+ the local player's own rune page), holds the
 * latest, and pushes it to its listener as picks/bans progress. A `Delete` event
 * (champ select ended) publishes the inactive state.
 *
 * Session events are serialized (they await a rune read) so a burst of updates
 * can't publish out of order. OP.GG `build`/`matchup` enrichment is slice 2.
 */
export class ChampSelectService {
  private state: ChampSelectState = INACTIVE
  private listenerFn: ChampSelectListener | null = null
  private unsubscribe: (() => void) | null = null
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly gateway: LiveClientGateway) {}

  /** Register the sink (the driving listener) that pushes state to the renderer. */
  setListener(cb: ChampSelectListener): void {
    this.listenerFn = cb
  }

  getState(): ChampSelectState {
    return this.state
  }

  start(): void {
    if (this.unsubscribe) return
    this.unsubscribe = this.gateway.subscribe(CHAMP_SELECT_SESSION_URI, (e) => this.enqueue(e))
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.state = INACTIVE
  }

  private enqueue(e: LiveClientEvent): Promise<void> {
    this.queue = this.queue
      .then(() => this.onSession(e))
      .catch((err) => console.error('ChampSelectService: session handling failed:', err))
    return this.queue
  }

  private async onSession(e: LiveClientEvent): Promise<void> {
    const mapped = e.eventType === 'Delete' ? null : mapChampSelectSession(e.data)
    if (!mapped) {
      if (this.state.active) this.publish(INACTIVE)
      return
    }
    mapped.localRunes = await this.readRunes()
    this.publish(mapped)
  }

  private publish(state: ChampSelectState): void {
    this.state = state
    this.listenerFn?.(state)
  }

  /** The local player's own selected rune page (others' runes are hidden). */
  private async readRunes(): Promise<ChampSelectRunes | null> {
    const page = (await this.gateway.get(PERKS_PAGE_URI)) as {
      primaryStyleId?: unknown
      subStyleId?: unknown
      selectedPerkIds?: unknown
    } | null
    if (!page) return null
    const ids = Array.isArray(page.selectedPerkIds)
      ? page.selectedPerkIds.filter((x): x is number => typeof x === 'number')
      : []
    return {
      primaryStyleId: typeof page.primaryStyleId === 'number' ? page.primaryStyleId : 0,
      subStyleId: typeof page.subStyleId === 'number' ? page.subStyleId : 0,
      selectedPerkIds: ids
    }
  }
}
