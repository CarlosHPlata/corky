import React from 'react'

// A centred muted note — used for the home loading / empty placeholders.
export function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}
