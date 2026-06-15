import { Account, MatchReport } from "@shared/types";
import { MatchRepository } from "../../ports/MatchRepository";
import { assembleMatchReport } from "src/main/domain/report/assembleMatchReport";
import { ReportRepository } from "../../ports/ReportRepository";
import { SessionGoalRepository } from "../../ports/SessionGoalRepository";
import { ReflectionRepository } from "../../ports/ReflectionRepository";
import { Match } from "src/main/domain/entities/Match";

export class MatchService {
    constructor(
        private readonly matchRepo: MatchRepository,
        private readonly reportRepo: ReportRepository,
        private readonly goalRepo: SessionGoalRepository,
        private readonly reflectionRepo: ReflectionRepository,
    ) { }

    getMatch(matchId: string): Match {
        const account = this.matchRepo.getCurrentAccount()
        if (!account) throw new Error('No synced account')

        const report = this.getReport(account, matchId)
        const analysis = this.getMatchAnalysis(matchId)
        const goal = this.getGoal()
        const standings = this.getStanding(account)
        const reflections = this.getReflections(matchId)

        return {
            account,
            matchId,
            report,
            analysis: analysis ?? undefined,
            goal,
            standings,
            reflections
        }
    }

    private getReport(account: Account, matchId: string): MatchReport {
        const detail = this.matchRepo.getMatchDetail(matchId)
        if (!detail) throw new Error('Match not stored locally')

        const rawMatch = JSON.parse(detail.rawJson)

        const timelineRow = this.matchRepo.getTimeline(matchId)
        let rawTimeline: unknown | null = null
        if (timelineRow) {
            try {
                rawTimeline = JSON.parse(timelineRow.rawJson)
            } catch {
                rawTimeline = null
            }
        }

        return assembleMatchReport(rawMatch, rawTimeline, account.puuid)
    }

    private getMatchAnalysis(matchId: string) {
        return this.reportRepo.getMatchAnalysis(matchId)
    }

    private getGoal() {
        return this.goalRepo.get()?.goal?.trim() || undefined
    }

    private getStanding(account: Account) {
        return this.reportRepo.getStandingTasks(account.puuid)
    }

    private getReflections(matchId: string) {
        return this.reflectionRepo.list(matchId)
    }


}
