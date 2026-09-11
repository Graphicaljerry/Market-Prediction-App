# Tracker code map

What the app is made of, where each piece lives by line, and what a change to one hits.
Built from `eth-tracker.html` and `cloudflare-worker/worker.js` at commit `c88fe63`, 2026-09-11.

**The source is the truth. This map cites it.** When a card and the code disagree, the code
wins and the card is stale — fix the card in that commit.

## Why this map exists

The app is three big files:

| File | Lines |
|---|---|
| `eth-tracker.html` | **6,299** — one `<script>` runs 1967–6297 |
| `cloudflare-worker/worker.js` | **2,255** |
| `README.md` | 1,471 |

There are no modules to navigate by. Without line citations, "change the probability engine"
means reading 4,330 lines of inline JavaScript to find it. That is the whole problem this map
solves.

## Where to go

| If you want | Open |
|---|---|
| how to read this map | `CONTEXT.md` |
| one line per part, with its line range | `objects/_index.md` |
| what one part is and what changing it hits | `objects/<part>.md` |
| "I am changing X — what do I open?" | `effects/CONTEXT.md` |
| what the app *is* and why | `../README.md` |

## Name collisions — product word vs. code word

| You say | The code says |
|---|---|
| the pick / the call | `renderPickCard:2953`, and the verdict slab is `renderHero:5805` |
| the odds | `combinedOdds:2522` — the calibrated number. `rawCombinedOdds:2455` is pre-calibration. |
| a round | a 15-minute window; boundary math is `nextBoundary:3978` |
| grading | `settleGrades:4207` / `finalizeGrade:4220`. **There is no `gradeRound`** — see below. |
| the crowd | Kalshi odds, `refreshCrowd:4837` in the app, `getKalshiCrowd:653` in the worker |
| the AI | `callWorker:4845` in the app → `getAIRead:1020` in the worker. Two hops, two budgets. |
| my bets | `myBets.v1` in localStorage, `toggleMyBet:5541` |

## ⚠️ One ghost

`README.md`'s "Crucial code map" lists **`gradeRound`**. That function does not exist at commit
`c88fe63` — verified by grep. The real grading functions are `settleGrades:4207`,
`finalizeGrade:4220`, `gradeLockAB:2855`, and `gradeAIReadsFromLog:2259`. Do not implement
against `gradeRound`.

## Universes

**live** — in force. **leftover** — present, not the main path. **ghost** — named, not wired.
Everything here is live unless its card says otherwise.
