---
type: part
source: eth-tracker.html:4716, cloudflare-worker/worker.js:652-691
status: verified
universe: live
risk: picks
verified_at: r105 2026-10-20
---

# crowd-odds — what Kalshi thinks

Free. Works with the AI switched off.

| Function | Where | Does |
|---|---|---|
| `refreshCrowd` | 4889 | asks the worker |
| `applyCrowd` | 4953 | folds it in |
| `getKalshiCrowd` | worker.js:652 | current + `next` round |
| `fetchCrowd` | worker.js:691 | the call, KV cached with stale-serve |

**Without the access token (r105).** Every Worker POST needs the per-device `ACCESS_TOKEN`, the free
crowd-only poll included. A device without it now falls back to the open `GET ?crowd=COIN` read via
`crowdViaGet:4904`, so the crowd price never depends on the token. That read has no next-round market
and no shared AI read. Before r105 the fallback did not exist, and an unauthorized phone lost the crowd
**silently** — its live call ran without the one input the audits found predictive.

## If you change this

**Hits** — [probability-engine](probability-engine.md) via `crowdOver:2359`, one of six signals.

**Does not hit** — [ai-copilot](ai-copilot.md). Independent paths that share a wire.

**⚠️ Stale-serve is deliberate.** `fetchCrowd` returns cached odds when Kalshi is slow or down,
rather than nothing. If you remove that, the crowd signal starts disappearing intermittently and
`crowdOver:2359` silently reweights. Kalshi settles on a 60-second CF Benchmarks index — the
crowd number is not a live tick.

## See
`cloudflare-worker/worker.js:652`. Prose: `README.md` → *Crowd odds (Kalshi)*.
