import { describe, it, expect } from 'vitest'
import { parseLockfile } from '../../src/main/domain/identity/lockfile'

describe('parseLockfile', () => {
  it('parses a well-formed lockfile string', () => {
    const info = parseLockfile('LeagueClient:12345:54321:abcdEFGHpassword:https')
    expect(info).toEqual({
      name: 'LeagueClient',
      pid: 12345,
      port: 54321,
      password: 'abcdEFGHpassword',
      protocol: 'https'
    })
  })

  it('trims surrounding whitespace/newline the client may leave', () => {
    const info = parseLockfile('  LeagueClient:1:2999:pw:https\n')
    expect(info?.port).toBe(2999)
    expect(info?.password).toBe('pw')
  })

  it('returns null on the wrong number of fields', () => {
    expect(parseLockfile('LeagueClient:12345:54321:onlyfour')).toBeNull()
    expect(parseLockfile('a:b:c:d:e:f')).toBeNull()
  })

  it('returns null when pid or port is not numeric', () => {
    expect(parseLockfile('LeagueClient:notapid:54321:pw:https')).toBeNull()
    expect(parseLockfile('LeagueClient:12345:notaport:pw:https')).toBeNull()
  })

  it('returns null on empty / whitespace input', () => {
    expect(parseLockfile('')).toBeNull()
    expect(parseLockfile('   ')).toBeNull()
  })

  it('preserves a password that itself contains no colon (typical base64-ish)', () => {
    const info = parseLockfile('LeagueClient:777:2999:Z9-_aB12:https')
    expect(info?.password).toBe('Z9-_aB12')
  })
})
