import React from 'react'

export function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{children}</p>
}
