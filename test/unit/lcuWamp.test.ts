import { describe, it, expect } from 'vitest'
import { parseWampEvent, uriToEventName } from '../../src/main/adapters/driven/lcu/lcuWs'

describe('uriToEventName', () => {
  it('prefixes OnJsonApiEvent and turns slashes into underscores (keeping hyphens)', () => {
    expect(uriToEventName('/lol-gameflow/v1/gameflow-phase')).toBe(
      'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase'
    )
    expect(uriToEventName('/lol-champ-select/v1/session')).toBe(
      'OnJsonApiEvent_lol-champ-select_v1_session'
    )
  })
})

describe('parseWampEvent', () => {
  it('parses a well-formed [8, name, payload] event frame', () => {
    const raw = JSON.stringify([
      8,
      'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
      { data: 'ChampSelect', eventType: 'Update', uri: '/lol-gameflow/v1/gameflow-phase' }
    ])
    expect(parseWampEvent(raw)).toEqual({
      uri: '/lol-gameflow/v1/gameflow-phase',
      eventType: 'Update',
      data: 'ChampSelect'
    })
  })

  it('tolerates null data (e.g. a Delete eventType)', () => {
    const raw = JSON.stringify([
      8,
      'OnJsonApiEvent',
      { data: null, eventType: 'Delete', uri: '/lol-champ-select/v1/session' }
    ])
    expect(parseWampEvent(raw)).toEqual({
      uri: '/lol-champ-select/v1/session',
      eventType: 'Delete',
      data: null
    })
  })

  it('returns null for non-event opcodes', () => {
    expect(parseWampEvent(JSON.stringify([5, 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase']))).toBeNull()
  })

  it('returns null for malformed or non-array frames', () => {
    expect(parseWampEvent('not json')).toBeNull()
    expect(parseWampEvent('{"data":1}')).toBeNull()
    expect(parseWampEvent('[8]')).toBeNull()
    expect(parseWampEvent(JSON.stringify([8, 'x', 'not-an-object']))).toBeNull()
  })

  it('returns null when the payload lacks a string uri', () => {
    expect(parseWampEvent(JSON.stringify([8, 'x', { data: 1, eventType: 'Update' }]))).toBeNull()
  })
})
