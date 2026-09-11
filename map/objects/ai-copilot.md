---
type: part
source: eth-tracker.html:4831-4910, cloudflare-worker/worker.js:835-1119
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
| `marketContext` | 4831 | assembles what the model is told |
| `aiWorthIt` | 4857 | **the spend gate** — decides whether this round is worth paying for |
| `callWorker` | 4881 | the request (paid, or `crowdOnly`) |
| `applyCrowd` | 4910 | folds the reply in |

**Worker side** — `buildPrompt:836` (market-anchored; physics + calibration + auto-tracker;
returns a numeric `probOver`), then `pickProvider:607` → `getAIRead:1020` →
`readAnthropic:1053` / `readGemini:1101` / `readGroq:1120` → `normalize:959`.

## If you change this

**Hits**
- [probability-engine](probability-engine.md) — `aiOver:2269` consumes this read as one of six
  signals. It is weighted, not decisive.
- **Cost.** `aiWorthIt:4857` is the only thing between the app and unbounded spend. Loosening
  it is a budget change, not a quality change — say so plainly.
- [worker](worker.md) — request and response shape, unshared and untyped across the wire

**Does not hit**
- [crowd-odds](crowd-odds.md) — same wire, different path. Crowd is free and works with the AI
  disabled.

## See
`eth-tracker.html:4700` (the gate), `cloudflare-worker/worker.js:835` (the prompt).
Prose: `README.md` → *AI Co-Pilot (Cloudflare Worker)*.
