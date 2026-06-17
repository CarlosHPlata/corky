import type { ClientStatus } from '@shared/types'

/**
 * Compact connection/identity pill (spec 006). Shows who Corky is coaching and
 * where that identity came from: live client, cached last session, or a degraded
 * read. The `none` (onboarding) state is handled by `ConnectClientPanel` at the
 * screen level, so this renders nothing then.
 */
export function ClientStatusChip({
  status
}: {
  status: ClientStatus | null | undefined
}): React.ReactElement | null {
  if (!status || status.source === 'none' || !status.player) return null

  const riotId = `${status.player.gameName}#${status.player.tagLine}`

  let dot: string
  let label: string
  let title: string
  switch (status.connection) {
    case 'connected':
      dot = 'var(--win)'
      label = `Connected · ${riotId}`
      title = 'Reading your live League client'
      break
    case 'unreadable':
      dot = 'var(--gold-400)'
      label = `${riotId} · client unreadable`
      title = "Client is open but Corky couldn't read it — showing your last session"
      break
    case 'loggedOut':
    case 'disconnected':
    default:
      dot = 'var(--text-faint)'
      label = `${riotId} · last session`
      title = 'Client not detected — showing your last session'
      break
  }

  return (
    <div
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 11px',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--text-muted)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-pill, 999px)',
        whiteSpace: 'nowrap'
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flex: 'none',
          background: dot,
          boxShadow: status.connection === 'connected' ? '0 0 6px var(--win)' : 'none'
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </div>
  )
}
