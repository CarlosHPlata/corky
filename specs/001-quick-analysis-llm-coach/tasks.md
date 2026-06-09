# Tasks: Quick Analysis — LLM Session Coach

**Input**: Design documents from `/specs/001-quick-analysis-llm-coach/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included — Constitution Principle V mandates Vitest tests backed by fixtures for every `domain/` and `application/` unit, and adapter mappers are tested against stored response fixtures. No test may touch the network.

**Ordering note (Constitution VIII — Frontend First)**: the full UI (all states) is built against a stub and **approved** in Phase 2 before any backend wiring. The wiring step swaps the stub import for `window.api.*` and must not change the UI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 maps to the user stories in spec.md
- File paths are exact and relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and shared DTOs needed by both the stub frontend and the backend.

- [X] T001 Add `@modelcontextprotocol/sdk` to dependencies in `package.json` and run install; confirm it bundles into the main build (pure JS — unlike `better-sqlite3` it needs no electron-vite externalization).
- [X] T002 [P] Add `SessionInsight` and `SessionAnalysis` DTOs and the `getSessionAnalysis: () => Promise<SessionAnalysis>` method to `IpcApi` in `src/shared/types.ts` (shapes per [data-model.md](./data-model.md)).

---

## Phase 2: Foundational (Frontend-First — Blocking Prerequisites)

**Purpose**: Build and **approve** the entire Quick Analysis UI against a stub before any backend exists (Constitution VIII). The stub renders every state so later wiring never changes the UI.

**⚠️ CRITICAL**: No backend wiring (Phase 3+) begins until T006 approval passes.

- [X] T003 [P] Create `src/renderer/src/stubs/quickAnalysis.ts` exporting `SessionAnalysis` fixtures that exercise every variant: a normal result (2–3 impact-ordered insights, mixed `leak` categories, one with a `benchmarkBasis`, one `provisional`), a `noData: true` variant, and an empty/error helper. Shapes must match the `src/shared/types.ts` DTOs exactly.
- [X] T004 Create `src/renderer/src/data/useQuickAnalysis.ts` — a hook holding state `idle | running | done | error | noData`, a **session cache** (so re-opening Home does not re-run — FR-021/SC-009), a `run()` action, and a `retry()`. For now `run()` resolves the stub from T003 after a short delay. (depends T002, T003)
- [X] T005 Refactor the `QuickAnalysis` component in `src/renderer/src/screens/Home.tsx` to render a `SessionAnalysis` from `useQuickAnalysis`: icon/tone by `leak`, `headline`, `body`, `EvidenceChip`={evidence}, a `provisional` marker, a benchmark-basis footnote when present, the `noData` "needs games" state, and a friendly retryable `error` state. Remove the inline mock-insight logic. Keep the existing card layout (FR-022). (depends T004)
- [X] T006 **APPROVAL GATE (Constitution VIII)**: review the `QuickAnalysis` UI across all states (idle / running / done-with-insights / noData / error) in `npm run dev` and sign off. UI must not change during subsequent wiring. ✅ **APPROVED by user — UX & palette preserved.**

**Checkpoint**: UI complete and demoable on stub data; backend work may begin.

---

## Phase 3: User Story 1 — Get a coached read of my recent session (Priority: P1) 🎯 MVP

**Goal**: Pressing "Quick analysis" returns 2–3 real, impact-ranked coaching insights (flaw + next-game action, none trivial), computed from the player's local games/pool/LP and a **general** benchmark. Proves the end-to-end LLM connection. (OP.GG benchmark precision is added in US2.)

**Independent Test**: With synced games present, press the button → loading → 2–3 insights, each a flaw + concrete action, evidence reconciles with the dashboard, nothing merely repeats a visible stat.

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [X] T007 [P] [US1] Test `resolveGeneralBenchmark` and `GENERAL_BENCHMARKS` (per-rank cs/min + deaths ceiling, `basis: 'general'`) in `test/unit/benchmark.test.ts`.
- [X] T008 [P] [US1] Table-test `computeSessionFeatures` against match fixtures in `test/unit/sessionFeatures.test.ts`: deaths/game overall+wins+losses, cs gap vs benchmark, lead-conversion proxy, pool shape, LP net (with tier-cross → null) and choppiness, compact game lines.
- [X] T009 [P] [US1] Test `buildSessionPrompt` in `test/unit/sessionPrompt.test.ts`: serializes every `SessionFeatures` fact and includes the hard rules (diagnose-not-describe, no invented numbers, cap 2–3, blunt voice).
- [X] T010 [P] [US1] Test `AnthropicSessionCoachingModel` parses a saved forced-tool-use payload into `SessionAnalysisOutput`, and rejects on a malformed payload, in `test/unit/AnthropicSessionCoachingModel.test.ts` (stubbed client, no network).

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement `src/main/domain/benchmark.ts`: `BenchmarkReference`, `BenchmarkBasis`, `ChampionMetaStanding`, `GENERAL_BENCHMARKS` table (R3), `resolveGeneralBenchmark(tier)`. Pure, no imports.
- [X] T012 [US1] Implement `src/main/domain/sessionFeatures.ts`: `SessionFeatures`/`GameLine`/`PoolEntry` types + `computeSessionFeatures(...)`. Pure; tolerant of empty/short input; reuse the Home session-LP guard. (depends T011)
- [X] T013 [P] [US1] Define port `src/main/application/ports/SessionCoachingModel.ts` (`analyzeSession(features, model): Promise<SessionAnalysisOutput>`) per [contract](./contracts/session-coaching-model.port.md).
- [X] T014 [P] [US1] Implement `src/main/adapters/driven/anthropic/sessionPrompt.ts`: system role + data serialization + output-contract instructions (blunt T1-coach voice; hard rules).
- [X] T015 [US1] Implement `src/main/adapters/driven/anthropic/AnthropicSessionCoachingModel.ts`: forced tool-use `submit_analysis` (schema = [llm-output.schema.json](./contracts/llm-output.schema.json)), parse `tool_use.input`, validate, throw on malformed; model id from arg. (depends T013, T014)
- [X] T016 [US1] Implement query `src/main/application/queries/GetSessionAnalysis.ts`: read matches/profile/lp via existing repositories → `resolveGeneralBenchmark` (US1 uses general only) → `computeSessionFeatures` → `analyzeSession` → stamp `generatedAt`/`model`; return `noData: true` when game count is below threshold. (depends T011, T012, T013)
- [X] T017 [US1] Register `analysis:session` handler in `src/main/adapters/driving/IpcController.ts` (thin: call `getSessionAnalysis.execute()`); add it to the `deps` type. Per [ipc contract](./contracts/ipc-session-analysis.md).
- [X] T018 [US1] Expose `getSessionAnalysis: () => ipcRenderer.invoke('analysis:session')` in `src/preload/index.ts`.
- [X] T019 [US1] Wire `AnthropicSessionCoachingModel` (using `config.anthropicModel`) and `GetSessionAnalysis` into `src/main/infrastructure/container.ts`; add to `registerIpcHandlers` deps in `src/main/index.ts` wiring.
- [X] T020 [US1] In `src/renderer/src/data/useQuickAnalysis.ts`, swap the stub resolution for `window.api.getSessionAnalysis()` (one-line change; UI unchanged — Constitution VIII).
- [ ] T021 [US1] Verify end-to-end in `npm run dev`: synced games → press → real impact-ranked insights using the general benchmark; evidence matches dashboard (SC-002, SC-003). ⏸ **Needs a live run by the user** (real Anthropic key + synced games + Electron GUI — not runnable in this headless pass).

### Added on user request — persist last analysis per account (FR-021 revised)

- [X] T021a Add `session_analyses` table (per-account, latest only) in `src/main/adapters/driven/sqlite/schema.ts`.
- [X] T021b Add `SessionAnalysisRepository` port + `SqliteSessionAnalysisRepository` adapter (`save`/`getLatest` by puuid).
- [X] T021c Split the use case: `AnalyzeSession` command (generate + persist latest, never overwrite a good analysis with a noData run) and `GetSessionAnalysis` query (read cached). Two channels `analysis:session:run` / `analysis:session:get`; preload + `IpcApi` updated.
- [X] T021d Restore the persisted analysis on mount in `useQuickAnalysis` (survives resync + app restart); `run()` calls `runSessionAnalysis()`.
- [X] T021e Test `SqliteSessionAnalysisRepository` (save/getLatest/upsert/per-account isolation) in `test/unit/SqliteSessionAnalysisRepository.test.ts` (shares the pre-existing better-sqlite3 ABI limitation under vitest in this env).
- [X] T021f Show a non-invasive staleness notice above the insights when a restored analysis is >24h old (uses `generatedAt` + `relativeTime`), in `src/renderer/src/screens/Home.tsx` (FR-023). Renderer-only; no DTO/backend change.

**Checkpoint**: MVP — a working LLM session coach without OP.GG, with the latest analysis persisted per account. Shippable.

---

## Phase 4: User Story 2 — Rank- & patch-accurate benchmarks (Priority: P2)

**Goal**: Replace the general benchmark with OP.GG champion/lane/patch references (built as a reusable client), and surface a gated comfort-pick insight. Falls back to the general benchmark when OP.GG is unavailable.

**Independent Test**: For a player whose main is meta-weak and whose farming trails, the farming insight cites a rank/champion/patch reference; a comfort-pick insight may appear; with OP.GG unreachable, coaching still returns on the general benchmark and says so.

### Tests for User Story 2 (write first, ensure they FAIL) ⚠️

- [X] T022 [P] [US2] Add a saved OP.GG response fixture `test/fixtures/opgg-lane-meta.sample.json` (lane-meta tool output for ≥2 champions). *(Assumed shape — OP.GG output is undocumented; labelled in-file.)*
- [X] T023 [P] [US2] Test `OpggMcpClient` in `test/unit/OpggMcpClient.test.ts` (stubbed raw call): maps fixture → typed `LaneMetaChampion[]`; error → `null` (no throw); repeated identical call served from cache (raw call invoked once).
- [X] T024 [P] [US2] Test `OpggBenchmarkDataSource` in `test/unit/OpggBenchmarkDataSource.test.ts`: maps client output → `BenchmarkReference` (`basis: 'champion_patch'`, includes `topChampStanding`); client `null`/champ-not-found → adapter `null`.

### Implementation for User Story 2

- [X] T025 [P] [US2] Implement `src/main/adapters/driven/opgg/opggTypes.ts`: clean typed models (`LaneMetaChampion`, `ChampionAnalysis`).
- [X] T026 [US2] Implement reusable `src/main/adapters/driven/opgg/OpggMcpClient.ts`: MCP `StreamableHTTPClientTransport` to `https://mcp-api.op.gg/mcp`, lazy reused connection, typed `getLaneMeta`/`getChampionAnalysis`, shared cache, ~3s timeout, defensive multi-alias mapping, `null` on error. Injectable `RawToolCall` for tests. (depends T025) + excluded SDK from electron-vite externalization (ESM-only).
- [X] T027 [P] [US2] Define narrow port `src/main/application/ports/BenchmarkDataSource.ts`. (per contract)
- [X] T028 [US2] Implement `src/main/adapters/driven/opgg/OpggBenchmarkDataSource.ts` delegating to `OpggMcpClient`; general benchmark as base, enriched with champion standing/CS; unknown champ or client `null` → `null`. (depends T026, T027)
- [X] T029 [US2] `AnalyzeSession` (the generator, post-persistence refactor) resolves the top champion's benchmark via `BenchmarkDataSource`, falls back to `resolveGeneralBenchmark`, threads `benchmarkBasis` into features + `benchmarkBasisUsed`. (depends T028)
- [X] T030 [US2] `sessionPrompt.ts` gained the gated comfort-pick rule (FR-010) and `computeSessionFeatures` attaches `topChampStanding` to the pool entry; `sessionFeatures.ts` exports `topChampionRole`.
- [X] T031 [US2] Wire a **single shared** `OpggMcpClient` + `OpggBenchmarkDataSource` into `container.ts`, injected into `AnalyzeSession`. (Benchmark fetch is bounded+cached on the analysis path — FR-013 revised — rather than a separate sync-warm hook, since the coaching call dominates latency.)
- [ ] T032 [US2] Verify live: insights cite a champion/patch benchmark with a labelled basis (SC-004); comfort-pick when warranted; OP.GG host down → analysis still returns on the general benchmark and discloses it (SC-005). ⏸ **Needs live run** (real OP.GG + Anthropic). *Field-name mapping in `OpggMcpClient` is an assumption pending one live response.*

