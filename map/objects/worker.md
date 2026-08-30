---
type: part
source: cloudflare-worker/worker.js
status: verified
universe: live
risk: both
verified_at: 0e0b66a 2026-08-30
---

# worker — the Cloudflare side

2,088 lines. Does four unrelated jobs, which is why it is worth a card.

## Shape

| Job | Entry | Then |
|---|---|---|
| HTTP | `fetch` handler | health, `?discover`, `?crowd`, `?picks`, and the POST path |
| AI read | `getAIRead:939` | `pickProvider:532` → `readAnthropic:972` / `readGemini:1009` / `readGroq:1028` → `normalize:880` |
| Prompt | `buildPrompt:761` | market-anchored; physics + calibration + auto-tracker; returns numeric `probOver` |
| Crowd | `getKalshiCrowd:578` | `fetchCrowd:617`, KV cached with stale-serve |
| Cron | `scheduled` → `runCoinPick:1836` | grade + `freePick:1476` + KV, using `cbMicro:1119` / `cbObi:1397` |

## If you change this

**Hits**
- [ai-copilot](ai-copilot.md) — the app calls `callWorker:4724`; a response-shape change breaks
  it silently, since there is no shared type
- [crowd-odds](crowd-odds.md) — same wire, different flag (`crowdOnly` / `noAI`)
- [auto-tracker](auto-tracker.md) — the cron writes what the 24/7 panel reads
- **Money and secrets.** Provider keys and the AI budget live here.

**Does not hit**
- Anything rendered client-side directly. Everything crosses the wire first.

**⚠️ Pinned by config**
`wrangler.toml:5` sets `main = "cloudflare-worker/worker.js"`. The file cannot be moved or
renamed without editing that line in the same commit.

## See

`cloudflare-worker/worker.js:761` (`buildPrompt`) — the highest-leverage function here.
Setup and deploy: `cloudflare-worker/README.md`.
