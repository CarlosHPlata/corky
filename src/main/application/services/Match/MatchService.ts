import { Account, MatchReport } from "@shared/types";
import { MatchRepository } from "../../ports/MatchRepository";
import { assembleMatchReport } from "../../../domain/report/assembleMatchReport";
import { ReportRepository } from "../../ports/ReportRepository";
import { SessionGoalRepository } from "../../ports/SessionGoalRepository";
import { ReflectionRepository } from "../../ports/ReflectionRepository";
import { Match } from "../../../domain/entities/Match";
import { ItemCatalog } from "../../ports/ItemCatalog";

export class MatchService {
    constructor(
        private readonly matchRepo: MatchRepository,
        private readonly reportRepo: ReportRepository,
        private readonly goalRepo: SessionGoalRepository,
        private readonly reflectionRepo: ReflectionRepository,
        private readonly itemCatalog: ItemCatalog, // RIOT API
    ) { }

    async getMatch(matchId: string): Promise<Match> {
        const account = this.matchRepo.getCurrentAccount()
        if (!account) throw new Error('No synced account')

        const report = await this.assembleReport(account, matchId)
        if (!report) throw new Error('Match not stored locally')

        return new Match(
            account,
            matchId,
            report,
            this.getStanding(account) ?? [],
            this.getReflections(matchId) ?? [],
            this.getMatchAnalysis(matchId) ?? undefined,
            this.getGoal(),
        )
    }

    /**
     * The factual report alone. Returns null when no account is synced, the
     * match isn't stored, or its raw JSON is unparseable — letting bulk callers
     * (history aggregation, list queries) skip a row instead of failing.
     */
    async getReport(matchId: string): Promise<MatchReport | null> {
        const account = this.matchRepo.getCurrentAccount()
        if (!account) return null
        return await this.assembleReport(account, matchId)
    }

    private async assembleReport(account: Account, matchId: string): Promise<MatchReport | null> {
        const detail = this.matchRepo.getMatchDetail(matchId)
        if (!detail) return null

        let rawMatch: unknown
        try {
            rawMatch = JSON.parse(detail.rawJson)
        } catch {
            return null
        }

        const timelineRow = this.matchRepo.getTimeline(matchId)
        let rawTimeline: unknown | null = null
        if (timelineRow) {
            try {
                rawTimeline = JSON.parse(timelineRow.rawJson)
            } catch {
                rawTimeline = null
            }
        }

        const itemNames = await this.itemCatalog.getItemNames()
        const report = assembleMatchReport(rawMatch, rawTimeline, account.puuid, itemNames)
        return report
    }

    countMatches(puuid: string) {
        return this.matchRepo.countMatches(puuid)
    }

    getStandingTasks(puuid: string) {
        return this.reportRepo.getStandingTasks(puuid)
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
