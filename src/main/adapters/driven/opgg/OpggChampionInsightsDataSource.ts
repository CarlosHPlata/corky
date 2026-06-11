import type {
  ChampionInsightsDataSource,
  ChampionBuildInsight,
  LaneMatchupInsight
} from '../../../application/ports/ChampionInsightsDataSource'
import type { OpggMcpClient } from './OpggMcpClient'

function canonicalRole(role: string): string {
  const r = role.toLowerCase()
  if (r.startsWith('mid')) return 'MID'
  if (r.startsWith('top')) return 'TOP'
  if (r.startsWith('jun') || r === 'jng') return 'JUNGLE'
  if (r.startsWith('bot') || r === 'adc' || r.includes('carry')) return 'ADC'
  if (r.startsWith('sup') || r === 'utility') return 'SUPPORT'
  return r.toUpperCase()
}

/**
 * Tier-2 adapter: resolves champion build and lane matchup insights by
 * delegating to the reusable OpggMcpClient. Best-effort — null on any failure.
 */
export class OpggChampionInsightsDataSource implements ChampionInsightsDataSource {
  constructor(private readonly client: OpggMcpClient) {}

  async getChampionBuild(input: { champion: string; role: string }): Promise<ChampionBuildInsight | null> {
    return this.client
      .getChampionBuild({ champion: input.champion, position: canonicalRole(input.role) })
      .catch(() => null)
  }

  async getLaneMatchup(input: {
    champion: string
    role: string
    opponent: string
  }): Promise<LaneMatchupInsight | null> {
    return this.client
      .getLaneMatchupGuide({
        champion: input.champion,
        opponent: input.opponent,
        position: canonicalRole(input.role)
      })
      .catch(() => null)
  }
}
