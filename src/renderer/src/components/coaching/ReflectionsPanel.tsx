import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../core/Button'
import { Icon } from '../Icon'
import { EvidenceChip } from './EvidenceChip'
import type { EvidenceRef, Reflection } from '@shared/types'

// The Reflections section of the match report (spec 005): a board of appended
// note cards. Purely presentational: notes + manual composer in, save/delete
// callbacks out — the screen wires it to useReflections (or a stub,
// Constitution VIII). Manual authoring involves NO model call and works
// offline (FR-014).
//
// Each note is a fixed-size card with an author-colored top bar (gold Corky /
// blue you); long notes scroll inside the card so the board stays uniform.
//
// The composer consumes the report's pendingRefs pool — the same evidence the
// chat composer uses. Click a timeline death, then write the takeaway: the ref
// rides the saved reflection as a labelled chip.

const MAX_REFLECTIONS = 20

function refChipKind(r: EvidenceRef): 'data' | 'death' | 'objective' {
  if (r.id.startsWith('marker:death') || r.id.startsWith('marker:swing')) return 'death'
  if (r.id.startsWith('marker:objective')) return 'objective'
  return 'data'
}
function refChipLabel(r: EvidenceRef): string {
  return r.label ?? r.id.replace(/^(stat|marker|task):/, '').replace(/[_#]/g, ' ').trim()
}

function when(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ReflectionsPanel({ reflections, pendingRefs = [], onSave, onDelete, onRemoveRef, onClearRefs }: {
  reflections: Reflection[]
  /** Evidence picked off the report, attachable to the next saved reflection. */
  pendingRefs?: EvidenceRef[]
  /** Absent id ⇒ create. Refs only ride creates (edits keep the stored refs). */
  onSave: (text: string, refs: EvidenceRef[], id?: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onRemoveRef?: (id: string) => void
  onClearRefs?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  useEffect(() => { setEditingId(null); setDraft('') }, [reflections.length])

  const atCap = reflections.length >= MAX_REFLECTIONS
  // Newest-first so a freshly appended note lands at the top of the board.
  const ordered = useMemo(
    () => [...reflections].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [reflections]
  )

  async function saveNew(): Promise<void> {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      await onSave(text, pendingRefs.slice(0, 5))
      setDraft('')
      if (pendingRefs.length) onClearRefs?.()
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(r: Reflection): Promise<void> {
    const text = editDraft.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      await onSave(text, r.refs, r.id)
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="ckr-cap">
        <span className="ckr-cap__t">Pin a takeaway and it stays with this game.</span>
        <span className="ckr-cap__n">{reflections.length} / {MAX_REFLECTIONS}</span>
      </div>

      {/* Composer — write a note, it's appended to the board */}
      {!atCap ? (
        <div className="ckr-compose">
          {pendingRefs.length > 0 && (
            <div className="ckr-attach">
              <span className="eyebrow" style={{ fontSize: 10, color: 'var(--text-faint)' }}>Attaching</span>
              {pendingRefs.map((r) => (
                <EvidenceChip key={r.id} kind={refChipKind(r)} refId={r.id} truncate
                  title={`${r.id} — click to remove`} onClick={() => onRemoveRef?.(r.id)}>
                  {refChipLabel(r)} ×
                </EvidenceChip>
              ))}
            </div>
          )}
          <div className="ckr-compose__row">
            <textarea className="ck-field" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
              placeholder="Write a note about this game…"
              style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.55, resize: 'vertical' }} />
            <Button variant="primary" size="sm" disabled={!draft.trim() || saving} onClick={saveNew}
              iconLeft={<Icon name="plus" size={14} />} style={{ flex: 'none' }}>
              Add note
            </Button>
          </div>
        </div>
      ) : (
        <p className="ckr-empty">
          This game holds the maximum of {MAX_REFLECTIONS} notes — delete one to add another.
        </p>
      )}

      {/* The note board */}
      {ordered.length === 0 ? (
        <p className="ckr-empty" style={{ marginTop: 14 }}>
          No notes yet. Jot a takeaway above, or ask Corky in the chat to save one for you.
        </p>
      ) : (
        <div className="ckr-board">
          {ordered.map((r) => (
            <div key={r.id} className="ckr-note ckr-note--add" data-source={r.source}>
              <div className="ckr-note__bar" />
              <div className="ckr-note__in">
                <div className="ckr-note__head">
                  <span className="ckr-note__who">
                    <span className="ckr-note__dot" />
                    <span className="ckr-note__author">{r.source === 'coach' ? 'Corky' : 'You'}</span>
                  </span>
                  <span className="ckr-note__time">{when(r.updatedAt)}</span>
                  <span className="ckr-note__acts">
                    <button type="button" className="ckr-act" title="Edit" aria-label="Edit note"
                      onClick={() => { setEditingId(r.id); setEditDraft(r.text) }}>
                      <Icon name="pencil" size={13} />
                    </button>
                    <button type="button" className="ckr-act ckr-act--danger" title="Delete" aria-label="Delete note"
                      onClick={() => onDelete(r.id)}>
                      <Icon name="trash-2" size={13} />
                    </button>
                  </span>
                </div>
                {editingId === r.id ? (
                  <div className="ckr-note__edit">
                    <textarea className="ck-field" value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
                      style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.6, resize: 'none', width: '100%', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flex: 'none' }}>
                      <Button variant="primary" size="sm" disabled={!editDraft.trim() || saving} onClick={() => saveEdit(r)}
                        iconLeft={<Icon name="check" size={14} />}>Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="ckr-note__text">{r.text}</p>
                    {r.refs.length > 0 && (
                      <span className="ckr-note__refs">
                        {r.refs.map((ref) => (
                          <EvidenceChip key={ref.id} kind={refChipKind(ref)} refId={ref.id} truncate title={ref.id}
                            style={{ fontSize: 10.5, padding: '1px 6px' }}>
                            {refChipLabel(ref)}
                          </EvidenceChip>
                        ))}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
