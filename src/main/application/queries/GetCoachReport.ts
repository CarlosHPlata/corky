import type { CoachReport } from '@shared/types'
import type { ReportRepository } from '../ports/ReportRepository'

export class GetCoachReport {
  constructor(private readonly repository: ReportRepository) {}

  execute(matchId: string): CoachReport | null {
    return this.repository.getReport(matchId)
  }
}
