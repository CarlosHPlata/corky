import React from 'react'
import { Card } from '../core/Card'
import { Badge } from '../core/Badge'
import { Button } from '../core/Button'
import { Icon } from '../Icon'
import { useStandingTasks } from '../../data/useStandingTasks'
import { useProgress } from '../../data/useProgress'
import type { TaskEvaluationResult } from '@shared/types'

// FocusCard: standing tasks + their track record + working-on + wins.
const RESULT_VISUAL: Record<TaskEvaluationResult, { color: string; label: string; faint?: boolean }> = {
  improved: { color: 'var(--win)', label: 'Improved' },
  held: { color: 'var(--text-muted)', label: 'Held' },
  regressed: { color: 'var(--loss)', label: 'Slipped' },
  not_applicable: { color: 'var(--text-faint)', label: 'Parked', faint: true },
}

function ResultDots({ recent }: { recent: TaskEvaluationResult[] }) {
  const shown = [...recent].reverse()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none' }}>
      {shown.map((r, i) => {
        const v = RESULT_VISUAL[r]
        return (
          <span key={i} title={v.label} style={{
            width: 9, height: 9, borderRadius: '50%', background: v.color,
            opacity: v.faint ? 0.45 : 1,
          }} />
        )
      })}
    </span>
  )
}

function ProgressBlockLabel({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow" style={{ fontSize: 10.5, margin: '16px 0 7px', paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>{children}</div>
}

export function FocusCard({ onOpen, latestMatchId }: { onOpen: (matchId: string) => void; latestMatchId?: string }) {
  const { tasks, loading: tasksLoading } = useStandingTasks()
  const { progress, loading: progressLoading } = useProgress()
  const loading = tasksLoading || progressLoading
  const hasTasks = tasks.length > 0
  const hasWorking = !!progress && progress.working.length > 0
  const hasWins = !!progress && progress.wins.length > 0

  // join standing tasks with their progress history by id
  const progressByTaskId = Object.fromEntries((progress?.tasks ?? []).map(t => [t.taskId, t]))

  return (
    <Card accent="objective" padding={18}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, marginBottom: hasTasks ? 14 : 0 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--objective-soft)' }}>
          <Icon name="crosshair" size={20} style={{ color: 'var(--violet-400)' }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.15 }}>Focus</span>
            {hasTasks && <Badge intent="objective" dot>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</Badge>}
            {!!progress && progress.analysedGames > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)' }}>
                {progress.analysedGames} {progress.analysedGames === 1 ? 'game' : 'games'} analysed
              </span>
            )}
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: '4px 0 0' }}>
            {hasTasks
              ? 'Your standing focus. Corky checks these after each game and keeps them current.'
              : loading
                ? 'Loading…'
                : 'No focus tasks yet. Analyse a game and Corky sets your focus here.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => latestMatchId && onOpen(latestMatchId)}
          disabled={!latestMatchId}
          iconRight={<Icon name="chevron-right" size={15} />} style={{ flex: 'none' }}>
          Last report
        </Button>
      </div>

      {hasTasks && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {tasks.map((t, i) => {
            const hist = progressByTaskId[t.id]
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '9px 2px',
                borderBottom: i === tasks.length - 1 && !hasWorking && !hasWins ? 'none' : '1px solid var(--border-subtle)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{t.metric}</div>
                </div>
                {hist
                  ? hist.recent.length === 0
                    ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', flex: 'none' }}>not yet measured</span>
                    : <ResultDots recent={hist.recent} />
                  : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', flex: 'none' }}>pending</span>}
                {!!hist && hist.streak >= 2 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--win)', flex: 'none' }}>
                    {hist.streak} in a row
                  </span>
                )}
              </div>
            )
          })}

          {hasWorking && (
            <div>
              <ProgressBlockLabel>Working on</ProgressBlockLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {progress!.working.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon name="crosshair" size={13} style={{ color: 'var(--warn)', flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{w.statement}</span>
                    <Badge intent="warn">×{w.occurrences}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasWins && (
            <div>
              <ProgressBlockLabel>Wins</ProgressBlockLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {progress!.wins.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon name="check" size={13} style={{ color: 'var(--win)', flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{w.statement}</span>
                    {w.kind === 'milestone' && <Badge intent="win">milestone</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
