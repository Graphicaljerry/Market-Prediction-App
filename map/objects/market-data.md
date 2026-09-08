---
type: part
source: eth-tracker.html:1986-3331
status: verified
universe: live
risk: picks
verified_at: 0e0b66a 2026-08-30
---

# market-data — what the engine is looking at

**A `picks` part.** Bad data makes confident wrong calls.

## Shape

| Function | Line | Does |
|---|---|---|
| `loadCoinbaseCandles` | 2001 | historical candles |
| `refreshMicro` | 2037 | 1-minute volatility + momentum |
| `refreshOrderBook` | 2062 | order-book imbalance |
| `connectWS` | 3359 | live price socket |

## If you change this

**Hits** — [probability-engine](probability-engine.md): `momOver:2259` eats `refreshMicro`,
`obiOver:2247` eats `refreshOrderBook`, and `sigmaRoundFallback:2321` is the guard for when
candles are thin. Also [charts](charts.md), which draws the same closes.

**Does not hit** — [crowd-odds](crowd-odds.md) and [ai-copilot](ai-copilot.md); both come over
the wire from the worker, not from Coinbase.

## See
`eth-tracker.html:2022`. Prose: `README.md` → *Indicator engine*.
