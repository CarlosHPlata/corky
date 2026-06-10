// Frontend-first stub data (Constitution VIII, spec 005). Shapes mirror the
// `ChatSession` / `ActionProposal` DTOs in `@shared/types` exactly, so wiring
// the backend is a stub→`window.api` swap in `useChatSessions` with no UI
// change. These fixtures exercise every state the chat must render: plain
// turns, and proposal cards in all four resolution states.
import type { ChatSession, ChatSessionMeta, StandingFocusTask } from '@shared/types'

const MATCH_ID = 'EUW1_7000000001'

/** The standing set the pending task proposal builds on (for card rendering). */
const TASK_CS: StandingFocusTask = {
  id: `${MATCH_ID}-task-a`,
  description: 'Hold 6.5+ CS/min on mid-lane mages',
  metric: 'cs_per_min',
  comparator: '>=',
  target: 6.5,
  scope: 'champion',
  champion: 'Ahri',
  status: 'active',
  sourceMatchId: MATCH_ID
}
const TASK_VISION: StandingFocusTask = {
  id: `${MATCH_ID}-task-b`,
  description: 'End every game above 25 vision score',
  metric: 'vision_score',
  comparator: '>=',
  target: 25,
  scope: 'universal',
  status: 'active',
  sourceMatchId: MATCH_ID
}
const TASK_DEATHS: StandingFocusTask = {
  id: `${MATCH_ID}-refl-task-c`,
  description: 'Max 1 solo death before 20 minutes',
  metric: 'solo_deaths',
  comparator: '<=',
  target: 1,
  scope: 'universal',
  status: 'active',
  sourceMatchId: MATCH_ID
}

/** Session 1 — the kitchen sink: plain chat, a PENDING task proposal (Accept /
 * Reject live), an ACCEPTED task proposal, and a REJECTED reflection proposal. */
export const STUB_SESSION_MAIN: ChatSession = {
  id: `${MATCH_ID}-sess-legacy`,
  matchId: MATCH_ID,
  title: 'First session',
  createdAt: 1_749_550_000_000,
  updatedAt: 1_749_553_600_000,
  turns: [
    {
      role: 'assistant',
      text: "Here's where your focus stands after that one. Two tasks held, the CS one slipped again — want to keep all three as they are, or adjust?"
    },
    { role: 'user', text: 'The vision task feels too easy now, make it stricter.' },
    {
      role: 'assistant',
      text: "Agreed — you've cleared 25 in six straight games. I've drafted the bump to 30; the other two stay as they are. Take a look.",
      proposal: {
        id: `${MATCH_ID}-sess-legacy-prop-accepted`,
        payload: {
          kind: 'update_tasks',
          set: [TASK_CS, { ...TASK_VISION, target: 30, description: 'End every game above 30 vision score' }, TASK_DEATHS],
          retireIds: [],
          baseline: 'stub-baseline-1'
        },
        resolution: 'accepted',
        resolvedAt: 1_749_551_000_000
      }
    },
    { role: 'user', text: 'Also save a note that I keep dying to ganks right after I shove.' },
    {
      role: 'assistant',
      text: "Here's how I'd write that one down — happy to tweak the wording.",
      proposal: {
        id: `${MATCH_ID}-sess-legacy-prop-rejected`,
        payload: {
          kind: 'create_reflection',
          text: 'I keep dying to ganks right after shoving the wave — I need to shove only when I know where their jungler is.',
          refs: [{ id: 'marker:death#2', kind: 'marker', label: 'Death 2 — 14:10' }]
        },
        resolution: 'rejected',
        resolvedAt: 1_749_551_900_000
      }
    },
    { role: 'user', text: 'Actually, can we swap the CS task for something about early deaths instead?' },
    {
      role: 'assistant',
      text: "We can — though it slipped three games running, which usually means it's the right task. If you still want the swap, here it is: CS task retired, a pre-14 deaths cap in its place.",
      proposal: {
        id: `${MATCH_ID}-sess-legacy-prop-pending`,
        payload: {
          kind: 'update_tasks',
          set: [
            {
              id: `${MATCH_ID}-task-new`,
              description: 'Zero deaths before 14 minutes',
              metric: 'deaths',
              comparator: '<=',
              target: 0,
              scope: 'universal',
              status: 'active',
              sourceMatchId: MATCH_ID
            },
            { ...TASK_VISION, target: 30, description: 'End every game above 30 vision score' },
            TASK_DEATHS
          ],
          retireIds: [TASK_CS.id],
          baseline: 'stub-baseline-2'
        },
        resolution: 'pending'
      }
    }
  ]
}

/** Session 2 — fresh thread for the same match, holding a STALE task proposal
 * (the set changed in session 1 between mint and accept). */
export const STUB_SESSION_SECOND: ChatSession = {
  id: `${MATCH_ID}-sess-m2nd001`,
  matchId: MATCH_ID,
  title: 'Chat · Jun 10, 21:15',
  createdAt: 1_749_560_100_000,
  updatedAt: 1_749_560_400_000,
  turns: [
    { role: 'assistant', text: 'Fresh page, same game on my desk. What do you want to dig into?' },
    { role: 'user', text: 'Tighten the vision task a bit more.' },
    {
      role: 'assistant',
      text: 'Pushing it to 35 — ambitious but doable on your wards-per-game.',
      proposal: {
        id: `${MATCH_ID}-sess-m2nd001-prop-stale`,
        payload: {
          kind: 'update_tasks',
          set: [TASK_CS, { ...TASK_VISION, target: 35, description: 'End every game above 35 vision score' }, TASK_DEATHS],
          retireIds: [],
          baseline: 'stub-baseline-outdated'
        },
        resolution: 'stale',
        resolvedAt: 1_749_560_500_000
      }
    }
  ]
}

export const STUB_SESSIONS: ChatSession[] = [STUB_SESSION_SECOND, STUB_SESSION_MAIN]

/** Switcher listing (newest first), as `chat:sessions:list` will return it. */
export const STUB_SESSION_METAS: ChatSessionMeta[] = STUB_SESSIONS.map(
  ({ id, matchId, title, createdAt, updatedAt }) => ({ id, matchId, title, createdAt, updatedAt })
)
