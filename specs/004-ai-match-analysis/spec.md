# Feature Specification: AI Match Analysis (Corky's read)

**Feature Branch**: `004-ai-match-analysis`
**Created**: 2026-06-09
**Status**: Draft
**Input**: User description: "Follow on from spec 003 (static stats). Now focus on the AI analysis of a match report, divided into separate analyses: (1) caveats & tiny analysis that fills small on-screen texts — who was MVP, titles, spans, quick reads — using a lighter model over the game stats; (2) game highlights — what happened on the highlights, what happened on the deaths, why the game was lost or won; (3) overall analysis that runs after the first two, enhancing the stats, powered also by op.gg (investigate what to use) and the player's own notes/reflections, giving an overall review; (4) tasks analysis — past-task progress and changing/setting task focus. Be careful how the enhanced data is stored so analyses 3 and 4 can consume it without wasting tokens — investigate the best way to store it in an agent-readable form."

## Clarifications

### Session 2026-06-09

- Q: How should agents anchor claims to evidence (to make "evidence over assertion" enforceable)? → A: Hybrid — structured anchors (a chart point, a death, an objective/teamfight marker) MUST be cited from a pre-computed enumerated anchor catalog built from the spec-003 facts; benchmark and player-note context MAY be cited as typed free-form references shown as a chip but not pinned to the chart. A structured claim with no matching catalog anchor is dropped.

- Q: How should the enhanced read be stored so later passes and re-opens consume it cheaply and agent-readably? → A: Store the current match's enhanced read as **domain-structured DTOs** (structured by our domain, one per pass), persisted per match. Because verbose JSON spends tokens on syntax, what is **sent to the model** is a **compact, token-efficient encoding** of those DTOs, not their raw JSON. **Cross-game / past-match data as an analysis input is OUT OF SCOPE for this feature** (focus on the current match first), but the heavy overall-review pass MUST be designed with a pluggable input so past-match/other-source context can be fed in later without reworking it.

- Q: Given past-match data is deferred, what is the scope of US4 (focus tasks & the since-last loop)? → A: US4 stays fully in scope. The deferral was about **other matches' stats** (for cross-game comparison cohorts), not tasks. **Focus tasks are a standing, global, per-user set** — not a per-match chain. The tasks pass works from the **global tasks** plus the player's **Home-screen goal** (spec 002): it evaluates the current game's progress against the standing tasks (improved/held/regressed/not-applicable) and may update or change the focus. Evaluating against the global standing tasks needs only the current game + the stored global tasks, so it does not depend on the deferred cross-game match data.

- Q: When the deep overall-review pass disagrees with the cheap framing pass, which is authoritative? → A: They don't overlap — each pass **owns its own report section** and never rewrites another's, so there is nothing to reconcile. Passes 1 (caveats/framing — MVP, titles, spans, captions, quick read) and 2 (highlights & turning-points narration) are the lighter **"decoration" tier**; passes 3 (overall analysis — its own section, delivered as a **prose verdict**) and 4 (tasks — its own section) are the **heavy tier**. Pass 3 may still read passes 1–2's compact outputs as input context but writes only its own prose section.

- Q: What is the scope of the game MVP the caveats pass identifies? → A: MVP was only one example. Pass 1 is a flexible **decoration layer**: it fills the small AI-enhanceable slots the report's UX exposes — e.g. an MVP-style label, matchup-section tips, title-bar text, highlighted spans, captions, and a one-line quick read — with short, stat-grounded micro-texts, owning that decoration layer. The exact set of slots is defined by the UI/UX (a planning detail); the requirement is that pass 1 enhances these small surfaces **factually from the visible stats** and softens/omits them honestly when the data is degenerate.

## User Scenarios & Testing *(mandatory)*

The match report screen built in spec 003 already shows the **factual** half of a game (scoreline, matchup, gold-difference timeline with deterministic highlight markers, the breakdown block, the death map) and the player's own free-form **reflections** note. The interpretive half — Corky's read — is still gated behind an "Analyze this match" action and filled with mock content. This feature produces that read with real AI analysis, decomposed into four cooperating passes so each can use the right depth of model and the later passes can build on the earlier ones cheaply.

