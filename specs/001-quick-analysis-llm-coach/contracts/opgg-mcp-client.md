# Adapter Contract: `OpggMcpClient` (reusable OP.GG integration)

**Tier 1 — reusable, feature-agnostic.** `src/main/adapters/driven/opgg/OpggMcpClient.ts`. The single place that knows about the OP.GG MCP. Built to be reused by future features (Home-page meta stats, other analyses), not just Quick Analysis. It is **not** an application port — it is a concrete adapter utility that per-feature port adapters (Tier 2) delegate to.

## Why this exists separately from `BenchmarkDataSource`
Quick Analysis needs only a benchmark, but the OP.GG surface is broad and will be reused. Putting the transport/caching/typing here (and keeping `BenchmarkDataSource` a narrow port) means:
- the integration is written and tested once;
- the hexagon never depends on a fat "all of OP.GG" interface (interface segregation, Constitution IV);
- a new feature adds a small Tier-2 port + thin mapper, reusing this client and its cache.

## Surface (typed methods over OP.GG MCP tools)
Expose methods mapping 1:1 to the OP.GG tools we expect to use; add more as features need them. Each returns a typed model from `opggTypes.ts` (never raw MCP envelopes).

```ts
export interface OpggMcpClient {
  getLaneMeta(input: { region?: string; tier?: string }): Promise<LaneMetaChampion[] | null>      // lol_list_lane_meta_champions
  getChampionAnalysis(input: { champion: string; role: string }): Promise<ChampionAnalysis | null> // lol_get_champion_analysis
  // Future (stub now, implement when a feature needs them):
  // getChampionLeaderboard(...) // lol_list_champion_leaderboard
  // getChampionPositions(...)   // lol_list_lane_meta / positions
}
```

`LaneMetaChampion`, `ChampionAnalysis`, etc. live in `opggTypes.ts` as clean domain-friendly shapes (winRate, pickRate, banRate, tier, kda, csReference, patch).

## Behavioural contract
1. **Transport isolation.** Owns the `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` to `https://mcp-api.op.gg/mcp`. Connection is lazy and reused. No other module imports the MCP SDK (Constitution IV).
2. **Best-effort, never throws for unavailability.** On timeout (≈3s), transport error, or unparsable tool result → returns `null`. Callers decide the fallback. (This is what lets `BenchmarkDataSource` guarantee it never fails the analysis — FR-011, SC-005.)
3. **Caching (shared).** In-memory cache keyed by `tool + normalized args + patch` (e.g. `laneMeta:<tier>:<patch>`). TTL = current patch / process lifetime. Shared across all features that use the client (R5).
4. **Patch awareness.** Tags cached entries with the patch reported by OP.GG so stale-patch data is replaced.
5. **Public data only.** Only meta/benchmark tools are used; no player-account lookups via OP.GG (the player's own facts come from Riot — FR-012, Constitution I).
6. **No credentials.** OP.GG MCP requires none.

## Test contract
- `getLaneMeta` maps `test/fixtures/opgg-lane-meta.sample.json` into typed `LaneMetaChampion[]` (no network).
- A simulated timeout / transport error resolves to `null` (not a throw).
- A second identical call within a patch is served from cache (transport invoked once) — assert via a stubbed transport call counter.

## Reuse note
When wiring a future feature: inject the same `OpggMcpClient` singleton (from the composition root) into the new feature's Tier-2 adapter. Do not instantiate a second client — the cache and connection are meant to be shared.
