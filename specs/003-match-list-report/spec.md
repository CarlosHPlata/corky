# Feature Specification: Match List & Match Report (statistical data)

**Feature Branch**: `003-match-list-report`  
**Created**: 2026-06-09  
**Status**: Draft  
**Input**: User description: "Move to the match list and match report screen, focused on statistical API data. Consume Riot and OP.GG data to fill the match report and match list. A player can see a list of recent matches with infinite scroll that loads the next page near the end. A player can click a match and see its statistics: KDA, CS, CS/min, gold, gold/min, matchup, a game timeline based on gold difference with inferred highlights (objectives like dragon/baron/inhibitors, teamfights where a team was wiped or almost wiped, a death followed by a gold gap), a breakdown of CS at 10, CS/min, gold at 14, gold at 24, vision score, solo deaths, and kill participation, and a death map. All pure data — anything LLM-analysed is out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse recent matches with infinite scroll (Priority: P1)

As a player, I want a dedicated screen that lists my recent matches with the headline numbers for each, and that keeps loading older matches automatically as I scroll, so that I can scan my session and history without clicking "load more" or opening each game.

**Why this priority**: This is the entry point for the whole feature and a viable product on its own — a fast, scrollable record of recent games. Everything else (the report) is reached by selecting a row from this list, so it must exist first.

**Independent Test**: Open the match list with synced match history present. Confirm each row shows the result, champion, role, KDA, CS and CS/min, gold, game mode/queue, duration and when it was played. Scroll toward the bottom and confirm the next page of older matches loads automatically without an explicit action, until the available history is exhausted.

**Acceptance Scenarios**:

1. **Given** the player has synced matches, **When** they open the match list, **Then** the most recent matches are shown newest-first, each summarised with result, champion, role, K/D/A, CS and CS/min, gold, game mode, duration, and a relative time.
2. **Given** the player is viewing the list, **When** they scroll near the end of the loaded matches, **Then** the next page of older matches is requested and appended automatically, with a visible loading indicator while it fetches.
3. **Given** the player keeps scrolling, **When** there are no more matches to load, **Then** the list shows a clear end-of-history state and stops requesting more.
4. **Given** a page of matches is loading, **When** the player continues to scroll, **Then** the already-loaded rows remain interactive and pages are not requested more than once for the same range.
5. **Given** no matches have been synced yet, **When** the player opens the list, **Then** an informative empty state explains there is nothing to show yet rather than a blank screen.
6. **Given** the player selects a match row, **When** they activate it, **Then** the corresponding match report opens for that game.

---

### User Story 2 - See the core statistics for a game (Priority: P2)

As a player, I want to open a match and immediately see the core statistics for my game — KDA, CS, CS/min, gold, gold/min and the matchup — plus a breakdown of the metrics that actually decide lanes (CS at 10, CS/min, gold at 14, gold at 24, vision score, solo deaths, kill participation), so that I can judge how the game went on the numbers alone.

**Why this priority**: These are the headline facts of a game and the most-used part of any report. They depend on US1 (a match must be selectable) but deliver the core "see my game's stats" value with no timeline or map work required.

**Independent Test**: From the match list, open a standard Summoner's Rift game. Confirm the report shows KDA (with ratio), CS, CS/min, total gold and gold/min for the player, the matchup (the player's champion and role versus the lane opponent), and the breakdown block: CS at 10, CS/min, gold at 14, gold at 24, vision score, solo deaths, and kill participation. Cross-check a couple of values against the same game on a public match site.

**Acceptance Scenarios**:

1. **Given** a selected match, **When** the report opens, **Then** it shows the player's KDA (kills/deaths/assists and KDA ratio), CS, CS/min, total gold, and gold/min.
2. **Given** a selected match, **When** the report opens, **Then** it shows the matchup — the player's champion and assigned role versus the directly-opposed lane opponent's champion.
3. **Given** a selected match, **When** the report opens, **Then** it shows a breakdown block containing CS at 10 minutes, CS/min, gold at 14 minutes, gold at 24 minutes, vision score, solo deaths, and kill participation.
4. **Given** a game that ended before a breakpoint (e.g. before 24 minutes), **When** the report opens, **Then** metrics tied to that breakpoint are shown as not-reached rather than as zero or a broken value.
5. **Given** a game with no clearly-opposed lane opponent (e.g. jungle, or a roaming role), **When** the report opens, **Then** the matchup is presented honestly as having no fixed lane opponent rather than guessing one.

---

### User Story 3 - Read the game's story from a gold-difference timeline with highlights (Priority: P3)

