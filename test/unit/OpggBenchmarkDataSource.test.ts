import { describe, it, expect } from 'vitest'
import { OpggBenchmarkDataSource } from '../../src/main/adapters/driven/opgg/OpggBenchmarkDataSource'
import { OpggMcpClient, type RawToolCall } from '../../src/main/adapters/driven/opgg/OpggMcpClient'
import { resolveGeneralBenchmark } from '../../src/main/domain/benchmark'

const laneRaw = {
  patch: '26.11',
  data: [{ champion: 'Ahri', position: 'MID', win_rate: 51.2, tier: '2', cs_per_min: 7.4 }]
}

function sourceFrom(raw: RawToolCall): OpggBenchmarkDataSource {
  return new OpggBenchmarkDataSource(new OpggMcpClient(raw))
}

describe('OpggBenchmarkDataSource', () => {
  it('maps a matching champion to a champion_patch benchmark with meta standing', async () => {
    const src = sourceFrom(async () => laneRaw)
    const ref = await src.getChampionBenchmark({ champion: 'Ahri', role: 'Mid', tier: 'PLATINUM' })
    expect(ref?.basis).toBe('champion_patch')
    expect(ref?.csPerMin).toBe(7.4) // from OP.GG, not the general fallback
    expect(ref?.patch).toBe('26.11')
    expect(ref?.topChampStanding?.tier).toBe('2')
    expect(ref?.topChampStanding?.winRate).toBeCloseTo(0.512)
    // deaths ceiling still comes from the rank base
    expect(ref?.deathsCeiling).toBe(resolveGeneralBenchmark('PLATINUM').deathsCeiling)
  })

  it('returns null when OP.GG has no data, so the caller falls back to general', async () => {
    const src = sourceFrom(async () => null)
    const ref = await src.getChampionBenchmark({ champion: 'Ahri', role: 'Mid', tier: 'GOLD' })
    expect(ref).toBeNull()
  })

  it('returns null for a champion not present in the meta', async () => {
    const src = sourceFrom(async () => laneRaw)
    const ref = await src.getChampionBenchmark({ champion: 'Zed', role: 'Mid', tier: 'GOLD' })
    expect(ref).toBeNull()
  })
})
