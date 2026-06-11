import { Card } from '../../core/Card'
import { Badge } from '../../core/Badge'
import { Icon } from '../../Icon'
import { GatedBlock } from './GatedBlock'
import { evidenceLabel } from './format'
import type { ReviewOutput } from '@shared/types'

// Overall analysis — the heavy read (pass 3): why won/lost + what to improve.
export function OverallAnalysis({ review, win, analyzing, onAnalyze }: {
  review: ReviewOutput | null; win: boolean; analyzing: boolean; onAnalyze: () => void
}) {
  if (!review) {
    return <GatedBlock title="Corky’s read on why this game went the way it did"
      hint="The heavy analysis: what won or lost the game, and the one thing to change."
      analyzing={analyzing} onAnalyze={onAnalyze} />
  }
  return (
    <Card padding={18}>
      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 8, color: review.confidence === 'provisional' ? 'var(--warn)' : 'var(--gold-400)' }}>
        {win ? 'Why you won' : 'Why you lost'} · {review.cohort}{review.confidence === 'provisional' ? ' · provisional' : ''}
      </div>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-primary)', margin: '0 0 14px' }}>
        {review.verdict.lead} {review.verdict.gild && <em style={{ color: 'var(--text-secondary)' }}>{review.verdict.gild}</em>}
      </p>
      {review.improve && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(242,179,61,0.08)', borderLeft: '2px solid var(--gold-400)', marginBottom: review.claims.length ? 14 : 0 }}>
          <Icon name="crosshair" size={15} style={{ color: 'var(--gold-400)', flex: 'none', marginTop: 2 }} />
          <div>
            <div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 3 }}>What to improve</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{review.improve}</div>
          </div>
        </div>
      )}
      {review.claims.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {review.claims.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)' }}>
              <Icon name="check" size={13} style={{ color: 'var(--gold-400)', flex: 'none', alignSelf: 'center' }} />
              <span style={{ flex: 1 }}>{c.text}</span>
              <Badge intent="neutral">{evidenceLabel(c.ref)}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
