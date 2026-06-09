# Phase 1 — Data Model: Match List & Match Report

All types below are **DTOs in `src/shared/types.ts`** (crossing main↔renderer) plus the **pure domain shapes** that produce them. Existing `MatchSummary` is reused unchanged for the list. Nothing here requires a SQLite migration — every value is derived from the already-stored `matches.raw_json` and `timelines.raw_json`.

## Reused (no change)

### `MatchSummary` (existing — `shared/types.ts`)
`matchId, puuid, queue, champion, role, win, kills, deaths, assists, cs, csPerMin, gold, goldPerMin, gameCreation, gameDuration`. Drives each list row. Already extracted by `domain/matchSummary.ts`.

## New DTOs — list pagination

### `MatchPage`
The result of one infinite-scroll page request.
| Field | Type | Notes |
|---|---|---|
| `matches` | `MatchSummary[]` | newest-first within the page |
| `nextCursor` | `string \| null` | opaque cursor for the next (older) page; `null` ⇒ local store exhausted (renderer may then trigger an older-window sync) |
| `hasMoreRemote` | `boolean` | hint that Riot may have older games not yet stored (true until an older-window sync returns nothing new) |

**Cursor**: encodes `{ gameCreation, matchId }` of the last returned row. Opaque to the renderer.

## New DTOs — match report

### `MatchReport` (top-level)
| Field | Type | Notes |
|---|---|---|
| `matchId` | `string` | |
| `core` | `MatchCore` | scoreline economy (US2) |
| `matchup` | `Matchup` | lanes (US2) |
| `breakdown` | `Breakdown` | decided-by-numbers block (US2) |
| `timeline` | `GoldTimeline \| null` | gold-diff curve + highlights (US3); `null` when timeline JSON absent |
| `deathMap` | `DeathMap \| null` | player death positions (US4); `null` when timeline JSON absent |
| `timelineAvailable` | `boolean` | false ⇒ render the "not available for this game" note (FR-025) |

### `MatchCore` (US2 — FR-010/011)
| Field | Type |
|---|---|
| `champion` | `string` |
| `role` | `string` |
| `win` | `boolean` |
| `kills/deaths/assists` | `number` |
| `kdaRatio` | `number` (1-dp) |
| `cs` | `number` |
| `csPerMin` | `number` (1-dp) |
| `gold` | `number` |
| `goldPerMin` | `number` |
| `durationSec` | `number` |
| `queue` | `number` |

### `Matchup` (US2 — FR-012)
| Field | Type | Notes |
|---|---|---|
| `you` | `RosterEntry` | the player |
| `laneOpponent` | `RosterEntry \| null` | `null` ⇒ "no fixed lane opponent" (jungle/roam, or non-Rift mode) |
| `allies` | `RosterEntry[]` | 5 incl. you, role-ordered TOP→SUP |
| `enemies` | `RosterEntry[]` | 5, role-ordered |

`RosterEntry`: `{ champion: string; role: string; teamId: number; isYou: boolean; isLaneOpponent: boolean }`.

### `Breakdown` (US2 — FR-013/014)
Each metric is a value **or** an explicit not-reached marker.
| Field | Type | Notes |
|---|---|---|
| `csAt10` | `number \| null` | `null` = game didn't reach 10:00 |
| `csPerMin` | `number` | full-game rate |
| `goldAt14` | `number \| null` | player-vs-lane-opponent gold diff at 14:00; `null` if not reached |
| `goldAt24` | `number \| null` | at 24:00; `null` if not reached |
| `visionScore` | `number` | |
| `soloDeaths` | `number` | deterministic (research D3) |
| `killParticipation` | `number` | 0–1 fraction (renderer formats %) |

> Convention: `null` ⇒ "not reached / not applicable" (FR-014). Never substitute 0.

### `GoldTimeline` (US3 — FR-015..019)
| Field | Type | Notes |
|---|---|---|
| `frames` | `GoldFrame[]` | sampled team gold-diff, player-team-positive |
| `endMin` | `number` | game length in minutes (for the axis) |
| `highlights` | `Highlight[]` | data-inferred markers |

