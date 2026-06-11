import React, { useMemo, useRef, useEffect, useState } from 'react'
import { Card } from './core/Card'
import { Button } from './core/Button'
import { ChampAvatar } from './ChampAvatar'
import { Icon } from './Icon'
import { EvidenceChip } from './coaching/EvidenceChip'
import { ProposalCard } from './coaching/ProposalCard'
import { useChatSessions } from '../data/useChatSessions'
import type {
  MatchCore, ReviewOutput, MatchAnalysis, ChatTurn, EvidenceRef, StandingFocusTask
} from '@shared/types'

// Corky desktop — post-game coaching CHAT (spec 004, reshaped by spec 005).
//
// The chat is an agentic coach whose PRIMARY job is settling the next-game
// focus tasks: it can propose task-set changes and reflection create/edit/
// delete, each rendered inline as a confirm-first ProposalCard. Nothing the
// model says changes state — only the player's Accept does (ResolveProposal in
// the main process). A match can hold several sessions (Claude-style): "New
// chat" starts a clean thread; every session's context is rebuilt server-side
// per call, so a fresh one knows the game, the tasks and every reflection.

// Corky is told to avoid markdown, but models slip — strip stray emphasis/bullets
// so bubbles read as plain coach-speak.
function clean(s: string): string {
  return (s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,!?]|$)/g, '$1$2')
    .replace(/(^|\n)\s*[-•]\s+/g, '$1')
    .replace(/(^|\n)#{1,6}\s*/g, '$1')
    .trim()
}

// Instant, fact-grounded opener so the chat never starts on a spinner. The
// chat's job is settling tasks, so when a standing set exists the opener puts
// it on the table; the game-recap framing is the cold-start fallback.
function buildOpener(core: MatchCore, review: ReviewOutput | null, standing: StandingFocusTask[]): string {
  const active = standing.filter((t) => t.status === 'active')
  if (active.length > 0) {
    const list = active.map((t) => `"${t.description}"`).join(', ')
    const lead = review?.verdict.lead ? review.verdict.lead + ' ' : ''
    return `${lead}Your standing focus right now: ${list}. Keep ${active.length === 1 ? 'it' : 'them'} as-is for next game, or should we adjust something? We can also just talk the game through.`
  }
  const lead = review?.verdict.lead ? review.verdict.lead + ' ' : ''
  if (core.win) {
    return `${lead}Before we bank this one — what part of it felt repeatable, and what was a little bit lucky? Let's land on what you focus next game.`
  }
  return `That one's worth a look. ${lead}Talk me through what you were trying to do — and let's settle what you focus next game.`
}

const STARTERS_TASKS = ['Keep my tasks as they are', 'Make one task stricter', 'Swap a task out', 'What should I focus on next?']
const STARTERS_LOSS = ['Where did I lose the lead?', 'What should I have done differently?']
const STARTERS_WIN = ['What made this one work?', 'How do I repeat this?']

