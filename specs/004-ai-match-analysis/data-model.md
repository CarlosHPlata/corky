# Phase 1 — Data Model: AI Match Analysis

All cross-boundary types are **DTOs in `src/shared/types.ts`**; pure pass outputs and validators live in `domain/`/`adapters/anthropic`. The DTO field names are chosen to **map onto the existing renderer mock** (`ReportMock` in `mockData.ts`) so `CoachReport.tsx`'s gated sections bind with no layout change (user steer: respect the UX). Reuses spec-003 `MatchReport` unchanged as the catalog source.

## Top-level — `MatchAnalysis` (per match, persisted, restored on open)

| Field | Type | Notes |
|---|---|---|
| `matchId` | `string` | |
| `result` | `'win' \| 'loss'` | from the factual report (decoration/verdict framing) |
| `framing` | `FramingOutput \| null` | pass 1 (decoration layer); `null` if pass failed |
| `narration` | `NarrationOutput \| null` | pass 2; `null` if failed or no timeline |
| `review` | `ReviewOutput \| null` | pass 3 (prose verdict); `null` if failed |
| `tasks` | `TasksOutput \| null` | pass 4; `null` if failed |
| `status` | `'done' \| 'partial'` | `partial` ⇒ at least one section is `null`/errored |
| `sections` | `Record<PassKey, SectionStatus>` | `{ framing, narration, review, tasks }` → `'done' \| 'error' \| 'skipped'` (skipped = no timeline for narration) |
| `lightModel` / `heavyModel` | `string` | which models produced it (honesty/repro) |
| `generatedAt` | `number` | epoch ms |

`PassKey = 'framing' \| 'narration' \| 'review' \| 'tasks'`. The renderer shows a per-section retry when `sections[k] === 'error'` (FR-005).

## Pass 1 — `FramingOutput` (decoration layer, US3)

The flexible micro-text slots the UX exposes (clarification 5). All stat-grounded; omitted/softened when degenerate.

| Field | Type | Maps to |
|---|---|---|
| `headlineTag` | `string` | `VerdictCard` tag (`ReportMock.headlineTag`) |
| `headlineTagIntent` | `'win'\|'loss'\|'objective'\|'accent'\|'warn'\|'info'\|'neutral'` | `ReportMock.headlineTagIntent` |
| `quickRead` | `string` | one-line read under the verdict eyebrow |
| `mvp` | `{ champion: string; isYou: boolean; teamId: number; justification: string } \| null` | MVP-style label; `null` on remake/degenerate |
| `matchupTips` | `string[]` | short tips in the Matchup section |
| `captions` | `Record<string, string>` | optional slot→caption map (title-bar text, section spans); UX-defined keys |

> Pass 1 owns this section; no other pass writes these fields (FR-002a). All texts are factual paraphrases of the compact context — no benchmark/coaching reasoning.

## Pass 2 — `NarrationOutput` (highlights & deaths, US2)

| Field | Type | Notes |
|---|---|---|
| `highlightNarrations` | `HighlightNarration[]` | one per spec-003 `Highlight`, by anchor id |
| `deathNarrations` | `DeathNarration[]` | one per player death, by anchor id |
| `turningPoints` | `TurningPoint[]` | the selected swings (maps to `ReportMock.turningPoints` / `TurningPoint` component) |

`HighlightNarration`: `{ ref: EvidenceRef /* marker:objective#n|teamfight#n */, text: string }`.
`DeathNarration`: `{ ref: EvidenceRef /* marker:death#n */, character: 'caught_out'\|'overextended'\|'fair_fight'\|'objective_trade'\|'unclear', text: string }` (`unclear` ⇒ left factual, not guessed — FR-013).
`TurningPoint` (existing component props): `{ time: string; swing: string; dir: 'up'\|'down'; you: Pos; event: Pos; objective?: Pos; what: string; better: string }` — `time`/positions are resolved from the anchor catalog by `ref`, not trusted from the model; `what`/`better` are the model's narration. `Pos = { x:number; y:number }` (0–100).

> `narration = null` and `sections.narration = 'skipped'` when the match has no timeline (FR-015) — the report shows the existing "not available for this game" note.

## Pass 3 — `ReviewOutput` (prose verdict, US1)

| Field | Type | Maps to |
|---|---|---|
| `verdict` | `{ lead: string; gild: string }` | `VerdictCard` body (`ReportMock.verdict`) — prose, evidence embedded via `claims` |
| `claims` | `ReviewClaim[]` | each structured claim + its anchor |
| `cohort` | `string` | the basis label shown as a badge (`ReportMock.cohort`), e.g. "vs Ahri mid meta (patch)" or "vs general benchmark" |
| `benchmarkBasis` | `'champion_patch'\|'rank_general'\|'general'` | tag of the reference actually used (FR-008) |
| `confidence` | `'established'\|'provisional'` | provisional on thin/missing data (FR-011/FR-032) |

`ReviewClaim`: `{ text: string; ref: EvidenceRef }` — structured claims cite a `stat:`/`marker:` catalog anchor (dropped if off-catalog); benchmark/note context uses `kind:'benchmark'|'note'` typed refs (chip, not pinned). `EvidenceRef = { id: string; kind: 'stat'|'marker'|'benchmark'|'note'; label?: string }`.

