# Contract: `LeagueClientGateway` port

**Feature**: 006-league-client-identity | **Layer**: `application/ports/` (interface) ← implemented by `adapters/driven/lcu/LcuLeagueClientGateway.ts`

The framework-free seam between the application layer and the local League client. **All LCU specifics** (lockfile, loopback HTTPS, self-signed cert, REST/WS) live behind this interface. It is the reusable layer future client features (champ select, runes, in-game) extend — so it exposes *connection + identity* generically, not feature-specific calls.

## Interface

```ts
export interface CurrentSummoner {
  puuid: string
  gameName: string
  tagLine: string
}

export type ClientConnection = 'connected' | 'loggedOut' | 'disconnected' | 'unreadable'

export interface ClientSnapshot {
  connection: ClientConnection
  /** Present iff connection === 'connected'. */
  summoner?: CurrentSummoner
  /** Riot routing derived from the client region; present iff connection === 'connected' and the region mapped. */
  platform?: string   // e.g. 'euw1'
  region?: string     // e.g. 'europe'
}

export interface LeagueClientGateway {
  /** One-shot read of the current connection + identity. NEVER throws for the
   *  "client not running / logged out / unreadable" cases — those are returned
   *  as connection states. Throws only on a genuine programming error. */
  snapshot(): Promise<ClientSnapshot>

  /** Subscribe to STABLE state changes (debounced). Returns an unsubscribe fn.
   *  Fires on: client start/stop, login/logout, and identity change. The MVP
   *  adapter implements this by lockfile-watch + light polling; a WebSocket
   *  upgrade later keeps this exact signature. */
  subscribe(onChange: (snapshot: ClientSnapshot) => void): () => void

  /** Begin/stop the underlying watcher. start() is idempotent. */
  start(): void
  stop(): void
}
```

## Behavioural contract

| Situation | `snapshot()` result |
|-----------|--------------------|
| Client not running (no lockfile) | `{ connection: 'disconnected' }` |
| Client running, login screen (no logged-in summoner) | `{ connection: 'loggedOut' }` |
| Client running, player logged in | `{ connection: 'connected', summoner, platform, region }` |
| Client running, identity read failed (permission/parse/cert) | `{ connection: 'unreadable' }` |
| Client connected but region string unknown to the map | `{ connection: 'connected', summoner }` **without** `platform`/`region` (caller falls back to stored values) |

- **No throws across the boundary** for expected states — the four `ClientConnection` values encode them. This keeps `IdentityService` branch-free of try/catch for normal flows (FR-012 degradation is a state, not an exception).
- **Debounce**: `subscribe` must not emit for sub-second flaps; only stable transitions (addresses the flapping edge case).
- **Compliance (Principle I)**: the adapter reads **only** the player's own `current-summoner` + `region-locale`. It MUST NOT expose lobby/opponent/in-game data through this port (future features add their own ports/methods under explicit review).
- **Secrets (Principle VI)**: the lockfile password is used only inside the adapter to authenticate loopback requests; it is never placed on a `ClientSnapshot` or any DTO.

## Adapter implementation notes (`LcuLeagueClientGateway`)

- **Discovery/auth**: locate + read the lockfile → parse `name:pid:port:password:protocol` (pure `domain/identity/lockfile.ts`) → base URL `https://127.0.0.1:<port>`, Basic auth `riot:<password>`.
- **Identity**: `GET /lol-summoner/v1/current-summoner` → map to `CurrentSummoner` (empty/404 ⇒ `loggedOut`).
- **Routing**: `GET /riotclient/region-locale` → `region` string → `domain/identity/region.ts` map → `{ platform, region }` (unknown ⇒ omit).
- **TLS**: accept the client's self-signed cert **scoped to `127.0.0.1`** only (`lcuHttp.ts`).
- **Change detection (MVP)**: watch the lockfile for start/stop; poll `current-summoner` every ~3–5 s while present; debounce; emit on stable change.

## Tests (behind a fake gateway)

The port is faked in `IdentityService.test.ts` to script every `ClientSnapshot` sequence (disconnected→connected, connected→loggedOut, connected(A)→connected(B), connected→unreadable). The real adapter's HTTP/WS/FS is **not** unit-tested (external dependency; Principle V network rule) and is verified manually per `quickstart.md`.
