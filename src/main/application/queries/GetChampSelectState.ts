import type { ChampSelectState } from '@shared/types'
import type { ChampSelectService } from '../services/ChampSelect/ChampSelectService'

/**
 * Query: the current live champ-select state for first paint (spec 007), or null
 * when not in champ select. Cheap read of the service's cached state — the live
 * updates arrive via the `champSelect:changed` push.
 */
export class GetChampSelectState {
  constructor(private readonly service: ChampSelectService) {}

  execute(): ChampSelectState | null {
    const state = this.service.getState()
    return state.active ? state : null
  }
}
