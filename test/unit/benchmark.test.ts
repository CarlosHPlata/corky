import { describe, it, expect } from 'vitest'
import { resolveGeneralBenchmark, GENERAL_BENCHMARKS } from '../../src/main/domain/benchmark'

describe('resolveGeneralBenchmark', () => {
  it('returns the per-tier reference tagged as general', () => {
    const b = resolveGeneralBenchmark('PLATINUM')
    expect(b.basis).toBe('general')
    expect(b.csPerMin).toBe(GENERAL_BENCHMARKS.PLATINUM.csPerMin)
    expect(b.deathsCeiling).toBe(GENERAL_BENCHMARKS.PLATINUM.deathsCeiling)
  })

  it('is case-insensitive on the tier code', () => {
    expect(resolveGeneralBenchmark('bronze').csPerMin).toBe(GENERAL_BENCHMARKS.BRONZE.csPerMin)
  })

  it('falls back to a neutral default for unknown/null tiers', () => {
    const unknown = resolveGeneralBenchmark(null)
    expect(unknown.basis).toBe('general')
    expect(unknown.csPerMin).toBeGreaterThan(0)
    expect(unknown.deathsCeiling).toBeGreaterThan(0)
    expect(resolveGeneralBenchmark('WOOD').csPerMin).toBe(unknown.csPerMin)
  })

  it('scales the cs/min reference upward with rank', () => {
    expect(resolveGeneralBenchmark('IRON').csPerMin).toBeLessThan(resolveGeneralBenchmark('DIAMOND').csPerMin)
  })
})
