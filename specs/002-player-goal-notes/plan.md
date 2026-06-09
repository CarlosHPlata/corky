# Implementation Plan: Session Goal & Notes

**Branch**: `002-player-goal-notes` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-player-goal-notes/spec.md`

## Summary

Add a **Session goal & notes** card to the Home screen: the player writes one sharp goal plus free-form notes, kept locally and shown back in calm read / edit / empty states (per the new design's `GoalNotes` card). The saved text is then handed to the on-demand session coach (Quick Analysis) as the player's **own stated intent** — additional context the model weaves into its read so the coaching speaks to what the player is actually working on, while still drawing every piece of evidence from the computed signals (Constitution II).

**Technical approach**: a tiny framework-free `sessionGoal` module in `domain/` (normalize + length caps + `hasContent`), a `SessionGoalRepository` port with a SQLite adapter (singleton row, available before any account sync), a read-only `GetSessionGoal` query and a `SaveSessionGoal` command behind two IPC channels, and a renderer `GoalNotes` component + `useSessionGoal` hook built **frontend-first against a stub** (Constitution VIII). For US2, `AnalyzeSession` reads the saved goal and threads it into `buildSessionPrompt` as a clearly-labelled "player intent" block; `computeSessionFeatures` stays untouched (the goal is intent, not a computed fact).

## Technical Context

**Language/Version**: TypeScript 5.8, Node ≥22 (Electron 35 main process), React 18 (renderer)
**Primary Dependencies**: existing only — `better-sqlite3` (persistence), `@anthropic-ai/sdk` (session coach, already wired). **No new dependencies.**
**Storage**: SQLite (existing DB). One new singleton table `session_goal` (one row). No per-match or per-account fan-out.
**Testing**: Vitest with the existing `test/unit` + `test/fixtures` layout; pure domain table-tested; SQLite adapter tested against an in-memory DB (mirrors `SqliteSessionAnalysisRepository.test.ts`); prompt builder tested for the new intent block.
**Target Platform**: Windows desktop (Electron); renderer is a local React SPA.
**Project Type**: Electron desktop app, hexagonal architecture in the main process; React renderer outside the hexagon.
**Performance Goals**: goal load/save is a single local SQLite read/write (instant, <16ms); it adds no network and does not change Quick Analysis's ~10s budget.
**Constraints**: secrets stay in main (Constitution VI — unaffected, no new secrets); domain/application import no SDK (Constitution IV); frontend built against a stub before wiring (Constitution VIII); goal ≤ 200 chars, notes ≤ 1000 chars (from spec edge cases / FR-012); works offline and before first sync (Constitution VII).
**Scale/Scope**: single user; one goal record; 2 new IPC channels; 1 new port + 1 adapter; 1 query + 1 command; 1 domain module; 1 renderer hook + 1 component; light edits to `AnalyzeSession`, `buildSessionPrompt`, `SessionCoachingModel`, container, IPC, preload, shared types, schema, Home.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle IV — Hexagonal Architecture**: `domain/sessionGoal.ts` is pure (no imports); `SessionGoalRepository` is a port in `application/ports/`; `GetSessionGoal` (query) and `SaveSessionGoal` (command) are use cases; the only SQLite touch is `SqliteSessionGoalRepository` in `adapters/driven/sqlite/`; wiring is in `infrastructure/container.ts`. No SDK import crosses into domain/application. The prompt-intent change lives entirely in the `adapters/driven/anthropic/` adapter; the `SessionCoachingModel` port gains an optional, framework-free `playerContext` argument (plain data).
- [x] **Principle VI — Secrets in Main Process**: no new secrets; the renderer receives/sends only `SessionGoal` text via IPC. No credential reaches preload/renderer.
- [x] **Principle VIII — Frontend First**: `GoalNotes` is built against `src/renderer/src/stubs/sessionGoal.ts` (shaped exactly to the new `SessionGoal` DTO) and reviewed across empty/read/edit states before any IPC wiring; wiring swaps the stub for `window.api.getSessionGoal()` / `saveSessionGoal()` with no layout change.
- [x] **Principle V — Test-First**: `normalizeSessionGoal`/`hasContent` are pure and table-tested (trim, caps, whitespace-only → empty); `SqliteSessionGoalRepository` is tested against an in-memory DB; `buildSessionPrompt` gains tests asserting the intent block appears when set and is absent when empty. No test touches the network.
- [x] **Principle VII — Offline-First**: goal/notes live in the local DB and are read by `AnalyzeSession` from the repository — no network, available offline and before first sync. The feature adds no API calls.

**Result**: PASS. No violations; Complexity Tracking not required.

### Constitution-specific notes carried into design

- **Principle II (Evidence-Grounded)**: the player's goal/notes are injected as **intent/context**, not as evidence. The prompt explicitly instructs the model: treat this as the player's own words, weave it into the read where the computed signals support it, never echo it in an `evidence` chip, and never invent figures to make a leak "fit" the goal. Evidence chips continue to come only from `SessionFeatures`. This preserves the single-source-of-truth rule at session altitude.
- **Principle III (Personalised Over Generic)**: the goal makes the read *more* personal without weakening the cohort/benchmark honesty — benchmark resolution and `benchmarkBasis` tagging are unchanged.
- **Honest about limits**: when no goal/notes are set, the prompt omits the intent block entirely and the analysis behaves exactly as today (FR-010, SC-003/SC-004) — the model never references a goal the player didn't set.

## Project Structure

### Documentation (this feature)

```text
specs/002-player-goal-notes/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ipc-session-goal.md
│   ├── session-goal-repository.port.md
│   └── session-prompt-intent.md
└── checklists/
    └── requirements.md  # From /speckit-specify
