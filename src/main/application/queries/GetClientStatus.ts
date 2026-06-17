import type { ClientStatus } from '@shared/types'
import type { IdentityService } from '../services/Identity/IdentityService'

/**
 * Read-only query for the renderer status chip + onboarding gate (spec 006).
 * A cheap read of the service's cached status — no client round-trip.
 */
export class GetClientStatus {
  constructor(private readonly identity: IdentityService) {}

  execute(): ClientStatus {
    return this.identity.getStatus()
  }
}
