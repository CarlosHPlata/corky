import type { BenchmarkDataSource } from '../../../application/ports/BenchmarkDataSource'
import type { BenchmarkReference } from '../../../domain/benchmark'
import { resolveGeneralBenchmark } from '../../../domain/benchmark'
import type { OpggMcpClient } from './OpggMcpClient'

/** Map varied role/position spellings to a single canonical bucket for matching. */
function canonicalRole(role: string): string {
  const r = role.toLowerCase()
  if (r.startsWith('mid')) return 'MID'
  if (r.startsWith('top')) return 'TOP'
  if (r.startsWith('jun') || r === 'jng') return 'JUNGLE'
  if (r.startsWith('bot') || r === 'adc' || r.includes('carry')) return 'BOT'
  if (r.startsWith('sup') || r === 'utility') return 'SUPPORT'
  return r.toUpperCase()
}

const ROLE_TO_OPGG_POSITION: Record<string, string> = {
  MID: 'MID',
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  BOT: 'ADC',
  SUPPORT: 'SUPPORT'
}

/**
 * Tier-2 adapter: answers Quick Analysis's benchmark question by delegating to
 * the reusable OpggMcpClient. Uses the general per-rank numbers as a base and
 * enriches them with the champion's current meta standing (and CS reference when
 * present). Returns null only on a hard miss so the caller falls back.
 */
export class OpggBenchmarkDataSource implements BenchmarkDataSource {
  constructor(private readonly client: OpggMcpClient) {}

  async getChampionBenchmark(input: {
    champion: string
    role: string
    tier: string | null
  }): Promise<BenchmarkReference | null> {
    const base = resolveGeneralBenchmark(input.tier)
    const wantRole = canonicalRole(input.role)

    // Primary: lane-meta carries win/pick/ban/tier (and sometimes KDA / CS).
    const lane = await this.client.getLaneMeta().catch(() => null)
    if (lane) {
      const entry =
        lane.find((c) => c.champion.toLowerCase() === input.champion.toLowerCase() && canonicalRole(c.position) === wantRole) ??
        lane.find((c) => c.champion.toLowerCase() === input.champion.toLowerCase())
      if (entry) {
        return {
          basis: 'champion_patch',
          csPerMin: entry.csPerMin ?? base.csPerMin,
          deathsCeiling: base.deathsCeiling,
          patch: entry.patch,
          topChampStanding: {
            champion: entry.champion,
            role: input.role,
            winRate: entry.winRate,
            tier: entry.tier,
            patch: entry.patch ?? ''
          }
        }
      }
    }

    // Secondary: champion analysis (win/pick rates) when lane-meta lacked the champ.
    const position = ROLE_TO_OPGG_POSITION[wantRole] ?? wantRole
    const analysis = await this.client.getChampionAnalysis({ champion: input.champion, position }).catch(() => null)
    if (analysis) {
      return {
        basis: 'champion_patch',
        csPerMin: base.csPerMin,
        deathsCeiling: base.deathsCeiling,
        patch: analysis.patch,
        topChampStanding: {
          champion: analysis.champion,
          role: input.role,
          winRate: analysis.winRate,
          tier: '',
          patch: analysis.patch ?? ''
        }
      }
    }

    return null
  }
}
