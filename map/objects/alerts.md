---
type: part
source: cloudflare-worker/worker.js:1326-1560, eth-tracker.html:5640
status: verified
universe: live
risk: money
verified_at: r102 2026-09-11
---

# alerts — the pings that move real money

**This is a `money` part.** It does not change a pick, but it is the surface that decides *when the
user actually bets*, so a wrong bound here costs cash directly. Treat a change with the same care as
a `picks` change and say so in plain terms (`../../CLAUDE.md`).

## Why this shape

A ping is only worth sending on a setup the record says makes money. Two audits agree the edge is
narrow: buy the crowd's favourite at **78–82¢**, and only when the 24/7 tracker committed that side.
Everything else in this file exists to keep alerts inside that window.

| Function | Where | Does |
|---|---|---|
| `pingBand` | worker.js:1349 | resolves the band from env and **hard-clamps it to 70–88¢** |
| `starLine` | worker.js:1366 | the message: price, payout multiple, dollars on `PING_STAKE`, minutes left |
| `notifyLockPings` | worker.js:1377 | **the default ping.** Fires from the `4,19,34,49` cron at lock, ~11 min out |
| `scanLateLocks` | worker.js:1457 | the `8,23,38,53` second chance, for a price that drifts *into* band |
| `notifyHotPicks` | worker.js:1400 | round-open + STRONG pings — OFF unless `PING_MODE=all` |
| `pushDiscord` / `ntfyPush` | worker.js:1326 / :1442 | the two transports |
| `renderBandReturns` | 5640 | the app's live version of the audit table, per price band |

## The numbers that set the bounds

Measured on 7,344 Kalshi-settled rounds (Sept-2026 audit). **Read this before moving any bound.**

| Favourite priced | n | won | pays | per $1 |
|---|---|---|---|---|
| 70–75¢ | 693 | 73.0% | 1.38x | −1.2¢ |
| 78–82¢ | 263 | 83.7% | 1.25x | **+3.2¢** |
| 86–90¢ | 96 | 90.6% | 1.14x | +2.1¢ |
| 90–95¢ | 53 | 83.0% | 1.08x | **−10.8¢** |

Cheap is not generous: a big multiple means a losing win rate. **A ping quoting ~1.1x is a 90¢
favourite, i.e. the worst band in the data** — that is the bug r101 fixed, and why the ceiling is
clamped in code rather than left to a dashboard variable.

## If you change this

**Hits**
- **The user's money**, immediately and with no undo. There is no grading step between a ping and a bet.
- [auto-tracker](auto-tracker.md) — `notifyLockPings` reads `rec.pending` and writes `starPinged` on it;
  that flag is what stops `scanLateLocks` double-pinging the same round.
- `wrangler.toml` — both crons. The star ping rides the **pick** cron, not the scanner's.

**Does not hit**
- The pick itself. Nothing here can commit, skip or grade a round.
- [probability-engine](probability-engine.md) — alerts read the crowd price, never the app's blend.

**⚠️ Env vars outrank the defaults**
`LOCK_MIN_PROB` / `LOCK_MAX_PROB` / `PRICE_MIN` / `PRICE_MAX` / `PING_STAKE` / `PING_MODE` /
`DEAD_MARGIN_PCT` all live in the Cloudflare dashboard. Plain-text vars are wiped by each Git deploy;
**Secrets persist**, which is how a stale `LOCK_MAX_PROB=90` kept firing losing alerts for weeks.
The clamp logs `ping band clamped 78-92 -> 78-88` when it corrects one.

## See

`cloudflare-worker/worker.js:1349` (`pingBand`) — the table above is written out in full there.
Setup and every variable: `cloudflare-worker/README.md` → *Phone alerts*.