As a player, I want a timeline of the game built from the gold difference over time, with the key moments marked on it — major objectives (dragon, baron, inhibitors, herald, etc...), teamfights where a team was wiped or almost wiped, and deaths that were immediately followed by a swing in gold — so that I can see *when* the game turned and what caused each swing, on the data alone.

**Why this priority**: This turns a list of numbers into the shape of the game and is the most distinctive part of the report. It is heavier than the headline stats (it derives moments from the match timeline), so it follows US2, but it is independently demonstrable.

**Independent Test**: Open a game's report and confirm a gold-difference-over-time chart is shown spanning the game's duration. Confirm the chart is annotated with highlight markers for each major objective taken (every dragon, baron, and inhibitor in the game appears), for teamfights where one team was wiped or nearly wiped, and for deaths that were followed by a meaningful gold swing — each marker placed at its in-game time with a short factual description of what happened.

**Acceptance Scenarios**:

1. **Given** a selected match, **When** the report opens, **Then** a timeline chart shows the gold difference between the two teams across the full duration of the game.
2. **Given** the game contained major objective takes, **When** the timeline renders, **Then** each dragon, baron, and inhibitor event is marked at its in-game time with which side took it.
3. **Given** the game contained a teamfight where one team was wiped or almost wiped, **When** the timeline renders, **Then** that fight is marked as a highlight at its time, with the count of deaths on each side.
4. **Given** a death was immediately followed by a meaningful gold swing, **When** the timeline renders, **Then** that moment is marked as a highlight tying the death to the swing it caused.
5. **Given** the player hovers or selects a highlight marker, **When** it is active, **Then** it shows a short, factual description of the moment (what happened, the time, the side affected) with no interpretation or coaching language.
6. **Given** a highlight references a point on the timeline, **When** it is shown, **Then** it points at the exact chart position for that in-game time so the moment and the curve line up.

---

### User Story 4 - See where I died on a death map (Priority: P4)

As a player, I want a map of Summoner's Rift showing where I died during the game, with the timing of each death, so that I can spot positioning patterns — where on the map I keep getting caught.

**Why this priority**: A focused, valuable view, but the smallest standalone slice and the least dependent on the rest; it is meaningful only after the report exists, so it comes last.

**Independent Test**: Open a game's report and confirm a map of Summoner's Rift shows a marker at the location of each of the player's deaths, ordered or labelled by when in the game each death happened. Confirm the number of markers matches the player's death count for the game.

**Acceptance Scenarios**:

1. **Given** a selected match, **When** the report opens, **Then** a map of Summoner's Rift shows a marker at the map location of each of the player's deaths.
2. **Given** a death marker, **When** it is shown or selected, **Then** it indicates when in the game that death occurred.
3. **Given** the player had zero deaths, **When** the death map renders, **Then** it shows a clean "no deaths" state rather than a broken or empty map.
4. **Given** the player had many deaths in a similar spot, **When** the death map renders, **Then** the markers remain individually distinguishable (e.g. not collapsed into one) so the count and spread are still readable.

---

### Edge Cases

- **Cold start / no synced matches**: The list shows an informative empty state; opening a report is not possible until matches exist.
- **End of available history**: When the underlying match history is exhausted, the list stops paging and shows an end-of-history state instead of spinning forever.
- **Page fetch fails (network/API/rate limit)**: A page that fails to load shows a recoverable error with a retry affordance; already-loaded rows stay usable and the list does not duplicate or skip matches on retry.
- **Match missing detailed/timeline data**: If a game's per-event timeline isn't available, the headline stats and breakdown still render where possible, and the timeline/highlights/death map degrade gracefully with a clear "not available for this game" note rather than failing the whole report.
- **Very short games / remakes / early surrenders**: Breakpoint metrics that the game never reached (gold at 14, gold at 24, CS at 10) are shown as not-reached; the report does not invent or zero them.
- **Non-lane roles**: Jungle or roaming play has no single opposed lane opponent — the matchup is shown as "no fixed lane opponent" rather than a guess.
- **Non-standard game modes**: Modes without standard lanes/objectives (e.g. ARAM, Arena) appear in the list labelled by mode; lane-specific metrics and Rift-specific views (matchup, lane breakpoints, death map on the Rift) are omitted cleanly when they don't apply.
- **Ambiguous "almost wiped"**: The "almost wiped" condition has a defined threshold (see Assumptions); fights below it are simply not marked, avoiding noisy or false highlights.
- **Offline**: For matches already synced and stored locally, the list and report work fully offline; only loading *new* pages beyond what's stored requires connectivity.

## Requirements *(mandatory)*

### Functional Requirements

**Match list (US1)**

