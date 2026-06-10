import type { MatchReport, StandingFocusTask, FocusTaskEval } from '@shared/types'
import { computeMetric } from './metricRegistry'

// Pure. Evaluates a standing focus task against one game → improved / held /
// regressed / not_applicable (the since-last loop). Deterministic: the LLM only
// sets/adjusts tasks; the scoring lives here. Needs only this game + the task's
// previous value, so it does not depend on the deferred cross-game match data.

type Comparator = StandingFocusTask['comparator']

/** Does `value` satisfy the target under the comparator? */
function meets(value: number, comparator: Comparator, target: number): boolean {
  switch (comparator) {
    case '>=': return value >= target
    case '>': return value > target
    case '<=': return value <= target
    case '<': return value < target
    case '==': return value === target
  }
}

/** Did `now` move toward the target relative to `prior` (when neither meets)? */
function movedToward(now: number, prior: number, comparator: Comparator, target: number): boolean {
  if (comparator === '>=' || comparator === '>') return now > prior
  if (comparator === '<=' || comparator === '<') return now < prior
  // '==' — closer to the target is better.
  return Math.abs(now - target) < Math.abs(prior - target)
}

function scopeApplies(task: StandingFocusTask, report: MatchReport): boolean {
  if (task.scope === 'champion') return task.champion === report.core.champion
  if (task.scope === 'role') return task.role === report.core.role
  return true // universal
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

/**
 * Evaluate a standing task against the analysed game. `prior` is the metric's
 * value the last time it was evaluated (or null if never), used to decide
 * improved vs held vs regressed.
 */
export function evaluateTask(
  task: StandingFocusTask,
  report: MatchReport,
  prior: number | null = null
): FocusTaskEval {
  const base = {
    description: task.description,
    metric: task.metric,
    comparator: task.comparator,
    target: String(task.target),
    scope: task.scope
  }

  if (!scopeApplies(task, report)) {
    return { ...base, result: 'not_applicable' }
  }

  const actual = computeMetric(task.metric, report)
  if (actual == null) {
    return { ...base, result: 'not_applicable' }
  }

  const meetsNow = meets(actual, task.comparator, task.target)
  let result: FocusTaskEval['result']
  if (prior == null) {
    result = meetsNow ? 'held' : 'regressed'
  } else {
    const priorMet = meets(prior, task.comparator, task.target)
    if (meetsNow && !priorMet) result = 'improved'
    else if (meetsNow && priorMet) result = 'held'
    else if (!meetsNow && priorMet) result = 'regressed'
    else result = movedToward(actual, prior, task.comparator, task.target) ? 'improved' : 'regressed'
  }

  return { ...base, actual: fmt(actual), result }
}