**Checkpoint**: Rank/patch-accurate coaching; reusable OP.GG client ready for future features.

---

## Phase 5: User Story 3 — Honest behavior when data is thin or unavailable (Priority: P2)

**Goal**: Provisional framing for small samples, an honest "needs games" empty state, and graceful retryable failure — never fabricated patterns.

**Independent Test**: With < minimum games, the run returns provisional/honest output (or "needs games"); with the coaching service unreachable, the card shows a retryable error and never blanks/hangs/crashes.

### Tests for User Story 3 ⚠️

- [X] T033 [P] [US3] `sessionFeatures.test.ts` covers small-sample/empty handling; the `provisional` rule is enforced in the prompt (model-assigned).
- [X] T034 [P] [US3] `AnalyzeSession.test.ts`: below-threshold → `{ insights: [], noData: true }` with no model call; model rejection → command rejects (renderer maps to error).

### Implementation for User Story 3

- [X] T035 [US3] Provisional rule reinforced in `sessionPrompt.ts` (<3 games → provisional); `confidence` carried through the DTO/parser (Constitution III, FR-014).
- [X] T036 [US3] `noData` threshold path implemented in `AnalyzeSession` (empty insights + `noData: true`, no model call) (FR-015).
- [X] T037 [US3] `useQuickAnalysis.ts` maps a thrown call into the `error` state with a non-technical message + `retry()`; benchmark unavailability never surfaces as error (it falls back) (FR-017).
- [ ] T038 [US3] Verify live: empty DB → "needs games"; 2-game account → noData; kill the Anthropic call → retryable error, card not blank (SC-006, SC-007). ⏸ **Needs live run.**

