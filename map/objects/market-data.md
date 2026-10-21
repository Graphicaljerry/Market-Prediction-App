---
type: part
source: eth-tracker.html:2108-3466
status: verified
universe: live
risk: picks
verified_at: r105 2026-10-20
---

# market-data — what the engine is looking at

**A `picks` part.** Bad data makes confident wrong calls.

## Shape

| Function | Line | Does |
|---|---|---|
| `loadCoinbaseCandles` | 2124 | historical candles |
| `refreshMicro` | 2160 | 1-minute volatility + momentum |
| `refreshOrderBook` | 2185 | order-book imbalance |
| `connectWS` | 3482 | live price socket |

## If you change this

**Hits** — [probability-engine](probability-engine.md): `momOver:2382` eats `refreshMicro`,
`obiOver:2370` eats `refreshOrderBook`, and `sigmaRoundFallback:2444` is the guard for when
candles are thin. Also [charts](charts.md), which draws the same closes.

**Does not hit** — [crowd-odds](crowd-odds.md) and [ai-copilot](ai-copilot.md); both come over
the wire from the worker, not from Coinbase.

## See
`eth-tracker.html:2022`. Prose: `README.md` → *Indicator engine*.
