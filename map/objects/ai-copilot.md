---
type: part
source: eth-tracker.html:4674-4753, cloudflare-worker/worker.js:761-1028
status: verified
universe: live
risk: picks
verified_at: 0e0b66a 2026-08-30
---

# ai-copilot — the paid read

**A `picks` part**, and the only one that costs money per call.

## Shape

**Client side**

| Function | Line | Does |
|---|---|---|
| `marketContext` | 4674 | assembles what the model is told |
| `aiWorthIt` | 4700 | **the spend gate** — decides whether this round is worth paying for |
| `callWorker` | 4724 | the request (paid, or `crowdOnly`) |
| `applyCrowd` | 4753 | folds the reply in |

**Worker side** — `buildPrompt:761` (market-anchored; physics + calibration + auto-tracker;
returns a numeric `probOver`), then `pickProvider:532` → `getAIRead:939` →
`readAnthropic:972` / `readGemini:1009` / `readGroq:1028` → `normalize:880`.

## If you change this

**Hits**
- [probability-engine](probability-engine.md) — `aiOver:2147` consumes this read as one of six
  signals. It is weighted, not decisive.
- **Cost.** `aiWorthIt:4700` is the only thing between the app and unbounded spend. Loosening
  it is a budget change, not a quality change — say so plainly.
- [worker](worker.md) — request and response shape, unshared and untyped across the wire

**Does not hit**
- [crowd-odds](crowd-odds.md) — same wire, different path. Crowd is free and works with the AI
  disabled.

## See
`eth-tracker.html:4700` (the gate), `cloudflare-worker/worker.js:761` (the prompt).
Prose: `README.md` → *AI Co-Pilot (Cloudflare Worker)*.