### User Story 1 - The overall read: why I won or lost (Priority: P1)

As a player, after a game I press "Analyze this match" and Corky gives me a short, blunt **verdict** on *why* this game was won or lost — the single most important decision or pattern — plus a measured "what you did differently" read that compares this game against the right reference (the champion/lane meta for my rank and patch, and my own stated goal/reflections), so I learn the one thing that actually mattered instead of staring at a wall of numbers.

**Why this priority**: This is Corky's entire reason to exist ("understand *why* you lose") and the headline of the post-game report. It is the most valuable output and the one a player would open the report for. It consumes the enhanced data produced by the lighter passes (US2, US3) and the public meta reference plus the player's own notes — so it is the richest pass, but it is also the payoff that makes the rest worth building.

**Independent Test**: With a fully analysed game, confirm the verdict card replaces its gated placeholder with a one-or-two-sentence read that names the decisive factor, that the read is anchored to evidence the player can reconcile on the same screen (a number, a marked moment, a benchmark gap), that it reflects the player's own reflection note/goal where the data supports it, and that any benchmark it cites is tagged with the reference actually used (champion/lane/rank/patch vs a general fallback).

**Acceptance Scenarios**:

1. **Given** a game with the factual report and the player's reflections available, **When** the player runs analysis, **Then** the verdict states in one or two sentences why the game was won or lost, naming the single most important decision or pattern rather than restating the scoreline.
2. **Given** the verdict has returned, **When** the player reads it, **Then** every claim is anchored to visible evidence (a stat, a timeline moment, a death, or a benchmark gap) that the player can reconcile with the rest of the report.
3. **Given** a benchmark is cited (e.g. farming or death rate against the meta), **When** it appears, **Then** it is measured against the champion/lane for the player's rank on the current patch where available, and is tagged with the reference basis actually used; when that reference cannot be retrieved, a general benchmark is used and labelled as such.
4. **Given** the player has written a goal or post-game reflection, **When** the overall read is produced, **Then** it takes that text into account as the player's own stated intent and relates the read to it where the games support it, without presenting the player's own words back as Corky's verified evidence and without inventing evidence to fit the goal.
5. **Given** the game's data cannot support a firm conclusion (thin or missing timeline, remake, very short game), **When** the read is produced, **Then** Corky says so plainly rather than asserting an unsupported turning point.

---

### User Story 2 - Highlight & death narration: what happened at each moment (Priority: P2)

As a player, I want each marked moment on my game's timeline — the objectives, the team-wipe fights, the death-driven gold swings — and each of my deaths to carry a short, factual explanation of *what happened* and *why it mattered* (was I caught out, did I overextend, was it a fair fight; did losing that fight hand over Baron), so the timeline and turning-points read like a story of the game instead of a row of unexplained pins.

**Why this priority**: Spec 003 already places the markers from deterministic rules; this pass gives them meaning and produces the "turning points" the report promises. It is the evidence-level narration that the overall verdict (US1) builds on, and it is independently demonstrable on the timeline and death sections. It is heavier than the tiny caveats but lighter and more contained than the full overall review.

**Independent Test**: Open an analysed game and confirm each timeline highlight and each death carries a short narration of what happened and its consequence, that the narration is consistent with the factual marker it sits on (time, side, death count), and that the turning-points section lists the handful of moments where the advantage swung, each tied to its marked point on the curve/map.

**Acceptance Scenarios**:

