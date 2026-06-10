# Phase 0 — Research: AI Match Analysis

Resolves the open decisions the spec left to planning (model tiering, the compact LLM wire format, the anchor catalog, the metric registry, storage, and orchestration). Every decision is grounded in the existing codebase patterns (spec 001's `AnthropicSessionCoachingModel`, spec 003's `assembleMatchReport`) and the constitution.

---

## D1 — Model tiering (light vs heavy)

**Decision**: Two injected model names. **Light tier `claude-haiku-4-5`** for passes 1 (caveats/framing) and 2 (highlight/death narration). **Heavy tier `claude-opus-4-8`** for passes 3 (overall review) and 4 (focus tasks). Both via forced tool-use; adaptive thinking enabled only on the heavy passes.

**Rationale**: Passes 1 & 2 are stat-grounded micro-text and short factual narration — Haiku 4.5 ($1 in / $5 out per 1M, 200K ctx) is the cheapest tier and ample, matching the spec's "lighter/decoration tier" (clarification 4). Passes 3 & 4 are the reasoning-heavy verdict and task generation that carry the product's value — Opus 4.8 is the project default and most capable ($5 / $25, 1M ctx). Model names are **config**, not hardcoded in domain (Constitution IV); the adapter takes `{ lightModel, heavyModel }`. This mirrors the existing split where `AnthropicCoachingModel`/`AnthropicSessionCoachingModel` already take a model string.

**Alternatives considered**: (a) Single Opus model for all four — rejected: wastes tokens on the decoration passes the spec explicitly wants cheap. (b) Sonnet 4.6 for the heavy tier — viable middle option ($3/$15) and a drop-in if cost matters, but Opus 4.8 is the project default and volume is tiny (single-user, on-demand). Left as a one-line config change.

**Request pattern** (from `AnthropicSessionCoachingModel`): `messages.create({ model, max_tokens, system, messages, tools:[SUBMIT_TOOL], tool_choice:{type:'tool', name} })`, then read the `tool_use` block's `input` and validate. `max_tokens`: framing ≈ 700, narration ≈ 1200, review ≈ 1500, tasks ≈ 1200 (non-streaming, well under the 16K timeout threshold). Heavy passes add `thinking:{type:'adaptive'}`.

---

## D2 — Structured output via forced tool-use (per pass)

**Decision**: Each pass defines its own `SUBMIT_*` tool (JSON-schema input) and is called with `tool_choice:{type:'tool', name}`. A pure validator (`parse*` per pass, in `matchPrompts.ts`) coerces/validates the tool `input` and **throws** on anything unusable — exactly the `parseSessionAnalysis` shape.

**Rationale**: Already proven in the codebase (`SUBMIT_TOOL` + `parseSessionAnalysis`), testable with a fake `CreateMessage`, and the constitution requires structured (not free-prose) coaching output. Forced tool-use is the established way to get schema-shaped JSON natively. (Structured-outputs `output_config.format` is an alternative, but the project already standardised on forced tool-use; staying consistent keeps one pattern.)

**Note on the prose verdict (pass 3)**: "prose" (clarification 4) means the *verdict copy* is prose — but it is still delivered as a **structured field** (`verdict.lead`/`verdict.gild` + a `claims[]` array of `{ text, evidenceRef }`). The model writes prose into the fields; it does not return free text. This satisfies both "prose verdict" and "structured, evidence-referenced output."

---

## D3 — Evidence anchoring: the enumerated anchor catalog (hybrid)

**Decision**: `anchorCatalog(report: MatchReport): AnchorCatalog` builds a flat, enumerated set of **anchor ids** from the spec-003 facts:
- `stat:<key>` — e.g. `stat:cs_at_10`, `stat:gold_at_14`, `stat:kda`, `stat:vision`, `stat:solo_deaths`, `stat:kill_participation` (the `Breakdown`/`MatchCore` fields).
- `marker:objective#<n>` / `marker:teamfight#<n>` / `marker:death#<n>` — one per spec-003 `Highlight` / `DeathMarker`, carrying the marker's `tMin`, side, and (for deaths) `x/yPct`.
- `benchmark:<metric>` — only when a benchmark basis was resolved (e.g. `benchmark:cs_per_min`).

The prompt's compact context lists these ids. The model must cite a `stat:`/`marker:` anchor for any **structured** claim; benchmark and note context may be cited as **typed free-form** strings (a chip, not pinned). The validator **drops** any structured claim whose `evidenceRef` id is not in the catalog (spec FR-007).

