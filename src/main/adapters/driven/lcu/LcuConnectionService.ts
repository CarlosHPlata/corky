import type { LockfileInfo } from '../../../domain/identity/lockfile'

/**
 * Shared LCU connection observer (spec 007) — the single source of truth for
 * "is the local League client API reachable?". Every client-aware feature
 * (identity today; champ-select / live-feed next) rides this one instance
 * instead of polling the lockfile + pinging the API independently.
 *
 * The lifecycle it models is exactly `lockfile → startup → API ready`:
 *
 *   down      — no lockfile (client not running)
 *   starting  — lockfile present, but the API isn't answering YET (the startup
 *               window: the client writes the lockfile a beat before its loopback
 *               port is live, so a present file does NOT mean the API is up)
 *   up        — lockfile present AND the API responded → carries the LockfileInfo
 *
 * It self-schedules a single probe loop with a state-dependent cadence: a cheap
 * lockfile poll while down, a FAST ping retry while starting (so the up edge is
 * caught ~instantly instead of on a slow fixed interval), and a slow heartbeat
 * while up (to notice the client closing). Consumers `subscribe` to transitions.
 *
 * Pure orchestration over two injected probes (`readLockfile`, `ping`) — no fs
 * or http here, so the state machine is unit-testable with fakes + fake timers.
 * The lockfile password lives in `LockfileInfo` and never leaves the main
 * process (Principle VI); only adapters consume this, never the renderer.
 */
export type LcuConnectionState =
  | { status: 'down' }
  | { status: 'starting'; info: LockfileInfo }
  | { status: 'up'; info: LockfileInfo }

export interface LcuConnectionProbe {
  /** Locate + read the lockfile, or null when no client is running. */
  readLockfile(): Promise<LockfileInfo | null>
  /** True when the API answered (any HTTP response); false on refused/timeout. */
  ping(info: LockfileInfo): Promise<boolean>
}

export interface LcuConnectionTimings {
  /** Lockfile poll cadence while down (default 2500ms). */
  downPollMs: number
  /** API ping retry cadence during the startup window (default 700ms). */
  startingPingMs: number
  /** Heartbeat cadence while up, to detect the client closing (default 15000ms). */
  upHeartbeatMs: number
}

const DEFAULT_TIMINGS: LcuConnectionTimings = {
  downPollMs: 2500,
  startingPingMs: 700,
  upHeartbeatMs: 15_000
}

/** Two states are "the same" (no transition emitted) when status matches AND, for
 *  starting/up, they point at the same client (port+password). A port change
 *  while up means the client restarted — that IS a transition, so consumers
 *  reconnect against the fresh credentials. */
function sameState(a: LcuConnectionState, b: LcuConnectionState): boolean {
  if (a.status !== b.status) return false
  if (a.status === 'down' || b.status === 'down') return a.status === b.status
  return a.info.port === b.info.port && a.info.password === b.info.password
}

export class LcuConnectionService {
  private state: LcuConnectionState = { status: 'down' }
  private readonly subs = new Set<(s: LcuConnectionState) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private ticking = false

  constructor(
    private readonly probe: LcuConnectionProbe,
    private readonly timings: LcuConnectionTimings = DEFAULT_TIMINGS
  ) {}

  /** The last observed state (synchronous). Consumers read this on subscribe to
   *  pick up an already-established connection. */
  current(): LcuConnectionState {
    return this.state
  }

  /** Subscribe to STABLE transitions (down/starting/up, or a client swap while
   *  up). Does not fire on subscribe — read `current()` for the initial state. */
  subscribe(onChange: (s: LcuConnectionState) => void): () => void {
    this.subs.add(onChange)
    return () => {
      this.subs.delete(onChange)
    }
  }

  /** Begin the probe loop. Idempotent — a second call while running is a no-op. */
  start(): void {
    if (this.running) return
    this.running = true
    this.schedule(0) // first probe ASAP
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule(delayMs: number): void {
    if (!this.running) return
    this.timer = setTimeout(() => void this.tick(), delayMs)
  }

  private async tick(): Promise<void> {
    if (!this.running || this.ticking) return
    this.ticking = true
    try {
      const next = await this.probeOnce()
      if (!this.running) return // stopped mid-probe — drop the result
      this.transition(next)
      this.schedule(this.delayFor(this.state.status))
    } finally {
      this.ticking = false
    }
  }

  private async probeOnce(): Promise<LcuConnectionState> {
    const info = await this.probe.readLockfile()
    if (!info) return { status: 'down' }
    // Lockfile present — confirm the API is actually serving before reporting up.
    const ok = await this.probe.ping(info)
    return ok ? { status: 'up', info } : { status: 'starting', info }
  }

  private transition(next: LcuConnectionState): void {
    if (sameState(this.state, next)) return
    this.state = next
    for (const cb of this.subs) cb(next)
  }

  private delayFor(status: LcuConnectionState['status']): number {
    switch (status) {
      case 'down':
        return this.timings.downPollMs
      case 'starting':
        return this.timings.startingPingMs
      case 'up':
        return this.timings.upHeartbeatMs
    }
  }
}