1. **Given** the factual timeline highlights exist, **When** analysis runs, **Then** each highlight gains a short narration of what happened and why it mattered, consistent with the marker's time and side.
2. **Given** the player's deaths, **When** analysis runs, **Then** each death is characterised (e.g. caught out alone, overextended, lost a fair fight, died for an objective) from the available data, and a death that cannot be characterised confidently is left factual rather than guessed.
3. **Given** the marked moments, **When** the turning-points section renders, **Then** it surfaces the handful of moments where the advantage actually swung, each anchored to its position on the gold-difference timeline or the map.
4. **Given** the game's detailed timeline is unavailable, **When** analysis runs, **Then** the highlight/death narration degrades cleanly with a clear "not available for this game" note rather than fabricating moments.

---

### User Story 3 - Quick framing & caveats: MVP, titles, and one-line reads (Priority: P2)

As a player, I want the small framing texts dotted around the report filled in — the kind of micro-text the UX exposes, such as an MVP-style label, tips in the matchup section, the title-bar text, highlighted spans and captions, and a one-line "quick read" of the game — drawn cheaply from the game's stats, so the report feels read and oriented the moment analysis finishes, even before I dig into the detail.

**Why this priority**: These are the lightweight, high-frequency texts that make the report feel coherent and "analysed". They are cheap to produce (stats only, a lighter pass), they are the first thing to fill in, and they form a self-contained decoration layer with its own surfaces. Low individual value but high polish-per-token, and a clean standalone slice.

**Independent Test**: Run analysis on a game and confirm the report's small AI-enhanceable slots populate — e.g. an MVP-style label with a one-line justification, a matchup tip, the title-bar text, sensible captions/spans for the result, and a short "quick read" one-liner — all consistent with the visible stats and produced without the heavier reasoning the overall review needs.

**Acceptance Scenarios**:

1. **Given** a game's stats, **When** the lighter pass runs, **Then** the small AI-enhanceable slots the report exposes (e.g. MVP-style label, matchup tip, title-bar text, captions/spans, quick read) are filled with short micro-texts grounded in the visible numbers.
2. **Given** a game's result and stats, **When** the lighter pass runs, **Then** the produced micro-texts are consistent with the scoreline and breakdown and read sensibly for the result.
3. **Given** the lighter pass owns the decoration layer, **When** the heavier overall review (US1) runs in its own section, **Then** these micro-texts are not regenerated or overwritten by another pass — section ownership is disjoint, so they stay as pass 1 set them.
4. **Given** the stats are degenerate (remake, AFK, zero-duration), **When** the lighter pass runs, **Then** it omits or softens the affected micro-texts honestly rather than inventing a confident label or one-liner.

---

### User Story 4 - Focus tasks & the since-last loop (Priority: P3)

As a player, I keep a small standing set of one to three concrete focus tasks I'm working on (my global, per-user coaching goals). When I analyse a game, Corky tells me how I did on those standing tasks this game (improved, held, slipped, or not applicable when I changed champion/role) and — informed by this game and my Home-screen goal — keeps the set current by holding, retiring, or changing a focus, so the coaching is a continuous loop rather than a fresh disconnected report every time.

**Why this priority**: The focus-task loop is the accountability mechanism that turns one-off reads into visible progress over time, and it is the "Since last game" and "Next-game focus" sections of the report. It depends on the overall read (US1) for what to focus on and on the standing global tasks to evaluate, so it comes after the read exists, but it is the feature that makes Corky feel like a coach across games.

**Independent Test**: With a standing set of focus tasks present, analyse a game and confirm the "Since last game" section reports each standing task as improved / held / regressed / not-applicable against this game's data (not-applicable when the task's champion/role scope doesn't match), and that the standing set is updated — a resolved or stale focus may be retired and a new one set, taking the player's Home-screen goal into account. With no standing tasks yet, confirm a clean first-time state and a fresh set of 1–3 tasks.

**Acceptance Scenarios**:

