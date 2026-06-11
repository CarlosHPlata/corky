import { Card } from '../../core/Card'
import { Badge } from '../../core/Badge'
import { FocusTask } from '../FocusTask'
import { GatedBlock } from './GatedBlock'
import type { TasksOutput } from '@shared/types'

// Since last game — AI read, gated. Checks this game against the tasks Corky set
// last time, and tallies how many held.
export function SinceLastGame({ tasks, analyzing, onAnalyze }: {
  tasks: TasksOutput | null; analyzing: boolean; onAnalyze: () => void
}) {
  if (!tasks) {
    return <GatedBlock title="How you did on last game’s focus tasks"
      hint="Analysis checks this game against the tasks Corky set you last time."
      analyzing={analyzing} onAnalyze={onAnalyze} />
  }
  if (tasks.firstTime) {
    return (
      <Card padding={16}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>
          This is your first analysed game — Corky starts tracking your focus tasks from here.
        </span>
      </Card>
    )
  }
  const sinceWins = tasks.sinceLast.filter(t => t.result === 'improved' || t.result === 'held').length
  const sinceApplicable = tasks.sinceLast.filter(t => t.result !== 'not_applicable').length
  return (
    <Card padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>
          You held <strong style={{ color: 'var(--text-primary)' }}>{sinceWins} of {sinceApplicable}</strong> focus tasks from last game.
        </span>
        <Badge intent={sinceWins >= sinceApplicable ? 'win' : 'warn'} style={{ marginLeft: 'auto' }}>{sinceWins >= sinceApplicable ? 'On track' : 'Slipped one'}</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.sinceLast.map((t, i) => <FocusTask key={i} {...t} />)}
      </div>
    </Card>
  )
}
