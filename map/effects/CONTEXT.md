# effects — "I am changing X. What do I open?"

A catalog, not a copy of the cards. If this index and a card disagree, **the card wins**.

**Read the Risk column first.** `picks` changes alter what the user is told to do and must be
called out explicitly in plain terms (`../../CLAUDE.md`). `log` changes only alter measurement.

## Inside the tree

| Changing | Open, in order | Risk | Watch for |
|---|---|---|---|
| the odds, weights, or calibration | [probability-engine](../objects/probability-engine.md) → [pick-surface](../objects/pick-surface.md) → [round-clock](../objects/round-clock.md) | **picks** | `calibrate:2392` reads graded history. New odds make today incomparable to yesterday. |
| price, candles, volatility, order book | [market-data](../objects/market-data.md) → [probability-engine](../objects/probability-engine.md) | **picks** | `sigmaRoundFallback:2306` is the thin-candle guard. |
| the round boundary or grading | [round-clock](../objects/round-clock.md) → [auto-tracker](../objects/auto-tracker.md) → [probability-engine](../objects/probability-engine.md) | **picks** | **Two graders.** Client `settleGrades:4104` and worker `runCoinPick:1836` must agree. |
| how the call looks | [pick-surface](../objects/pick-surface.md) → [bet-slip](../objects/bet-slip.md) | **picks** to display only | If you compute a probability here, it belongs in `combinedOdds:2436`. |
| IN / OUT / NEED / RUNS | [bet-slip](../objects/bet-slip.md) | log | Dropping the n ≥ 20 gate on `RUNS` turns a measurement into a claim. |
| the AI read, prompt, or budget | [ai-copilot](../objects/ai-copilot.md) → [worker](../objects/worker.md) | **picks** + money | `aiWorthIt:4700` is the only spend gate. |
| crowd odds | [crowd-odds](../objects/crowd-odds.md) → [worker](../objects/worker.md) | **picks** | Stale-serve is deliberate; removing it makes the signal vanish intermittently. |
| the 24/7 panel or cron | [auto-tracker](../objects/auto-tracker.md) → [worker](../objects/worker.md) | log | Cron trigger is in `wrangler.toml`, not in code. |
| my logged bets | [my-bets](../objects/my-bets.md) | log | `myBets.v1` — bump the key or corrupt every user's history. No server copy. |
| the chart | [charts](../objects/charts.md) | log | Safest part of the app. |

## Pointing INTO the tree from outside

Nothing inside the code names these, so no card catches them:

| Consumer | Hardcodes | Breaks if |
|---|---|---|
| `wrangler.toml:5` | `main = "cloudflare-worker/worker.js"` | the worker file moves or is renamed |
| `wrangler.toml` | the cron schedule, `[vars]`, KV bindings | the cron path or KV namespace changes |
| `.github/workflows/pages.yml` | builds `_site`, deploys on push to `main` | the build layout changes |
| `sw.js` | the service worker's cached asset list | filenames change |
| `manifest.webmanifest`, `apple-touch-icon.png` | install/icon paths | assets are renamed |
| `tools/preview.js` | reads the app for previews | the entry file is renamed |
| Cloudflare KV | keys written by the cron, read by the panel | key names change on one side only |
| Kalshi API | series tickers in the worker | Kalshi renames a series |

**Ask before assuming this list is complete.** External consumers are a question for the human,
not an unbounded grep.
