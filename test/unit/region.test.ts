import { describe, it, expect } from 'vitest'
import { mapRegion } from '../../src/main/domain/identity/region'

describe('mapRegion', () => {
  it('maps the common shards to platform + regional route', () => {
    expect(mapRegion('EUW')).toEqual({ platform: 'euw1', region: 'europe' })
    expect(mapRegion('EUNE')).toEqual({ platform: 'eun1', region: 'europe' })
    expect(mapRegion('NA')).toEqual({ platform: 'na1', region: 'americas' })
    expect(mapRegion('KR')).toEqual({ platform: 'kr', region: 'asia' })
    expect(mapRegion('BR')).toEqual({ platform: 'br1', region: 'americas' })
    expect(mapRegion('JP')).toEqual({ platform: 'jp1', region: 'asia' })
  })

  it('routes Latin America and Oceania correctly', () => {
    expect(mapRegion('LAN')).toEqual({ platform: 'la1', region: 'americas' })
    expect(mapRegion('LAS')).toEqual({ platform: 'la2', region: 'americas' })
    expect(mapRegion('OCE')).toEqual({ platform: 'oc1', region: 'sea' })
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(mapRegion('euw')).toEqual({ platform: 'euw1', region: 'europe' })
    expect(mapRegion('  Na  ')).toEqual({ platform: 'na1', region: 'americas' })
  })

  it('returns null for an unknown / empty region so the caller can fall back', () => {
    expect(mapRegion('ATLANTIS')).toBeNull()
    expect(mapRegion('')).toBeNull()
  })
})
