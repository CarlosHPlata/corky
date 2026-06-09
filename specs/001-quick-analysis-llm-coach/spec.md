# Feature Specification: Quick Analysis — LLM Session Coach

**Feature Branch**: `001-quick-analysis-llm-coach`
**Created**: 2026-06-09
**Status**: Draft
**Input**: User description: "Wire up the Quick Analysis section on the Home screen to use our first real LLM connection. The LLM should act as a real coach: read data from recent games, most played champions, and current LP, then deliver an analysis of the user's flaws. It must surface useful, actionable insights the user can act on to improve — NOT trivial observations the user can already see for themselves (e.g. \"your most played champ is X\")."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get a coached read of my recent session (Priority: P1)

A player opens Corky's Home screen and sees the "Quick analysis" card. Today it is a placeholder. They press the action button and, within a few seconds, Corky reads across their recent ranked games, their most-played champions, and their current LP, and returns a small set of coaching insights that name the *flaws costing them games* and give a concrete, actionable thing to work on for each — phrased the way a high-elo coach would when glancing at a lower-elo account, not as a restatement of the dashboard numbers the player is already looking at.

**Why this priority**: This is the entire feature and Corky's first real coaching output anywhere in the app. It proves the LLM connection end-to-end and delivers the core product promise ("understand *why* you lose") at the landing surface. Without it there is nothing to ship.

**Independent Test**: With a synced set of recent games present, press "Quick analysis" and confirm the card replaces its placeholder with 2–3 insights, each stating a flaw and a specific next-game action, ranked by impact, none of which merely repeats a visible headline stat (e.g. "your most-played champ is X", "your win rate is Y%").

**Acceptance Scenarios**:

1. **Given** the player has recent synced games and a current rank, **When** they press "Quick analysis", **Then** a loading state is shown and is then replaced by a short, impact-ranked set of coaching insights derived from their games, champion pool, and LP.
2. **Given** the analysis has returned, **When** the player reads an insight, **Then** it identifies a *flaw or pattern* (e.g. "you win lane but lose the game", "you give up too many avoidable deaths") and states a concrete action to take next game — not a fact already shown elsewhere on the screen.
3. **Given** the analysis has returned, **When** the player reads any insight, **Then** the insight is anchored to evidence drawn from their own data (a number, ratio, or trend the player can reconcile with the dashboard), consistent with Corky's "evidence over assertion" principle.
4. **Given** a flaw that genuinely needs frame-level detail to diagnose fully (e.g. exactly where deaths happened), **When** Corky surfaces it, **Then** it says so plainly and points the player to the full per-game post-game report rather than inventing specifics it cannot see from summary data.
5. **Given** the player has already run the analysis this session, **When** they choose to run it again, **Then** Corky regenerates the read from the latest synced data.

---

### User Story 2 - Rank- and patch-accurate benchmarks (Priority: P2)

When Corky says a player's farming or deaths are a problem, it measures them against a credible reference for the player's **actual rank and the champion/lane they actually play on the current patch**, not a vague generic number. And when a player leans heavily on a "comfort pick", Corky tells them honestly whether that champion is actually helping them climb right now — using public meta data as the reference, never as the coaching itself.

**Why this priority**: A coaching claim is only as good as the bar it's measured against. "Your CS/min is low" is meaningless without a target; "you're at 5.1 CS/min on Ahri mid where ~7+ is the climbing reference this patch" is a verdict. This is what separates Corky from a stat site: it uses the ladder's data as *evidence behind personal coaching*, never as a meta list it hands you.

**Independent Test**: Run the analysis for a player whose main champion is currently weak in the meta and whose farming trails the benchmark; confirm Corky's farming insight cites a rank/champion/patch-appropriate reference number and that a comfort-pick insight (when warranted) frames the champion's meta standing as context for a personal decision — without devolving into a generic tier list.

**Acceptance Scenarios**:

1. **Given** benchmark reference data is available, **When** Corky diagnoses a farming or death-rate flaw, **Then** the cited target reflects the player's rank and the champion/lane in question on the current patch, not a single fixed global number.
2. **Given** the player relies heavily on one champion that is currently underperforming in the meta, **When** the analysis runs, **Then** Corky may surface a non-trivial, actionable comfort-pick insight (the champion isn't the whole problem, but it isn't helping) framed as context for the player's own decision.
3. **Given** the benchmark reference data cannot be retrieved, **When** the analysis runs, **Then** Corky falls back to a general benchmark, still produces useful coaching, and is honest that it is using a general reference rather than a live one.
4. **Given** any benchmark is used, **When** an insight cites it, **Then** the insight is clear about what reference it is measured against (rank/champion/patch vs general), upholding "honest about limits".

