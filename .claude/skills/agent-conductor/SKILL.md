---
name: agent-conductor
description: Cost-efficient orchestrator-worker workflow for building apps, websites, and features. The session runs on a cheap model and acts as clerk; a frontier-model architect subagent writes the spec, Sonnet workers implement in parallel, and a frontier-model reviewer subagent judges the result — so the expensive model only ever sees small, focused context. ALWAYS use this skill when the user asks to build a new feature, build an app, build or rebuild a website, kick off a client project, ship an MVP, or drops a list/brain dump of tasks — even if they never say "orchestrate," "conductor," or "subagents." Do NOT use it for one-file tweaks, quick fixes, copy changes, config edits, or questions — handle those directly.
---

# Agent Conductor

## The cost model (read this first — it drives every rule below)

The expensive thing is not which model is smartest. It is **how much context the expensive model has to re-read on every single turn.** A frontier model driving a long session re-processes the entire growing transcript each turn, at frontier weight. That is what empties a 5-hour window in four prompts.

So this skill inverts the obvious design:

- **The main session is the clerk, not the brain.** It runs on a cheap model and does bookkeeping: dispatching, running verify commands, merging, git, writing files. Cheap work at cheap rates.
- **The frontier model is a consultant, not the driver.** It appears twice per build — once as the architect writing specs, once as the reviewer judging results — each time as a subagent with a fresh, tiny context. It never carries the session transcript.
- **Workers are Sonnet, not Opus.** A well-written spec plus a review loop protects quality. Paying frontier or Opus rates for bricklaying is the waste this skill exists to eliminate.

Subagents are not free — each reloads system prompts and tool definitions, and subagent-heavy workflows can multiply token use several times over. That is exactly why the gate below matters, and why small work never gets orchestrated.

## Required setup

### Check the session model FIRST — before the gate, before anything

Subagent routing is guaranteed by frontmatter and needs no attention. The session model is the one thing that is not, because **a resumed session keeps whatever model it was saved with, ignoring settings files.** So on every invocation:

1. Determine the current session model.
2. If it is a frontier model (Fable, Opus), stop and tell the user in one line: the session is running on an expensive model, and they should run `/model sonnet` before continuing — the subagents will still route correctly, but the clerk work will cost several times more than it should. Wait for them to switch or to say go ahead anyway.
3. If it is already Sonnet or Haiku, say nothing and proceed.

Never switch models silently, and never claim to have switched — a skill cannot change the session model, only the user can.

### Project default (offer once per repo)

If `.claude/settings.json` in the project root has no `"model"` key, offer to add `{"model": "sonnet"}`. That makes every *new* session in this repo start cheap automatically. It does not affect resumed sessions.

Three agent files must exist in `.claude/agents/` (project) or `~/.claude/agents/` (user). If any are missing, copy them from this skill's `assets/` folder:

| Agent | Model | Job |
|---|---|---|
| `conductor-architect` | frontier | Turns a brain dump into a task plan |
| `conductor-worker` | sonnet | Implements a standard task |
| `conductor-worker-hard` | opus | Implements a task tagged hard |
| `conductor-reviewer` | frontier | Judges quality after mechanical checks pass |

Also run `echo $CLAUDE_CODE_SUBAGENT_MODEL` once. If it's set, warn the user — that variable outranks every `model:` field in frontmatter and will silently route all three agents to the same model, destroying the cost split.

## Step 0 — The gate

Orchestration has real overhead. It only pays off above a certain size.

