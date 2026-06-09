# Implementation Plan: Match List & Match Report (statistical data)

**Branch**: `003-match-list-report` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-match-list-report/spec.md`

## Summary

Wire the **already-built** Match history and Post-game report UI to **real, computed match data** and add **infinite scroll**. The renderer screens (`MatchHistory`, `CoachReport` and its `MatchTimeline`/death-map/gold-chart sub-views) already exist against mock data; this feature replaces the mock with the **factual** half of the report — the half the report file itself labels "FACTUAL — read straight off the match" — leaving the AI "read" sections (verdict, turning points, focus tasks, since-last) gated and out of scope (Flow A).

**Technical approach**: All match detail + timeline JSON is **already synced and stored locally** (`matches`, `timelines` tables) by `SyncRecentMatches`. So this feature is mostly **pure extraction + wiring**, no new fetching foundation:

1. **Match list pagination (US1)** — add a cursor-paged query `GetMatchPage` over the local DB (ordered by `game_creation`), plus an "extend history" path that fetches the next older window from Riot (`listMatchIds` gains a `start` offset) when the local store runs dry. The renderer gets a `useMatchHistory` hook driving infinite scroll; `MatchHistory.tsx` is re-pointed from the `MATCHES` mock to real `MatchSummary[]`.
2. **Match report (US2–US4)** — a read-only query `GetMatchReport(matchId)` loads the stored raw match + timeline and runs **pure, deterministic** `domain/report/` extractors to produce a new `MatchReport` DTO: core stats, matchup, team gold-difference timeline, **rule-based** highlights (objectives, team-wipe fights, death→gold-swing), the breakdown block (CS@10, CS/min, gold@14, gold@24, vision, solo deaths, kill participation) and the death map (player death positions + times). `CoachReport.tsx`'s factual sub-components bind to `MatchReport`; the gated AI sections are untouched.

No LLM, no new secrets, no re-fetch of stored matches. Highlights and death labels-of-fact are deterministic; anything interpretive stays gated. Built frontend-first against new stubs that mirror the DTOs (Constitution VIII), then swapped to `window.api.*` with no layout change.

## Technical Context

**Language/Version**: TypeScript 5.8, Node ≥22 (Electron 35 main process), React 18 (renderer)
**Primary Dependencies**: existing only — `better-sqlite3` (local store), `bottleneck` (Riot rate limit, already wrapping the client). **No new dependencies.** No `@anthropic-ai/sdk` use (this feature is data-only).
**Storage**: SQLite (existing DB). **No schema migration required** — reads from the existing `matches.raw_json` and `timelines.raw_json`. The report is computed on read (the raw JSON is the single source of truth and is already stored offline); optional caching into the existing `features` table is a deferred optimization, not in this plan.
**Testing**: Vitest with the existing `test/unit` + `test/fixtures` layout. Pure `domain/report/` extractors are table-tested against **real stored match+timeline fixtures** (this feature adds the first such fixtures, per build-plan M1). Pagination repository methods follow the `SqliteMatchRepository.test.ts` pattern (subject to the known better-sqlite3 ABI caveat below).
**Target Platform**: Windows desktop (Electron); renderer is a local React SPA.
**Project Type**: Electron desktop app, hexagonal architecture in the main process; React renderer outside the hexagon.
**Performance Goals**: Opening a report computes from local JSON in well under a frame budget for a single match (parse one match + one timeline, a few linear passes); list pages are a single indexed SQLite read. Infinite scroll appends a page (~20) without stalling (SC-002); fetching an *older* window from Riot is the only network step and is rate-limited by the existing bottleneck.
**Constraints**: domain/application import no SDK or `electron` (Constitution IV); highlights are deterministic rules, never LLM (FR-020, spec "No LLM"); report renders from stored JSON offline (Constitution VII); only player-visible facts surfaced (FR-024, Principle I); frontend built/approved against stubs before wiring (Constitution VIII); page size default ~20.
**Scale/Scope**: single user; one `MatchReport` per opened match (computed on demand); 2 new queries (`GetMatchPage`, `GetMatchReport`) + a small extension to `SyncRecentMatches`/`MatchDataSource` for older-window fetch; new pure `domain/report/` extractors; 2 new IPC channels; renderer gets 1 hook + re-points 2 existing screens (no new screens).

### Known caveat carried from M0.5

`better-sqlite3` Vitest runs need a Node-ABI build of the native module (the app build targets Electron's ABI), so SQLite-repository tests may not run under plain `npm test` yet. Pure `domain/report/` extractor tests are unaffected (no native module) and carry the test weight for this feature; repository pagination is kept thin and its logic verified by the pure cursor math where possible.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle IV — Hexagonal Architecture**: New extractors live in `domain/report/*` and are pure (zero imports — no `electron`, no `better-sqlite3`, no SDK). `GetMatchPage` and `GetMatchReport` are read-only **query** use cases in `application/queries/`; the older-window fetch reuses the existing `SyncRecentMatches` **command** (extended with a `start` offset on the `MatchDataSource` port). The only persistence touch is added methods on `SqliteMatchRepository` (paged read); wiring is in `infrastructure/container.ts`; IPC handlers stay thin (validate → call use case → return DTO). **No LLM** is involved, so no Anthropic import crosses any boundary.
- [x] **Principle VI — Secrets in Main Process**: No new secrets. The renderer sends a `matchId`/cursor and receives `MatchSummary`/`MatchReport` DTOs only. The Riot key stays in the main-process client (unchanged).
- [x] **Principle VIII — Frontend First**: New stubs `src/renderer/src/stubs/matchList.ts` and `matchReport.ts` mirror the `MatchSummary`/`MatchReport` DTOs exactly. The existing screens are re-pointed to consume those shapes and reviewed across loading / empty / end-of-history / no-timeline / zero-deaths states **against stubs**, then wired by swapping the stub import for `window.api.getMatchPage()` / `getMatchReport()` with no layout change.
- [x] **Principle V — Test-First**: Each `domain/report/` extractor (gold timeline, highlights, breakdown, death map, matchup, core stats) is pure and table-tested against stored match+timeline fixtures; numbers sanity-check against an external reference (op.gg) per Principle V. No test touches the network.
- [x] **Principle VII — Offline-First**: The report is computed entirely from the already-stored `raw_json` (match + timeline); list pages read the local DB. Re-opening a match never re-fetches (FR-026). The only network use is fetching an **older** history window not yet stored (FR-009), via the existing idempotent sync.

**Result**: PASS. No violations; Complexity Tracking not required.

### Constitution-specific notes carried into design

- **Principle I / FR-024 (player-visible only)**: Every figure derives from the player's own match + timeline (the same data the post-game screen shows). Global objective takes (dragon/baron/herald/inhibitor) are permitted (the game shows them to everyone). No predicted/hidden timers; the gold-difference curve is reconstructed from recorded frames, not forecast.
- **Principle II vs. "No LLM" (FR-020)**: The constitution's evidence-grounded rule governs the *AI* read; this feature ships only the **evidence** half. Highlights carry a short *factual* description (e.g. "Blue team took Baron — 24:40") generated by deterministic templates, never coaching prose. The interpretive death labels (`caught_out`…) and turning-point "better play" remain gated behind Flow A and are explicitly not produced here.
- **Honest about limits (FR-025)**: When a match's timeline JSON is missing, `GetMatchReport` returns the core stats it can compute from match detail and flags the timeline/highlights/death-map sections unavailable, rather than failing the whole report.

## Project Structure

### Documentation (this feature)

```text
specs/003-match-list-report/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — Riot field mapping + highlight thresholds
├── data-model.md        # Phase 1 output — MatchReport DTO + entities
├── quickstart.md        # Phase 1 output — build/verify walkthrough
├── contracts/           # Phase 1 output
│   ├── ipc-match-page.md            # matches:page channel + GetMatchPage
│   ├── ipc-match-report.md          # report:match channel + GetMatchReport
│   └── match-report-extraction.md   # pure domain extractor contracts
└── checklists/
    └── requirements.md  # From /speckit-specify
```

### Source Code (repository root)

```text
src/
  main/
    domain/
      report/
        matchReportCore.ts        # NEW — core stats (KDA/CS/CS·min/gold/gold·min) + matchup from match detail (pure)
        goldTimeline.ts           # NEW — team gold-diff series from timeline participantFrames (pure)
        highlights.ts             # NEW — deterministic objective / team-wipe / death→gold-swing inference (pure)
        breakdown.ts              # NEW — CS@10, gold@14, gold@24, vision, solo deaths, kill participation (pure)
        deathMap.ts               # NEW — player death positions (normalized) + timestamps (pure)
        assembleMatchReport.ts    # NEW — compose the above into the MatchReport DTO (pure; handles no-timeline degrade)
    application/
      ports/
        MatchDataSource.ts        # EDIT — listMatchIds(puuid, region, count, start?) gains optional older-window offset
        MatchRepository.ts        # EDIT — add listMatchesPage(...) + countMatches(puuid)
      queries/
        GetMatchPage.ts           # NEW — cursor-paged MatchSummary read over the local DB
        GetMatchReport.ts         # NEW — load raw match+timeline from repo → assembleMatchReport → MatchReport
      commands/
        SyncRecentMatches.ts      # EDIT — accept an optional start offset to fetch an older window on demand
    adapters/
      driven/
        riot/
          RiotApiClient.ts        # EDIT — pass `start` through to the match-v5 ids endpoint
        sqlite/
          SqliteMatchRepository.ts# EDIT — listMatchesPage (cursor by game_creation) + countMatches
      driving/
        IpcController.ts          # EDIT — register 'matches:page' and 'report:match'
    infrastructure/
      container.ts                # EDIT — wire GetMatchPage, GetMatchReport
  preload/
    index.ts                      # EDIT — expose getMatchPage / getMatchReport
  shared/
    types.ts                      # EDIT — MatchPage, MatchReport (+ sub-DTOs), IpcApi additions
  renderer/src/
    stubs/
      matchList.ts                # NEW — stub MatchSummary[] pages (Constitution VIII)
      matchReport.ts              # NEW — stub MatchReport states (win/loss, no-timeline, zero-deaths)
    data/
      useMatchHistory.ts          # NEW — infinite-scroll hook (paging + older-window trigger)
      useMatchReport.ts           # NEW — load a MatchReport by matchId
    screens/
      MatchHistory.tsx            # EDIT — consume MatchSummary[] + infinite scroll (was MATCHES mock)
      CoachReport.tsx             # EDIT — factual sections bind to MatchReport (was REPORT_* mock); AI sections stay gated
    components/coaching/
      MatchTimeline.tsx           # EDIT (light) — events come from real highlights; props already match
    App.tsx                       # EDIT (light) — openMatch carries matchId; report keyed by matchId

test/
  fixtures/
    match-<id>.json               # NEW — real match-v5 detail fixtures (≥2: a win, a loss)
    timeline-<id>.json            # NEW — matching match-v5 timeline fixtures
  unit/
    matchReportCore.test.ts       # NEW
    goldTimeline.test.ts          # NEW
    highlights.test.ts            # NEW
    breakdown.test.ts             # NEW
    deathMap.test.ts              # NEW
    assembleMatchReport.test.ts   # NEW — incl. no-timeline degrade path
    SqliteMatchRepository.test.ts # EDIT — pagination cursor + countMatches
```

**Structure Decision**: Follows the fixed hexagonal layout from `technical_brief.md`. Net-new logic is concentrated in pure `domain/report/` extractors (the testable heart), exposed through two read-only queries over one IPC channel each, reusing the existing `MatchRepository`/`MatchDataSource` ports and the synced `matches`/`timelines` tables. The renderer adds two data hooks and re-points two existing screens — no new screens, honoring "respect the UX, just wire things up."

## Complexity Tracking

> No constitution violations — table intentionally empty.