- **FR-001**: The system MUST present a dedicated match-list screen showing the player's matches newest-first.
- **FR-002**: Each match row MUST summarise the game with: result (win/loss), champion played, assigned role, K/D/A, CS and CS/min, total gold, game mode/queue, game duration, and a relative time of when it was played.
- **FR-003**: The list MUST load additional, older matches automatically as the player scrolls toward the end of the currently-loaded set (infinite scroll), without requiring an explicit "load more" action.
- **FR-004**: The system MUST request the next page before the player reaches the very end where reasonably possible, and MUST show a loading indicator while a page is being fetched.
- **FR-005**: The system MUST NOT request the same page more than once concurrently, and MUST NOT duplicate, skip, or reorder matches when appending pages.
- **FR-006**: When no more matches are available, the system MUST stop requesting pages and present a clear end-of-history state.
- **FR-007**: When no matches have been synced, the system MUST present an informative empty state.
- **FR-008**: Selecting a match row MUST open that match's report.
- **FR-009**: For matches already stored locally, the list MUST render without requiring a network call; only fetching pages not yet stored may require connectivity, and a failed fetch MUST be recoverable (retry) without corrupting the loaded list.

**Match report — core statistics (US2)**

- **FR-010**: The match report MUST show the player's KDA as kills, deaths, assists and a KDA ratio.
- **FR-011**: The report MUST show the player's CS, CS/min, total gold, and gold/min.
- **FR-012**: The report MUST show the matchup — the player's champion and assigned role versus the directly-opposed lane opponent's champion — and MUST state honestly when there is no fixed lane opponent.
- **FR-013**: The report MUST show a breakdown block containing: CS at 10 minutes, CS/min, gold at 14 minutes, gold at 24 minutes, vision score, solo deaths, and kill participation.
- **FR-014**: Any metric tied to a time breakpoint the game never reached MUST be shown as not-reached, never as a fabricated or zeroed value.

**Match report — gold-difference timeline & highlights (US3)**

- **FR-015**: The report MUST show a timeline of the gold difference between the two teams across the full game duration.
- **FR-016**: The system MUST mark each major objective event on the timeline — at minimum dragon, baron, and inhibitor takes — at its in-game time, indicating which side took it.
- **FR-017**: The system MUST detect and mark teamfights in which one team was wiped or almost wiped (per the threshold in Assumptions), at the fight's in-game time, including the count of deaths on each side.
- **FR-018**: The system MUST detect and mark deaths that were immediately followed by a meaningful gold swing, tying the death to the swing it caused.
- **FR-019**: Each highlight MUST carry its in-game time, type, and a short factual description, and MUST reference the corresponding point on the gold-difference timeline so the marker and curve align.
- **FR-020**: Highlights MUST be derived purely from match data by deterministic rules; the descriptions MUST be factual statements of what happened and MUST NOT contain coaching, judgement, or LLM-generated interpretation (out of scope for this feature).

**Match report — death map (US4)**

- **FR-021**: The report MUST show a Summoner's Rift map with a marker at the location of each of the player's deaths.
- **FR-022**: Each death marker MUST convey when in the game that death occurred.
- **FR-023**: The death map MUST handle zero deaths (clean empty state) and clustered deaths (markers remain individually distinguishable) without breaking.

**Cross-cutting**

- **FR-024**: All figures in the list and report MUST be drawn from the player's own match data; the feature MUST NOT surface any information the player could not already see for their own game (compliant by design).
- **FR-025**: When a game lacks the detailed timeline data needed for the timeline, highlights, or death map, those sections MUST degrade gracefully with a clear "not available for this game" note while the headline stats and breakdown still render where possible.
- **FR-026**: Match data MUST be fetched once and retained locally so that re-opening a match does not re-fetch it and so the report is available offline thereafter.
- **FR-027**: The match list and report MUST visually fit Corky's established look and calm, evidence-first voice, consistent with the existing screens; this feature presents data only and adds no AI-written prose.

### Key Entities *(include if feature involves data)*

