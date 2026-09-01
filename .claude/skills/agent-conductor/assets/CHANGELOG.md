# Agent Conductor — changelog

This file is not loaded when the skill triggers. It's here for when someone (or Claude, when asked) wants the history — reading it costs nothing on every build, only when it's actually opened.

## v3.5.0 — 2026-09-01
The architect now decides model and effort per task across the full ladder, not just standard-vs-hard. Added a third tier, `critical` (frontier model, high effort), for tasks where being wrong is expensive to reverse — data migrations, money movement, auth boundaries — or where the reasoning exceeds what a spec can carry. Hard-gated: max one per build, must carry a `Why critical:` justification the user sees at plan approval, and the architect is told the cheaper move is usually to split the critical core out into a small task. Gave the architect an explicit decision rule for the first time: quality first, cost as tiebreaker — when torn between tiers, go up, within budget caps. Escalation is now a ladder (standard → hard → critical), each rung earned by a failure at the one below.

## v3.4.0 — 2026-09-01
Architect and reviewer moved back up to high effort, on a clearer principle than before: effort goes where reasoning decides the outcome (two small-context calls that shape the whole build), not where it multiplies (five parallel workers). The user's stated priority is solving the problem right the first time over saving tokens on any single call — and a wrong plan is the most expensive failure in the pipeline. Sonnet workers stay at medium; the Opus hard worker remains the only high-effort implementation path, reached by tagging or by evidence.

## v3.3.0 — 2026-09-01
Added version tracking. `version` / `updated` in every file's frontmatter, a one-line stamp under the SKILL.md title, and this changelog. So a session can now answer "what version is this / when was it last touched" by reading the file instead of guessing.

## v3.2.0 — same build, prior to 2026-09-01
Adopted Fable 5.1's effort guidance: architect and reviewer moved from high to medium effort (Anthropic's own benchmarks show medium-on-5.1 matching or beating high-on-5 at much lower cost). Model pin changed to the `fable` alias so it tracks the newest Fable automatically. Reviewer now required to name root causes, not just symptoms, in its fix instructions. Final report gained a MODELS USED ledger — built from actual dispatch records, never from asking a model to self-identify.

## v3.1.0 — same build, prior to 2026-09-01
Folded in two ideas from a Claude Code tips reel ("The Burn"): a context pre-flight check before Phase 1 (report `/context`, recommend `/clear` if the window's half full or more, since the plan file makes that free), and mandatory visual verification for any UI task — a build that compiles is not a page that renders correctly, so the architect must spec a visual check, workers must look before reporting, and tier-1 review must open the running app.

## v3.0.0 — same build, prior to 2026-09-01
Added tier routing. The architect now tags every task `standard` or `hard` while writing the plan, at no extra cost since it's already reading the request. Standard tasks go to the Sonnet worker; hard ones (novel logic, security-sensitive flows, concurrency, real performance tradeoffs, risky data models) go to a new Opus worker (`conductor-worker-hard`). Escalation from Sonnet to Opus now requires two failed review rounds as evidence, not a hunch — a vague task doesn't get rescued by a bigger model, it gets a sharper spec.

## v2.1.0 — 2026-08-29
Hardened the session-model check into a blocking first step (skill now stops and asks before proceeding if the session itself is running on an expensive model, since a resumed session keeps whatever model it was saved with regardless of settings files) and added an offer to set `.claude/settings.json` so new sessions in a project default to Sonnet.

## v2.0.0 — 2026-08-29
Full rewrite and rename from "Conductor Claude" to "agent-conductor" (the former was rejected on upload — "claude" is a reserved word in the `name:` field). Rebuilt around a cost-tiered architecture: the session itself runs cheap and acts as clerk, a Fable subagent appears twice as architect and reviewer with fresh minimal context each time, and Sonnet subagents do the implementation. Added the bad-intake gate (vague goals, kitchen sinks, unverifiable asks, inflated wording, micromanagement all get repaired before dispatch), plan-file resume support, and a check for the `CLAUDE_CODE_SUBAGENT_MODEL` env var overriding the pinned models.

## v1.0.0 — 2026-08-28
Initial build, "Conductor Claude": the gate, the TASK spec template, a single Opus worker tier, and the four-phase spec → dispatch → review → integrate workflow. Superseded by v2.0.0 before it ever shipped.