1. **Given** a standing set of global focus tasks, **When** the player analyses a game, **Then** each standing task is evaluated against this game and reported as improved, held, regressed, or not-applicable.
2. **Given** a standing task whose scope doesn't apply to this game (e.g. a CS-as-midlaner task but the player played support), **When** the evaluation runs, **Then** that task is parked as not-applicable with a plain explanation rather than scored as a failure.
3. **Given** the evaluation and this game's read, **When** the tasks pass runs, **Then** it maintains a set of one to three concrete, measurable tasks — holding tasks still in progress, retiring resolved or stale ones, and adding new focus where needed — each carrying a target the system can evaluate and a scope (champion / role / universal).
4. **Given** the player has set a goal on the Home screen, **When** the tasks pass updates the standing set, **Then** it takes that goal into account as the player's stated intent, without fabricating a task the goal/data don't support.
5. **Given** there are no standing tasks yet, **When** a game is analysed, **Then** the since-last section shows a clean first-time state and a fresh set of 1–3 tasks is created.

---

### Edge Cases

- **No factual report / not synced**: Analysis cannot run on a game whose stored data is absent; the action stays gated with an honest message rather than producing an empty read.
- **Missing or partial timeline**: When the detailed timeline is unavailable, the overall read still works from the core stats it can see, and the highlight/death narration and turning points degrade with a clear "not available for this game" note (consistent with spec 003 FR-025).
- **Very short game / remake / early surrender**: Corky does not manufacture a turning point or an MVP from a non-game; caveats and verdict are softened or withheld honestly.
- **Meta reference unavailable or stale**: The public champion/lane meta source is unreachable or behind on patch — the read falls back to a general benchmark, still produces coaching, and says which reference it used (never blocking the analysis).
- **No reflections/goal written**: The overall read proceeds normally and never references or fabricates a goal or reflection the player did not write.
- **Re-running analysis**: Re-running replaces the stored read for that game without stacking overlapping runs or flickering; only the most recent read per match is kept.
- **Partial pipeline failure**: If a later pass fails (e.g. the overall review) but earlier passes succeeded (caveats, highlight narration), the report shows what succeeded and offers a retry for the rest rather than discarding everything.
- **Model returns something unusable**: A malformed or empty analysis surfaces a graceful, retryable error rather than rendering broken content.
- **Changing focus**: When the player's recent play shows a previous focus is resolved or no longer the biggest leak, the tasks pass may retire it and set a new focus rather than repeating a stale task indefinitely.
- **Token cost on re-open and on later passes**: Re-opening an already-analysed report, and running the later passes (US1, US4) over the earlier passes' output, must not re-pay the full analysis cost — the enhanced read is read back from storage, not regenerated from raw match data.

## Requirements *(mandatory)*

### Functional Requirements

#### Trigger, pipeline & orchestration

- **FR-001**: The match report MUST trigger the AI analysis when the player activates the existing "Analyze this match" action, replacing the gated placeholder sections (verdict, turning points, next-game focus, since-last) and small framing texts with real output.
- **FR-002**: The analysis MUST be organised as four cooperating passes, each **owning its own report section** and never rewriting another pass's section: (1) a lighter **caveats & framing** pass over the game stats (MVP, titles, spans, captions, quick read), (2) a **highlight & death narration** pass (highlights / turning-points section), (3) an **overall review** pass that runs after passes 1 and 2 and consumes their output plus the meta reference and the player's notes (its own section, delivered as a prose verdict), and (4) a **focus-tasks** pass (its own since-last / next-focus section). Passes 1 and 2 are the lighter "decoration" tier; passes 3 and 4 are the heavy tier.
- **FR-002a**: Because section ownership is disjoint, no pass's output overrides or contradicts another's; reconciliation is unnecessary by construction. A heavier pass MAY read a lighter pass's compact output as input context but MUST NOT regenerate or overwrite that pass's section.
- **FR-003**: Pass 3 (overall review) MUST run only after passes 1 and 2 have produced their enhanced data for the game, and MUST consume that enhanced data rather than re-deriving it from the raw match.
- **FR-004**: The system MUST surface progress/loading feedback while analysis runs and MUST prevent a second analysis of the same game from starting while one is in flight (no overlapping runs, no duplicate/flickering results).
- **FR-005**: If an individual pass fails while others succeed, the system MUST persist and show the successful passes' output and offer a retry for the failed pass, rather than discarding the whole analysis.