// Chip tone for an evidence ref, mirroring how the report colours its anchors.
function refChipKind(r: EvidenceRef): 'data' | 'death' | 'objective' {
  if (r.id.startsWith('marker:death') || r.id.startsWith('marker:swing')) return 'death'
  if (r.id.startsWith('marker:objective')) return 'objective'
  return 'data'
}
// Readable chip text (same fallback grammar the report uses for claim chips).
function refChipLabel(r: EvidenceRef): string {
  return r.label ?? r.id.replace(/^(stat|marker|task):/, '').replace(/[_#]/g, ' ').trim()
}

export function CoachChat({ matchId, core, review, standing = [], onTasksUpdated, onReflectionsChanged, pendingRefs, onRemoveRef, onClearRefs }: {
  matchId: string
  core: MatchCore
  review: ReviewOutput | null
  /** Current standing focus tasks — the opener presents them and proposal cards
   * resolve retired descriptions against them. */
  standing?: StandingFocusTask[]
  onTasksUpdated?: (analysis: MatchAnalysis) => void
  /** An accepted proposal (or a summarize) touched the reflections list. */
  onReflectionsChanged?: () => void
  /** Evidence the player picked off the report, waiting to ride the next message.
   * Owned by the report screen (every report element can add); rendered, removed
   * and consumed here. */
  pendingRefs?: EvidenceRef[]
  onRemoveRef?: (id: string) => void
  onClearRefs?: () => void
}) {
  const opener = useMemo<ChatTurn>(
    () => ({ role: 'assistant', text: buildOpener(core, review, standing) }),
    [matchId] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const sessions = useChatSessions(matchId, opener)
  const { msgs, metas, activeId, isDraft, hydrated, thinking, resolving } = sessions

  const [draft, setDraft] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraft('') }, [matchId, activeId])
  useEffect(() => {
    const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight
  }, [msgs, thinking])

  async function send(textArg?: string): Promise<void> {
    const text = (textArg != null ? textArg : draft).trim()
    if (!text || thinking || !hydrated) return
    // Attach the pending report references to this turn (the main process grounds
    // them against the anchor catalog), then clear them — they've been spent.
    const refs = pendingRefs && pendingRefs.length > 0 ? pendingRefs.slice(0, 5) : undefined
    if (refs) onClearRefs?.()
    setDraft('')
    await sessions.send(text, refs)
  }

  async function resolveProposal(
    proposalId: string,
    decision: 'accept' | 'reject',
    kind: string
  ): Promise<void> {
    const outcome = await sessions.resolve(proposalId, decision)
    if (outcome?.resolution !== 'accepted') return
    if (outcome.analysis) onTasksUpdated?.(outcome.analysis)
    if (kind !== 'update_tasks') onReflectionsChanged?.()
  }

  // "Summarize into a reflection" (spec 005 US5): Corky drafts the session's
  // takeaway as a standard create_reflection proposal card — accept stores it
  // in the Reflections panel, reject discards. Tasks never ride this step.
  async function summarize(): Promise<void> {
    if (finalizing || thinking || !hydrated || userTurns === 0) return
    setFinalizing(true)
    try {
      const reply = await window.api.summarizeIntoReflection(matchId, activeId, msgs)
      sessions.appendTurn(reply.proposalTurn ?? { role: 'assistant', text: reply.reply })
    } catch {
      // leave the player in the chat if it fails
    } finally {
      setFinalizing(false)
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }
  function autosize(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    setDraft(el.value)
  }

  /** Descriptions for the "retiring: …" line of a task proposal, resolved from
   * the standing set the report handed us. */
  function retiringFor(retireIds: string[]): { id: string; description: string }[] {
    return retireIds
      .map((id) => standing.find((t) => t.id === id))
      .filter((t): t is StandingFocusTask => !!t)
      .map((t) => ({ id: t.id, description: t.description }))
  }

  const userTurns = msgs.filter((x) => x.role === 'user').length
  const hasActiveTasks = standing.some((t) => t.status === 'active')
  const showSwitcher = metas.length > 0

  return (
    <Card padding={0} className="ckc-card">
      <div className="ckc-head">
        <div className="ckc-head__top">
          <span className="ckc-head__id"><Icon name="sparkles" size={18} /></span>
          <Button variant="secondary" size="sm" onClick={summarize} disabled={finalizing || thinking || userTurns === 0}
            iconLeft={<Icon name={finalizing ? 'refresh-cw' : 'file-text'} size={14} className={finalizing ? 'ck-spin' : ''} />}>
            {finalizing ? 'Writing…' : 'Summarize into a reflection'}
          </Button>
        </div>
        <div className="ckc-head__title">Settle next game with Corky</div>
        <div className="ckc-head__sub">he's read your {core.champion} game · tasks change only when you accept</div>
      </div>

      {/* Session switcher (spec 005 US3): stored threads newest-first plus the
          live draft; "New chat" opens a clean thread that only persists once
          the player says something. */}
      {(showSwitcher || !isDraft) && (
        <div className="ckc-sessions">
          <select
            className="ckc-sessions__select"
            value={isDraft ? '__draft__' : activeId}
            onChange={(e) => { if (e.target.value !== '__draft__') void sessions.switchTo(e.target.value) }}
            aria-label="Chat session"
          >
            {isDraft && <option value="__draft__">New chat (unsaved)</option>}
            {metas.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
          <button type="button" className="ckc-sessions__new" title="New chat" aria-label="New chat"
            onClick={() => sessions.newChat()} disabled={!hydrated || (isDraft && userTurns === 0)}>
            <Icon name="plus" size={14} />
            <span>New chat</span>
          </button>
        </div>
      )}

      <div className="ckc-thread" ref={threadRef}>
        {msgs.map((x, i) => (
          <div key={i} className={'ckc-row' + (x.role === 'user' ? ' ckc-row--me' : '')}>
            {x.role === 'assistant'
              ? <span className="ckc-ava"><Icon name="sparkles" size={15} /></span>
              : <ChampAvatar name={core.champion} size="xs" shape="circle" ring="accent" style={{ marginTop: 1 }} />}
            <div style={{ minWidth: 0, maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: x.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={'ckc-bubble ' + (x.role === 'user' ? 'ckc-bubble--me' : 'ckc-bubble--corky')} style={{ maxWidth: '100%' }}>
                {x.refs && x.refs.length > 0 && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {x.refs.map((r) => (
                      <EvidenceChip key={r.id} kind={refChipKind(r)} refId={r.id} truncate title={r.id}
                        style={{ fontSize: 10.5, padding: '1px 6px' }}>
                        {refChipLabel(r)}
                      </EvidenceChip>
                    ))}
                  </span>
                )}
                {clean(x.text) || x.text}
              </div>
              {x.proposal && (
                <ProposalCard
                  proposal={x.proposal}
                  retiring={x.proposal.payload.kind === 'update_tasks' ? retiringFor(x.proposal.payload.retireIds) : []}
                  busy={resolving}
                  onAccept={() => resolveProposal(x.proposal!.id, 'accept', x.proposal!.payload.kind)}
                  onReject={() => resolveProposal(x.proposal!.id, 'reject', x.proposal!.payload.kind)}
                />
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="ckc-row">
            <span className="ckc-ava"><Icon name="sparkles" size={15} /></span>
            <div className="ckc-bubble ckc-bubble--corky"><span className="ckc-dots"><span /><span /><span /></span></div>
          </div>
        )}
      </div>

      {/* Quick starters before the player has said anything — task-first when a
          standing set exists, game-recap otherwise. */}
      {userTurns === 0 && !thinking && (
        <div className="ckc-prompts">
          {(hasActiveTasks ? STARTERS_TASKS : core.win ? STARTERS_WIN : STARTERS_LOSS).map((p, i) => (
            <button key={i} type="button" className="ckc-chip" onClick={() => send(p)}>{p}</button>
          ))}
        </div>
      )}

      {/* Bottom dock — pending refs + input. Grouped so the thread yields space
          upward as refs grow; neither element can push the footer off-screen. */}
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column' }}>
        {pendingRefs && pendingRefs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
            padding: '10px 14px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <span className="eyebrow" style={{ fontSize: 10, color: 'var(--text-faint)', marginRight: 2 }}>Asking about</span>
            {pendingRefs.map((r) => (
              <EvidenceChip key={r.id} kind={refChipKind(r)} refId={r.id} truncate
                title={`${r.id} — click to remove`}
                icon={<Icon name="message-circle" size={12} strokeWidth={2} />}
                onClick={() => onRemoveRef?.(r.id)}>
                {refChipLabel(r)} ×
              </EvidenceChip>
            ))}
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
              {pendingRefs.length}/5
            </span>
          </div>
        )}
        <div className="ckc-foot" style={pendingRefs && pendingRefs.length > 0 ? { borderTop: 'none', paddingTop: 8 } : undefined}>
          <textarea className="ck-field ckc-input" value={draft} onChange={autosize} onKeyDown={onKey} rows={1}
            placeholder="Talk tasks, or talk the game…" disabled={thinking} />
          <button type="button" className="ckc-send" onClick={() => send()} disabled={!draft.trim() || thinking} aria-label="Send">
            <Icon name="send" size={17} />
          </button>
        </div>
      </div>
    </Card>
  )
}