**Handle directly (no orchestration, don't mention this skill):**
- Single-file or single-component changes
- Quick fixes, CSS/style tweaks, copy edits, config changes
- Anything finishable in one focused pass
- Questions, explanations, debugging a specific error

**Orchestrate:**
- New feature spanning 3+ files or 3+ discrete tasks
- New app, site, or MVP build from scratch
- Client project kickoff with multiple deliverables
- A brain-dumped task list
- Large refactors or redesigns touching many surfaces

### Bad intake — repair the prompt before orchestrating

- **Vague goal** ("make it better/modern"): ask what "done" looks like. No spec, no workers.
- **Kitchen sink** (multiple unrelated projects): split it. One project per run. Ask which is first.
- **Unverifiable goal** ("fix all the bugs"): translate into concrete symptoms and acceptance criteria.
- **Inflated wording on a tiny ask** ("full overhaul of the button color"): judge the work, not the vocabulary.
- **Step-by-step micromanagement**: confirm the goal behind the steps, then plan it properly.

## Phase 1 — Spec (architect subagent)

1. **Gather context cheaply.** Use the built-in Explore agent to map the codebase — stack, conventions, relevant file paths, existing components. Its verbose output stays in its own context; only the summary returns. Never read a dozen files into the main session.
2. **Spawn `conductor-architect` once**, passing: the user's request verbatim, the Explore summary, and any constraints the user gave (design tokens, off-limits paths, deadlines). Nothing else — no transcript, no file dumps.
3. The architect returns the full task plan. **Write it to `.conductor/plan.md`.**
4. Show the user a condensed version (task names and one-liners) and get a go-ahead before dispatching. This is the cheapest possible moment to catch a wrong plan.

**Resuming:** if `.conductor/plan.md` exists with unfinished tasks, ask whether to resume or start fresh. Never silently duplicate work.

## Phase 2 — Dispatch (Sonnet workers)

1. Spawn one worker per task in the current wave, **all in a single message** so they run in parallel. Cap a wave at 5.
   - **Route by the task's `Tier`:** `standard` → `conductor-worker` (Sonnet). `hard` → `conductor-worker-hard` (Opus).
   - The architect assigns tiers while writing the plan, so this costs nothing extra — the model that understands the work best is the one deciding how much horsepower it needs.
   - The user can override any tier when they approve the plan ("make task 3 hard", "run all of these on Opus"). Their call wins.
2. Each worker prompt contains: the TASK block from the plan, relevant file paths, project conventions, and nothing else. Workers read what they need themselves — do not paste file contents into their prompts.
3. **Worktrees:** only when 2+ parallel tasks would edit overlapping files. Then `git worktree add ../<repo>-task-<n> -b task/<n>` and tell each worker its directory. Disjoint files means no worktrees — they add merge overhead for nothing.
4. **Blocked tasks:** do not dispatch anything depending on a BLOCKED task. Resolve the blocker first and note it in the plan file.

## Phase 3 — Two-tier review

The main session does the cheap checks. The frontier reviewer only sees work that already passed them.

**Tier 1 — mechanical (main session, no subagent):**
- Run each task's `Verify by` command
- Build/dev server runs clean, no console errors
- Every acceptance criterion in the spec is present
- No hardcoded secrets or keys in the diff

Failures go straight back to the worker with a numbered fix list. The frontier model is never spent on "you forgot to run the build."

**Tier 2 — judgment (`conductor-reviewer` subagent, once per wave):**
Batch the whole wave into one review call, not one per task. Pass condensed diffs and the specs — not the full session history. The reviewer judges what only a frontier model can:
- Design coherence: spacing, type scale, color tokens consistent with the project — no worker freelancing a new aesthetic
- Architectural fit and sane abstractions
- Responsive behavior at 375px / 768px / 1440px
- Accessibility: keyboard operability, alt text, contrast
- Whether the work actually solves the user's stated goal

**Loop cap: 3 rounds per task.** After round 3, finish it in the main session.

**Escalate on evidence, not on hunches.** If a `standard` worker fails the same criterion twice, do not send it a third time. Decide which failure this is:
- **The spec was unclear** → rewrite the spec, re-dispatch as standard. A bigger model cannot read your mind either.
- **The spec was clear and the work was genuinely beyond it** → re-dispatch the same task to `conductor-worker-hard`, with the failed attempts summarized so Opus doesn't repeat them.

This is cheaper than it looks. Two failed rounds plus a third cost more than one Opus pass, and Opus costs a fraction of what the frontier reviewer costs to run again. Start cheap, escalate on proof.

**Security:** if any surface touches auth, payments, uploads, forms, or user input, run the `security-patch` skill before calling the wave done.

## Phase 4 — Integrate & report

1. Merge worktree branches, resolve conflicts, `git worktree remove <path>`.
2. Run the full build and test suite once on the integrated result. Passing in isolation is not passing together.
3. Deliver ONE report: what was built (plain language), task-by-task status, how it was verified, anything deferred.

## Cost discipline

- **Suggest `/clear` between phases.** The plan file on disk is the handoff, so clearing costs nothing and stops the session transcript from compounding.
- **Never paste file contents into the main session** when a path reference will do.
- Point the user at `/context` (what's filling the window) and `/usage` (spend attributed per skill and subagent) if a build felt expensive.
- If every task is sequential — each needs the last one's output — orchestration adds little. Say so and offer to do it directly.
- Never spawn a worker for something finishable faster inline. The gate is not a formality.
- Workers never expand scope. Their ideas go in the report; the conductor decides if they become tasks.
