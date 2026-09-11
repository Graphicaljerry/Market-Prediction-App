---
type: part
source: eth-tracker.html:2978-5841, 5674
status: verified
universe: live
risk: picks
verified_at: a8bd703 2026-09-08
---

# pick-surface — what the call looks like

**Renders the call. Derives nothing.** That separation is deliberate: if a number looks wrong,
the bug is in [probability-engine](probability-engine.md), not here.

## Shape

| Function | Line | Does |
|---|---|---|
| `setGlow` | 2978 | the confidence glow |
| `renderPickCard` | 2989 | locked call + next-round ribbon |
| `renderLean` | 3408 | the lean indicator |
| `renderHero` | 5841 | the verdict slab: picks fill (`go`/`no`/`soft`/`skip`), builds the headline via `v(verb, side)`, calls `slipRow` |

## If you change this

**Hits** — [bet-slip](bet-slip.md), because `renderHero:5841` calls `slipRow:5802` directly.

**Does not hit** — the pick itself. Changing wording, colour, or layout here cannot change what
the model says. If you find yourself computing a probability in this file, it belongs in
`combinedOdds:2558` instead.

## See
`eth-tracker.html:5617`.
