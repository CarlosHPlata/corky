import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { observed } from '../../src/main/infrastructure/observe'
import { eventBus, type BusEvent } from '../../src/main/application/events/EventBus'
import type { AppCallEvent, OutboundCallEvent } from '../../src/main/application/events/telemetry'

class FakeUseCase {
  calls = 0
  execute(a: number, b: number): number {
    this.calls++
    return a + b
  }
  async executeAsync(x: string): Promise<string> {
    return `hi ${x}`
  }
  async boom(): Promise<never> {
    throw new Error('kaput')
  }
  boomSync(): never {
    throw new Error('sync kaput')
  }
}

describe('observed (telemetry interceptor)', () => {
  const appEvents: AppCallEvent[] = []
  const outEvents: OutboundCallEvent[] = []
  const onApp = (e: AppCallEvent): void => void appEvents.push(e)
  const onOut = (e: OutboundCallEvent): void => void outEvents.push(e)

  beforeEach(() => {
    appEvents.length = 0
    outEvents.length = 0
    eventBus.on('telemetry.app', onApp)
    eventBus.on('telemetry.outbound', onOut)
  })
  afterEach(() => {
    eventBus.off('telemetry.app', onApp)
    eventBus.off('telemetry.outbound', onOut)
  })

  it('passes sync calls through untouched and emits an app event', () => {
    const wrapped = observed(new FakeUseCase(), { layer: 'app', name: 'Fake' })
    expect(wrapped.execute(2, 3)).toBe(5)
    expect(appEvents).toHaveLength(1)
    expect(appEvents[0]).toMatchObject({ name: 'Fake', method: 'execute', ok: true })
  })

  it('preserves `this` so internal state still mutates on the raw instance', () => {
    const raw = new FakeUseCase()
    const wrapped = observed(raw, { layer: 'app', name: 'Fake' })
    wrapped.execute(1, 1)
    wrapped.execute(1, 1)
    expect(raw.calls).toBe(2)
  })

  it('awaits async calls, returns the value, and emits ok with a result preview (outbound)', async () => {
    const wrapped = observed(new FakeUseCase(), { layer: 'outbound', target: 'riot-api', name: 'Fake' })
    await expect(wrapped.executeAsync('there')).resolves.toBe('hi there')
    expect(outEvents).toHaveLength(1)
    expect(outEvents[0]).toMatchObject({
      target: 'riot-api',
      method: 'executeAsync',
      ok: true,
      preview: 'hi there'
    })
    expect(outEvents[0].args).toContain('there')
  })

  it('emits ok=false with the error message on async rejection, and still rethrows', async () => {
    const wrapped = observed(new FakeUseCase(), { layer: 'app', name: 'Fake' })
    await expect(wrapped.boom()).rejects.toThrow('kaput')
    expect(appEvents[0]).toMatchObject({ method: 'boom', ok: false, error: 'kaput' })
  })

  it('emits ok=false on sync throw, and still rethrows', () => {
    const wrapped = observed(new FakeUseCase(), { layer: 'app', name: 'Fake' })
    expect(() => wrapped.boomSync()).toThrow('sync kaput')
    expect(appEvents[0]).toMatchObject({ method: 'boomSync', ok: false })
  })

  it('leaves non-function properties readable through the proxy', () => {
    const wrapped = observed(new FakeUseCase(), { layer: 'app', name: 'Fake' })
    expect(wrapped.calls).toBe(0)
  })
})

describe('eventBus typing smoke test', () => {
  it('routes events by their type field', () => {
    const got: BusEvent[] = []
    const h = (e: BusEvent): void => void got.push(e)
    eventBus.on('telemetry.discovery.fetch', h)
    eventBus.emit({ type: 'telemetry.discovery.fetch', kind: 'benchmark', source: 'opgg-mcp', ok: true, lines: ['BENCH x'] })
    eventBus.off('telemetry.discovery.fetch', h)
    expect(got).toHaveLength(1)
  })
})
