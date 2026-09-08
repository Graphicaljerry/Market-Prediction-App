---
type: part
source: eth-tracker.html:2141-2436
status: verified
universe: live
risk: picks
verified_at: 0e0b66a 2026-08-30
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
| `indOver` | 2156 | technical indicators |
| `aiOver` | 2162 | the paid AI read |
| `crowdOver` | 2236 | Kalshi crowd |
| `obiOver` | 2247 | order-book imbalance |
| `momOver` | 2259 | 1-minute momentum |
| `barrierOver` | 2359 | the barrier/diffusion model |

| Combination | Line | Does |
|---|---|---|
| `normCdf` | 2315 | normal CDF helper |
| `sigmaRoundFallback` | 2321 | volatility fallback when candles are thin |
| `rawCombinedOdds` | 2384 | weights the six |
| `calibrate` | 2407 | bends the raw number toward measured reality |
| `combinedOdds` | 2451 | **the number everything else consumes** |

## If you change this

**Hits**
- [pick-surface](pick-surface.md) — `renderPickCard:2882` and `renderHero:5674` render this
  number and nothing else. They derive no pick of their own.
- [bet-slip](bet-slip.md) — `NEED` (break-even) is computed against it
- [round-clock](round-clock.md) — `settleGrades:4136` scores the number that was live
- **The calibration record itself.** `calibrate:2407` reads history, and history is written by
  grading. Change the odds and today's history stops being comparable to yesterday's. This is
  the non-obvious one.

**Does not hit**
- [charts](charts.md) — the chart draws price, not probability
- [my-bets](my-bets.md) — your logged bets record what you did, not what the model said

## See

`eth-tracker.html:2369` (`rawCombinedOdds`) then `:2392` (`calibrate`). Read those two
together; neither makes sense alone. Prose version: `README.md` → *The probability engine*.