`GoldFrame`: `{ tMin: number; goldDiff: number }` (goldDiff in raw gold; renderer may scale to k).

`Highlight` (FR-019/020):
| Field | Type | Notes |
|---|---|---|
| `tMin` | `number` | in-game time (anchors to the curve via `valueAt`) |
| `kind` | `'objective' \| 'teamfight' \| 'death'` | maps to existing `EventKind` icons (objective/teamfight/death) |
| `label` | `string` | factual, e.g. "Baron — Blue", "Team wiped 4–1", "Death → −1.6k" |
| `detail` | `string \| undefined` | short factual elaboration; **no coaching** |
| `side` | `'ally' \| 'enemy' \| 'neutral'` | which team benefited (objective/teamfight); `neutral` if even |

> `kind` deliberately reuses three of the renderer's six `EventKind`s; the others (`spike/ace/pick`) are AI-flavored and unused here.

### `DeathMap` (US4 — FR-021..023)
| Field | Type | Notes |
|---|---|---|
| `deaths` | `DeathMarker[]` | the player's deaths, time-ordered |
| `count` | `number` | == `deaths.length` (SC-006) |

`DeathMarker`: `{ n: number; tMin: number; xPct: number; yPct: number }` — `n` = 1-based order; `x/yPct` normalized 0–100 (research D2). Zero deaths ⇒ empty `deaths`, `count: 0` (clean empty state, FR-023).

## Domain extractor shapes (pure — `domain/report/`)

Internal pure functions; their outputs compose into the DTOs above. (Some overlap the existing `MatchFeatures` type, which stays reserved for the LLM/Flow-A pipeline — this feature does **not** depend on or populate it.)

| Module | Pure function | In → Out |
|---|---|---|
| `matchReportCore.ts` | `extractCore(rawMatch, puuid)` | match detail → `MatchCore` |
| `matchReportCore.ts` | `extractMatchup(rawMatch, puuid)` | match detail → `Matchup` |
| `goldTimeline.ts` | `extractGoldTimeline(rawTimeline, playerTeamId)` | timeline → `GoldFrame[] + endMin` |
| `highlights.ts` | `inferHighlights(rawTimeline, playerTeamId)` | timeline events + gold series → `Highlight[]` |
| `breakdown.ts` | `extractBreakdown(rawMatch, rawTimeline, puuid, laneOpponentId)` | detail+timeline → `Breakdown` |
| `deathMap.ts` | `extractDeathMap(rawTimeline, participantId)` | timeline → `DeathMap` |
| `assembleMatchReport.ts` | `assembleMatchReport(rawMatch, rawTimeline\|null)` | → `MatchReport` (degrades when timeline null) |

**Validation rules** (enforced in extractors, asserted in tests):
- Breakpoint metrics return `null` when the relevant frame doesn't exist (FR-014; e.g. game < 24:00 ⇒ `goldAt24 = null`).
- `laneOpponent` resolves only when exactly one enemy shares the player's `teamPosition`; otherwise `null` (FR-012, jungle/roam/non-Rift).
- `killParticipation` falls back to `(k+a)/teamKills`, and is `0` when `teamKills === 0` (avoid divide-by-zero).
- Highlight thresholds are named constants (research D3); fights/swings below threshold produce no highlight (edge case "ambiguous almost-wiped").
- All positions clamped to [0,100]; Y inverted for screen space (research D2).

## Persistence

**No new tables, no migration.** Reads:
- List paging: new `SqliteMatchRepository.listMatchesPage(puuid, { beforeCreation?, beforeMatchId?, limit })` + `countMatches(puuid)` over the existing `matches` table (indexed scan on `game_creation`).
- Report: existing `getMatchDetail(matchId)` + `getTimeline(matchId)`.

## Entity relationships

```
MatchSummary (list row) ──selects──▶ MatchReport (matchId)
                                       ├─ MatchCore
                                       ├─ Matchup ── RosterEntry[10]
                                       ├─ Breakdown
                                       ├─ GoldTimeline ── GoldFrame[] + Highlight[]
                                       └─ DeathMap ── DeathMarker[]
MatchPage { MatchSummary[], nextCursor } ──drives──▶ infinite scroll
```
