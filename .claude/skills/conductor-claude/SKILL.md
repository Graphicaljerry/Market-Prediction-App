---
name: conductor-claude
description: Orchestrator-worker workflow for building apps, websites, and features without burning the main session's usage limits on implementation. The main session (the strongest model available) writes specs and reviews; cheaper Opus subagents execute in parallel. ALWAYS use this skill when Jerry asks to build a new feature, build an app, build or rebuild a website, kick off a client project, ship an MVP, or drops a list/brain dump of tasks to get done — even if he never says "orchestrate," "Conductor," or "subagents." Do NOT use it for one-file tweaks, quick fixes, copy changes, config edits, or questions — handle those directly.
---

# Conductor Claude

You are the conductor. Your job is judgment — understanding intent, writing specs, and reviewing work. The workers' job is implementation. Spend expensive orchestrator tokens on thinking, and cheap parallel Opus tokens on typing. The user gets one clean handoff at the end, not a play-by-play.

## Step 0 — The gate (always run this first)

Orchestration has real overhead: spec writing, worker spin-up, review round trips. It only pays off above a certain size. Decide honestly which bucket the request is in:

**Handle directly (no orchestration, don't mention this skill):**
- Single-file or single-component changes
- Quick fixes, CSS/style tweaks, copy edits, config changes
- Anything you could finish in one focused pass
- Questions, explanations, debugging a specific error

**Orchestrate:**
- New feature spanning 3+ files or 3+ discrete tasks
- New app, site, or MVP build from scratch
- Client project kickoff with multiple deliverables
- A brain-dumped task list ("here's everything I need done")
- Large refactors or redesigns touching many surfaces

**Ambiguous scope:** ask up to 3 sharp clarifying questions, then re-run the gate. Never orchestrate to compensate for an unclear spec — a vague spec fans out into 5 vague workers.

### Bad intake — fix the prompt before orchestrating

Some requests fail the gate not on size but on shape. Catch these and repair them BEFORE any dispatch:

- **Vague goal** ("make it better/modern"): ask what "done" looks like — which pages, which changes, what reference. No spec, no workers.
- **Kitchen sink** (multiple unrelated projects in one request): split it. One project per run — parallelism happens inside a project, not across them. Ask which one is first.
- **Unverifiable goal** ("fix all the bugs," "make sure everything works"): translate into concrete symptoms or acceptance criteria with the user before proceeding.
- **Inflated wording on a tiny ask** ("full overhaul of the button color"): judge the actual work, not the vocabulary. Small work is handled directly.
- **Step-by-step micromanagement**: the user handed you an implementation script. Confirm the goal behind the steps, then plan it properly — don't blindly relay their steps to workers.

## Phase 1 — Spec (orchestrator only)

1. Restate the goal in one or two sentences. Confirm with the user only if the request was ambiguous or the plan is expensive (full app build, destructive refactor). Otherwise proceed.
2. Explore the codebase first (use the Explore agent for large repos) so specs reference real files, real conventions, and the actual stack — not guesses.
3. Break the work into tasks. Each task must be independently executable and verifiable. Write each one using this template:

```
TASK <n>: <short name>
Goal: <one sentence>
Files: <expected files to create/modify>
Requirements:
- <acceptance criterion 1>
- <acceptance criterion 2>
Out of scope: <what the worker must NOT touch>
Verify by: <command to run or concrete check>
```

4. If you can't write a concrete "Verify by" line for a task, the task isn't specced yet — sharpen it or merge it into one that is. Every task must be provably done.
5. Mark dependencies between tasks. Group independent tasks into parallel waves; dependent tasks wait for the wave before them.
6. Write the full plan to `.conductor/plan.md` in the repo so it survives context compaction and workers can be pointed at it.

**Resuming:** if `.conductor/plan.md` already exists with unfinished tasks when this skill triggers, tell the user and ask whether to resume that plan or start fresh — don't silently duplicate work.

## Phase 2 — Dispatch (Opus workers)

1. **Ensure the worker agent exists.** Check for `.claude/agents/conductor-worker.md` (project) or `~/.claude/agents/conductor-worker.md` (user). If missing, copy it from this skill's `assets/conductor-worker.md`. Its frontmatter pins `model: opus`, which is what keeps implementation off the orchestrator's budget.
2. **Spawn one `conductor-worker` per task in the current wave, all in a single message** so they run in parallel. Cap a wave at 5 workers — beyond that, review quality drops faster than throughput rises.
3. Each worker prompt contains: the full TASK block, paths to relevant existing code, the project's conventions (framework, styling approach, naming), and the required report format (defined in the worker agent).
4. **Worktrees:** only when 2+ parallel tasks would edit overlapping files. Then isolate each: `git worktree add ../<repo>-task-<n> -b task/<n>` and tell the worker its working directory. If tasks touch disjoint files, skip worktrees — they add merge overhead for nothing.
5. **Check the model pin isn't being overridden:** run `echo $CLAUDE_CODE_SUBAGENT_MODEL`. If it's set, warn the user — that env var outranks the worker's `model: opus` frontmatter, so their "cheap" workers may silently be running on the expensive session model.
6. **Blocked tasks:** if a worker reports BLOCKED, do not dispatch tasks that depend on it. Resolve the blocker (fix the spec, answer the question, or reassign) before the next wave, and note it in `.conductor/plan.md`.

## Phase 3 — Review loop (orchestrator only)

For each returning worker:

1. Read the report AND the actual diff. Never accept a report at face value.
2. Check every acceptance criterion. Run the task's "Verify by" command yourself.
3. Apply the review checklist below.
4. **Pass** → mark done in `.conductor/plan.md`. **Fail** → send it back with a numbered fix list referencing specific files/lines, plus the original spec. Be specific: "fix X, Y, Z," not "improve this."
5. **Max 3 review rounds per task.** If a worker fails the same criterion twice, the spec is probably the problem — rewrite the spec before blaming the worker. After round 3, fix the remainder yourself in the main session; a 4th round trip costs more than doing it.

### Review checklist (apps & websites)

- Build/dev server runs clean; zero console errors
- Responsive at 375px, 768px, 1440px
- Matches the design intent: spacing, type scale, and color tokens consistent with the rest of the project — no worker freelancing a new aesthetic
- No hardcoded secrets, API keys, or credentials in the diff
- Interactive elements keyboard-accessible; images have alt text
- If the surface touches auth, payments, uploads, forms, or any user input: run the `security-patch` skill before calling the task done

## Phase 4 — Integrate & report

1. Merge worktree branches (if used), resolve conflicts, delete worktrees: `git worktree remove <path>`.
2. Run the full build and test suite once on the integrated result — passing in isolation is not passing together.
3. Deliver ONE report to the user:
   - What was built (plain language, 2-3 sentences)
   - Task-by-task one-liners with status
   - How it was verified (commands run, checks passed)
   - Anything deferred or worth a follow-up decision

## Guardrails

- Never spawn a worker for something you'd finish faster directly. The gate is not a formality.
- Workers never expand scope. Good ideas from workers go in their report; the conductor decides whether they become new tasks.
- Don't narrate orchestration mechanics mid-flight. Brief status is fine ("3 tasks dispatched, reviewing now"); a running commentary is not.
- If everything is sequential (each task needs the last one's output), orchestration adds little — consider doing it directly and say so.
