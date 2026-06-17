# Feature Specification: League Client Identity Detection

**Feature Branch**: `006-league-client-identity`
**Created**: 2026-06-16
**Status**: Draft
**Input**: User description: "The current code uses the summonername RIOT_ID, region and platform. But this is wrong, we should start integrating with RIOT Local API (League Client API). We need to hear when the League of Legends app is opened, get the summoner of that, and reload the entire application with that user. When the app is open without the LoL client opened, we should simply get the last riot id saved. If no LoL client: get last riot id, user, matches, and all; if not cached, ask the user to open the League of Legends client first. If LoL client open: if not yet logged in, same as no cache; when the user logs in to the LoL client, we listen to it and load our app. This is the first LoL client integration so we should scaffold this layer so it can later be extended for other features."

## Overview

Today, Corky decides *who you are* from a fixed, manually-edited setting (a hard-coded Riot ID plus region and platform). That is fragile and wrong: it must be configured by hand, it silently coaches the wrong person if the setting is stale, and it cannot follow the player who is actually at the keyboard.

This feature makes Corky's player identity **come from the League of Legends client itself**. When the client is running and a player is logged in, Corky recognises that player and loads the whole app around them. When the client is closed (or no one is logged in), Corky opens instantly with the **last player it knew**, fully offline. On a brand-new machine with nothing cached and no client running, Corky guides the user to open the client and log in instead of guessing or breaking.

It is also Corky's **first integration with the local League client**. Beyond identity, this establishes a reusable connection to the client that later features (champion-select assistant, rune/build import, in-game companion) will build on — so the connection layer is designed once, here, as a shared foundation rather than a one-off.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Corky follows whoever is logged into the League client (Priority: P1)

The player opens (or has already opened) the League of Legends client and logs in. Corky notices the logged-in player, identifies them, and loads the entire application for that player — their overview, recent matches, reports, rank, and focus tasks — without the player ever entering or editing any identity setting. If the player logs in *after* Corky is already open, Corky detects the login and re-loads itself for that player.

**Why this priority**: This is the core value of the feature and the reason it exists. Identity that tracks the real, logged-in player removes manual configuration, eliminates "coaching the wrong account," and is the foundation every future client-aware feature depends on. Without it, nothing else in this feature matters.

**Independent Test**: With the League client running and a player logged in, launch Corky (or have it already running and then log in). Verify Corky shows that exact player's identity and loads their data, with no manual identity entry anywhere (This requires a hard external dependency i.e. the League client running so we must ensure that test is run in a controlled environment mocking the League client for test purposes.).

**Acceptance Scenarios**:

1. **Given** the League client is running and player A is logged in, **When** Corky starts, **Then** Corky identifies player A and loads player A's overview, matches, reports, and rank.
2. **Given** Corky is already open and showing a cached player (or onboarding), **When** a player logs into the League client, **Then** Corky detects the login and re-loads the whole app for the now-logged-in player.
3. **Given** a player is logged into the client, **When** Corky resolves their identity, **Then** it also derives and records the player's region/platform from the client so match and rank data are fetched for the correct server.
4. **Given** a player who has logged in before is detected again, **When** Corky loads, **Then** it reuses that player's stored data immediately and refreshes it rather than re-fetching from scratch.

---

### User Story 2 - Corky opens with the last known player when the client isn't available (Priority: P2)

The player opens Corky while the League client is **not** running, or is running but no one has logged in yet. Corky does not block or ask for configuration — it loads the **last player it detected**: their identity, recent matches, reports, and rank, served from local storage and fully usable offline. This preserves Corky's "fast, works offline" overview behaviour from before.

**Why this priority**: Corky is a between-games coaching companion that is frequently opened with the game closed. Falling back to the last known player keeps the app instantly useful offline and is required so this change does not regress the existing experience. It depends on US1 having captured at least one player.

**Independent Test**: With the League client closed and at least one player previously detected, launch Corky. Verify it shows that last player's data immediately, offline, with no prompt and no manual entry.

**Acceptance Scenarios**:

