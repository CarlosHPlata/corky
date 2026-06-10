# Implementation Plan: AI Match Analysis (Corky's read)

**Branch**: `004-ai-match-analysis` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-ai-match-analysis/spec.md`

## Summary

Fill the **gated "Corky's read" sections** of the spec-003 match report with real AI output, produced by a **four-pass pipeline** orchestrated by a new `AnalyzeMatch` command. The renderer already exists end-to-end against a mock AI layer (`REPORT_WIN`/`REPORT_LOSS` in `mockData.ts`); the spec-003 **factual** report (`assembleMatchReport`) and the **structured-output Anthropic pattern** (`AnthropicSessionCoachingModel`, forced tool-use + schema validation) are already built and are the templates we mirror. The user's steer: *the UX is mostly complete — only the heavy analysis (prose verdict) section and some decoration micro-texts are genuinely new; respect the rest and just wire it.*

**The four passes** (spec FR-002, each owning a disjoint report section):

1. **Caveats & framing** (light tier) — fills the decoration slots (MVP-style label, matchup tips, title-bar text, captions/spans, one-line quick read) from the game stats.
2. **Highlight & death narration** (light tier) — attaches a short factual narration to each spec-003 timeline highlight and each player death, and selects the turning points (the `TurningPoint` cards the UI already renders).
3. **Overall review** (heavy tier) — the **prose verdict** with embedded evidence anchors, grounded in the OP.GG meta benchmark (tagged basis) + the player's goal/reflection. Runs after 1 & 2 and consumes their compact outputs.
4. **Focus tasks** (heavy tier) — evaluates the **standing, global, per-user** focus-task set against this game (since-last) and keeps the set current (hold/retire/add, 1–3), informed by the Home-screen goal.

**Technical approach** — net-new logic concentrates in:

- A pure **`domain/report/anchorCatalog.ts`** that enumerates evidence anchors from the already-computed `MatchReport` (stat keys, `objective#n`/`teamfight#n`/`death#n` markers, benchmark ids) and a **`compactContext.ts`** that serialises the report + catalog into a terse, token-light encoding for the model (spec FR-026a, hybrid-anchoring FR-007).
- A pure **`domain/report/metricRegistry.ts`** mapping focus-task `metric` keys → deterministic extractors over the report/timeline, used both to **validate** generated tasks (Constitution: drop non-computable metrics) and to **evaluate** standing tasks (improved/held/regressed/not_applicable).
- A new **`MatchCoachingModel`** port with one method per pass, implemented by **`AnthropicMatchCoachingModel`** (forced tool-use + per-pass schema validation, light vs heavy model tier injected). Pure prompt builders + validators in `adapters/driven/anthropic/matchPrompts.ts` are table-tested with a fake `CreateMessage`.
- An **`AnalyzeMatch`** command orchestrating features → (pass1 ‖ pass2) → pass3 → pass4, persisting each pass output as a **domain-structured DTO** and tolerating per-pass failure (FR-005); a `GetMatchAnalysis` query restores the stored read on report open with **zero** model calls (FR-027).
- Storage: evolve the existing (unused) `coach_reports`/`focus_tasks`/`task_evaluations` tables — store the assembled `MatchAnalysis` per match, and **re-key `focus_tasks` from per-match to global per-user** (the one schema change).

Renderer: a `stubs/matchAnalysis.ts` mirroring the new `MatchAnalysis` DTO (Constitution VIII), a `useMatchAnalysis` hook calling `window.api.analyzeMatch` / `getMatchAnalysis`, and re-pointing `CoachReport.tsx`'s gated sections from `REPORT_WIN/LOSS` to the real DTO. The only **new** UI is the heavy prose-verdict section and the decoration slots; turning-points/focus/since-last components already exist and are bound.

## Technical Context

