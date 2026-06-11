import { FocusTask } from '../FocusTask'
import { Icon } from '../../Icon'
import { Askable, type AddRef } from '../AskRef'
import { GatedBlock } from './GatedBlock'
import type { TasksOutput } from '@shared/types'

// Next-game focus — AI read, gated. The standing tasks are touchable (spec 005
// US4): click one to ask Corky about it — the ref grounds to the task's exact
// rule in the main process.
export function NextGameFocus({ tasks, analyzing, onAnalyze, onAsk }: {
  tasks: TasksOutput | null; analyzing: boolean; onAnalyze: () => void; onAsk?: AddRef
}) {
  if (!tasks) {
    return <GatedBlock title="Focus tasks for your next game"
      hint="Analysis turns this game’s mistakes into a short, checkable to-do list."
      analyzing={analyzing} onAnalyze={onAnalyze} />
  }
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.standing.map((t) => (
          <Askable key={t.id} onAsk={onAsk}
            evidence={{ id: `task:${t.id}`, kind: 'task', label: t.description }}>
            <FocusTask description={t.description} metric={t.metric} comparator={t.comparator} target={t.target} scope={t.scope} result="pending" />
          </Askable>
        ))}
      </div>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)' }} />
        Corky will check these automatically after your next game.
      </p>
    </>
  )
}
