---
type: part
source: eth-tracker.html:4716, cloudflare-worker/worker.js:652-691
status: verified
universe: live
risk: picks
verified_at: a8bd703 2026-09-08
---

# crowd-odds — what Kalshi thinks

Free. Works with the AI switched off.

| Function | Where | Does |
|---|---|---|
| `refreshCrowd` | 4873 | asks the worker |
| `applyCrowd` | 4910 | folds it in |
| `getKalshiCrowd` | worker.js:652 | current + `next` round |
| `fetchCrowd` | worker.js:691 | the call, KV cached with stale-serve |

## If you change this

**Hits** — [probability-engine](probability-engine.md) via `crowdOver:2343`, one of six signals.

**Does not hit** — [ai-copilot](ai-copilot.md). Independent paths that share a wire.

**⚠️ Stale-serve is deliberate.** `fetchCrowd` returns cached odds when Kalshi is slow or down,
rather than nothing. If you remove that, the crowd signal starts disappearing intermittently and
`crowdOver:2343` silently reweights. Kalshi settles on a 60-second CF Benchmarks index — the
crowd number is not a live tick.

## See
`cloudflare-worker/worker.js:652`. Prose: `README.md` → *Crowd odds (Kalshi)*.
