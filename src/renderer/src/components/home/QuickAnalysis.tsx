import { Card } from '../core/Card'
import { Badge } from '../core/Badge'
import { Button } from '../core/Button'
import { EvidenceChip } from '../coaching/EvidenceChip'
import { Icon } from '../Icon'
import { useQuickAnalysis } from '../../data/useQuickAnalysis'
import type { SessionInsight, InsightLeak, BenchmarkBasis } from '@shared/types'
import { relativeTime } from '../../utils/format'

// QuickAnalysis: on-demand LLM session coach.
const LEAK_VISUAL: Record<InsightLeak, { icon: string; tone: string; chip: 'data' | 'death' | 'objective' }> = {
  deaths: { icon: 'skull', tone: 'var(--loss)', chip: 'death' },
  farming: { icon: 'coins', tone: 'var(--gold-400)', chip: 'data' },
  lead_conversion: { icon: 'flag', tone: 'var(--warn)', chip: 'objective' },
  champion_pool: { icon: 'swords', tone: 'var(--text-secondary)', chip: 'data' },
  consistency: { icon: 'bar-chart-3', tone: 'var(--gold-400)', chip: 'data' },
  tempo: { icon: 'clock', tone: 'var(--text-secondary)', chip: 'objective' },
}

function basisLabel(b: BenchmarkBasis): string {
  return b === 'champion_patch'
    ? 'measured vs this champion’s benchmark, current patch'
    : b === 'rank_general'
      ? 'measured vs your rank'
      : 'measured vs a general benchmark'
}

function InsightRow({ it, last }: { it: SessionInsight; last: boolean }) {
  const v = LEAK_VISUAL[it.leak]
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 2px',
      borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <Icon name={v.icon} size={17} style={{ color: v.tone, flex: 'none', marginTop: 2 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{it.headline}</span>
          {it.confidence === 'provisional' && <Badge intent="warn">provisional</Badge>}
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{it.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, flexWrap: 'wrap' }}>
          <EvidenceChip kind={v.chip} truncate title={it.evidence}>{it.evidence}</EvidenceChip>
          {it.benchmarkBasis && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
              {basisLabel(it.benchmarkBasis)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export function QuickAnalysis() {
  const { state, result, error, run } = useQuickAnalysis()
  const running = state === 'running'
  const isStale = !!result && !result.noData && Date.now() - result.generatedAt > STALE_AFTER_MS
  const buttonLabel = running
    ? 'Reading…'
    : state === 'error'
      ? 'Try again'
      : state === 'done' || state === 'noData'
        ? 'Re-run'
        : 'Quick analysis'

  return (
    <Card accent="accent" padding={18}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
          <Icon name="sparkles" size={20} style={{ color: 'var(--gold-400)' }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.15 }}>Quick analysis</div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: '4px 0 0' }}>
            A coach’s read of your recent games — your real leaks, not the stats you can already see.
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={running} onClick={() => run()}
          iconLeft={<Icon name={running ? 'refresh-cw' : 'sparkles'} size={15} className={running ? 'ck-spin' : ''} />}>
          {buttonLabel}
        </Button>
      </div>

      {state === 'error' && (
        <div className="ck-fade" style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--loss-soft)', border: '1px solid rgba(255,87,101,0.28)' }}>
          <Icon name="shield" size={15} style={{ color: 'var(--loss)', flex: 'none' }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--loss)' }}>{error}</span>
        </div>
      )}

      {state === 'noData' && (
        <div className="ck-fade" style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <Icon name="history" size={15} style={{ color: 'var(--text-faint)', flex: 'none' }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
            Not enough games yet to read a pattern. Play a few ranked games and sync — Corky won’t guess from too little.
          </span>
        </div>
      )}

      {state === 'done' && result && (
        <div className="ck-fade" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
          {isStale && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, margin: '8px 0 6px', padding: '9px 12px',
              borderRadius: 'var(--radius-md)', background: 'var(--warn-soft)', border: '1px solid rgba(255,138,61,0.28)',
            }}>
              <Icon name="clock" size={14} style={{ color: 'var(--warn)', flex: 'none' }} />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                This read is from {relativeTime(result.generatedAt)} — you’ve likely played since. Re-run it for an up-to-date analysis.
              </span>
            </div>
          )}
          {result.insights.map((it, i) => (
            <InsightRow key={i} it={it} last={i === result.insights.length - 1} />
          ))}
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="shield" size={13} style={{ color: 'var(--text-faint)' }} />
            Open any game for the full coaching report and turning points.
          </p>
        </div>
      )}
    </Card>
  )
}
