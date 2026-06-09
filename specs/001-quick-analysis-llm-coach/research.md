# Phase 0 Research: Quick Analysis — LLM Session Coach

Resolves the unknowns and technology choices flagged in the plan's Technical Context.

---

## R1 — How to access OP.GG benchmark data

**Decision**: Add `@modelcontextprotocol/sdk` and connect to the hosted OP.GG MCP at `https://mcp-api.op.gg/mcp` via the `StreamableHTTPClientTransport`, calling two tools:
- `lol_list_lane_meta_champions` → lane-by-lane tiers with win/pick/ban rates, KDA, tier ranking (the per-champion/lane benchmark + meta standing).
- `lol_get_champion_analysis` → champion stats/builds/counters (used only for the CS/economy reference where lane-meta is insufficient).

The client calls these in the **main process** and returns plain typed data. The LLM never calls OP.GG (we are not using Anthropic's MCP-connector beta) — this keeps "computed features are the single source of truth" (Constitution II) intact.

**Built for reuse (two tiers)**: per the plan's Structure Decision, the integration is split so future features (Home-page meta stats, other analyses) reuse it without rework:
- **Tier 1 — `OpggMcpClient`** (reusable): owns the MCP transport, typed response models, caching, and timeouts; exposes the OP.GG tool surface generically (lane meta, champion analysis, leaderboards, …).
- **Tier 2 — narrow per-feature ports** in `application/ports/`: this feature's `BenchmarkDataSource` is implemented by an adapter that *delegates* to `OpggMcpClient`. The hexagon depends only on the narrow port (interface segregation), never on the fat OP.GG surface.

**Rationale**: The MCP tool surface is the documented, stable interface; the official client handles the streamable-HTTP transport and tool schemas. No API key is required. Concentrating all MCP knowledge in `OpggMcpClient` means the integration is written once and the rest of the system stays unaware of MCP; new features add only a small port.

**Alternatives considered**:
- *Direct HTTP to op.gg internal endpoints* — rejected: undocumented, brittle, likelier to violate terms than the published MCP.
- *Anthropic MCP-connector (let the model call OP.GG)* — rejected: the model would consume unvalidated external numbers as "evidence", breaking Constitution II and the FR-006 evidence guarantee.

**Risk & mitigation**: OP.GG MCP has **no documented auth, rate limit, or terms**. Treat as best-effort: short timeout (≈3s), per-patch in-memory cache, prefetch on sync (FR-013), and a built-in general-benchmark fallback (R3) so analysis never fails because OP.GG is down (FR-011, SC-005).

---

## R2 — Structured output from the coaching model

**Decision**: Use **forced tool-use** (a single `submit_analysis` tool whose `input_schema` is the `SessionAnalysis` shape) via `@anthropic-ai/sdk` `messages.create` with `tool_choice: { type: 'tool', name: 'submit_analysis' }`. Parse `tool_use.input` directly; validate against the schema; on any malformed result, surface a graceful error (FR-017).

**Rationale**: The existing `AnthropicCoachingModel` parses JSON out of free text with a regex — workable but fragile. Forced tool-use makes the model emit schema-shaped JSON natively, eliminating the brittle parse and directly satisfying SC-002/SC-008 (no stray prose, no trivial-stat insights leaking through). SDK ^0.38 supports tool use.

**Alternatives considered**:
- *Mirror the existing regex-JSON parse* — acceptable but fragile; rejected for the more reliable contract since this is the first user-facing coaching output.
- *Anthropic structured outputs / `response_format`* — not reliably available in ^0.38; tool-use is the portable choice. (If the SDK is later upgraded, migrating is trivial.)

**Model**: reuse `config.anthropicModel` (defaults to `claude-sonnet-4-6`). Session analysis is a small, cheap call; Sonnet is appropriate.

---

## R3 — General benchmark fallback constants

**Decision**: Ship a small, documented per-rank benchmark table in `domain/benchmark.ts` as the cold-start / OP.GG-unavailable fallback, covering the two rate signals we diagnose:
- **CS/min** target per rank tier (mid/solo-lane reference), e.g. Iron ≈ 4.5, Bronze ≈ 5.5, Silver ≈ 6.0, Gold ≈ 6.5, Platinum ≈ 7.0, Diamond+ ≈ 7.5.
- **Healthy deaths/game** ceiling per rank (looser at low elo), e.g. ≈ 6.0 at Bronze trending to ≈ 4.5 at Diamond+.

Values are approximate references, **tagged `basis: "general"`** whenever used, so the UI states its basis honestly (Constitution III, FR-011, SC-004).

**Rationale**: Constitution III already ends the cohort chain at "general benchmark constant". Hardcoding an honest, clearly-labelled table is the simplest resilient fallback and keeps the feature shippable without OP.GG.

**Alternatives considered**:
- *No fallback (block analysis when OP.GG down)* — rejected: violates FR-011/SC-005.
- *Per-champion fallback constants* — rejected: too much guesswork offline; champion-specific precision is exactly what OP.GG provides when available.

---

## R4 — CQRS classification: command vs query

**Decision**: Model the use case as a **read-only query** `GetSessionAnalysis` (one IPC channel `analysis:session`). It reads existing repositories, resolves a benchmark, calls the coaching model, and returns a `SessionAnalysis` DTO. It **persists nothing** (FR-021: result is session-cached in the renderer).

**Rationale**: It does not mutate the write store, so it is a query by the codebase's command/query split. Although it performs an external LLM call, that is a read-with-side-effect (cost), not a state mutation — analogous to `GetCoachReport` returning data. Keeping it a query signals "no DB write" and matches the ephemeral spec.

**Alternatives considered**:
- *Command `AnalyzeSession`* — would suggest persistence/mutation; rejected since nothing is stored this iteration. (If we later persist session analyses, revisit.)

---

## R5 — Benchmark prefetch / cache lifecycle

**Decision**: The cache lives in the reusable **`OpggMcpClient`** (Tier 1), keyed per tool + arguments + patch (e.g. `laneMeta:<patch>`, `championAnalysis:<champ>:<role>:<patch>`), so every feature that reuses the client benefits from the same cache. It is warmed during the existing sync flow (after matches/profile refresh, fire-and-forget for the player's top champions/roles at their current rank), so the user's "Quick analysis" click reads from cache (FR-013, SC-001). A cache miss at analysis time falls back to the general benchmark rather than blocking.

**Rationale**: Keeps the *quick* analysis quick; respects the best-effort nature of the source; caching at the client tier (not the per-feature adapter) means it is shared across all future OP.GG-backed features. No new persistence needed (patch-scoped, regenerated next session).

**Alternatives considered**:
- *Fetch on the analysis click* — rejected: adds an unbounded external hop to the latency-sensitive path (SC-001).
- *Persist benchmark to SQLite* — deferred: in-memory per session is sufficient for a single-user app and avoids a migration; revisit if cold-start latency matters.

---

## R6 — Session signals to compute (the hybrid "facts" layer)

**Decision**: `computeSessionFeatures` derives, from `MatchSummary[]` + `SummonerProfile` + `LpSnapshot[]` + resolved `BenchmarkReference`:
- `deathsPerGame` overall, **and split wins vs losses** (the #1 low-elo leak signal).
- `avgCsPerMin` and signed `csGapVsBenchmark`.
- **Lead-conversion proxy**: average KDA paired with win rate; a boolean/score flag when KDA is healthy but win rate is poor ("wins lane, loses game").
- **Pool shape**: champion count over the window, top champ's game share, win-rate spread; plus the top champion's meta standing when benchmark data carries it.
- **LP trajectory**: net session delta (guarded for tier/division crossings, reusing the Home screen's existing guard) and a "choppiness" measure (gained-then-gave-back).
- A compact per-game list (champ, role, W/L, K/D/A, CS/min, duration, recency) for the model to spot variance/streaks/role-bleed.

The model receives these as labelled facts and only prioritizes/diagnoses/writes (hybrid split, per the spec's design discussion). Confidence is `provisional` when a pattern rests on < 3 supporting games (Constitution III).

**Rationale**: Pre-computing the risky arithmetic guarantees evidence accuracy (Constitution II) and lets the LLM do what it is good at — judgement and phrasing.

**Alternatives considered**:
- *Let the LLM compute everything from the raw list* — rejected: arithmetic/benchmark hallucination risk breaks FR-006.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| OP.GG access mechanism | `@modelcontextprotocol/sdk` streamable-HTTP client, main-process only (R1) |
| Structured LLM output | Forced tool-use `submit_analysis` (R2) |
| Offline/cold-start benchmark | Documented per-rank general table, tagged `general` (R3) |
| Use-case type | Read-only query `GetSessionAnalysis` (R4) |
| Keeping analysis fast | Prefetch + in-memory per-patch cache; miss → fallback (R5) |
| What to feed the model | Pre-computed session signals; hybrid split (R6) |

No `NEEDS CLARIFICATION` markers remain.
