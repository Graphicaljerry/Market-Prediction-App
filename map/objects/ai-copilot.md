---
type: part
source: eth-tracker.html:4674-4753, cloudflare-worker/worker.js:835-1119
status: verified
universe: live
risk: picks
verified_at: a8bd703 2026-09-08
---

# ai-copilot — the paid read

**A `picks` part**, and the only one that costs money per call.

## Shape

**Client side**

| Function | Line | Does |
|---|---|---|
| `marketContext` | 4724 | assembles what the model is told |
| `aiWorthIt` | 4750 | **the spend gate** — decides whether this round is worth paying for |
| `callWorker` | 4774 | the request (paid, or `crowdOnly`) |
| `applyCrowd` | 4803 | folds the reply in |

**Worker side** — `buildPrompt:835` (market-anchored; physics + calibration + auto-tracker;
returns a numeric `probOver`), then `pickProvider:606` → `getAIRead:1019` →
`readAnthropic:1052` / `readGemini:1100` / `readGroq:1119` → `normalize:958`.

## If you change this

**Hits**
- [probability-engine](probability-engine.md) — `aiOver:2162` consumes this read as one of six
  signals. It is weighted, not decisive.
- **Cost.** `aiWorthIt:4750` is the only thing between the app and unbounded spend. Loosening
  it is a budget change, not a quality change — say so plainly.
- [worker](worker.md) — request and response shape, unshared and untyped across the wire

**Does not hit**
- [crowd-odds](crowd-odds.md) — same wire, different path. Crowd is free and works with the AI
  disabled.

## See
`eth-tracker.html:4700` (the gate), `cloudflare-worker/worker.js:835` (the prompt).
Prose: `README.md` → *AI Co-Pilot (Cloudflare Worker)*.
