---
type: part
source: eth-tracker.html:2020-3378
status: verified
universe: live
risk: picks
verified_at: a8bd703 2026-09-08
---

# market-data — what the engine is looking at

**A `picks` part.** Bad data makes confident wrong calls.

## Shape

| Function | Line | Does |
|---|---|---|
| `loadCoinbaseCandles` | 2020 | historical candles |
| `refreshMicro` | 2056 | 1-minute volatility + momentum |
| `refreshOrderBook` | 2081 | order-book imbalance |
| `connectWS` | 3378 | live price socket |

## If you change this

**Hits** — [probability-engine](probability-engine.md): `momOver:2278` eats `refreshMicro`,
`obiOver:2266` eats `refreshOrderBook`, and `sigmaRoundFallback:2340` is the guard for when
candles are thin. Also [charts](charts.md), which draws the same closes.

**Does not hit** — [crowd-odds](crowd-odds.md) and [ai-copilot](ai-copilot.md); both come over
the wire from the worker, not from Coinbase.

## See
`eth-tracker.html:2022`. Prose: `README.md` → *Indicator engine*.
