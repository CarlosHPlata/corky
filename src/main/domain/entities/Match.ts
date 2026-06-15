import { Account, MatchAnalysis, MatchReport, Reflection, StandingFocusTask } from "@shared/types";

export type Match = {
    readonly account: Account,
    readonly matchId: string,
    readonly report: MatchReport,
    readonly analysis?: MatchAnalysis,
    readonly goal?: string,
    readonly standings?: StandingFocusTask[]
    readonly reflections?: Reflection[],
}