**Checkpoint**: Honesty and resilience guarantees hold.

---

## Phase 6: User Story 4 — Compliant, player-visible-only coaching (Priority: P3)

**Goal**: Prove every player-specific input is the player's own visible data and the only external data is public meta.

**Independent Test**: Inspect the assembled analysis input — player-specific portion is own summaries/pool/rank only; external portion is public meta; no enemy/hidden/predicted data; no OP.GG account lookups.

- [X] T039 [P] [US4] `AnalyzeSession.test.ts` asserts OP.GG is called with only `{champion, role, tier}` (no player/enemy data); features derive from the player's own `MatchSummary`/`SummonerProfile`/`LpSnapshot` + public `BenchmarkReference`.
- [X] T040 [US4] Guard comment in `OpggMcpClient.ts` confirms only public meta tools are called (constants `TOOL_LANE_META`/`TOOL_CHAMPION_ANALYSIS`; no `lol_get_summoner_*`) — FR-012, FR-019.
- [ ] T041 [US4] Verify by inspection on a live run that handed inputs = own visible summaries + public meta only (FR-019, Constitution I). ⏸ **Needs live run.**

**Checkpoint**: Compliance guarantee documented and tested.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T042 [P] `npm run typecheck` (node + web) clean; all 47 feature unit tests pass with no network I/O (Constitution V). The 3 SQLite-repo suites can't load under vitest here due to the pre-existing better-sqlite3 Electron-ABI binary (needs a Node-ABI build/CI) — unrelated to this feature.
- [ ] T043 Run the [quickstart.md](./quickstart.md) verification checklist end-to-end (all SC-001…SC-009). ⏸ **Needs live run** (consolidates T021/T032/T038/T041).
- [X] T044 [P] `npm run build` succeeds; `@modelcontextprotocol/sdk` bundles into the main process (844 kB, 451 modules) with no ESM/require error.
- [X] T045 [P] Docs note added in `technical_brief.md` (OP.GG MCP dependency, best-effort/undocumented, reusable `OpggMcpClient`, ESM externalization note).

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: depends on Setup. **T006 approval gate blocks all backend wiring.**
- **US1 (P3)**: depends on Foundational. The MVP.
- **US2 (P4)**: depends on US1 (extends the query, prompt, container).
- **US3 (P5)**: depends on US1 (hardens query/compute/hook); independent of US2.
- **US4 (P6)**: depends on US1 (and US2 for the meta-only assertion); mostly verification.
- **Polish (P7)**: after all targeted stories.

