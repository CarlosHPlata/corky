import { useEffect, useState } from 'react'
import type { ClientStatus } from '@shared/types'

export interface UseClientStatus {
  status: ClientStatus | null
}

/**
 * Live connection/identity status for the status chip + onboarding gate (spec
 * 006). Reads the current status on mount, then stays current via the
 * `identity:changed` push — so logging in/out updates the UI without a refresh.
 */
export function useClientStatus(): UseClientStatus {
  const [status, setStatus] = useState<ClientStatus | null>(null)

  useEffect(() => {
    let alive = true
    window.api
      .getClientStatus()
      .then((s) => {
        if (alive) setStatus(s)
      })
      .catch(() => {
        /* leave null — the app falls back to its loading/empty states */
      })

    const unsubscribe = window.api.onIdentityChanged((s) => setStatus(s))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return { status }
}