**Language/Version**: TypeScript 5.8, Node ≥22 (Electron 35 main), React 18 (renderer)
**Primary Dependencies**: existing — `@anthropic-ai/sdk` (already wired for session coaching), `better-sqlite3`, the shared `OpggMcpClient`/`OpggBenchmarkDataSource`, `bottleneck`. **No new dependencies.**
**Storage**: SQLite (existing DB). **One migration**: re-key `focus_tasks` to a global, per-user standing set (+ `status`, `source_match_id`, `created_at`, `updated_at`); reuse `coach_reports` to persist the assembled `MatchAnalysis` JSON per match (or a dedicated `match_analyses` table — see research D6); `task_evaluations` reused as-is (per evaluating match). The `features` table (existing, `match_id`→json) materialises the computed `MatchFeatures`/anchor catalog so passes and re-runs don't recompute.
**Models**: two tiers via injected model names — **light** `claude-haiku-4-5` (passes 1 & 2, $1/$5 per 1M, 200K ctx) and **heavy** `claude-opus-4-8` (passes 3 & 4, project default, $5/$25, 1M ctx). Both use forced tool-use (`tool_choice: {type:'tool', name:...}`) + per-pass schema validation, mirroring `AnthropicSessionCoachingModel`. Adaptive thinking on the heavy passes only.
**Testing**: Vitest with the existing `test/unit` + `test/fixtures` layout. Pure `domain/report/*` (anchor catalog, compact encoder, metric registry, task evaluation) are table-tested against the spec-003 real match+timeline fixtures. The model adapter is tested with a fake `CreateMessage` returning canned tool-use payloads (the `parseSessionAnalysis` pattern) — no network in tests.
**Target Platform**: Windows desktop (Electron); renderer is a local React SPA.
**Project Type**: Electron desktop app, hexagonal in the main process; React renderer outside the hexagon.
**Performance Goals**: Re-opening an analysed report restores from SQLite with **zero** model calls (SC-008). A full analysis is bounded by the model calls: passes 1 & 2 run concurrently (light/fast), then 3, then 4; the heavy passes consume the earlier passes' **compact** outputs, not raw JSON, keeping their input tokens low (SC-007). OP.GG benchmark fetch is bounded (~3s timeout, cached, general fallback) and only on the analysis path.
**Constraints**: domain/application import no SDK/`electron` (Constitution IV); secrets stay main-process (VI); analysis runs against stored raw JSON (VII) — re-open is offline, the analysis *action itself* requires connectivity (LLM + optional OP.GG); frontend built/approved against a stub before wiring (VIII); evidence-anchored structured output, no invented figures (Constitution II); tasks carry computable metrics only (drop otherwise).
**Scale/Scope**: single user; one `MatchAnalysis` per analysed match; one standing global focus-task set. New: 1 command (`AnalyzeMatch`) + 1 query (`GetMatchAnalysis`) + 1 port (`MatchCoachingModel`) + 1 adapter (`AnthropicMatchCoachingModel`) + pure `domain/report/` modules (anchor catalog, compact encoder, metric registry, features extractor, task evaluation) + repo methods (global tasks, analysis persistence) + 1 schema migration + 2 IPC channels (already declared: `analyzeMatch`, `getCoachReport` — repurpose/extend). Renderer: 1 stub + 1 hook + re-point `CoachReport.tsx`; 1 genuinely new section (prose verdict) + decoration slots.

### Carried caveat from spec 003 / M0.5

