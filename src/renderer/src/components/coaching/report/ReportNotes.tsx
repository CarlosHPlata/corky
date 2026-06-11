import React from 'react'
import { Card } from '../../core/Card'
import { Icon } from '../../Icon'

// "Corky doesn't have this stored" — shown where a factual section can't be built
// because the underlying timeline isn't available for the game.
export function UnavailableNote({ what }: { what: string }) {
  return (
    <Card padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
        <Icon name="history" size={15} style={{ color: 'var(--text-faint)', flex: 'none' }} />
        {what} isn’t available for this game — Corky doesn’t have its detailed timeline stored.
      </div>
    </Card>
  )
}

// A centered full-bleed message — loading / error / not-found states for the report.
export function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}
