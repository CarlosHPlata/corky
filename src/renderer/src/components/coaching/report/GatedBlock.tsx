import { Icon } from '../../Icon'
import { Button } from '../../core/Button'

// Inline "run analysis to see this" placeholder — stands in for any AI-written block.
export function GatedBlock({ title, hint, analyzing, onAnalyze }: { title: string; hint: string; analyzing: boolean; onAnalyze: () => void }) {
  return (
    <div className="ck-gated">
      <span className="ck-gated__icon"><Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={19} className={analyzing ? 'ck-spin' : ''} /></span>
      <div className="ck-gated__body">
        <div className="ck-gated__dots">· · · · ·</div>
        <div className="ck-gated__title">{title}</div>
        <div className="ck-gated__hint">{hint}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={onAnalyze} disabled={analyzing}
        iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={14} className={analyzing ? 'ck-spin' : ''} />}
        style={{ flex: 'none' }}>
        {analyzing ? 'Analysing…' : 'Run analysis'}
      </Button>
    </div>
  )
}
