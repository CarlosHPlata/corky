# Contract: `report:match` — factual match report (US2–US4)

Read-only query returning the **pure-data** report for one match, computed on demand from the stored raw match + timeline JSON. No LLM, no network, no persistence.

> Channel is `report:match` to avoid colliding with the existing `report:get` (the Flow-A `CoachReport`/LLM read).

## IPC channel
`report:match` (invoke/handle), thin handler → `GetMatchReport.execute(matchId)`.

## Preload signature (`IpcApi`)
```ts
getMatchReport: (matchId: string) => Promise<MatchReport | null>
```

## Response
`MatchReport` (see data-model.md) or `null` when the match isn't stored locally.

```ts
interface MatchReport {
  matchId: string
  core: MatchCore
  matchup: Matchup
  breakdown: Breakdown
  timeline: GoldTimeline | null
  deathMap: DeathMap | null
  timelineAvailable: boolean
}
```

## Behaviour
- Loads `getMatchDetail(matchId)` + `getTimeline(matchId)` from `MatchRepository`.
- Detail missing ⇒ returns `null` (caller shows "match not found").
- Timeline missing/unparyseable ⇒ `timelineAvailable: false`, `timeline: null`, `deathMap: null`; `core`, `matchup`, `breakdown` still computed from detail where possible (FR-025). Breakdown fields that need timeline frames (`csAt10`, `goldAt14`, `goldAt24`) become `null`.
- Breakpoint metrics the game never reached ⇒ `null`, never 0 (FR-014).
- `matchup.laneOpponent` ⇒ `null` when no single opposed lane exists (FR-012).
- All highlight descriptions are factual templates; no coaching text (FR-020, SC-007).
- Deterministic & offline (Constitution VII): same stored match ⇒ same report every call.

## Performance
Single match: parse one detail + one timeline, a handful of linear passes. Target: imperceptible on open (well under the SC "instant" feel). No caching needed (research D5).

## Errors
- Throw only on truly malformed stored JSON; the renderer surfaces a recoverable "couldn't read this match" state. Missing timeline is **not** an error (it's the degrade path).
