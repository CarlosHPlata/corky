import type { BenchmarkReference } from '../../domain/benchmark'

/**
 * Narrow, per-feature port: resolves the benchmark reference for a champion/role
 * at a rank. Returns null on miss/unavailability so the caller falls back to the
 * general benchmark — the analysis must never fail because the source is down.
 * Implemented by an adapter that delegates to the reusable OpggMcpClient.
 */
export interface BenchmarkDataSource {
  getChampionBenchmark(input: {
    champion: string
    role: string
    tier: string | null
  }): Promise<BenchmarkReference | null>
}
