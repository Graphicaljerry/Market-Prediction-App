# CLAUDE.md

Project memory for the **15-Minute Crypto Over/Under Tracker**. Read this at the start of
every session and follow the conventions below.

## Where things live

| If you want | Go to |
|---|---|
| what the app is and why | `README.md` |
| **where a piece of code lives, and what changing it hits** | **`map/objects/_index.md`** |
| "I am changing X — what do I open?" | `map/effects/CONTEXT.md` |
| Worker setup: keys, providers, deploy, cron | `cloudflare-worker/README.md` |
| what shipped recently | `README.md` → *What's new (latest)* |

The app is three big files — `eth-tracker.html` (6,299 lines), `cloudflare-worker/worker.js`
(2,255), `README.md` (1,471) — with no modules to navigate by. **Read the map before opening
the code**, not after.

## Tell me what changed, in plain terms (standing rule)

When you ship something, explain it to me **in chat** in **simple, concise language**: what changed
and — most important — whether it touches the **live picks / commitment / confidence** or only the
**log / measurement**. I care more that the **picks** are accurate than that the log looks tidy, so
**always call out explicitly when a change could alter pick behavior**, and prefer leaving the proven
picker alone unless we've agreed otherwise. For a big change give a short plain-English summary; for a
batch of small ones, summarize the last few. (This is on top of — not instead of — keeping the docs in
sync below.)

**Default to layman's terms — for everything, not just change-summaries.** When I ask how something
works, or you walk me through the technical side, explain it in plain, simple language with analogies
over jargon (avoid weights, function names, and math unless I ask for the deep version). I'd rather
understand the idea than see the implementation. If a technical detail matters, give the plain version
first, then offer the deeper one.

## Keep the docs in sync with the app (standing rule)

Whenever we ship a **notable feature** or land an **important insight** about how the app
works, **document it in the Markdown files as part of the same change** — never leave it only
in code or in chat. Updating the docs is part of "done," not a follow-up.

**What's worth recording**

- A new user-facing feature or panel, or a meaningful change to an existing one.
- A change to how the core logic *behaves* — probability/barrier model, indicator engine,
  round settlement/grading, the per-coin learned model, conviction/"which to follow".
- A non-obvious insight or gotcha we discovered and would want written down (e.g. how Kalshi
  settles on a 60-sec CF Benchmarks index, a data quirk, a rate-limit/caching workaround).
- Anything that changes deploy, secrets, cron, or the AI model/budget.

Skip the noise: typo fixes, pure refactors, and formatting don't need an entry.

**Where it goes**

- **`README.md` → `## What's new (latest)`** — the primary changelog. Add a **bold-led bullet,
  newest first**, matching the existing entries' voice: lead with the bold headline of *what*
  changed, then plainly say *why it matters*. Keep it tight.
- **The relevant deeper `README.md` section** (e.g. _The probability engine_, _Indicator
  engine_, _24/7 Auto-Tracker_, _AI Co-Pilot_, _Architecture_, _Data persistence_) — update the
  body so it stays accurate, not just the changelog. If a change makes existing doc text wrong,
  fix that text in the same pass.
- **`cloudflare-worker/README.md`** — for anything about the Worker: deploy, secrets, cron, AI
  model/budget, or the Kalshi crowd-odds series tickers.

When in doubt, write it down — future sessions only know what the docs say.
