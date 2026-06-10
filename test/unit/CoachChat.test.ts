import { describe, it, expect, vi } from 'vitest'
import { CoachChat } from '../../src/main/application/commands/CoachChat'
import type { MatchCoachingModel } from '../../src/main/application/ports/MatchCoachingModel'
import type { ChatTurn } from '../../src/shared/types'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

function fakeModel(reply: string) {
  const chat = vi.fn().mockResolvedValue(reply)
  const model = {
    analyzeFraming: vi.fn(), analyzeNarration: vi.fn(), analyzeReview: vi.fn(), analyzeTasks: vi.fn(),
    chat,
    summarizeReflection: vi.fn()
  } as unknown as MatchCoachingModel
  return { model, chat }
}

function deps(model: MatchCoachingModel) {
  const matchRepo = {
    getCurrentAccount: () => ({ puuid: PLAYER_PUUID, gameName: 'P', tagLine: 'EUW', platform: 'euw1', region: 'europe' }),
    getMatchDetail: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadMatch('WIN_001')) }),
    getTimeline: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadTimeline('WIN_001')) })
  } as never
  const reportRepo = { getMatchAnalysis: () => null } as never
  const goalRepo = { get: () => null } as never
  return new CoachChat(matchRepo, reportRepo, goalRepo, model, 'haiku')
}

describe('CoachChat', () => {
  it('grounds a turn with refs: REF lines prepended, blank line, then the original text', async () => {
    const { model, chat } = fakeModel('You were behind there.')
    const cmd = deps(model)
    await cmd.execute('WIN_001', [
      {
        role: 'user',
        text: 'why is my kda fine but we lost lane?',
        refs: [{ id: 'stat:kda', kind: 'stat' }, { id: 'marker:death#99', kind: 'marker' }]
      }
    ])

    expect(chat).toHaveBeenCalledTimes(1)
    const sent = chat.mock.calls[0][1] as ChatTurn[]
    expect(sent[0].text).toMatch(
      /^REF stat:kda=[\d.]+ \(KDA ratio\)\nREF marker:death#99 \(not found in this match\)\n\nwhy is my kda fine but we lost lane\?$/
    )
  })

  it('passes turns without refs through untouched and does not mutate the input', async () => {
    const { model, chat } = fakeModel('Good question.')
    const cmd = deps(model)
    const messages: ChatTurn[] = [
      { role: 'user', text: 'what should I have done at 14?' },
      { role: 'assistant', text: 'Walk me through your recall timing.' },
      { role: 'user', text: 'why this number?', refs: [{ id: 'stat:cs', kind: 'stat' }] }
    ]
    await cmd.execute('WIN_001', messages)

    const sent = chat.mock.calls[0][1] as ChatTurn[]
    expect(sent[0]).toBe(messages[0]) // ref-less turns pass through as-is
    expect(sent[1]).toBe(messages[1])
    expect(sent[2].text).toMatch(/^REF stat:cs=\d+ \(CS\)\n\nwhy this number\?$/)
    expect(messages[2].text).toBe('why this number?') // input transcript untouched
  })

  it('returns the model reply intact', async () => {
    const { model } = fakeModel('Look at the map before you push.')
    const cmd = deps(model)
    const out = await cmd.execute('WIN_001', [{ role: 'user', text: 'hi' }])
    expect(out).toEqual({ reply: 'Look at the map before you push.' })
  })
})
