import { Card } from '../../core/Card'
import { Badge } from '../../core/Badge'
import { Icon } from '../../Icon'
import type { ProgressSummary } from '@shared/types'

// What Corky's working on — the recurring patterns/weaknesses the coach is still
// tracking ACROSS games (player-level semantic memory, not this game). Mirrors the
// Home "Progress" card's `working` slice; deterministic, no model call, so it shows
// even before this game is analysed. Renders nothing until something is tracked.
export function WorkingOn({ working }: { working: ProgressSummary['working'] }) {
  if (!working.length) return null
  return (
    <Card padding={18}>
      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 10, color: 'var(--text-muted)' }}>
        What Corky keeps seeing across your recent games
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {working.map((w, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-secondary)' }}>
            <Icon name="eye" size={14} style={{ color: 'var(--gold-400)', flex: 'none', alignSelf: 'center' }} />
            <span style={{ flex: 1 }}>{w.statement}</span>
            <Badge intent={w.kind === 'weakness' ? 'warn' : 'neutral'}>{w.kind} · seen {w.occurrences}×</Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}
