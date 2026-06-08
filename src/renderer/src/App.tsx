import React, { useState, useEffect } from 'react'
import type { MatchSummary } from '../../shared/types'

declare global {
  interface Window {
    api: import('../../shared/types').IpcApi
  }
}

export default function App(): React.ReactElement {
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getMatchList().then(setMatches).catch(console.error)
  }, [])

  async function handleSync(): Promise<void> {
    setSyncing(true)
    setError(null)
    try {
      await window.api.syncMatches(20)
      const updated = await window.api.getMatchList()
      setMatches(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 800 }}>
      <h1>Corky</h1>
      <p>Your personal Rift coach.</p>

      <button onClick={handleSync} disabled={syncing}>
        {syncing ? 'Syncing…' : 'Sync last 20 games'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {matches.length === 0 ? (
        <p>No matches synced yet. Click "Sync" to fetch your recent games.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Champion</th>
              <th>Result</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.matchId}>
                <td>{m.champion}</td>
                <td style={{ color: m.win ? 'green' : 'red' }}>{m.win ? 'Win' : 'Loss'}</td>
                <td>{Math.round(m.gameDuration / 60)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
