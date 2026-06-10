---
description: "Task list for AI Match Analysis (Corky's read)"
---

# Tasks: AI Match Analysis (Corky's read)

**Input**: Design documents from `/specs/004-ai-match-analysis/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution Principle V (Test-First with Fixtures) mandates Vitest tests for every `domain/`/`application/` unit, backed by stored match fixtures. Pure modules + adapter validators carry the test weight; SQLite repo tests are kept thin (the `better-sqlite3` ABI caveat from M0.5 may keep them out of plain `npm test`).

> **Implementation status (2026-06-10)**: **All four passes (US1–US4) are implemented and tested**, plus the foundation and applicable polish. **42 new unit tests pass** (`npm test` → 134 pass total); the only failures are the 4 SQLite-repo test files on the documented `better-sqlite3` ABI caveat (native module can't load under plain vitest), unrelated to this feature. `npm run typecheck` is clean (node + web). Notes: **T004/T005 folded** — the anchor catalog, compact context and metrics derive directly from the spec-003 `MatchReport` (which already carries every computed figure), so no separate `MatchFeatures` extractor was needed. **T012** uses a new `standing_focus_tasks` table for the global per-user set (lower-risk than re-keying the legacy `focus_tasks`, which the existing port/tests still use). **Remaining**: **T014** (SQLite repo test — ABI-gated), **T051** (live end-to-end run — needs the Anthropic key + a synced match; not executed here), **T052** (`/simplify` — user-triggered). One known follow-up: the since-last `prior` value isn't yet read back across games (the loop yields held/regressed/not-applicable but not "improved" until a `getLatestTaskValue` lookup is added). **Per-death narration is now surfaced** — the death map is interactive (click a death marker/row → its `character` + note, keyed by `marker:death#n`).