### Story independence
- US1 is fully shippable alone (general benchmark, no OP.GG).
- US2 layers benchmark precision onto US1 without UI change (UI already supports it from Phase 2).
- US3 and US2 are independent of each other; both build on US1.
- US4 is verification over US1+US2.

### Within a story
- Test tasks (⚠️) are written first and must fail before implementation (Constitution V).
- Domain (`benchmark`, `sessionFeatures`) → ports → adapters → query → IPC/preload → renderer wiring.

### Parallel opportunities
- T002 ∥ (T001 first). Foundational: T003 ∥ start; T004→T005→T006 serial.
- US1 tests T007–T010 all ∥. Impl: T011 ∥ T013 ∥ T014; then T012 (after T011), T015 (after T013/T014), T016 (after T011/T012/T013).
- US2 tests T022–T024 ∥. Impl: T025 ∥ T027; then T026, T028, T029, T030, T031.
- US3 tests T033 ∥ T034.

---

## Parallel Example: User Story 1 tests

```bash
# Write these together, ensure all FAIL before implementing:
Task: "Test resolveGeneralBenchmark in test/unit/benchmark.test.ts"
Task: "Table-test computeSessionFeatures in test/unit/sessionFeatures.test.ts"
Task: "Test buildSessionPrompt in test/unit/sessionPrompt.test.ts"
Task: "Test AnthropicSessionCoachingModel parse in test/unit/AnthropicSessionCoachingModel.test.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)
1. Phase 1 Setup → 2. Phase 2 Foundational (stub UI + **approval**) → 3. Phase 3 US1 → **STOP & validate** the working coached read on the general benchmark. Shippable demo.

### Incremental delivery
- US1 (MVP, LLM connection proven) → US2 (OP.GG precision + reusable client) → US3 (honesty/resilience hardening) → US4 (compliance verification) → Polish. Each increment adds value without changing the approved UI.

---

## Notes
- `[P]` = different files, no incomplete dependencies.
- Frontend-first is non-negotiable: T006 approval precedes wiring (T019/T020); wiring must not alter the UI.
- Evidence integrity (Constitution II): all insight `evidence` echoes computed `SessionFeatures` numbers; the model never invents figures — enforced by prompt rules (T009/T014/T030) and tool-use schema.
- Commit after each task or logical group; OP.GG and Anthropic calls never appear in tests (use fixtures/stubs).
