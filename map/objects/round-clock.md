---
type: part
source: eth-tracker.html:3875-4117
status: verified
universe: live
risk: picks
verified_at: 0e0b66a 2026-08-30
---

# round-clock — the 15 minutes, and what happened in them

**A `picks` part.** The boundary decides which call is live.

## Shape

| Function | Line | Does |
|---|---|---|
| `nextBoundary` | 3875 | when the current round ends |
| `tickTimer` | 3904 | the countdown; drives per-round refresh |
| `openRound` | 4034 | starts a round, snapshots the state |
| `settleGrades` | 4104 | scores rounds that closed |
| `finalizeGrade` | 4117 | writes the result |
| `gradeLockAB` | 2769 | A/B grading of the locked call |
| `gradeAIReadsFromLog` | 2173 | scores the AI's past reads |

**There is no `gradeRound`.** `README.md`'s code map names it; it does not exist. See
`../CLAUDE.md`.

## If you change this

**Hits** — [probability-engine](probability-engine.md), because `calibrate:2392` reads the
history that grading writes. Change what counts as a win and every calibrated number shifts.
Also [auto-tracker](auto-tracker.md) and [my-bets](my-bets.md) (`resolveMyBets:5430` settles
against the same boundary).

**Does not hit** — [charts](charts.md), [bet-slip](bet-slip.md) display math.

**⚠️ Two graders exist.** The client grades (`settleGrades:4104`) and the worker cron grades
(`runCoinPick:1836` in `worker.js`). They must agree on what a win is. Changing one and not the
other produces two different records of the same round.

## See
`eth-tracker.html:4104`. Prose: `README.md` → *The 15-minute round model*.
