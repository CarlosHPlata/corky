# Contract — IPC `analysis:match:run` → `AnalyzeMatch`

**Type**: command (mutates: persists `MatchAnalysis`, focus tasks, evaluations). One IPC channel.

## Channel

| | |
|---|---|
| Channel | `analysis:match:run` |
| Preload | `analyzeMatch(matchId: string, opts?: { force?: boolean }): Promise<MatchAnalysis>` |
| Handler | thin: validate `matchId` is a non-empty string → `AnalyzeMatch.execute(matchId, opts)` → return `MatchAnalysis` DTO |

`force: true` re-runs every pass (explicit re-analyse, FR-028 replace). Default (`force` absent/false): run only the sections not already `'done'` (retry-fills a partial run); if a full `'done'` read exists, return it without model calls.

## Use case `AnalyzeMatch.execute(matchId, opts)`

Ports injected (all existing except `MatchCoachingModel`): `MatchRepository` (raw match/timeline + current account), `ReportRepository` (analysis + global tasks + evaluations + features), `MatchCoachingModel`, `BenchmarkDataSource`, `SessionGoalRepository`, `{ lightModel, heavyModel }`, `now()`.

Flow (research D7):
1. `account = matchRepo.getCurrentAccount()`; load `rawMatch`/`rawTimeline`; `report = assembleMatchReport(...)`; `features = computeMatchFeatures(...)`; persist features; `catalog = buildAnchorCatalog(report)`.
2. `benchmark = benchmarkSource.getChampionBenchmark({champion, role, tier}).catch(()=>null)` → fallback general (tag basis).
3. `goal = goalRepo.get()`; per-match reflection passed through `opts`/context as stated intent.
4. **pass 1 ‖ pass 2** (`Promise.allSettled`, light tier) → `framing`, `narration` (narration skipped when no timeline).
5. **pass 3** (heavy): `review` from compact context + passes 1&2 compact outputs + benchmark + goal/reflection (pluggable `extras`).
6. **pass 4** (heavy): `standing = reportRepo.getFocusTasks(puuid)`; `sinceLast = standing.map(t => evaluateTask(t, report, features, priorEval))`; persist evaluations; model sets/adjusts the set; `enforceStandingSet` (1–3, computable metrics, scope); persist tasks.
7. Assemble `MatchAnalysis` (per-section status); `reportRepo.upsertMatchAnalysis(...)` (guard: don't overwrite a `'done'` read with a `'partial'`); return.

## Errors & edge cases

| Case | Behavior |
|---|---|
| `matchId` not stored locally | reject `not_found`; renderer shows "sync your games" (existing) |
| No timeline | `narration` section `'skipped'`; review still runs from core stats (FR-015); status may be `'done'` |
| A pass throws (model/parse) | that section `'error'`, others persist, `status='partial'`, retryable (FR-005) |
| OP.GG unavailable | general benchmark, basis tagged `general` (FR-008); never blocks |
| Malformed model payload | validator throws → caught as that pass's error; not rendered (FR-005) |
| Degenerate game (remake) | framing softens/omits MVP; review provisional/honest (FR-011/FR-019) |
| Re-run with `force` | every pass re-runs, replaces stored analysis (FR-028) |

## Acceptance (maps to SC)

- SC-001 single action returns a completed/partial read with per-section status.
- SC-007 passes 3/4 receive compact outputs, not raw JSON (assert in `AnalyzeMatch.test` via the fake model recording its input).
- SC-010 a thrown pass yields a retryable partial; a partial never overwrites a stored full read.
