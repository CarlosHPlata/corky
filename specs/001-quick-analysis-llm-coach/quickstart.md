# Quickstart: Quick Analysis — LLM Session Coach

How to build, wire, and verify this feature. Order is mandatory per Constitution VIII (frontend-first).

## Prerequisites
- `.env` (in repo root or `userData`) with `RIOT_API_KEY`, `ANTHROPIC_API_KEY`, `RIOT_ID`. `ANTHROPIC_MODEL` optional (defaults `claude-sonnet-4-6`).
- Synced data present (run the app once and let it sync, or have a local DB).
- New dependency: `npm i @modelcontextprotocol/sdk`.

## Build order

### 1. Frontend against a stub (no backend)
1. Add `SessionInsight` / `SessionAnalysis` to `src/shared/types.ts` (and the `IpcApi` method).
2. Create `src/renderer/src/stubs/quickAnalysis.ts` exporting a `SessionAnalysis` matching the DTO exactly (2–3 sample insights + a `noData: true` variant).
3. Refactor `QuickAnalysis` in `src/renderer/src/screens/Home.tsx` to render from a `SessionAnalysis` (icon by `leak`, headline, body, `EvidenceChip` = `evidence`, a `provisional` marker, a benchmark-basis footnote). Add a `useQuickAnalysis` hook holding state `idle | running | done | error | noData` + the session cache; for now its "fetch" resolves the stub after a short delay.
4. **Review & approve the UI** (states: idle, running, done with insights, noData, error). Do not proceed until signed off.

### 2. Backend (domain → application → adapters → wiring)
5. `domain/benchmark.ts`: `BenchmarkReference`, `GENERAL_BENCHMARKS`, `resolveGeneralBenchmark`. **Test first** (`test/unit/benchmark.test.ts`).
6. `domain/sessionFeatures.ts`: `computeSessionFeatures`. **Test first** (`test/unit/sessionFeatures.test.ts`) against match fixtures, incl. empty/short/tier-crossed cases.
7. Ports: `application/ports/SessionCoachingModel.ts`, `application/ports/BenchmarkDataSource.ts`.
8. `adapters/driven/anthropic/sessionPrompt.ts` (+ test it serializes every fact and includes the hard rules) and `AnthropicSessionCoachingModel.ts` (forced tool-use, schema in contracts). Test the parser with a saved tool-use payload.
9. **Reusable OP.GG client first**: `adapters/driven/opgg/opggTypes.ts` + `OpggMcpClient.ts` (transport + shared per-patch cache + timeout + `null` on error) — built feature-agnostic for reuse. Then `OpggBenchmarkDataSource.ts` as a thin mapper that delegates to the client. Test the client mapping against `test/fixtures/opgg-lane-meta.sample.json`, the error→null path, and the cache-hit (transport called once); test the adapter maps client output → `BenchmarkReference`.
10. `application/queries/GetSessionAnalysis.ts`: read matches/profile/lp via existing repos → `getChampionBenchmark` (fallback to `resolveGeneralBenchmark`) → `computeSessionFeatures` → `analyzeSession` → stamp DTO; `noData` when `gameCount` below threshold.
11. Wire in `infrastructure/container.ts`: construct a **single shared `OpggMcpClient`** (future features inject the same instance), then `OpggBenchmarkDataSource(client)`, the session model, and the query; warm the client's cache from the sync flow.

### 3. Wire frontend to backend (one-line swap)
12. In `useQuickAnalysis`, replace the stub call with `window.api.getSessionAnalysis()`. UI MUST NOT change (Constitution VIII).
13. Register `analysis:session` in `IpcController.ts`; expose `getSessionAnalysis` in `preload/index.ts`.

## Verify
- `npm run typecheck` and `npm test` pass; no test hits the network.
- `npm run dev`: on Home, press **Quick analysis** → loading → 2–3 insights, each a flaw + action, none repeating a visible stat (SC-002/SC-008).
- Each rate insight shows a labelled benchmark basis (SC-004).
- Pull the network / break the OP.GG host → analysis still returns using the general benchmark and says so (SC-005); breaking the Anthropic call → friendly retryable error, card not blank (SC-007).
- With an empty DB → "needs games" state (FR-015).
- Navigate away and back within the session → no new run is triggered (SC-009).

## Definition of done (acceptance → criteria)
| Criterion | Check |
|---|---|
| SC-001 | Analysis completes ~≤10s; OP.GG not on the click path |
| SC-002 / SC-008 | Every insight = flaw + action; none trivial or tier-list-like |
| SC-003 | Evidence reconciles with Home dashboard numbers |
| SC-004 / SC-005 | Benchmark basis labelled; OP.GG-down still produces coaching |
| SC-006 | Thin data → provisional/honest, never fabricated |
| SC-007 | LLM failure → retryable error, no blank/hang/crash |
| SC-009 | Result session-cached; no unrequested re-run |