1. **Given** a player was detected on a previous run and the client is now closed, **When** Corky starts, **Then** Corky loads that last known player's data from local storage without requiring the client or the network.
2. **Given** the client is running but no player is logged in yet, **When** Corky starts, **Then** Corky behaves the same as if the client were closed — it shows the last known player if one exists.
3. **Given** Corky is showing the last known player and the network is unavailable, **When** the player browses their overview and past reports, **Then** everything that was previously synced is available offline.

---

### User Story 3 - A new user is guided to connect their client (Priority: P3)

A first-time user opens Corky on a fresh machine: nothing is cached and the League client is not running (or not logged in). Instead of showing a broken empty app or a wrong placeholder identity, Corky clearly explains that it needs to detect them, and asks them to open the League of Legends client and log in. Once they do, Corky picks them up automatically (US1).

**Why this priority**: This is the cold-start path. It matters for a clean first impression and to honour the "honest about limits" principle, but it only affects the very first use before any player is known, so it is lower priority than the two flows that serve the common case.

**Independent Test**: On a clean install with no cached player and the client closed, launch Corky. Verify it shows clear guidance to open and log into the client, shows no fabricated identity, and then automatically loads the player once they log in.

**Acceptance Scenarios**:

1. **Given** no player has ever been detected and the client is not running, **When** Corky starts, **Then** Corky shows guidance to open and log into the League client and does not display any placeholder or previously hard-coded identity.
2. **Given** Corky is showing the "open your client" guidance, **When** the user opens the client and logs in, **Then** Corky detects the login and loads the app for that player without a manual refresh or restart.

---

### Edge Cases

- **Client open but logged out**: Treated exactly like "client not running" — Corky shows the last known player if cached, otherwise the onboarding guidance, and switches to the live player the moment a login happens.
- **Player logs out or closes the client while Corky is open**: Corky keeps showing the last active player's data as an offline view and updates its connection status; it does not blank out or revert to onboarding if a player is already known.
- **A different player logs in than the last known one**: Corky switches the active player to the newly detected one and re-loads around them, while preserving the previous player's stored data so it is intact if that player returns.
- **Client running but its identity cannot be read** (permission or connection problem): Corky degrades gracefully to the last known player (or onboarding if none) and reports that it could not read the client — it never crashes or hangs.
- **Detected player has never been synced and data cannot be fetched** (e.g., the data source is unavailable or the access credential is missing/expired): Corky still shows the detected identity and an honest "couldn't sync yet" state rather than blocking startup.
- **Rapid login/logout flapping**: Corky settles on the latest stable login state instead of thrashing the whole app on every transient change.
- **Detected region/platform differs from what was stored** for that player: Corky updates the stored region/platform to match the client.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Corky MUST determine the active player from the running League client whenever a player is logged in, instead of from a manually-edited identity setting.
- **FR-002**: When a player logs in — whether the client was already running at startup or the login happens while Corky is open — Corky MUST detect it and load the entire application for that player (identity, overview, recent matches, reports, rank, and focus tasks).
- **FR-003**: Corky MUST persist the most recently detected player — their Riot ID, stable account identifier, region, and platform — so the player can be loaded on later launches without the client.
- **FR-004**: When the League client is not running, or is running but no player is logged in, Corky MUST fall back to the last known player and load their stored data, working fully offline.
- **FR-005**: When there is no live player and no last known player, Corky MUST show clear guidance asking the user to open and log into the League client, and MUST NOT display a placeholder, fabricated, or previously hard-coded identity.
- **FR-006**: Corky MUST derive the active player's region and platform from the client and store them with the player, so match and rank data are fetched from the correct server; on fallback it MUST use the player's stored region and platform.
- **FR-007**: When a player different from the last known one logs in, Corky MUST switch the active player to the newly detected one and re-load around them, without discarding the previous player's stored data.
- **FR-008**: While running, Corky MUST detect transitions in client and login state (client started/stopped, player logged in/out) and update the active identity and displayed data accordingly within a reasonable time.
- **FR-009**: Corky MUST surface its current identity and connection status to the player (for example, "connected to the client as «player»" versus "showing your last session — client not detected").
- **FR-010**: When the active player changes (live detection or fallback), Corky MUST refresh that player's data through the existing sync behaviour; if data cannot be fetched, Corky MUST still present whatever is cached and indicate the sync could not complete.
- **FR-011**: Corky MUST NOT require any manual identity configuration for normal use; identity comes from the client, with the last known player as the offline fallback.
- **FR-012**: When the client is running but Corky cannot read its identity, Corky MUST degrade gracefully (last known player, or onboarding if none) and report the failure rather than crashing or hanging.
- **FR-013**: Corky's reading of the client MUST be limited to the player's own identity and own-visible information, consistent with the project's compliance rules (no information the player could not already see).
- **FR-014**: The connection to the League client MUST be built as a reusable capability that future client-aware features can extend, so that adding the next such feature does not require re-working how the player is identified.

