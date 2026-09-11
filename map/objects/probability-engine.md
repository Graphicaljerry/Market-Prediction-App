---
type: part
source: eth-tracker.html:2227-2522
status: verified
universe: live
risk: picks
verified_at: a8bd703 2026-09-08
---

# probability engine — six signals into one number

**This is a `picks` part.** Any change here alters what the user is told to do. Say so
explicitly, in plain terms, per `../../CLAUDE.md`.

## Why this shape

No single signal is trustworthy for a 15-minute window. So six weak, independent estimates are
computed separately, combined, and then **calibrated against the app's own measured history**
rather than trusted raw. `rawCombinedOdds` → `calibrate` → `combinedOdds` is the whole thesis:
the model does not believe itself until the record says it should.

## Shape

| Signal | Line | Reads |
|---|---|---|
| `indOver` | 2227 | technical indicators |
| `aiOver` | 2233 | the paid AI read |
| `crowdOver` | 2307 | Kalshi crowd |
| `obiOver` | 2318 | order-book imbalance |
| `momOver` | 2330 | 1-minute momentum |
| `barrierOver` | 2430 | the barrier/diffusion model |

| Combination | Line | Does |
|---|---|---|
| `normCdf` | 2386 | normal CDF helper |
| `sigmaRoundFallback` | 2392 | volatility fallback when candles are thin |
| `rawCombinedOdds` | 2455 | weights the six |
| `calibrate` | 2478 | bends the raw number toward measured reality |
| `combinedOdds` | 2522 | **the number everything else consumes** |

## If you change this

**Hits**
- [pick-surface](pick-surface.md) — `renderPickCard:2953` and `renderHero:5805` render this
  number and nothing else. They derive no pick of their own.
- [bet-slip](bet-slip.md) — `NEED` (break-even) is computed against it
- [round-clock](round-clock.md) — `settleGrades:4207` scores the number that was live
- **The calibration record itself.** `calibrate:2478` reads history, and history is written by
  grading. Change the odds and today's history stops being comparable to yesterday's. This is
  the non-obvious one.

**Does not hit**
- [charts](charts.md) — the chart draws price, not probability
- [my-bets](my-bets.md) — your logged bets record what you did, not what the model said

## See

`eth-tracker.html:2369` (`rawCombinedOdds`) then `:2392` (`calibrate`). Read those two
together; neither makes sense alone. Prose version: `README.md` → *The probability engine*.