**Rationale**: This is the spec's clarified hybrid model and the constitution's `evidenceRef` requirement made concrete. Enumerating the anchors means the renderer can resolve `marker:death#3` → the exact death-map dot and `stat:gold_at_14` → the exact breakdown cell, and the model literally cannot invent a marker that isn't in the catalog. `EvidenceRef = { id: string; kind: 'stat'|'marker'|'benchmark'|'note'; }` (renderable fields like `tMin`/`xPct` are looked up from the catalog by id, not trusted from the model).

**Alternatives**: free-form prose refs (rejected — unanchorable, allows drift) and fully-enumerated-only (rejected — can't express a benchmark/notes citation that has no chart point). Hybrid is the clarified answer.

---

## D4 — Compact, token-efficient wire format (FR-026a)

**Decision**: `compactContext(report, catalog, extras)` emits a terse, line-oriented block (not raw JSON) — `key=value` lines and `id|field|field` rows — e.g.:

```
GAME win=Y champ=Ahri role=MID dur=27:14 queue=ranked_solo
CORE kda=3.1 k/d/a=8/4/6 cs=201 csmin=7.4 gold=12.3k gpm=452
BREAK cs@10=78 gold@14=+310 gold@24=-1240 vision=24 solo=2 kp=0.58
MARK objective#1|drake|14:02|ally
MARK objective#2|baron|24:40|enemy
MARK teamfight#1|24:31|enemy|wipe 4-1
MARK death#3|22:10|x47|y61
BENCH cs_per_min|champ_patch|7.0
NOTE goal="convert one 20-min lead into a closed game"
```

Passes 3 & 4 additionally receive the **compact outputs of passes 1 & 2** (the framing one-liners + the narration labels) the same way — never the raw match/timeline JSON (FR-026).

**Rationale**: JSON spends a large fraction of tokens on punctuation/quotes/keys; a columnar/`key=value` block carries the same facts in far fewer tokens (the spec's explicit concern, clarification 2). The renderable DTOs remain the source of truth in SQLite; this format is *only* the model-input projection. Token budget then goes to content. Tested by asserting the encoder is stable, lists every catalog id, and contains no figure absent from the report.

**Alternatives**: send the DTO JSON (rejected — token-wasteful, the spec called this out); a single lossy natural-language summary (rejected — harder to validate field-by-field, and passes 3/4 need the anchor ids verbatim to cite them).

---

## D5 — Metric registry (computable focus-task metrics)

**Decision**: `metricRegistry: Record<MetricKey, (ctx) => number | null>` over the report/features, with a fixed allowlist of keys the extraction engine can compute: `cs_at_10`, `cs_per_min`, `gold_at_14`, `gold_at_24`, `vision_score`, `solo_deaths`, `kill_participation`, `deaths`, (and a small set of derived ones, e.g. `objectives_present_first_two_drakes`). Two uses: **validate** generated tasks (a task whose `metric` is not in the registry is **dropped** — Constitution "tasks without a computable metric MUST NOT be generated"), and **evaluate** a standing task against a game (`taskEvaluation`).

**`taskEvaluation` verdict rule**: compute the metric for this game; if the task's `scope` (champion/role) doesn't match → `not_applicable`. Else compare the computed value to `target` via `comparator` → meets/doesn't; combine with the **prior** evaluation (if any) to label `improved` (now meets and previously didn't, or moved toward target) / `held` (still meets) / `regressed` (no longer meets or moved away). The since-last loop needs only this game + the standing task's last value, so it does **not** depend on the deferred cross-game match data (clarification 3).

**Rationale**: Directly implements the constitution's measurable-task object `{metric, comparator, target, scope}` and the spec's since-last loop, deterministically and testably (pure function over fixtures). Keeps the LLM out of the *scoring* — pass 4 only *sets/adjusts* tasks; the registry *evaluates* them.

---

## D6 — Storage of the enhanced read (domain-structured DTOs)

**Decision**: Persist the assembled `MatchAnalysis` per match as JSON in a dedicated **`match_analyses`** table (`match_id PRIMARY KEY, created_at, light_model, heavy_model, json, status`). One row per match; re-running replaces it; a partial run stores what succeeded with `status='partial'` and per-section status inside the JSON (FR-005/FR-028). Reuse the existing `coach_reports` table only if preferred, but a dedicated table keeps the spec-003 factual report and this analysis cleanly separated and makes "latest per match" trivial.

**Focus tasks → global per-user.** Re-key `focus_tasks`: drop the per-match `match_id` PK semantics; the standing set is keyed by `puuid` with `id`, `description`, `metric`, `comparator`, `target`, `scope`, `champion?`, `role?`, plus `status` (`active`/`retired`), `source_match_id`, `created_at`, `updated_at`. `task_evaluations` (`task_id`, `evaluating_match_id`, `result`, `actual_value`) is reused unchanged — it is the per-game since-last record.

**Migration**: the existing `focus_tasks`/`coach_reports`/`task_evaluations`/`features` tables are present but **unused** for match analysis, so the migration is additive/low-risk — add `match_analyses`, add the new `focus_tasks` columns (or recreate the table since it holds no data), and add an index on `focus_tasks(puuid, status)`. `runMigrations` is idempotent (`CREATE TABLE IF NOT EXISTS` / guarded `ALTER`).

**Rationale**: Matches clarification 2 (domain-structured DTOs, one per pass, persisted per match) and clarification 3 (tasks are global per-user, aligning with the technical brief's `focus_tasks`/`task_evaluations` read models). Re-open reads one row → DTO (no model call, SC-008). The compact wire format (D4) is derived at prompt-build time, not stored, so storage stays renderable and human-inspectable.

---

## D7 — Orchestration, concurrency & partial failure

**Decision**: `AnalyzeMatch.execute(matchId)`:
1. Load account + raw match/timeline (repo); `assembleMatchReport` → report; `matchFeatures` → features; `anchorCatalog` → catalog; persist features to the `features` table (materialise once).
2. Resolve the OP.GG benchmark for the player's champion/role/tier (bounded, cached, general fallback; tag basis).
3. Run **pass 1 ‖ pass 2** concurrently (`Promise.allSettled`) on the light tier.
4. Run **pass 3** (heavy) with the compact context + passes 1&2 compact outputs + benchmark + goal/reflection (the **pluggable extras** input, FR-026b).
5. Run **pass 4** (heavy): load standing tasks → `taskEvaluation` each against this game (deterministic) → call the model to set/adjust the standing set (validate metrics via the registry, enforce 1–3 + scope) → persist tasks + evaluations.
6. Assemble `MatchAnalysis` (per-section status), upsert into `match_analyses`, return the DTO.

**Partial failure (FR-005)**: each pass is wrapped; a failed pass records `{ status:'error' }` for its section, the rest persist, and `status='partial'`. A retry re-runs only the sections not yet `'done'`; `analyzeMatch(matchId, { force })` re-runs all. A failed/partial run never overwrites a previously good full read (FR-028) — upsert guards on this.

**Rationale**: Honours the spec's pass ordering (3 after 1&2; 4 uses the read + standing tasks), the disjoint-section ownership (no pass overwrites another), and the resilience requirement. `Promise.allSettled` for 1&2 keeps a single light-pass failure from sinking the other. The orchestrator is pure-ish (I/O via injected ports), so `AnalyzeMatch.test` drives it with a fake `MatchCoachingModel` + fake repos to assert ordering and partial-failure behaviour without the network.

---

## D8 — Trigger & renderer wiring (respect existing UX)

**Decision**: Keep the existing manual **"Analyze this match"** action (spec assumption — auto-on-sync is out of scope). Replace `CoachReport.tsx`'s fake `setTimeout` analyze with `useMatchAnalysis` → `window.api.analyzeMatch(matchId)`; restore a stored read on open via `window.api.getMatchAnalysis(matchId)` (so `analyzed` state survives restart, replacing the in-memory `Record` in `App.tsx`). The gated sections bind to the real `MatchAnalysis`; the only **new** UI is the prose-verdict section and the decoration slots (MVP-style label, matchup tips, title-bar text, captions). Turning-points, focus-task, and since-last components are reused unchanged.

**Rationale**: The user's steer — UX mostly complete, respect it, only the heavy section + decorations are new. The existing `analyzeMatch`/`getCoachReport` IPC stubs and DTO names already exist in `shared/types.ts`, so wiring is mostly filling them in. Constitution VIII: build the new prose-verdict + decoration slots against `stubs/matchAnalysis.ts` first, then swap the import.

---

## Resolved unknowns summary

| Spec deferral | Resolution |
|---|---|
| "lower model" for the tiny pass | D1 — light `claude-haiku-4-5`, heavy `claude-opus-4-8`, injected as config |
| op.gg "what to use" | Reuse existing `OpggBenchmarkDataSource` (champion/role/tier benchmark, tagged basis, general fallback) behind pass 3 |
| agent-readable storage / "don't lose tokens" | D4 compact wire format + D6 domain-structured DTO storage; passes 3/4 read compact outputs, never raw JSON |
| evidence anchoring mechanism | D3 enumerated anchor catalog (hybrid) |
| since-last loop without cross-game data | D5 metric registry + standing global tasks (needs only this game + standing set) |
| exact DTO/schema/migration | D6 + data-model.md |
| pass orchestration / partial failure | D7 |