### Key Entities *(include if feature involves data)*

- **Active Player**: The player Corky is currently coaching. Identified by Riot ID (display name plus tag) and a stable account identifier, and carrying the region and platform needed to fetch their data. Sourced live from the client when a player is logged in, otherwise from the last known player.
- **Last Known Player**: The most recently detected player, persisted locally so Corky can open instantly and offline. Replaced (not merged) when a different player is detected, while each detected player's underlying data remains stored separately.
- **Client Connection**: Corky's link to the local League client and the status it exposes — for example: client not running, running but logged out, or running with a player logged in. The reusable foundation future client-aware features attach to.
- **Login State Change**: A transition Corky reacts to while running — a player logging in or out, or the client starting or stopping — which can trigger switching the active player and re-loading the app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the client closed and at least one player previously known, Corky shows that player's overview within 3 seconds of launch, offline, with zero manual identity steps.
- **SC-002**: When a player logs into the client while Corky is running, Corky reflects the correct player and their data within 30 seconds, with no manual refresh or restart.
- **SC-003**: In 100% of fresh-start cases (no cached player, no client), Corky shows connection guidance and never displays a wrong or placeholder identity.
- **SC-004**: After a different player logs in, the app shows the new player's data with zero bleed-through from the previous player — no mixed matches, reports, or rank.
- **SC-005**: A returning user completes zero configuration steps to be identified in the normal flow (no editing of any identity setting or file).
- **SC-006**: A subsequent client-aware capability can be added by consuming the existing client connection, requiring no changes to the identity-detection behaviour delivered here.

## Assumptions

- **Single player in spirit, partitioned by account in storage**: Corky remains a single-user coach. Data is stored separately per detected account, so switching accounts preserves each player's history cleanly. A dedicated multi-account management or switcher UI is **out of scope** for this feature; the active player simply follows the client.
- **Logged-out client equals no client**: A running-but-logged-out client provides no live identity, so Corky treats it identically to the client being closed (show last known player if cached, else onboarding) and switches the moment a login occurs.
- **Offline view persists on logout**: If a player logs out or closes the client while Corky is open and a player is already known, Corky keeps showing that player's offline view and updates connection status rather than reverting to onboarding.
- **Client provides identity; the existing pipeline provides data**: The League client is the source of *who* the player is (and their region/platform). Match, timeline, and rank data continue to come from the existing data pipeline and remain subject to its existing credential and rate-limit constraints. Identity detection does not bypass those; if data cannot be fetched, cached data is shown.
- **Manual identity setting is no longer required**: Any pre-existing manual identity value may, at most, serve as a development-time override and is superseded by live client detection whenever a player is logged in.
- **One client at a time**: Detecting and handling multiple simultaneously-running clients is out of scope; Corky assumes a single local client.
- **"Reasonable time" is on the order of tens of seconds**: Live detection of login/logout transitions is expected to be timely but not instantaneous.
- **Windows-only desktop context** is unchanged, consistent with the rest of Corky.

## Out of Scope

- The champion-select assistant, rune/build import, and in-game live companion — future features that will *consume* the client-connection layer established here but are not built by this feature.
- A multi-account management or manual account-switcher interface.
- Detecting or coordinating multiple League clients running at once.
- Any real-time, in-game data reading (live game state, timers, positions).

## Dependencies

- A locally-installed, running, logged-in League of Legends client is required for **live** identity detection. All other flows (last known player, offline overview, onboarding guidance) work without it.
- The existing match/rank data pipeline and its access credential remain the source of player data; this feature changes only how the player is *identified*, not how their data is fetched.
