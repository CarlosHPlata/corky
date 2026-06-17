import type { PlayerIdentity } from './playerIdentity'

/**
 * Pure decision for "who is the active player" (spec 006, data-model rules).
 * The testable heart: given an optional live (logged-in) identity and the
 * optional last-known player, pick the one to load and say where it came from.
 *
 * Priority: live (client) → last-known (cache) → none.
 * A client that is running-but-logged-out yields `live = null`, so it collapses
 * into the same path as "no client" — both fall back to cache (keep-on-logout).
 */
export type IdentitySource = 'client' | 'cache' | 'none'

export interface ResolutionInput {
  live: PlayerIdentity | null
  lastKnown: PlayerIdentity | null
}

export interface ActivePlayerResolution {
  active: PlayerIdentity | null
  source: IdentitySource
  /** True when the active puuid differs from the prior active — drives the
   *  reload push and avoids re-loading on same-player re-detect. */
  switched: boolean
}

export function resolveActivePlayer(input: ResolutionInput): ActivePlayerResolution {
  const { live, lastKnown } = input

  // if both are present and they are equal
  if (live != null && lastKnown != null && live.equalsTo(lastKnown)) {
    return { active: lastKnown, source: 'client', switched: false }
  }

  // if only live is present
  if (live != null) {
    return { active: live, source: 'client', switched: true }
  }

  // if only cached one is present
  if (lastKnown != null) {
    return { active: lastKnown, source: 'cache', switched: false }
  }

  // if neither is present
  return { active: null, source: 'none', switched: false }
}

