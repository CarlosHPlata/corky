// Clean, domain-friendly models for OP.GG responses. The raw MCP payloads are
// mapped onto these in OpggMcpClient so the rest of the app never sees MCP
// envelopes. Rates are normalized to 0..1.

export interface LaneMetaChampion {
  champion: string
  position: string
  winRate: number
  pickRate: number
  banRate: number
  /** OP.GG tier label (e.g. "1"/"2" or "S"/"A"). */
  tier: string
  avgKda?: number
  csPerMin?: number
  patch?: string
}

export interface ChampionAnalysis {
  champion: string
  position: string
  winRate: number
  pickRate: number
  patch?: string
}
