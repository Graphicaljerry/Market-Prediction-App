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
| `loadCoinbaseCandles` | 1986 | historical candles |
| `refreshMicro` | 2022 | 1-minute volatility + momentum |
| `refreshOrderBook` | 2047 | order-book imbalance |
| `connectWS` | 3331 | live price socket |

## If you change this

**Hits** — [probability-engine](probability-engine.md): `momOver:2244` eats `refreshMicro`,
`obiOver:2232` eats `refreshOrderBook`, and `sigmaRoundFallback:2306` is the guard for when
candles are thin. Also [charts](charts.md), which draws the same closes.

**Does not hit** — [crowd-odds](crowd-odds.md) and [ai-copilot](ai-copilot.md); both come over
the wire from the worker, not from Coinbase.

## See
`eth-tracker.html:2022`. Prose: `README.md` → *Indicator engine*.
