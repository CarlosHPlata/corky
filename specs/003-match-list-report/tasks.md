---
description: "Task list for Match List & Match Report (statistical data)"
---

# Tasks: Match List & Match Report (statistical data)

**Input**: Design documents from `/specs/003-match-list-report/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: INCLUDED — Constitution Principle V (Test-First) mandates Vitest tests for every `domain/`/`application/` unit, backed by stored fixtures. Pure `domain/report/` extractors are written test-first.

**Organization**: Grouped by user story (US1=P1 … US4=P4). Each story is an independently testable increment. This feature is mostly **wiring + pure extraction** — the UI screens already exist on mock data; match + timeline JSON is already synced and stored.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 (maps to spec.md user stories)
- All paths are repo-relative from `d:\projects\corky`.

## Conventions (apply to every task)

- `domain/` and `application/` import **no** `electron`, `better-sqlite3`, Riot/Anthropic SDK (Principle IV). `domain/report/*` import **nothing**.
- IPC handlers stay thin (validate → call use case → return DTO). One channel per use case.
- No live API calls in tests; use stored fixtures (Principle V/VII).
- Frontend changes preserve the existing layout — data source swaps only (Principle VIII, user directive "respect the UX").
- No LLM anywhere in this feature; highlight/death text is deterministic and factual (FR-020).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture the real fixtures the pure extractors are tested against (research D7; build-plan M1 left these pending).

- [x] T001 [P] Capture two real match+timeline fixture pairs (one **win**, one **loss**, standard Summoner's Rift ranked) by copying the `matches.raw_json` + `timelines.raw_json` rows from the dev DB into `test/fixtures/match-<id>.json` and `test/fixtures/timeline-<id>.json`; note their ids in `test/fixtures/README.md`.
- [x] T002 [P] Capture one **edge** fixture: a short/remake game (ended before 24:00) as `test/fixtures/match-<id>.json` + `timeline-<id>.json`, and record a **no-timeline** scenario (detail present, timeline intentionally absent) for the degrade path in `test/fixtures/README.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared DTO/contract surface both the list and report stories build against.

**⚠️ CRITICAL**: Blocks all user stories (shared `shared/types.ts` contract).

- [x] T003 Add the new DTOs and IPC signatures to `src/shared/types.ts`: `MatchPageRequest`, `MatchPage`; `MatchReport`, `MatchCore`, `Matchup`, `RosterEntry`, `Breakdown`, `GoldTimeline`, `GoldFrame`, `Highlight`, `DeathMap`, `DeathMarker` (shapes per [data-model.md](./data-model.md)); extend `IpcApi` with `getMatchPage(req)`, `getMatchReport(matchId)`, and change `syncMatches` to `(count: number, start?: number)`.

**Checkpoint**: Contract types exist — US1 and US2–US4 can proceed.

---

## Phase 3: User Story 1 — Browse recent matches with infinite scroll (Priority: P1) 🎯 MVP

**Goal**: A dedicated match list of real synced matches, newest-first, that auto-loads older pages on scroll and opens a match on click.

**Independent Test**: Open Match history with synced data → rows show result/champ/role/KDA/CS/CS·min/gold/queue/duration/relative-time; scrolling near the end appends the next page; the end shows an end-of-history state; an empty DB shows the empty state; clicking a row opens the report screen for that match.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [x] T004 [P] [US1] In `test/unit/SqliteMatchRepository.test.ts`, add cases for `listMatchesPage` (cursor by `game_creation`, newest-first, no overlap/skip across pages, limit honored) and `countMatches`.

### Implementation for User Story 1

- [x] T005 [US1] Extend the port in `src/main/application/ports/MatchRepository.ts`: add `listMatchesPage(puuid, opts: { beforeCreation?: number; beforeMatchId?: string; limit: number }): MatchSummary[]` and `countMatches(puuid): number`.
- [x] T006 [US1] Implement `listMatchesPage` (cursor `WHERE (game_creation, match_id) < (?, ?)` style, `ORDER BY game_creation DESC, match_id DESC LIMIT ?`) and `countMatches` in `src/main/adapters/driven/sqlite/SqliteMatchRepository.ts`.
- [x] T007 [US1] Implement query `src/main/application/queries/GetMatchPage.ts`: resolve current account, decode the opaque `before` cursor, return `{ matches, nextCursor, hasMoreRemote }` (nextCursor null when no older local rows; hasMoreRemote per `countMatches` vs a synced-window heuristic). Per [contracts/ipc-match-page.md](./contracts/ipc-match-page.md).
- [x] T008 [US1] Add the older-window fetch: extend `MatchDataSource.listMatchIds(puuid, region, count, start?)` in `src/main/application/ports/MatchDataSource.ts`, pass `start` to the `match-v5` ids URL in `src/main/adapters/driven/riot/RiotApiClient.ts`, and accept an optional `start` in `src/main/application/commands/SyncRecentMatches.ts` (still idempotent — skips stored ids).
- [x] T009 [US1] In `src/main/adapters/driving/IpcController.ts` register `matches:page` → `GetMatchPage.execute` and update `matches:sync` to accept `(count, start)`; wire `GetMatchPage` into `src/main/infrastructure/container.ts`.
- [x] T010 [US1] In `src/preload/index.ts` expose `getMatchPage` (→ `matches:page`) and update `syncMatches` to forward `(count, start?)`.
- [x] T011 [P] [US1] Create stub `src/renderer/src/stubs/matchList.ts`: a multi-page `MatchSummary[]` plus an empty page and a final (nextCursor: null) page, mirroring `MatchPage` exactly (Constitution VIII).
- [x] T012 [P] [US1] Add display helpers to `src/renderer/src/utils/format.ts`: a relative-time formatter (`gameCreation` → "14m ago"), a duration formatter (`gameDuration` sec → "31:24"), and a queue-id → label map.
- [x] T013 [US1] Implement `src/renderer/src/data/useMatchHistory.ts`: infinite-scroll hook over `getMatchPage` — accumulates pages, in-flight guard per cursor (FR-005), end-of-history flag (FR-006), recoverable page-error + retry (edge case), and triggers `syncMatches(count, start)` to pull an older window when local rows are exhausted but `hasMoreRemote` (FR-009). Build against the stub first.
- [x] T014 [US1] Re-point `src/renderer/src/screens/MatchHistory.tsx` from the `MATCHES` mock to `useMatchHistory` data (`MatchSummary[]`): render rows from real fields (champion/role/KDA/CS/CS·min/gold/queue/duration/relative-time via T012 helpers), the W/L header from loaded matches, a scroll sentinel, and loading / end-of-history / empty states. **No layout change.**
- [x] T015 [US1] Update `src/renderer/src/App.tsx` routing so selecting a row carries the match's `matchId` and opens the report screen, keying the report by `matchId` (interim: pass the selected `MatchSummary` so the existing `CoachReport` header still renders until US2 swaps it).
- [x] T016 [US1] Swap the stub for live data: point `useMatchHistory` at `window.api.getMatchPage()` / `window.api.syncMatches()` with no UI change; verify infinite scroll end-to-end.

**Checkpoint**: US1 fully functional — browse, scroll, paginate, open. MVP deliverable.

---

## Phase 4: User Story 2 — Core statistics for a game (Priority: P2)

**Goal**: Opening a match shows real KDA/CS/CS·min/gold/gold·min, the matchup (incl. honest "no lane opponent"), and the breakdown block — computed from stored JSON.

**Independent Test**: Open a standard ranked game → core stats + matchup + breakdown (CS@10, CS·min, gold@14, gold@24, vision, solo deaths, kill participation), cross-checked vs op.gg within rounding; a <24-min game shows gold@24 "not reached"; a jungle/roam game shows no fixed lane opponent.

### Tests for User Story 2 ⚠️ (write first, ensure they fail)

- [x] T017 [P] [US2] `test/unit/matchReportCore.test.ts`: `extractCore` (KDA ratio rounding, CS sum, rates) and `extractMatchup` (lane opponent resolved for a mid game; `null` for a jungle/roam fixture) against the T001 fixtures.
- [x] T018 [P] [US2] `test/unit/breakdown.test.ts`: not-reached → `null` (short-game fixture), kill-participation fallback `(k+a)/teamKills`, solo-death rule on a known lone death.
- [x] T019 [P] [US2] `test/unit/assembleMatchReport.test.ts`: full assembly of core+matchup+breakdown on win + loss fixtures, and the **no-timeline degrade** path (core/matchup/vision/KP present; timeline-dependent fields `null`, `timelineAvailable:false`).

### Implementation for User Story 2

- [x] T020 [P] [US2] Implement `src/main/domain/report/matchReportCore.ts`: pure `extractCore(rawMatch, puuid)` and `extractMatchup(rawMatch, puuid)` per [contracts/match-report-extraction.md](./contracts/match-report-extraction.md).
- [x] T021 [P] [US2] Implement `src/main/domain/report/breakdown.ts`: pure `extractBreakdown(rawMatch, rawTimeline, puuid, laneOpponentId)` (CS@10 / gold@14 / gold@24 with not-reached `null`, vision, solo deaths per research D3, kill participation with fallback).
- [x] T022 [US2] Implement `src/main/domain/report/assembleMatchReport.ts`: resolve puuid/participantId/teamId/laneOpponentId from detail, run core+matchup+breakdown, return `MatchReport` with `timeline:null`/`deathMap:null` placeholders and correct `timelineAvailable` (degrades when `rawTimeline` is null/unparseable).
- [x] T023 [US2] Implement query `src/main/application/queries/GetMatchReport.ts`: load `getMatchDetail` + `getTimeline` from `MatchRepository`, call `assembleMatchReport`, return `MatchReport | null`. Per [contracts/ipc-match-report.md](./contracts/ipc-match-report.md).
- [x] T024 [US2] Register `report:match` → `GetMatchReport.execute` in `src/main/adapters/driving/IpcController.ts`, wire `GetMatchReport` in `src/main/infrastructure/container.ts`, and expose `getMatchReport` (→ `report:match`) in `src/preload/index.ts`.
- [x] T025 [P] [US2] Create stub `src/renderer/src/stubs/matchReport.ts`: `MatchReport` fixtures for win, loss, short-game (not-reached nulls), and no-timeline (`timelineAvailable:false`) — mirroring the DTOs exactly.
- [x] T026 [US2] Implement `src/renderer/src/data/useMatchReport.ts`: load a `MatchReport` by `matchId` (loading/error/null states). Build against the stub first.
- [x] T027 [US2] Re-point the **factual** sections of `src/renderer/src/screens/CoachReport.tsx` to `MatchReport`: `Scoreline` (core), `Matchup` (roster + lane-opponent), and the breakdown `StatBlock`s — change `match: MatchMock` → `matchId` + `useMatchReport`, remove the US1 interim header adapter, render "not reached"/"no lane opponent" honestly. The AI sections (verdict, turning points, focus, since-last) stay gated. **No layout change.**
- [x] T028 [US2] Swap the stub for live data: point `useMatchReport` at `window.api.getMatchReport()`; verify a real game's stats/matchup/breakdown render and match op.gg (SC-004).

**Checkpoint**: US1 + US2 work independently — list opens into a real, factual stat report.

---

## Phase 5: User Story 3 — Gold-difference timeline with highlights (Priority: P3)

**Goal**: A team gold-difference curve across the game, annotated with deterministic highlights (objectives, team-wipe fights, death→gold-swing).

**Independent Test**: Open a game → the curve spans the duration; every dragon/baron/inhibitor appears at the right time; a team-wipe and a death→swing are marked; tooltips are factual (no coaching).

### Tests for User Story 3 ⚠️ (write first, ensure they fail)

- [x] T029 [P] [US3] `test/unit/goldTimeline.test.ts`: monotonic timestamps, sign correct for a known-ahead game, `endMin` ≈ duration.
- [x] T030 [P] [US3] `test/unit/highlights.test.ts`: every objective in a fixture appears (SC-005); a constructed 4-for-0 cluster → "Team wiped"; a 3-for-3 brawl → no wipe; a death followed by ≥1k swing → death highlight; below-threshold → none; output sorted by time.

### Implementation for User Story 3

- [x] T031 [P] [US3] Implement `src/main/domain/report/goldTimeline.ts`: pure `extractGoldTimeline(rawTimeline, playerTeamId)` → `{ frames, endMin }` (team gold diff per frame, player-team-positive).
- [x] T032 [US3] Implement `src/main/domain/report/highlights.ts`: pure `inferHighlights(rawTimeline, playerTeamId, goldFrames)` with the named threshold constants (research D3); objective/team-wipe/death-swing rules; factual label/detail templates only.
- [x] T033 [US3] Extend `src/main/domain/report/assembleMatchReport.ts` to populate `timeline` (frames + highlights) when timeline is present, and extend `test/unit/assembleMatchReport.test.ts` to assert the timeline block.
- [x] T034 [US3] Bind the gold timeline in `src/renderer/src/screens/CoachReport.tsx` to `MatchReport.timeline`: feed `MatchTimeline` the real `frames` curve and map `Highlight.kind`→`EventKind` (objective/teamfight/death) for the event pins; light edit to `src/renderer/src/components/coaching/MatchTimeline.tsx` only if the event shape needs adapting. Show the "not available" note when `timeline` is null (FR-025). Against the stub, then live.
- [x] T035 [US3] Update `src/renderer/src/stubs/matchReport.ts` with realistic `timeline.frames` + `highlights`; confirm the wired path renders identically to the stub.

**Checkpoint**: US1–US3 work — the report now tells the game's shape from data.

---

## Phase 6: User Story 4 — Death map (Priority: P4)

**Goal**: A Summoner's Rift map marking each of the player's deaths at its real location and time.

**Independent Test**: Open a game → marker count equals the player's deaths (SC-006); a deathless game shows a clean empty state; clustered deaths stay individually distinguishable.

### Tests for User Story 4 ⚠️ (write first, ensure they fail)

- [x] T036 [P] [US4] `test/unit/deathMap.test.ts`: marker count == player deaths; zero-death fixture → empty + `count:0`; coords normalized within [0,100] with Y inverted (research D2).

### Implementation for User Story 4

- [x] T037 [US4] Implement `src/main/domain/report/deathMap.ts`: pure `extractDeathMap(rawTimeline, participantId)` → `{ deaths, count }` with normalized/clamped/Y-inverted positions and 1-based ordering.
- [x] T038 [US4] Extend `src/main/domain/report/assembleMatchReport.ts` to populate `deathMap` when timeline is present, and extend `test/unit/assembleMatchReport.test.ts` accordingly.
- [x] T039 [US4] Re-point the death map in `src/renderer/src/screens/CoachReport.tsx` to `MatchReport.deathMap`: replace the hardcoded `DEATH_POS` lookup with real `xPct/yPct`, show timestamps, and handle zero-death (clean empty state, FR-023) and clustered markers. The per-death "why" label stays gated. Against the stub, then live.
- [x] T040 [US4] Update `src/renderer/src/stubs/matchReport.ts` death-map fixtures (multi-death, clustered, and zero-death) and confirm the wired path matches.

**Checkpoint**: All user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T041 [P] Guard the hexagon: verify `src/main/domain/report/*` import nothing (no `electron`/`better-sqlite3`/SDK) — quick grep/lint pass (Principle IV).
- [x] T042 [P] Remove the mock exports this feature replaced (`MATCHES`, `REPORT_WIN`, `REPORT_LOSS` and now-unused `MatchMock`/`ReportMock` paths) from `src/renderer/src/data/mockData.ts` **only if** no remaining screen references them (Trends/ChampSelect may still use other exports — leave those).
- [x] T043 End-to-end error/empty states across both screens: list page-fetch failure retry, report "couldn't read this match", and the no-timeline note — verify each renders recoverably.
- [ ] T044 Run [quickstart.md](./quickstart.md) verification: op.gg number sanity check (SC-004), offline open of a synced match (SC-008), no-timeline degrade (SC-009), and the four story independent tests.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1: T001–T002)** → no deps; fixtures unblock all extractor tests.
- **Foundational (P2: T003)** → depends on Setup; **blocks all stories** (shared DTOs).
- **US1 (P3)**, **US2 (P4)**, **US3 (P5)**, **US4 (P6)** → all depend on T003. US3 and US4 extend `assembleMatchReport.ts` created in US2 (T022), so US2 precedes US3/US4. US1 is fully independent of US2–US4.
- **Polish (P7)** → after the stories you intend to ship.

### Story dependencies
- **US1**: independent (own pagination slice). Only shared touch with US2 is `App.tsx` routing (T015), written to keep the report screen rendering until US2.
- **US2**: independent of US1; creates the report query + `assembleMatchReport` foundation.
- **US3 / US4**: build on US2's `assembleMatchReport` (T022) and `GetMatchReport` (T023); otherwise independent of each other (different domain files + different report sub-components).

### Within each story
- Tests (T004; T017–T019; T029–T030; T036) first and failing → then implementation.
- Domain extractors → `assembleMatchReport` → query → IPC/preload/container → stub UI → live swap.

---

## Parallel Opportunities

- **Setup**: T001, T002 together.
- **US1**: T011, T012 together (stub + format helpers); backend T005→T006→T007 sequential; T004 test alongside.
- **US2**: tests T017, T018, T019 together; extractors T020, T021 together (then T022 depends on both); stub T025 alongside.
- **US3**: tests T029, T030 together; T031 (goldTimeline) alongside, then T032 (highlights, needs gold frames).
- **US4**: T036 then T037.
- **Polish**: T041, T042 together.

### Parallel example — US2 extractors
```bash
Task: "Implement src/main/domain/report/matchReportCore.ts"   # T020
Task: "Implement src/main/domain/report/breakdown.ts"          # T021
# then T022 assembleMatchReport composes both
```

---

## Implementation Strategy

### MVP first (US1 only)
1. Setup (T001–T002) → Foundational (T003) → US1 (T004–T016).
2. **STOP & VALIDATE**: browse + infinite scroll + open, on real synced data. Demo.

### Incremental delivery
- + US2 → real factual stats/matchup/breakdown on report open (the core "see my game" value).
- + US3 → gold-difference timeline with deterministic highlights.
- + US4 → death map.
- Each story is a shippable increment; the gated AI sections of the report remain untouched throughout (delivered later by Flow A).

## Notes
- `[P]` = different files, no incomplete-task dependency.
- Every frontend story follows stub → review → live-swap (Principle VIII); the swap never changes layout.
- Commit after each task or logical group.
- Fixtures (T001–T002) are real Riot payloads pulled from the local DB — they double as the offline dataset and op.gg sanity reference.
