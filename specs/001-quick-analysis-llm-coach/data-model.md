# Phase 1 Data Model: Quick Analysis — LLM Session Coach

All types are TypeScript. Renderer-facing DTOs live in `src/shared/types.ts`. Domain/internal types live in `src/main/domain/`. No new persisted (SQLite) entities — session analysis is ephemeral (FR-021); benchmark cache is in-memory.

---

## Shared DTOs (`src/shared/types.ts`) — cross IPC boundary

### `SessionInsight`
One unit of coaching. Maps directly onto the existing Quick Analysis insight row (icon / headline / body / evidence chip).

| Field | Type | Notes |
|---|---|---|
| `leak` | `'deaths' \| 'farming' \| 'lead_conversion' \| 'champion_pool' \| 'consistency' \| 'tempo'` | Category → drives the row icon/tone in the renderer |
| `headline` | `string` | The flaw, blunt and short (FR-004) |
| `body` | `string` | Why it costs LP at this rank + the concrete next-game action |
| `evidence` | `string` | Chip text drawn from computed signals, e.g. `"avgKDA 3.1 · 38% WR"` (FR-006; Constitution II) |
| `benchmarkBasis` | `'champion_patch' \| 'rank_general' \| 'general' \| null` | Reference basis when a benchmark is cited (FR-011, SC-004); `null` when no benchmark applies |
| `confidence` | `'established' \| 'provisional'` | `provisional` when < 3 supporting games (Constitution III, FR-014) |

**Validation**: `headline` and `body` non-empty; `leak` ∈ enum; an insight whose `body` merely restates a visible headline stat is a defect (SC-002, enforced by prompt + review, not type system).

### `SessionAnalysis`
The full result returned to the renderer.

| Field | Type | Notes |
|---|---|---|
| `insights` | `SessionInsight[]` | 0–4; target 2–3, impact-ordered (FR-003). Empty iff `noData` or honest "nothing firm to say" |
| `noData` | `boolean` | `true` when there are no/too-few games to analyze (FR-015) → renderer shows "needs games" |
| `benchmarkBasisUsed` | `'champion_patch' \| 'rank_general' \| 'general'` | Overall basis actually used for the run (transparency, SC-004) |
| `generatedAt` | `number` | epoch ms (stamped in main) |
| `model` | `string` | model id used (provenance) |

**State note**: idle / running / done / error are **renderer** states (managed by `useQuickAnalysis`), not part of the DTO. The backend returns `SessionAnalysis` on success or throws (→ renderer error state, FR-017).

### `IpcApi` addition
```ts
getSessionAnalysis: () => Promise<SessionAnalysis>
```

---

## Domain types (`src/main/domain/`) — never cross IPC, never imported by renderer

### `sessionFeatures.ts`

```ts
export interface GameLine {            // compact per-game row for the model
  champion: string; role: string; win: boolean
  kills: number; deaths: number; assists: number
  csPerMin: number; durationMin: number; ageHint: string   // e.g. "2h ago"
}

export interface PoolEntry {
  champion: string; role: string; games: number; wins: number
  winRate: number; avgKda: number; avgCsPerMin: number
  metaStanding?: ChampionMetaStanding   // present only if benchmark carried it
}

export interface SessionFeatures {
  rank: { tier: string; division: string; leaguePoints: number } | null
  gameCount: number
  deathsPerGame: number
  deathsPerGameInWins: number
  deathsPerGameInLosses: number
  avgCsPerMin: number
  csBenchmark: number                  // resolved target
  csGapVsBenchmark: number             // avgCsPerMin - csBenchmark (signed)
  deathsBenchmark: number              // healthy ceiling for rank
  avgKda: number
  winRate: number
  leadConversionConcern: boolean       // healthy KDA but poor win rate
  pool: PoolEntry[]
  poolShape: { championCount: number; topChampShare: number; winRateSpread: number }
  lp: { netSession: number | null; choppy: boolean }   // netSession null when tier/div crossed
  games: GameLine[]
  benchmarkBasis: BenchmarkBasis
}

export function computeSessionFeatures(input: {
  matches: MatchSummary[]
  profile: SummonerProfile | null
  lpHistory: LpSnapshot[]
  benchmark: BenchmarkReference        // resolved (champion/patch or general)
}): SessionFeatures
```

**Purity & rules**: no I/O; deterministic; tolerant of empty/short inputs (returns `gameCount` so the query can decide `noData`). Re-uses the Home screen's session-LP guard (net is `null` when first/last snapshot differ in tier/division). Table-tested against fixtures (Constitution V).

### `benchmark.ts`

```ts
export type BenchmarkBasis = 'champion_patch' | 'rank_general' | 'general'

export interface ChampionMetaStanding {
  champion: string; role: string
  winRate: number; tier: string        // e.g. "S", "A", "B"... from OP.GG
  patch: string
}

export interface BenchmarkReference {
  basis: BenchmarkBasis
  csPerMin: number
  deathsCeiling: number
  patch?: string
  topChampStanding?: ChampionMetaStanding
}

// Documented fallback table (R3). Tagged 'general' when used.
export const GENERAL_BENCHMARKS: Record<string /*tier*/, { csPerMin: number; deathsCeiling: number }>

// Pure: pick general numbers for a rank, optionally enriched by adapter-provided champion data upstream.
export function resolveGeneralBenchmark(tier: string | null): BenchmarkReference
```

---

## Application port output type (`application/ports/SessionCoachingModel.ts`)

```ts
export interface SessionAnalysisOutput {   // what the model returns (pre-DTO)
  insights: Omit<SessionInsight, never>[]  // same shape as SessionInsight
  noData: boolean
}
export interface SessionCoachingModel {
  analyzeSession(features: SessionFeatures, model: string): Promise<SessionAnalysisOutput>
}
```

## Application port (`application/ports/BenchmarkDataSource.ts`)

```ts
export interface BenchmarkDataSource {
  // Returns champion/patch-specific reference, or null on miss/error/timeout (→ caller falls back).
  getChampionBenchmark(input: {
    champion: string; role: string; tier: string | null
  }): Promise<BenchmarkReference | null>
}
```

---

## Entity relationships

```
MatchSummary[] ─┐
SummonerProfile ┤
LpSnapshot[]   ─┼─► computeSessionFeatures ─► SessionFeatures ─► SessionCoachingModel.analyzeSession ─► SessionAnalysisOutput ─► SessionAnalysis (DTO)
BenchmarkReference ┘            ▲
                                │
BenchmarkDataSource.getChampionBenchmark ──(null)──► resolveGeneralBenchmark
```

`GetSessionAnalysis` query orchestrates the left side (reads via existing repositories) and the resolution/fallback, then calls the model and stamps the DTO.
