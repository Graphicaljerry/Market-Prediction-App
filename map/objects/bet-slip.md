---
type: part
source: eth-tracker.html:2522, 5559-5648
status: verified
universe: live
risk: log
verified_at: a8bd703 2026-09-08
---

# bet-slip — the bet in four terms

`IN` / `OUT` / `NEED` / `RUNS`. A `log` part: it describes the bet, it does not choose it.

## Shape

| Function | Line | Does |
|---|---|---|
| `betMath` | 2537 | the arithmetic |
| `measuredAtPrice` | 5559 | historical hit rate at a given price |
| `slipRow` | 5648 | renders the row |

Two rules worth knowing: **`NEED` is venue-aware break-even** (it accounts for the fee, so it is
not just `1/price`), and **`RUNS` is gated at n ≥ 20** — below that the sample is not shown
rather than shown small.

## If you change this

**Hits** — [pick-surface](pick-surface.md), since `renderHero:5674` calls `slipRow:5648`.

**Does not hit** — [probability-engine](probability-engine.md). This reads the odds; it never
feeds them.

**Careful:** dropping the n ≥ 20 gate on `RUNS` would turn a measurement into a claim. That
would move this from a `log` change to a `picks` change.

## See
`eth-tracker.html:2522`.
