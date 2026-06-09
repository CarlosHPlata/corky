# Feature Specification: Session Goal & Notes

**Feature Branch**: `002-player-goal-notes`  
**Created**: 2026-06-09  
**Status**: Draft  
**Input**: User description: "Add a goal and notes input on the Home screen where the player can write down their overall goal and personal notes. This text is fed as additional context to the coach LLM (e.g. the Quick Analysis) so it makes better, more personalized coaching decisions. Implement the relevant UI per the new design (ui_kits/corky-desktop/index.html)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture and keep a session goal and notes (Priority: P1)

As a player, I want a small pad on the Home screen where I write down one sharp goal for my current climb plus a few free-form notes (reminders, matchup notes, things to watch for), so that I keep myself honest about what I'm trying to fix while I play — and so it's still there the next time I open Corky.

**Why this priority**: This is the foundational slice. On its own it delivers a personal, persistent focus pad on the landing screen — a useful product even before any coaching is wired to it. Everything else in this feature builds on the player being able to record and keep this text.

**Independent Test**: Open Home, set a goal and some notes, save, close and reopen the app — the goal and notes are shown exactly as entered. Fully testable without involving the coaching model.

**Acceptance Scenarios**:

1. **Given** no goal or notes have ever been set, **When** the player opens Home, **Then** an inviting empty state offers to set a goal for the session.
2. **Given** the empty state, **When** the player chooses to set a goal, enters a goal and notes, and saves, **Then** the section switches to a read view showing the goal prominently and each non-blank note line as its own item.
3. **Given** a goal and notes already exist, **When** the player edits them and saves, **Then** the updated text replaces the previous text in the read view.
4. **Given** the player is editing, **When** they cancel, **Then** no changes are kept and the previous saved text is shown.
5. **Given** a goal and notes have been saved, **When** the player closes and reopens the app, **Then** the same goal and notes are still present.
6. **Given** the player is editing, **When** they save with the keyboard shortcut, **Then** the text is saved; **When** they press the cancel key, **Then** the edit is abandoned.
7. **Given** leading/trailing whitespace or blank lines were typed, **When** the text is saved, **Then** surrounding whitespace is trimmed and blank note lines are not shown as empty items.

---

### User Story 2 - Coaching that reflects my goal (Priority: P2)

As a player who has written down a goal and notes, I want Corky's on-demand session read (Quick Analysis) to take that goal and those notes into account, so that the insights speak to what *I* am working on rather than a generic read of my games.

**Why this priority**: This is the point of the feature — turning the player's own stated intent into more personalized coaching. It depends on US1 (the text must exist first) but is the reason the input was added.

**Independent Test**: With a clear goal set (e.g. "convert one 20-minute lead into a closed game"), run Quick Analysis and confirm the resulting read acknowledges or relates to that goal/notes; clear the goal, run again, and confirm the read no longer references it.

**Acceptance Scenarios**:

