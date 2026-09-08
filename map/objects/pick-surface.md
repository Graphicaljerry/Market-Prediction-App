---
type: part
source: eth-tracker.html:2856-3273, 5674
status: verified
universe: live
risk: picks
verified_at: 0e0b66a 2026-08-30
---

# pick-surface — what the call looks like

**Renders the call. Derives nothing.** That separation is deliberate: if a number looks wrong,
the bug is in [probability-engine](probability-engine.md), not here.

## Shape

| Function | Line | Does |
|---|---|---|
| `setGlow` | 2871 | the confidence glow |
| `renderPickCard` | 2882 | locked call + next-round ribbon |
| `renderLean` | 3301 | the lean indicator |
| `renderHero` | 5674 | the verdict slab: picks fill (`go`/`no`/`soft`/`skip`), builds the headline via `v(verb, side)`, calls `slipRow` |

## If you change this

**Hits** — [bet-slip](bet-slip.md), because `renderHero:5674` calls `slipRow:5648` directly.

**Does not hit** — the pick itself. Changing wording, colour, or layout here cannot change what
the model says. If you find yourself computing a probability in this file, it belongs in
`combinedOdds:2451` instead.

## See
`eth-tracker.html:5617`.