## Pass 4 — `TasksOutput` (focus tasks & since-last, US4)

| Field | Type | Maps to |
|---|---|---|
| `standing` | `FocusTask[]` | the current global set after this game (1–3) → `ReportMock.nextFocus` |
| `sinceLast` | `FocusTaskEval[]` | each prior standing task evaluated against this game → `ReportMock.sinceLast` |
| `firstTime` | `boolean` | true when no standing set existed before (clean since-last state, FR-023) |

`FocusTask` (DTO, **global per-user**): `{ id: string; description: string; metric: MetricKey; comparator: '>='|'<='|'=='|'>'|'<'; target: number; scope: 'champion'|'role'|'universal'; champion?: string; role?: string; status: 'active'|'retired'; sourceMatchId: string }`. Generated tasks whose `metric` is not in the registry are dropped (Constitution).
`FocusTaskEval` (maps to the `FocusTask` component props): `{ description: string; metric: MetricKey; comparator: string; target: string; scope: string; actual?: string; result: 'improved'|'held'|'regressed'|'not_applicable' }`.

## Reused (spec 003, unchanged) — `MatchReport`

The factual report (`MatchCore`, `Matchup`, `Breakdown`, `GoldTimeline`+`Highlight[]`, `DeathMap`+`DeathMarker[]`). It is the **single source of truth** for the anchor catalog and the compact context — the model annotates it and never invents figures (Constitution II).

## Domain shapes (pure — `domain/report/`)

| Module | Function | In → Out |
|---|---|---|
| `matchFeatures.ts` | `computeMatchFeatures(rawMatch, rawTimeline, puuid)` | → `MatchFeatures` (existing type) |
| `anchorCatalog.ts` | `buildAnchorCatalog(report)` | `MatchReport` → `AnchorCatalog` (`Map<id, Anchor>`) |
| `compactContext.ts` | `toCompactContext(report, catalog, extras?)` | → terse string (model input) |
| `metricRegistry.ts` | `computeMetric(key, report, features)` | → `number \| null` (null = not reached / scope n/a) |
| `metricRegistry.ts` | `isComputable(key)` | → `boolean` (validate generated tasks) |
| `taskEvaluation.ts` | `evaluateTask(task, report, features, prior?)` | → `FocusTaskEval` (`improved\|held\|regressed\|not_applicable`) |
| `focusTask.ts` | `enforceStandingSet(tasks)` | clamp to 1–3, validate metrics/scope (pure) |

`Anchor = { id: string; kind: 'stat'|'marker'|'benchmark'; tMin?: number; side?: 'ally'|'enemy'|'neutral'; xPct?: number; yPct?: number; value?: number }`.

**Validation rules** (enforced in validators / asserted in tests):
- A structured claim/narration whose `ref.id` ∉ catalog is **dropped** (FR-007).
- A payload citing a numeric figure not present in the compact context is rejected (no invented figures, Constitution II).
- `standing.length` ∈ [1,3]; every `metric` passes `isComputable` (drop otherwise); `scope` ∈ {champion,role,universal} with `champion`/`role` set when scoped.
- `narration` is `null`/`skipped` when timeline absent; `framing.mvp` is `null` on degenerate games (FR-019).
- `confidence='provisional'` when the report lacks timeline or the game is very short.

## Persistence

**New table** `match_analyses` (`match_id PRIMARY KEY, created_at, light_model, heavy_model, status, json`) — `json` is the serialized `MatchAnalysis`. Upsert replaces on re-run; a partial/failed run never overwrites a stored full read (FR-028). Restored verbatim by `GetMatchAnalysis` (no model call, SC-008).

**Migrated table** `focus_tasks` → **global per-user** (`id PRIMARY KEY, puuid, description, metric, comparator, target, scope, champion, role, status, source_match_id, created_at, updated_at`) + index `(puuid, status)`. Holds the standing set (1–3 `active`).

**Reused** `task_evaluations` (`task_id, evaluating_match_id, result, actual_value`, PK `(task_id, evaluating_match_id)`) — the per-game since-last record. **Reused** `features` (`match_id`→json) — materialised `MatchFeatures`/catalog so re-runs/passes don't recompute.

## Entity relationships

```
MatchReport (spec 003, facts) ──source──▶ AnchorCatalog ──▶ compactContext ──▶ model passes
analyzeMatch(matchId) ──▶ MatchAnalysis (match_analyses)
   ├─ framing   (pass 1, decoration)
   ├─ narration (pass 2)  ── refs ──▶ AnchorCatalog (marker:objective/teamfight/death#n)
   ├─ review    (pass 3, prose verdict + claims) ── refs ──▶ AnchorCatalog (+ benchmark/note chips)
   └─ tasks     (pass 4)
FocusTask[] (global per-user, focus_tasks) ──evaluateTask──▶ FocusTaskEval[] (task_evaluations) ──▶ sinceLast
SessionGoal (spec 002) ──stated intent──▶ pass 3 + pass 4
BenchmarkReference (OP.GG, tagged basis) ──▶ pass 3
```