---

### User Story 3 - Honest behavior when data is thin or unavailable (Priority: P2)

A player who has just connected their account, or who has only a couple of games synced, presses "Quick analysis". Rather than inventing patterns from too little data, Corky either declines gracefully with a plain explanation, or clearly marks any insight drawn from a small sample as provisional. The same honesty applies when the coaching service or reference data is unreachable.

**Why this priority**: The requirements make "honest about limits" and "evidence over assertion" load-bearing principles. A coach that fabricates patterns from two games destroys trust and contradicts the product's identity.

**Independent Test**: With fewer than the minimum games required for a confident read, press "Quick analysis" and confirm Corky responds with an honest, non-fabricated message (either a clear "not enough games yet" state or insights explicitly tagged as low-confidence), and never asserts a firm pattern it cannot support.

**Acceptance Scenarios**:

1. **Given** the player has no synced games, **When** they press "Quick analysis", **Then** Corky shows a clear message that it needs games to analyze rather than producing insights.
2. **Given** the player has only a small sample of games, **When** the analysis returns, **Then** any pattern drawn from that small sample is explicitly framed as provisional ("small sample — promising, not proven").
3. **Given** the analysis cannot be produced (the coaching service is unreachable or errors), **When** the player presses "Quick analysis", **Then** Corky shows a friendly failure message and leaves the player able to retry, without crashing or showing a blank card.

---

### User Story 4 - Compliant, player-visible-only coaching (Priority: P3)

The player can trust that every insight about *their own play* is built only from information the game already shows them — their own scoreboard history, champion results, and rank — and that any external reference is public ladder/meta data, never hidden or advantage-giving in-game information.

**Why this priority**: Compliance is a hard product gate. For this feature it is satisfied by construction: the player's own inputs are their already-visible summary data, and the only external data is public, globally-visible meta statistics (which carry no in-game information advantage). It is called out as an explicit, testable guarantee.

**Independent Test**: Inspect the data handed to the analysis and confirm the player-specific portion contains only the player's own recent-game summaries, champion-pool aggregates, and current rank/LP, and that the only external data is public champion/lane meta statistics — no enemy-only information, hidden timers, or predicted in-game state.

**Acceptance Scenarios**:

1. **Given** any generated analysis, **When** its inputs are reviewed, **Then** the player-specific inputs consist solely of the player's own player-visible summary data, and any external reference is public meta/benchmark data.

---

### Edge Cases

- **No games synced**: card shows an honest "needs games" state, not an empty or broken analysis (covered by US3).
- **Single champion only**: the player has played one champion across all recent games — analysis must still find a meaningful flaw (e.g. a recurring in-game pattern, or a comfort-pick standing) rather than commenting on pool diversity.
- **All wins / all losses**: on a flawless or disastrous streak, Corky still surfaces something actionable (what to keep doing / what is leaking) rather than only restating the streak.
- **LP delta not meaningful**: the player crossed a tier/division boundary so a raw LP difference is misleading — analysis should not over-read the LP number in that case (consistent with how the Home screen already guards session LP delta).
- **Benchmark reference unavailable or stale**: the external meta source is unreachable or behind on patch — Corky falls back to a general benchmark and says so, never blocking the analysis (covered by US2).
- **Coaching service slow or timing out**: the loading state must resolve to either results or a retryable error within a reasonable bound, never hang indefinitely.
- **Re-running rapidly**: pressing the action repeatedly must not stack overlapping analyses or produce flickering/duplicate results.
- **Malformed coaching response**: if the coaching service returns something unusable, Corky surfaces a graceful error rather than rendering broken content.

## Requirements *(mandatory)*

### Functional Requirements

#### Core analysis