#### Overall review (US1)

- **FR-006**: The overall review MUST produce its own section delivered as a **prose verdict** — a short, blunt read (on the order of one or two sentences) that names the single most important decision or pattern behind the win or loss, not a restatement of the scoreline. Evidence anchors (per FR-007) are embedded in the prose.
- **FR-007**: Every claim in the overall review MUST be anchored to evidence the player can see and reconcile on the report, upholding "evidence over assertion". Anchoring is **hybrid**: a claim referencing a structured fact (a chart point, a death, an objective/teamfight marker) MUST cite an anchor drawn from a pre-computed **enumerated anchor catalog** built from the spec-003 facts, and a structured claim with no matching catalog anchor MUST be dropped rather than rendered unanchored; benchmark gaps and player-note context MAY be cited as **typed free-form references** (shown as a chip, not pinned to the chart). Agents annotate the catalog — they never invent a structured anchor or a figure.
- **FR-008**: When the review diagnoses a rate-based flaw (e.g. farming, deaths), it MUST measure against a reference appropriate to the champion/lane for the player's rank on the current patch where available, MUST tag the reference basis used, and MUST fall back to a general benchmark — clearly labelled — when the meta reference is unavailable.
- **FR-009**: Public meta data MUST be used only as the benchmark/reference behind personal coaching and MUST NOT be surfaced as a generic meta/tier-list; the player's own factual numbers MUST come from the player's own stored match data, never overridden by the meta source.
- **FR-010**: The overall review MUST take the player's own goal and post-game reflection text into account as the player's stated intent, relate the read to it where the data supports it, MUST NOT present that text back as Corky's own verified evidence, and MUST NOT reference or fabricate a goal/reflection the player did not write.
- **FR-011**: When the data cannot support a firm conclusion, the review MUST say so plainly (honest about limits) rather than asserting an unsupported turning point or pattern.

#### Highlight & death narration (US2)

- **FR-012**: Each factual timeline highlight (objective, team-wipe fight, death-driven gold swing) MUST gain a short narration of what happened and why it mattered, consistent with the marker's recorded time, side, and counts.
- **FR-013**: Each of the player's deaths MUST be characterised from the available data (e.g. caught out, overextended, fair fight, died for an objective), and a death that cannot be characterised confidently MUST be left factual rather than guessed.
- **FR-014**: The turning-points section MUST surface the handful of moments where the advantage actually swung, each anchored to its position on the gold-difference timeline or the death map.
- **FR-015**: When the detailed timeline is unavailable for a game, the highlight/death narration and turning points MUST degrade with a clear "not available for this game" note rather than fabricating moments.

#### Caveats & framing (US3)

- **FR-016**: The lighter caveats & framing pass MUST fill the report's small AI-enhanceable slots — the decoration layer exposed by the UX, e.g. an MVP-style label (with a short factual justification), matchup-section tips, title-bar text, highlighted spans, and captions — with short micro-texts grounded in the visible stats. The exact set of slots is defined by the UI/UX.
- **FR-017**: The lighter pass MUST produce a one-line "quick read" of the game and keep all its micro-texts consistent with the scoreline and breakdown; where a slot's data is missing or degenerate, that micro-text MUST be omitted or softened rather than invented.
- **FR-018**: The lighter pass MUST be the cheaper/faster tier of analysis (it consumes the game stats only and does not require the heavier reasoning of the overall review); it owns the framing section, and heavier passes MUST NOT regenerate or overwrite that section.
- **FR-019**: When a game is degenerate (remake, AFK, zero/near-zero duration), the lighter pass MUST omit or soften its caveats honestly rather than inventing an MVP or a confident one-liner.

#### Focus tasks & the since-last loop (US4)

