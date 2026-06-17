import { Icon } from './Icon'

/**
 * First-run onboarding (spec 006, US3). Shown when there is no live player and
 * nothing cached (`source === 'none'`): Corky cannot guess who you are, so it
 * asks you to open and log into the League client rather than showing a wrong
 * or placeholder identity. Once you log in, the `identity:changed` push swaps
 * this out automatically.
 */
export function ConnectClientPanel(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 18,
        padding: '88px 24px',
        maxWidth: 560,
        margin: '0 auto'
      }}
    >
      <span
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--gold-400)'
        }}
      >
        <Icon name="swords" size={30} strokeWidth={2} />
      </span>

      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 22,
          color: 'var(--text-primary)'
        }}
      >
        Open League to get started
      </div>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-muted)',
          margin: 0
        }}
      >
        Corky reads who you are straight from your League of Legends client.
        Open the client and log in — Corky will detect you automatically and load
        your games, rank and coaching. Nothing to type or configure.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--text-muted)',
          background: 'var(--win-soft)',
          border: '1px solid rgba(33,208,163,0.2)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <Icon name="shield" size={14} style={{ color: 'var(--win)' }} />
        <span>Corky only ever reads what the game already shows you.</span>
      </div>
    </div>
  )
}
