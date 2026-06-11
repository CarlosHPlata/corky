import { Card } from '../../core/Card'
import { Button } from '../../core/Button'
import { Icon } from '../../Icon'

// Controls — the primary report actions, kept in reach while the report scrolls.
export function ReportControls({ analyzed, analyzing, onAnalyze, pinned, onTogglePin, onAddReflection }: {
  analyzed: boolean; analyzing: boolean; onAnalyze: () => void
  pinned: boolean; onTogglePin: () => void; onAddReflection: () => void
}) {
  return (
    <Card padding={13}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {!analyzed
          ? <Button variant="primary" block onClick={onAnalyze} disabled={analyzing}
              iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={15} className={analyzing ? 'ck-spin' : ''} />}>
              {analyzing ? 'Analysing…' : 'Analyze this match'}
            </Button>
          : <div className="ck-ctrl-status">
              <Icon name="sparkles" size={15} style={{ color: 'var(--gold-400)', flex: 'none' }} />
              <span className="ck-ctrl-status__t">Analysis complete</span>
              <Icon name="check" size={15} style={{ color: 'var(--win)', flex: 'none', marginLeft: 'auto' }} />
            </div>}
        <Button variant="secondary" block onClick={onTogglePin}
          iconLeft={<Icon name="bookmark" size={15} style={pinned ? { color: 'var(--gold-400)' } : undefined} />}>
          {pinned ? 'Saved to your games' : 'Save this game'}
        </Button>
        <Button variant="secondary" block onClick={onAddReflection}
          iconLeft={<Icon name="plus" size={15} />}>
          Add a reflection
        </Button>
      </div>
    </Card>
  )
}
