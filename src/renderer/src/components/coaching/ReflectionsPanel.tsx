import React, { useEffect, useState } from 'react'
import { Card } from '../core/Card'
import { Button } from '../core/Button'
import { Icon } from '../Icon'
import { EvidenceChip } from './EvidenceChip'
import type { EvidenceRef, Reflection } from '@shared/types'

// The Reflections section of the match report (spec 005). Purely
// presentational: rows + manual composer in, save/delete callbacks out — the
// screen wires it to useReflections (or a stub, Constitution VIII). Manual
// authoring involves NO model call and works offline (FR-014).
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
    <Card padding={0} className="ckc-card">
      <div className="ckc-head">
        <span className="ckc-head__id"><Icon name="bookmark" size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--text-primary)' }}>Reflections</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
            your takeaways from this game · {reflections.length}/{MAX_REFLECTIONS}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reflections.length === 0 && (
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-faint)' }}>
            Nothing written down yet. Capture a takeaway yourself below, or ask Corky in the chat to save one for you.
          </p>
        )}

        {reflections.map((r) => (
          <div key={r.id} className="ckr-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="eyebrow" style={{ fontSize: 10, color: r.source === 'coach' ? 'var(--gold-400)' : 'var(--text-muted)' }}>
                {r.source === 'coach' ? 'Corky' : 'you'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)' }}>{when(r.updatedAt)}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" className="ckr-act" title="Edit" aria-label="Edit reflection"
                  onClick={() => { setEditingId(r.id); setEditDraft(r.text) }}>
                  <Icon name="pencil" size={13} />
                </button>
                <button type="button" className="ckr-act ckr-act--danger" title="Delete" aria-label="Delete reflection"
                  onClick={() => onDelete(r.id)}>
                  <Icon name="trash-2" size={13} />
                </button>
              </span>
            </div>
            {editingId === r.id ? (
              <>
                <textarea className="ck-field" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button variant="primary" size="sm" disabled={!editDraft.trim() || saving} onClick={() => saveEdit(r)}
                    iconLeft={<Icon name="check" size={14} />}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{r.text}</p>
                {r.refs.length > 0 && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
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
        ))}

        {!atCap && (
          <div style={{ borderTop: reflections.length ? '1px solid var(--border-subtle)' : 'none', paddingTop: reflections.length ? 12 : 0 }}>
            {pendingRefs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span className="eyebrow" style={{ fontSize: 10, color: 'var(--text-faint)' }}>Attaching</span>
                {pendingRefs.map((r) => (
                  <EvidenceChip key={r.id} kind={refChipKind(r)} refId={r.id} truncate
                    title={`${r.id} — click to remove`} onClick={() => onRemoveRef?.(r.id)}>
                    {refChipLabel(r)} ×
                  </EvidenceChip>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
              <textarea className="ck-field" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                placeholder="Write a takeaway from this game…"
                style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.55, resize: 'vertical' }} />
              <Button variant="secondary" size="sm" disabled={!draft.trim() || saving} onClick={saveNew}
                iconLeft={<Icon name="plus" size={14} />} style={{ flex: 'none' }}>
                Save
              </Button>
            </div>
          </div>
        )}
        {atCap && (
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-faint)' }}>
            This game holds the maximum of {MAX_REFLECTIONS} reflections — delete one to add another.
          </p>
        )}
      </div>
    </Card>
  )
}
