# Phase 0 — Research: Match List & Match Report

All "unknowns" here are **data-mapping** and **threshold** decisions (the spec already flagged the thresholds as tuning details). No external library choices are needed — the stack, persistence, and rate-limited Riot client already exist. Riot field shapes below are from `match-v5` (`/matches/{id}` and `/matches/{id}/timeline`), which are **already fetched and stored** as `raw_json`.

## D1 — Where each report number comes from (match-v5)

**Decision**: Compute every figure from the stored match **detail** (`info.participants[]`) and **timeline** (`info.frames[]`), no re-fetch.

| Report figure | Source | Notes |
|---|---|---|
| KDA (k/d/a + ratio) | `participant.kills/deaths/assists`; ratio `(k+a)/max(1,d)` | ratio computed in domain, not from Riot |
| CS, CS/min | `totalMinionsKilled + neutralMinionsKilled`; ÷ `gameDuration/60` | matches existing `extractMatchSummary` |
| Gold, gold/min | `participant.goldEarned`; ÷ minutes | |
| Matchup | participants grouped by `teamId` (100/200), paired by `teamPosition` | lane opponent = enemy with same `teamPosition`; "you" = `puuid` match |
| Team gold-diff series | per timeline frame: Σ `participantFrames[1..5].totalGold` − Σ `[6..10]`, signed to the player's team | frames ~every 60s; `timestamp` in ms |
| CS @ 10 | participantFrame nearest 600000 ms: `minionsKilled + jungleMinionsKilled` | "not reached" if no frame ≥ 10:00 |
| Gold @ 14 / @ 24 | player-vs-lane-opponent gold diff at 840000 / 1440000 ms frames | mock shows lane lead ("+1.4k @ 14"); "not reached" if game ended earlier |
| Vision score | `participant.visionScore` (detail) | optionally /min for display |
| Solo deaths | timeline `CHAMPION_KILL` where `victimId` = player **and** no allied `assistingParticipantIds` **and** no ally within radius/window | see D3 |
| Kill participation | prefer `participant.challenges.killParticipation` when present; else `(kills+assists)/teamKills` | Riot provides `challenges` on recent patches; fallback keeps old matches working |
| Death map | timeline `CHAMPION_KILL` where `victimId` = player → `position {x,y}` + `timestamp` | normalize x/y to 0–100% of map extent (see D2) |
| Highlights | timeline `ELITE_MONSTER_KILL`, `BUILDING_KILL`, `CHAMPION_KILL` | see D3 |