- **FR-020**: The system MUST maintain a **standing, global, per-user set** of one to three concrete, measurable focus tasks (not a per-match-isolated list), each carrying a target the system can evaluate and a scope recording when it applies (champion / role / universal), persisted across games and app restarts.
- **FR-021**: When a game is analysed, the system MUST evaluate each standing focus task against that game and report each as improved, held, regressed, or not-applicable (the "Since last game" read).
- **FR-022**: A standing task whose scope does not match the analysed game's champion/role MUST be parked as not-applicable with a plain explanation, not scored as a failure.
- **FR-023**: When no standing tasks exist yet, the since-last section MUST show a clean first-time state and a fresh set of 1–3 tasks MUST be created.
- **FR-024**: After evaluating, the tasks pass MUST keep the standing set current — holding tasks still in progress, retiring resolved or stale ones, and adding new focus — rather than repeating a stale task indefinitely; the resulting set MUST remain within the one-to-three bound.
- **FR-024a**: The tasks pass MUST take the player's Home-screen goal (spec 002) into account as stated intent when setting or adjusting the standing tasks, and MUST NOT fabricate a task the goal or the game data do not support.

#### Enhanced-data storage (token efficiency — cross-cutting)

- **FR-025**: Each pass's output MUST be persisted as a **domain-structured DTO** (structured by the project's domain, one record per pass) keyed by match — not as a re-derivable blob of raw match data — so that downstream passes (overall review, focus tasks) and re-opens consume it directly.
- **FR-026**: Running the overall review and the focus-tasks pass MUST consume the stored enhanced DTOs from the earlier passes rather than re-reading and re-summarising the full raw match/timeline, keeping their token cost bounded.
- **FR-026a**: The data handed **to the model** for any pass MUST be a **compact, token-efficient encoding** of the relevant DTOs (and the enumerated anchor catalog) rather than their verbose raw JSON, so that token spend goes to content, not serialisation syntax. The renderable structured fields are retained separately for the report.
- **FR-026b**: The overall-review pass MUST be designed with a **pluggable input** so additional context sources (notably past-match/cross-game data) can be fed in later without reworking the pass. Cross-game/past-match data as an analysis input is **out of scope for this feature**; only the current match's data, the player's notes/goal, and the meta benchmark are consumed now.
- **FR-027**: Re-opening an already-analysed report MUST restore the stored read without re-running any analysis pass; the latest read per match MUST be persisted and restored on load, surviving resync and app restart.
- **FR-028**: Re-running analysis MUST replace the stored read for that match; only the most recent read per match is kept, and a failed/partial run MUST NOT overwrite a previously stored good read.

#### Honesty, compliance & presentation

