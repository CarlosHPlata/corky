# Feature Specification: Agentic Coach Chat

**Feature Branch**: `005-agentic-coach-chat`
**Created**: 2026-06-10
**Status**: Draft
**Input**: User description: "Agentic coach chat with task negotiation, first-class reflections, and multiple chat sessions per match. Evolves the spec-004 read-only post-game chat into an agentic coach that can propose changes to standing focus tasks and reflections (confirm-first), supports multiple reflections per match with evidence references, multiple chat sessions per match, touchable task rows, and demotes the finalize ceremony."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Negotiate next-game tasks in chat (Priority: P1)

After a game is analysed, the player opens the coach chat to settle what they will focus on next game. They can talk about the current standing tasks ("the CS task feels too easy", "swap the vision task for something about deaths"), and the coach responds by proposing a concrete change to the task set. The proposal appears inline in the conversation as a card showing the resulting task list. The player accepts it (the standing set updates everywhere — report, Home screen) or rejects it (nothing changes, the coach is told and can re-propose). The chat actively steers toward leaving the session with a settled task set — that is its primary purpose.

**Why this priority**: Task negotiation is the stated core purpose of the chat. Today the chat is read-only and tasks only change through the opaque finalize step; the player has no direct lever. This story delivers the central value on its own.

**Independent Test**: Open the chat for an analysed match, ask to change a task, accept the proposal card, and verify the standing task set changed on the report and persists across an app restart.

**Acceptance Scenarios**:

1. **Given** an analysed match with 2 standing tasks, **When** the player asks the coach to make one task stricter, **Then** the coach replies with a proposal card showing the modified task set (1–3 tasks, each metric-checkable), and nothing is persisted yet.
2. **Given** a visible task proposal card, **When** the player accepts it, **Then** the new standing set is persisted, the report's Next-game focus section re-renders with the new set, and the card shows an accepted state.
3. **Given** a visible task proposal card, **When** the player rejects it, **Then** the standing set is unchanged, the card shows a rejected state, and the coach acknowledges and can offer an alternative.
4. **Given** the player merely discusses the game without asking for changes, **When** the conversation continues, **Then** the coach does not emit proposals on every turn — it proposes only when the player's intent calls for a change, though it may nudge toward settling tasks before the session ends.
5. **Given** a proposal card that was never accepted or rejected, **When** the player closes the app or switches matches, **Then** the proposal remains pending in the transcript and can still be accepted or rejected when the session is reopened.

---

### User Story 2 - Capture reflections, manually or via the coach (Priority: P1)

The player can record multiple reflections per match. They can write one themselves in a Reflections section on the match report — optionally attaching evidence picked off the report (a timeline death marker, a stat tile) before writing, so the reflection is anchored to specific moments. Or, mid-conversation, they can ask the coach to turn what they've been discussing into a reflection; the coach proposes the text (with any evidence references from the conversation), and the player accepts or rejects it. Reflections can be edited and deleted, both manually and by asking the coach.

**Why this priority**: Reflections are the second pillar of the requested change — the player explicitly wants to author durable takeaways, not just receive one machine-written paragraph at the end. Co-equal in value with task negotiation and independently testable.

**Independent Test**: Without using the chat at all, add a manual reflection with an attached timeline reference on the report, restart the app, and verify it persists with its reference intact. Separately, ask the coach to capture the conversation as a reflection and accept it.

**Acceptance Scenarios**:

1. **Given** an analysed match, **When** the player writes a reflection in the Reflections section and saves it, **Then** it appears in the match's reflection list with source "you" and persists across restarts.
2. **Given** the player has clicked a timeline death marker to pick it as evidence, **When** they write and save a manual reflection, **Then** the saved reflection carries that evidence reference and displays it as a labelled chip.
3. **Given** an ongoing chat about a botched objective fight, **When** the player asks "save that as a reflection", **Then** the coach proposes reflection text referencing the discussed evidence, and accepting it adds the reflection to the match's list with source "coach".
4. **Given** an existing reflection, **When** the player edits or deletes it (manually, or by asking the coach and accepting the proposal), **Then** the change persists and is reflected in the list immediately.
5. **Given** a match that had a finalized reflection from the previous version of the app, **When** the player opens that match after upgrading, **Then** the old reflection appears as the first entry in the new Reflections list with nothing lost.

