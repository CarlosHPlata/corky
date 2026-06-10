import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import type { EvidenceRef } from '@shared/types'

// "Ask Corky about this" — the touchable-report affordance (spec 004 chat refs).
// Any evidence element on the match report can carry one of these; activating it
// drops the element's EvidenceRef into the coach chat composer as a pending chip.
//
//  • AskBadge — the small chat-bubble button itself. Dropped into a consistent
//    corner of a referenceable element (timeline pins, death rows, stat tiles).
//    Stays mounted and fades with `visible` so its brief ✓-flash survives hover
//    churn; flashes only when the ref was actually added (duplicates and the
//    5-ref cap are silent no-ops, so the feedback never lies).
//  • Askable — a hover wrapper for plain blocks (stat tiles): shows the badge
//    top-right on hover, and right-click anywhere on the block adds the ref
//    directly (one action ⇒ no menu).

/** Adds a pending ref; returns false when it was a no-op (duplicate / cap). */
export type AddRef = (ref: EvidenceRef) => boolean

export function AskBadge({ evidence, onAsk, visible = true, size = 18, style, title = 'Ask Corky about this' }: {
  evidence: EvidenceRef
  onAsk: AddRef
  /** Fades (and disables) the badge rather than unmounting it. */
  visible?: boolean
  size?: number
  style?: React.CSSProperties
  title?: string
}) {
  const [flash, setFlash] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current) }, [])

  function add(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    if (!onAsk(evidence)) return
    setFlash(true)
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFlash(false), 900)
  }

  const show = visible || flash
  return (
    <span
      role="button"
      tabIndex={-1}
      title={title}
      aria-label={title}
      onClick={add}
      onContextMenu={add}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        width: size, height: size, borderRadius: '50%', flex: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: flash ? 'var(--win-soft)' : 'var(--accent-soft)',
        border: `1px solid ${flash ? 'rgba(33,208,163,0.55)' : 'rgba(242,179,61,0.45)'}`,
        color: flash ? 'var(--win)' : 'var(--gold-400)',
        cursor: 'pointer', boxSizing: 'border-box',
        opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none',
        transition: 'opacity var(--dur-fast) var(--ease-out)',
        ...style,
      }}
    >
      <Icon name={flash ? 'check' : 'message-circle'} size={Math.max(10, Math.round(size * 0.62))} strokeWidth={2} />
    </span>
  )
}

export function Askable({ evidence, onAsk, children, style, className }: {
  evidence: EvidenceRef
  /** When absent the wrapper is inert — children render untouched. */
  onAsk?: AddRef
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  const [hover, setHover] = useState(false)
  if (!onAsk) {
    return <div className={className} style={style}>{children}</div>
  }
  return (
    <div
      className={className}
      style={{ position: 'relative', ...style }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); onAsk(evidence) }}
    >
      {children}
      <AskBadge
        evidence={evidence}
        onAsk={onAsk}
        visible={hover}
        style={{ position: 'absolute', top: -2, right: -2, zIndex: 3 }}
      />
    </div>
  )
}
