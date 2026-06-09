# Project Corky — Requirements
 
> **Corky** — your personal Rift coach.
> Understand *why* you lose. Learn how to *close*.
 
## What Corky is
 
Corky is a personal desktop coach for League of Legends. It is built for **one player** (you) and it answers the question most stat sites never do: *why* are you losing games, and what should you change.
 
Existing companion tools mostly hand you numbers — win rates, builds, rankings. Corky is different: it analyses **your own games** and explains, in plain language, the decisions behind the result. It focuses on the parts of the game that actually decide ranked outcomes — **macro** (map movement, objectives, tempo, converting leads) and, where the data allows, **micro** (farming, trading, positioning) — and on the hardest skill of all: **closing won games**.
 
Corky is a *coach*, not a meta database. Its value is personalised, longitudinal insight: "this is the third game this week you went even in lane but fell behind by minute 15 — your problem isn't laning, it's your mid-game pathing."
 
## What Corky is not
 
- It is **not a cheat or an exploit.** It never reads game memory, injects code, or touches game files.
- It **only uses information the game already shows you** — your own scoreboard, champion select, and post-game data. It never reveals anything you couldn't see yourself (no enemy cooldowns, no hidden timers, no information advantage).
- It **coaches, it does not command.** It explains and teaches; it does not bark real-time orders or make decisions for you.
- It is **not a meta/stats site.** It is about *your* games, not the global ladder.
## Guiding principles
 
1. **Player-first coaching.** Every output should make *you* a better decision-maker, not feed you advantages.
2. **Explain the why, not just the what.** Numbers are evidence; the insight is the product.
3. **Personalised over generic.** Patterns across your history beat one-off generic tips.
4. **Honest about limits.** When the data can't support a conclusion, Corky says so.
5. **Compliant by design.** If a feature would require information you can't already see, it doesn't get built.
6. **Evidence over assertion.** Every coaching claim points at a chart, number, or map moment you can see. The AI annotates the evidence; it never asserts without showing it.
7. **Focused, not overwhelming.** Corky leads with a verdict and a small number of tasks. The detail is there to drill into, never to greet you with a wall of stats.
## Domain glossary (for shared language)
 
- **Champion Select:** the pre-game phase where both teams pick champions and assign roles.
- **Macro:** big-picture decisions — where to be on the map, when to take objectives, how to use a lead.
- **Micro:** moment-to-moment mechanics — last-hitting, trading, positioning in fights.
- **Objectives:** map-wide goals with shared, in-game timers (Dragon, Herald, Baron, Elder).
- **Lead conversion / "closing":** turning an advantage at minute 15–20 into a win instead of throwing it.
- **Caught out:** dying while alone and out of position, usually the single most common macro mistake.
- **Turning point:** a moment where the game's advantage swung, reconstructed from the match data (not a video clip).
- **Focus task:** a concrete, measurable goal Corky sets for your next game and then checks afterwards.
---
 
## MVP scope
 
The first release delivers **two flows**, both using only pre-game and post-game information. No in-game overlay yet.
 
