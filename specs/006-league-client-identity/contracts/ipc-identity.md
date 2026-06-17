# Contract: IPC — identity status & reload push

**Feature**: 006-league-client-identity | **Layer**: `adapters/driving/IpcController.ts` + `adapters/driving/LcuEventListener.ts`, `preload/index.ts`, `src/renderer/src/data/*`

Thin IPC surface (Principle IV): one **query** channel for status, one **push** channel for reload. Handlers validate/delegate only; no domain logic. No credential crosses preload (Principle VI).

## Channels

### `identity:status` (renderer → main, query)

```
ipcMain.handle('identity:status', () => deps.getClientStatus.execute())   // → ClientStatus
```
- Returns the current `ClientStatus` (connection + source + player | null). Cheap, synchronous read of the service's cached status.

### `identity:changed` (main → renderer, push)

```
// In LcuEventListener, on ActivePlayerChanged or ClientConnectionChanged:
win.webContents.send('identity:changed', status)   // status: ClientStatus
```
- Fired when the active player switches (reload trigger) or the connection state changes (chip update). Carries the fresh `ClientStatus` so the renderer needs no follow-up round-trip.

## Preload surface (`preload/index.ts`)

```ts
getClientStatus: (): Promise<ClientStatus> => ipcRenderer.invoke('identity:status'),
onIdentityChanged: (cb: (s: ClientStatus) => void) => {
  const h = (_e, s: ClientStatus) => cb(s)
  ipcRenderer.on('identity:changed', h)
  return () => ipcRenderer.removeListener('identity:changed', h)   // unsubscribe
}
```

Added to `IpcApi` in `shared/types.ts`. Exposes operations only — never the lockfile password or any LCU detail.

## Renderer wiring

- **`useClientStatus.ts`** (NEW): loads `getClientStatus()` on mount and subscribes via `onIdentityChanged`, returning `{ status }`. Drives `ClientStatusChip` and the onboarding gate.
- **`useAppData.ts`** (EDIT): subscribe to `onIdentityChanged`; when it fires with a player (`source !== 'none'`), re-run the existing bootstrap (`refresh()` + `sync()`), exactly as the manual sync path does today. This realises "reload the entire application with that user" as a React state refresh — no `win.reload()`.
- **`App.tsx`** (EDIT): mount `ClientStatusChip`; when `status.player === null` (`source === 'none'`) render `ConnectClientPanel` (onboarding) instead of the data screens.

## Effect on existing channels

- `matches:sync` / `summoner:sync` are unchanged at the IPC layer; underneath, `SyncRecentMatches`/`SyncSummonerProfile` now act on the **active** account (from `getCurrentAccount()`), not a static `riotConfig`. The renderer calls them exactly as before.
- All other channels (`summoner:get`, `matches:list`, `report:*`, …) already resolve through `getCurrentAccount()` and therefore follow the active player with **no channel change**.

## Lifecycle (`index.ts`)

After the `BrowserWindow` is ready, the composition root calls `identityService.start()` (begins the gateway watcher and resolves the initial active player) and constructs `LcuEventListener` bound to the focused window's `webContents`. On `window-all-closed`, `identityService.stop()`.

## Stub-first (Constitution VIII)

`stubs/clientStatus.ts` provides a `ClientStatus` for each state — `connected` (player A), `cache`/`disconnected` (last session), `none` (onboarding), `unreadable` — so `ClientStatusChip` and `ConnectClientPanel` are built and approved against stubs before this IPC is wired. Wiring replaces the stub import with `window.api.getClientStatus()` + `onIdentityChanged`, no layout change.