- **Match summary**: One row in the list. Represents a single completed game from the player's perspective. Attributes: result, champion, role, K/D/A, CS, CS/min, gold, game mode/queue, duration, when played, and an identifier used to open the full report.
- **Match report**: The full statistical view of one game. Aggregates the core statistics, the breakdown block, the timeline with highlights, and the death map for a single match.
- **Breakdown metrics**: The decided-by-numbers set for the player's game — CS at 10, CS/min, gold at 14, gold at 24, vision score, solo deaths, kill participation — each with a value or a not-reached state.
- **Matchup**: The pairing of the player's champion/role against the opposed lane opponent's champion (or an explicit "no fixed lane opponent").
- **Timeline point**: A sampled gold-difference value at an in-game time, forming the gold-difference-over-time curve.
- **Highlight**: A data-inferred moment on the timeline. Attributes: in-game time, type (objective / teamfight / death-driven swing), affected side(s), a short factual description, and a reference to the timeline point it sits on.
- **Death event**: One of the player's deaths. Attributes: map location and in-game time, used to plot the death map.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can scroll through their match history continuously; subsequent pages load automatically as they approach the end, with no manual "load more" interaction required.
- **SC-002**: In normal conditions, the next page of matches is available by the time the player scrolls to it, so scrolling does not stall on an empty list (any loading indicator seen resolves within a couple of seconds).
- **SC-003**: From the list, a player can open any match and reach its full report in a single action.
- **SC-004**: For a standard Summoner's Rift ranked game, 100% of the required core statistics and breakdown metrics (KDA, CS, CS/min, gold, gold/min, CS@10, gold@14, gold@24, vision score, solo deaths, kill participation) are present and match an independent public source within rounding.
- **SC-005**: For any game, every dragon, baron, and inhibitor taken in that game appears as a highlight on the timeline at the correct in-game time (no missed or phantom objectives).
- **SC-006**: The number of death markers on the death map equals the player's death count for that game, 100% of the time.
- **SC-007**: Highlight descriptions contain zero coaching or interpretive language — they are factual statements of what happened (verifiable by review that no AI-written prose appears).
- **SC-008**: A previously-synced match opens and renders its full report with no network connection.
- **SC-009**: When a game's timeline data is unavailable, the report still renders the headline stats and shows a clear "not available" note for the timeline/highlights/death map, rather than failing to open.

## Assumptions

- **Relationship to Home overview**: This is a dedicated, deeper, paginated match-history surface plus a full per-game report. It complements — and reuses the same synced match data as — the recent-games summary already shown on the Home/Overview; it does not replace that summary.
- **Data sources**: The player's own per-game facts (stats, events, positions, timeline) come from the Riot match data already synced and stored locally by Corky (fetch-once, offline thereafter). OP.GG meta data is used only where reference/metadata helps (e.g. champion/matchup metadata); it is never the source of the player's own per-game numbers, and no player-account lookups are made against it. This keeps the feature compliant and consistent with how Corky already sources data.
- **Queue/mode scope**: The list shows the player's recent matches across the standard queues; each row is labelled with its game mode/queue. The full report (matchup, lane breakpoints, death map) is populated for standard Summoner's Rift games; for modes without standard lanes/objectives, the report degrades to the metrics that still make sense. Whether to filter the list to ranked-only is a presentation choice to finalise in planning; the default is to show recent matches with the mode labelled.
- **Page size**: Pages of roughly 20 matches are loaded at a time (a reasonable default balancing scroll smoothness and fetch cost); the exact number is a tuning detail for planning.
- **Gold-difference basis**: The timeline curve is the difference in total team gold (player's team minus the enemy team) sampled at the match timeline's interval. Per-player lane comparisons (e.g. gold at 14) live in the breakdown block, separate from the team curve.
- **"Almost wiped" threshold**: A teamfight is flagged when a cluster of deaths on one team occurs within a short window (default: 3 or more deaths on one side within ~15 seconds, with few or no trades back). Exact thresholds are a tuning detail to finalise in planning; fights below the threshold are not marked, to avoid noise.
- **"Death followed by a gold gap" threshold**: A death (or tight cluster of deaths) is flagged when the team gold difference swings by a meaningful margin within a short window after it. Exact margin/window are tuning details for planning.
- **Death map scope**: The death map plots the *player's own* deaths. Team/enemy deaths around objectives are surfaced through the timeline highlights, not the death map. Plotting all participants' deaths is a possible later enhancement, out of scope here.
- **Solo deaths**: A "solo death" is a death of the player with no nearby allied participation around that moment (i.e. the player died effectively alone), derived deterministically from the match data.
- **Kill participation**: The share of the team's kills the player contributed to (kills + assists relative to the team's total kills), computed from match data.
- **No LLM**: This feature is purely statistical/derived data. All highlight inference is deterministic, rule-based logic. Any narrative, verdict, turning-point coaching, or comparison-cohort analysis (Flow A's LLM layer) is explicitly out of scope.
- **Single user, local-only**: Corky is a single-player desktop app; all match data is the one player's own, stored locally, never shared.

## Dependencies

- Relies on Corky's existing match-sync foundation (recent matches synced from Riot and stored locally, including per-match timeline data) as the source for the list and report. Where that data is not yet stored, fetching a page requires connectivity and is subject to Riot rate limits.
- Reuses the established renderer look-and-feel and the shared data path (main-process queries over IPC) used by the existing Home/Overview surface.
