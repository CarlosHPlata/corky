// Frontend-first stub data (Constitution VIII). Shapes mirror the `ClientStatus`
// DTO in `@shared/types` exactly, so wiring the backend is a one-line swap in
// `useClientStatus` with no UI change. These fixtures exercise every state the
// status chip + onboarding panel must render (spec 006).
import type { ClientStatus } from '@shared/types'

const PLAYER = {
  puuid: 'puuid-A',
  gameName: 'Ahri',
  tagLine: 'EUW',
  platform: 'euw1',
  region: 'europe'
}

/** Live: client running, player logged in → "connected as you" (US1). */
export const STUB_CONNECTED: ClientStatus = {
  connection: 'connected',
  source: 'client',
  player: PLAYER
}

/** Client closed, a prior player known → offline "last session" view (US2). */
export const STUB_CACHED: ClientStatus = {
  connection: 'disconnected',
  source: 'cache',
  player: PLAYER
}

/** Client open but at the login screen → treated as last-session (US2). */
export const STUB_LOGGED_OUT: ClientStatus = {
  connection: 'loggedOut',
  source: 'cache',
  player: PLAYER
}

/** Fresh machine, nothing cached, no client → onboarding (US3). */
export const STUB_ONBOARDING: ClientStatus = {
  connection: 'disconnected',
  source: 'none',
  player: null
}

/** Client running but identity unreadable → honest degraded status (FR-012). */
export const STUB_UNREADABLE: ClientStatus = {
  connection: 'unreadable',
  source: 'cache',
  player: PLAYER
}

/** Toggle this to preview each state while building (Constitution VIII). */
export const STUB_INITIAL: ClientStatus = STUB_CONNECTED
