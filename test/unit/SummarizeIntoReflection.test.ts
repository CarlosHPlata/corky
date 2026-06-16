import { describe, it, expect, vi } from 'vitest'
import { SummarizeIntoReflection } from '../../src/main/application/commands/SummarizeIntoReflection'
import { MatchService } from '../../src/main/application/services/Match/MatchService'
import type { ChatTurn } from '../../src/shared/types'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const MATCH = 'WIN_001'
const SESSION = `${MATCH}-sess-test`
const NOW = 1_749_550_000_000

function deps(summarize: ReturnType<typeof vi.fn>) {
  const matchRepo = {
    getCurrentAccount: () => ({ puuid: PLAYER_PUUID }),
    getMatchDetail: () => ({ matchId: MATCH, rawJson: JSON.stringify(loadMatch(MATCH)) }),
    getTimeline: () => ({ matchId: MATCH, rawJson: JSON.stringify(loadTimeline(MATCH)) })
  } as never
  const reportRepo = { getMatchAnalysis: () => null, getStandingTasks: () => [] } as never
  const goalRepo = { get: () => null } as never
  const reflectionRepo = {
    list: () => [], get: () => null, upsert: vi.fn(), delete: vi.fn(), countForMatch: () => 0
  } as never
  const model = { summarizeReflectionText: summarize } as never
  const itemCatalog = { getItemNames: vi.fn().mockResolvedValue(new Map()) } as never
  const matchService = new MatchService(matchRepo, reportRepo, goalRepo, reflectionRepo, itemCatalog)
  return new SummarizeIntoReflection(matchRepo, reflectionRepo, matchService, model, 'haiku', () => NOW)
}

const TURNS: ChatTurn[] = [
  { role: 'assistant', text: 'opener' },
  { role: 'user', text: 'I kept dying after shoving without vision.' }
]

describe('SummarizeIntoReflection', () => {
  it('wraps the model text as a pending create_reflection proposal turn', async () => {
    const summarize = vi.fn().mockResolvedValue({ text: 'Shove only with vision.', refIds: ['stat:kda', 'marker:ghost#1'] })
    const out = await deps(summarize).execute(MATCH, SESSION, TURNS)
    const proposal = out.proposalTurn?.proposal
    expect(proposal?.resolution).toBe('pending')
    expect(proposal?.id).toBe(`${SESSION}-prop-${NOW.toString(36)}`)
    if (proposal?.payload.kind === 'create_reflection') {
      expect(proposal.payload.text).toBe('Shove only with vision.')
      // unknown ref dropped, valid catalog ref kept
      expect(proposal.payload.refs.map((r) => r.id)).toEqual(['stat:kda'])
    } else {
      throw new Error('expected a create_reflection payload')
    }
  })

  it('requires at least one player turn', async () => {
    const summarize = vi.fn()
    await expect(deps(summarize).execute(MATCH, SESSION, [{ role: 'assistant', text: 'opener' }]))
      .rejects.toThrow(/Nothing to summarize/)
    expect(summarize).not.toHaveBeenCalled()
  })

  it('refuses while another proposal is pending — plain reply, no model call', async () => {
    const summarize = vi.fn()
    const withPending: ChatTurn[] = TURNS.concat({
      role: 'assistant',
      text: 'card',
      proposal: { id: 'p1', payload: { kind: 'create_reflection', text: 'x', refs: [] }, resolution: 'pending' }
    })
    const out = await deps(summarize).execute(MATCH, SESSION, withPending)
    expect(out.proposalTurn).toBeUndefined()
    expect(out.reply).toContain('settle that one first')
    expect(summarize).not.toHaveBeenCalled()
  })

  it('degrades to a plain reply when the summary is unusable', async () => {
    const summarize = vi.fn().mockResolvedValue({ text: '   ', refIds: [] })
    const out = await deps(summarize).execute(MATCH, SESSION, TURNS)
    expect(out.proposalTurn).toBeUndefined()
    expect(out.reply).toContain("couldn't shape")
  })
})
