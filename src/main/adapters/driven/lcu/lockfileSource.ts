import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { parseLockfile, type LockfileInfo } from '../../../domain/identity/lockfile'

const execFileAsync = promisify(execFile)

/**
 * Locates and reads the running League client's lockfile (spec 006), then hands
 * the string to the pure `parseLockfile`. Candidate resolution per read:
 *
 *   1. `CORKY_LEAGUE_LOCKFILE` env override (dev/testing).
 *   2. The last path that worked (cached).
 *   3. The default install path (a cheap file read).
 *   4. The `--install-directory` of the running `LeagueClientUx.exe` — handles
 *      custom install locations, but throttled so we don't spawn a probe every
 *      poll while no client is running.
 *
 * When the file is gone (client closed), `read()` returns null → disconnected.
 */
const DEFAULT_LOCKFILE = join('C:\\Riot Games\\League of Legends', 'lockfile')
const DISCOVERY_THROTTLE_MS = 15_000

export class LockfileSource {
  private cachedPath: string | null = null
  private lastDiscovery = 0

  async read(): Promise<LockfileInfo | null> {
    const override = process.env.CORKY_LEAGUE_LOCKFILE
    if (override) return this.tryRead(override)

    // The path that worked last time (custom install, already discovered).
    if (this.cachedPath) {
      const cached = await this.tryRead(this.cachedPath)
      if (cached) return cached
      this.cachedPath = null
    }

    // Cheap: the default install location (one failed file read when no client).
    const fromDefault = await this.tryRead(DEFAULT_LOCKFILE)
    if (fromDefault) {
      this.cachedPath = DEFAULT_LOCKFILE
      return fromDefault
    }

    // Expensive: discover a custom install dir from the process — throttled so
    // an absent client doesn't spawn a probe on every poll.
    const now = Date.now()
    if (now - this.lastDiscovery >= DISCOVERY_THROTTLE_MS) {
      this.lastDiscovery = now
      const discovered = await this.discoverFromProcess()
      if (discovered) {
        const info = await this.tryRead(discovered)
        if (info) {
          this.cachedPath = discovered
          return info
        }
      }
    }
    return null
  }

  private async tryRead(path: string): Promise<LockfileInfo | null> {
    try {
      return parseLockfile(await readFile(path, 'utf8'))
    } catch {
      return null
    }
  }

  /** Best-effort: read the LeagueClientUx command line for --install-directory. */
  private async discoverFromProcess(): Promise<string | null> {
    if (process.platform !== 'win32') return null
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine"
        ],
        { timeout: 3000, windowsHide: true }
      )
      const match = /--install-directory=("([^"]+)"|(\S+))/.exec(stdout)
      const dir = match?.[2] ?? match?.[3]
      return dir ? join(dir, 'lockfile') : null
    } catch {
      return null
    }
  }
}
