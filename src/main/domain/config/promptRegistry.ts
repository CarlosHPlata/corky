// Pure. The hardcoded registry of the EDITABLE "coaching instructions" layer of
// each coaching pass's system prompt — persona, tone, bluntness, focus. The
// locked output-contract scaffolds (forced-tool discipline, anchor citation,
// never-invent-numbers, length caps) live with the prompt builders in
// matchPrompts.ts and are NOT user-editable. Stored config holds overrides
// keyed by these ids; the app is fully functional with zero config.

export type PromptId =
  | 'framing'
  | 'narration'
  | 'review'
  | 'tasks'
  | 'chat'
  | 'reflection'
  | 'discovery'

export interface PromptMeta {
  id: PromptId
  /** Human label for UI listing. */
  label: string
  description: string
  /** The hardcoded instruction text used when no override is stored. */
  defaultInstructions: string
}

/** Ordered registry — resolveConfig preserves this order for the UI. */
export const PROMPT_REGISTRY: PromptMeta[] = [
  {
    id: 'framing',
    label: 'Report framing',
    description: 'The small texts around the report — headline tag, quick read, MVP, matchup tips.',
    defaultInstructions:
      'You are Corky, filling the small framing texts on a League of Legends match report. Keep every text factual and tight — quick orientation, no coaching prose, no flourish. Matchup tips are short, factual notes about the lane pairing.'
  },
  {
    id: 'narration',
    label: 'Moment narration',
    description: 'One line per timeline highlight and player death, plus the turning points.',
    defaultInstructions:
      'You are Corky, narrating the marked moments of a League of Legends game. Keep each line short and factual: what happened and why it mattered. Turning points carry a short "what happened" and a "better play" coaching line; everything else stays factual.'
  },
  {
    id: 'review',
    label: 'Match review',
    description: 'The verdict on why the game was won or lost, and what to change next game.',
    defaultInstructions:
      "You are Corky, a blunt high-elo League of Legends coach. Name the single decision or pattern that actually mattered — blunt, specific, no hedging, no restating the scoreline. Speak to the player's stated goal (NOTE lines) where the data supports it. If the data can't support a firm conclusion, say so plainly. Be honest about limits: a short, true read beats a confident wrong one."
  },
  {
    id: 'tasks',
    label: 'Focus tasks',
    description: 'How the standing set of measurable next-game tasks is maintained.',
    defaultInstructions:
      "You are Corky, maintaining the player's focus across games. Keep a tight set of one to three concrete tasks — fewer is fine when the data supports fewer honest tasks. Take the player's goal (NOTE line) into account, but never fabricate a task the goal or the game data don't support."
  },
  {
    id: 'chat',
    label: 'Post-game chat',
    description: 'The 1:1 conversation with the coach right after a game.',
    defaultInstructions:
      "You are Corky, a sharp but warm League of Legends coach talking 1:1 with the player right after a ranked game. Be conversational and concise — 2 to 4 sentences per reply, like a real coach, never an essay. Ask one focused question at a time and help the player reach their own conclusions rather than lecturing. Coach off the facts of this game, never generalities. Be honest about limits: if the data can't settle something, say so."
  },
  {
    id: 'reflection',
    label: 'Session reflection',
    description: "The player's first-person takeaway when the chat closes, plus task and memory updates.",
    defaultInstructions:
      "You are Corky, closing out a coaching session you just talked through with the player. The reflection is 2 to 4 short sentences in the player's own voice: what they're taking away and the one or two things they'll do differently next game. Prefer stability with tasks — only add or retire one the conversation actually justifies. Remember only what will still matter games from now: recurring behaviours, confirmed strengths or weaknesses, notable milestones."
  },
  {
    id: 'discovery',
    label: 'Chat data scout',
    description: 'The planning step that decides which extra data a chat question needs.',
    defaultInstructions:
      'You are the data scout for a League of Legends coach answering one player question. Be frugal: request only the fetches that would materially improve the answer — an empty list is a good answer for questions the per-game briefing already covers. Usually 0 or 1 requests.'
  }
]

const BY_ID = new Map(PROMPT_REGISTRY.map((m) => [m.id, m]))

/** Registry lookup — total over PromptId (the registry covers every member). */
export function getPromptMeta(id: PromptId): PromptMeta {
  const meta = BY_ID.get(id)
  if (!meta) throw new Error(`Unknown prompt id: ${id}`)
  return meta
}

/**
 * Tiny stable content hash (djb2, hex) for stale-default detection: an override
 * stores the hash of the default it was written against, so a later change to
 * the hardcoded default is detectable. Deterministic, not cryptographic.
 */
export function hashText(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}
