---
description: "Task list for Session Goal & Notes"
---

# Tasks: Session Goal & Notes

**Input**: Design documents from `/specs/002-player-goal-notes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks ARE included — Constitution V (Test-First with Fixtures) makes Vitest tests mandatory for every `domain/` and `application/` unit and for the SQLite adapter. The renderer has no test harness, so UI is validated by the frontend-first review gate (Constitution VIII) and the quickstart, not automated tests.

**Organization**: Tasks are grouped by user story. US1 (the persistent goal pad) is the MVP; US2 feeds it to the coach; US3 hardens the honest-empty behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish have no story label)
- All paths are repo-relative from `d:\projects\corky`

---

## Phase 1: Setup

**Purpose**: Confirm a clean baseline before changes. No new dependencies are introduced by this feature.

- [X] T001 Confirm a green baseline by running `npm run typecheck` and `npm test`; note any pre-existing failures so new work is distinguishable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared DTO seam both the renderer (stub) and the main process build against. Per Constitution VIII the stub must mirror these exact shapes.

**⚠️ CRITICAL**: No user story work can begin until this is complete.

- [X] T002 Add `SessionGoal` (`{ goal: string; notes: string; updatedAt: number | null }`), `SessionGoalInput` (`{ goal: string; notes: string }`), and the two new `IpcApi` methods (`getSessionGoal`, `saveSessionGoal`) to `src/shared/types.ts` per `contracts/ipc-session-goal.md`.

**Checkpoint**: DTOs exist — frontend and backend can proceed.

---

## Phase 3: User Story 1 - Capture and keep a session goal and notes (Priority: P1) 🎯 MVP

**Goal**: A persistent "Session goal & notes" card on Home — empty / read / edit states — whose text survives app restart.

**Independent Test**: Open Home, set a goal + notes, save, restart `npm run dev` → the goal and notes are shown exactly as entered; first-run (no goal) shows the empty-state prompt.

### Frontend first (Constitution VIII — build against stub, review, THEN wire)

- [X] T003 [P] [US1] Create `src/renderer/src/stubs/sessionGoal.ts` exporting stub `SessionGoal` values for the empty (`null`), read (goal + multi-line notes), and long-text (cap) cases, mirroring the DTO exactly.
- [X] T004 [US1] Create `src/renderer/src/data/useSessionGoal.ts` — hook owning `{ value, editing, draft, startEdit, cancel, save }`; initially reads from the stub and `save` is a local no-op. (depends on T002, T003)
- [X] T005 [US1] Create `src/renderer/src/components/GoalNotes.tsx` porting the design's `GoalNotes` card (gold-accent `Card`, `flag` icon, eyebrow labels): empty state with "Set a goal" CTA, read mode (goal prominent + each non-blank note line as a bullet, "No goal set." when goal blank), edit mode (goal input `maxLength=200`, notes textarea `maxLength=1000`, Save/Cancel, ⌘/Ctrl+Enter to save, Esc to cancel). Consume `useSessionGoal`. (depends on T004)
- [X] T006 [US1] Render `<GoalNotes/>` inside a `<section>` directly below the `Hero` section in `src/renderer/src/screens/Home.tsx`. (depends on T005)
- [X] T007 [US1] Run `npm run dev` and review all three states (empty / read / edit, incl. cancel + keyboard shortcuts). **Frontend-first approval gate — do not wire backend until this passes.** (depends on T006)

### Domain (test-first)

- [X] T008 [P] [US1] Write `test/unit/sessionGoal.test.ts` — table tests: trims goal & notes; caps goal at 200 and notes at 1000; whitespace-only → `''`; `hasContent` truth table. Run; confirm it FAILS (module absent).
- [X] T009 [US1] Implement `src/main/domain/sessionGoal.ts` — pure `normalizeSessionGoal(input)` and `hasContent(value)` — to pass T008. (depends on T008)

### Persistence (port + migration + adapter, test-first)

- [X] T010 [P] [US1] Append the `session_goal` singleton table (`id INTEGER PRIMARY KEY CHECK (id = 1)`, `goal`, `notes`, `updated_at`) to `runMigrations` in `src/main/adapters/driven/sqlite/schema.ts` per `data-model.md`.
- [X] T011 [P] [US1] Create the port `src/main/application/ports/SessionGoalRepository.ts` (`get(): SessionGoal | null`; `save(value: SessionGoalInput, updatedAt: number): SessionGoal`) per `contracts/session-goal-repository.port.md`.
- [X] T012 [US1] Write `test/unit/SqliteSessionGoalRepository.test.ts` (in-memory `better-sqlite3` + `runMigrations`, mirroring `SqliteSessionAnalysisRepository.test.ts`): fresh `get()` → null; save→get round-trip; second save upserts in place; save of empty fields → cleared row. Run; confirm it FAILS. (depends on T010, T011)
- [X] T013 [US1] Implement `src/main/adapters/driven/sqlite/SqliteSessionGoalRepository.ts` (upsert/read row `id = 1`) to pass T012. (depends on T012)

### Use cases

- [X] T014 [P] [US1] Implement read-only query `src/main/application/queries/GetSessionGoal.ts` returning `repo.get()`. (depends on T011)
- [X] T015 [US1] Implement command `src/main/application/commands/SaveSessionGoal.ts` — `normalizeSessionGoal(input)` → `repo.save(normalized, now())` → return stored record; inject `now` for testability. (depends on T009, T011)

### Wire backend (only after T007 approval)

- [X] T016 [US1] Register `goal:get` → `getSessionGoal.execute()` and `goal:save` → `saveSessionGoal.execute(input)` in `src/main/adapters/driving/IpcController.ts` (add both to the `deps` type). (depends on T014, T015)
- [X] T017 [US1] Expose `getSessionGoal` and `saveSessionGoal` on the `api` object in `src/preload/index.ts` (import `SessionGoal`, `SessionGoalInput`). (depends on T002)
- [X] T018 [US1] In `src/main/infrastructure/container.ts` construct `SqliteSessionGoalRepository`, `GetSessionGoal`, `SaveSessionGoal`; add them to the returned deps and to the `registerIpcHandlers` call site. (depends on T013, T014, T015, T016)
- [X] T019 [US1] Swap `useSessionGoal` from the stub import to `window.api.getSessionGoal()` / `window.api.saveSessionGoal()` — no layout or shape change (Constitution VIII). (depends on T017, T018, T004)

**Checkpoint (US1 / MVP)**: Set + edit + cancel work; goal/notes persist across a `dev` restart (SC-002); first run shows the empty state (SC-006). Quick Analysis unaffected.

---

## Phase 4: User Story 2 - Coaching that reflects my goal (Priority: P2)

**Goal**: Quick Analysis takes the saved goal + notes into account as the player's stated intent.

**Independent Test**: With a goal set (e.g. "convert one 20-minute lead into a closed game"), run Quick Analysis → the read speaks to that focus; clear the goal, run again → no reference to a goal. Evidence chips still come only from computed signals.

- [X] T020 [US2] Add `PlayerContext` (`{ goal: string; notes: string }`) and an optional third `playerContext?: PlayerContext` parameter to `analyzeSession` in `src/main/application/ports/SessionCoachingModel.ts` per `contracts/session-prompt-intent.md` (backward-compatible).
- [X] T021 [US2] Extend `test/unit/sessionPrompt.test.ts`: with a `playerContext` the user prompt contains the goal text + a "stated intent / NOT a computed fact" instruction; with `playerContext` undefined the output equals today's prompt (no `Goal:` line). Run; confirm the present-block case FAILS. (depends on T020)
- [X] T022 [US2] In `src/main/adapters/driven/anthropic/sessionPrompt.ts` update `buildSessionPrompt(f, playerContext?)` to append the labelled intent block ONLY when `playerContext` is present and non-empty (notes as bullet lines), with the honesty guardrails from the contract; identical output when absent. Pass T021. (depends on T021)
- [X] T023 [US2] In `src/main/adapters/driven/anthropic/AnthropicSessionCoachingModel.ts` thread the new `playerContext` arg from `analyzeSession` into `buildSessionPrompt`. (depends on T022)
- [X] T024 [US2] Extend `test/unit/AnalyzeSession.test.ts`: when the goal repo returns content, `model.analyzeSession` is called with a third `playerContext` arg carrying that goal/notes (spy/fake model). Run; confirm it FAILS. (depends on T020)
- [X] T025 [US2] In `src/main/application/commands/AnalyzeSession.ts` add a constructor-injected `SessionGoalRepository` (after existing args, default `null` to keep current tests green); before the model call, read the goal and pass `playerContext` when `hasContent`, else `undefined`. Pass T024. (depends on T009, T011, T020, T024)
- [X] T026 [US2] In `src/main/infrastructure/container.ts` pass the `SqliteSessionGoalRepository` instance into the `AnalyzeSession` constructor. (depends on T013, T018, T025)

**Checkpoint (US2)**: A goal set in US1 visibly shapes the Quick Analysis read; with no goal the read is byte-for-byte today's behavior.

---

## Phase 5: User Story 3 - Graceful empty and honest limits (Priority: P3)

**Goal**: Never get in the way and never fabricate intent — inviting empty state, clean partial render, and analysis that makes zero goal references when none is set.

**Independent Test**: With no goal/notes, Home shows the prompt (not a blank box) and a Quick Analysis run produces its normal read with no goal references; with goal-only or notes-only, only the populated part renders.

- [X] T027 [US3] In `src/main/application/commands/AnalyzeSession.ts` confirm the empty/missing-goal path passes `playerContext` undefined and produces a result identical to the no-goal-repo path (no extra branches, no goal echoed into provenance). Refine if the US2 implementation left a gap. (depends on T025)
- [X] T028 [US3] Extend `test/unit/AnalyzeSession.test.ts` with the honesty case: a repo returning `null` / empty goal → `model.analyzeSession` called with `playerContext` undefined and the returned `SessionAnalysis` is unchanged from the no-goal baseline. (depends on T025)
- [X] T029 [US3] In `src/renderer/src/components/GoalNotes.tsx` verify the partial states render cleanly: goal set + notes empty → notes section omitted; notes set + goal blank → "No goal set." shown and notes listed; whitespace-only save returns to the empty state. (depends on T005, T019)
- [X] T030 [US3] Validate the honesty checkpoints from `quickstart.md`: first-run empty state (SC-006), and a Quick Analysis run with no goal containing no goal reference (SC-003/SC-004). (depends on T026, T029)

**Checkpoint (US3)**: Empty/partial states are clean; analysis is honest when no goal is set.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across the stack.

- [X] T031 [P] Run `npm run typecheck` (node + web) and the full `npm test` suite → all green; fix any regressions.
- [X] T032 Run the full `quickstart.md` walkthrough end-to-end: empty → set → edit → cancel → save → restart persistence; Quick Analysis with and without a goal.
- [X] T033 [P] Quick self-review of the diff for adherence (hexagonal boundaries intact, no SDK import in domain/application, no secrets to renderer, UI unchanged by the wiring step).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → no deps.
- **Foundational (T002)** → blocks everything (DTO seam).
- **US1 (T003–T019)** → after T002. Frontend sub-block (T003–T007) and backend sub-block (T008–T018) can proceed in parallel; the wiring swap (T019) needs both the approved frontend (T007) and the wired backend (T018).
- **US2 (T020–T026)** → needs the domain `hasContent` (T009) and the repo port (T011) from US1; functionally exercised end-to-end once US1's wiring (T018/T026) is in place.
- **US3 (T027–T030)** → after US2's `AnalyzeSession` change (T025) and US1's UI wiring (T019).
- **Polish (T031–T033)** → after all desired stories.

### Within each story

- Test-first: T008 before T009; T012 before T013; T021 before T022; T024 before T025.
- Models/ports before services: T011 before T014/T015; port T020 before adapter/command edits.
- Frontend built and approved (T007) before backend wiring swap (T019).

### Parallel opportunities

- **US1 kickoff after T002**: T003 (stub), T008 (domain test), T010 (migration), T011 (port) are all `[P]` — different files, no mutual deps.
- T014 (`GetSessionGoal`) is `[P]` with T015 once the port (T011) exists (different files).
- US1's frontend track (T003→T007) and backend track (T008→T018) run concurrently until the T019 swap.

---

## Parallel Example: User Story 1 launch

```bash
# After T002 (DTOs), start these together:
Task: "T003 Create stub src/renderer/src/stubs/sessionGoal.ts"
Task: "T008 Write test/unit/sessionGoal.test.ts (failing)"
Task: "T010 Append session_goal migration in schema.ts"
Task: "T011 Create SessionGoalRepository port"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (T002).
2. Phase 3 US1: build the stub UI, get the frontend-first approval (T007), implement domain + persistence + use cases, then wire and swap (T019).
3. **STOP and VALIDATE**: a persistent goal/notes pad on Home — shippable on its own.

### Incremental delivery

1. US1 → the pad (MVP).
2. US2 → the coach reads the goal (the feature's real payoff).
3. US3 → honest-empty hardening + partial-render polish.
4. Polish → typecheck/test/quickstart sweep.

---

## Notes

- `[P]` = different files, no incomplete-task deps.
- Constitution gates enforced in-order: **stub UI → review (T007) → wire backend → swap (T019)**; tests precede implementations for every domain/application/adapter unit.
- `computeSessionFeatures` is intentionally NOT modified — the goal is intent, not a computed fact (research Decision 3), so its existing test suite stays green.
- Commit after each logical group; stop at any checkpoint to validate the story independently.
