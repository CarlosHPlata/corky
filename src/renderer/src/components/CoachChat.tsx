import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from './core/Card'
import { Button } from './core/Button'
import { Badge } from './core/Badge'
import { ChampAvatar } from './ChampAvatar'
import { Icon } from './Icon'
import { EvidenceChip } from './coaching/EvidenceChip'
import type { MatchCore, ReviewOutput, MatchAnalysis, ChatTurn, EvidenceRef } from '@shared/types'

// Corky desktop — post-game coaching CHAT (spec 004).
//
// Replaces the static "Reflect on Corky's read" notepad. Instead of writing a
// reflection cold, the player talks the game through with Corky, who already
// knows this match's facts and Corky's own read (the briefing is rebuilt in the
// main process per call — no secrets cross preload). "Save reflection" asks Corky
// to write the reflection in the player's voice AND, if the talk warrants it,
// re-shape the standing focus tasks. The written reflection persists to the SAME
// renderer-local store the old notepad used (ck-postreflect-<id>); the task
// change is persisted server-side and handed back so the report re-renders.

type View = 'chat' | 'done'

// ---------------------------------------------------------------- persistence
function loadChat(key: string): ChatTurn[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
function saveChat(key: string, msgs: ChatTurn[]): void {
  try { localStorage.setItem(key, JSON.stringify(msgs)) } catch { /* ignore */ }
}
function loadReflection(key: string): string {
  try {
    const raw = localStorage.getItem(key)
    if (raw) { const v = JSON.parse(raw); return typeof v === 'string' ? v : (v?.text || '') }
  } catch { /* ignore */ }
  return ''
}
function saveReflection(key: string, text: string): void {
  try { localStorage.setItem(key, JSON.stringify(text)) } catch { /* ignore */ }
}

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

// Instant, fact-grounded opener so the chat never starts on a spinner. Built
// renderer-side from the read we already have; the model's real context is the
// main-process briefing.
function buildOpener(core: MatchCore, review: ReviewOutput | null): string {
  const lead = review?.verdict.lead ? review.verdict.lead + ' ' : ''
  if (core.win) {
    return `${lead}Before we bank this one — what part of it felt repeatable, and what was a little bit lucky?`
  }
  return `That one's worth a look. ${lead}Talk me through what you were trying to do — where do you think it actually slipped?`
}

const STARTERS_LOSS = ['I thought I could get a pick', "I didn't realise I was that far up", 'Where did I lose the lead?', 'What should I have done differently?']
const STARTERS_WIN = ['What made this one work?', 'Was anything just luck?', 'How do I repeat this?']

// Chip tone for an evidence ref, mirroring how the report colours its anchors.
function refChipKind(r: EvidenceRef): 'data' | 'death' | 'objective' {
  if (r.id.startsWith('marker:death') || r.id.startsWith('marker:swing')) return 'death'
  if (r.id.startsWith('marker:objective')) return 'objective'
  return 'data'
}
// Readable chip text (same fallback grammar the report uses for claim chips).
function refChipLabel(r: EvidenceRef): string {
  return r.label ?? r.id.replace(/^(stat|marker):/, '').replace(/[_#]/g, ' ').trim()
}

export function CoachChat({ matchId, core, review, onTasksUpdated, pendingRefs, onRemoveRef, onClearRefs }: {
  matchId: string
  core: MatchCore
  review: ReviewOutput | null
  onTasksUpdated?: (analysis: MatchAnalysis) => void
  /** Evidence the player picked off the report, waiting to ride the next message.
   * Owned by the report screen (every report element can add); rendered, removed
   * and consumed here. */
  pendingRefs?: EvidenceRef[]
  onRemoveRef?: (id: string) => void
  onClearRefs?: () => void
}) {
  const chatKey = 'ck-chat-' + matchId
  const reflectKey = 'ck-postreflect-' + matchId
  const opener = useMemo<ChatTurn>(() => ({ role: 'assistant', text: buildOpener(core, review) }), [matchId])

  const [msgs, setMsgs] = useState<ChatTurn[]>(() => loadChat(chatKey) || [opener])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [reflection, setReflection] = useState<string>(() => loadReflection(reflectKey))
  const [finalizing, setFinalizing] = useState(false)
  const [view, setView] = useState<View>(() => (loadReflection(reflectKey) ? 'done' : 'chat'))
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  // Reset everything when the game changes.
  useEffect(() => {
    setMsgs(loadChat(chatKey) || [opener])
    const ref = loadReflection(reflectKey)
    setReflection(ref); setView(ref ? 'done' : 'chat'); setDraft(''); setThinking(false); setEditing(false)
  }, [matchId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { saveChat(chatKey, msgs) }, [msgs, chatKey])
  useEffect(() => {
    const el = threadRef.current; if (el && view === 'chat') el.scrollTop = el.scrollHeight
  }, [msgs, thinking, view])

  async function send(textArg?: string): Promise<void> {
    const text = (textArg != null ? textArg : draft).trim()
    if (!text || thinking) return
    // Attach the pending report references to this turn (the main process grounds
    // them against the anchor catalog), then clear them — they've been spent.
    const refs = pendingRefs && pendingRefs.length > 0 ? pendingRefs.slice(0, 5) : undefined
    const next = msgs.concat(refs ? { role: 'user', text, refs } : { role: 'user', text })
    if (refs) onClearRefs?.()
    setMsgs(next); setDraft(''); setThinking(true)
    try {
      const { reply } = await window.api.coachChat(matchId, next)
      setMsgs((cur) => cur.concat({ role: 'assistant', text: clean(reply) || 'Sorry — I lost my train of thought there. Say that again?' }))
    } catch {
      setMsgs((cur) => cur.concat({ role: 'assistant', text: "I couldn't reach my notes just now — try that again in a sec." }))
    } finally {
      setThinking(false)
    }
  }

  async function finalize(): Promise<void> {
    if (finalizing || thinking) return
    setFinalizing(true)
    try {
      const outcome = await window.api.finalizeReflection(matchId, msgs)
      const text = clean(outcome.reflection)
      if (text) {
        setReflection(text); saveReflection(reflectKey, text); setView('done')
        if (outcome.tasksUpdated && outcome.analysis) onTasksUpdated?.(outcome.analysis)
      }
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

  const userTurns = msgs.filter((x) => x.role === 'user').length

  // ---- finalized reflection view (read-only / editable) ----
  if (view === 'done') {
    const commitEdit = (): void => { const t = editDraft.trim(); setReflection(t); saveReflection(reflectKey, t); setEditing(false) }
    return (
      <Card accent="accent" padding={0} className="ckc-card">
        <div className="ckc-head">
          <span className="ckc-head__id"><Icon name="file-text" size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--text-primary)' }}>Session reflection</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>written with Corky · saved to this game</div>
          </div>
          <Badge intent="win" style={{ flex: 'none' }}>Finalized</Badge>
        </div>
        <div style={{ padding: 16 }}>
          {editing ? (
            <>
              <textarea className="ck-field" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={4}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 14.5, lineHeight: 1.6, resize: 'vertical', minHeight: 92 }} />
              <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
                <Button variant="primary" size="sm" onClick={commitEdit} disabled={!editDraft.trim()} iconLeft={<Icon name="check" size={15} />}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{reflection}</p>
              <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
                <Button variant="secondary" size="sm" onClick={() => setView('chat')} iconLeft={<Icon name="message-circle" size={14} />}>Reopen chat</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditDraft(reflection); setEditing(true) }} iconLeft={<Icon name="pencil" size={14} />}>Edit</Button>
              </div>
            </>
          )}
        </div>
      </Card>
    )
  }

  // ---- chat view ----
  return (
    <Card padding={0} className="ckc-card">
      <div className="ckc-head">
        <span className="ckc-head__id"><Icon name="sparkles" size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--text-primary)' }}>Talk it through with Corky</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>he's read your {core.champion} game</div>
        </div>
        <Button variant="secondary" size="sm" onClick={finalize} disabled={finalizing || thinking || userTurns === 0}
          iconLeft={<Icon name={finalizing ? 'refresh-cw' : 'file-text'} size={14} className={finalizing ? 'ck-spin' : ''} />}
          style={{ flex: 'none' }}>
          {finalizing ? 'Writing…' : (reflection ? 'Update reflection' : 'Save reflection')}
        </Button>
      </div>

      <div className="ckc-thread" ref={threadRef}>
        {msgs.map((x, i) => (
          <div key={i} className={'ckc-row' + (x.role === 'user' ? ' ckc-row--me' : '')}>
            {x.role === 'assistant'
              ? <span className="ckc-ava"><Icon name="sparkles" size={15} /></span>
              : <ChampAvatar name={core.champion} size="xs" shape="circle" ring="accent" style={{ marginTop: 1 }} />}
            <div className={'ckc-bubble ' + (x.role === 'user' ? 'ckc-bubble--me' : 'ckc-bubble--corky')}>
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
              {x.text}
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

      {/* Quick starters before the player has said anything */}
      {userTurns === 0 && !thinking && (
        <div className="ckc-prompts">
          {(core.win ? STARTERS_WIN : STARTERS_LOSS).map((p, i) => (
            <button key={i} type="button" className="ckc-chip" onClick={() => send(p)}>{p}</button>
          ))}
        </div>
      )}

      {/* Pending report references — picked off the timeline / death map / stat
          tiles, riding the next message. Click a chip to drop it. */}
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
          placeholder="Tell Corky what you were thinking…" disabled={thinking} />
        <button type="button" className="ckc-send" onClick={() => send()} disabled={!draft.trim() || thinking} aria-label="Send">
          <Icon name="send" size={17} />
        </button>
      </div>
    </Card>
  )
}
