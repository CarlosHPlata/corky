import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../core/Button'
import { Icon } from '../Icon'
import { EvidenceChip } from './EvidenceChip'
import type { EvidenceRef, Reflection } from '@shared/types'

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

export function ReflectionsPanel({ reflections, pendingRefs = [], startSignal = 0, onSave, onDelete, onRemoveRef, onClearRefs }: {
  reflections: Reflection[]
  pendingRefs?: EvidenceRef[]
  /** Bumped by the aside "Add a reflection" control to open the compose tile. */
  startSignal?: number
  onSave: (text: string, refs: EvidenceRef[], id?: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onRemoveRef?: (id: string) => void
  onClearRefs?: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const newRef = useRef<HTMLTextAreaElement>(null)

  const atCap = reflections.length >= MAX_REFLECTIONS
  const ordered = useMemo(
    () => [...reflections].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [reflections]
  )

  // Reset edit/create state when list length changes (e.g. after a save)
  useEffect(() => { setEditingId(null); setCreating(false) }, [reflections.length])

  function startCreate(): void {
    if (atCap || creating) return
    setEditingId(null)
    setDraft('')
    setCreating(true)
  }

  // External signal: the aside "Add a reflection" button opens the compose tile
  useEffect(() => { if (startSignal) startCreate() }, [startSignal]) // eslint-disable-line

  // Auto-focus the new note textarea when the tile opens
  useEffect(() => { if (creating && newRef.current) newRef.current.focus() }, [creating])

  async function saveNew(): Promise<void> {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      await onSave(text, pendingRefs.slice(0, 5))
      setDraft('')
      setCreating(false)
      if (pendingRefs.length) onClearRefs?.()
    } finally {
      setSaving(false)
    }
  }

  function cancelNew(): void { setDraft(''); setCreating(false) }

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
        <span className="ckr-cap__t">Pin a takeaway and it stays with this game — yours or Corky's.</span>
        <span className="ckr-cap__n">{reflections.length} / {MAX_REFLECTIONS}</span>
      </div>

      <div className="ckr-board">
        {/* Add tile — mints a new note card in edit mode */}
        {!creating && !atCap && (
          <button type="button" className="ckr-add" onClick={startCreate} aria-label="Add a note">
            <span className="ckr-add__plus"><Icon name="plus" size={20} /></span>
            <span className="ckr-add__t">Add a note</span>
            {pendingRefs.length > 0 && (
              <span className="ckr-add__sub">{pendingRefs.length} evidence ready to attach</span>
            )}
          </button>
        )}
        {!creating && atCap && (
          <div className="ckr-add" style={{ cursor: 'default' }}>
            <span className="ckr-add__t" style={{ color: 'var(--text-faint)' }}>Max {MAX_REFLECTIONS} notes</span>
            <span className="ckr-add__sub" style={{ color: 'var(--text-faint)' }}>delete one to add another</span>
          </div>
        )}

        {/* New note card — born in edit mode inside the board */}
        {creating && (
          <div className="ckr-note ckr-note--add" data-source="player">
            <div className="ckr-note__bar" />
            <div className="ckr-note__in">
              <div className="ckr-note__head">
                <span className="ckr-note__who">
                  <span className="ckr-note__dot" />
                  <span className="ckr-note__author">You</span>
                </span>
                <span className="ckr-note__time">New note</span>
              </div>
              <div className="ckr-note__edit">
                <textarea ref={newRef} className="ck-field" value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What are you taking away from this game?"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveNew() }
                    else if (e.key === 'Escape') { e.preventDefault(); cancelNew() }
                  }}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.6, resize: 'none', width: '100%', boxSizing: 'border-box' }} />
                {pendingRefs.length > 0 && (
                  <span className="ckr-note__refs">
                    {pendingRefs.map((r) => (
                      <EvidenceChip key={r.id} kind={refChipKind(r)} refId={r.id} truncate
                        title={`${r.id} — click to remove`}
                        onClick={() => onRemoveRef?.(r.id)}>
                        {refChipLabel(r)} ×
                      </EvidenceChip>
                    ))}
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flex: 'none' }}>
                  <Button variant="primary" size="sm" disabled={!draft.trim() || saving} onClick={() => void saveNew()}
                    iconLeft={<Icon name="check" size={14} />}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={cancelNew}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Existing note cards */}
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
                    onClick={() => { setCreating(false); setEditingId(r.id); setEditDraft(r.text) }}>
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
                    <Button variant="primary" size="sm" disabled={!editDraft.trim() || saving} onClick={() => void saveEdit(r)}
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
    </div>
  )
}