- **FR-029**: All analysis of the player's own play MUST be built only from player-visible information about the player's own game (the stored match, its timeline, the player's own notes), plus public meta/benchmark data — never enemy-only, hidden, or predicted in-game information.
- **FR-030**: The credentials/secrets used to produce the analysis MUST remain in the application's secure backend and MUST NOT be exposed to the screen layer.
- **FR-031**: The analysis output MUST be presented within the report's existing gated sections and small-text slots (verdict, turning points, next-game focus, since-last, MVP/caveat texts) without redesigning the report; this feature fills those sections with real content.
- **FR-032**: Where a claim is drawn from a thin sample or low-confidence signal, it MUST be framed as provisional rather than asserted firmly, consistent with the product's cohort-confidence convention.

### Key Entities *(include if feature involves data)*

- **Match Analysis (Corky's read)**: The full interpretive read for one game, assembled from the four passes and persisted per match. Aggregates the verdict/overall review, the highlight & death narration, the turning points, the caveats/framing texts (incl. MVP), and the focus tasks. Stored as a compact, structured, agent-readable record keyed by match, restored on report open.
- **Caveats & framing output (pass 1)**: The lighter pass's decoration layer — the micro-texts filling the report's small AI-enhanceable slots (e.g. MVP-style label with justification, matchup tips, title-bar text, captions/spans, a one-line quick read) — grounded in the game stats. The exact slot set is UI/UX-defined; pass 1 owns this layer and no other pass overwrites it.
- **Highlight/death narration (pass 2)**: Per-moment explanations attached to the factual timeline highlights and the player's deaths (what happened, why it mattered, death character), plus the selected turning points.
- **Overall review (pass 3)**: Its own report section, delivered as a **prose verdict** with embedded evidence anchors — the "why won/lost" read and "what you did differently" coaching, grounded in the meta benchmark (tagged with its basis) and the player's own notes/goal. Built with a pluggable input for later cross-game context.
- **Focus Task**: A concrete, measurable coaching goal held in a **standing, global, per-user set** of 1–3 — a description, a metric/target the system can evaluate, and a scope (champion / role / universal) recording when it applies. Persisted across games; held, retired, or replaced over time rather than regenerated per match.
- **Task Evaluation**: The result of checking a standing focus task against the analysed game — improved / held / regressed / not-applicable — feeding the "Since last game" section.
- **Benchmark Reference**: Public, patch-current champion/lane/rank meta used as the measuring stick behind coaching, tagged with the basis actually used (champion+lane+patch vs general fallback).
- **Player notes/goal**: The player's own goal and per-match reflection text (from the existing notes surfaces), consumed by the overall review as stated intent — never surfaced as Corky's own evidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an analysed game, a player can obtain a completed read — verdict, narrated highlights/turning points, MVP/caveat texts, and focus tasks — in a single action, with clear progress feedback throughout and no overlapping runs.
- **SC-002**: 100% of overall-review claims cite evidence traceable to something visible on the same report (a stat, a marked moment, or a labelled benchmark); a claim with no reconcilable anchor is a defect.
- **SC-003**: 100% of rate-based diagnoses state the benchmark basis used (champion/lane/rank/patch or general fallback); 0% present an unlabeled bar, and 0% of runs fail solely because the meta reference was unavailable.
- **SC-004**: Every factual timeline highlight and every player death in an analysed game with timeline data carries a short narration consistent with its marker; 0% contradict the marker's time/side/count.
- **SC-005**: Each analysed game fills the report's decoration slots (e.g. an MVP-style label with a stat-grounded justification) and the standing focus-task set holds one to three measurable tasks; analysing a game reports 100% of the standing tasks as improved/held/regressed/not-applicable.
- **SC-006**: With a goal or reflection written, the overall read reflects it where the data supports it; with none written, 0% of reads reference or fabricate a goal/reflection.
- **SC-007**: The overall-review and focus-tasks passes consume the earlier passes' stored output and prior reads rather than the full raw match — measured as a materially lower token/input cost for those passes than re-analysing from raw would incur.
- **SC-008**: Re-opening an already-analysed report restores the full read with zero analysis passes re-run (no new model calls on open), and the read survives resync and app restart 100% of the time.
- **SC-009**: When the timeline is unavailable, the read still renders the verdict from core stats and shows a clear "not available" note for the narrated timeline/turning points, rather than failing to produce a read.
- **SC-010**: When any pass fails, the player sees the successful passes' output plus a retryable affordance for the failed pass; 0% of failures leave the report blank, hung, or crashed, and 0% overwrite a previously stored good read.

## Assumptions

- **Builds on spec 003**: The factual match report (scoreline, matchup, gold-difference timeline with deterministic highlight markers, breakdown, death map) and the per-match reflections note already exist and are the inputs this feature interprets. This feature fills the gated "Corky's read" sections of that same report; it does not redesign the report or change the factual extraction.
- **This is Flow A's LLM layer**: The four passes correspond to the post-game coaching pipeline in the technical brief (`AnalyzeMatch` orchestrating the model passes, `EvaluateFocusTasks` for the since-last loop, `ResolveComparisonCohort` for the benchmark basis, `CoachingModel` returning structured, evidence-referenced output). The interpretive death characterisation and turning-point "better play" that spec 003 explicitly gated belong here.
- **Model tiering & section ownership**: Passes 1 (caveats/framing) and 2 (highlight/death narration) are the lighter **"decoration" tier**; passes 3 (overall analysis) and 4 (tasks) are the **heavy tier**. Each pass owns its own report section and never rewrites another's, so outputs cannot contradict each other and no reconciliation step is needed. Exact model selection is a planning detail; the spec only requires the tiering split and disjoint ownership.
- **Meta reference source**: The public champion/lane/rank meta used as the benchmark is the OP.GG open meta reference already established for the project (used strictly as the reference behind personal coaching, cached, bounded by a short timeout, degrading to a built-in general benchmark on miss/timeout) — never as a player-account lookup and never as a standalone tier list. "Investigate what to use" resolves to this existing reference layer; any deeper op.gg capability is a planning detail.
- **Agent-readable storage**: The enhanced read is persisted per match as a compact, structured record (the passes' typed outputs and evidence references), distinct from the raw match/timeline JSON, so the later passes and re-opens consume small structured context rather than re-summarising raw data. The exact shape (tables/columns/serialisation) is a planning detail; the requirement is that downstream passes never re-pay to re-derive what an earlier pass already produced.
- **Evidence-referenced, structured output**: Following the technical brief, the model returns structured output where each claim carries an evidence reference keyed into the computed features/markers, so the renderer can point at the exact chart point, death, or benchmark — the model annotates the evidence and never invents figures.
- **Trigger remains manual for this feature**: Analysis runs when the player presses "Analyze this match" on the report (matching the existing gated UI). Automatic analysis on game-end/sync is a known roadmap step (the `GameEnded → AnalyzeMatch` pipeline) but wiring that trigger is out of scope here.
- **Persisted per match, latest kept**: The read is stored per match and restored on open; re-running replaces it and only the most recent per match is kept. A full longitudinal history of re-reads is a possible future enhancement.
- **Cross-game match data is deferred**: Using *other matches' stats* as analysis input — notably the "what you did differently vs your own winning games of this matchup" personal comparison cohort (requirements §6) — is out of scope here. The overall review's benchmark this iteration is the public meta reference plus the player's notes/goal; the overall-review pass is built with a pluggable input (FR-026b) so the personal cross-game cohort can be added later without rework. This deferral does **not** affect focus tasks, which are global per-user and need only the current game plus the standing set.
- **Tasks are global per-user**: The focus tasks form one standing set for the single player (1–3 at a time), persisted globally and evolved over time — not a per-match list. The tasks pass evaluates the analysed game against this set and keeps it current, taking the Home-screen goal (spec 002) into account. This aligns with the technical brief's `focus_tasks` / `task_evaluations` materialised read models and the `EvaluateFocusTasks` step.
- **LLM wire format**: Domain DTOs are the stored, renderable source of truth, but the payload sent to the model is a compact, token-efficient encoding of the relevant DTOs and the enumerated anchor catalog (not their verbose JSON), so token spend goes to content rather than serialisation syntax. The exact compact format is a planning detail.
- **Notes & goal sources**: The overall review consumes the player's session goal/notes (spec 002) and the per-match reflection note already present on the report screen as the player's stated intent.
- **Single user, local-only**: Corky is a single-player desktop app; all inputs are the one player's own data stored locally, and the read is stored locally and never shared.
- **Champion-select assistant (Flow B) is out of scope**: Matchup/counter coaching for the live champion-select phase is a separate flow and not part of this feature.

## Dependencies

- Relies on spec 003's factual match report and extractors (core stats, matchup, gold timeline + deterministic highlights, breakdown, death map) as the per-game inputs to interpret.
- Relies on spec 002's session goal/notes and the per-match reflection note as the player's stated-intent inputs.
- Reuses the established public meta reference layer (OP.GG open meta) as the benchmark behind coaching, with its existing cache/timeout/fallback behaviour.
- Reuses the application's secure backend for model credentials and the structured, evidence-referenced coaching contract from the technical brief; introduces persisted storage for the enhanced read, focus tasks, and task evaluations.
