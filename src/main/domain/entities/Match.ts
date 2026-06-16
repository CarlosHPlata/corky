import { Account, MatchAnalysis, MatchReport, Reflection, StandingFocusTask } from "@shared/types";
import { buildCoachBriefing } from "../report/coachBriefing";

export class Match {

    constructor(
        private readonly _account: Account,
        private readonly _matchId: string,
        private readonly _report: MatchReport,
        private readonly _standings: StandingFocusTask[],
        private readonly _reflections: Reflection[],
        private readonly _analysis?: MatchAnalysis,
        private readonly _goal?: string,
    ) { }

    coachBriefing() {
        return buildCoachBriefing(this._report, this._analysis, this._goal)
    }

    get goal(): string | undefined {
        return this._goal
    }

    get analysis(): MatchAnalysis | undefined {
        return this._analysis
    }

    get account(): Account {
        return this._account
    }

    get matchId(): string {
        return this._matchId
    }

    get report(): MatchReport {
        return this._report
    }

    get standings(): StandingFocusTask[] {
        return this._standings
    }

    get reflections(): Reflection[] {
        return this._reflections
    }
}