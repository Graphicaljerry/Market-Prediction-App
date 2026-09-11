---
type: part
source: cloudflare-worker/worker.js
status: verified
universe: live
risk: both
verified_at: a8bd703 2026-09-08
---

# worker — the Cloudflare side

2,250 lines. Does five jobs (abuse controls joined in r100), which is why it is worth a card.

## Shape

| Job | Entry | Then |
|---|---|---|
| HTTP | `fetch` handler | health, `?discover`, `?crowd`, `?picks`, and the POST path |
| AI read | `getAIRead:1020` | `pickProvider:607` → `readAnthropic:1053` / `readGemini:1101` / `readGroq:1120` → `normalize:959` |
| Prompt | `buildPrompt:836` | market-anchored; physics + calibration + auto-tracker; returns numeric `probOver` |
| Crowd | `getKalshiCrowd:653` | `fetchCrowd:692`, KV cached with stale-serve |
| Cron | `scheduled` → `runCoinPick:1996` | grade + `freePick:1636` + KV, using `cbMicro:1211` / `cbObi:1557` |
| Abuse controls (r100) | `allowedOrigin`, `rateLimited`, `tokenOK` (top of the file) | CORS pin, per-IP limits, token gate on destructive/costly endpoints; `withCors` wraps every response |

## If you change this

**Hits**
- [ai-copilot](ai-copilot.md) — the app calls `callWorker:4845`; a response-shape change breaks
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

`cloudflare-worker/worker.js:835` (`buildPrompt`) — the highest-leverage function here.
Setup and deploy: `cloudflare-worker/README.md`.
