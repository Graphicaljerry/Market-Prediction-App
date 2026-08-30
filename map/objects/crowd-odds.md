---
type: part
source: eth-tracker.html:4716, cloudflare-worker/worker.js:578-617
status: verified
universe: live
risk: picks
verified_at: 0e0b66a 2026-08-30
---

# crowd-odds — what Kalshi thinks

Free. Works with the AI switched off.

| Function | Where | Does |
|---|---|---|
| `refreshCrowd` | 4716 | asks the worker |
| `applyCrowd` | 4753 | folds it in |
| `getKalshiCrowd` | worker.js:578 | current + `next` round |
| `fetchCrowd` | worker.js:617 | the call, KV cached with stale-serve |

## If you change this

**Hits** — [probability-engine](probability-engine.md) via `crowdOver:2221`, one of six signals.

**Does not hit** — [ai-copilot](ai-copilot.md). Independent paths that share a wire.

**⚠️ Stale-serve is deliberate.** `fetchCrowd` returns cached odds when Kalshi is slow or down,
rather than nothing. If you remove that, the crowd signal starts disappearing intermittently and
`crowdOver:2221` silently reweights. Kalshi settles on a 60-second CF Benchmarks index — the
crowd number is not a live tick.

## See
`cloudflare-worker/worker.js:578`. Prose: `README.md` → *Crowd odds (Kalshi)*.
