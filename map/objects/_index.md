# Parts — one line each

Source: `eth-tracker.html` (6,299 lines) and `cloudflare-worker/worker.js` (2,181), commit
`c88fe63`, 2026-09-11. Citations are `line` in eth-tracker.html unless marked `worker.js:`.

**Risk column** is the project's own distinction (see `../../CLAUDE.md`): changes to **picks**
alter what you are told to do; changes to **log** only alter measurement. Call out pick changes
explicitly.

| Part | Lives at | Risk | One line |
|---|---|---|---|
| [probability-engine](probability-engine.md) | 2227–2522 | **picks** | Six independent signals combined, then calibrated, into one number. The heart. |
| [market-data](market-data.md) | 2072–3430 | **picks** | Live price, candles, volatility, momentum, order-book imbalance. |
| [round-clock](round-clock.md) | 2259–4220 | **picks** | The 15-minute boundary, per-round refresh, and settlement. |
| [pick-surface](pick-surface.md) | 2942–5805 | **picks** | What the call looks like on screen. Derives nothing. |
| [bet-slip](bet-slip.md) | 2608, 5677–5766 | log | IN / OUT / NEED / RUNS — the bet in four terms. |
| [my-bets](my-bets.md) | 5541–5573 | log | Your own logged bets and the W/L chips. `myBets.v1`. |
| [charts](charts.md) | 3527–3832 | log | The zoomable price chart. |
| [ai-copilot](ai-copilot.md) | 4795–4874, worker.js:835–1119 | **picks** | The paid AI read, its budget gate, and the prompt. |
| [crowd-odds](crowd-odds.md) | 4837, worker.js:653–692 | **picks** | Kalshi crowd probability, free. |
| [alerts](alerts.md) | worker.js:1326–1545, 5640 | **money** | The Discord/ntfy pings. No pick logic, but they decide when you actually bet. |
| [auto-tracker](auto-tracker.md) | 4969–5251, worker.js:1927 | log | The 24/7 cron that grades itself. |
| [worker](worker.md) | worker.js (all) | both | The Cloudflare proxy: AI, crowd, cron, KV. |
| coin config | 1971–1986 | picks | `COINS` / `COIN_ICONS`. stub — read the source. |
| history & calibration | 2724, 4726 | log | `snapshotFeat:2724`, `historySummary:4726`. stub. |
