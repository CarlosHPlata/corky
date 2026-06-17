import { describe, it, expect } from 'vitest'
import { PlayerIdentity } from '../../src/main/domain/identity/playerIdentity'
import { resolveActivePlayer } from '../../src/main/domain/identity/resolution'

const A = new PlayerIdentity('puuid-A', 'Ahri', 'EUW', 'euw1', 'europe')
const B = new PlayerIdentity('puuid-B', 'Zed', 'KR1', 'kr', 'asia')

describe('resolveActivePlayer', () => {
  it('prefers the live (logged-in) player — source=client', () => {
    const r = resolveActivePlayer({ live: A, lastKnown: B, priorActivePuuid: 'puuid-B' })
    expect(r.active).toBe(A)
    expect(r.source).toBe('client')
    expect(r.switched).toBe(true)
  })

  it('falls back to the last-known player when there is no live identity — source=cache', () => {
    const r = resolveActivePlayer({ live: null, lastKnown: A, priorActivePuuid: 'puuid-A' })
    expect(r.active).toBe(A)
    expect(r.source).toBe('cache')
    expect(r.switched).toBe(false)
  })

  it('reports none when there is neither a live nor a cached player', () => {
    const r = resolveActivePlayer({ live: null, lastKnown: null, priorActivePuuid: null })
    expect(r.active).toBeNull()
    expect(r.source).toBe('none')
    expect(r.switched).toBe(false)
  })

  it('flags switched when the active puuid differs from the prior active', () => {
    const r = resolveActivePlayer({ live: B, lastKnown: A, priorActivePuuid: 'puuid-A' })
    expect(r.source).toBe('client')
    expect(r.switched).toBe(true)
  })

  it('does NOT flag switched when re-detecting the same player', () => {
    const r = resolveActivePlayer({ live: A, lastKnown: A, priorActivePuuid: 'puuid-A' })
    expect(r.switched).toBe(false)
  })

  it('keep-on-logout: no live but the same cached player stays active, not blanked', () => {
    // client just went logged-out; lastKnown is still the player who was active
    const r = resolveActivePlayer({ live: null, lastKnown: A, priorActivePuuid: 'puuid-A' })
    expect(r.active).toBe(A)
    expect(r.source).toBe('cache')
    expect(r.switched).toBe(false)
  })

  it('first activation from none flags switched so the app loads', () => {
    const r = resolveActivePlayer({ live: A, lastKnown: null, priorActivePuuid: null })
    expect(r.active).toBe(A)
    expect(r.switched).toBe(true)
  })
})