**Organization**: Tasks grouped by user story (spec priority order). Build-dependency note: the four passes share a foundation (features, anchor catalog, compact context, the `MatchCoachingModel` port + adapter shell, storage, the orchestrator skeleton, the renderer stub/hook/report scaffold) — that lives in **Phase 2 Foundational**. Each story then plugs in its own pass + binds its section. US1 (the verdict) is independently demonstrable on the foundation; US2/US3 *enrich* US1's pass-3 input but US1 does not block on them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (overall review) / US2 (highlight narration) / US3 (caveats & framing) / US4 (focus tasks)
- All paths are repo-relative (repo root `d:\projects\corky`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Fixtures and model config the rest depends on.

- [x] T001 [P] Add a **no-timeline** test fixture (a `match-<id>.json` with no matching `timeline-<id>.json`) under `test/fixtures/`, alongside the existing spec-003 win/loss match+timeline fixtures, for the degrade-path tests.
- [x] T002 [P] Add light/heavy model-name config (defaults `claude-haiku-4-5` / `claude-opus-4-8`, overridable via env e.g. `CORKY_LIGHT_MODEL` / `CORKY_HEAVY_MODEL`) read in the composition root in `src/main/infrastructure/container.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, pure modules, the port + adapter shell, storage + migration, the orchestrator skeleton, IPC/preload, and the renderer stub/hook/report scaffold. **No user-story pass can be built until this is done.**

**⚠️ CRITICAL**: Every story phase depends on this phase.

- [x] T003 Define all cross-boundary DTOs in `src/shared/types.ts`: `MatchAnalysis` envelope, `SectionStatus`, `PassKey`, `EvidenceRef`, the four pass DTOs (`FramingOutput`, `NarrationOutput`, `ReviewOutput`, `TasksOutput`), global `FocusTask` + `FocusTaskEval`; extend `IpcApi` with `analyzeMatch(matchId, opts?) => Promise<MatchAnalysis>` and `getMatchAnalysis(matchId) => Promise<MatchAnalysis|null>` (per data-model.md).
- [x] T004 [P] Implement pure `computeMatchFeatures(rawMatch, rawTimeline, puuid)` in `src/main/domain/report/matchFeatures.ts` (populate the existing `MatchFeatures` type, reusing spec-003 extractors).
- [x] T005 [P] Test `matchFeatures` in `test/unit/matchFeatures.test.ts` against a stored fixture (values sanity-check vs an external reference, Principle V).
- [x] T006 [P] Implement pure `buildAnchorCatalog(report)` in `src/main/domain/report/anchorCatalog.ts` (one `stat:` anchor per breakdown/core stat; one `marker:objective#n`/`teamfight#n`/`death#n` per spec-003 highlight/death; `benchmark:` ids).
- [x] T007 [P] Test `anchorCatalog` in `test/unit/anchorCatalog.test.ts` (stable ids; one anchor per fact; death/marker carry `tMin`/`xPct`/`side`).
- [x] T008 [P] Implement pure `toCompactContext(report, catalog, extras?)` in `src/main/domain/report/compactContext.ts` (terse `key=value`/columnar block per research D4).
- [x] T009 [P] Test `compactContext` in `test/unit/compactContext.test.ts` (lists every catalog id; contains no figure absent from the report; output is stable).
- [x] T010 Define the `MatchCoachingModel` port in `src/main/application/ports/MatchCoachingModel.ts` (4 per-pass methods + `ReviewExtras`/`TasksExtras` per contracts/match-coaching-passes.md).
- [x] T011 Create the adapter shell `src/main/adapters/driven/anthropic/AnthropicMatchCoachingModel.ts` + `src/main/adapters/driven/anthropic/matchPrompts.ts` — the `CreateMessage` wrapper + `fromApiKey(apiKey, lightModel, heavyModel)` (mirroring `AnthropicSessionCoachingModel`); pass methods throw "not implemented" until their story.
- [x] T012 Migration in `src/main/adapters/driven/sqlite/schema.ts`: add `match_analyses` table; re-key `focus_tasks` to **global per-user** (`puuid`, `status`, `source_match_id`, `created_at`, `updated_at`) + index `(puuid, status)`. Idempotent (`CREATE TABLE IF NOT EXISTS` / guarded recreate).
- [x] T013 Add `upsertMatchAnalysis` / `getMatchAnalysis` (guard: a partial run never overwrites a stored full read) to `src/main/application/ports/ReportRepository.ts` + `src/main/adapters/driven/sqlite/SqliteReportRepository.ts`.
- [ ] T014 [P] Test analysis upsert/get + partial-over-full guard in `test/unit/SqliteReportRepository.test.ts` (thin; ABI caveat applies).
- [x] T015 Implement `GetMatchAnalysis.execute(matchId)` (read-only, no model call) in `src/main/application/queries/GetMatchAnalysis.ts` (contracts/ipc-get-analysis.md).
- [x] T016 Implement the `AnalyzeMatch` orchestrator **skeleton** in `src/main/application/commands/AnalyzeMatch.ts`: load account + raw match/timeline → `assembleMatchReport` → `computeMatchFeatures` (persist to `features`) → `buildAnchorCatalog`; assemble + `upsertMatchAnalysis` the envelope with per-section status; passes are null/no-op placeholders; `force`/retry-fill + partial-failure scaffolding (research D7).
- [x] T017 [P] Test the orchestrator skeleton in `test/unit/AnalyzeMatch.test.ts` with a fake `MatchCoachingModel` + fake repos (envelope assembled, section statuses set, a partial run never overwrites a stored full read, passes receive a **compact string** not raw JSON — SC-007).
- [x] T018 Wire `src/main/infrastructure/container.ts`: construct `AnthropicMatchCoachingModel(create, lightModel, heavyModel)`, `AnalyzeMatch`, `GetMatchAnalysis` (inject `BenchmarkDataSource`, `SessionGoalRepository`, `ReportRepository`, `MatchRepository`).
- [x] T019 Register `analysis:match:run` → `AnalyzeMatch` and `analysis:match:get` → `GetMatchAnalysis` in `src/main/adapters/driving/IpcController.ts`; expose `analyzeMatch` / `getMatchAnalysis` in `src/preload/index.ts`.
- [x] T020 [P] Create the renderer stub `src/renderer/src/stubs/matchAnalysis.ts` with `MatchAnalysis` fixtures: win, loss, partial (review `error`), no-timeline (narration `skipped`), first-game-tasks (Constitution VIII).
- [x] T021 [P] Create the hook `src/renderer/src/data/useMatchAnalysis.ts` (hydrate via `getMatchAnalysis` on mount, run via `analyzeMatch`; states `idle|running|done|partial|error`).
- [x] T022 Re-point `src/renderer/src/screens/CoachReport.tsx` + `src/renderer/src/App.tsx` to the `MatchAnalysis` envelope (against the **stub**): remove the fake `setTimeout` analyze, restore `analyzed` from `getMatchAnalysis`, render the gated sections null-safe with per-section placeholders. No layout change.

**Checkpoint**: Foundation ready — the report opens against the stub, hydrates a stored analysis, and the analyze action calls the (empty-pass) pipeline. User-story passes can now begin.

---

## Phase 3: User Story 1 — The overall read: why I won or lost (Priority: P1) 🎯 MVP

**Goal**: Pressing "Analyze this match" produces the **prose verdict** (why won/lost) grounded in the OP.GG meta benchmark (tagged basis) + the player's goal/reflection, with each structured claim anchored to a visible fact.

**Independent Test**: Analyse a stored fixture game → the verdict card shows a 1–2-sentence prose read naming the decisive factor; every claim resolves to a catalog anchor; the cohort badge states the benchmark basis; with a goal set the read relates to it.

### Tests for User Story 1

- [x] T023 [P] [US1] Test `parseReview` validator in `test/unit/matchPrompts.test.ts` (valid tool-use → `ReviewOutput`; malformed → throws; off-catalog `ref` dropped; out-of-context figure rejected; `benchmarkBasis` must equal the resolved basis).

### Implementation for User Story 1

- [x] T024 [US1] Implement `submit_review` tool + system/user prompt builder + `parseReview` validator in `src/main/adapters/driven/anthropic/matchPrompts.ts` (hybrid anchoring; prose into `verdict.lead/gild`; structured `claims[]`).
- [x] T025 [US1] Implement `analyzeReview(ctx, extras, model)` in `AnthropicMatchCoachingModel.ts` (heavy tier, `thinking: adaptive`, forced tool-use).
- [x] T026 [US1] Extend `AnalyzeMatch.ts`: resolve the OP.GG benchmark (`BenchmarkDataSource`, bounded/cached, general fallback, tag basis), load the Home-screen goal + per-match reflection as `ReviewExtras` (pluggable `external` left unused, FR-026b), run pass 3, fill the `review` section + status.
- [x] T027 [US1] Bind the prose-verdict section in `CoachReport.tsx`: `review.verdict.lead/gild`, cohort/`benchmarkBasis` badge, `claims[]` → evidence anchors resolved via the catalog, `confidence` provisional handling; honest "couldn't conclude" when review null.
- [x] T028 [US1] Swap the stub→`useMatchAnalysis` for the verdict path in `CoachReport.tsx`; the analyze action triggers a real run and renders the returned `review`.

**Checkpoint**: MVP — analyse → a real, evidence-anchored verdict.

---

## Phase 4: User Story 2 — Highlight & death narration (Priority: P2)

**Goal**: Each spec-003 timeline highlight and each player death gains a short factual narration; the turning-points section is populated.

**Independent Test**: Open an analysed game with timeline → each highlight/death carries a narration consistent with its marker (time/side/count); turning-points list the swings anchored to the curve/map; a no-timeline game degrades with the "not available" note.

### Tests for User Story 2

- [x] T029 [P] [US2] Test `parseNarration` in `test/unit/matchPrompts.test.ts` (valid → `NarrationOutput`; off-catalog `ref` dropped; time/positions taken from the catalog not the model; `unclear` death left factual).

### Implementation for User Story 2

- [x] T030 [US2] Implement `submit_narration` tool + builder + `parseNarration` in `matchPrompts.ts` (per-marker narration; death `character` enum; turning-point selection).
- [x] T031 [US2] Implement `analyzeNarration(ctx, model)` in `AnthropicMatchCoachingModel.ts` (light tier).
- [x] T032 [US2] Extend `AnalyzeMatch.ts`: run pass 2 (skip → section `skipped` when no timeline), and feed the narration **compact output** into the pass-3 `ReviewExtras.narration`.
- [x] T033 [US2] Bind `narration.turningPoints` → existing `TurningPoint` cards and death narrations in `CoachReport.tsx`; show the existing "not available for this game" note when `narration` skipped.

**Checkpoint**: US1 + US2 — verdict plus a narrated timeline.

---

## Phase 5: User Story 3 — Quick framing & caveats (Priority: P2)

**Goal**: The decoration slots fill from the game stats — MVP-style label, matchup tips, headline tag, quick read, captions/title-bar — on the cheap tier.

**Independent Test**: Analyse a game → the small slots populate consistently with the stats; a degenerate game softens/omits the MVP and one-liner honestly.

### Tests for User Story 3

- [x] T034 [P] [US3] Test `parseFraming` in `test/unit/matchPrompts.test.ts` (valid → `FramingOutput`; out-of-context figure rejected; `mvp` null on degenerate game).

### Implementation for User Story 3

- [x] T035 [US3] Implement `submit_framing` tool + builder + `parseFraming` in `matchPrompts.ts` (decoration slots; no coaching language; factual paraphrase only).
- [x] T036 [US3] Implement `analyzeFraming(ctx, model)` in `AnthropicMatchCoachingModel.ts` (light tier).
- [x] T037 [US3] Extend `AnalyzeMatch.ts`: run pass 1 **concurrently with pass 2** (`Promise.allSettled`), and feed the framing **compact output** into the pass-3 `ReviewExtras.framing`.
- [x] T038 [US3] Bind the decoration slots in `CoachReport.tsx`: `framing.headlineTag/Intent`, `quickRead`, MVP label (`framing.mvp`), `matchupTips` in the Matchup section, `captions`/title-bar.

**Checkpoint**: US1 + US2 + US3 — verdict, narration, and a fully "read" decoration layer.

---

## Phase 6: User Story 4 — Focus tasks & the since-last loop (Priority: P3)

**Goal**: A standing, global, per-user set of 1–3 measurable tasks; each analysis evaluates the set against the game (since-last) and keeps it current, informed by the Home-screen goal.

**Independent Test**: With a standing set, analyse a game → each standing task reports improved/held/regressed/not-applicable; the set is held/retired/extended (1–3); with no standing set, a clean first-time state + a fresh set.

### Tests for User Story 4

- [x] T039 [P] [US4] Test `metricRegistry` in `test/unit/metricRegistry.test.ts` (`computeMetric` matches the breakdown; `isComputable` allowlist).
- [x] T040 [P] [US4] Test `taskEvaluation` + `enforceStandingSet` in `test/unit/taskEvaluation.test.ts` (improved/held/regressed/not_applicable incl. scope mismatch; clamp to 1–3).
- [x] T041 [P] [US4] Test `parseTasks` in `test/unit/matchPrompts.test.ts` (non-computable metric dropped; clamp 1–3; scope without champion/role rejected).

### Implementation for User Story 4

- [x] T042 [P] [US4] Implement pure `metricRegistry` (`computeMetric`/`isComputable`) in `src/main/domain/report/metricRegistry.ts` (allowlist per research D5).
- [x] T043 [P] [US4] Implement pure `evaluateTask` in `src/main/domain/report/taskEvaluation.ts` and `enforceStandingSet` + `FocusTask` invariants in `src/main/domain/report/focusTask.ts`.
- [x] T044 [US4] Add global focus-task CRUD (`getFocusTasks(puuid)` / `saveFocusTasks` / `retireTask`) + reuse `insertTaskEvaluation` to `ReportRepository.ts` + `SqliteReportRepository.ts`; extend `SqliteReportRepository.test.ts`.
- [x] T045 [US4] Implement `submit_tasks` tool + builder + `parseTasks` in `matchPrompts.ts` (validate metrics via the registry, clamp 1–3, scope validation).
- [x] T046 [US4] Implement `analyzeTasks(ctx, extras, model)` in `AnthropicMatchCoachingModel.ts` (heavy tier).
- [x] T047 [US4] Extend `AnalyzeMatch.ts`: pass 4 — load standing tasks → `evaluateTask` each against this game → persist evaluations → model sets/adjusts the set → `enforceStandingSet` → persist tasks; set `tasks.firstTime` when no prior set.
- [x] T048 [US4] Bind `tasks.standing` → next-focus (`FocusTask` component) and `tasks.sinceLast` → since-last in `CoachReport.tsx`; clean first-time state.

**Checkpoint**: All four passes live; the full "Corky's read" renders.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T049 [P] Per-section **retry** affordance: surface `sections[k]==='error'` in `CoachReport.tsx` + a retry path in `useMatchAnalysis.ts` that re-runs only failed sections (FR-005 / SC-010).
- [x] T050 [P] Verify no-timeline + degenerate-game degrade end-to-end (review from core stats, narration/turning-points "not available", MVP softened) — FR-011/FR-015/FR-019/SC-009.
- [ ] T051 Run `quickstart.md` §7 end-to-end validation: analyse a fixture; re-open after restart issues **only** `getMatchAnalysis` (no model call, SC-008); benchmark basis labelled (SC-003/004); every review claim resolves to a visible anchor (SC-002).
- [ ] T052 [P] Run `/simplify` over the new `domain/report/*` + `adapters/driven/anthropic/*` + `AnalyzeMatch.ts` (reuse, altitude, no behaviour change).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all stories**.
- **US1 (P3)** → depends on Foundational; the MVP slice (verdict works on the foundation alone).
- **US2 (P4)** & **US3 (P5)** → depend on Foundational; each **enriches** US1's pass-3 input (`ReviewExtras.narration` / `.framing`) but does not block US1's independent test. US2 and US3 are mutually independent (different `analyze*` methods/sections) and can run in parallel by different developers — they touch `matchPrompts.ts`, `AnthropicMatchCoachingModel.ts`, `AnalyzeMatch.ts`, `CoachReport.tsx` in different regions, so coordinate edits to those shared files.
- **US4 (P6)** → depends on Foundational; mostly independent (its own pure modules + repo CRUD + section).
- **Polish (P7)** → after the desired stories.

### Within each story

- Validator test (`parse*`) before/with the prompt builder (test-first, Principle V).
- Pure domain (metric registry, task evaluation) before the repo/orchestrator that uses them (US4).
- Prompt builder + validator → adapter method → orchestrator step → renderer binding.

### Parallel opportunities

- Setup: T001 ‖ T002.
- Foundational pure modules: **T004–T009 all [P]** (matchFeatures/anchorCatalog/compactContext + their tests, different files). T020 ‖ T021 (stub ‖ hook). T014/T017 [P].
- US4 pure modules + tests: **T039–T043 all [P]**.
- Each story's `parse*` test is [P] with the other stories' tests (same file `matchPrompts.test.ts` — coordinate, or split into per-pass test files if working truly in parallel).

---

## Parallel Example: Foundational pure core

```bash
# After T003 (shared DTOs), launch the pure modules + tests together:
Task: "T004 computeMatchFeatures in src/main/domain/report/matchFeatures.ts"
Task: "T006 buildAnchorCatalog in src/main/domain/report/anchorCatalog.ts"
Task: "T008 toCompactContext in src/main/domain/report/compactContext.ts"
Task: "T005 matchFeatures.test.ts"
Task: "T007 anchorCatalog.test.ts"
Task: "T009 compactContext.test.ts"
```

## Parallel Example: User Story 4 pure modules

```bash
Task: "T042 metricRegistry in src/main/domain/report/metricRegistry.ts"
Task: "T043 taskEvaluation + focusTask in src/main/domain/report/"
Task: "T039 metricRegistry.test.ts"
Task: "T040 taskEvaluation.test.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **STOP & VALIDATE**: analyse a fixture → an evidence-anchored prose verdict; re-open → restored with no model call (SC-008).
3. Demo: the core coaching promise ("why I won/lost") is live.

### Incremental delivery

- + US2 → narrated timeline/turning points.
- + US3 → decoration layer (MVP, tips, headline, quick read).
- + US4 → focus-task loop (since-last + standing set).
- Each story adds value; the disjoint section ownership (FR-002a) means a later pass never breaks an earlier one.

### Notes

- [P] = different files, no incomplete-task deps. Shared files (`matchPrompts.ts`, `AnthropicMatchCoachingModel.ts`, `AnalyzeMatch.ts`, `CoachReport.tsx`) are edited across stories — sequence those edits or split regions to avoid conflicts.
- No test touches the network (Principle V); the adapter is tested via a fake `CreateMessage`.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
