---
type: part
source: eth-tracker.html:2072-3430
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
| `loadCoinbaseCandles` | 2072 | historical candles |
| `refreshMicro` | 2108 | 1-minute volatility + momentum |
| `refreshOrderBook` | 2133 | order-book imbalance |
| `connectWS` | 3430 | live price socket |

## If you change this

**Hits** — [probability-engine](probability-engine.md): `momOver:2330` eats `refreshMicro`,
`obiOver:2318` eats `refreshOrderBook`, and `sigmaRoundFallback:2392` is the guard for when
candles are thin. Also [charts](charts.md), which draws the same closes.

**Does not hit** — [crowd-odds](crowd-odds.md) and [ai-copilot](ai-copilot.md); both come over
the wire from the worker, not from Coinbase.

## See
`eth-tracker.html:2022`. Prose: `README.md` → *Indicator engine*.
