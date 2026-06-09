# Phase 0 Research: Session Goal & Notes

All Technical Context items resolved against the existing codebase; no open NEEDS CLARIFICATION. The feature reuses established patterns from the Quick Analysis slice (`001-quick-analysis-llm-coach`), so research is mostly "match the existing decision."

## Decision 1 — Where the goal/notes are persisted (main-process SQLite, not renderer localStorage)

- **Decision**: Persist in the main process via SQLite behind a `SessionGoalRepository` port, not in renderer `localStorage` (which the design prototype used).
- **Rationale**: The saved text must be readable by `AnalyzeSession`, which runs in the **main process** (US2 — the coach needs the goal). Renderer `localStorage` is not reachable there. SQLite + a port also satisfies Constitution IV (hexagonal) and VII (offline-first), and matches how every other piece of player state is stored (`summoner_profile`, `session_analyses`, …).
- **Alternatives considered**: (a) renderer `localStorage` + send the text along with the "run analysis" IPC call — rejected: splits the source of truth, loses the value on a fresh main-process read, and couples the UI to the coach payload; (b) a file on disk — rejected: SQLite is already the local store and gives us atomic upsert for free.

## Decision 2 — Singleton row vs. per-account (`puuid`) keying

- **Decision**: Store the goal as a **singleton row** (`session_goal` with a single enforced row), not keyed by `puuid`.
- **Rationale**: The empty-state and the goal pad must work **before any account is synced** (FR-007, SC-006 — first-run players). A `puuid` key can't be resolved before `account` exists. Corky is single-user, so one global goal record is the correct domain model; "session" here means "the climb you're focused on", not an account partition.
- **Alternatives considered**: per-`puuid` (mirrors `session_analyses`) — rejected: blocks the pre-sync empty state and adds needless keying for a single-user app. If multi-account ever lands, this migrates to a keyed table behind the same port with no domain/UI change.

## Decision 3 — Goal as model *intent*, not a computed *fact*

- **Decision**: Inject goal/notes into the coach via `buildSessionPrompt` as a clearly-labelled "player's own stated goal & notes" block, passed through an optional `playerContext` argument on the `SessionCoachingModel` port. **Do not** add it to `SessionFeatures` / `computeSessionFeatures`.
- **Rationale**: `SessionFeatures` is the evidence single-source-of-truth (Constitution II); every number the model may cite lives there. The goal is the player's *intent*, not a measured number — mixing it into the facts object would blur the "annotate only the facts" contract and risk the model citing the player's words as evidence. Keeping `computeSessionFeatures` untouched also means its substantial existing test suite is unaffected.
- **Alternatives considered**: (a) add `goal`/`notes` fields to `SessionFeatures` — rejected for the reasons above; (b) prepend the goal to the system prompt — rejected: per-run player data belongs in the user message, and the existing builder already assembles the user message; (c) a second LLM call — rejected: unnecessary cost/latency, one call handles it.

## Decision 4 — Prompt guardrails for honesty

- **Decision**: The intent block carries explicit instructions: treat it as the player's own words; weave it into the read only where the computed signals support it; **never** echo it inside an `evidence` chip; **never** invent figures to make a leak fit the goal; if the goal can't be spoken to from the data, say so plainly. When goal and notes are both empty, the block is omitted entirely and behaviour is identical to today.
- **Rationale**: Directly enforces FR-010/FR-011 and Corky's evidence-over-assertion voice (requirements.md, constitution II). Mirrors the existing prompt's "cite only the numbers provided" rule.
- **Alternatives considered**: trusting the model without explicit guardrails — rejected: the existing prompt is heavily ruled for exactly this reason; consistency matters.

## Decision 5 — Validation / length caps location

- **Decision**: A pure `normalizeSessionGoal(input)` in `domain/sessionGoal.ts` trims goal and notes, caps goal at 200 and notes at 1000 characters, and treats whitespace-only as empty. `SaveSessionGoal` calls it before persisting; the renderer also sets `maxLength` on the inputs for immediate UX, but the domain function is the source of truth.
- **Rationale**: Caps come from the spec's edge cases / FR-012 (goal ≤ 200, notes ≤ 1000). Centralising in a pure function keeps it table-testable (Constitution V) and keeps the cap authoritative on the trusted side, not only in the UI.
- **Alternatives considered**: enforce only in the renderer — rejected: the main process must not trust renderer input as the sole guard; enforce in the SQL layer — rejected: business rule belongs in domain.

## Decision 6 — Renderer state & frontend-first

- **Decision**: New `useSessionGoal` hook owns load + draft/edit/save state; `GoalNotes.tsx` renders the three states (empty / read / edit) with ⌘/Ctrl+Enter to save and Esc to cancel, matching the design. Built first against `src/renderer/src/stubs/sessionGoal.ts`, then wired to `window.api`.
- **Rationale**: Constitution VIII mandates stub-first; mirrors `useQuickAnalysis` + the Quick Analysis stub already in the repo.
- **Alternatives considered**: inline state in `Home.tsx` like the other sections — rejected: this section has real persistence + an edit lifecycle, which warrants a hook and a dedicated, testable component.

## Resolved unknowns

- **Length caps**: goal ≤ 200, notes ≤ 1000 (spec). ✔
- **Persistence target**: main-process SQLite singleton row. ✔
- **Coaching scope**: Quick Analysis (`AnalyzeSession`) only this feature; post-game report deferred (spec Assumptions). ✔
- **No new dependencies, no new secrets, no network.** ✔
