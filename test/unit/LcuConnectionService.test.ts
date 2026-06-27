import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  LcuConnectionService,
  type LcuConnectionState,
  type LcuConnectionTimings
} from '../../src/main/adapters/driven/lcu/LcuConnectionService'
import type { LockfileInfo } from '../../src/main/domain/identity/lockfile'

const info = (port = 5000, password = 'pw'): LockfileInfo => ({
  name: 'LeagueClient',
  pid: 1,
  port,
  password,
  protocol: 'https'
})

// Short timings so fake-timer advances are explicit and fast.
const TIMINGS: LcuConnectionTimings = { downPollMs: 100, startingPingMs: 50, upHeartbeatMs: 200 }

/** A controllable stand-in for the lockfile + API: mutate `lockfile`/`pingOk`
 *  between clock advances to simulate the client coming up, going down, etc. */
function makeProbe() {
  const ctl = { lockfile: null as LockfileInfo | null, pingOk: false }
  return {
    ctl,
    readLockfile: async (): Promise<LockfileInfo | null> => ctl.lockfile,
    ping: async (): Promise<boolean> => ctl.pingOk
  }
}

function track(svc: LcuConnectionService): LcuConnectionState[] {
  const seen: LcuConnectionState[] = []
  svc.subscribe((s) => seen.push(s))
  return seen
}

describe('LcuConnectionService', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('with no client, stays down and never emits', async () => {
    const probe = makeProbe()
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    await vi.advanceTimersByTimeAsync(500)
    expect(svc.current().status).toBe('down')
    expect(seen).toHaveLength(0)
  })

  it('lockfile present + API up → goes straight to up with the lockfile info', async () => {
    const probe = makeProbe()
    probe.ctl.lockfile = info()
    probe.ctl.pingOk = true
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(svc.current()).toEqual({ status: 'up', info: info() })
    expect(seen.map((s) => s.status)).toEqual(['up'])
  })

  it('startup window: lockfile present but API not ready → starting, then up when it answers', async () => {
    const probe = makeProbe()
    probe.ctl.lockfile = info()
    probe.ctl.pingOk = false // API still booting
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(svc.current().status).toBe('starting')

    probe.ctl.pingOk = true // API comes alive
    await vi.advanceTimersByTimeAsync(TIMINGS.startingPingMs)
    expect(svc.current().status).toBe('up')
    expect(seen.map((s) => s.status)).toEqual(['starting', 'up'])
  })

  it('client closes while up → transitions to down', async () => {
    const probe = makeProbe()
    probe.ctl.lockfile = info()
    probe.ctl.pingOk = true
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(svc.current().status).toBe('up')

    probe.ctl.lockfile = null // client closed
    await vi.advanceTimersByTimeAsync(TIMINGS.upHeartbeatMs)
    expect(svc.current().status).toBe('down')
    expect(seen.map((s) => s.status)).toEqual(['up', 'down'])
  })

  it('an API blip while up drops to starting, then recovers to up', async () => {
    const probe = makeProbe()
    probe.ctl.lockfile = info()
    probe.ctl.pingOk = true
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    await vi.advanceTimersByTimeAsync(1)

    probe.ctl.pingOk = false // transient unreachable, lockfile still present
    await vi.advanceTimersByTimeAsync(TIMINGS.upHeartbeatMs)
    expect(svc.current().status).toBe('starting')

    probe.ctl.pingOk = true
    await vi.advanceTimersByTimeAsync(TIMINGS.startingPingMs)
    expect(svc.current().status).toBe('up')
    expect(seen.map((s) => s.status)).toEqual(['up', 'starting', 'up'])
  })

  it('a client restart (new port) while up re-emits up with the fresh credentials', async () => {
    const probe = makeProbe()
    probe.ctl.lockfile = info(5000)
    probe.ctl.pingOk = true
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    await vi.advanceTimersByTimeAsync(1)

    probe.ctl.lockfile = info(6000) // relaunched on a new port
    await vi.advanceTimersByTimeAsync(TIMINGS.upHeartbeatMs)
    expect(seen.map((s) => s.status)).toEqual(['up', 'up'])
    expect(seen[1]).toEqual({ status: 'up', info: info(6000) })
  })

  it('stop() halts the loop — no further probing or emissions', async () => {
    const probe = makeProbe()
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    await vi.advanceTimersByTimeAsync(1)
    svc.stop()

    probe.ctl.lockfile = info()
    probe.ctl.pingOk = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(seen).toHaveLength(0)
    expect(svc.current().status).toBe('down')
  })

  it('unsubscribe stops delivery but the loop keeps tracking state', async () => {
    const probe = makeProbe()
    probe.ctl.lockfile = info()
    probe.ctl.pingOk = true
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen: LcuConnectionState[] = []
    const off = svc.subscribe((s) => seen.push(s))
    off()
    svc.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(seen).toHaveLength(0)
    expect(svc.current().status).toBe('up')
  })

  it('start() is idempotent', async () => {
    const probe = makeProbe()
    probe.ctl.lockfile = info()
    probe.ctl.pingOk = true
    const svc = new LcuConnectionService(probe, TIMINGS)
    const seen = track(svc)
    svc.start()
    svc.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(seen.map((s) => s.status)).toEqual(['up'])
  })
})
