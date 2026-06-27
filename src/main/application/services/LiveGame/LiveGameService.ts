import type { DomainEvent } from '../../../domain/events'
import type { LiveClientEvent, LiveClientGateway } from '../../ports/LiveClientGateway'
import {
  coercePhase,
  decidePhaseEvent,
  type GameflowPhase
} from '../../../domain/gameflow/gameflowPhase'

/** LCU endpoints this service listens to / reads. */
const GAMEFLOW_PHASE_URI = '/lol-gameflow/v1/gameflow-phase'
const CHAMP_SELECT_SESSION_URI = '/lol-champ-select/v1/session'
const GAMEFLOW_SESSION_URI = '/lol-gameflow/v1/session'

export interface LiveGameServiceOptions {
  /** Sink for the domain events this service raises (wired to the event bus). */
  emit: (event: DomainEvent) => void
}

/**
 * Live-game orchestration facade (spec 007), mirroring `IdentityService`:
 * command/query-free, framework-free (ports + domain only). It subscribes to
 * the LCU gameflow phase + champ-select session via `LiveClientGateway` and
 * translates phase TRANSITIONS into domain events on the bus —
 * `ChampSelectEntered`, `GameStarted`, `GameEnded` — which downstream handlers
 * (champ-select advice, the post-game pipeline) will consume later.
 *
 * Backend wiring only: no UI, no renderer push. The champ-select session topic
 * is subscribed now (so the feed is "heard" and the transport's multi-topic
 * design is exercised) but has no consumer yet.
 */
export class LiveGameService {
  private prevPhase: GameflowPhase | null = null
  /** Captured when the game goes live so `GameEnded` carries a match id even
   *  after the client clears its gameflow session. */
  private currentMatchId: string | null = null
  private unsubscribers: Array<() => void> = []
  private running = false
  /** Phase handling is async (it awaits REST enrichment), but the LCU can emit
   *  transitions back-to-back. Serialize handlers on a single chain so each
   *  transition fully completes before the next runs — otherwise an in-flight
   *  `GameStarted` enrichment could interleave with `GameEnded` and lose/poison
   *  the cached match id. */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly gateway: LiveClientGateway,
    private readonly opts: LiveGameServiceOptions
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    // Gameflow phase only — the champ-select session feed is owned by
    // ChampSelectService (spec 007). Both share one gateway whose lifecycle the
    // composition root owns, so this only registers its subscription.
    this.unsubscribers.push(this.gateway.subscribe(GAMEFLOW_PHASE_URI, (e) => this.enqueuePhase(e)))
  }

  stop(): void {
    this.running = false
    for (const unsub of this.unsubscribers) unsub()
    this.unsubscribers = []
    this.prevPhase = null
    this.currentMatchId = null
  }

  /** Append phase handling to the serialized chain. Returns the chain tail so a
   *  caller (or test) can await settlement; the gateway ignores the return. */
  private enqueuePhase(e: LiveClientEvent): Promise<void> {
    this.queue = this.queue
      .then(() => this.onPhase(e))
      .catch((err) => console.error('LiveGameService: phase handling failed:', err))
    return this.queue
  }

  private async onPhase(e: LiveClientEvent): Promise<void> {
    if (!this.running) return
    const phase = coercePhase(e.data)
    if (!phase) return
    const transition = decidePhaseEvent(this.prevPhase, phase)
    this.prevPhase = phase
    if (!transition) return

    // Re-check `running` after each awaited enrichment so a teardown mid-flight
    // never emits onto the bus after stop().
    if (transition === 'champSelect') {
      const sessionId = await this.readChampSelectSessionId()
      if (this.running) this.opts.emit({ type: 'ChampSelectEntered', sessionId })
    } else if (transition === 'gameStarted') {
      const matchId = await this.readMatchId()
      if (!this.running) return
      this.currentMatchId = matchId
      this.opts.emit({ type: 'GameStarted' })
    } else if (transition === 'gameEnded') {
      const matchId = this.currentMatchId ?? (await this.readMatchId()) ?? ''
      if (!this.running) return
      this.currentMatchId = null
      this.opts.emit({ type: 'GameEnded', matchId })
    }
  }

  private async readChampSelectSessionId(): Promise<string> {
    const session = (await this.gateway.get(CHAMP_SELECT_SESSION_URI)) as { id?: unknown } | null
    return session && typeof session.id === 'string' ? session.id : ''
  }

  /** Compose the Riot Web API match id from the gameflow session:
   *  `{map.platformId}_{gameData.gameId}` (platformId lives on `map`, not gameData). */
  private async readMatchId(): Promise<string | null> {
    const session = (await this.gateway.get(GAMEFLOW_SESSION_URI)) as
      | { gameData?: { gameId?: unknown }; map?: { platformId?: unknown } }
      | null
    const gameId = session?.gameData?.gameId
    const platformId = session?.map?.platformId
    if (typeof gameId === 'number' && gameId > 0 && typeof platformId === 'string' && platformId) {
      return `${platformId}_${gameId}`
    }
    return null
  }
}
