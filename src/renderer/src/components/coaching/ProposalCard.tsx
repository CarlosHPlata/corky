import React from 'react'
import { Button } from '../core/Button'
import { Badge } from '../core/Badge'
import { Icon } from '../Icon'
import { FocusTask } from './FocusTask'
import { EvidenceChip } from './EvidenceChip'
import type { ActionProposal, EvidenceRef, StandingFocusTask } from '@shared/types'

// Corky's confirm-first proposal card (spec 005). Rendered inline in the chat
// transcript from `turn.proposal`. Nothing persists from model output: the
// card shows the FULL resulting state and the player disposes — Accept applies
// it via ResolveProposal, Reject discards and informs the coach. A card
// resolves exactly once; its resolved state persists with the transcript.

const KIND_TITLE: Record<ActionProposal['payload']['kind'], string> = {
  update_tasks: 'Proposed focus tasks',
  create_reflection: 'Proposed reflection',
  update_reflection: 'Proposed reflection edit',
  delete_reflection: 'Proposed reflection removal'
}

function refChipKind(r: EvidenceRef): 'data' | 'death' | 'objective' {
  if (r.id.startsWith('marker:death') || r.id.startsWith('marker:swing')) return 'death'
  if (r.id.startsWith('marker:objective')) return 'objective'
  return 'data'
}

function refLabel(r: EvidenceRef): string {
  return r.label ?? r.id.replace(/^(stat|marker|task):/, '').replace(/[_#]/g, ' ').trim()
}

/** The descriptions of tasks being retired, looked up from the proposal set's
 * complement: the card only knows ids, so callers pass current descriptions. */
export interface RetiringTask {
  id: string
  description: string
}

export function ProposalCard({ proposal, retiring = [], busy = false, onAccept, onReject }: {
  proposal: ActionProposal
  /** Descriptions of the explicitly-retired tasks (update_tasks only). */
  retiring?: RetiringTask[]
  /** Disables actions while a resolve call is in flight. */
  busy?: boolean
  onAccept?: () => void
  onReject?: () => void
}) {
  const { payload, resolution } = proposal
  const pending = resolution === 'pending'

  return (
    <div className={`ckp-card ckp-card--${resolution}`} data-resolution={resolution}>
      <div className="ckp-head">
        <span className="ckp-head__icon">
          <Icon name={payload.kind === 'update_tasks' ? 'crosshair' : 'file-text'} size={14} />
        </span>
        <span className="ckp-head__title">{KIND_TITLE[payload.kind]}</span>
        {resolution === 'accepted' && <Badge intent="win" style={{ marginLeft: 'auto' }}>Applied</Badge>}
        {resolution === 'rejected' && <Badge intent="neutral" style={{ marginLeft: 'auto' }}>Dismissed</Badge>}
        {resolution === 'stale' && <Badge intent="warn" style={{ marginLeft: 'auto' }}>Out of date</Badge>}
      </div>

      <div className="ckp-body">
        {payload.kind === 'update_tasks' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payload.set.map((t: StandingFocusTask) => (
                <FocusTask key={t.id} description={t.description} metric={t.metric}
                  comparator={t.comparator} target={t.target} scope={t.scope} result="pending" />
              ))}
            </div>
            {retiring.length > 0 && (
              <p className="ckp-retiring">
                <Icon name="x" size={12} />
                Retiring: {retiring.map((t) => t.description).join(' · ')}
              </p>
            )}
          </>
        )}

        {payload.kind !== 'update_tasks' && payload.kind !== 'delete_reflection' && (
          <>
            <p className="ckp-reflection">{payload.text}</p>
            {payload.refs.length > 0 && (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {payload.refs.map((r) => (
                  <EvidenceChip key={r.id} kind={refChipKind(r)} refId={r.id} truncate title={r.id}
                    style={{ fontSize: 10.5, padding: '1px 6px' }}>
                    {refLabel(r)}
                  </EvidenceChip>
                ))}
              </span>
            )}
          </>
        )}

        {payload.kind === 'delete_reflection' && (
          <p className="ckp-reflection ckp-reflection--delete">
            Remove the reflection from this game's list.
          </p>
        )}
      </div>

      {pending ? (
        <div className="ckp-actions">
          <Button variant="primary" size="sm" disabled={busy} onClick={onAccept}
            iconLeft={<Icon name="check" size={14} />}>
            Accept
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onReject}>
            Reject
          </Button>
        </div>
      ) : resolution === 'stale' ? (
        <p className="ckp-stale-hint">Things changed since this was drafted — ask Corky again.</p>
      ) : null}
    </div>
  )
}
