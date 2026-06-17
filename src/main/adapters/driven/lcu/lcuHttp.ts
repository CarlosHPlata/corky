import { request } from 'node:https'
import { Agent } from 'node:https'
import type { LockfileInfo } from '../../../domain/identity/lockfile'

/**
 * Tiny loopback HTTPS helper for the LCU (spec 006). The League client serves
 * its API on `https://127.0.0.1:<port>` with a self-signed certificate and HTTP
 * Basic auth (`riot:<password>` from the lockfile). The cert allowance is scoped
 * to this agent only — we never relax TLS globally.
 *
 * The lockfile password stays in the main process (Principle VI): it is used
 * only to build the Authorization header here and never leaves this layer.
 */
const insecureAgent = new Agent({ rejectUnauthorized: false })

export interface LcuResponse {
  status: number
  data: unknown
}

export function lcuGet(info: LockfileInfo, path: string, timeoutMs = 2500): Promise<LcuResponse> {
  const auth = 'Basic ' + Buffer.from(`riot:${info.password}`).toString('base64')

  return new Promise<LcuResponse>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: info.port,
        path,
        method: 'GET',
        agent: insecureAgent,
        headers: { Authorization: auth, Accept: 'application/json' },
        timeout: timeoutMs
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          let data: unknown = null
          try {
            data = body ? JSON.parse(body) : null
          } catch {
            data = null
          }
          resolve({ status: res.statusCode ?? 0, data })
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('LCU request timed out')))
    req.on('error', reject)
    req.end()
  })
}