```

### Source Code (repository root)

```text
src/
  main/
    domain/
      sessionGoal.ts                       # NEW — SessionGoalInput/normalizeSessionGoal()/hasContent() (pure, no I/O)
    application/
      ports/
        SessionGoalRepository.ts           # NEW — get(): SessionGoal | null; save(goal): void
      queries/
        GetSessionGoal.ts                  # NEW — read-only; returns the saved goal or null
      commands/
        SaveSessionGoal.ts                 # NEW — normalize + persist
        AnalyzeSession.ts                  # EDIT — read goal from repo, pass playerContext into the model
    adapters/
      driven/
        sqlite/
          SqliteSessionGoalRepository.ts   # NEW — singleton-row upsert/read
          schema.ts                        # EDIT — CREATE TABLE session_goal
        anthropic/
          sessionPrompt.ts                 # EDIT — append a labelled "player intent" block when present
      driving/
        IpcController.ts                   # EDIT — register 'goal:get' and 'goal:save'
    application/ports/
      SessionCoachingModel.ts              # EDIT — analyzeSession(features, model, playerContext?)
    adapters/driven/anthropic/
      AnthropicSessionCoachingModel.ts     # EDIT — forward playerContext into buildSessionPrompt
    infrastructure/
      container.ts                         # EDIT — wire repo, query, command; inject repo into AnalyzeSession
  preload/
    index.ts                               # EDIT — expose getSessionGoal / saveSessionGoal
  shared/
    types.ts                               # EDIT — SessionGoal, SessionGoalInput, IpcApi additions
  renderer/src/
    stubs/
      sessionGoal.ts                       # NEW — stub SessionGoal states (Constitution VIII)
    data/
      useSessionGoal.ts                    # NEW — hook: load/edit/save state
    components/
      GoalNotes.tsx                        # NEW — empty/read/edit card (design's GoalNotes)
    screens/
      Home.tsx                             # EDIT — render <GoalNotes/> below the Hero

test/
  unit/
    sessionGoal.test.ts                    # NEW — normalize/caps/whitespace table tests
    SqliteSessionGoalRepository.test.ts    # NEW — save/get round-trip on in-memory DB
    sessionPrompt.test.ts                  # EDIT — intent block present when set / absent when empty
    AnalyzeSession.test.ts                 # EDIT — goal is read and forwarded to the model
```

**Structure Decision**: Follows the fixed hexagonal layout from `technical_brief.md`, mirroring the existing Quick Analysis slice. New domain logic is pure; the only persistence touch is one SQLite adapter; the two use cases (one query, one command) each map to one IPC channel; the renderer change is frontend-first against a stub. The goal text is consumed by the existing `AnalyzeSession` command via the new repository, keeping the LLM call in the adapter layer.

## Complexity Tracking

> No constitution violations — table intentionally empty.
