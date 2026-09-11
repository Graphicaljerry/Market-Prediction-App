---
type: part
source: eth-tracker.html:2108-3466
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
| `loadCoinbaseCandles` | 2108 | historical candles |
| `refreshMicro` | 2144 | 1-minute volatility + momentum |
| `refreshOrderBook` | 2169 | order-book imbalance |
| `connectWS` | 3466 | live price socket |

## If you change this

**Hits** — [probability-engine](probability-engine.md): `momOver:2366` eats `refreshMicro`,
`obiOver:2354` eats `refreshOrderBook`, and `sigmaRoundFallback:2428` is the guard for when
candles are thin. Also [charts](charts.md), which draws the same closes.

**Does not hit** — [crowd-odds](crowd-odds.md) and [ai-copilot](ai-copilot.md); both come over
the wire from the worker, not from Coinbase.

## See
`eth-tracker.html:2022`. Prose: `README.md` → *Indicator engine*.