**Rationale**: All player-visible, all already stored (Constitution VII), matches the existing `extractMatchSummary` conventions so the list and report agree.
**Alternatives considered**: OP.GG for per-game numbers — **rejected** (technical_brief: player's own facts come from Riot; OP.GG is meta-only and makes no account lookups).

## D2 — Map coordinate normalization (death map)

**Decision**: Summoner's Rift world coordinates run ~`0..14870` on both axes. Normalize `xPct = x/14870*100`, and **invert Y for screen space** (`yPct = (1 − y/14870)*100`) so the in-game bottom-left origin maps to the visual map. Clamp to [0,100].
**Rationale**: The death-map component positions markers by `left%/top%`; normalized coords drop straight in. Exact map bounds vary by a few hundred units across history but are visually negligible for a coaching heat-read.
**Alternatives considered**: Per-patch exact bounds — rejected as over-precision for this use; a single constant is fine and documented.

## D3 — Deterministic highlight rules (FR-016/017/018, "No LLM")

All inference is rule-based over the kill/objective event stream. Defaults below are the spec's flagged tuning values; they live as named constants in `domain/report/highlights.ts` so they're trivially adjustable.

**Objectives (FR-016)** — one highlight per event, no thresholds:
- `ELITE_MONSTER_KILL` → type by `monsterType`: `DRAGON` (incl. `monsterSubType` for label, e.g. "Infernal"), `RIFTHERALD`, `BARON_NASHOR`, `ELDER_DRAGON`. Side = `killerTeamId`.
- `BUILDING_KILL` with `buildingType = INHIBITOR_BUILDING` → inhibitor highlight. Side = team opposite the destroyed building. (Towers are optional/secondary — included only if needed for density; default off to avoid clutter.)
- Spec names dragon/baron/inhibitor at minimum; herald/elder included because the same event type yields them for free (and the spec's edited US3 lists "herald, etc.").

**Team-wipe / almost-wiped (FR-017)**:
- Cluster `CHAMPION_KILL` events with gaps ≤ **15 s** into a "fight".
- Flag the fight when one side suffers **≥ 3 deaths** within the window **and** the net death difference is **≥ 2** (so a 3-for-3 brawl isn't a "wipe"). Label "Team wiped" at ≥4 with ≤1 back, else "Almost wiped". Carry deaths-per-side counts.

**Death → gold swing (FR-018)**:
- For each player death (or tight death cluster), compare the team gold-diff at the frame **before** vs the frame within **~90 s after**; flag when the swing magnitude ≥ **1000 gold** against the player's team.
- Ties the death `timestamp` to the swing value for the marker description ("Death at 22:10 → −1.6k over the next minute").

**Highlight → timeline anchoring (FR-019)**: each highlight carries its `timestamp` (ms); the renderer's `MatchTimeline` already interpolates the curve value at a given time (`valueAt`) and pins the marker on the line — so the marker and curve align with no extra data.

**Rationale**: Deterministic, explainable, fixture-testable; thresholds chosen to suppress noise (spec edge case "ambiguous almost-wiped"). Descriptions are factual templates, never coaching (FR-020).
**Alternatives considered**: ML/heuristic "teamfight importance" scoring — rejected (non-deterministic, untestable, and the LLM layer is explicitly out of scope).

## D4 — Pagination & infinite scroll (US1, FR-003/005/006/009)

**Decision**: **Cursor pagination over the local DB**, cursor = the last row's `game_creation` (with `match_id` as a stable tiebreak). `GetMatchPage({ before?, limit=20 })` returns `{ matches, nextCursor }`; `nextCursor` is null when the local store is exhausted. Ordering reuses the existing `ORDER BY game_creation DESC`.
- **Extending history beyond the local store**: when a page comes back short / `nextCursor` null but the player keeps scrolling, the hook calls `syncMatches` with a **`start` offset** = current stored count to fetch the next older Riot window, then re-queries the next local page. `MatchDataSource.listMatchIds` and `RiotApiClient` gain an optional `start` (match-v5 supports `start` & `count`); `SyncRecentMatches` stays idempotent (skips stored IDs).
- **No duplicate/skip (FR-005)**: the hook guards an in-flight flag per cursor; cursor-by-`game_creation` is monotonic so appends never reorder.

**Rationale**: Offset pagination on a growing local table is fine at single-user scale, but a `game_creation` cursor is robust to new syncs inserting at the head mid-scroll. Reuses the existing idempotent sync for the rare "scroll past everything synced" case.
**Alternatives considered**: (a) load-all then client-slice — rejected (defeats "query the next page" intent, FR-003); (b) a separate `FetchOlderMatches` command — rejected as redundant since `SyncRecentMatches` already does exactly this once it takes a `start`.

## D5 — Compute-on-read vs. persist features (`features` table exists)

**Decision**: **Compute the `MatchReport` on read** in `GetMatchReport`, from stored raw JSON. Do **not** persist to the `features` table in this feature.
**Rationale**: A single match's extraction is a few linear passes over one timeline — effectively instant — and the raw JSON is already the durable offline source (Constitution VII). Adding a cache invites staleness/migration overhead for no felt latency win at single-match granularity.
**Alternatives considered**: Materialize into `features` (build-plan M1) — deferred; it pays off for *cross-game* aggregation (trends/Flow A), not single-report rendering. Left as a clean future optimization behind the same query.

## D6 — Frontend wiring without UI redesign (Constitution VIII, user directive)

**Decision**: Keep the existing screens' visual structure; introduce stubs shaped to the new DTOs, re-point the **factual** sub-components to them, review across states, then swap to `window.api.*`. The report's mock-only AI fields (verdict, turning points, focus tasks, since-last, per-death labels, stat deltas/cohort captions) stay sourced from their current gated placeholders — this feature does not feed them.
**Rationale**: Honors "respect the UX, minimize UI changes": layout and components are reused; only the data source changes. Satisfies the mandatory stub→approve→wire order by formalizing stubs at the real DTO shape.
**Alternatives considered**: Map real data into the old `MatchMock`/`ReportMock` shapes at the boundary — rejected because those shapes bake in AI-read fields and string-formatted values; a clean `MatchReport` DTO keeps the factual/AI split honest and makes the later Flow A wiring additive.

## D7 — Test fixtures (Constitution V, build-plan M1)

**Decision**: Capture **≥2 real** match+timeline pairs (one win, one loss; a standard Summoner's Rift ranked game each) as `test/fixtures/match-<id>.json` + `timeline-<id>.json`, plus one **edge fixture** (a short/remake game) to exercise "not reached" breakpoints and the no-timeline degrade path. Source them from the dev DB after a sync (the `raw_json` rows are exactly the Riot payloads).
**Rationale**: Pure extractors are table-tested against these; numbers sanity-checked vs op.gg (Principle V acceptance). Fixtures double as the offline dataset.
**Alternatives considered**: Hand-authored minimal JSON — kept as small **synthetic** fixtures for specific highlight rules (e.g. a constructed team-wipe cluster) where a real game may not contain the exact edge; real fixtures anchor the headline-number accuracy.

## Open items → none blocking

All spec assumptions are resolved into the constants/decisions above. Thresholds (D3) and page size (D4) are centralized named constants, easy to tune post-review without reshaping the contracts.
