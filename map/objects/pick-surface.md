---
type: part
source: eth-tracker.html:2978-5841, 5674
status: verified
universe: live
risk: picks
verified_at: r105 2026-10-20
---

# pick-surface — what the call looks like

**Renders the call. Derives nothing.** That separation is deliberate: if a number looks wrong,
the bug is in [probability-engine](probability-engine.md), not here.

## Shape

| Function | Line | Does |
|---|---|---|
| `setGlow` | 2994 | the confidence glow |
| `renderPickCard` | 3005 | locked call + next-round ribbon |
| `renderLean` | 3424 | the lean indicator |
| `renderHero` | 5883 | the verdict slab: picks fill (`go`/`no`/`soft`/`skip`), builds the headline via `v(verb, side)`, calls `slipRow` |

## If you change this

**Hits** — [bet-slip](bet-slip.md), because `renderHero:5883` calls `slipRow:5844` directly.

**Does not hit** — the pick itself. Changing wording, colour, or layout here cannot change what
the model says. If you find yourself computing a probability in this file, it belongs in
`combinedOdds:2574` instead.

## See
`eth-tracker.html:5617`.