---

### User Story 3 - Multiple chat sessions per match (Priority: P2)

The player can start a fresh conversation for the same match — to change topic, or because the current thread has grown long. A session switcher lists this match's conversations; a "New chat" button opens a clean one. Every new session starts with the coach already knowing the match facts, the analysis read, the current standing tasks, all reflections recorded for this match, and the player's coaching memory — but with an empty visible transcript.

**Why this priority**: Valuable for context hygiene and multi-topic use, but the feature is fully usable with a single session per match. Builds on Stories 1–2 without changing them.

**Independent Test**: Hold a conversation in session 1, create a reflection, start a new session, and verify the coach in session 2 can reference that reflection while the visible transcript starts empty. Switch back to session 1 and verify its transcript is intact.

**Acceptance Scenarios**:

1. **Given** an existing conversation for a match, **When** the player clicks "New chat", **Then** a fresh session opens with an empty transcript and the previous session remains available in the switcher.
2. **Given** a reflection saved earlier for this match, **When** the player asks about it in a brand-new session, **Then** the coach can discuss it without the player re-explaining (its content is part of the coach's context).
3. **Given** multiple sessions for a match, **When** the player switches between them, **Then** each shows its own transcript, including its own pending/accepted/rejected proposal cards.
4. **Given** a match with a chat transcript from the previous version of the app, **When** the player opens it after upgrading, **Then** that transcript appears as the first session for the match.

---

### User Story 4 - Tasks are touchable evidence (Priority: P2)

Standing task rows on the report behave like timeline markers already do: the player can click a task to attach it as evidence to their next chat message ("why do I keep failing THIS one?"). The coach receives the task's exact description and rule as grounded context for the question.

**Why this priority**: Completes the touchable-report pattern and makes task negotiation (Story 1) more precise, but Story 1 works without it via plain text.

**Independent Test**: Click a standing task row, see its chip in the chat composer, send a message, and verify the coach's answer addresses that specific task's rule.

**Acceptance Scenarios**:

1. **Given** the report shows standing tasks, **When** the player clicks a task's ask affordance, **Then** a chip with the task description appears among the pending evidence for the next message.
2. **Given** a message sent with a task reference, **When** the coach replies, **Then** the reply is grounded in that task's actual description, rule, and scope (not a paraphrase from conversation memory).
3. **Given** a task reference whose task was retired between picking and sending, **When** the message is sent, **Then** the system handles it gracefully (the reference is dropped silently, consistent with how invalid report references behave today).

---

### User Story 5 - Summarize-into-reflection replaces finalize (Priority: P3)

The old "Save reflection" ceremony is replaced by a lightweight "Summarize into a reflection" action. It triggers the same propose-accept flow as asking the coach in chat: the coach drafts a reflection from the conversation, and the player accepts or rejects it. Task changes no longer ride this step — they happen live in chat (Story 1). The coaching memory distillation that used to run at finalize now runs when a coach-authored reflection is accepted.

**Why this priority**: A simplification/cleanup of an existing flow; depends on Stories 1–2 being in place.

**Independent Test**: After a few chat turns, click "Summarize into a reflection", accept the proposal, and verify a reflection was added, no task change occurred, and coaching memory was updated from the session.

**Acceptance Scenarios**:

1. **Given** a conversation with at least one player turn, **When** the player clicks "Summarize into a reflection", **Then** a reflection proposal card appears in the chat (identical in behaviour to a chat-initiated one).
2. **Given** an accepted coach-authored reflection, **Then** coaching memory (patterns/weaknesses/strengths/milestones) is updated from the session additively — known subjects refreshed, new ones added, nothing removed by omission.
3. **Given** a rejected reflection proposal, **Then** no reflection is stored and no coaching memory update occurs.

---

### Edge Cases

- **Proposal staleness**: the player accepts a task proposal after the standing set changed elsewhere (e.g. a re-analysis ran, or an accept in another session). Acceptance must validate against the current set; if the proposal no longer applies cleanly, it is marked stale and the player is told to ask again, rather than silently clobbering newer state.
- **Double-acting on a card**: rapid double-clicks on Accept, or Accept in one session view while the same card was already resolved — a card can be resolved exactly once; later attempts are no-ops with visible resolved state.
- **Tool-loop runaway**: the model keeps requesting tools — the loop is hard-capped (≈3 tool rounds per player message); on hitting the cap the coach must still produce a plain-text reply.
- **Invalid proposals from the model**: a proposed task with a non-computable metric, more than 3 tasks, an empty set when tasks exist, a reflection referencing an unknown evidence id — invalid parts are dropped or the proposal is rejected before it ever renders; the player never sees an unacceptable proposal.
- **Reflection with zero references**: fully valid — references are 0..n.
- **Deleting a reflection the coach references later**: the coach's context is rebuilt per call, so a deleted reflection simply stops appearing; no dangling behaviour.
- **Empty new session immediately abandoned**: sessions with no player turns should not pile up in the switcher (an empty session is reused or not persisted).
- **Migration is idempotent**: re-running the upgrade migration (e.g. after a crash mid-migration) must not duplicate reflections or sessions.
- **Chat service unreachable**: conversation degrades exactly as today (apologetic message, retry); manual reflection authoring must keep working offline since it involves no model call.

## Requirements *(mandatory)*

### Functional Requirements

**Agentic chat & proposals**

- **FR-001**: The coach chat MUST be able to interpret player intent and produce action proposals of these kinds: update the standing task set (add/modify/retire), create a reflection, update a reflection, delete a reflection.
- **FR-002**: A proposal MUST NOT change any persisted state by itself. State changes occur only when the player explicitly accepts the proposal.
- **FR-003**: Proposals MUST render inline in the chat transcript as cards showing the full resulting state (for tasks: the complete resulting task list; for reflections: the full text plus its evidence references), with Accept and Reject actions.
- **FR-004**: On acceptance, the system MUST persist the change and reflect it everywhere the affected data is shown (report sections, Home screen, reflection list) without requiring a re-analysis.
- **FR-005**: On rejection, the system MUST discard the proposal and inform the coach in-conversation so it can respond or re-propose.
- **FR-006**: A proposal card MUST be resolvable exactly once; its resolved state (accepted/rejected/stale) persists with the transcript.
- **FR-007**: Acceptance MUST validate the proposal against current state at accept time; a proposal invalidated by intervening changes is marked stale and not applied.
- **FR-008**: The agentic loop MUST be bounded to at most 3 tool rounds per player message; when the bound is hit the coach still returns a plain-text reply.
- **FR-009**: Task proposals MUST satisfy the existing standing-set invariants before rendering: 1–3 tasks, every task checkable against the metric registry, explicit retire only (a proposal can never empty the set by omission).
- **FR-010**: Invalid or partially invalid model proposals MUST be sanitised or suppressed before rendering; the player never sees a proposal that cannot be accepted.
- **FR-011**: The coach's conversational behaviour MUST steer toward settling next-game tasks as the session's primary outcome, while handling reflection requests whenever asked.

**Reflections**

- **FR-012**: The system MUST support multiple reflections per match, each with: text, zero or more evidence references, an author source (player or coach), and creation/update timestamps.
- **FR-013**: The match report MUST provide a Reflections section where the player can create a reflection manually via a text box, attach currently pending evidence references to it, and view, edit, and delete existing reflections.
- **FR-014**: Manual reflection operations (create/edit/delete) MUST work without any model call.
- **FR-015**: Reflections MUST be included in the coach's context for every chat call and in the input to coaching-memory distillation, but MUST NOT themselves be rows in the semantic memory store.
- **FR-016**: The pre-existing single finalized reflection per match MUST be migrated to appear as the first reflection of its match (author source: coach), with no data loss; the migration is idempotent.

**Sessions**

- **FR-017**: The system MUST support multiple chat sessions per match, each with its own transcript; the player can create a new session and switch between sessions of the current match.
- **FR-018**: Every session's coach context MUST be rebuilt server-side per call from current state: match facts, analysis read, standing tasks, all of this match's reflections, and coaching memory — independent of other sessions' transcripts.
- **FR-019**: Pre-existing per-match transcripts MUST migrate to become the first session of their match; the migration is idempotent.
- **FR-020**: Sessions with no player turns MUST NOT accumulate (an empty session is reused or discarded).

**Touchable tasks**

- **FR-021**: Standing task rows on the report MUST offer the same pick-as-evidence affordance as timeline markers; picking a task attaches a reference carrying the task's identity and description to the next chat message.
- **FR-022**: Task references MUST be resolved server-side against the current standing set into grounded context lines; references to no-longer-existing tasks are silently dropped (consistent with existing invalid-reference handling).

**Finalize replacement**

- **FR-023**: The "Save reflection" finalize action MUST be replaced by a "Summarize into a reflection" action that produces a standard coach reflection proposal in the chat.
- **FR-024**: Coaching-memory distillation MUST run when a coach-authored reflection is accepted (not on a separate finalize step), preserving today's additive merge semantics: known subjects refreshed, new ones minted, nothing removed by omission.
- **FR-025**: Standing-task changes MUST no longer occur as a side effect of summarizing/finalizing; they occur only via accepted task proposals.

**Carried-over constraints**

- **FR-026**: All persistence remains in the main process; the renderer holds no secrets and no direct data access; commands mutate, queries read.
- **FR-027**: All newly minted identifiers (reflections, sessions, proposals) MUST be collision-proof under repetition (re-proposing, re-accepting after restart, same-match repetition).
- **FR-028**: Chat continues to use the light model tier; a model failure in proposal generation degrades to a plain conversational reply, never a broken card.

### Key Entities

- **Reflection**: A durable takeaway about one match. Text, 0..n evidence references (report anchors), author source (player|coach), timestamps. Many per match. Input to coaching-memory distillation; not itself a memory object.
- **Chat Session**: One conversation thread about one match. Title, ordered turns (with their evidence references and any proposal cards), timestamps. Many per match; transcripts are independent, factual context is shared.
- **Action Proposal**: A coach-suggested state change embedded in a transcript turn. Kind (task-set update | reflection create/update/delete), full proposed payload, resolution state (pending | accepted | rejected | stale), resolution timestamp. Belongs to exactly one session; resolvable exactly once.
- **Standing Focus Task** *(existing)*: Unchanged shape; gains a new mutation path (accepted proposals) and loses the finalize-driven one.
- **Evidence Reference** *(existing)*: Extended with a new kind for standing tasks, resolved against the standing set rather than the report anchor catalog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can go from opening the chat to an accepted task-set change in under 2 minutes / 3 player messages in the common case ("make task X stricter").
- **SC-002**: 100% of state changes initiated by the coach pass through a visible accept step — zero direct writes from model output in any flow.
- **SC-003**: A player can record a manual reflection with an evidence reference in under 30 seconds without invoking the model.
- **SC-004**: After upgrade, 100% of previously finalized reflections and previously stored transcripts are visible in the new UI (as first reflection / first session of their match).
- **SC-005**: A new session for a match starts with zero visible transcript turns, and the coach can correctly answer a question about any existing reflection of that match in its first reply.
- **SC-006**: No conversation turn ever results in more than 3 tool rounds, and every player message receives a textual coach reply even when proposal generation fails.
- **SC-007**: Stale or double acceptance attempts never corrupt state: concurrent/repeated accepts yield exactly one applied change, with later attempts visibly inert.

## Assumptions

- Single-player desktop app: no concurrent multi-user writes; "concurrency" concerns are limited to multiple sessions/windows of the same player and rapid repeated clicks.
- Proposal cards persist as part of the session transcript (so pending proposals survive restarts), rather than being ephemeral UI state.
- A reflection's evidence references reuse the existing report-anchor reference vocabulary (stats, markers, benchmarks, tasks); referencing evidence from a *different* match is out of scope.
- Session titles can be simple (timestamp or first-message derived); automatic AI titling is not required for this feature.
- The existing discovery planning step (plan → parallel fetch → respond) remains in place for answering questions; the new tool loop governs *mutation proposals*, layered on the same chat call.
- The Home screen's progress view continues to read from the same standing-task and memory stores and needs no structural change beyond reflecting accepted updates.
- Deleting reflections via chat requires the same confirm-first acceptance as any other mutation; there is no bulk delete.
- The legacy localStorage adoption path from spec 004 still runs before the new migration, so its outputs are migrated too.
