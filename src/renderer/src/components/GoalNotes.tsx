import React, { useEffect, useRef } from 'react'
import { Card } from './core/Card'
import { Button } from './core/Button'
import { Icon } from './Icon'
import { useSessionGoal } from '../data/useSessionGoal'

const GOAL_MAX = 200
const NOTES_MAX = 1000

// ── Session goal & notes ─────────────────────────────────────────────────────
// A small, editable pad the player keeps at the top of their session: one sharp
// goal plus free-form notes. Read mode shows it as a calm, framed section; the
// edit button swaps it for clean inputs. The text is fed to the coach (Quick
// analysis) as the player's stated intent. Persisted in the main process.
export function GoalNotes(): React.ReactElement {
  const { value, editing, draft, hasContent, startEdit, cancel, setGoal, setNotes, save } =
    useSessionGoal()
  const goalRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && goalRef.current) {
      goalRef.current.focus()
      const v = goalRef.current.value
      goalRef.current.setSelectionRange(v.length, v.length)
    }
  }, [editing])

  // Submit on Cmd/Ctrl+Enter, cancel on Esc.
  function onKey(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  // ── editing ────────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <Card accent="accent" padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
            <Icon name="flag" size={18} style={{ color: 'var(--gold-400)' }} />
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>Session goal &amp; notes</span>
        </div>

        <label className="eyebrow" style={{ display: 'block', fontSize: 11, marginBottom: 7 }}>Goal</label>
        <input
          ref={goalRef}
          className="ck-field"
          value={draft.goal}
          maxLength={GOAL_MAX}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={onKey}
          placeholder="One thing to nail this session…"
          style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}
        />

        <label className="eyebrow" style={{ display: 'block', fontSize: 11, margin: '16px 0 7px' }}>Notes</label>
        <textarea
          className="ck-field"
          value={draft.notes}
          maxLength={NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={onKey}
          rows={4}
          placeholder="Reminders, matchup notes, things to watch for…"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, resize: 'vertical', minHeight: 88 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16 }}>
          <Button variant="primary" size="sm" onClick={save} iconLeft={<Icon name="check" size={15} />}>Save</Button>
          <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>⌘⏎ to save · Esc to cancel</span>
        </div>
      </Card>
    )
  }

  // ── empty state ──────────────────────────────────────────────────────────────
  if (!hasContent) {
    return (
      <Card accent="accent" padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
            <Icon name="flag" size={20} style={{ color: 'var(--gold-400)' }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.15 }}>Set a goal for this session</div>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: '4px 0 0' }}>
              One sharp focus and a few notes to keep yourself honest while you climb.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={startEdit} iconLeft={<Icon name="plus" size={15} />} style={{ flex: 'none' }}>Set a goal</Button>
        </div>
      </Card>
    )
  }

  // ── read mode ────────────────────────────────────────────────────────────────
  const goal = value?.goal?.trim() ?? ''
  const noteLines = (value?.notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean)

  return (
    <Card accent="accent" padding={18}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
          <Icon name="flag" size={20} style={{ color: 'var(--gold-400)' }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 5 }}>Session goal</div>
          {goal
            ? <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color: 'var(--text-primary)', lineHeight: 1.25, textWrap: 'pretty' } as React.CSSProperties}>{goal}</div>
            : <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-faint)', fontStyle: 'italic' }}>No goal set.</div>}
        </div>
        <Button variant="ghost" size="sm" onClick={startEdit} iconLeft={<Icon name="pencil" size={14} />} style={{ flex: 'none' }}>Edit</Button>
      </div>

      {noteLines.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 10 }}>Notes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {noteLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flex: 'none', width: 5, height: 5, borderRadius: '50%', background: 'var(--gold-400)', marginTop: 8 }} />
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0, textWrap: 'pretty' } as React.CSSProperties}>{line}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