- **FR-001**: The Quick Analysis card on the Home screen MUST trigger a real coaching analysis when the player activates it, replacing the current placeholder behavior.
- **FR-002**: The analysis MUST take as input the player's recent ranked games, their most-played-champion aggregates (games, win/loss, and the per-champion performance already computed for the Home screen), and their current rank and LP (including the session LP trajectory where meaningful).
- **FR-003**: The analysis MUST return a small, focused set of coaching insights (target 2–3, max 4), ranked by impact, rather than a wall of stats — consistent with Corky's "focused, not overwhelming" principle.
- **FR-004**: Each insight MUST identify a *flaw, leak, or actionable pattern* and pair it with a concrete thing the player can do to improve.
- **FR-005**: The analysis MUST NOT present trivial, already-visible facts as insights (e.g. "your most-played champion is X", "your win rate is Y%", "you have N wins and M losses"). Such facts may only appear as supporting evidence for a non-trivial insight, never as the insight itself.
- **FR-006**: Each insight MUST be anchored to evidence the player can reconcile with their own data (a number, ratio, or trend), upholding "evidence over assertion".
- **FR-007**: The analysis MUST be an aggregate, cross-game read; when a flaw needs frame-level detail beyond summary data to diagnose, the insight MUST point the player to the per-game post-game report rather than fabricating specifics.

#### Benchmark / reference layer

