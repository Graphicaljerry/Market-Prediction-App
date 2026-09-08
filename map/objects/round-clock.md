---
type: part
source: eth-tracker.html:2207-4168
status: verified
universe: live
risk: picks
verified_at: a8bd703 2026-09-08
---

# round-clock — the 15 minutes, and what happened in them

**A `picks` part.** The boundary decides which call is live.

## Shape

| Function | Line | Does |
|---|---|---|
| `nextBoundary` | 3926 | when the current round ends |
| `tickTimer` | 3955 | the countdown; drives per-round refresh |
| `openRound` | 4085 | starts a round, snapshots the state |
| `settleGrades` | 4155 | scores rounds that closed |
| `finalizeGrade` | 4168 | writes the result |
| `gradeLockAB` | 2803 | A/B grading of the locked call |
| `gradeAIReadsFromLog` | 2207 | scores the AI's past reads |

**There is no `gradeRound`.** `README.md`'s code map names it; it does not exist. See
`../CLAUDE.md`.

## If you change this

**Hits** — [probability-engine](probability-engine.md), because `calibrate:2426` reads the
history that grading writes. Change what counts as a win and every calibrated number shifts.
Also [auto-tracker](auto-tracker.md) and [my-bets](my-bets.md) (`resolveMyBets:5505` settles
against the same boundary).

**Does not hit** — [charts](charts.md), [bet-slip](bet-slip.md) display math.

**⚠️ Two graders exist.** The client grades (`settleGrades:4155`) and the worker cron grades
(`runCoinPick:1996` in `worker.js`). They must agree on what a win is. Changing one and not the
other produces two different records of the same round.

## See
`eth-tracker.html:4104`. Prose: `README.md` → *The 15-minute round model*.
