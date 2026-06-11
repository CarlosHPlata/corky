import { VerdictCard } from '../VerdictCard'
import { Badge } from '../../core/Badge'
import { Button } from '../../core/Button'
import { Icon } from '../../Icon'
import { formatDuration, queueLabel } from '../../../utils/format'
import type { MatchCore, FramingOutput, ReviewOutput } from '@shared/types'

// Verdict — Corky's read, gated. The card frame, W/L and identity are facts;
// the headline tag, cohort badge and prose are the model's read (passes 1 & 3).
export function ReportVerdict({ core, review, framing, analyzing, onAnalyze }: {
  core: MatchCore; review: ReviewOutput | null; framing: FramingOutput | null
  analyzing: boolean; onAnalyze: () => void
}) {
  const analyzed = !!review
  return (
    <VerdictCard result={core.win ? 'win' : 'loss'} champion={core.champion}
      duration={formatDuration(core.durationSec)} queue={queueLabel(core.queue)}
      eyebrow={analyzed ? 'Verdict' : 'Not analysed yet'}
      tags={analyzed && review
        ? <>{framing && <Badge intent={framing.headlineTagIntent}>{framing.headlineTag}</Badge>}<Badge intent="neutral">{review.cohort}</Badge></>
        : <Button variant="primary" size="sm" onClick={onAnalyze} disabled={analyzing}
            iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={15} className={analyzing ? 'ck-spin' : ''} />}>
            {analyzing ? 'Analysing…' : 'Analyze this match'}
          </Button>}>
      {analyzed && review
        ? <>{review.verdict.lead} {review.verdict.gild && <em>{review.verdict.gild}</em>}</>
        : <span style={{ color: 'var(--text-faint)' }}>
            <span className="ck-inline-dots" style={{ fontSize: 22 }}>· · · · ·</span>
            <span style={{ display: 'block', marginTop: 8, fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}>
              Run analysis to see why this game went the way it did. Your scoreline, matchup, gold timeline and death map are ready below.
            </span>
          </span>}
    </VerdictCard>
  )
}