- **FR-008**: When diagnosing rate-based flaws (e.g. farming, death rate), the analysis MUST measure the player against a reference appropriate to their rank and, where available, the specific champion/lane on the current patch — not a single fixed global number.
- **FR-009**: External reference data MUST be used only as benchmark/evidence behind personalised coaching, and MUST NOT be surfaced as generic meta/tier-list content (preserving Corky's "not a meta/stats site" identity).
- **FR-010**: The system MAY surface a "comfort pick" insight when a heavily-played champion is currently underperforming in the meta, framed as context for the player's own decision; it MUST NOT recommend champions as a standalone tier list.
- **FR-011**: When champion/rank/patch reference data cannot be retrieved, the system MUST fall back to a general benchmark, still produce coaching, and clearly state which reference basis was used.
- **FR-012**: The player's own factual data (games, champions, rank) MUST come from the existing first-party source of truth; external meta data MUST NOT override or be mixed into the player's own factual numbers.
- **FR-013**: Reference/meta data retrieval MUST NOT make the analysis slow or fragile: it is bounded by a short timeout, cached for the process lifetime, and falls back immediately on miss/timeout. (Since the coaching call dominates latency, the bounded+cached benchmark fetch on the analysis path keeps it responsive without a separate prefetch step.)

#### Honesty, confidence & resilience

- **FR-014**: When the available data is below a confidence threshold for a given claim, the analysis MUST frame that claim as provisional rather than asserting it firmly.
- **FR-015**: When there are no games available to analyze, the card MUST show an honest "needs games" state instead of producing insights.
- **FR-016**: The system MUST present clear loading feedback while the analysis runs, and MUST disable re-triggering until the in-flight analysis completes (no overlapping runs).
- **FR-017**: If the analysis fails (service unreachable, error, or unusable response), the card MUST show a friendly, non-technical error and allow the player to retry.
- **FR-018**: The player MUST be able to re-run the analysis on demand, with each run reflecting the latest synced data.

#### Compliance, security & presentation

- **FR-019**: The analysis MUST be built only from player-visible information about the player's own games, champions, and rank, plus public meta/benchmark data — never enemy-only, hidden, or predicted in-game data.
- **FR-020**: The coaching credentials/secrets used to produce the analysis MUST remain in the application's secure backend and MUST NOT be exposed to the screen layer.
- **FR-021**: The latest analysis MUST be persisted per account and restored on load, so it survives resync and app restart and navigating away/back never silently re-triggers a run. Re-running replaces the stored analysis; only the most recent per account is kept. A "no games / insufficient data" run does not overwrite a previously stored good analysis.
- **FR-022**: The coaching insights MUST be presented in the existing Quick Analysis visual structure (insight rows with an icon, headline, body, and an evidence chip), so the feature replaces the mock data without redesigning the card.
- **FR-023**: When a restored analysis is older than 24 hours, the card MUST show a clear but non-invasive notice above the insights (with its relative age) suggesting the player re-run it for an up-to-date read.

### Key Entities *(include if feature involves data)*

- **Session Analysis Input**: the bundle handed to the coach — the player's own player-visible data (recent game summaries: result, champion, role, KDA, CS/min, gold, duration, recency; champion-pool aggregates; current rank + LP + session LP trajectory) plus the resolved benchmark reference for the relevant champions/lanes/rank.
- **Benchmark Reference**: public, patch-current reference data used as the measuring stick — per rank and, where available, per champion/lane (e.g. expected CS/min, healthy death rate, current meta standing of a champion). Tagged with its basis (champion+lane+patch vs general fallback).
- **Coaching Insight**: a single unit of advice returned by the analysis — comprising the identified flaw/pattern (headline), the explanation and recommended action (body), a supporting evidence reference, the benchmark basis where relevant, and a confidence indication (provisional vs established).
- **Quick Analysis Result**: the impact-ranked collection of 2–4 Coaching Insights for the current session, plus its state (idle / running / done / error / insufficient-data).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a Home screen with synced games, a player can obtain a completed coaching analysis in a single action and within roughly 10 seconds of triggering it (the external benchmark fetch is not on this path).
- **SC-002**: 100% of returned insights pair an identified flaw/pattern with a concrete action; an insight that is purely a restatement of a visible headline stat is considered a defect.
- **SC-003**: 100% of returned insights cite evidence traceable to the player's own data shown elsewhere on the screen.
- **SC-004**: 100% of rate-based diagnoses (farming, deaths) cite a benchmark whose basis (rank/champion/patch or general) is stated; 0% present an unlabeled bar.
- **SC-005**: When reference data is unavailable, 100% of runs still produce coaching using a general benchmark and disclose that basis; 0% fail to produce an analysis solely because the external source was down.
- **SC-006**: With insufficient player data, 100% of runs produce an honest limited/provisional response and 0% fabricate a firm, unsupported pattern.
- **SC-007**: When the coaching service fails, 100% of attempts surface a retryable error and 0% leave the card blank, hung, or crashed.
- **SC-008**: A first-time reviewer reading the analysis cannot find any insight that simply repeats a number already visible on the Home dashboard, nor any insight that reads as a generic meta/tier list rather than personal coaching.
- **SC-009**: Re-opening the Home screen within the same session does not trigger an unrequested new analysis run.

## Assumptions

- **Reuses existing Home data**: the analysis consumes the same player-visible summary data already loaded for the Home screen (recent matches, champion pool, rank/LP), rather than fetching new first-party data or deep per-game timelines. Deep, timeline-level per-game coaching is the separate post-game report flow and is out of scope here.
- **Aggregate, not per-match**: Quick Analysis is a session-level read across multiple games; it is distinct from the existing single-match post-game coaching report and does not replace or modify it.
- **Benchmark source**: public champion/lane/rank meta statistics (e.g. via the OP.GG open MCP service) provide the patch-current benchmark layer. This is used strictly as the reference behind personal coaching (uses 1 & 2 from design discussion); standalone climbing-champion/tier-list recommendations are out of scope for this iteration.
- **Single source of truth for the player's own data**: the player's own facts remain sourced first-party (Riot); the external meta service is never used for the player's own account numbers, avoiding conflicting figures.
- **Benchmark resilience**: the external meta source is undocumented as to auth/rate-limits/terms, so the system treats it as best-effort — cached per patch (fetched during sync, like other static data) and degrading to a small built-in general benchmark when unavailable.
- **On-demand, persisted per account**: the analysis is generated when the player asks for it and the latest result is stored locally per account, so it survives resync and app restart and is restored on load. Only the most recent per account is kept (re-running replaces it); a full longitudinal history of analyses is a possible future enhancement.
- **Minimum sample for confident claims**: a small number of games (assumed ≥3 for a given pattern) is treated as the threshold below which claims are framed as provisional, consistent with the cohort-confidence convention used elsewhere in the product.
- **Insight count & voice**: the card targets 2–3 insights (max 4) in a blunt, direct, high-elo-coach voice; fewer is acceptable when the data genuinely supports fewer honest claims.
- **Hybrid analysis split**: the system pre-computes the hard/risky signals (rates, benchmark gaps, lead-conversion proxy) and the model prioritizes, diagnoses, and writes — the model never invents figures and never fetches data itself.
- **Coaching is advisory**: outputs explain and recommend; they never issue real-time commands.
- **Trigger remains manual**: the analysis runs when the player presses the action; automatic generation on sync is not in scope.
- **Existing card layout is retained**: this feature wires real data into the current Quick Analysis card design rather than redesigning the surface.
- **Matchup/counter coaching is out of scope**: champion matchup and counter data belong to the champion-select assistant (Flow B), not Quick Analysis.
