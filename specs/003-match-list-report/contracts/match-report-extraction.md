# Contract: pure domain extractors (`domain/report/`)

These are framework-free, I/O-free functions (Constitution IV). Each is table-tested against stored match+timeline fixtures (Constitution V). Inputs are parsed raw match-v5 objects; outputs are the DTO shapes in data-model.md. Riot field mapping is fixed in research.md (D1).

## `matchReportCore.ts`

```ts
extractCore(rawMatch: unknown, puuid: string): MatchCore
extractMatchup(rawMatch: unknown, puuid: string): Matchup
```
- `extractCore`: KDA + ratio `(k+a)/max(1,d)` (1-dp), CS (`totalMinionsKilled+neutralMinionsKilled`), CS/min, gold, gold/min, duration, queue.
- `extractMatchup`: split participants by `teamId`; order each team TOP→JUNGLE→MID→BOT→SUP; mark `isYou` (puuid) and `isLaneOpponent` (enemy sharing the player's `teamPosition`, only if exactly one). `laneOpponent = null` otherwise.

**Tests**: ratio rounding; CS sum; lane-opponent resolved for a mid game; `null` for a jungle/roam fixture.

## `goldTimeline.ts`

```ts
extractGoldTimeline(rawTimeline: unknown, playerTeamId: number): { frames: GoldFrame[]; endMin: number }
```
- Per frame: Σ ally `participantFrames.totalGold` − Σ enemy, signed so + = player's team ahead. `tMin = timestamp/60000`.

**Tests**: monotonic timestamps; sign correct for a known-ahead game; `endMin` ≈ duration.

## `highlights.ts`

```ts
inferHighlights(rawTimeline: unknown, playerTeamId: number, goldFrames: GoldFrame[]): Highlight[]
// named constants:
const FIGHT_GAP_MS = 15_000
const WIPE_MIN_DEATHS = 3
const WIPE_MIN_NET = 2
const SWING_WINDOW_MS = 90_000
const SWING_MIN_GOLD = 1_000
```
- **Objectives**: one per `ELITE_MONSTER_KILL` (dragon/herald/baron/elder) and per `BUILDING_KILL` inhibitor; `side` from killer/destroyer team; factual `label`/`detail`.
- **Team-wipe**: cluster `CHAMPION_KILL` by ≤`FIGHT_GAP_MS`; flag when one side ≥`WIPE_MIN_DEATHS` and net ≥`WIPE_MIN_NET`; label "Team wiped"/"Almost wiped" + counts.
- **Death→swing**: per player death/cluster, gold-diff change within `SWING_WINDOW_MS` ≥ `SWING_MIN_GOLD` against the player ⇒ highlight tying death to swing.
- Output sorted by `tMin`. Descriptions are factual templates only (FR-020).

**Tests**: every objective in a fixture appears (SC-005); a constructed 4-for-0 cluster ⇒ "Team wiped 4–0"; a 3-for-3 brawl ⇒ no wipe; a death followed by a ≥1k swing ⇒ death highlight; below threshold ⇒ none.

## `breakdown.ts`

```ts
extractBreakdown(rawMatch, rawTimeline, puuid, laneOpponentId: number | null): Breakdown
```
- `csAt10` from the frame nearest 600000 ms (`null` if none ≥10:00).
- `goldAt14`/`goldAt24` = player gold − lane-opponent gold at 840000/1440000 ms (`null` if not reached, or if `laneOpponentId` is null).
- `visionScore` from detail; `soloDeaths` per research D3; `killParticipation` = `challenges.killParticipation` ?? `(k+a)/teamKills` (0 if teamKills 0).

**Tests**: not-reached ⇒ `null` (short-game fixture); kill-participation fallback path; solo-death rule on a fixture with a known lone death.

## `deathMap.ts`

```ts
extractDeathMap(rawTimeline: unknown, participantId: number): DeathMap
```
- Player `CHAMPION_KILL` victims → `{ n, tMin, xPct, yPct }`; normalize coords (research D2), clamp [0,100], invert Y.

**Tests**: marker count == player deaths (SC-006); zero-death fixture ⇒ empty + `count:0`; coords within [0,100].

## `assembleMatchReport.ts`

```ts
assembleMatchReport(rawMatch: unknown, rawTimeline: unknown | null): MatchReport
```
- Resolves `puuid`/`participantId`/`playerTeamId`/`laneOpponentId` from detail, runs the extractors, composes `MatchReport`.
- `rawTimeline === null` (or parse fails) ⇒ `timelineAvailable:false`, `timeline:null`, `deathMap:null`, timeline-dependent breakdown fields `null`; core + matchup + vision/KP still populated (FR-025).

**Tests**: full assembly on a real win + loss fixture; no-timeline degrade path keeps core/matchup and nulls the rest.
