# Quickstart — AI Match Analysis (Corky's read)

Build/verify walkthrough. Order follows Constitution VIII (frontend-first) and V (test-first on the pure core). Prereq: spec-003 factual report is in place; the Anthropic key is in `.env` (already used by session coaching).

## 1. Stub-first renderer (Constitution VIII)

1. Add `src/renderer/src/stubs/matchAnalysis.ts` with `MatchAnalysis` fixtures: a **win**, a **loss**, a **partial** (review `null`, `sections.review='error'`), a **no-timeline** (narration `'skipped'`), and a **first-game tasks** (`tasks.firstTime=true`) state.
2. Re-point `CoachReport.tsx`'s gated sections from `REPORT_WIN/LOSS` to the stub: bind verdict → `review.verdict`, headline tag → `framing.headlineTag/Intent`, cohort → `review.cohort`, turning points → `narration.turningPoints`, next-focus → `tasks.standing`, since-last → `tasks.sinceLast`.
3. Add the **new** UI only: the prose-verdict section copy and the decoration slots (MVP-style label from `framing.mvp`, matchup tips from `framing.matchupTips`, title-bar/captions from `framing.captions`). Reuse `VerdictCard`/`TurningPoint`/`FocusTask` unchanged.
4. Review all five states against the stub. **Sign off the UI before any backend wiring.**

## 2. Pure domain (Constitution V — test against spec-003 fixtures)

Implement and table-test, in order:
1. `domain/report/matchFeatures.ts` → `matchFeatures.test.ts` (values vs an external reference for a stored game).
2. `domain/report/anchorCatalog.ts` → `anchorCatalog.test.ts` (one anchor per breakdown stat + per highlight/death; ids stable).
3. `domain/report/compactContext.ts` → `compactContext.test.ts` (lists every catalog id; contains no figure absent from the report; stable output).
4. `domain/report/metricRegistry.ts` → `metricRegistry.test.ts` (`computeMetric` matches the breakdown; `isComputable` allowlist).
5. `domain/report/taskEvaluation.ts` + `focusTask.ts` → `taskEvaluation.test.ts` (improved/held/regressed/not_applicable incl. scope mismatch; standing-set clamp to 1–3).

All pure, no native module, run under plain `npm test`.

## 3. Model adapter (forced tool-use, fake CreateMessage)

1. `adapters/driven/anthropic/matchPrompts.ts`: per-pass `SUBMIT_*` tool + system/user builders + `parse*` validators.
2. `AnthropicMatchCoachingModel.ts`: implements `MatchCoachingModel`; `fromApiKey` wraps the SDK; light/heavy model injected.
3. `matchPrompts.test.ts`: canned tool-use → DTO; malformed → throws; off-catalog `ref` dropped; out-of-context figure rejected; non-computable metric dropped. (Mirror `AnthropicSessionCoachingModel.test`.)

## 4. Storage + migration

1. `schema.ts`: add `match_analyses`; migrate `focus_tasks` → global per-user (+ `status`,`source_match_id`,`created_at`,`updated_at`, index `(puuid,status)`). Idempotent.
2. `SqliteReportRepository.ts`: `upsertMatchAnalysis` / `getMatchAnalysis` (guard partial-over-full); global `getFocusTasks(puuid)` / `saveFocusTasks` / `retireTask`; reuse `insertTaskEvaluation`. `SqliteReportRepository.test.ts` (ABI caveat applies — keep thin).

## 5. Orchestrator + queries + wiring

1. `application/commands/AnalyzeMatch.ts` + `AnalyzeMatch.test.ts` (fake `MatchCoachingModel` + fake repos: assert pass order 1‖2→3→4, partial-failure persists successes, passes 3/4 receive compact strings not raw JSON, partial never overwrites full).
2. `application/queries/GetMatchAnalysis.ts`.
3. `infrastructure/container.ts`: construct `AnthropicMatchCoachingModel(create, lightModel, heavyModel)`, `AnalyzeMatch`, `GetMatchAnalysis`.
4. `IpcController.ts`: register `analysis:match:run` / `analysis:match:get`. `preload/index.ts`: expose `analyzeMatch` (returns `MatchAnalysis`) + `getMatchAnalysis`. `shared/types.ts`: add the DTOs + IpcApi methods.

## 6. Wire renderer (swap stub → IPC)

1. `data/useMatchAnalysis.ts`: hydrate via `getMatchAnalysis` on mount; run via `analyzeMatch`; states idle/running/done/partial/error.
2. In `CoachReport.tsx`/`App.tsx`: swap the `stubs/matchAnalysis` import for the hook; remove the fake `setTimeout`; restore `analyzed` from the stored read. **No layout change.**

## 7. End-to-end verify (against a stored fixture game)

- Open an analysed-fresh report → "Analyze this match" → verdict + narrated turning points + MVP/decoration + 1–3 focus tasks appear; status `done`.
- Re-open after restart → read restored, **no** model call (SC-008).
- A game with no timeline → review still renders, timeline/turning-points show "not available" (FR-015/SC-009).
- Force a pass error (e.g. stub a malformed model reply) → successful sections show, failed section offers retry; re-run fills it (SC-010).
- Verify SC-002/003/004: every review claim resolves to a visible anchor; benchmark basis labelled; death/highlight narrations match their markers.
