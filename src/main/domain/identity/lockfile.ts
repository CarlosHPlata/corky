/**
 * Pure parsing of the League client lockfile string (spec 006).
 *
 * The running client writes `<install>/lockfile` containing a single line:
 *   `name:pid:port:password:protocol`  e.g. `LeagueClient:12345:54321:abc:https`
 *
 * This module is pure (no filesystem). The adapter (`lockfileSource.ts`) locates
 * and reads the file; this only turns the string into structured fields, or
 * `null` when the string is malformed.
 */
export interface LockfileInfo {
  name: string
  pid: number
  port: number
  password: string
  protocol: string
}

export function parseLockfile(content: string): LockfileInfo | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  const parts = trimmed.split(':')
  if (parts.length !== 5) return null

  const [name, pidStr, portStr, password, protocol] = parts
  const pid = Number(pidStr)
  const port = Number(portStr)
  if (!Number.isInteger(pid) || !Number.isInteger(port)) return null
  if (!name || !password || !protocol) return null

  return { name, pid, port, password, protocol }
}