### Flow A — Post-game analysis (the core)
After a match, Corky retrieves the game and produces a coaching report that explains the result through *your decisions*, always backed by visible evidence. It compares this game against your own history, analyses deaths (yours and the team's around objectives), surfaces the moments the game swung, and sets concrete goals for next time — then checks how you did on the last set of goals. Every report is saved.
 
#### The post-game report — what it shows
 
The report follows **progressive disclosure**: the verdict and goals come first; the evidence sits below for you to drill into. Top to bottom:
 
1. **Since last game.** How you did on the focus tasks Corky set after your previous game — improved, held, or slipped. This is the coaching loop, front and centre, so it feels like a coach following up rather than a fresh report each time. When a task doesn't apply (e.g. it was about CS as a midlaner and you played support this game), Corky says so and parks it.
2. **Verdict.** One or two sentences on *why* this game was won or lost — the single most important decision or pattern.
3. **Next-game focus.** One to three concrete, measurable tasks (e.g. "hit 70 CS by 10 minutes", "don't die alone in the river", "be present for the first two dragons"). These are written to be checkable next game.
4. **Evidence dashboard.** A consistent set of charts and numbers — gold/XP difference over time, farming, vision, objective timeline, and a death map — the *same layout every game*, with the AI's decisive moments marked directly on it.
5. **Turning points.** The handful of moments where your advantage swung, each shown as a minimap snapshot with what happened and the better play. (Reconstructed from the data — these are moments and positions, not video clips.)
6. **What you did wrong — measured against your own games.** Where this game deviated from how you usually play it, ideally compared against your *winning* games of the same matchup. "In your Ahri wins you were on ~80 CS at 10; here you had 55." When you don't yet have enough history for that matchup, Corky falls back to a general benchmark and says which one it's using.
7. **Team & objective deaths.** Not just your own deaths — when teammates died around a major objective (e.g. a team wipe before Baron), where *you* were at that moment, and what you could have done to help secure it instead. Because positions are sampled periodically, this speaks to macro ("you were on the wrong side of the map"), not pixel-level positioning, and the "what you should have done" is coaching advice, not absolute truth.
Farming and objective securing run through points 4, 6, and 7 as first-class topics, since they're where most rankable mistakes live.
 
### Flow B — Champion select assistant
During champion select, Corky reads the picks and your assigned role and gives matchup advice, the main threats to watch, your likely win condition, and a build/rune direction — so you start the game with a plan.

### Home / Overview — the landing surface
The first thing Corky shows is an at-a-glance read of where you stand, so the coaching flows always open in context rather than cold. It pulls **only player-visible information** straight from the Riot API and the local store:

- **Identity & rank.** Your Riot ID, profile icon, current tier/division and LP for ranked solo.
- **Recent form.** Your last ranked games as a win/loss streak, with the headline numbers per game (champion, role, K/D/A, CS and CS/min, gold, duration, when).
- **Champion pool.** Your most-played champions over those games with win rate, KDA and CS/min, so trends in *what you play* are obvious.
- **LP & rank trajectory.** How your LP has moved over time. **Riot does not expose historical LP**, so Corky records your LP on each sync and builds the trajectory *forward* — and says plainly that tracking starts now until it has enough points to draw. (Honest about limits, by design.)

The overview leads with this plain, evidence-only information; the *coaching* on top of it — next-game focus tasks and session analysis — comes from Flow A and is surfaced here once a game has been analysed.

**Syncing is automatic.** Corky syncs your recent matches and rank when the app opens and then on a periodic cadence (a typical game runs 20–40 minutes, so a ~30-minute refresh catches new games soon after they finish) — and a manual sync is always available. It fetches each match once and remembers it locally, so the overview is fast and works offline.
 
---
 
## MVP user stories
 
### Post-game
- **As a player**, after a match I want a plain-language explanation of *why* I won or lost in terms of macro decisions, **so that** I know what to change next game.
- **As a player**, I want every claim Corky makes backed by a chart, number, or map moment I can see, **so that** I trust the coaching and learn to read the evidence myself.
- **As a player**, I want to see *when* the game turned (when I fell behind or pulled ahead), **so that** I can tell whether it's a laning, mid-game, or closing problem.
- **As a player**, I want the key turning-point moments shown on the map with the better play, **so that** I understand what to do differently in that situation.
- **As a player**, I want each of my deaths analysed (was I caught out, did I overextend, was it a fair fight), **so that** I can fix positioning mistakes.
- **As a player**, I want to know when my team died around an objective and where I was, **so that** I learn to be present and help secure it.
- **As a player**, I want this game compared against my *own* past games of the same matchup — especially my wins — **so that** I see what I personally did differently, not a generic benchmark.
- **As a player**, I want my farming and vision compared against the right reference, **so that** I know whether those are real leaks.
- **As a player**, in games I was ahead but lost, I want Corky to pinpoint what went wrong in closing, **so that** I stop throwing winnable games.
- **As a player**, after each game I want one to three concrete things to work on next game, **so that** I have a clear focus instead of a vague "play better".
- **As a player**, when my next game ends I want Corky to tell me whether I actually improved on those focus tasks, **so that** I can see real progress over time and stay accountable.
- **As a player**, I want all my reports stored locally, **so that** I can revisit them any time.
### Champion select
- **As a player**, during champ select I want advice on my matchup and the enemy's main threats, **so that** I can plan how to play the lane.
- **As a player**, I want a suggested win condition based on both team compositions, **so that** I understand my role in the game.
- **As a player**, I want a build and rune direction suggestion, **so that** I start the game prepared.
### Home / Overview
- **As a player**, when I open Corky I want an at-a-glance read of my rank, recent form and champion pool, **so that** I see where I stand before diving into any single game.
- **As a player**, I want my recent ranked games summarised with the headline numbers (result, champion, K/D/A, CS, gold), **so that** I can scan my session without opening each report.
- **As a player**, I want to see how my LP has moved over time, **so that** I can tell whether I'm climbing, stalling, or sliding — and I'd rather Corky build that honestly from now on than fake a history it can't get.
- **As a player**, I want my games to sync automatically when I open the app and periodically while it's running, **so that** the overview is always current without me clicking refresh.
### Foundational (enables the above)
- **As a player**, I want Corky to sync my recent matches and remember them, **so that** analysis is fast and works offline.
---
 
## Beyond the MVP (roadmap themes, not committed scope)
 
- **Trends across games:** recurring-pattern coaching over your full history ("you keep stalling leads in the 20–30 minute window").
- **In-game companion:** gentle, compliant nudges on *your own* visible stats during the game (e.g., on the death screen), never real-time commands or hidden information.
- **Replay deep-dives:** frame-level micro analysis from local replay files, for mechanics that post-game data can't see.
## MVP success criteria (non-technical)
 
- A post-game report that you'd actually act on — it names the *one or two* decisions that mattered most, not a wall of stats.
- The focus-task loop actually closes: goals set after one game are measured and reported on after the next, so progress is visible over time.
- Every coaching claim is backed by something you can see — a chart, a number, or a map moment.
- Comparisons feel personal — measured against your own games, not just the global ladder.
- Champ-select advice that feels relevant to the specific game in front of you.
- It runs on your Windows PC, alongside the game, without any risk to your account.
