import { describe, it, expect } from 'vitest'
import { absoluteLp } from '../../src/renderer/src/utils/format'

describe('absoluteLp', () => {
  it('maps Iron IV 0 LP to the bottom of the ladder', () => {
    expect(absoluteLp({ tier: 'IRON', division: 'IV', leaguePoints: 0 })).toBe(0)
  })

  it('steps 100 LP per division within a tier', () => {
    const iv = absoluteLp({ tier: 'SILVER', division: 'IV', leaguePoints: 50 })
    const iii = absoluteLp({ tier: 'SILVER', division: 'III', leaguePoints: 50 })
    const i = absoluteLp({ tier: 'SILVER', division: 'I', leaguePoints: 50 })
    expect(iii - iv).toBe(100)
    expect(i - iv).toBe(300)
  })

  it('reads a Silver I → Gold IV promotion as a positive delta', () => {
    const before = absoluteLp({ tier: 'SILVER', division: 'I', leaguePoints: 97 })
    const after = absoluteLp({ tier: 'GOLD', division: 'IV', leaguePoints: 13 })
    expect(after - before).toBe(16)
  })

  it('reads a demotion as a negative delta', () => {
    const before = absoluteLp({ tier: 'GOLD', division: 'IV', leaguePoints: 0 })
    const after = absoluteLp({ tier: 'SILVER', division: 'I', leaguePoints: 75 })
    expect(after - before).toBe(-25)
  })

  it('is case-insensitive on tier and division', () => {
    expect(absoluteLp({ tier: 'gold', division: 'ii', leaguePoints: 40 }))
      .toBe(absoluteLp({ tier: 'GOLD', division: 'II', leaguePoints: 40 }))
  })

  it('puts apex tiers on a shared pool above Diamond I', () => {
    const diamondTop = absoluteLp({ tier: 'DIAMOND', division: 'I', leaguePoints: 99 })
    const master = absoluteLp({ tier: 'MASTER', division: '', leaguePoints: 0 })
    const grandmaster = absoluteLp({ tier: 'GRANDMASTER', division: '', leaguePoints: 250 })
    expect(master).toBeGreaterThan(diamondTop)
    expect(grandmaster - master).toBe(250)
  })
})
