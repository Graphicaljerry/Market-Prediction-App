# Parts — one line each

Source: `eth-tracker.html` (6,106 lines) and `cloudflare-worker/worker.js` (2,088), commit
`0e0b66a`, 2026-08-30. Citations are `line` in eth-tracker.html unless marked `worker.js:`.

**Risk column** is the project's own distinction (see `../../CLAUDE.md`): changes to **picks**
alter what you are told to do; changes to **log** only alter measurement. Call out pick changes
explicitly.

| Part | Lives at | Risk | One line |
|---|---|---|---|
| [probability-engine](probability-engine.md) | 2141–2436 | **picks** | Six independent signals combined, then calibrated, into one number. The heart. |
| [market-data](market-data.md) | 1986–3331 | **picks** | Live price, candles, volatility, momentum, order-book imbalance. |
| [round-clock](round-clock.md) | 3875–4117 | **picks** | The 15-minute boundary, per-round refresh, and settlement. |
| [pick-surface](pick-surface.md) | 2856–3273, 5617 | **picks** | What the call looks like on screen. Derives nothing. |
| [bet-slip](bet-slip.md) | 2522, 5502–5591 | log | IN / OUT / NEED / RUNS — the bet in four terms. |
| [my-bets](my-bets.md) | 5414–5443 | log | Your own logged bets and the W/L chips. `myBets.v1`. |
| [charts](charts.md) | 3428–3733 | log | The zoomable price chart. |
| [ai-copilot](ai-copilot.md) | 4674–4753, worker.js:761–1028 | **picks** | The paid AI read, its budget gate, and the prompt. |
| [crowd-odds](crowd-odds.md) | 4716, worker.js:578–617 | **picks** | Kalshi crowd probability, free. |
| [auto-tracker](auto-tracker.md) | 4845–5127, worker.js:1836 | log | The 24/7 cron that grades itself. |
| [worker](worker.md) | worker.js (all) | both | The Cloudflare proxy: AI, crowd, cron, KV. |
| coin config | 1888–1903 | picks | `COINS` / `COIN_ICONS`. stub — read the source. |
| history & calibration | 2638, 4614 | log | `snapshotFeat:2638`, `historySummary:4614`. stub. |
