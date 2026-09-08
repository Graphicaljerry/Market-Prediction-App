# Parts — one line each

Source: `eth-tracker.html` (6,167 lines) and `cloudflare-worker/worker.js` (2,181), commit
`a8bd703`, 2026-09-08. Citations are `line` in eth-tracker.html unless marked `worker.js:`.

**Risk column** is the project's own distinction (see `../../CLAUDE.md`): changes to **picks**
alter what you are told to do; changes to **log** only alter measurement. Call out pick changes
explicitly.

| Part | Lives at | Risk | One line |
|---|---|---|---|
| [probability-engine](probability-engine.md) | 2156–2451 | **picks** | Six independent signals combined, then calibrated, into one number. The heart. |
| [market-data](market-data.md) | 2001–3359 | **picks** | Live price, candles, volatility, momentum, order-book imbalance. |
| [round-clock](round-clock.md) | 3907–4149 | **picks** | The 15-minute boundary, per-round refresh, and settlement. |
| [pick-surface](pick-surface.md) | 2856–3273, 5674 | **picks** | What the call looks like on screen. Derives nothing. |
| [bet-slip](bet-slip.md) | 2537, 5559–5648 | log | IN / OUT / NEED / RUNS — the bet in four terms. |
| [my-bets](my-bets.md) | 5468–5500 | log | Your own logged bets and the W/L chips. `myBets.v1`. |
| [charts](charts.md) | 3456–3761 | log | The zoomable price chart. |
| [ai-copilot](ai-copilot.md) | 4674–4753, worker.js:835–1119 | **picks** | The paid AI read, its budget gate, and the prompt. |
| [crowd-odds](crowd-odds.md) | 4766, worker.js:652–691 | **picks** | Kalshi crowd probability, free. |
| [auto-tracker](auto-tracker.md) | 4845–5127, worker.js:1927 | log | The 24/7 cron that grades itself. |
| [worker](worker.md) | worker.js (all) | both | The Cloudflare proxy: AI, crowd, cron, KV. |
| coin config | 1900–1915 | picks | `COINS` / `COIN_ICONS`. stub — read the source. |
| history & calibration | 2653, 4614 | log | `snapshotFeat:2653`, `historySummary:4655`. stub. |
