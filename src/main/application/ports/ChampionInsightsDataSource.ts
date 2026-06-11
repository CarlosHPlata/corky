/**
 * Driven port: rich champion insights for the coaching chat discovery step.
 * Implemented by an adapter that delegates to the reusable OpggMcpClient.
 * Every method is best-effort — null means unavailable, never throws.
 */

export interface ChampionBuildInsight {
  champion: string
  position: string
  patch?: string
  /** Ordered core item names from the highest-games build. */
  coreItems: string[]
  /** Starting item names. */
  startItems: string[]
  /** Keystone rune name, e.g. "Summon Aery". */
  keystone: string
  /** Primary rune tree name, e.g. "Sorcery". */
  primaryTree: string
  /** Secondary rune tree name, e.g. "Domination". */
  secondaryTree?: string
  /** Skill leveling priority, e.g. "Q > E > W". */
  skillOrder?: string
  /** Summoner spell names, e.g. ["Flash", "Ignite"]. */
  summonerSpells?: string[]
}

export interface LaneMatchupInsight {
  champion: string
  opponent: string
  position: string
  /** Difficulty label, e.g. "Hard". */
  difficulty?: string
  /** Coaching tips for this matchup (up to 5). */
  tips: string[]
  /** Recommended counter items (up to 4). */
  counterItems?: string[]
}

export interface ChampionInsightsDataSource {
  /** Optimal build, runes and skill order for a champion/role this patch. */
  getChampionBuild(input: { champion: string; role: string }): Promise<ChampionBuildInsight | null>
  /** OP.GG lane matchup guide for champion vs a specific opponent. */
  getLaneMatchup(input: {
    champion: string
    role: string
    opponent: string
  }): Promise<LaneMatchupInsight | null>
}