1. **Given** a goal and notes are set, **When** the player runs Quick Analysis, **Then** the analysis is produced using the current goal and notes as additional context, and the read visibly relates to the player's stated focus where the data supports it.
2. **Given** the player edits the goal and notes after a previous run, **When** they run Quick Analysis again, **Then** the new run uses the latest saved text (no re-sync required).
3. **Given** the goal or notes reference something the player's recent games can't speak to, **When** Quick Analysis runs, **Then** it stays honest — it does not invent evidence to fit the goal (consistent with Corky's evidence-over-assertion principle).

---

### User Story 3 - Graceful empty and honest limits (Priority: P3)

As a player who hasn't set a goal, I want Corky to behave sensibly — show an inviting prompt rather than an empty box, and produce its normal session read without pretending I set a goal I didn't, so that the feature never gets in my way or fabricates intent.

**Why this priority**: A correctness/polish slice that protects the honesty principle and the first-run experience. Valuable but not the core value, and only meaningful once US1 and US2 exist.

**Independent Test**: With no goal or notes set, confirm Home shows the empty-state prompt, and a Quick Analysis run produces its normal read with no references to a non-existent goal.

**Acceptance Scenarios**:

1. **Given** neither a goal nor notes are set, **When** the player opens Home, **Then** the section shows the set-a-goal prompt, not a blank or broken control.
2. **Given** no goal or notes are set, **When** the player runs Quick Analysis, **Then** it behaves exactly as it does today and never claims or references a goal the player did not set.
3. **Given** a goal is set but notes are empty (or vice versa), **When** the read view renders, **Then** only the populated part is shown and the missing part is omitted cleanly.

---

### Edge Cases

- **Very long text**: The player pastes a large block of notes — the input remains usable and the stored/forwarded text stays within sensible bounds (see FR-012) without truncating mid-thought in a confusing way, title limited to 200 characters for main goal, and notes cannot be more than 1000 characters.
- **Notes only, no goal**: The player leaves the goal blank but writes notes — the read view shows the notes and indicates no goal is set rather than looking broken.
- **Whitespace-only input**: The player types only spaces/newlines and saves — this is treated as empty and returns to the empty state.
- **Unsaved edits**: The player begins editing, navigates away or closes without saving — unsaved draft text is discarded; the last saved text is preserved.
- **Stale read after edit**: The player edits the goal between Quick Analysis runs — the next run reflects the new text, never a previously cached goal.
- **Special characters / multiple paragraphs**: Notes contain punctuation, dashes, or several lines — each non-blank line is presented as its own item without mangling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Home screen MUST present a dedicated "Session goal & notes" section, placed within the Home overview alongside the other coaching cards.
- **FR-002**: The player MUST be able to enter a single, short goal statement (one focused sentence).
- **FR-003**: The player MUST be able to enter free-form, multi-line notes.
- **FR-004**: The player MUST be able to switch the section into an edit mode, and to save or cancel their edits; a keyboard shortcut MUST be available to save and to cancel while editing.
- **FR-005**: The system MUST persist the player's goal and notes locally so they remain available across app restarts until the player changes them.
- **FR-006**: In read mode, the system MUST display the goal prominently and present each non-blank note line as its own discrete item.
- **FR-007**: When neither a goal nor notes are set, the system MUST show an inviting empty state with a clear call to action to set a goal, rather than a blank control.
- **FR-008**: On save, the system MUST trim surrounding whitespace and MUST NOT render blank lines as empty note items; whitespace-only input MUST be treated as empty.
- **FR-009**: When the player runs Quick Analysis, the system MUST include the current saved goal and notes as additional context provided to the coaching model.
- **FR-010**: When no goal or notes are set, Quick Analysis MUST behave as it does without this feature and MUST NOT reference or fabricate a goal the player did not set.
- **FR-011**: The coaching model MUST treat the player's goal and notes as the player's own stated intent (context to inform its read), and MUST NOT present that text back as Corky's own evidence or as a verified claim.
- **FR-012**: The goal and notes MUST have reasonable length bounds that keep the input usable and the forwarded context bounded; exceeding the limit MUST be handled gracefully (prevented or safely capped) rather than failing.
- **FR-013**: Editing the goal or notes MUST NOT require re-syncing matches or any extra step; the next Quick Analysis run MUST use the latest saved text.
- **FR-014**: The section MUST visually fit Corky's Home as an accented coaching card, consistent with the established voice (calm, sentence-case, coach's tone) and the other Home cards.
- **FR-015**: The goal and notes are private, player-authored text and MUST remain local to the player; the feature MUST NOT introduce any information the player couldn't already see (it consumes only the player's own writing — fully compliant by design).

### Key Entities *(include if feature involves data)*

- **Session Goal & Notes**: The player's current self-set focus for their climb. Attributes: a short **goal** statement, a free-form **notes** body (multi-line), and the moment it was last updated. There is exactly one current goal-and-notes record for the single player; editing replaces it. Consumed as additional context by the session coaching read.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can set a goal and notes and have them shown back correctly in under 30 seconds, within a single Home visit.
- **SC-002**: Saved goal and notes survive an app restart 100% of the time (no loss of player-entered text).
- **SC-003**: With a goal set, a Quick Analysis run reflects or acknowledges the player's stated goal/notes where the recent games support it; with no goal set, the same run contains zero references to a goal.
- **SC-004**: In no case does Quick Analysis fabricate a goal the player did not set (0 fabricated goals across runs with empty goal/notes).
- **SC-005**: Editing the goal or notes is reachable from Home in a single action, and a subsequent Quick Analysis run uses the updated text without any sync or restart.
- **SC-006**: First-run players (no goal set) always see the inviting empty-state prompt rather than a blank or broken control (100% of first opens).

## Assumptions

- **Persistence model**: The goal and notes persist until the player edits or clears them. "Session" is framing for *the climb you're focused on right now*; the system does not auto-reset or expire the text on its own.
- **Coaching scope for this feature**: The goal and notes feed the on-demand Quick Analysis session coach on Home (the Home coaching surface currently driven by the model). The same stored text is intended to be reusable by other coach surfaces (e.g. the post-game report) in future work, but wiring those additional surfaces is out of scope for this feature.
- **Single user, local-only**: Corky is a single-player desktop app; the goal and notes are one record for the one player, stored locally, never shared or sent anywhere except as context to the player's own coaching read.
- **Length bounds (reasonable defaults)**: Goal is a short single statement (on the order of ~200 characters) and notes are a modest free-form block (on the order of a few thousand characters) — enough for real reminders, bounded enough to keep the input tidy and the forwarded context reasonable. Exact limits to be finalized in planning.
- **Notes are line-oriented in read mode**: Each non-blank line of the notes is shown as its own item, matching the new design; the player structures notes by line.
- **Design source of truth**: The visual and interaction design follows the provided design kit's `GoalNotes` card and its placement on Home (empty / read / edit states, gold-accented coaching card with a flag motif), adapted to the existing renderer.
- **No coaching when empty**: If both goal and notes are empty, the coaching read proceeds exactly as it does today.
