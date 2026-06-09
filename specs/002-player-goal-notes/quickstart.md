# Quickstart: Session Goal & Notes

A build/verify walkthrough following the constitution's mandatory order: **stub UI → review → wire backend → verify end-to-end**, tests alongside each layer.

## Prerequisites

- Repo installed (`npm install`), `.env` present for `dev` runs (not needed for unit tests).
- Branch: `002-player-goal-notes`.

## Step 1 — Shared DTOs (contract first)

Add `SessionGoal`, `SessionGoalInput`, and the two `IpcApi` methods to `src/shared/types.ts` (see `contracts/ipc-session-goal.md`). These shapes are the seam both sides build against.

## Step 2 — Frontend first (Constitution VIII)

1. `src/renderer/src/stubs/sessionGoal.ts` — export stub `SessionGoal` values covering **empty** (`null` / both fields `''`), **read** (goal + multi-line notes), and a long-text case (caps).
2. `src/renderer/src/components/GoalNotes.tsx` — port the design's `GoalNotes` (gold-accent `Card`, flag icon, eyebrow labels) with the three states and keyboard shortcuts (⌘/Ctrl+Enter save, Esc cancel). Read its state from a `useSessionGoal` hook.
3. `src/renderer/src/data/useSessionGoal.ts` — initially returns stub data and a no-op `save`. Owns `editing`/`draft` state.
4. `src/renderer/src/screens/Home.tsx` — render `<GoalNotes/>` in a `<section>` directly below the `Hero` (matching the design placement).
5. Run `npm run dev`, eyeball all three states on Home. **Review/approve before any wiring.**

**Checkpoint**: Home shows the card in empty/read/edit; no backend involved.

## Step 3 — Domain + tests (pure, test-first)

1. `src/main/domain/sessionGoal.ts` — `normalizeSessionGoal` (trim, cap goal ≤ 200 / notes ≤ 1000, whitespace-only → '') and `hasContent`.
2. `test/unit/sessionGoal.test.ts` — table tests: trims; caps at the limits; whitespace-only → empty; `hasContent` truth table.
3. `npm test` → green.

## Step 4 — Persistence (port + adapter + migration)

1. `src/main/application/ports/SessionGoalRepository.ts` — the port (`contracts/session-goal-repository.port.md`).
2. `src/main/adapters/driven/sqlite/schema.ts` — append the `session_goal` singleton table (`data-model.md`).
3. `src/main/adapters/driven/sqlite/SqliteSessionGoalRepository.ts` — upsert/read row `id = 1`.
4. `test/unit/SqliteSessionGoalRepository.test.ts` — round-trip on an in-memory DB (mirror `SqliteSessionAnalysisRepository.test.ts`).
5. `npm test` → green.

## Step 5 — Use cases (query + command)

1. `src/main/application/queries/GetSessionGoal.ts` — returns `repo.get()`.
2. `src/main/application/commands/SaveSessionGoal.ts` — `normalizeSessionGoal(input)` → `repo.save(normalized, now())` → return stored record.
3. (Optional) thin use-case tests with a fake repo.

## Step 6 — Wire backend (IPC + preload + container)

1. `IpcController.ts` — register `goal:get`, `goal:save`.
2. `preload/index.ts` — expose `getSessionGoal`, `saveSessionGoal`.
3. `infrastructure/container.ts` — construct repo, query, command; add to the returned deps and the IPC registration.
4. Swap `useSessionGoal` from the stub to `window.api.getSessionGoal()` / `saveSessionGoal()` — **no UI change** (Constitution VIII).

**Checkpoint (US1)**: set a goal + notes, restart `dev` → text persists (SC-002); empty state on first run (SC-006).

## Step 7 — Feed the coach (US2)

1. `SessionCoachingModel.ts` — add optional `playerContext` (`contracts/session-prompt-intent.md`).
2. `sessionPrompt.ts` — append the labelled intent block when present; identical output when absent.
3. `AnthropicSessionCoachingModel.ts` — forward `playerContext` into `buildSessionPrompt`.
4. `AnalyzeSession.ts` — inject `SessionGoalRepository`; read the goal, pass `playerContext` when `hasContent`.
5. `container.ts` — pass the goal repo into `AnalyzeSession`.
6. `test/unit/sessionPrompt.test.ts` + `AnalyzeSession.test.ts` — assert intent block present-when-set / absent-when-empty and that the goal is read + forwarded.

**Checkpoint (US2/US3)**: with a goal set, run Quick Analysis → the read speaks to the goal (SC-003); clear it → no reference to a goal (SC-003/SC-004).

## Step 8 — Full verification

- `npm run typecheck` and `npm test` → all green.
- `npm run dev`: exercise empty → set → edit → cancel → save → restart; run Quick Analysis with and without a goal.

## Maps to spec

- US1 → Steps 2–6 (capture/persist/show). US2 → Step 7 (coach uses it). US3 → empty-state in Step 2 + absent-block path in Step 7.
- SC-001/002/006 verified at Step 6; SC-003/004/005 at Step 7.
