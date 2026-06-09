# Quickstart — Match List & Match Report

How to build, wire, and verify this feature. It is **mostly wiring**: the UI exists, the match + timeline data is already synced and stored. Follow the constitution's order — **pure extractors (TDD) → DTOs → query/IPC wiring → frontend swap from stub → verify**.

## Prerequisites
- A populated local DB: run the app once (`npm run dev`) so `SyncRecentMatches` has stored `matches` + `timelines` (auto-syncs on open).
- Capture fixtures (research D7): copy ≥2 `raw_json` rows (one win, one loss) from the dev DB into `test/fixtures/match-<id>.json` + `timeline-<id>.json`, plus one short/remake game.

## Build order

1. **Extractors first (TDD, Constitution V)** — write `test/unit/*.test.ts` against the fixtures, then implement `src/main/domain/report/*`:
   `matchReportCore` → `goldTimeline` → `highlights` → `breakdown` → `deathMap` → `assembleMatchReport`.
   Sanity-check headline numbers against op.gg for the same game (Principle V acceptance, SC-004).
2. **DTOs** — add `MatchPage`, `MatchReport` (+ sub-DTOs) to `src/shared/types.ts`; extend `IpcApi` with `getMatchPage`, `getMatchReport`, and `syncMatches(count, start?)`.
3. **Queries + repo** — `GetMatchReport` (load detail+timeline → assemble); `GetMatchPage` (cursor page); add `listMatchesPage` + `countMatches` to `SqliteMatchRepository`; extend `MatchDataSource.listMatchIds`/`RiotApiClient`/`SyncRecentMatches` with the `start` offset.
4. **Wire** — register `report:match` + `matches:page` in `IpcController`; expose them in `preload/index.ts`; construct the queries in `container.ts`.
5. **Frontend, stub-first (Constitution VIII)** —
   a. add `stubs/matchList.ts` + `stubs/matchReport.ts` (mirror the DTOs; cover win / loss / no-timeline / zero-deaths / short-game).
   b. re-point `MatchHistory.tsx` to a `MatchSummary[]` shape and `CoachReport.tsx`'s **factual** sections to `MatchReport`, importing the stubs. Review every state. **No layout change.**
   c. add `useMatchHistory` (infinite scroll) + `useMatchReport`; swap the stub imports for `window.api.getMatchPage()` / `getMatchReport()`. One-line swap, no UI change.

## Verify (maps to acceptance)

- **US1 / SC-001/002**: open Match history → newest-first rows with result/champ/role/KDA/CS/CS·min/gold/queue/duration/when; scroll → next page appends automatically; reaching the end shows end-of-history; empty DB shows the empty state.
- **US2 / SC-004**: open a standard ranked game → KDA/CS/CS·min/gold/gold·min, matchup with lane opponent, and the breakdown block; cross-check a few numbers vs op.gg. Open a <24-min game → gold@24 shows "not reached".
- **US3 / SC-005/007**: the gold-difference curve spans the game; every dragon/baron/inhibitor appears as a marker at the right time; a team-wipe fight and a death→swing are marked; tooltips are factual (no coaching).
- **US4 / SC-006**: death-map marker count == the player's deaths; a deathless game shows the clean empty state.
- **FR-025 / SC-009**: a match with no stored timeline still opens with core stats + a "not available" note for timeline/highlights/death map.
- **Offline (SC-008)**: disconnect → a previously-synced match still opens and renders fully.

## Guardrails
- `domain/report/*` import nothing (no electron/sqlite/SDK). If you reach for an import there, it belongs in an adapter/query.
- No highlight or death text is AI-written — all templates are factual.
- Don't re-fetch a stored match; only scrolling past the entire local store triggers an older-window `syncMatches(count, start)`.
- The AI sections of `CoachReport` (verdict, turning points, focus tasks, since-last, per-death "why") stay gated — this feature does not feed them.
