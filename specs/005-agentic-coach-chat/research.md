# Phase 0 Research: Agentic Coach Chat

All Technical Context unknowns resolved. Each decision below records what was chosen, why, and what was rejected.

---

## R1 — Shape of the agentic loop

**Decision**: Add one port method, `chatAgentic(briefing, history, extras, model) → { reply, proposal? }`, implemented in `AnthropicMatchCoachingModel` as a tool-use loop with `tool_choice: auto` over four **propose-only** tools (`propose_update_tasks`, `propose_create_reflection`, `propose_update_reflection`, `propose_delete_reflection`), hard-capped at **3 assistant tool rounds** per player message. A tool call never executes anything: the adapter captures the payload as a draft proposal and returns a synthetic `tool_result` ("Proposal recorded — it will be shown to the player for confirmation; continue your reply"). After the cap, or when the model stops calling tools, the accumulated text is the reply. At most **one proposal per player message** survives (the last valid one) — see R9.

**Rationale**: This keeps the spec-004 cost discipline (bounded, predictable: ≤3 light-tier rounds) while letting the model express intent-dependent action. Propose-only tools make confirm-first (FR-002) structural rather than conventional — there is no code path from a tool call to a write. The existing discovery step (plan → parallel fetch) is untouched and runs before the loop, exactly as today.

**Alternatives considered**:
- *Intent-classification call → fixed branches*: an extra light call on every message, poor handling of mixed intents, and it still needs a payload-generation call — more calls converging on the same outcome.
- *Free tool loop with execute-tools + undo*: violates the user's explicit confirm-first decision and the spec-004 invariant in spirit; rejected outright.
- *Structured single-shot (reply + optional proposal in one forced-tool schema)*: cheapest, but forces the model to decide the proposal before "thinking aloud" in text, and cannot ask itself for two different payload shapes; tool loop with cap 3 costs at most 2 extra light rounds and reads much more naturally.

## R2 — Where proposals live

**Decision**: Proposals are **embedded in the assistant `ChatTurn`** that delivered them (`turn.proposal?: ActionProposal`), persisted inside the session's `turns_json`. Resolution (accepted/rejected/stale + timestamp) mutates that embedded object via a dedicated repository operation that enforces **exactly-once** resolution inside a transaction.

**Rationale**: The transcript is already the durable record of the conversation; a card's resolved state is conversation history (FR-006: pending proposals survive restarts, resolved cards render their state forever). A separate `proposals` table would need a join back to the turn for rendering and creates a second source of truth. Staleness does *not* require a table either — it is computed at accept time against current state (R7).

**Alternatives considered**: dedicated `proposals` table (rejected: two sources of truth, join complexity, no query need beyond the owning session); renderer-only ephemeral cards (rejected: violates FR-006, restart loses pending proposals).

## R3 — Reflections storage & migration

**Decision**: New table `reflections (id TEXT PK, match_id TEXT NOT NULL, text TEXT NOT NULL, refs_json TEXT NOT NULL, source TEXT NOT NULL CHECK in ('player','coach'), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)` + index on `match_id`. Ids minted `${matchId}-refl-${now36}-${i}` (collision-proof, FR-027). Migration: for each `chat_transcripts` row with a non-null `reflection`, insert a reflection with **deterministic id** `${matchId}-refl-legacy`, `source='coach'`, `refs_json='[]'`, timestamps from `updated_at` — via `INSERT OR IGNORE`, making re-runs no-ops (FR-016 idempotency).