`better-sqlite3` Vitest runs need a Node-ABI build (the app targets Electron's ABI), so SQLite-repository tests may not run under plain `npm test`. The testable heart of this feature is the **pure** `domain/report/*` modules (anchor catalog, compact encoder, metric registry, task evaluation, features extractor) and the **adapter validators** (fake `CreateMessage`) — none touch the native module. Repository methods (global tasks, analysis upsert) are kept thin.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle IV — Hexagonal Architecture**: All inference logic lives behind the `MatchCoachingModel` **port**; the `@anthropic-ai/sdk` import is confined to `adapters/driven/anthropic/AnthropicMatchCoachingModel.ts` (the existing pattern). `AnalyzeMatch` is an `application/commands/` use case, `GetMatchAnalysis` an `application/queries/` use case. Pure inference-free logic (anchor catalog, compact encoder, metric registry, features extractor, task evaluation) lives in `domain/report/` with zero imports. Persistence is added repo methods; wiring is in `infrastructure/container.ts`; IPC handlers stay thin. `domain/`/`application/` import no SDK or `electron`.
- [x] **Principle VI — Secrets in Main Process**: The Anthropic key stays in the main process (reused from the existing session-coaching wiring); the OP.GG client is keyless. The renderer sends a `matchId` and receives the `MatchAnalysis` DTO only. No key crosses preload.
- [x] **Principle VIII — Frontend First**: A new `src/renderer/src/stubs/matchAnalysis.ts` mirrors the `MatchAnalysis` DTO (win / loss / partial-failure / no-timeline / first-game-tasks states). `CoachReport.tsx` is re-pointed from the `REPORT_WIN/LOSS` mock to the stub and reviewed across those states, then wired by swapping the stub for `window.api.analyzeMatch()` / `getMatchAnalysis()` with no layout change. The existing turning-point / focus-task / since-last components are reused unchanged; only the prose-verdict section and decoration slots are added — against the stub first.
- [x] **Principle V — Test-First**: Each pure module is table-tested against the spec-003 stored match+timeline fixtures (anchor catalog ids, compact encoding shape, metric registry values, task evaluation verdicts, features extractor). The adapter's prompt builders + validators are tested with a fake `CreateMessage` (canned tool-use → validated DTO, and malformed → throws), mirroring `AnthropicSessionCoachingModel.test`. No test hits the network.
- [x] **Principle VII — Offline-First**: Features and the report are computed from already-stored `matches.raw_json` / `timelines.raw_json`; the stored `MatchAnalysis` is restored on re-open with **no** model call (FR-027/SC-008). The analysis *action* requires connectivity (LLM, optional OP.GG) — that is inherent to producing a new read, not a violation of offline-first reads. OP.GG stays bounded/cached/fallback.

**Result**: PASS with one tracked deviation (Principle III — personal comparison cohort deferred). See Complexity Tracking.

### Constitution-specific notes carried into design

- **Principle II (evidence-grounded, structured, no invented figures)** is the spine of this feature. The model returns **structured** output (forced tool-use); every structured claim carries an `evidenceRef` keyed into the **enumerated anchor catalog** built from the spec-003 facts (hybrid anchoring, spec FR-007 clarification); benchmark/note context is a typed free-form chip. Validators **drop** any structured claim whose anchor id is not in the catalog and reject any payload that invents a figure not in the compact context.
- **Principle III (personalised over generic)** — the full personal comparison cohort (`ResolveComparisonCohort`: exact-matchup → champion → role → benchmark, preferring the player's *winning* games, ≥3 samples) needs **other matches' stats**, which the spec **defers** (cross-game data out of scope, clarification 2). This iteration uses the OP.GG meta benchmark + general fallback (tagged basis), and pass 3 is built with a **pluggable context input** (FR-026b) so the personal cohort plugs in later. Tracked in Complexity Tracking.
- **Focus tasks are measurable objects** (Constitution Compliance §): generated tasks must carry a `metric` the `metricRegistry` can compute; tasks with a non-computable metric are dropped, never shown.
- **Honest about limits (FR-011/FR-015/FR-025)**: missing timeline → review still runs from core stats, narration/turning-points degrade with the existing "not available" note; thin data → provisional framing; partial-pass failure → show successes + retry.

## Project Structure

### Documentation (this feature)

```text
specs/004-ai-match-analysis/
├── plan.md              # This file
├── spec.md              # Feature specification (+ Clarifications)
├── research.md          # Phase 0 — model tiering, anchor scheme, compact format, metric registry, storage, orchestration
├── data-model.md        # Phase 1 — MatchAnalysis DTO + pass DTOs + entities + migration
├── quickstart.md        # Phase 1 — build/verify walkthrough (stub-first → wire → analyse a fixture)
├── contracts/           # Phase 1
│   ├── ipc-analyze-match.md         # analysis:match:run channel + AnalyzeMatch (command)
│   ├── ipc-get-analysis.md          # analysis:match:get channel + GetMatchAnalysis (query)
│   └── match-coaching-passes.md     # MatchCoachingModel port — the 4 pass contracts + schemas + anchor rules
└── checklists/
    └── requirements.md  # From /speckit-specify
```

### Source Code (repository root)

```text
src/
  main/
    domain/
      report/
        anchorCatalog.ts          # NEW — enumerate evidence anchors from MatchReport (stat/marker/benchmark ids) (pure)
        compactContext.ts         # NEW — terse token-light encoding of report+catalog for the model (pure, FR-026a)
        metricRegistry.ts         # NEW — metric key → extractor over report/timeline; validate + evaluate (pure)
        taskEvaluation.ts         # NEW — evaluate a standing FocusTask vs this game → improved|held|regressed|n/a (pure)
        matchFeatures.ts          # NEW — populate MatchFeatures from raw match+timeline (pure; reuses spec-003 extractors)
        assembleMatchReport.ts    # REUSE (spec 003) — factual report is the catalog's source of truth
      focusTask.ts                # NEW — FocusTask domain shape + standing-set invariants (1–3, scope) (pure)
    application/
      ports/
        MatchCoachingModel.ts     # NEW — analyzeFraming / analyzeNarration / analyzeReview / analyzeTasks (per pass)
        ReportRepository.ts       # EDIT — persist/get MatchAnalysis; global focus-task CRUD; task evaluations
        BenchmarkDataSource.ts    # REUSE — meta benchmark behind pass 3 (tagged basis)
        SessionGoalRepository.ts  # REUSE — Home-screen goal as stated intent (pass 3 + pass 4)
      commands/
        AnalyzeMatch.ts           # NEW — orchestrate features→(1‖2)→3→4, persist per-pass, partial-failure tolerant
      queries/
        GetMatchAnalysis.ts       # NEW — restore stored MatchAnalysis for a match (no model call)
    adapters/
      driven/
        anthropic/
          AnthropicMatchCoachingModel.ts  # NEW — implements MatchCoachingModel (forced tool-use, light/heavy tier)
          matchPrompts.ts                 # NEW — per-pass system/user prompt builders + SUBMIT tools + validators (pure)
        sqlite/
          SqliteReportRepository.ts       # EDIT — upsert/get match analysis; global focus-task CRUD; evaluations
          schema.ts                       # EDIT — migration: focus_tasks → global per-user (+status/source/timestamps)
        opgg/
          OpggBenchmarkDataSource.ts      # REUSE — champion/role/tier benchmark for pass 3
      driving/
        IpcController.ts          # EDIT — wire 'analysis:match:run' → AnalyzeMatch, 'analysis:match:get' → GetMatchAnalysis
    infrastructure/
      container.ts                # EDIT — construct AnthropicMatchCoachingModel (2 model names), AnalyzeMatch, GetMatchAnalysis
  preload/
    index.ts                      # EDIT — expose analyzeMatch (returns MatchAnalysis) + getMatchAnalysis
  shared/
    types.ts                      # EDIT — MatchAnalysis + pass DTOs, EvidenceRef, FocusTask (global), IpcApi updates
  renderer/src/
    stubs/
      matchAnalysis.ts            # NEW — stub MatchAnalysis states (win/loss/partial/no-timeline/first-game) (Constitution VIII)
    data/
      useMatchAnalysis.ts         # NEW — run/restore analysis (analysis:match:run / :get); states idle|running|done|partial|error
    screens/
      CoachReport.tsx             # EDIT — gated sections bind to MatchAnalysis (was REPORT_WIN/LOSS); add prose-verdict + decoration slots
    App.tsx                       # EDIT (light) — analyzed state restored from getMatchAnalysis on open (was in-memory + fake timeout)

test/
  fixtures/                       # REUSE spec-003 match-<id>.json / timeline-<id>.json (+ a no-timeline case)
  unit/
    anchorCatalog.test.ts         # NEW
    compactContext.test.ts        # NEW
    metricRegistry.test.ts        # NEW
    taskEvaluation.test.ts        # NEW
    matchFeatures.test.ts         # NEW
    matchPrompts.test.ts          # NEW — validators: canned tool-use → DTO; malformed → throw; off-catalog anchor dropped
    AnalyzeMatch.test.ts          # NEW — orchestration with a fake MatchCoachingModel + fake repos (pass order, partial failure)
    SqliteReportRepository.test.ts# EDIT — global focus-task CRUD + analysis upsert (ABI caveat applies)
```

**Structure Decision**: Follows the fixed hexagonal layout from `technical_brief.md` and mirrors spec 003. The testable heart is the pure `domain/report/*` modules plus the adapter validators; all inference is behind one port with one adapter (two model tiers injected). The renderer reuses the settled spec-003 report and its coaching components — only the prose-verdict section and decoration slots are new, built stub-first per Constitution VIII.

## Complexity Tracking

> One tracked deviation — spec-sanctioned scope limit, not an unjustified violation.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Principle III** personal comparison cohort (`ResolveComparisonCohort`, prefer winning games, ≥3 samples) is **not** implemented this iteration | The spec defers cross-game/other-match stats (clarification 2: "past matches out of scope"); the cohort inherently needs other matches' data | Implementing it now would pull in the deferred cross-game data foundation. Instead, pass 3 uses the OP.GG meta benchmark + general fallback (tagged basis, honest), and is built with a **pluggable context input** (FR-026b) so the personal cohort drops in later with no rework. Tracked here so the deferral is explicit, not silent. |
