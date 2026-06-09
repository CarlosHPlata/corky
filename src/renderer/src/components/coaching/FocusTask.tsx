import React from 'react'

type TaskResult = 'improved' | 'held' | 'regressed' | 'not_applicable' | 'pending'

interface FocusTaskProps {
  description: string
  metric?: string
  comparator?: string
  target?: string | number
  scope?: string
  actual?: string | number
  result?: TaskResult
  className?: string
}

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const CROSS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const DOT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
)

const ICONS: Record<TaskResult, React.ReactNode> = {
  improved: CHECK, held: CHECK, regressed: CROSS, not_applicable: DOT, pending: DOT,
}
const LABEL: Record<TaskResult, string> = {
  improved: 'Improved', held: 'Held', regressed: 'Slipped', not_applicable: 'Parked', pending: 'This game',
}

export function FocusTask({
  description, metric, comparator, target, scope, actual, result = 'pending', className = '',
}: FocusTaskProps) {
  const rule = (metric || comparator || target != null)
    ? `${metric ?? ''} ${comparator ?? ''} ${target ?? ''}`.trim() : null
  const cls = ['ck-task', `r-${result}`, className].filter(Boolean).join(' ')
  return (
    <div className={cls} data-result={result}>
      <span className="ck-task__check">{ICONS[result]}</span>
      <div className="ck-task__main">
        <div className="ck-task__desc">{description}</div>
        {(rule || scope) && (
          <div className="ck-task__metric">
            {rule && <span className="ck-task__rule">{rule}</span>}
            {scope && <span className="ck-task__scope">{scope}</span>}
          </div>
        )}
      </div>
      <div className="ck-task__outcome">
        {actual != null && <span className="ck-task__actual">{actual}</span>}
        <span className="ck-task__verdict">{LABEL[result]}</span>
      </div>
    </div>
  )
}