**Rationale**: Deterministic legacy ids are what make the migration idempotent without a migration-bookkeeping table. `source='coach'` is honest (finalize reflections were model-written in the player's voice). The spec-004 renderer "cleaned" copy (saved via `chat:reflection:save`) already overwrote the raw server copy in the same column, so the migrated value is what the player last saw.

**Alternatives considered**: `semantic_objects` rows with `kind='reflection'` (rejected with the user: subject-key dedup, occurrences, and evidence-match-id semantics don't fit free-form per-match texts); a `migrations` ledger table (unnecessary for two idempotent statements).

## R4 — Chat sessions storage, creation policy & migration

**Decision**: New table `chat_sessions (id TEXT PK, match_id TEXT NOT NULL, title TEXT NOT NULL, turns_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)` + index on `match_id`. **Lazy creation**: "New chat" is renderer state only (a draft session with the locally-built opener); a row is first written when the first *player* turn is persisted. This satisfies FR-020 (no empty-session accumulation) with zero GC. Titles default to a date-stamped label ("Chat · Jun 10, 19:42"), renaming out of scope. Session ids minted `${matchId}-sess-${now36}`. Migration: each `chat_transcripts` row with non-empty turns becomes session `${matchId}-sess-legacy`, title "First session", via `INSERT OR IGNORE` (idempotent, FR-019). `chat_transcripts` is kept on disk as the migration source but is no longer read or written by feature code; the spec-004 localStorage adoption path now writes a legacy-shaped session through the same deterministic-id insert.

**Rationale**: Lazy creation is the cheapest correct answer to the empty-session edge case. Deterministic `-legacy` ids give idempotency for both the schema migration and the still-live localStorage adoption.

**Alternatives considered**: eager row on "New chat" + GC of empties on load (more moving parts, races with two windows); AI-generated titles (deferred — spec assumption says simple titles suffice).

## R5 — Memory distillation trigger

**Decision**: `ResolveProposal`, on **accepting a coach-authored `create_reflection`** proposal, triggers semantic-memory distillation **best-effort and non-blocking**: the accept returns once the reflection row is written; distillation runs as a floating promise (`.catch` → log) that calls a trimmed model method (`distillMemory(briefing, transcript, existingMemory)` → `ProposedSemanticObject[]`, light tier) and merges via the existing `mergeSemanticObjects` (additive semantics preserved, FR-024). Player-authored manual reflections do **not** trigger distillation in this iteration.

**Rationale**: The accept must stay local-fast (SC: accept is a SQLite write); distillation needs connectivity and must never make Accept fail (FR-028 degradation). The additive merge already tolerates repeats — a re-distillation refreshes subjects rather than duplicating (same property FinalizeReflection relied on).

**Alternatives considered**: distill inside the proposal loop (rejected: side-effect-free loop is the cornerstone); distill synchronously on accept (rejected: couples a local write to network success); distill player reflections too (deferred: spec scopes distillation to coach reflections via US5; manual notes are often fragments).

## R6 — Task evidence refs

**Decision**: Extend `EvidenceRef` with kind `'task'`, id grammar `task:<standingTaskId>`. Renderer: wrap report `FocusTask` rows in the existing `Askable`. Resolution: `resolveChatRefs` gains a second lookup source — a `task:` ref resolves against the standing set passed in by the command, rendering `[TASK <id> "description" rule=<metric><comparator><target> scope=<scope> status=<active|retired>]`; unknown ids are silently dropped (existing invalid-ref behaviour, FR-022).

**Rationale**: Reuses the whole touchable-report pipeline (AskBadge → pending chips → grounded REF lines); the only genuinely new code is the lookup source. Resolving a *retired* task (still present, status `retired`) keeps "why did I keep failing this one?" answerable even after the set moved on.

**Alternatives considered**: injecting tasks into the anchor catalog (rejected: the catalog is per-report factual evidence rebuilt from match JSON; tasks are global mutable state with a different lifecycle).

## R7 — Staleness & exactly-once resolution

**Decision**: Two independent guards.
1. **Staleness (task proposals)**: when the loop emits a task proposal, the command stamps it with a `baseline` — the sorted list of `(id, metric, comparator, target, scope)` signatures of the *current* standing set. At accept time `ResolveProposal` recomputes the signature from the DB; mismatch ⇒ resolution `stale`, nothing applied, card shows "set changed — ask again". Reflection update/delete proposals carry the target reflection's `updated_at` as baseline; create proposals have no baseline (always applicable).
2. **Exactly-once**: `SqliteChatSessionRepository.resolveProposal(sessionId, proposalId, resolution)` runs in a transaction: load row, locate embedded proposal, fail if `resolution !== 'pending'`, write back. `ResolveProposal` marks the proposal resolved *first*, then applies the state change — a double-click's second call hits non-pending and returns the recorded outcome (idempotent response, SC-007).

**Rationale**: Signature-of-shape staleness catches every intervening mutation source (re-analysis pass 4, accepts in other sessions) without version counters on `standing_focus_tasks`. better-sqlite3 is synchronous and single-connection, so the transaction is a real mutual-exclusion point.

**Alternatives considered**: version column on standing tasks (schema churn; signature achieves the same with zero migration); last-write-wins (explicitly rejected by spec edge case).

## R8 — Finalize replacement

**Decision**: Delete `FinalizeReflection` (command + IPC `coach:reflection:finalize` + `ReflectionOutcome` DTO). New `SummarizeIntoReflection` command: builds the same briefing, calls a forced-tool model method that returns *only* reflection text + refs, wraps it as a standard `create_reflection` proposal appended as an assistant turn to the session — identical render/accept path as a chat-initiated proposal (FR-023). Task adjustment is fully removed from this flow (FR-025); distillation moved to accept (R5). The renderer button becomes "Summarize into a reflection" and requires ≥1 player turn (as today).

**Rationale**: One proposal pipeline, no special cases. The old flow's three concerns (reflection text, task changes, memory) each found a more precise home.

**Alternatives considered**: keeping finalize as a thin alias over chatAgentic with a steering message (rejected: a steered agentic call may produce the wrong tool or none; a forced-tool single call is deterministic and cheaper).

## R9 — Proposal cardinality & sanitisation order

**Decision**: At most **one pending proposal per session** at a time, and at most one minted per player message (last valid tool call wins; earlier ones in the same loop are superseded silently). Sanitisation runs in the command (pure `domain/chat/proposal.ts`) *before* the turn is persisted: task payloads → `GeneratedTask` validation + `mergeStanding` dry-run + `enforceStandingSet` (1–3, no empty-by-omission); reflection payloads → text trimmed/capped, refs filtered against anchor catalog ∪ standing set, unknown update/delete targets ⇒ proposal suppressed. A fully-suppressed proposal degrades to plain reply (FR-010/FR-028). If a proposal is already pending in the session, new tool calls are answered with "a proposal is already awaiting the player's decision" and no new proposal is minted.

**Rationale**: Single-pending keeps the accept-time semantics simple (no ordering ambiguity between two pending task proposals) and matches the conversational rhythm the spec describes (propose → decide → continue). Sanitise-before-persist guarantees the transcript never contains an unacceptable card (FR-010) — including after restart.

**Alternatives considered**: multiple concurrent pending proposals (rejected: two pending task proposals are inherently conflicting; UI and staleness rules get complicated for no user value).

## R10 — Reworked chat command & context

**Decision**: `CoachChat.execute(matchId, sessionId, messages)` keeps its discovery flow unchanged and adds: (a) a `REFLECTIONS` context block — all of this match's reflections as compact lines (`REFL <source> <age> "text" refs=[...]`), included in every call (FR-015/FR-018); (b) proposal-state grounding — resolved proposals in `history` are rendered into the transcript the model sees as bracketed outcomes (`[player accepted the task change]` / `[player rejected: ...]`), which is how "Reject informs the coach" (FR-005) works without a side channel; (c) the agentic extras (current standing set + metric keys + existing reflection list) needed to make proposals validatable.

**Rationale**: Context is already rebuilt server-side per call (Constitution VI pattern); reflections are just one more block. Encoding resolution outcomes into the visible transcript is the simplest reliable feedback channel and survives session reload.

**Alternatives considered**: separate "system event" turn role (renderer/type churn for the same effect); only including reflections on request via discovery (rejected: FR-018 requires them in every session's base context — they're small).
