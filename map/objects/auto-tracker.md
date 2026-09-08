---
type: part
source: eth-tracker.html:4917-5199, cloudflare-worker/worker.js:1927
status: verified
universe: live
risk: log
verified_at: a8bd703 2026-09-08
---

# auto-tracker — the 24/7 record

Runs whether or not a browser is open. That is the point: it is the app's honest track record.

| Function | Where | Does |
|---|---|---|
| `runCoinPick` | worker.js:1927 | the cron: grade, then `freePick:1636`, then write KV |
| `cbMicro` / `cbObi` | worker.js:1210 / :1397 | the worker's own market reads |
| `fetchAutoTracker` | 4917 | the app pulls the record |
| `renderAutoTracker` | 5199 | the 24/7 panel |
| `hm` / `hma` / `hms` / `rangeHM` | — | 12-hour clock formatting |

## If you change this

**Hits**
- [round-clock](round-clock.md) — **two graders must agree.** The cron grades server-side; the
  client grades in `settleGrades:4155`. Change what a win means in one and the two records
  diverge with no error.
- `wrangler.toml` — the cron trigger is declared there, not here

**Does not hit** — the live pick. The tracker records; it does not advise.

## See
`cloudflare-worker/worker.js:1927`. Prose: `README.md` → *24/7 Auto-Tracker (cron)*.
