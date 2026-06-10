# Contract — IPC `analysis:match:get` → `GetMatchAnalysis`

**Type**: query (read-only). Restores a stored read on report open — **zero model calls** (FR-027/SC-008).

## Channel

| | |
|---|---|
| Channel | `analysis:match:get` |
| Preload | `getMatchAnalysis(matchId: string): Promise<MatchAnalysis \| null>` |
| Handler | thin: validate `matchId` → `GetMatchAnalysis.execute(matchId)` → `MatchAnalysis \| null` |

`null` ⇒ never analysed; renderer shows the gated "Analyze this match" state (existing). A stored read (`'done'` or `'partial'`) is returned verbatim from `match_analyses`; partial reads render their successful sections plus a retry affordance.

## Use case `GetMatchAnalysis.execute(matchId)`

Port: `ReportRepository.getMatchAnalysis(matchId): MatchAnalysis | null`. No `MatchCoachingModel`, no network, no recompute — a single indexed SQLite read deserialised to the DTO.

## Renderer integration

`useMatchAnalysis(matchId)` calls `getMatchAnalysis` on mount to hydrate (replacing the in-memory `analyzed` `Record` + fake `setTimeout` in `App.tsx`/`CoachReport.tsx`), and `analyzeMatch` on the action. State machine: `idle` (null) → `running` → `done` | `partial` (per-section) | `error`. Re-opening a report after restart restores the stored read with no run (SC-008).

## Acceptance

- SC-008: opening an analysed report issues `getMatchAnalysis` only — assert no `analyzeMatch` call fires on open; the read survives app restart (persisted row).
- A `partial` read hydrates its `'done'` sections and surfaces retry for `'error'` ones.
