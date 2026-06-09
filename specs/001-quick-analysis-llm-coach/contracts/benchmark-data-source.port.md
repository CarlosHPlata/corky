# Port Contract: `BenchmarkDataSource`

Driven port (`src/main/application/ports/BenchmarkDataSource.ts`). This is a **narrow, per-feature** port (interface segregation) — it answers only Quick Analysis's benchmark question. It is implemented by `adapters/driven/opgg/OpggBenchmarkDataSource.ts`, which **delegates to the reusable `OpggMcpClient`** (see [opgg-mcp-client.md](./opgg-mcp-client.md)). The application layer is unaware of MCP/OP.GG (Constitution IV). Future OP.GG-backed features add their own narrow ports over the same client rather than widening this one.

## Interface
```ts
export interface BenchmarkDataSource {
  getChampionBenchmark(input: {
    champion: string
    role: string
    tier: string | null
  }): Promise<BenchmarkReference | null>
}
```

## Behavioural contract
1. **Best-effort.** Returns a champion/patch-specific `BenchmarkReference` (`basis: 'champion_patch'`, includes `patch` and `topChampStanding`) when OP.GG data is available and fresh.
2. **Never throws for unavailability.** On miss, timeout (≈3s), transport error, or unparsable response it returns `null` — the caller (`GetSessionAnalysis`) then uses `resolveGeneralBenchmark(tier)` (FR-011, SC-005). The benchmark path MUST NOT be able to fail the analysis.
3. **Caching (FR-013, R5).** Results are cached in-memory keyed by `patch + tier + champion + role`. A warm-up hook is called during sync for the player's top champions/roles, so the analysis click hits cache. Cache is process-lifetime (patch-scoped); no persistence.
4. **Compliance (Constitution I, FR-019).** Only public meta/benchmark data is requested. No player-account lookups via OP.GG (the player's own facts come from Riot — FR-012).
5. **No credentials.** OP.GG MCP requires none; nothing secret is involved.

## Mapping (adapter, not contract)
The adapter calls `OpggMcpClient` (which returns typed OP.GG models) and maps them to a `BenchmarkReference`:
- `getLaneMeta()` → `csPerMin`/`deathsCeiling` reference for the lane + `ChampionMetaStanding` (winRate, tier, patch).
- `getChampionAnalysis()` → supplementary champion economy reference when lane-meta lacks it.
- Unknown champion/role → `null`.

The transport, caching, and timeouts are the client's responsibility, not this adapter's — the adapter is a thin mapper.

## Test contract
- Maps `test/fixtures/opgg-lane-meta.sample.json` to a `BenchmarkReference` with `basis: 'champion_patch'` (no network).
- A simulated transport error / timeout resolves to `null` (not a throw).
