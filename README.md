# 15-Minute Crypto Over/Under Tracker

A single-page web app that mirrors Coinbase's **"15 min"** crypto market (the
Kalshi-powered Over/Under: *will the price be above its round-open level 15 minutes
from now?*) and helps you decide which way to bet. It pulls **live prices**, models the
**probability of finishing above the line** from real market physics, **auto-grades** its
own track record and **calibrates** to it, runs a **24/7 server-side auto-tracker**, and
folds in an **AI Co-Pilot** that weighs everything against the **live Kalshi crowd** —
then tells you what to play for the **next round** right before the clock runs out.

> **Live app:** https://graphicaljerry.github.io/Market-Prediction-App/
> **Design (Figma):** https://www.figma.com/design/K8o8dinrXn2XmHO7T3i9JV/
> Supports **ETH**, **BTC**, **SOL**, **XRP**, **DOGE**, **HYPE**, and **BNB** (segmented control on
> desktop, a dropdown on mobile).

---

## What's new (latest)

Recent work, newest first:

- **r99 — the verdict becomes a bet slip, and the clock finally reads as a clock.** Three personality
  directions were mocked as a published design canvas and reviewed before any code moved; the chosen
  one was a hybrid — the *Scoreboard*'s energy on the *Quiet Desk*'s structure. **Display-only: no pick,
  price gate, fee model, grade or logged round changed.**
  - **The countdown is boxed digits, next to the price.** It had been plain numerals in the same colour
    and weight as everything around them, so at a glance it was indistinguishable from the price beside
    it — you had to *read* it to find it. Each digit now sits in its own recessed well with a green rim,
    so the shape alone says "clock". `tickTimer()` writes the same `mm:ss` string it always did, one
    span per character, and only when the string actually changes.
  - **The verdict is one block you could almost press.** The call used to be a coloured headline
    floating on the card with its numbers scattered into chips underneath. It's now a slab whose *fill*
    is the instruction: **solid green/red = act, outlined = it only leans, grey = sit this one out.**
    The block keeps the same size and position in all four states, so nothing below it jumps as rounds
    turn over. The headline splits into a light verb and a heavy italic side (`Bet` + **OVER**) — the
    one piece of typographic personality in the app, and it only ever lands on the word that matters.
  - **The bet, in four terms.** Inside the slab: `78¢ IN · $1.00 OUT · NEED 79.2% · RUNS 83%`. **NEED vs
    RUNS is the comparison that decides everything** — if the price demands 79% and rounds at this price
    have managed 83%, there's an edge; if it's the other way round there isn't, however good the call
    looks, and the RUNS figure turns red to say so. NEED comes from `betMath`, so it follows the venue
    you picked (Kalshi and Robinhood need different win rates at the same price). RUNS is the *measured*
    rate at that price from the 24/7 record and appears only past 20 graded rounds in the band —
    otherwise the app's own estimate shows, labelled `APP`, because a hit rate off six rounds isn't one.
  - **Warm ground.** The greys were dead-neutral blue-black; with no glass left to carry warmth, that
    read as "unfinished" rather than "restrained". Every surface gained a few points of red/yellow and
    `--label` went `#fff` → `#edeae6` (pure white on a warm black reads blue by contrast). Same
    lightness ladder, same contrast ratios — only the hue moved.
  - **Your form, as squares.** "Your record: 12 of 15 (80%)" is a sentence you have to parse; the last
    six settled bets are now solid green/red W/L chips, which is a shape you read instantly.
  - **Two things got said once instead of twice.** The chip row (A-GRADE, crowd price, app %) is retired
    — all three live inside the slab now. And the kicker stopped printing "· 4:57 left", which was the
    fifth place on one screen quoting the same number.
  - Fixed in passing: the page carried **two different greens** — `--accent-rgb` was `13,224,89` while
    `--green` is `#30d158` (`48,209,88`), so every border, focus ring and pulse drawn from the token sat
    a visibly different hue beside a solid green fill. All 18 uses aligned.
  - Caught by the new tests, both in code written for this change: the slip row would fall back to the
    crowd's *favourite* price on a sided round whose own price was missing — quoting the cost of the
    opposite bet — and `.verdict.go .heroCall span` out-specified the A-grade chip's own rule, painting
    it near-black on near-black. Boxing the digits also made the clock ~80px wider than the numerals it
    replaced, which truncated six-figure prices ("104,182.55") on the 410px desktop column; sizes are
    now measured against the worst-case string at seven widths. Suites: **207 assertions pass**
    (128 layout + 43 fee maths + 25 new slip/form + 11 stake UI).

- **r98 — flat theme: the glass comes off.** Requested directly ("remove the gradients/glassmorphism
  and keep 1-2 accent colors"), executed under the newly vendored `conductor-claude` skill (whose own
  Step-0 gate routes a single-file redesign to direct execution — no worker fan-out) with
  `design-taste-frontend` driving the aesthetic. **Display-only.**
  - **No more glass.** The capability probe no longer adds `.glassui`, and the entire liquid-glass
    theme (~130 lines: frosted backdrops, ambient washes, dither film, per-card backing glows, the
    SVG refraction filter and its markup, the drifting page orbs) was **deleted**, not just disabled.
    Cards are solid `--surface` on a solid `--bg` ground with hairline borders; the sticky best-bet
    ticker, coin pickers and prime banner went solid too. Every decorative gradient is gone — the
    timer bar is one solid colour with an opacity pulse instead of a sheen sweep and glow shadows;
    section spines are solid; `.card` drop/inset shadows removed. (The price-vs-line rail keeps its
    red→neutral→green ramp — that one is data, not decoration.)
  - **Two accents, strictly semantic.** Green = over/go — the ⭐ star system (badge, chips, ticker
    border, act-now kicker) converted from amber to green, and the blue brand mark became the one
    green brand square. Red = under/loss. Orange retired: `--orange` and the `glow-skip` accent are
    neutral grey now (skip means "nothing to do", not "caution!"), and the blue Coinbase dot is grey.
  - Also fixed: a stale r97 duplicate rule that was still overriding the record card's tokenised
    padding. Suites: 128 + 25 + 11 assertions pass; page heights unchanged.
  - **Tooling:** the uploaded `conductor-claude` skill was installed at
    `.claude/skills/conductor-claude/` plus its Opus worker agent at
    `.claude/agents/conductor-worker.md`, for future multi-task builds.

- **r97 — one spacing scale, and the last hard edges.** Applied the vendored
  `redesign-existing-projects` / `design-taste-frontend` skills to the two things that still looked
  unfinished. **Display-only.**
  - **The price block and the verdict share ONE glass pane.** r93 welded two separately-glassed
    cards edge to edge with their facing corners squared. Two `backdrop-filter` layers never render
    identically, so the join drew a hard line across the full card width, notched at each end where
    a square corner met a round one — it read as *touching*, not as one card. The glass moved onto a
    `.callCard` wrapper; the halves inside are transparent, divided by a hairline **inset by the same
    `--sp-3` as the padding** (an edge-to-edge rule is what made it look like a join).
  - **One spacing scale.** The page had six vertical gaps — 0, 8, 16, 18, 28, 44px. Now five tokens
    (`--sp-1`…`--sp-5`) drive everything: 20px between cards, 34px between groups, on every screen.
    `.card`'s `margin-bottom: 28px` was leaking into the layout and stacking with module margins —
    the card owns its padding, the layout owns the gaps.
  - **Glows are no longer sliced.** `.card.orb` clips its glow (`overflow: hidden`) but the glows sat
    at `top: -4%` / `bottom: -2%` — deliberately overhanging, so the clip cut them while still bright
    and left a crisp arc. Pulled fully inside with a 7-stop falloff reaching zero before any edge.
    Card shadows tinted to the page hue rather than flat black.
  - The layout suite's "welded, gap === 0" assertion was retired — that was the defect. It now
    asserts the real invariant: both halves inside one pane, the glass on the pane and not the
    halves, the divider inset, and the spacing tokens present. 128 assertions pass.

- **r96 — a price gate on the picker, and a bet calculator that speaks in dollars.**
  - **The picker had no opinion about price.** It committed on its blended probability alone. A
    40-day audit (26,313 rounds; 10,624 of them with ~100% crowd coverage after the Kalshi key
    landed) measured what each price actually returns after fees: 60–65¢ won 61.4% needing 64.1%;
    65–70¢ won 66.3% needing 69.0%; 75–78¢ won 72.1% needing 77.8%; **78–82¢ won 83.3% needing
    81.1%**; 82–86¢ won 73.8% needing 84.9%. Everything it committed at any price ran **−2.5¢ per
    dollar**; restricted to 78–82¢ it ran **+5.5¢**. New `PRICE_MIN`/`PRICE_MAX` gate (default
    78/82) refuses to commit outside that window, and the ⭐ band moved 73–90 → 78–82 to match.
    ~9 bets/day instead of ~36. **Changes pick behaviour.** `PRICE_MIN=0` disables it.
  - **Said plainly, because two previous bands were shipped on this kind of evidence and decayed:**
    the window is 160 bets (~1.4σ), and a fair null test — keep every price, redraw outcomes from
    the smoothed calibration curve, re-run the same 70-band search — reproduces a band this good
    **about 30% of the time (p ≈ 0.30)**. Best available rule, *not* a proven edge. The walk-forward
    check (each day picks its band from prior days only) returned +4.1¢/$ over 137 bets, which is
    the only number with no hindsight in it.
  - **The bet calculator.** Type a stake; the card returns contracts, total cost, profit if it hits,
    loss if it misses, the break-even win rate, and what rounds at that price have actually won.
    Shown on skip rounds too, clearly labelled as not a recommendation.
  - **Real venue fees, from primary schedules.** Kalshi `ceil(0.07·C·P·(1−P))` per *order* — so one
    contract at 80¢ pays 2¢ where a hundred pay 1.12¢ each. Robinhood `min(ceil(k·C·P·(1−P)), 0.01·C)
    + 0.01·C` with k = 0.10 (0.05 on Gold) — **the 1¢-per-contract commission cap is the part that's
    easy to miss**, and it means Gold is worth nothing between ~28¢ and ~72¢. Coinbase publishes no
    schedule at all, so it's modelled conservatively and labelled as an estimate. At 78–82¢ the
    ranking is Kalshi 1.12¢ < RH Gold 1.80¢ < Robinhood/Coinbase 2.00¢ — about 0.9 points of
    required win rate between cheapest and dearest.
  - Fixed a float bug found by the tests: `0.07*100*0.8*0.2` is `1.1200000000000003`, so ceiling it
    landed on 1.13 — a cent of pure arithmetic error on every exact-value order.

- **r95 — the background stops showing rings.** The ambient glows had visible hard arcs. Three
  causes: **banding** (an alpha ramp from ~0.1 to 0 across 900px on a near-black base has only ~12
  representable steps, so it paints as a dozen ~75px bands — a 2%-opacity SVG noise film now dithers
  them away), **linear two-stop gradients that stop dead** at their last stop (each wash is now a
  7-stop, roughly gaussian falloff ending at the same hue with zero alpha, not `transparent`), and a
  **hard elliptical clip** on the per-card backing glow — `border-radius: 50%` was cutting a gradient
  that is centred on the tracked light position, so whenever the light drifted off-centre the clip
  sliced it at meaningful alpha. The clip is gone; the falloff is the shape. The liquid-glass
  displacement was also reduced (scale 28 → 13) and its filter region widened, so it can't tear at
  its own edges. Display-only.

- **r94 — the AI model list keeps itself current.** The model picker was five hand-written options,
  so it was stuck on a generation of models that had already been superseded: every time Google,
  Groq or Anthropic shipped something new, the app quietly kept using the old one. It now asks the
  providers instead of remembering. **The Worker calls each provider's own list-models endpoint**
  (`GET /v1/models` Anthropic, `GET /v1beta/models` Google, `GET /openai/v1/models` Groq), merges
  the answers and serves them at **`?models`**; the app rebuilds its dropdown from that on load,
  every 6h while a tab stays open, and whenever you hit Save. List endpoints aren't inference calls,
  so it costs nothing — free tiers included.
  - **Only real chat models are offered.** Embeddings, image/video, speech and safety-classifier
    models are filtered out (picking one would break the read); for Google the test is whether the
    model advertises `generateContent`, the method the Worker actually calls.
  - **Cached ~6h in KV and warmed by the cron**, so nothing waits on three provider calls. One dead
    provider is reported and the rest still list; all three dead serves the last good list, flagged
    stale. The picker shows how fresh the list is and names any provider that didn't answer.
  - **Your choice is never silently swapped.** If the providers stop listing the model you picked,
    it stays selected and is labelled *"no longer listed"* rather than being replaced under you.
  - **Self-healing at call time** — the one place a substitution does happen. If the model the
    Worker is about to call is gone from its provider's list, calling it 404s and the round gets
    **no AI read at all**; the Worker instead uses the newest model in the same family (retired
    sonnet → newest sonnet, retired flash → newest flash), preserving the cost tier the setting was
    chosen for. **This is the one part of r94 that can change an AI read** — and only in the case
    where the alternative was no read.
  - Two fixes fell out of it: model ids containing `/` (Groq namespaces its catalogue as
    `meta-llama/…`, `openai/gpt-oss-…`) were rejected by the cross-device sync's validation, so
    those models could never sync; and a shared model the local dropdown didn't list was ignored
    outright instead of adopted. Also, the badge's name map was hard-coded — it answered *"Claude
    Sonnet 4.6"* for **any** sonnet id and *"Gemini 2.0 Flash"* for any gemini id, so it kept naming
    a model that wasn't running. It now uses the provider's own display name.
  - The dropdown's built-in options remain as an offline fallback, refreshed to current ids.
  - **Follow-up (r94b), from a real screenshot:** the picker came back with ten Claude models and
    **no Google and no Groq at all, and nothing anywhere said why**. Three fixes. (1) `?models` now
    reports **every** provider in a `providers` map — `{key, ok, count, why}` — because "no API key
    set in the Worker" and "the key works but returned nothing" were indistinguishable from the app:
    the provider was simply absent. The picker prints the reason in amber under the dropdown.
    (2) The Gemini filter now **fails open**: it only excludes a model that *explicitly* advertises
    its methods without `generateContent`. Keeping only models that declare the field means that if
    Google ever omits or renames it, every Gemini model is silently dropped and the whole provider
    vanishes — the exact failure this was meant to prevent. (3) Anthropic and Google list endpoints
    are **paginated** (`has_more`/`last_id`, `nextPageToken`) and were only being read one page deep.
    (4) Adding a key in the Cloudflare dashboard now takes effect on the next app load instead of
    waiting out the 6h cache: the cached list records which providers had a key when it was built,
    and a mismatch against the current environment rebuilds it immediately.

- **r93 — compact layout: nine panels become three.** The page wasn't showing too much information;
  it was showing the *same* information over and over. A full inventory of every surface on screen
  found the call stated **9 times**, the crowd price **8** (four inside one card), the countdown **5**,
  the app's own % **7**, the after-fee edge **4** (all in the pick card) and the hit rate **9**. Every
  copy agreed — but you can't tell that at a glance, so you re-read them to check, and that's what
  read as clutter. Each fact is now said once. **Display-only: no pick, commitment, alert, grade or
  logged round changed.**
  - **One card, not three.** The price card, the countdown card and the verdict card answered one
    question split three ways, and lived in two different columns. They're welded into a single card:
    price and clock share the top row (`.nowTop`), the countdown bar runs under it, the verdict owns
    the middle. `.m-timer` is retired as a panel but kept in the DOM — `tickTimer()`,
    `renderNextPick()` and `renderLastClose()` still write to real nodes.
  - **The top decision bar is gone.** It existed to mirror a verdict that sat below the fold with its
    clock four screens away; r91 and r93 fixed both. Still in the DOM: `renderDecisionBar()` reads
    `#buyLine` / `#oddsPct` / `#recoConf`, and that read is load-bearing.
  - **One voice, finished.** r92 hid four legacy rows but missed the ones still on screen — the
    This/Next Round two-up, the payout line, the off-book warning and the favourite-zone note. All
    four restate the headline or the numbers in its cost row; all four are now suppressed while the
    hero renders.
  - **The 24/7 record is a strip.** Hit rate + recent form always visible; the scoreboard, coverage,
    the model tests, the full round log and the Clear buttons are one tap away.
  - **Settings.** A gear in the nav opens one panel holding everything set once and never touched
    again: play style, AI weighting + trust dial, worker URL / model / spend, alerts. The play-style
    and trust controls **do change picks**, so they now carry their own explanation instead of
    floating unlabelled above the verdict.
  - **Two panes.** `the call | the chart` at ≥1024 (iPad portrait gets it too, instead of stacking),
    with the record under the call so no column ends in a void — that void was the r92 iPad bug.
    Three closed doors run along the bottom. **Glance/Study is retired**: every diagnostic panel is
    collapsed by default at every width, so the mode had nothing left to switch.
  - **Measured result** (same page, offline, same viewports as the r92 baseline): iPad portrait
    2121px → ~1050px, phone 2357px → ~1450px, iPad landscape 1209px → ~1110px; on-screen controls
    39 → 34 on desktop and 31 → 27 on phone.
  - **Three real bugs fell out of the audit.** `[hidden]` did not hide blocks styled `display: flex`
    (an author `display` rule outranks the browser's built-in `[hidden]` rule), so a "hidden"
    `#heroCost` still drew a 13px strip with a hairline — those were the stray empty lines under the
    verdict. The `--hair` / `--hair2` tokens the r90 card referenced were **never defined**, so every
    divider inside the verdict fell back to `currentColor` and drew as a bright white line. And the
    price card carried `class="card hero orb"`, colliding with r90's `.hero` block and losing its
    18px padding; it's `.nowCard` now.

- **r92 — the live chart is back, and the redesign gets room to breathe.** Three fixes to r91, all found from a real iPad screenshot rather than a test:
  - **Glance mode was hiding the live chart.** Wrong on its own terms — the chart is what you watch while a round runs, not a diagnostic — and worse on the desktop grid, where `.m-chart` fills the middle column, so hiding it punched a large empty hole in the page. Glance now collapses only `.m-read` and `.m-indicators`, and only below 1200px; desktop shows the whole terminal.
  - **The decision was in the narrowest column.** Desktop ran `320px | 578px chart | 340px`, so the r90 verdict — the point of the redesign — was squeezed into the skinniest column next to a much wider chart. Now `430px | 1fr | 340px`.
  - **"One voice" made visual.** While the hero renders, the legacy rows that restate the same call (`#pickStrength`, `#recoScope`, `#buyLine`, `#buyHint`) are hidden via `#hero:not([hidden]) ~ …`, so the card states the verdict once. They keep rendering in the DOM, which is what matters — `renderDecisionBar()` and other renderers read their text. (Correction, found in the r93 audit: this entry originally said they "reappear automatically on the paths where the hero bails out". They don't. `renderHero()` sets `el.hidden = false` unconditionally after its only guard (`if (!el) return`), which cannot fire, so once the hero has rendered the rows stay hidden for good. No behaviour depends on them being visible.)
  - Timeframe buttons wrap on desktop rather than scrolling out of view in the narrower chart column.

- **Workflow pass — the app starts listening, and the star comes to you (r91).** Six changes aimed at the flow around the pick card rather than the card itself. All **display-only**; no pick, alert or grade changed.
  - **"I took this bet."** The app scored itself for two months and never knew what *you* did — every fact about the July losing streak had to come from phone screenshots. One tap now logs the bet (device-local, `myBets.v1`), resolves it when the round settles, and surfaces **your** record next to the tracker's. It specifically counts **off-book bets** — rounds the app had skipped or opposed — because that's the pattern the 2,100-round audit found settling ~50/50, and the one that actually cost money.
  - **The star finds you.** An A-grade setup on any coin now leads the all-coins ticker and is marked ★ in the ranked board, instead of requiring you to tap through seven coins looking for it. Same A-grade test as the pick card, computed from the `?best` feed already being polled (`bestStar`).
  - **The clock moved into the verdict** — it was in module four, below the chart — and the card turns amber for **Act now** from 5:00 to 2:00. *(A tighter "too late" state was written and then removed: at `BET_WINDOW` = 2:00 the app switches to the next round, so anything below that was unreachable by design.)*
  - **Last round's outcome** appears at the top of the card, with whether you won it if you logged one.
  - **Glance / Study.** Glance is the new default (decision + record); Study restores chart, read and indicators. Remembered per device.
  - **Page order follows the questions** — what do I do → how long → how has it been going → why. The chart falls from 4th to 6th. Applied inside the existing mobile/tablet breakpoint rules rather than as a global override, which would have silently beaten them.

- **Time-of-day conditioning — TESTED AND REJECTED.** The month audit found US-hours favorites returning +3.1¢/$ against −2.3¢/$ in Asian hours, and it was the top candidate for a "use months of history" feature. Fitting the hour pattern on the first half of the month and trading it **blind on the second half** killed it: the best training block (Asia, +13.6¢/$) turned **negative out-of-sample (−3.2¢/$)**, the learned rule **underperformed trading everything** (−0.2¢ vs +0.5¢ per $), per-hour sign agreement between halves was **54%** (coin-flip) and the train→test correlation was **+0.04**. It was in-sample noise. Not built — and the same test is why the broader "longer memory" idea is on hold: with the edge decaying week over week, a longer window would weight a market that no longer exists.

- **One screen, one answer — the pick card redesigned around the decision (r90).** The card had grown into seven stacked voices (strength banner → this/next columns → buy line → hint → odds row → tally → payout → favorite zone → off-book), leaving *you* to assemble the verdict — which is exactly how the Jul-18 "says bet up, says under, says skip" confusion happened. The card now leads with a **decision hero**: one headline (**Bet Over ⭐** / **Sit this one out** / **Under — but overpriced**), the reason in one plain sentence, then only the numbers that change the decision — after-fee edge, the crowd's price, the app's %. Under it, **price vs the line as a single dot on a rail** (neutral grey inside the ±0.02% "too close to call" zone, so the picture stops claiming a side exactly where the app does), and **cost / fee / return after fees**. Every legacy row survives untouched behind **"Show the numbers behind this."**
  - **It cannot contradict the rows below it** — `renderHero()` decides nothing. It reads `state.shownDir` (the committed side), `pickStrength()` (the same tier the banner shows) and `feeEdgeFor()` (the same after-fee number the payout prints). Same inputs → same answer, by construction rather than by discipline.
  - **A real duplication fixed:** the payout line was still computing its *own* copy of "our % − price − fee" instead of calling the shared `feeEdgeFor` that r87 introduced for precisely this reason. Two copies that matched only because nobody had edited one of them. There is now one.
  - **Display-only — no pick, commitment, alert or grade changed.** (`renderHero`/`heroStarState` + the `.hero` block in `eth-tracker.html`.)

- **Month audit — the ⭐ band moves onto the profitable prices, the weakest bets are cut, grading stops guessing (r89).** The first full-month audit (**21,412 archived rounds, 7,349 with a crowd price, Jun 21 – Aug 9**) found the r85 favorite band straddled a losing half and a winning half — bought at 65–70¢ the crowd favorite won 67.5% and **still lost money after fees**, while 75–90¢ won ~84%. Four changes follow, three of which **change what the app tells you to bet**:
  - **⭐ Star band re-centered 65–80 → 73–90** (`LOCK_MIN_PROB`/`LOCK_MAX_PROB`, mirrored by `FAV_ZONE_LO/HI` in the app). Star (band + tracker commit) goes from 74.4% / +1.7¢ per $ to **82.9% / +3.7¢ per $** — roughly double the edge, on ~30 alerts a day instead of ~48. *Caveat on record: even this zone decayed through the month (+10¢/$ in week 1 → ≈0 in weeks 4–5) as the market sharpened — re-measure every audit.*
  - **Commit bar raised** (`freePick` band floor 0.10 → 0.12). The weakest slice of committed picks hit **54.7% (n=86)** — a coin flip that loses to fees — while everything above it ran 69.5% / 77.3% / 86.0%. Cutting it costs **3.8% of bet volume** and lifts the committed record **75.8% → 76.3%**. Small sample, so it's a modest reversible trim.
  - **💤 Dead-market kill switch retired** (`DEAD_MARGIN_PCT` now defaults to `0`). r86 added it on two bad days of evidence; over the full month quiet chop **did not** hurt favorites (74.9% "dead" vs 74.2% "alive"), so it was only muting good stars. Set it back to `0.08` to revive it — no deploy needed.
  - **"Too close to call" grading** (`VOID_MARGIN_PCT`, default 0.02%) — **log/measurement only**. Measured against the 7,378 rounds Kalshi later confirmed, our Coinbase proxy grades the wrong side **38.8% of the time within ±0.01%** and 24.7% within 0.01–0.02% — that sliver is ~11% of rounds but carries **60% of all grading errors**. Rounds inside it are now recorded **void** (shown as a "Too close · void" row, scored by nobody, never trained on) instead of guessed; excluding it drops the proxy's error rate **5.8% → 2.6%**. A Kalshi ticker still clears the void once the definitive result lands.
  - Plus **`?authcheck`** on the Worker — a one-click self-test that proves an added Kalshi API key actually signs requests (see `cloudflare-worker/README.md`), since key-auth is now the top lever: Kalshi tightened its shared-IP throttling on Jul 31 and crowd coverage fell ~50% → ~25%, starving the picker (commit rate 14% → 8%).

- **More arrows on phones + a "confirming" slot (r88).** The Recent 15-min arrow row fit only ~6 arrows on a phone because the full-text label ate ~4 arrows of width — on narrow screens it now shrinks to a compact "15m" chip (~10 arrows fit; ▾ still expands to 24). And the freshest round — which deliberately gets **no arrow until its close is confirmed** (arrows are frozen-once-graded and never guess) — now shows a **pulsing hollow "pending" slot** in the meantime, so the row visibly accounts for every round instead of looking one short. It disappears the moment the real arrow lands. Display-only — grading and the frozen-arrow rule are unchanged. (`renderMoveStrip` + `.msDot.pending` in `eth-tracker.html`.)

- **One voice — the verdict, the banner and the payout line can no longer disagree; Discord goes ⭐-only (r87).** User screenshots (Jul 18) caught the app arguing with itself on one screen: **"STRONG — worth betting / BUY OVER ↑"** over a payout line reading **"−EV after fees — skip"**, while the 24/7 tracker footer said SKIP and the model chip leaned UNDER. Cause: the big verdict only downgraded at near-certain prices (≥90%), and the STRONG banner fired on the blend's raw edge — neither consulted the **fee-honest edge** (r83) printed right below them. Now all three surfaces share **one number** (`feeEdgeFor`: our % − market price − taker fee, the exact math the payout line prints): when it says a price is a losing buy, the headline becomes **"OVER likely — but overpriced · right direction, wrong price"** (amber, no glow) and the banner reads **"OVERPRICED — don't buy"**. **Display-only — the committed side, grading and the round log are untouched.** Also, per request: **notifications are ⭐ star-only by default** — the only ping that fires is the A-grade star bet (favorite 65–80% + tracker committed + live market, as *"⭐ Star bet (ETH - Over 1.5x)"*); the round-open pick ping, STRONG—BET ping and the longshot value ping (which lost ~9%/bet in the audit anyway) are off unless the Worker var `PING_MODE=all` restores them. (`feeEdgeFor`/`renderPickCard`/`pickStrength` in `eth-tracker.html`; `PING_MODE` gates in `scanLateLocks`/`notifyHotPicks` in `worker.js`.)

- **⚠️ Week-2 audit build (r86) — the star gets standards: A-grade needs the tracker's commit, dead markets mute it, and off-book bets get called out.** A second audit over the new permanent archive (4,466 rounds, Jul 12–18) delivered the week-1 estimate's reality check: the **raw** 65–80% favorite band won only **72.7%** (n=524) — ≈ break-even after fees — with outright losing dead-chop days (Jul 14: 57.6%, Jul 18: 66.7% with 44% photo-finishes), while the **24/7 tracker's own gated commits hit 78.0%** (405/519, all Kalshi-graded) at the same prices. Four changes follow the evidence. **(1) A-grade star:** the ⭐ shows full-strength **only when the tracker committed the same side this round** (verified same-round via close-time); otherwise it dims to a ☆ "watch-only" note. **(2) Dead-market kill switch:** when a coin's last ~8 graded rounds keep settling a hair from the line (median |margin| < 0.08%), the star is replaced by a 💤 "dead market — sitting out is the play" note — favorites ran ≈ −EV in that regime. **(3) Off-book guardrail:** when the app's live call is SKIP, a ⛔ line states plainly that skipped rounds settled ~50/50 — a bet there is a coin flip that still pays the fee. (The Jul-14/18 losing bets analyzed were mostly rounds the app had skipped or opposed.) **(4) The strong-favorite phone ping obeys the same rules** — it now requires the tracker's same-side commit AND a live (non-dead) market: fewer pings, better pings (`DEAD_MARGIN_PCT` tunable). Plus infrastructure: **optional Kalshi API-key auth** in the Worker (RSA-PSS signed requests; add `KALSHI_API_KEY_ID` + `KALSHI_PRIVATE_KEY` secrets) — moves rate limits off Cloudflare's shared IPs, lifting crowd coverage (~43% this week, still 16% at :00 slots) toward full. **All display/alert-level — the proven picker itself is untouched.** (`renderFavZone`/`marketPulse`/`renderOffBook` in `eth-tracker.html`; `scanLateLocks` gates + `kalshiAuthHeaders` in `worker.js`.)

- **⚠️ Data-audit build (r85) — the Kalshi feed fixed, blind bets stopped, rounds archived forever, and a ⭐ Favorite-zone cue.** A full statistical audit of the tracker's own 2,100-round record (July 2026) found the app's biggest problems weren't in the model — they were in the *data supply*. Four changes, all evidence-first. **(1) Kalshi pipeline fixed — the headline problem.** The Worker was only reaching Kalshi on **~22% of rounds** (worst at :00 slots, 9%): a fresh 15-min market shows "Target price: TBD" junk quotes for its first minute or two, and the code treated that as "no market at all," self-anchoring the whole round with no ticker — unpriceable *and* ungradeable forever. Now the Worker keeps the market's **identity** (ticker/close) even when quotes aren't live, waits ~75s and **re-locks the pick with the crowd** once quotes post (guarded: only when ≥10 min still remain — never near a close), and even a failed retry still attaches the ticker so `reconcileKalshi` grades the round against Kalshi's definitive result. **⚠️ Changes pick behavior — for the better:** the crowd (the only input the audit found carries real signal — 60.6% directional, p<0.001) is now present for most rounds instead of ~1 in 5. **(2) No more blind bets.** Committed picks made *with* the crowd hit **80%** (40/50); the ones made blind went **6/12 — a coin flip**. The Worker now **never commits a bet without a live crowd price** (the round still logs its lean and trains the model — it just can't claim a bet). **⚠️ Changes pick behavior:** strictly *more* skipping, never less. **(3) Permanent round archive.** The state kept only the newest 300 rounds per coin (~3 days) and **destroyed everything older** — capping every future audit at one market window. Every graded round now also lands in a permanent per-day KV archive (`?archive`, `?archive=YYYY-MM-DD&dl=1`), with new per-round fields (raw crowd %, Kalshi's posted strike, the preserved Coinbase proxy close). Log-only. **(4) The ⭐ Favorite zone.** The audit's single clearly profitable pattern: crowd favorites priced **65–80%** went on to win **~82%** of settled rounds (n=77) — **≈+14% per bet after fees**, the classic favorite-longshot bias (blind favorites ≈ break-even; longshots −9%/bet). The app now shows a **read-only ⭐ note** under the payout line whenever the live market enters that band (small-sample caveat included, and it warns when the app's own pick leans the other way), and the Worker's "forming favorite" phone-alert band re-centered from 62–74 to **65–80** to match. The audit also *cleared* some suspects: order-book, momentum, RSI/MACD, case-memory and cross-coin-momentum signals all tested ≈ coin-flip at this horizon (the learned model had already down-weighted them), and BTC co-movement is real (74–82%) but **same-round only** — BTC's *previous* round predicts nothing about the next. (`fetchCrowd`/`getKalshiCrowd`/second-chance retry/crowd gate/`archiveRounds` in `worker.js`; `renderFavZone` in `eth-tracker.html`.)

- **Market-lead read — \"is ETH in step with BTC?\" (r84).** The empirical audit's biggest finding was that the coins trade as **one market**: an alt settles the *same* direction as BTC **~80%** of rounds, and BTC leads the pack. Turned that into a live judgment aid under the pick (shown on any alt; hidden when you're on BTC itself): **In step with the market** — BTC agrees with your pick, a tailwind; **Fighting the market** — your pick opposes BTC's lean, the higher-risk ~20% case (demand extra edge or sit out); or a neutral read when BTC is ~flat or you're a coin-flip. It reads BTC's current lean from the best-coin feed the app already fetches (~1×/min) — prefers BTC's live Kalshi crowd %, falls back to BTC's 24/7 pick — so **no new requests, no new sockets**. **Strictly read-only — it reflects existing state and never changes, commits, or tempers the pick** (mirrors the existing \"Which to follow\" read; verified across all nine states incl. the crowd-absent fallback). Built for the single-coin ETH bettor: the co-movement insight becomes \"is the whole market moving with me right now?\" (`renderMarketLead` in `eth-tracker.html`.)

- **⚠️ Worker picker: order-book weight demoted 0.15 → 0.05 (empirical audit follow-up).** The data audit of 2,324 graded rounds found the order-book imbalance signal's direction predicted the outcome only **47.2%** of the time — slightly *inverted*, and statistically solid (p<0.01) — while it held a fixed **15% vote** in the 24/7 tracker's picker. Demoted to a 5% whisper rather than flipped or removed: it's one ~3-day market window, and the learned model's own order-book feature can still earn weight back if the signal proves real later. **Changes pick behavior** — the Worker's scoreboard picks, from the next cron run; go-forward only (nothing re-graded). The in-app live pick is untouched (its order-book slice was already just 0.07). One-line revert if the next audit disagrees. (`freePick` in `worker.js`.)

- **Fee-honest EV — every recommendation now prices in Kalshi's fee (r83).** The money-audit found that **every EV surface was computed gross of fees**: the payout line called a spot "≈ fair · ~break-even" when the app's % merely *equaled* the market price, the best-bet ranking starred "+EV" on *any* positive gross edge, the prime-entry alert gated on the gross 2.5x multiple, and the value record's "back per $1" used gross payouts. Kalshi's published taker fee is **quadratic — ≈ `0.07·P·(1−P)` per contract (~1.7–1.8¢ at mid prices, ≈3.5% of a 50¢ stake)** — so the old "fair" band was really ≈ **−1.7¢ EV per contract**, and "+EV" began at roughly *true* break-even. Now: the payout line computes the edge **after the fee** (and displays the fee), "+EV" means *above price + fee*, "−EV after fees — skip" replaces the old optimistic labels, the prime gate demands the payout clear **2.5x net** (≈2.63x gross), and the value record shows **after-fee** returns (stored multipliers stay gross = exchange-quoted; the fee is netted at display). **⚠️ Changes what the app recommends** (labels/alerts/rankings get stricter and honest) — the **pick itself (side/SKIP) is untouched**. All driven by one constant, `KALSHI_FEE_RATE = 0.07` — **verify it against the fee column on your own Kalshi fills** (maker/resting orders are fee-free; if you enter as a maker, the labels are conservative). (`takerFee` + `renderPayout`/`rowPayout`/`primeEntry`/`renderLateRecord` in `eth-tracker.html`.)

- **Resize glitch fix — no more stray blue box after switching widths (r82).** Resizing the window between mobile and desktop layouts (iPad Split View / Stage Manager, rotation) could leave a misplaced **blue-grey box** floating in the background: a per-card backing glow — or, on Safari, a frozen `backdrop-filter` tile — still sized for the *old* layout. On any resize the app now instantly hides the backing-glow layer and drops the glass blurs (`.resizing-glass`), then re-composites and re-tracks everything ~180ms after the window settles. Verified headlessly: glows vanish during the resize and come back geometry-matched to their cards, zero stale. **Display-only — no pick change.** (resize handler in `trackGlassLight` + `.resizing-glass` CSS in `eth-tracker.html`.)

- **Audit follow-ups — accessibility, narrow screens, storage caps, polish (r81).** The rest of the audit list, shipped step-by-step. **Accessibility:** the pick verdict and decision-bar side are now `aria-live` (screen readers hear the call change), a hidden announcer speaks the price + time left at most every 30s, the info sheet is a real dialog (`aria-modal`, focus moves in/out, **Escape closes it**), and the price flash respects reduced-motion. **Narrow phones (≤380px):** the Track Record scoreboard reshapes to 2×2 and the stat cells go half-width instead of crushing; small controls (help "?", Clear buttons, build tag) get invisible −8px tap halos on touch screens. **Storage:** `moveLog` now keeps each coin's newest 500 round buckets (chosen *above* the server's 300-round stats window, so nothing measured changes) and stale ungraded AI reads expire after ~2h — localStorage can't grow forever. **Perf:** the chart canvas only re-allocates when its pixel size actually changes (the width guard already existed; height is now covered too) and the ambient glow animations pause while the tab is hidden. **Polish:** the model-lean chip now uses the app's own green/red tokens (it had CoinMarketCap's shades — two subtly different greens in one UI), and the footer fine print drops its extra opacity for readable contrast. **All display/persistence-only — no pick logic touched.** (r80.2–r81 in `eth-tracker.html`.)

- **Audit accuracy fixes — per-coin calibration + full-round shared reads (r80).** A four-auditor code audit confirmed two real accuracy defects (and cleared seven scary-sounding false alarms — the grading pipeline, settlement math, and Worker gates all verified sound). **(1) Calibration mixed coins:** `calibrate()` (and the skip-gate's local fallback) adjusted a pick's confidence using **every coin's history blended together** — your BTC rounds could tilt an ETH pick's stated %. Both now filter to the current coin, matching the moveLog builder that always did. **⚠️ Changes pick behavior:** the calibrated % can shift slightly, and per-coin samples are smaller, so calibration stays neutral (raw model) until a coin has ~8+ graded rounds in the band — that's the correct behavior, not a regression. **(2) The r73 shared AI read had a coverage gap:** the lock-time "next round" read was cached under the *previous* round's key, so once the round opened, other devices' free polls stopped finding it. The Worker now falls back to that key, so every device converges on the one read for the **whole** round it's about. **Important insight — no history reset needed:** the recorded rounds were always clean (each stores its coin, the *raw* pre-calibration confidence, and the settled outcome); the bug was in how the consumer *read* the history, not what was written. Fixing the filter makes all existing history correctly usable per coin immediately — clearing it would only throw away good data. (`calibrate`/`bandEdgeOK` in `eth-tracker.html`; `noAI` branch in `worker.js`.)

- **At-a-glance decision bar (r79).** The `/critique`'s headline fix: a compact bar now **leads the page** (above the price card on mobile; a full-width command bar above the three columns on desktop) showing the one thing you came for in a single glance — **side · % · confidence · time left**, tinted to the call (green/red/amber) — so you don't reassemble the decision from the price + pick + timer scattered down the page, and it resolves the "which of the dual this/next picks do I act on?" ambiguity by showing the single live call. The countdown turns **red in the final 2 minutes**; tapping the bar jumps to the full pick card. **⚠️ Pick-safety: this is a strictly READ-ONLY mirror** — `renderDecisionBar()` only reflects what the pick card already rendered (`#buyLine`'s side class, `#oddsPct`, `#recoConf`) plus the live countdown, updated once a second from the existing timer tick. It **never computes, commits, or alters a pick** — if the card changes, the bar follows. The proven picker is untouched. (`.decisionBar` CSS + `renderDecisionBar()` in `eth-tracker.html`.)

- **UX pass from the `/critique` review (r78).** Acted on the design-review findings (the parts that were real — several flagged items, like the destructive-clear confirms and the mostly-collapsed analytics, turned out to already be handled). **Hierarchy:** the oversized mobile coin title is demoted from a glowing hero to a quiet kicker, so the price card and the pick — what you actually came for — lead instead of a coin name you already know. **Calmer states:** a data dropout now shows one reassuring, consistent voice ("Reconnecting…" / "Market feed dropped — retrying automatically…") instead of five different red "unavailable / could not load / waiting" alarms that read as *broken*. **Discoverability:** the chart's horizontally-scrolling timeframe row now fades at its right edge so the off-screen options (30m, Line, Candles) are visible, not clipped at a hard line. **Density:** Live Indicators collapses by default (its detail is already echoed by the indicator chips on the chart; one tap reopens). Also softened the card/wrapper drop shadows a touch. **All display-only — no pick logic touched.** (`.coinHero`/`.tfBar` CSS, the data-error strings, and the Live Indicators `<details>` default in `eth-tracker.html`.)

- **Space Mono for the big bold numbers (r77).** The large numeric readouts — the live **price**, the **countdown**, the **Track Record scoreboard** (Rounds/Correct/Streak/Hit Rate), the **Brier** hero, and the **stat cells** — now render in **Space Mono** for a more distinctive, techy display face (the rest of the UI stays Geist). Driven by a single token (`--font-num`) so it's a one-line change to retune. Space Mono ships only 400/700, so the weight-800 callers map cleanly to 700. **Display-only — no pick change.** (`--font-num` + the big-number selector rule in `eth-tracker.html`.)

- **App-wide UI polish — a unified section-header spine + a calmer header (r76).** A consistency pass across the whole app, in the same spirit as the footer and Model & Accuracy redesigns. **Every section header** (Auto Pick, AI Co-Pilot, Live Indicators, Track Record, Model & Accuracy, Recent Rounds…) now carries a small **accent "spine" marker** and a **brighter, bolder label**, so the page reads as a sequence of clear waypoints with a steady structural rhythm instead of a flat run of dim text. The marker follows the live accent (green/amber/red), consistent with the app's existing "everything reflects the call" glow. The **oversized mobile coin title** was dialed back from a near-full-width shout to a refined size so the price card leads and less vertical space is wasted. Verified on mobile and the desktop 3-column layout. **Display-only — touches no pick logic.** (`.sec`/`.coinHero` CSS in `eth-tracker.html`.)

- **Scoreboard fix — Hit Rate no longer overflows / boxes no longer overlap.** r75 added a `.stat` class for the Model & Accuracy panel that collided with the Track Record scoreboard's existing `.stat` (Rounds/Correct/Streak/Hit Rate), forcing the columns too wide and breaking the grid. Namespaced the new cells to `.mStat`. Display-only.

- **Model & Accuracy panel redesign — a scannable scoreboard (r75).** Same treatment as the footer, applied to the densest panel in the app. It was a flat stack of gray prose-boxes with the numbers buried inside sentences ("2-min lock 47% (103/217)"). Rebuilt around **one consistent stat component** — a big mono value, a small label, the sample beneath — so the eye scans the numbers instead of reading paragraphs: **Brier is now a hero readout**, the **lock-timing** and **decisive-break** tests are **stat grids**, the learned-insights list got cleaner markers with the experimental "case memory" line tucked into a set-off note, and the value record is a clean money stat. **Colour is reserved and honest:** hit-rates that sit near a coin-flip stay **neutral white** (the app's whole thesis is that 15-min direction is near-random — the design refuses to fake a signal), and only the **value return** (profitable) and a **beating-coin-flip Brier** earn green. **Display-only — touches no pick logic** (same numbers, same gates, just presented with hierarchy). (`.autoLearned`/`.stat`/`.heroStat` CSS + the four render functions `renderLockAB`/`renderLateRecord`/learned+calibration in `eth-tracker.html`.)

- **Footer redesign — clearer hierarchy, far less noise (r74).** The footer had flattened into one gray pile: the 24/7 status, the model lean, the Guide link, two attribution lines, and a three-line wall of build/changelog text all sat at roughly the same weight. Rebuilt it into **three deliberate tiers**: **(1)** the live status now sits in **one subtle glass capsule** with real internal hierarchy — the verdict as the headline, provenance and the model lean as quieter metadata below a hairline — and the capsule is **tinted to the auto-pick's own side** (amber on SKIP, green on OVER, red on UNDER) via pure-CSS `:has()`. **(2)** the Guide button + a single consolidated fine-print line. **(3)** the giant build-marker wall is **collapsed behind a small `build r74` stamp** (Geist Mono) — the changelog is one tap away, formatted as readable bold-led lines, instead of always-on noise. **Display-only — touches no pick logic** (the status text is the same data, just presented with hierarchy). (`.footStatus`/`.footMeta`/`.buildTag` CSS + footer markup in `eth-tracker.html`; `renderModelChip` restyle.)

- **Shared AI read — every device sees the same AI verdict now (Build B, r73).** The AI read is the one pick-input that used to differ per device: each tab paid for its *own* LLM call, so two phones could hold slightly different reads for the same round. Now the Worker computes the read **once per round per coin**, caches it, and **hands it back for free on the regular ~1/min crowd poll** — so every device converges on the **same** AI input without any extra paid calls. The rule is **newer-read-wins**: a device adopts the shared read only when it's *newer* than the one it already holds, so a background poll can never revert a fresher local read (e.g. one you just refreshed by hand). Mechanically: the Worker tags each read with a timestamp (`aiTs`) and piggybacks the cached read on the `noAI` crowd response; the app's `applyCrowd` adopts it when `aiTs` is newer and re-grades it like any read. **This touches the pick** — the AI is one input to the blend, so all devices now blend the *same* AI — but it trades **no accuracy**: it's the same read quality everywhere, computed by the same model, just shared instead of recomputed. One paid call per round, not one per device. (`applyCrowd` + `renderAI` in `eth-tracker.html`; `noAI` branch + `airead:` cache in `worker.js`.)

- **Mobile fix — page can't drift sideways / off-screen anymore (r72).** On phones the page had started scrolling horizontally, shoving the content off to the side with empty space on the other edge. Cause: r67 removed `overflow-x: clip` from `body` (to let glows bleed into wide-screen margins), but the ambient glow orbs sit *past* the screen edges (negative offsets), and `html`'s clip alone doesn't contain that on iOS Safari. Restored `overflow-x: clip` on `body` — content stays within the viewport, no sideways scroll. Verified no real content is cut (the chart's timeframe row scrolls inside its *own* card by design) and there's no leftover vertical over-scroll. The glows now fade to ~0 before the card edges, so clipping at the body box no longer cuts a visible edge in wide-screen margins. **Display-only — no pick change.** (`body { overflow-x: clip }` in `eth-tracker.html`.)

- **Synced picker + the skip gate ported to the Worker (r71).** Two follow-ups to close the loop. **(1) The #2 skip gate is now synced across all your devices, for every coin.** It used to read each device's *own* local log (sparse, and different per device). It now reads the **global per-coin 24/7 history** (`state.lastAuto.history` — identical on every device, Kalshi-confirmed ground truth, and far more sample), so every device gates the same way *and* the gate actually has the data to fire. Falls back to the local log only until the server history loads. (Calibration stays on the device's own model bins on purpose — mixing two different probability models there would be wrong; the gate is a coarse reliability check where the shared data is a sound proxy.) **(2) The #2 gate is ported into the Worker's picker**, so the **Track Record scoreboard now measures the same discipline** (it'll bet fewer, higher-quality rounds). **What did NOT port, and why:** **#1 (settlement-aware)** only sharpens the live *final-2-minutes* read, but the Worker **locks its pick at round-open and never re-picks** — there's nothing for it to attach to, so it stays app-only. **#3 (regime)** needs the live tick stream; the Worker only has coarse 1-minute candles, so it stays app-only too. **Changes pick behavior** (more synced + the scoreboard more selective). (`bandEdgeOK` in `eth-tracker.html`; `bandEdgeOK` + `freePick` call-site in `worker.js`.)

- **Accuracy #2 (skip gate) + #3 (regime conditioning) (r70).** The next two from the accuracy series — both refine the **live pick you act on**, both **change pick behavior** (flagged on purpose). **#2 — calibration-band skip gate.** The model showing the odds just off 50/50 isn't enough to bet; now a side only stands if rounds in the **same probability band** have actually **cleared break-even** on this device's record — otherwise it's passed as a coin-flip band. It only ever makes the app **skip more** (skipping never loses money), and it's inert until a band has real evidence (≥15 graded rounds), so the proven picker is untouched until the data earns it. **#3 — regime conditioning.** A simple efficiency ratio (net move ÷ total back-and-forth) tells trend from chop: in a clean **trend** the app leans **into** short-term momentum (up to 1.5×), in **chop** it leans **away** (down to 0.4×) and trusts mean-reversion more — a bounded tilt on the small drift weights only, so the rest of the blend is unchanged. **⚠️ Both change the pick** (more selective + regime-tilted). **Measurement note:** these live in the **app's** picker (what you bet), not the Worker's 24/7 tracker, so the **Track Record scoreboard won't directly reflect them** — to measure them there I'd port the same logic into the Worker's `freePick` (offered as the next step). (`bandEdgeOK`, `trendEfficiency` in `eth-tracker.html`.)

- **Per-coin pick lock — a held SKIP survives a coin switch now (r69).** When the next-round pick locked as **SKIP** it held correctly, but flipping to another coin and back changed it to OVER/UNDER. Cause: the locked next-round pick (and the committed this-round side) were stored in a **single global slot**, so switching coins cleared it and the other coin's lock took the slot — on return the app re-locked from scratch (and even re-pulled an AI read). Now each coin keeps its **own** lock + committed side under a per-coin key, and a coin switch **restores that coin's** held pick. It already survived a page refresh; now it survives a coin switch too — a locked SKIP stays a SKIP. Holding only; **does not change how picks are calculated.** (`lnKey`/`cmKey` + `setCoin` in `eth-tracker.html`.)

- **Accuracy #1 — settlement-aware barrier + Recent-15-min arrows re-fit (r68).** Two things. **(1) Picks (final stretch only).** The position/barrier model — `P(price > line at close)` — was using the **spot tick** and the **full** remaining time. But Kalshi/Coinbase settle on a **~60-second average** of the index at the close, not the last tick. So two fixes, both confined to roughly the last ~2 minutes (early-round picks are byte-for-byte unchanged): the settle **locks in ~22s early** (the variance of a terminal 60-sec average ≈ the price a third-of-a-window earlier, so we shrink the remaining time → the model is correctly *more confident* late), and near the close the barrier **anchors its price to a short rolling average** (`settlePrice`/`settleRemEff`) so a single noisy print can't flip the read off what actually settles. **⚠️ This DOES change pick behavior in the final ~2 minutes** (the live read + the prime-entry cue) — it should be slightly sharper there; watch the **confirmed-vs-Kalshi hit rate** to confirm it helps. **(2) Display.** The "Recent 15-min" arrow strip mis-counted how many arrows fit (the Geist label is wider than the old reserve assumed), so on the narrow desktop column the last dot / ▾ button got clipped by `overflow:hidden` — read as "arrows not lining up." Re-fit with a correct reserve + a layout-safe re-measure. *(Next in this accuracy series, one at a time: #2 a calibration-band skip gate, #3 regime conditioning — each added and then watched on real rounds before it's trusted.)* (`barrierOver`/`currentRoundBarrier`/`settlePrice` + `renderMoveStrip` in `eth-tracker.html`.)

- **The hard edge was a CLIPPED gradient, not the wrapper — fixed at the source (r67).** Walks back r65/r66 (which dissolved the whole card edge with a mask — wrong target). The wrapper should keep its normal soft edge; what was cutting at a hard line was the **glow**, getting **clipped by an `overflow` box**. Two clips were doing it: a redundant **`overflow-x: clip` on `body`** (the `html` element already clips horizontal scroll) was slicing the behind-card glows at the ~1480px content width → the vertical hard edge in the margins on wide screens; and **`overflow: hidden` on the orb/pick cards** was slicing the glow *inside* them at the rounded corner. Removed both, so the glows fade out on their own. Restored the normal (dimmed) wrapper rim and dropped the mask/inset-feather from r65/r66. Net: wrapper edges look normal, the gradients are soft and uncut. **Display-only — no pick change.** (`body`/`html` overflow + `.glassui .card.orb` in `eth-tracker.html`.)

- **Softer glass: dimmer highlights + no hard edges on the background (r64).** Two follow-ups. (1) **Dimmed the white highlights further** — the rim's white core is now `0.13/0.15` (from `0.40/0.44` two passes ago) and the inner top-edge line `0.05/0.055`, so the glass is calm and non-glary. (2) **Fixed the "hard edges" on the background** — each card's backing glow was a rounded-*rectangle* the size of the card, so on a wide screen its straight left/right edges showed as vertical seams in the margins. The backing is now a soft **organic blob** that fades to transparent well before the card edges (and is more heavily blurred), so it reads as a pool of light with no rectangular outline. **Display-only — no pick change.** (`#glassBack .gb`, `.glassui .card`/`.card.orb` highlights in `eth-tracker.html`.)

- **Dimmed the white glass highlights (r63).** The bright white edge highlights were a touch glary — toned down the rim's white core (`0.40/0.44 → 0.24/0.27`), the inner top-edge line (`inset 0 1px 0` white `0.16 → 0.09/0.10`), and the surface sheen, so the glass reads softer and less shiny while still catching light. **Display-only — no pick change.**

- **Liquid glass v4 — full-bleed background, accent behind the wrappers, inset boxes glassed (r62).** Three fixes from ultrawide/live feedback. (1) **No more hard cutoff on wide screens** — the ambient light mesh was painted on the `max-width` content column (~1480px), so on an ultrawide monitor the gradient stopped at a hard seam with flat dark on either side. It now lives on a **fixed, full-viewport layer** (`body::before`) with viewport-relative pools, so it spans edge-to-edge at any width. (2) **The pick colour now reads *behind* the wrappers** — the per-card backing glows are stronger and a gentle accent wash sits centred behind the content, so the red/green/amber shows in the background the glass sits over (instead of being missing). (3) **The inner inset boxes blend with the glass** — the "This Round / Next Round" split (`.dualPick`, was a solid `#141414` box) and the "closing near…" note (`.lastClose.pending`, which borrowed the solid `.pending` surface) are now **translucent**, so the card's light and backing glow read through them instead of them sitting on top like opaque stickers. **Display-only — no pick change.** (`.glassui body::before`, `#glassBack .gb`, `.glassui .dualPick`/`.pending` in `eth-tracker.html`.)

- **Liquid glass v3 — a matching light *directly behind* each wrapper, and a mobile hotspot fixed (r61).** From live feedback: a drifting glow was blowing out into a **harsh bright patch** in the corner of the price card on mobile, and the glass still didn't read as transparent. Fix follows the right principle — **mirror each card's front gradient with a soft, same-coloured gradient sat directly *behind* the card**, aligned to it and lit from the same point, so the frosted glass **transmits a matching glow** and looks genuinely see-through instead of a flat panel with a highlight painted on. New `#glassBack` layer holds one soft backing glow per glass card (pick colour behind the pick cards, neutral light behind the rest); `trackGlassLight()` now positions + colours each one to match its card every frame (batched reads→writes, ~8fps, gated on glass + motion + visible tab). The **drifting page glows are dimmed right down** so they can only nudge the light direction, never blow out a hotspot, and the **surface sheen is softened**. **Display-only — no pick change.** (`#glassBack`/`.gb` + `trackGlassLight()` in `eth-tracker.html`.)

- **Liquid glass v2 — neutral light behind the glass, pick cards calmed (r60).** Follow-up to r59 from live feedback: the glass *still* didn't look like it sat over light, and the left "pick" cards (price + Auto Pick) were flooded with the pick's green so the card *was* the colour — nothing for the glass to sit over. Three fixes. (1) **The light behind the glass is now a soft, NEUTRAL cool tone** (not the pick colour) and made clearly visible, so every card sits over a gradient that **contrasts** with it — instead of the whole page being one flat green/red wash the same colour as the cards. A gentle accent tint still rides along the edges so the pick colour is present without flooding. (2) **The pick cards are calmed** — their coloured inner glow and rim are roughly halved and the glass is more transparent, so they read as the **same neutral frosted glass** as the right-hand cards you liked, with the pick colour carried by the rim / the headline % / the status bar. (3) **A neutral surface sheen** now catches the light on each card (and glides toward the nearest drifting glow), so cards read as *lit glass* rather than flat panels. **Display-only — no pick change.** (`.glassui body` mesh, `.glassui .pageGlow`, `.glassui .card`/`.card.orb` in `eth-tracker.html`.)

- **Liquid glass that reacts to light, dialed way back (r59).** The r58 glass was too much — a strong, evenly-bright stroke that "looked like a flat div with a gradient painted inside," and it wasn't reacting to anything because there was nothing lit behind it. This pass fixes the cause, not just the look. (1) **A faint ambient light "mesh" now sits behind the whole page** — soft warm pools top and bottom, a cool counter-light on the left — so the frosted cards always have a real gradient to catch and blur through, instead of floating on flat black. (2) **The pick-card glow is softened** (the warm/green/red halo behind the price + Auto Pick cards) so it reads as *light behind the glass*, not a coloured blob filling the card. (3) **The bright spot on each card's edge now glides toward the nearest drifting glow** — like real glass catching a moving light source — and is much subtler than the old fixed bright stroke. Everything is intentionally gentle (you asked for *subtle* gradients/reflections, Apple-style), and the higher text contrast from r55 is kept. Capability-detected as before (only where the browser supports it; off for reduced-motion/transparency). **Display-only — no pick change.** (`.glassui body` mesh, softened `.card.orb` glow, `@property --lx/--ly` + `trackGlassLight()` in `eth-tracker.html`.)

- **Light-reactive glass rim, machined edges, line icons (r58).** Three premium touches. (1) The glass cards' **stroke is no longer a flat, uniform colour** — it's a `border-box` gradient that's **bright white at the top-left edge** (catching light from above), fades through neutral, **picks up the live pick's accent**, then **darkens at the bottom**, like a real glass plate. Done with the double-background trick so it coexists with the frosted `backdrop-filter` and the drifting glows. (2) **Machined card edges** — a 1px inner top-highlight + softer, more diffused shadow on the flat-theme cards too. (3) **Emoji → ultra-light line icons** — the 🔥 / 🎯 / 🚀 are now thin **flame / target / sparkle** SVGs that inherit the text colour (the monochrome ▲▼✓ glyphs stayed — already minimal). **Display-only — no pick change.** (`.glassui .card` / `.ic` / `ICON` in `eth-tracker.html`.)

- **Design-engineering polish — motion + viewport details (r57).** Ran the `emil-design-eng` and `high-end-visual-design` skills and fixed concrete violations: replaced **`transition: all`** (animates everything, can jank) with **specific properties** on the chart buttons; strengthened the shared **ease-out curve** to a punchier `cubic-bezier(.22,1,.36,1)` (the built-ins are too weak to feel intentional); added **`min-height: 100dvh`** so the layout doesn't jump when iOS Safari's toolbar shows/hides; and **tightened the pick-strength banner's tier morph** 400→280ms (UI motion should stay under ~300ms to feel responsive). Press feedback (`:active` scale) and entrance-from-`scale(.96)` were already in place. **Display-only — no pick change.** (`eth-tracker.html`.)

- **Alerts fire earlier and on real value; bigger touch targets (r56).** The phone alerts were tuned to be **actionable, not too late**. (1) The near-lock ping (which fired when a side was already ~75–92% / paying a measly ~1.1–1.3x, with the round nearly over) is **moved down to a "forming favorite" band — ~62–74%, paying ~1.35–1.6x** — so you're alerted **while there's still time and value**, not at the dead ~1.2x. (2) The **open-round pick** ping (the earliest, ~13 min to act) was **loosened so it actually fires** (`NTFY_MIN_PROB` 75→68, new `NTFY_MIN_AGREE` 2, was an implicit 3). (3) Value-entry longshots now trigger from **≥2.0x** (was 2.5x). Same loosening on the in-app alert. **Note:** alerts only send if the Worker has `NTFY_TOPIC` (ntfy app) or `DISCORD_WEBHOOK` set — see the worker README. Also: **bigger touch targets** (the "?" info buttons 17→24px; phone chart/indicator buttons get a comfortable tap height) and tighter copy. **This changes ALERT timing/frequency only — the picks themselves are unchanged.** (`scanLateLocks`/`notifyHotPicks` in `worker.js`; `maybeNotifyHot` in `eth-tracker.html`.)

- **Audit pass — accessibility + anti-pattern fixes (r55).** Ran the project's `audit`/`critique` skills and fixed the high-value findings: **lifted muted-text contrast** (`--label-3` 0.32 → 0.46, much closer to WCAG AA while still reading as secondary); **removed a gradient-text headline** (the glass page title is now a solid colour — gradient text is a top "AI slop" tell the skills ban; the soft accent glow stays); added a **keyboard focus ring** (`:focus-visible`, accent-coloured, keyboard-only); and **aria-labels on the "?" icon buttons**. Audit health ≈ **15→17/20** ("Good"); the remaining "tells" (the optional liquid-glass skin, the status glow) are intentional and on-brand, so they stay. **Display/a11y only — no pick change.** (`eth-tracker.html`.)

- **Typography upgrade — Geist + Geist Mono (r54).** Swapped the UI font from **Inter → Geist** and the numeric/mono font from **Space Mono → Geist Mono** (both originals are overused defaults flagged by the project's design skills). Geist is SF-adjacent, so it keeps the Apple-grade feel while reading crisper and more distinctive; Geist Mono makes the timer, price, and tabular data cleaner and tighter. Added `font-kerning`/`text-rendering` polish. Also fixed a stale label: the **AI Spend** dropdown now correctly marks **"Every round"** as the default (it changed in r45) and the option copy is clearer. Recorded the project's design direction in `.impeccable.md` so the design skills stay grounded. **Display-only — no pick change.** (`eth-tracker.html` font refs; `.impeccable.md`.)

- **Desktop layout rebuilt as independent columns (r53).** The desktop grid used to share row heights across columns, which forced an either/or: either a gap opened under the timer, or expanding the AI Co-Pilot shoved Auto Pick far down the page. The layout is now three **independent column stacks** — left (price + Auto Pick), centre (chart), right (timer + AI Co-Pilot + Track Record) — plus full-width indicators. Each side flows on its own, so the **timer sits directly above the AI Co-Pilot** *and* **Auto Pick stays pinned under the price card** no matter what's expanded. Tablet (price + timer side-by-side, then stacked) and mobile (single column, same reading order via flex `order`) are preserved. Applies the project's `layout` design skill. **Display-only — no pick change.** (`.stack`/`.stackL`/`.stackR` + breakpoints in `eth-tracker.html`.)

- **"Who's calling it better" meter — AI vs the 24/7 tracker, over time (r51).** A new meter in the AI Co-Pilot panel keeps a running scoreboard of the two independent brains — the **AI Co-Pilot** and the **24/7 tracker** — by hit-rate on the rounds each actually **committed to** (skips never count, by design). A monochrome diverging bar leans toward whoever's ahead, the leader's label brightens, and each side shows its rate + sample (e.g. "AI 61% · 11/18" vs "Tracker 52% · 156/300") with a "small sample" caveat under 8 calls. Reads the AI report card (`state.aiRecord`) and the tracker's graded history (`state.autoRec`) — both already tracked. Also in this pass: the **desktop timer is back to its natural size** (the price card now spans its row) with the AI Co-Pilot tucked directly underneath, and the easing was switched off a springy/bounce curve to a smooth deceleration (per the project's design skills, which ban bounce). **Display-only — measurement, not picks.** (`renderPickoffMeter` in `eth-tracker.html`.)

- **One playbook panel, bolder dropdowns, no desktop gap (r50).** Three tidy-ups, **no pick change**. (1) The **AI summary** (the AI's full reasoning) is folded into the **playbook** as a collapsed item under the Game plan — so "Which to follow", "Game plan", and the optional "AI summary ▸" all live in one panel instead of the summary sitting separately in the AI Co-Pilot section. It stays **collapsed by default** (you said you rarely read it). (2) The little **dropdown arrows** that were tiny and dim are now **clear, tappable circular chevrons**. (3) On **desktop**, the timer used to leave an awkward empty gap before the AI Co-Pilot (it shared a row with the taller price card); the timer card now fills that row with its countdown centred, so the **AI Co-Pilot sits directly under it**, responsive and evenly spaced. **Display-only.** (`#playbook` / `syncPlaybook` / `.secChevron` / `.m-timer` in `eth-tracker.html`.)

- **Fewer colours — the Play-Style tab joins the app's neutral palette (r49).** The selected **Disciplined / Balanced / Active** tab was a one-off **violet**; it now uses the same neutral elevated style (`--surface-3`, white text) as every other toggle in the app (chart timeframes, chart type), and the **"Game plan"** label drops its violet for the same dim grey as **"Which to follow"**. Design direction: keep the colour count low — the only "loud" colours are the status accent (green/red/amber for the live pick) and the per-provider AI badge. **Display-only — no pick change.** (`.playStyle button.active` / `.gpLbl` in `eth-tracker.html`.)

- **STRONG — BET goes native on phones; tidier pick card; installable app (r47).** A batch of UX work, **none of which changes the picks**. (1) **STRONG — BET delivery is now device-aware:** on **desktop** it shows as the pulsing banner and stays readable for ~7s (it no longer flickers away); on **phones/tablets** it fires as a **native iOS/iPadOS notification** instead — "🔥 STRONG — BET (SOL - Over)". The Worker's phone push also now calls out the momentum-confirmed picks as a distinct **STRONG — BET** alert, so you get it even with the app closed. (2) The **"Which to follow"** verdict and the AI's **"Game plan"** are **consolidated into one panel** (a single box, hairline divider) instead of two stacked cards. (3) The **Track Record card** gets the same left/right padding as the rest (nothing touches the edges), and the **stroke around Recent Rounds is gone** (the rows read flat). (4) **App-wide easing polish** — one consistent motion curve on buttons/cards with subtle tap feedback. (5) The app is now an **installable PWA** (web manifest + a *notifications-only* service worker that never caches, so no stale-version bugs) — required for native notifications on an iPhone added to the Home Screen. **Pick-impact: none — all display/notification-delivery.** To get phone notifications: Add to Home Screen, open it, and turn on Alerts; closed-app alerts come via the Worker's ntfy push. (`renderPickStrength`/`fireBetNotification`/`syncPlaybook` in `eth-tracker.html`; `sw.js`, `manifest.webmanifest`; `notifyHotPicks` in `worker.js`.)

- **"STRONG — BET" when everything lines up, plus a smarter free AI read (r45).** Two changes. (1) The pick-strength banner gains a top tier: when the app's pick, the **AI read**, and **live momentum** all point the same way — and either the disciplined 24/7 tracker agrees or the blended edge is already strong — it shows an unmistakable **"🔥 STRONG — BET OVER"** in the side's colour (it pulses). It's the clearest, rarest setup to act on; everything below it stays as-is. (2) The AI now takes a **consensus**: instead of one noisy read, the worker asks the (free) model several times at different "temperatures" and **averages** them, using how strongly the samples agreed as an honest confidence (unanimous + lopsided = High; split = Low). Because the AI is on a free tier now, reads also default to **every round** (was manual/tap-only). **Pick-impact: YES — both the consensus and the every-round default change the *AI input* that feeds the blended % and your live call (more stable, more often). The STRONG — BET banner itself is display-only — it just labels when the existing signals all agree.** Tune samples with `AI_SAMPLES` (default 3; set 1 for the old single read). (`getAIRead`/`aiConsensus` in `worker.js`; `pickStrength` + `.pickStrength.bet` in `eth-tracker.html`.)

- **Best-now bar surfaces the obvious side — "heading the right way" + confidence (r44).** Beyond just the most-lopsided/high-multiplier coin, the 🏆 bar now factors whether **price is already heading the way the pick called** (the pick-time momentum agrees with the side — a `confirm` flag). When momentum confirms **and** several reads agree, the bar shows an unmistakable **"🔥 BET SOL OVER ↑"** so it's obvious which side to take even before you bet, and every coin in the expanded ranking gets a **▲/▼ "heading OVER/UNDER"** badge. The worker forwards `confirm` and nudges confirmed picks up the order. **Pick-impact: re-orders the best-bet *ranking* (a recommendation surface) only — it does NOT change the per-coin picks or the 24/7 grading.** (This bar is the AI-free 24/7 tracker across all coins; per-coin AI agreement still shows on each coin's "Which to follow" line.) (`rankBest` in `worker.js`; `renderBestBar`/`renderBestList` in `eth-tracker.html`.)

- **Liquid-glass theme (Apple-style), capability-detected (r43).** An optional frosted-glass skin: cards become translucent and **pick up the pick's colour** (`backdrop-filter: blur() saturate()` — green when it says BUY OVER, red on UNDER, amber on skip), with drifting ambient glows, **specular top edges**, a glossy gradient coin title, and a **real SVG-displacement refraction** on the pick card's glow. It only turns on where the browser actually supports it — a small probe adds `html.glassui` when `backdrop-filter` is available and the user hasn't enabled *Reduce Transparency*; otherwise the clean flat theme stays (so it's polished everywhere). Apple's true Liquid Glass is a *native* Metal effect, and the Chrome-only `backdrop-filter: url(#svg)` refraction trick is deliberately avoided in favour of the Safari-safe `filter:` approach (so it works on iPhone). Honors `prefers-reduced-motion` / `prefers-reduced-transparency`. **Display-only — no picker/logic changes.** (probe + `#liquidGlass` SVG + `.glassui` rules in `eth-tracker.html`; technique per kube.io / WebKit.)

- **Prime-opportunity pop-up — alerts you in the dashboard when a coin can win AND pay big (r41).** A dismissible banner pops up at the top of the app the moment a coin hits the rare **+EV value sweet spot**: our model rates a side **clearly above the market's price** *and* that side **pays ≥ 1.7x — or momentum is projecting it to reach 1.7x+** (price being carried toward a big-payout underdog), with a genuine chance to win (≥55%). It reads *"🚀 Prime spot · SOL OVER · pays ~2.4x · we rate it 64% vs the market's 42% — a rare chance to win AND pay big. Higher variance, so size smart."* with a **View** button (jumps to that coin) and a dismiss ×. Honest framing baked in: these are mispriced-underdog bets (higher variance), not sure things. **Display-only — it reads the existing ranking data (`state.best` + `rowPayout`) and never changes a pick.** (`primeOpportunity` / `renderPrimeAlert` in `eth-tracker.html`.)

- **Notifications simplified to skim-and-act format.** Every ping is now one short line — **`Predict (ETH - Over 1.2x)`** — just the coin, side, and payout, no percentages or prose, so you can read it and place the bet in a glance. Multiple coins read `Predict (ETH - Over 1.2x, BTC - Under 3.5x)`. The 🎯/⚡/🔥 emoji still tells the type (near-lock / longshot value-entry / strong open pick) at a glance. Notification copy only — no behavior change. (`scanLateLocks`/`notifyHotPicks` in `worker.js`; `maybeNotifyHot` in `eth-tracker.html`.)

- **Payout/+EV everywhere it matters + smarter, richer notifications (r40).** Acting on the audit's opportunity list (all display/notification — the picker is untouched): **(1)** the **🏆 Best-bet bar and the all-coins ranking now show each pick's payout** (e.g. *"~1.22x"*) and a green **+EV** flag when our model rates the side above the market price — so your profit lever is visible where you compare coins. **(2)** Alerts got smarter: the high-confidence ping now **skips dead-money** sides (market ≥ 90%, `NTFY_DEAD_PCT`) and **shows the multiplier**; the near-lock ping shows it too. **(3)** The worker now also pushes a **"value entry" longshot ping** — when price is being carried toward the line and the side it's heading to is still the big-multiplier underdog (≥2.5x) — the actual profit signal (it was screen-only before). **(4)** The near-lock scanner now **survives Kalshi rate-limits**: it accepts a recently-cached price as long as it still belongs to the current round (so 429s no longer silence pings), and folds the value-entry check into the same one-fetch-per-coin pass. **(5)** Verified all four newer coins' Kalshi tickers (DOGE/XRP/HYPE/BNB) are correct against Kalshi's live API — they show the real market price, not the "est" fallback. **Pick-impact: none — the worker's `rankBest` now forwards the market price (`crowdOver`) to the app, but that's a display-only field; it does not change which side is picked or the ranking score.** (`scanLateLocks`/`notifyHotPicks`/`rankBest` in `worker.js`; `rowPayout`/`maybeNotifyHot`/`renderBestBar`/`renderBestList` in `eth-tracker.html`.)

- **Audit fixes on the r38 consistency pass (r39).** A full self-audit caught three follow-ups, all display/doc-only (the picker is untouched): **(1)** the **Payout line now reads the same market as the headline** (`activeCrowd()` instead of `state.lastCrowd`) — in the final 2 minutes it could otherwise price *this* (settling) round while the headline showed *next* round, so the multiplier and the % disagreed. **(2)** The **dead-money cutoff is one shared number** (`DEAD_MONEY_PCT`, 90%) used by both the headline guard and the payout line, so they can't contradict (no more headline "already nearly settled" next to a payout "≈ fair"). **(3)** When a coin has **no live Kalshi crowd**, the % now shows an **"est ·"** label so the fallback to the blended estimate is visible, not silent. Also refreshed stale docs (worker near-lock cron `:08/:23/:38/:53` + 75–92% band, the coin list, and the Auto Pick section). (`renderPayout` / `DEAD_MONEY_PCT` / `marketPct` labels in `eth-tracker.html`.)

- **One source of truth: every % you see is now the live Kalshi market price.** The headline %, the This/Next round chips, and the payout line used to mix two different numbers — the app's *own blended estimate* (jiggly, our guess) for the headline, but the *market's price* for the payout. That's why the app could say "81%" while Robinhood showed "98% / 1.0x" for the same bet, and why it flickered and sometimes flagged dead-money buys. Now **the market's own number (the live Kalshi price) is the single figure shown everywhere** — so the app, the payout, and your exchange screen all agree, and the number stops twitching (market odds are stable). The blend still **picks the side** and now appears only as the small "Live:" lean and the **+EV "edge"** on the payout line. Also: when a side is **already near-certain (~90%+)** the card now says **"already nearly settled"** instead of **BUY**, because betting it pays ~1.0x (just your stake back) — directly fixing the "it told me to bet UNDER but it's 1.0x, so nothing" complaint. **Pick-impact: the directional picker is UNCHANGED (same proven blend chooses the side); what changed is the *number displayed* (now the market's, not ours) and the *buy/skip wording* for near-certain favorites (no longer shown as BUY). The AI-free 24/7 tracker is untouched.** (build marker `r38`; `marketPct` + `renderPickCard` / `renderDualPick` in `eth-tracker.html`.)

- **Retired the in-app "Sure-Thing" play-style tab — back to three clean modes.** It was redundant with **Disciplined** and was built on the app's *jiggly* blended % (not the market price), so it flickered bet ↔ sit-out every few seconds, flagged dead-money 1.0x bets as "BET NOW", and could contradict the headline. The correct "bet a clear favorite while it's still bettable" job is already handled by the **Discord near-lock pings** (which read the stable *market* price ~7 min before close) and the **Payout +EV line**. Existing Sure-Thing users are migrated to Disciplined. **No pick-math change.** (`getPlayStyle` / `pickStrength` in `eth-tracker.html`.)

- **Layout polish: full-width Play-style tabs + the % moved up next to the call.** The Play-style dial (Disciplined/Balanced/Active) now **stretches across the whole card** with equal, responsive tabs instead of clustering on the left. And the big **likelihood %, the green/red confidence bar, and the indicator count** moved **up to sit right under the directional headline** (HOLDING OVER ↑), so the call and its confidence read as one unit; the Payout and Game Plan strips now sit below them. Display-only. (`.playStyle` CSS + pick-card markup order in `eth-tracker.html`.)

- **Payout multiplier + "is it actually profitable" on the pick.** The honest reason near-locks win but don't pay: on a prediction market the **payout is the inverse of the win chance** — a ~98% favorite pays ~1.0x ("dead money", just your stake back), a coin-flip ~2x, a longshot ~20x, so simply *following* the market is ~break-even. The only profit is **+EV**: betting a side the app rates **more likely than the market's price**. So the pick card now shows **"Payout ≈ N.NNx"** (estimated from the live Kalshi price, like Robinhood/Coinbase) plus a verdict — **+EV** (app % > market %), **≈ fair / break-even**, **overpriced**, or **dead money** at ~1.0x. Lets you skip the 1.0x dead-money bets and only take the ones with a real edge. Honest caveat: those edges are thin and rare on 15-min crypto — this finds *marginal* profit, not a money printer. (`renderPayout` in `eth-tracker.html`.)

- **Sure-Thing now pings the BETTABLE window, not the locked one.** Real-world catch: the platform **locks a side once it's near-certain** (you can't bet a 99% lock — only the longshot stays open), so the original "~3 min / ≥78%" pings arrived at ~99% — too late to act on. Fixed by scanning **~7 min before close** (`:08/:23/:38/:53`) and pinging when a side is **clearly favored but still bettable** — Kalshi crowd in a band (default **75–92%**, `LOCK_MIN_PROB`/`LOCK_MAX_PROB`); ≥92% is skipped as probably-locked. In-app Sure-Thing now says **"BET _ NOW"** in that window and **"LIKELY LOCKED"** once it's too late. Slightly lower win rate than a 99% lock (it's earlier) but you can actually place it. (`scanLateLocks` + `8,23,38,53` cron; `surething` in `pickStrength`.)

- **"Sure-Thing" mode + a 24/7 near-lock scanner that pings you to bet.** The highest-win-rate path on a near-random market is to bet only **near-locks** — rounds the market itself has nearly decided. So: **(1)** a new **Sure-Thing** play-style that stays silent until, late in a round, the price is *already* decisively on one side (~70%+), then flags **"NEAR-LOCK — bet"**. **(2)** A new worker cron at **:12/:27/:42/:57** (≈3 min before each close) that **scans all coins** and fires a **Discord ping** the moment any is a near-lock (the Kalshi market ≥78% one side) — even with the app closed. This is *why notifications never fired before*: the old check ran at the open (~50/50) and almost never qualified; near-locks happen late. Honest caveat baked into the copy: near-locks are **cheap to win** (pay ~78¢ to win ~22¢), so it's "where it'll land", not a pricing edge. The scanner is **read-only** (no extra KV writes) and **never touches the proven 15-min pick/grade/learn loop**. Tune with `LOCK_MIN_PROB` (default 78). (`scanLateLocks` + the `12,27,42,57` cron in `worker.js` / `wrangler.toml`; `surething` in `pickStrength`.)

- **"Play style" dial — choose how often the app tells you to bet (default Balanced).** Replaces the old "High-conviction only" toggle with a 3-way control by the Auto Pick header: **Disciplined** (only the rare strong picks the 24/7 tracker agrees with — fewest bets, highest accuracy ~77–84%), **Balanced** (also surfaces smaller "LEAN — small bet" calls when the Co-Pilot has a real edge ≥6% even though the 24/7 tracker is sitting out — a real bet most sessions), and **Active** (lowers the bar to ≥4% — most rounds get a playable call). Honest trade-off baked into the labels: **more action = lower win rate**; only Disciplined/Balanced are likely to profit after fees. **Pick-impact: YES — it changes which rounds the banner calls "worth betting"** (the underlying probabilities/picker math are unchanged, and the AI-free 24/7 tracker is untouched). Disciplined === the old high-conviction-only behavior; existing users with that toggle on are migrated to Disciplined. (build marker `r32`; `getPlayStyle` / `pickStrength`.)

- **Coin list matched to the betting platform: BTC, ETH, SOL, XRP, DOGE, HYPE, BNB.** Dropped **SHIB** (not offered) and added **HYPE** and **BNB** — both confirmed live Coinbase pairs (`HYPE-USD`, `BNB-USD`), so they get real live prices, indicators, and 24/7 self-grading like the rest. For **crowd odds** on the two new coins, add `KALSHI_SERIES_HYPE` / `KALSHI_SERIES_BNB` worker variables (use `?discover=HYPE` to find the ticker); until then their crowd line shows `n/a` but everything else works. (`AUTO_COINS` / `CB_PRODUCT` in `worker.js`; coin switcher + `COINS`/`COIN_ICONS` in `eth-tracker.html`.)

- **Emojis stripped from the UI (only 🎯 on the Game Plan stays), and the AI label now follows your model.** Removed the decorative emojis from the strength banner, value-entry cue and alert toggle per request. Also fixed a confusing mismatch: switching models (e.g. to Gemini) now **clears the previous model's read**, so the read + Game Plan can't keep showing "Claude" after you've picked Gemini — the label always matches the model that actually answered.

- **Phone notifications can now use a Discord webhook (ntfy kept failing).** ntfy.sh returned **429** from the Worker even with a valid token (its free tier doesn't play nice with Cloudflare's shared IPs). So the Worker now also supports **`DISCORD_WEBHOOK`** — set it to a Discord channel webhook URL and you get the same high-confidence pings there, reliably. The `?testpush` self-test now reports each channel; ntfy support stays for anyone it works for. (`pushDiscord` / `notifyHotPicks` / `testpush` in `worker.js`; setup in `cloudflare-worker/README.md`.)

- **AI status now tells the truth instead of saying "reading…" forever.** In **Manual** spend mode the AI only reads when you tap **Get AI Read** — but the row used to show a perpetual *"reading…"* shimmer, which looked stuck/broken. Now it shows **"tap Get AI Read"** when idle in Manual, an actual **"reading…"** only while a fetch is in flight (tracked via `state._aiFetching`), and *"waiting for a read…"* in the auto modes. (This is also why the **Game Plan** strip looked missing — it only appears once a read is actually fetched; tap Get AI Read, or switch AI spend to Smart/Every-round.) Display-only. (build marker `r30`.)

- **AI "trust dial" — a bounded ±20% nudge on the AI's earned weight.** A slider in the AI Co-Pilot section that lets you lean the AI's influence **in or out by up to 20%** around the weight it has *earned* from its report card — so the track record stays the anchor, you just fine-tune. Defaults to **0 (no change)**, shows the resulting AI weight live, and is clamped to a sane band. Sits beside the existing "Trust the AI more" toggle (which raises the *ceiling*); the dial is the finer lever. **Pick-impact: YES — this changes the AI's weight in the in-app blended pick** (more/less AI say). It does **not** touch the AI-free 24/7 tracker, and at the default 0 it's identical to before. Per-device (not synced). (build marker `r29`; `getAITrust` / `aiWeight` in `eth-tracker.html`.)

- **AI "Game Plan" strip — a one-line tactical note under the pick.** New strip right beneath the pick that turns the AI read into *how to play it*, not just up/down: the round's character plus an **entry tactic**, aimed at the next round — e.g. *"Choppy with wicks both ways — wait for a dip back toward the line instead of chasing"* or *"It already ran hard, so the easy entry's gone — only worth it on a pullback."* Directly targets the "by the time it's confident I'm too late" problem by talking about **timing**. It rides on the **existing, cached** AI read (a new `plan` field), so it adds **no extra AI call and no real cost**. Shows only when you've fetched a read. **No pick-math change — it's an extra qualitative field on the read.** (`plan` in `worker.js`; `renderGamePlan` in `eth-tracker.html`.)

- **The pick now HOLDS a locked "skip" instead of quietly re-picking a live side.** The complaint: the next-round preview would say SKIP, then the round would open and the card would flip to a confident-looking **BUY OVER/UNDER** — a live read reacting to the move, not the decision we actually locked. Turns out the round was *already being graded as a skip* the whole time (the recorded pick comes from the locked call), so the screen was just contradicting the scorecard. Now a round locked as a coin-flip **stays "SITTING OUT"** through the round — the live lean is shown only as *status*, clearly labeled "not a new bet." **Display-only fix: it changes what the card recommends to match what was already locked and graded — it does NOT change the picker's math, and a held skip was never counted as a loss.** (build marker `r27`; `thisRoundCommitted` / `renderPickCard`.)

- **"Decisive-break" shadow test — measuring whether a stronger lean actually holds up (no pick change).** Motivated by the classic gut-punch: the picker leans OVER, then a late move knifes the price below the line in the final stretch and it settles UNDER. This quietly records, for every round we lock, **how strong the next-round lean was** and then **how often it actually won** — grouped into *strong (≥60/40)*, *slight*, and *coin-flip*. If strong leans win a lot more than coin-flips, then "wait for a decisive break before committing" is worth promoting to live; if not, we've learned it cheaply. It's **pooled across all coins** so it answers in **tens of rounds, not hundreds**, and shows in the *Model & Accuracy* panel next to the existing lock-timing test. **Measurement only — it never changes a pick you make.** (`lockAB` conf-calibration in `eth-tracker.html`.)

- **One shared AI read per round — opening the app on more devices no longer multiplies the cost.** The Worker now caches each AI read for the round it's about (per coin + model), so the **first** read is the **only** paid one — every other device, and every repeat tap within that round, reuses it for free. Open it on your phone, iPad *and* laptop and you still pay for **1× read per round**, not 3×. The one exception is the existing "the read now contradicts the market" auto-catch-up, which still pulls a fresh read — and then **replaces the shared one for everyone**. A reused read shows a small **"· shared this round"** note. **Pick note:** the picking math is unchanged and the AI-free 24/7 tracker is untouched, but the AI *voice* folded into the in-app pick may now be the round's shared read rather than a brand-new one per tap (it still auto-refreshes if it goes stale). (`airead:` KV cache in `worker.js`; `fresh` flag in the app.)

- **Your AI-model choice now syncs across all your devices.** Picking a model (Gemini, Groq, or Claude Haiku/Sonnet/Opus) used to live only in the one browser you set it in; now the choice is saved on the shared Worker and every device picks it up — on app open and whenever you return to the tab. Change it on your phone and your laptop reflects it next time it loads. **What this means for picks/cost:** it only changes *which AI model answers* — the picking math and the AI-free 24/7 tracker are untouched — but a **paid** model chosen on one device now applies everywhere, so AI reads on the others use (and bill for) that same model. The **AI spend mode** (Smart / Every-round / Manual) stays per-device. (`syncSharedModel` / `pushSharedModel` in the app; `?aimodel` GET + `setModel` POST + a dedicated `cfg:aimodel` KV key in `worker.js`.)

- **Body text switched to Inter for easier reading (numbers + the BUY headline stay Space Mono).** All the prose, labels and buttons now render in **Inter**, a clean sans-serif that's noticeably easier to read than the old all-monospace look. Every number — price, countdown timer, percentages, hit-rate, history — keeps **Space Mono** (they carry an explicit `.mono` class) so the digits still line up neatly, and the big **BUY/HOLDING** call-out was kept in Space Mono too for its trading-terminal feel (its smaller sub-line stays Inter). The live **"Beat $X · ▼ … · UNDER"** round-status line under the price was also moved to Inter on request (it keeps `tabular-nums`, so its ticking numbers still hold their width). **Display-only — no pick, commitment, or confidence logic touched** (build marker `r22`).

- **Phone push notifications made reliable (+ a one-tap test).** Two notification fixes. **(1)** Added a `?testpush=<your NTFY_TOPIC>` Worker endpoint to confirm the whole alert chain (Worker → ntfy → your phone) works **without waiting for a rare strong pick** — open the URL and it fires one push straight to your device; it's locked behind the topic name itself, so it leaks no new secret. **(2) Gotcha we found:** anonymous pushes from a Cloudflare Worker to the free ntfy.sh server get **HTTP 429 (rate-limited)** because Workers share outbound IPs and ntfy limits by IP — so the worker now sends an optional **`NTFY_TOKEN`** (`Authorization: Bearer …`) which moves the limit to your free ntfy account and makes pushes go through. Set `NTFY_TOKEN` as a Worker secret (see `cloudflare-worker/README.md`). **Measurement/plumbing only — no pick, commitment, or confidence logic touched.** (`testpush` + `notifyHotPicks` in `worker.js`.)

- **At-a-glance "strong vs coin-flip" banner on the picker.** After a losing run from betting too many ~50/50 calls, the Auto Pick card now leads with a **color-coded strength banner** so it's obvious which handful of picks are actually worth betting: **✅ STRONG — worth betting** (green glow) when the disciplined 24/7 tracker *agrees* with the Co-Pilot (those committed bets run ~77–84%); **🪙 COIN-FLIP — better to pass** (muted) when the tracker is sitting out or the two disagree; and **👀 NEXT-ROUND PREVIEW** for the speculative next-round pick (it opens ~50/50, so it's never "strong"). Goal: stop getting pulled into the coin-flips. **Display-only — no pick logic changed**; it reads the same signals the "Which to follow" line already uses (`pickStrength()`).

- **Next-round lock back to 2:00 (more heads-up).** After a run of losing bets, reverted the next-round pick's lock from 0:40 to its original **2-minute** lead — it locks on slightly calmer signals and, more importantly, gives more time to actually place the bet. Honest note: the built-in lock-timing A/B shows accuracy is **~unchanged by timing**, and the live record is healthy (**77% on committed bets, 84% Kalshi-confirmed**), so this is a heads-up/UX change, not a fix to a broken picker — the real lever is *following the disciplined high-conviction picks rather than betting every speculative next-round preview*. Pick-timing only; one-line tweak (`BET_WINDOW` 40 → 120, worker reframe to match).

- **AI is now Manual by default (no auto-spend) + a visual "AI weight" gauge.** Two AI-section changes. **(1)** The paid AI read no longer auto-fires — `AI spend` defaults to **Manual**, and existing devices are flipped to Manual once, so you only pay when you tap **Get AI Read** (switch back to Smart/Every round anytime in setup). **(2)** A new **"AI weight in the pick"** gauge shows at a glance the AI's *real* share of the blended call — a provider-tinted bar + % (its earned weight ÷ all the voices), plus an "auto-reads: off/on" status; it reads **0%** when no read is folded in. **Pick-impact note: with auto off, the in-app pick runs on its other voices (crowd, indicators, barrier, learned model) until you fetch a read — the picking *math* is unchanged, and the AI-free 24/7 tracker is unaffected either way.**

- **Sharper grading — the tracker now matches Kalshi's *real* settlement, so the model learns cleaner labels.** Researched + verified against Kalshi's **live API and rulebook**: each round settles on a **60-second average of the CF Benchmarks index** (`ETHUSDRTI`), not a single price — the close is the 60-sec average at expiry, and the line itself is the 60-sec average at the open (so one round's settle = the next round's strike). Three changes: **(1)** when Kalshi confirms a round, we now also pull its **real settled value** (`expiration_value`) and write it onto the record, so the arrow / Recent-Rounds close + move-% match **exactly what Kalshi paid** (no more "the close looks like it's on the wrong side" rows). **(2)** the *provisional* grade (before Kalshi confirms) now uses our **60-second Coinbase average** instead of a single candle close — far closer to Kalshi's method. **(3)** when the 60-sec average and the single candle land on **opposite sides** (a photo-finish), the round is flagged `disputed` and **held back from training until Kalshi confirms it** — so the model never learns a wrong outcome. **Pick-impact (standing rule): (2) and (3) change *what the model learns from* — strictly toward cleaner, more-accurate labels — and (1) also sharpens the "how far past the line" feature; the picking *math* is unchanged and it's reversible. The definitive grade was already Kalshi's official `result`; this tightens the *provisional* window and the *displayed* numbers.** Worker-only (no app build change); effects appear over the next few crons as rounds settle.

- **A round of tasteful "moment" animations.** Six additions, all decorative (pick values stay rock-steady, so no twitch; all honor `prefers-reduced-motion`): **(1)** the pick **deals in** at each round rollover; **(2)** the **Next Round** column **snaps to life** when it locks in the final 40s; **(3)** the Track-Record stats **count up + flash green** when they tick up; **(4)** the timer's fast pulse now starts at the **40-second bet window** ("decision time"); **(5)** the AI **"reading…"** text **shimmers** while it thinks; **(6)** a **high-conviction pick** gives the card a slow **glowing border**. **Display-only — no pick impact.**

- **Glowing "which AI" badge on the picker + ambient animations.** A small **provider-tinted, glowing pill** now sits at the top of the Auto Pick card showing which AI is helping the guess — e.g. *Claude Sonnet 4.6* (Claude coral), *Gemini 2.0 Flash* (blue), *Groq* (orange). It breathes, a light sweeps across it, and its dot pulses; the live tag gently pulses too. Honors `prefers-reduced-motion`. **Display-only — no pick impact.**

- **"Case memory" — the AI + tracker can now reference "have we seen this setup before?"** A new non-parametric memory: before each round it finds the **20 past rounds whose opening conditions most resemble right now** (nearest-neighbour over the same 12 features the model uses, pooled across all coins) and reports which way they actually settled — e.g. *"the 20 setups most like now → OVER 65%."* It's **handed to Claude in its prompt** (so the AI can reference it) and **scored against real outcomes** into a measured hit-rate — but per the measure-first rule it is **NOT in the live pick** until that accuracy proves it helps. It complements the learned model (which fits *one* global rule) by catching **local** patterns the line misses. Shown in the Model & Accuracy panel (🧩). **No pick impact yet (measurement-only).** 15-min direction is near-random, so expect a faint tilt.

- **Fixed the pick "changing its mind" on refresh.** You noticed the next-round call flipping the first second of a new round / when reloading. Cause: the committed side for the current round lived only in memory, so a reload re-derived it from the noisy ~50/50 round-open signals and could land on the *other* side. The committed pick is now **saved per round and restored on load**, so a refresh shows the **same** side. (The early next-round lock stays — the heads-up is the point; it just needed to survive a reload.) **Pick-impact: makes the proven commit-and-hold actually hold across refreshes; it does NOT change how the side is chosen.**

- **Cleaner AI Co-Pilot panel — uniform controls + clearer hierarchy.** The "the read" setup was a stack of mismatched controls (44px/13px dropdowns next to a 46px/15px button, option text truncating mid-word). Now **every field and the button are one size** (46px tall, 14px, 12px radius, custom chevron on the selects), each control gets a small **caption** (Worker URL / Model / AI spend), the spend options dropped their redundant *"AI spend ·"* prefix, and the read rows are tidied (labels never wrap; values right-align and wrap cleanly). **Display-only — no pick impact.**

- **⚠️ Pick-affecting: the AI now earns its weight from a report card.** Claude (or any model) was a *fixed*-weight voice in the live in-app pick with no accountability — it never got scored and never learned from a miss. Now every directional AI call is saved and **graded against the real Kalshi outcome** (the same definitive result the arrows + record already use), kept as a **per-model report card** (a free model and Opus don't earn the same trust). That record sets the AI's weight in the live blend: it **climbs when the model beats a coin-flip, falls when it doesn't**, and is **shrunk toward the old 0.30 until the sample is real** — even a perfect 3/3 only nudges to ~34%, so nothing swings on noise. The *"Trust the AI more"* toggle (formerly "weight this read more") now **raises the ceiling** (0.45 → 0.60) and trusts the card sooner. Shown live in the AI card: *"AI track record · 12/18 right · 67% → weight 40%."* **Pick-impact (standing rule): yes — it changes the in-app pick's AI weight (that pick only; the AI-free 24/7 tracker is untouched). Safe by design: with no record it's exactly today's 0.30, and the scorekeeping half is measurement-only. One-flag revert.**

- **"Log more often" experiment — measured, not applied to the live pick.** The tracker commits on only ~10% of rounds (its edge is selectivity). To answer "would betting more often help?" without risking the proven record, the coverage line now also shows what a **looser ±0.05 commit band** *would* bet and hit, scored on the same outcomes — e.g. *"a looser band would bet 43% at 61% right (measured, not the live pick)."* The real pick is **untouched** (still the proven ±0.10→0.20 band). The data is blunt: every step toward more bets bleeds the hit-rate toward a coin-flip (±0.10 ≈ 67% on ~12% of rounds → ±0.05 ≈ 61% on 43% → bet-everything ≈ 53%). **Display/measurement only — zero pick impact.** If the looser number holds up over fresh rounds, flipping it on for real is a one-liner.

- **Fixed the 24/7 tracker dropping ~30% of rounds (the "behind / out-of-date" log).** Pulled the live Worker state and found the tracker had missed **92 of the last 305 rounds** — and crucially that this was **missing** data, not **wrong** data. (The model trains on Kalshi's *definitive settled* outcome — exactly what Robinhood pays — so even the rounds where the logged Coinbase close looks like it's on the "wrong" side of the line are learning the correct label; Kalshi settles on a 60-sec CF-Benchmarks index average, which can differ from a single candle on a razor-thin round.) The real bug: a cron that fired late (or while Kalshi was rate-limiting the server IP) often found no Kalshi market in its 6–16.5-min window, and because the crowd read was still technically *fresh* the self-tracked fallback was **blocked** — so that run recorded **nothing**. The fallback now fires whenever the Kalshi path locks nothing **for any reason** (stale crowd, no market in the window, or an already-decided market), needing only the live Coinbase price — so **every cron that runs records a round**. **Pick-impact (standing rule): none to how picks are computed** — a normal Kalshi-reachable pick is byte-for-byte unchanged; this only stops rounds being *dropped*, so the log is complete and the model learns from more rounds (the missing ones were lost training signal, never bad labels). Broadens the earlier Kalshi-unreachable fallback; verified against the live `?picks=ETH` data. (It can't recreate already-missed rounds — it stops *future* drops.)

- **⚠️ Pick-timing: the next-round pick now locks at 0:40 left (was 1:30).** `BET_WINDOW` 90 → 40 (and the Worker's next-round reframe threshold `secs <= 120 → 40` to match), so the committed **Next Round** pick shows/locks in the final **~40 seconds** instead of 1:30 — locking later on fresher data, at the cost of less heads-up before the round turns over. The built-in lock-timing A/B keeps grading whether later is actually sharper. **Pick-impact (standing rule): changes *when* the next-round pick commits, not how it's computed.** One-line revert; the AI-free 24/7 tracker is unaffected.

- **⚠️ Pick-affecting (opt-in): "Weight this AI read more" toggle + a tighter next-round lock.** Two changes that *do* alter pick behavior (called out per the standing rule): **(1)** a toggle inside the **AI Co-Pilot · the read** card that bumps **Claude's weight in the in-app Auto-Pick blend from 0.30 → 0.55** (the heaviest voice) — **default OFF**, so the proven blend is untouched unless you flip it. It only moves the **in-app Auto-Pick %**, *not* the AI-free 24/7 tracker (your proven record/streak stay untouched), and only matters when an AI read is actually present. It's an **experiment** — up-weighting the AI isn't proven to help; watch *Recent form* with it on vs off. **(2)** The next-round pick now **locks/shows at 1:30 left (`BET_WINDOW` 120 → 90)** instead of 2:00 — locks later on fresher data (trade-off: less heads-up); the existing lock-timing A/B keeps grading whether later is actually better. Both are one-line reverts; the AI-free tracker and its learning are unaffected.

- **The learned model is now backed up hourly + daily — you can't lose the brain.** The 24/7 tracker's entire state (every coin's model + history + the pooled model) lived in a **single** KV record overwritten every 15 min, with no backup — one bad write or accidental wipe could erase the learning. The cron now keeps **two rolling rings**: an **hourly** snapshot (`auto:state:hourly:<0-23>`, the last 24h) and a **daily** one (`auto:state:backup:<0-6>`, the last 7 days) — so you can roll back to within an hour over the last day, or a day over the last week. Cost is fixed at **~25 extra KV writes/day (~121/day total)**, well inside the free tier's 1,000/day → **$0**. List with `?backups`, recover with `?restore=hourly:<n>` / `?restore=daily:<n>` (token-gated like `?reset`). **Purely protective — only ever copies the record, never touches a pick.** Details in `cloudflare-worker/README.md`.

- **Added a quiet "Recent form" line — hit-rate over the last 50 bets.** Under the Track Record stats, a small muted line now reads e.g. _"Recent form · 11 of last 15 bets right · 73%"_ — a **rolling per-bet hit-rate**, capped at the last 50 *committed* bets (newest-first), tagged **"small sample"** under 30. It's the steadier number to watch **instead of the streak**: it won't spike on a hot run or get diluted by ancient all-time history. Measurement-only — the picks, lock and confidence are untouched.

- **Logged what the 24/7 tracker is "doing right" (prompted by a 12-round confirmed streak).** Added a _What it's doing right_ note to the **24/7 Auto-Tracker** section: the edge is **selectivity + confluence**, not volume — it skips ~85–90% of rounds and commits only when the crowd price, momentum, order-book flow and learned model are both lopsided **and** aligned (SKIP band ±0.10 aligned → ±0.20 split). A winning run reflects a **trending regime** where those reads agree; documented the honest caveat that a streak is **variance-laden and regime-dependent**, so the number to trust is the per-bet hit-rate over a large sample, not the streak. Also fixed stale band figures in the docs (the code tightened ±0.08→±0.18 to **±0.10→±0.20**). Docs-only — no behavior changed.

- **Tracker status banners moved to the footer and quieted.** The 24/7 tracker's live **"SKIP — no clear edge"** auto-pick banner (`#autoLatest`) and the **"🧠 Model … lean"** chip (`#modelLeanChip`) sat loud — an orange box — at the top of the Track Record. Neither is in the Figma, and they were the brightest thing on screen. They're now **small, boxless, muted lines in the page footer**, so the Track Record opens straight at the stats (matching the design). Display-only — the tracker's pick still shows prominently in the Auto-Pick panel up top; this just relocates the redundant restatement.

- **This Round / Next Round box matched to the Figma (grey stroke removed).** The dual-pick box had a visible grey border (`1px solid --separator`) and a green/red tint on the committed column — neither is in the design. Per Figma node 84:143 it's now a uniform **`#141414` fill, `10px` radius, no stroke**, with title-case `This Round` / `Next Round` labels (12px) and the 30px green/red picks. Pure styling — no logic touched. (Note: the box still can't look *identical* to the static mock at all times — the mock freezes both rounds as committed picks, while the live **Next Round column stays dormant — "locks in 4:01"** — until the next market opens in the final 2 min. When both rounds are committed, it now matches.)

- **Recent Rounds rebuilt to match the Figma 1:1.** The per-round log was a busy line (*SKIP · sat out · OVER (leaned OVER ✓) · self-tracked*); it's now the mockup's clean row — **`time · ETH OVER/UNDER · ✓/✗ · ±%`** — flat rows in one subtle card (six shown, "See all N" below). The **±%** is the round's real move vs the line, computed `(close − strike) / strike` and signed by the outcome (the data was already on each history record). **Display-only — the picks, the lock and the confidence are untouched.** The Kalshi-confirmed / self-tracked / settling nuance and the "would have leaned" shadow tally moved into each row's **hover title** (and still feed the coverage line) instead of cluttering every row; times now show 24-hour like the mockup.

- **Reconciled the app against the actual Figma file (verified the whole screen top-to-bottom).** Brought the lower half in line with the design — again **UI-only except the stats row** (which is log/measurement, never the picks): **Live Indicators** and **Model & Accuracy** now open **expanded by default** (matching the mockup), still one tap to collapse; and the **Pick-Accuracy stats row** changed from *Bets · Correct · Hit Rate · Now* to the mockup's **Rounds · Correct · Streak · Hit Rate** — the old "Now" (current pick) was redundant with the Auto Pick panel, and the new **Streak** reuses the win-streak the tracker already computes (consecutive correct from the newest graded round). Two deliberate deviations from the static mock, both noted: the 📖 **Guide** stays in the footer (the mock omits it, but it's the only link to the full guide page — removing it would orphan help), and the section keeps its **"Track Record"** title (the app retired the "Pick Accuracy" name on purpose).

- **UI pass to match the Figma mockup: big "% chance" focal point + a decluttered header.** Two parts, both **strictly UI** (CSS + element order/placement, every id/handler/data-binding preserved) — **no change to the picks, commitment, confidence, or the logged record.** **(1) The betting panel's "% chance"** moved from a small 34px number sitting *inline* beside its label to a large, stacked **"64%" over "CHANCE UP"**, with the green/red indicator bar pulled up **directly beneath it** — the mockup's composition (big percent → bar → "5↑ 2↓ of 7 indicators"). Pick-Accuracy stat numbers bumped to match the mockup's weight. **(2) Decluttered the chrome** so the default view matches the clean mockup *without removing anything*: the 📖 **Guide** button moved from the header to the **footer** (header is now just the title + Live, like the design), and the niche **value-entry record** strip folded into the collapsed **Model & accuracy** panel; the **AI Co-Pilot "read" card** collapsed into a tap-to-open panel (its pick already shows in the Auto Pick panel above it); and the timer card's **next-round preview line** hidden so the countdown card is clean like the mockup. Nothing removed — every panel is still there, one tap away, and the next-round pick still surfaces in the Auto Pick panel's "Next round" column when it locks.
- **Tighter SKIP discipline + a sharper default AI model.** **(1) The commit band is tighter:** the worker's `freePick` now needs **±0.10** (was ±0.08) when reads align, up to ±0.20 when they split, and the app's lock thresholds moved **0.53/0.47 → 0.55/0.45**. Net: it **bets less often, only on stronger, more-aligned setups** — trading coverage for a higher hit-rate *on the bets it places*. **Pick-impact (per the standing rule): yes — this changes when it bets vs sits out (fewer bets, hopefully better ones). It's a hypothesis, not proven; we'll validate it against the now-complete record (bet-rate vs hit-rate-on-bets), and it's a one-line revert.** **(2) Default AI model → Claude Sonnet 4.6** (was Gemini Flash) for a sharper read — needs `ANTHROPIC_API_KEY` in the Worker; with no key it falls back gracefully to a free provider. Affects the **live app's AI read only** (the 24/7 cron uses no LLM).
- **On the paid Cloudflare plan now — gap-free logging, all six coins tracked, firmer grading.** Upgraded the Worker to the paid plan, which lifts the per-run subrequest limit (50→1,000) that was causing the cron to silently fail and stop logging for hours. Two things follow: **(1) every coin is tracked now** — DOGE/SHIB/XRP have no Kalshi 15-min market, so they're **self-anchored** (strike = the round's open) and **self-graded** on the Coinbase close (flagged "· self-tracked"; they don't count toward the confirmed-vs-Kalshi rate). They add zero Kalshi load (they skip the crowd fetch) and just a few Coinbase calls, well within budget. The "live only" marks are gone. **(2) Un-throttled Kalshi reconciliation** (4→8 rounds/coin) for faster, firmer convergence to the definitive grade. **Honest note: this fixes *reliability and coverage* — a complete, trustworthy record and a model that learns from every round — not the predictive *ceiling*; 15-min direction is still near-random.**
- **The 1d / 1W / 1M chart buttons are now real time-windows, not candle sizes.** They used to be candle *granularities* (trading-chart convention), so "1M" meant *monthly candles* and stretched ~10 months back — confusing, and a label bug compounded it (monthly points read *"Week of Aug 21"*). Now **1d = last 24 hours, 1W = last 7 days, 1M = last 30 days** (using native Coinbase intervals, so zero extra data cost), and the date labels are fixed. The short buttons (1m–1h) are unchanged. Chart/display only — picks and grading untouched.
- **The locked next-round pick now survives a refresh — and a built-in test will reveal if locking later is better.** Two things. **(1) Persistence:** the 2-min lock used to live only in memory, so reloading the page re-rolled it from the noisier final-minute signals (the *"SKIP on the timer, OVER after I refresh"* surprise). It's now saved per-round and restored on load, so a refresh shows the **same** committed pick — no re-roll. **Pick-impact: this stabilizes what you *see* (the proven 2-min lock); it does not change how the pick is made.** **(2) Lock-timing A/B:** the app now quietly records both the 2-min pick **and** a ~1-min "late" pick every round and grades them against the same definitive outcome, showing a running **"Lock-timing test · 2-min X% vs 1-min Y%"** in the Track Record. After ~50 rounds it'll say which timing is actually sharper — so we change it on **data, not a hunch**. The A/B is measurement-only; the live pick is untouched.
- **New "model lean + rounds learned" chip.** A compact, always-visible indicator in the Track Record shows which way the per-coin model is currently leaning (e.g. *"🧠 Model leaning OVER 56%"*) and **how many rounds it's learned from** — so you can see at a glance what it's thinking and how seasoned it is. Display only.
- **The learned model now reads a *cross-asset* signal — how the other coins are moving.** Crypto moves together and **BTC tends to lead**, so a 12th feature — **`marketMom`** — feeds each coin's per-coin model the net 1-min momentum of the *other* tracked coins. The cron now processes **BTC first** so ETH/SOL read its *fresh* momentum, at **zero extra Coinbase/Kalshi calls** (it reuses momentum already computed each run, so it stays well inside the free tier). Built to be **self-limiting**: the new weight starts at **0** and only moves as the model grades new rounds, so a migrated model's picks are **byte-identical until it actually learns the signal** — verified with a runtime test. **Pick-impact (per the standing rule): yes, this is a model/picker change. Picks will drift *gradually* — and only if the cross-asset signal proves predictive, which we'll read off the **Brier score**. It can sharpen accuracy but can't hurt the proven picker (worst case the model learns a ~0 weight). Fully reversible — drop the feature and models re-migrate.**
- **The "price to beat" now shows "(est.)" until Kalshi's real strike loads.** At a fresh round open the app briefly shows the line as the **Coinbase open price** (a placeholder) until the crowd read fills in Kalshi's official strike — which is why it could sit a few cents off Robinhood for a moment, then snap into alignment at the round turn. That fallback is now tagged **(est.)** in the "Beat $X" readout and chart (and the official line **(Kalshi)**), so the brief mismatch is self-explanatory rather than a mystery. **Display only — the strike, picks and grading are unchanged.**
- **Coins with no Kalshi 15-min market are now marked "live only" instead of showing an empty record.** The 24/7 tracker can only log coins it can grade against Kalshi — **ETH, BTC, SOL**. The others (**DOGE, SHIB, XRP**) are still selectable and still get a **live** OVER/UNDER pick, but they were showing a permanent "warming up" Track Record that read like a bug. Now the switcher **dims** them with a tiny **live** tag (the mobile dropdown appends "· live only"), and their Track Record says plainly there's no graded record because Kalshi runs no 15-min market for them to settle against. The tracked set is driven by the worker's live config — `?best` now reports it — so it **auto-syncs** if you ever add/remove a `KALSHI_SERIES_*`. **Log/display only — picks, commitment and confidence are untouched.**
- **Home-screen app icon.** Added a real `apple-touch-icon` (a green "over" ▲ / red "under" ▼ on the app's near-black, generated at build and published by the Pages workflow) so the **Add to Home Screen** shortcut shows a proper icon instead of iOS's auto-made "1" tile. iOS caches the icon at add-time, so an existing shortcut must be **removed and re-added** to pick it up.
- **The model now learns from the *definitive* outcome — Coinbase features + Kalshi's settled result.** It already used both sources (Coinbase momentum / order book / RSI / MACD as features, the Kalshi crowd as another feature), but it *trained* on a provisional close-vs-open proxy the moment a round closed. Now each round teaches the model its **actual** OVER/UNDER outcome, and for Kalshi-ticketed rounds training is **deferred until Kalshi confirms the settled result** — so it learns from exactly what Robinhood paid, not a candle grade that can flip on a thin round. Each round trains the model once (a `trained` flag + a grace net so nothing is lost). **Pick-impact (per the standing rule): this changes *how the model learns*, so picks will shift gradually as it retrains on better labels — in the direction of accuracy, not a sudden jump. Fully reversible.** Honest caveat unchanged: 15-min direction is near-random, so cleaner labels sharpen the edges; they don't manufacture an edge that isn't there.
- **24/7 fallback so the tracker keeps logging even when Kalshi is unreachable — the real root-cause fix for skipped rounds.** The cron could only lock a pick on *fresh* Kalshi odds, and Kalshi rate-limits the server's IP (mostly while the app is closed), so app-closed stretches went unlogged. Now, when Kalshi can't be reached, the tracker **self-anchors** a round from the clock + the live Coinbase price — strike = the price at the round's open, close = the next 15-min boundary — and picks from momentum + order book + the learned model (no crowd signal). Grading is already Coinbase-based, so these settle normally. **Pick-impact (called out per the standing rule): purely *additive* — a normal Kalshi-reachable pick is byte-for-byte unchanged; the fallback only fires when the tracker would otherwise make no pick at all.** Self-anchored rounds carry no Kalshi ticker, so they never count toward the confirmed-vs-Kalshi hit-rate, and the app flags them **· self-tracked** so they're never mistaken for a Kalshi-graded round.
- **Reliability fix: stopped the 24/7 tracker skipping rounds after the Kalshi-grading change.** That change bumped per-cron Kalshi reconciliation to ~12 rounds/coin; on the free tier that overran the worker's per-run **subrequest budget** *and* crowded out the essential crowd-odds fetch on Kalshi's **rate limit** — so some cron runs failed to save and rounds went unlogged. Cut it back to **~4/coin** (still converges every round to Kalshi over a few crons). **Log-only — the picks, commitment, and confidence are untouched.** Heads-up: a deeper, *pre-existing* cause remains — the cron can only lock a pick on **fresh** Kalshi data, and Kalshi rate-limits the server's IP when the app is closed, so long app-closed stretches can still skip rounds. Fixing that for real (a Kalshi-independent fallback so the tracker logs even when the app's shut) is a separate change.
- **Two accuracy upgrades: grading now locks to Kalshi for *every* round, and the probability is calibrated + scored.** Aimed squarely at making the number *true*. **(1) Grading locks to Kalshi.** The reconcile step upgrades un-confirmed rounds toward Kalshi each cron (a few per coin, so any backlog clears over a few crons), and a new **confirmed hit-rate** counts *only* rounds Kalshi has actually settled — so the headline isn't a provisional Coinbase-close grade, it's exactly what Robinhood paid. **(2) Calibration + scoring (measurement-only for now).** A regularized **Platt calibration** (fit on the model's *raw* P(OVER) → realized outcome, so it can't feed back on itself) learns how to make a stated "70%" actually land ~70%. **It does not touch the picks** — by deliberate choice (`CALIBRATE_PICKS = false`) the live pick and the shown % still use the raw, proven model; calibration is *measured* only. A new **Calibration & accuracy** panel reports the **Brier score** (0.25 = a coin-flip, lower is better), a plain-language reliability read (*"when it says ~65% OVER, it goes over 71%"*), and the confirmed-vs-Kalshi hit-rate. We'll wire the correction into the actual picks **only once the Brier score proves it would help** — measure first, apply later. The honest framing stands: 15-min direction is near-random, so the win isn't a magic predictor — it's an **honestly-measured** probability that bets selectively and grades exactly like Robinhood.
- **Fixed the 24/7 tracker going silent while the app was closed (no rounds logged for hours).** Two causes, both fixed. (1) The integrity rule was *too* strict: it only locked a pick on a market with **12–16 min** left, but **free-tier crons fire late** — by the time the cron ran, a genuinely fresh round often showed only ~7–10 min left, so it matched *nothing* and logged *nothing*. The floor is now **6 min**, and integrity is enforced directly instead of by timing — it refuses any market whose odds are already pinned (**≤3% / ≥97%** = decided), so it still can't fake a ~100% hit-rate, but it stops dropping real rounds. (2) The cron leaned on the app to keep the Kalshi cache warm; with the app closed it saw only stale data. It now **retries the Kalshi fetch (a few attempts) and persists each success itself**, so it stays warm and logs around the clock. (If a round is genuinely unreachable it still honestly skips rather than inventing a pick.)
- **Style guide (Figma): added the indicator + desktop-chart UI assets.** The shared Figma **style-guide** frame now reproduces the live app's **indicator components** — the BULL / BEAR / NEU / INFO signal chips and the full indicator panel (RSI, MACD, Stochastic, Momentum, order book, EMA-trend rows) at **desktop (620)** and **mobile (358)** widths — plus the **RSI / MACD / Stochastic sub-panes** in both sizes, and the **desktop price chart** (the price line crossing the dashed *beat* line, with green/red H/L labels). All built natively in **Space Mono** with the app's exact iOS-dark tokens, matching the frame's existing CHART COMPONENTS / color / type sections.
- **Fixed the Auto Pick card "glitching" at the round rollover — NEXT ROUND no longer wakes up at round open.** Right at the 15-min boundary the card re-rendered using the *previous* tick's countdown (still reading ~0s, i.e. inside the final-2-min bet window), so it wrongly fired the next-round lock **~3 seconds into the fresh round** — the NEXT ROUND column lit up with a "locked HH:MM:SS" pick at round open (and it burned a spurious AI read every rollover). The rollover now refreshes the countdown *before* re-rendering, so NEXT ROUND stays dormant ("locks in m:ss") until this round's own final 2 minutes. Worth knowing while reading this: the big **Auto Pick card is the live Co-Pilot** (it recomputes every refresh and is *not* logged); the **Track Record** panel below it is the *separate, server-side* pick that's the only thing graded, logged and learned from — so the card flipping around the boundary never touches your record.
- **Fixed the 📖 Guide button (it 404'd) and made "Clear" spell out that your learning is kept.** The Pages build only copied `eth-tracker.html` into the published site, so `guide.html` — though it's in the repo — was never deployed and the Guide link hit GitHub's 404. The deploy workflow now copies `guide.html` too. Separately, the **Clear log / Clear all** confirmations now state plainly that the **learned model is KEPT and keeps growing** — clearing resets only the scoreboard (recorded rounds, arrows, hit-rate), never what the model has learned — and the per-coin dialog shows the live *"≈N rounds learned and counting"* so it's unmistakable.
- **Track-Record integrity fix: the tracker now locks ONE pick per round at its OPEN, so the hit-rate is honest.** The ~100% it was showing was an artifact, not skill. On the 15-min boundary the worker grabbed the **soonest-closing** Kalshi market to pick — but at that instant that's the round *about to close*, already decided (price pinned near 0/100). It then **overwrote its pending pick every cron**, so the tracked side could quietly drift to the near-certain outcome right before grading — and "grading" a pick made on an already-settled round is free. The worker now selects only a **freshly-opened** market (≈12–16 min left, never the about-to-close one), locks **exactly one** pick for that round, and **refuses to touch it** until the round closes (a `!rec.pending` same-round guard) — then grades that genuinely-uncertain call at the close. The in-flight "Now" pick is shown but, as before, only *closed* rounds count toward Bets/Hit-Rate. Net effect: the headline rate drops to a real number (and coverage too, since fresh rounds with no posted quotes are honestly skipped). **Hit "Clear all" to wipe the old inflated rows and start the record clean.**
- **"Prime entry" is now a VALUE entry — buy the big-multiplier underdog, not the 1.0× sure thing.** Buying the side that's already 99% locked pays ~1.0× (no profit). So the cue now fires for the *opposite*: when price is on one side but **momentum is carrying it toward the line**, and the side it's heading to is still the **big-multiplier underdog** — buy that longshot just before it crosses (`primeCheck` projects the per-minute move against the gap to the line, and requires a ≥2.5× implied payout). It's higher-variance by design, so the record now reports the real **return** — *"~1.30× back per $1"* (win-rate × average payout), which can beat 1.0× even at a low win-rate. Below 1.0× means the longshots aren't paying.
- **The learned model keeps getting smarter: it now learns from settlement *magnitude*, and tells you the recent *regime*.** Added an 11th feature — **`lastMargin`**, how far the *last* round settled past its line (signed %): the model already knew the last round's *direction*, now it also knows the *size* of the over-shoot, so it can learn whether big over-shoots continue or snap back. The "What the model has learned" panel now also surfaces the **regime** (trending vs choppy/mean-reverting, from round-to-round transition rates), the current **streak**, and how decisively rounds have been settling — so you can see more of what it's figured out. (It already trains on *every* round, bet or skip, and reads RSI/MACD.)

- **Honest coverage + "if it bet every round" hit-rate, visible SKIP rounds, and high-confidence alerts.** The 100% the tracker showed was real but misleading — it only counts rounds it *commits* to and silently drops every SKIP. Now the worker **shadow-grades every round** (records the side it leaned even when it sat out) and **recomputes all stats from history** (no counter drift). The Track Record shows **coverage** — *"10 bets · 37 skipped · 21% bet rate · if it bet every round: 53%"* — and **SKIP rounds now appear in Recent Rounds** as sat-out rows with their shadow result (`leaned OVER ✓`), so a skip is unmistakable (the "Which to follow" line also calls it out: *"the tracker is SKIPPING — it won't count it"*). The learned model now trains on **every** round, not just bets. And there are **alerts for high-confidence, non-SKIP picks**: a Worker **ntfy.sh push** (`NTFY_TOPIC`) for your phone even when the app is closed, plus an in-app Notification toggle for when a tab is open. Both fire only when a coin is bet-worthy *and* several reads agree (≥75%, ≥3 reads).
- **The AI Co-Pilot now defaults to free Gemini, and the app's dropdown picks the provider.** Choosing a model in *AI Co-Pilot setup* now switches the **provider** too — pick *Gemini 2.0 Flash* and it uses Gemini, a Claude model and it uses Claude (as long as that key is in the Worker), no dashboard trip. The default model is now **Gemini 2.0 Flash (free)** instead of Claude Haiku, so a fresh setup costs nothing once `GEMINI_API_KEY` is added. The Worker's `resolveProvider` precedence is: a dashboard `AI_PROVIDER` hard-override → the provider implied by the app's chosen model (when that key exists) → key-order auto-pick; a model id that doesn't match the active provider is ignored (so a stale choice can't 404 the read), and the read panel labels itself **AI · Gemini / Claude / Groq** from the provider the Worker actually used.
- **Hit-rate can no longer disagree with the Recent Rounds shown.** A real bug: the Track Record's Correct / Hit-Rate came straight from the worker's counters while the Recent Rounds rows were re-graded on the client, so the headline could read **100%** while every visible row showed a loss. Now the rows and the headline stats are reconciled **together** from the same outcomes, with a clear priority — a **Kalshi-confirmed** row (the definitive result) is trusted as-is; an as-yet provisional worker row is corrected by the client's own grade (the same source the arrows use), and the aggregate "correct" count moves by that same delta. Accurate history in, accurate history out — for you *and* the AI.
- **Desktop polish: softer/dynamic glows, fitted arrows, constrained footer, urgent timer, readable chart labels.** The card glow was bleeding past the glass into a hard-edged disc — now it's **contained inside the rounded card**, faded to transparent before the edge (5-stop falloff + smaller blur) so there's **no hard edge at any width**, with a slow **breathing** pulse. The **Recent-15-min arrows** now fit the card width (no overflow/overlap on the narrow desktop column); the **best-bet ticker + "All coins ranked" list** are constrained to the centered content width instead of spanning the whole screen; the **timer bar** ramps urgency in the final 30s/10s (faster pulse, throbbing digits); the chart's **H/L price labels** match the "beat" label size; and the model's read is relabelled **"Model-only lean"** (one input the Auto pick blends with the market) so it stops reading as a contradiction of the headline %.
- **Two research-backed edges baked into the model: the favorite-longshot bias and panic-fade.** After surveying what actually works on 15-min crypto prediction markets (the Kalshi favorite-longshot studies — CEPR/Whelan on 300k+ contracts; Turbine's 1,000-strategy Kalshi-BTC-15m backtest; Wen/Bouri/Xu/Zhao on intraday crypto momentum-vs-reversal), two robust, simple edges are now wired into both the live blend and the 24/7 worker: **(1) Favorite-longshot bias** — favorites (>50%) are systematically *under*-priced, so `favLongshotAdj` nudges the market's implied probability a touch further toward the favorite (gentle, capped at 5 pts, only for a clear favorite). **(2) Panic-fade** — moderate drift *continues* (ride it), but a genuinely **extreme** spike/dump (≈2σ over the lookback) is an over-reaction that snaps back, so `panicFadeOver` leans *against* the violent move (and replaces plain momentum in the blend when it fires). The AI prompt now states all three findings explicitly — *bet under-priced favorites, ride the drift don't fade it, fade only the violent over-reaction.* Kept deliberately simple (the same backtests found complexity doesn't pay).
- **"Best bet now" ticker across all coins — an expandable sticky footer that ranks every coin.** The 24/7 worker ranks all coins' current-round picks by a **confidence score = how lopsided the pick is (edge) × how much independent confluence backs it (`conf`) × the coin's *shrunk* historical reliability** (a real track record is trusted more, but only once it has the samples to mean something; SKIP picks are excluded). A compact `?best` endpoint (`rankBest`) serves the leaderboard; the app shows the winner in a **sticky footer ticker** — "Best now: SOL OVER ↑ · 72% · 3 reads agree · then BTC↑ DOGE↓" — colored to the side. **Tap it to expand the full ranking** (every coin with its side, odds, reads-agreeing, confluence and hit-rate) and **tap any row to jump to that coin**. Refreshes each round.
- **Recent-15-min arrows are now stable, *Kalshi-accurate*, and always ~8 in a row.** The flip-flop is fixed: arrows were swapping a candle *estimate* (green/red candle) for the real vs-line grade a beat later. Now there's a **persistent, authority-ranked per-coin ledger** (`moveLog`, saved to localStorage): each round freezes to its grade, and the *only* thing that can ever change an arrow is **Kalshi's own confirmed result** — the definitive outcome Robinhood settles on — overriding a provisional candle grade; two provisional reads can never flicker against each other. So as the 24/7 tracker reconciles each round to Kalshi, the arrows **converge to exactly what Robinhood shows** (hover shows "confirmed vs Kalshi" vs "graded vs the line"). A dim *dashed* candle estimate fills only the **oldest empty slots** (never recent rounds), so the row always shows **8 in one line** (▾ for more). The ledger accumulates across reloads — the local history the app keeps learning from — and **Clear log** wipes it too.
- **"This round | Next round" at-a-glance header on the Auto Pick card.** A clean two-column block: **left = THIS ROUND** with your committed side (live), a vertical divider, **right = NEXT ROUND** which **wakes up in the final 2 minutes** (when the next market opens and the pick locks) and shows a calm "locks in m:ss" until then. Each side is color-coded (green OVER / red UNDER) with a one-line confidence read, so the old "this says OVER but that says UNDER" confusion reads correctly: *bet OVER on the round you're in, get ready for UNDER on the one about to start.*
- **Stochastic added server-side — as AI/panel context, deliberately *not* a model feature.** The worker now computes the **Stochastic oscillator (%K/%D, 14,3)** from 1-min candles and feeds it to the AI prompt and the pick signals (flagged overbought >80 / oversold <20). It's kept *out* of the learned model on purpose: it's strongly correlated with RSI and the round-shape feature, and a scarce-data model overfits when you stuff it with redundant inputs — so the AI gets the extra read without diluting the model. (Completes the "reference all the indicators" ask: RSI, MACD and Stochastic now all reach the AI.)
- **The committed pick is now confluence-gated — it only commits firmly when independent reads agree.** Step three: instead of committing on any blend past a fixed ±0.08, `freePick` now measures **confluence** (how much of the signal-weight — crowd, momentum, order book, learned model — leans the *same* way) and **widens the SKIP band as the reads conflict** (±0.08 when aligned → ±0.18 when split). So a barely-lopsided pick built on disagreeing signals now **SKIPs instead of guessing**, which is the proven way to lift the *hit-rate on the bets it does place*. Each pick now carries `agree` (how many reads concur) and `conf` (share of weight behind the side), surfaced to the AI prompt ("3 of its reads agree"). The app's own Auto Pick card is unaffected (it always shows a side); this sharpens the 24/7 record and the AI's reality-check.
- **The AI Co-Pilot now reads the new data after each round — margins, technicals and streaks.** The prompt now shows, for every recent 24/7 round, *how far it settled past the line* (e.g. `OVER by +0.12%`); the per-coin model's **current RSI(14) + MACD-histogram** at the open (flagged overbought/oversold, bullish/bearish); the **recent OVER/UNDER streak** ("3 OVER rounds in a row" — the arrow pattern, with a note that a run can be a trend *or* a reversal due); and **how decisively** recent rounds have been settling (razor-thin vs ±x%, with a *fragile, lower conviction* flag when most land within a hair of the line). The learned-model read also calls out any **RSI/MACD tendencies** it has picked up. So the AI reasons about the same arrows, indicators and margins you see — not just win/lose. *(Next: server-side Stochastic, and committed-pick confidence that scales with confluence + how decisively recent rounds resolved.)*
- **The 24/7 model now learns from RSI + MACD, and every round records how far it settled past the line.** Step one of a bigger push to make the committed next-round pick more proven: the server now computes **RSI(14)** and the **MACD(12,26,9) histogram** from 1-min closes and feeds them to the per-coin learned model as two new features (alongside order-flow, momentum, vol-regime, crowd, last-direction, time-of-day and round-shape). Grading also captures each round's **settlement margin** — how far past the line it closed, in **$ and %** (`over` / `overPct`, plus `rec.lastMargin`) — so the model and the AI can tell a razor-thin round from a blowout. Saved models migrate automatically (new weights start at 0).
- **Recent Rounds list now matches the arrows.** Each row's OVER/UNDER outcome is reconciled against the client's own accurate grading (the same source the arrows trust, matched by 15-min bucket), so the list can't disagree with the arrow strip; the worker's verdict is the fallback only for rounds the app never saw.
- **Beat-line hierarchy, softer gradient, tidier arrow strip.** The hero "Beat $X · … · OVER/UNDER" line now turns **bright green when price is over the line / red when under** (so it reads at a glance instead of getting lost); the ambient background glow uses softer multi-stop falloff + more blur (**no hard edges, all widths**); and the **Recent 15-min arrows** stay on **one row** with a **▾ dropdown** to reveal more history.
- **Zoom + pan on the charts and indicators (Coinbase-style).** On a timeframe chart (1m+): **scroll-wheel or pinch to zoom**, **drag (mouse) / one-finger drag (touch) to pan**, **double-click/double-tap to reset**. Zooming the recent end keeps the **most recent price centered** with empty room to the right (not jammed against the edge), and the **Y-axis rescales to the visible candles** so zoomed price action fills the pane. The indicator sub-panes and EMA/Bollinger overlays follow in lockstep (they share the chart's x-positions via `state.vp` → `chartPts`). On touch a **long-press** still summons the crosshair and a **vertical drag still scrolls the page**; on desktop, hover still scrubs. The live tick view is unchanged (it's a single in-progress round).
- **The Auto Pick commits to a side at the start of the round and holds it.** It picks OVER or UNDER right away (the locked next-round pick, or the open lean) and **sticks with it the whole round even if price crosses the line** — flipping only when it becomes near-certain the other way (≥ 80% / ≤ 20%). When the committed side is temporarily behind, the card reads **"HOLDING …"** (instead of a confusing sub-50%). So it no longer changes every time the sides switch (`thisRoundCommitted`). The small "Live:" line still shows the moment-to-moment read.
- **Hardened the 24/7 grader so it can't stall.** The Kalshi-result lookup had been on the critical path and the reconcile ran *before* the next pick — so a slow/blocked/rate-limited Kalshi could stop a coin from picking, which in turn stops grading. Now every round grades immediately on the candle close (no Kalshi call), and the Kalshi upgrade runs **last and wrapped** (≤1 call/coin/cron), so grading and picking keep flowing no matter what Kalshi does.
- **Chart polish + three more indicators (all widths).** The **High-conviction** toggle is now **green** when on (was blue); the on-chart **"beat $X"** line is **bold and larger** so it stands out; and **RSI/MACD fold the live price** into the forming candle so they track each tick. Added **Stochastic** (14,3) as a sub-pane and **EMA 9/21** + **Bollinger Bands** (20,2) as price overlays — toggles sit in the Indicators row.
- **Grading now reads Kalshi's *own* settled result — the definitive outcome.** Each round settles on Kalshi's resolved market (`result: yes` → OVER, `no` → UNDER) — exactly what you bet on, so the log can't disagree with Robinhood even on razor-thin rounds. Until Kalshi resolves (a beat after the close) the round is graded provisionally on the boundary candle close, then **reconciled** to Kalshi's verdict on a later cron (flipping the entry + hit-rate if it differed). Costs nothing — it reuses the Kalshi API the worker already calls.
- **RSI + MACD indicator sub-panes on the chart.** A new **Indicators** row toggles **RSI** (14) and/or **MACD** (12,26,9); each renders as a stacked mini-pane right below the price chart, drawn from the *same* `chartPts` x-positions so it lines up exactly, with the scrub crosshair carried through. Best on a 1m+ timeframe (they need enough candles; the live tick view shows a "need more candles" hint).
- **Settlement now grades on the boundary candle close, not the 60-sec average — fixing rounds logged on the wrong side.** A round that dipped then recovered right at the bell was settling on a starved/averaged price (the 60-sec window freezes when you flip to Robinhood to bet, biasing it to the dip), so it logged the wrong outcome and marked a wrong guess "correct." Both the 24/7 worker (`cbCloseAt` → `cbAvg60`) and the client now settle on the **finalized candle close** — the definitive boundary price, fetched fresh over REST, matching Robinhood's close and next-round strike. The 60-sec average is a fallback and shows as a "thin round" note when it leaned the other way. *(Already-graded rounds stay until they age out — use Clear log to rebuild clean.)*
- **Smoother chart scrubbing, a taller mobile chart, and a Candles toggle that works instantly.** The crosshair now **interpolates** between samples, so the price and time glide continuously as you drag instead of snapping to a fixed point (candles still snap to a bar). The mobile chart is **~20% taller** (220→264px). And tapping **Candles** on the Live view now hops to 1m candles — the live track has no OHLC, so the toggle used to look inert there.
- **Recent-15-min arrows now track the log (and reset with it); current vs. next round is unmistakable.** The arrows and the Recent Rounds log are graded from the **same source**, so they can't disagree on screen, and **Clear log** now blanks both together (a per-coin clear timestamp gates the arrows + server history to post-clear rounds). The Auto Pick card tags the live round **● LIVE** and the timer's next-round lean as a muted **PREVIEW** ("a heads-up on the round *after* this one") — so a "BUY OVER" now and a "leaning UNDER" next stop reading as a contradiction.
- **"Prime entry" cue + late-entry tracking.** Late in a round, when the position model says the
  outcome is nearly locked (≥ 86% with time left to act), a pulsing **⚡ PRIME ENTRY — BUY
  OVER/UNDER** cue lights up under the timer — surfacing the single highest-probability moment to
  bet *this* round (a decisive position with little time left). Every cue is logged and graded
  against the same settlement into a separate **Prime-entry record** (won/total · hit-rate),
  so you can see with real data whether betting late actually beats betting at the open. On desktop
  the side columns are now vertically centred against the chart.
- **Accurate settlement + a Clear-log button.** The 24/7 grader now settles each round on the
  **~60-second average** of trades over the final minute — the way Kalshi/CF Benchmarks actually
  settle — instead of a single closing tick, so the log and the **Recent 15-min** arrows stop
  disagreeing with Coinbase on razor-thin rounds (the client grades the same way, off its live
  60-sec average; the candle close stays as the displayed "closed at $X"). A new **Clear log**
  button in the Track Record header wipes the current coin's rounds, arrows and hit-rate — locally
  **and** on the 24/7 tracker — for a clean restart after an engine change (the learned model is kept).
- **Stays inside Cloudflare's free tier + a layer of motion polish.** The 24/7 Worker now saves the
  entire auto-tracker (every coin + the pooled learning model) as **one** KV record per cron run
  instead of ~7, and the 15-min cron no longer re-writes the crowd-odds cache (the app keeps that
  warm only while it's open) — cutting background KV writes ~7× so a full day stays well under
  Cloudflare's free **1,000 writes/day**. Alongside it: the **High-conviction toggle** moved to the
  left of the Auto Pick header, the live pick colour now **eases** between green/red/amber instead of
  snapping, every control gives a **tactile press**, and the timer bar gained a sweeping sheen that
  **pulses** through the final two minutes.
- **Accurate round settlement + a "which to follow" verdict.** Rounds are now graded against
  the **definitive close** — the finalized Coinbase 15-minute candle for that round, not a
  possibly-stale live tick — so the logged direction matches what you see on Coinbase even if
  the tab was backgrounded. The moment the timer turns over, a **real-time "last round closed
  $X · OVER/UNDER the line $Y · pick ✓/✗"** readout appears. To end the Auto-Pick-vs-Auto-Tracker
  confusion, a single **"Which to follow"** line reconciles them (agree → higher conviction;
  split → coin-flip, sit out), the auto-tracker's learned model now feeds the Co-Pilot blend
  directly, and the help notes the settlement nuance (Kalshi settles on a 60-sec **CF Benchmarks
  index** average, so razor-thin rounds can differ from a single Coinbase price). A **"Recent
  15-min" arrow strip** in the header mirrors the up/down dots Coinbase shows, straight from the
  same Coinbase candles, so the market's recent direction is glanceable in-app.
- **Per-round high/low ("the graph") as a signal.** The intra-round price path's **high and
  low** are now drawn on the live chart (dotted guides + labels) and read everywhere: where
  price sits in that range gives a gentle continuation tilt in the blended probability, the
  high/low (and how far each pushed past the line) are handed to **Claude** so it can weigh
  momentum vs. failed tests, and the per-coin **learned model** gains a "where did last round
  close in its range" feature (existing models migrate forward automatically).
- **Smoother scrolling + next-round indicator.** Fixed a mobile scroll snag (the page no longer
  springs back when a control re-renders; ambient glow pauses while you scroll). The timer card
  now shows the **next round's** lean, firming to a locked pick in the final 2 min, and the AI
  rationale is tucked into a tidy **"AI summary"** dropdown.
- **24/7 auto-tracker (free, in-app).** A scheduled Cloudflare Worker (cron, every 15 min)
  makes a market-anchored pick from **free data only** — Kalshi price + 1-min momentum +
  order book, **no LLM** — and grades the previous round, building an always-on per-coin
  record even when no tab is open. Shown in a new **24/7 Auto-Tracker** panel, and the AI
  reads this record too. Read it directly at `…/?picks=ETH`. **All coins are tracked**: ETH/BTC/SOL
  grade against Kalshi's settled result; DOGE/SHIB/XRP have no Kalshi market, so they're
  **self-graded** on the Coinbase close vs the round's open (flagged "· self-tracked").
- **AI cost controls.** Default model switched from Opus → **Claude Haiku 4.5** (~20× cheaper).
  The free **Kalshi crowd** is decoupled from the paid AI call; the paid read now runs **at
  most once per round** (the 2-min lock), **never while the tab is hidden**, and an **"AI
  spend"** setting (Smart / Every round / Manual) only pays when the call is close or
  contrarian to the market.
- **Position (barrier) model.** The probability now uses the real physics of an OVER/UNDER —
  `P(over) = Φ( ln(price/line) / (σ·√time-left) )` — distance to the line vs time vs realized
  volatility, from **1-minute** candles. Mid-round it reads near-certainty instead of guessing
  from indicator votes.
- **Market-anchored, calibrated probability.** The blend leans on the Kalshi market (the
  efficient prior) + the position model + the AI's **numeric** probability, then **calibrates**
  to your realized results. Fixed a real bug where the final-2-min pick was priced off *this*
  round's nearly-settled market instead of the **next** round's.
- **Order-book imbalance** added as a live indicator + AI input + gentle blend tilt.
- **Zoomable chart** with timeframe buttons: Live · 1m · 5m · 10m · 15m · 30m · 1h · 1d.
- **Recommendation-driven aurora glow** — a slow-drifting green background that crossfades to
  red when the pick is UNDER; near-black canvas otherwise.
- **Brand coin icons** as crisp inline SVG; **12-hour clock** (AM/PM) throughout; **mobile
  dropdown** coin selector; the old top "bet window" banner replaced by a prominent
  **next-round ribbon** inside the Auto Pick card.
- **Rewritten backend prompt** (see [AI Co-Pilot](#ai-co-pilot-cloudflare-worker)).

---

## Table of contents
- [What it does](#what-it-does)
- [Goals & design principles](#goals--design-principles)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [The 15-minute round model](#the-15-minute-round-model)
- [The probability engine](#the-probability-engine)
- [Indicator engine](#indicator-engine)
- [The Auto Pick card — "what & when to buy"](#the-auto-pick-card--what--when-to-buy)
- [Accuracy tracker & calibration](#accuracy-tracker--calibration)
- [24/7 Auto-Tracker (cron)](#247-auto-tracker-cron)
- [AI Co-Pilot (Cloudflare Worker)](#ai-co-pilot-cloudflare-worker)
- [Next-round ribbon & conviction](#next-round-ribbon--conviction)
- [Crowd odds (Kalshi)](#crowd-odds-kalshi)
- [Design system](#design-system)
- [Design files (Figma)](#design-files-figma)
- [Data persistence](#data-persistence)
- [Deployment](#deployment)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Crucial code map](#crucial-code-map)
- [Disclaimer](#disclaimer)

---

## What it does

Every 15 minutes the market resets: at the round open, the live price becomes the
**"price to beat" (strike)**. The bet is binary — will the price **close ABOVE**
(OVER ↑) or **BELOW** (UNDER ↓) that level when the round ends?

The app:
1. Streams the **real-time price** over a WebSocket.
2. Pulls candles at multiple granularities, computes a panel of **technical indicators**
   and the **order-book imbalance**, and measures **realized volatility + momentum** from
   1-minute data.
3. Combines those — anchored on the **Kalshi market price** and a **position model** — into a
   single **Auto Pick** card that tells you plainly **BUY OVER ↑** or **BUY UNDER ↓**, with a
   blended **likelihood %**, a zoomable mini chart of price vs the line to beat, and the
   live crowd + AI read. The pick is **locked per round** so it doesn't flicker.
4. **Records and grades** every pick automatically and **calibrates** its probabilities to
   your realized results.
5. Runs a **24/7 server-side auto-tracker** that keeps an independent per-coin record from
   free data, even while the app is closed.
6. Asks an **AI Co-Pilot** to weigh the math + your track record + the auto-tracker + the
   Kalshi crowd and issue a calibrated probability with a plain-English reason.
7. In the final ~40 seconds, the pick card surfaces a prominent **next-round ribbon** with
   the locked pick — with **conviction tiers** when the signals align.

---

## Goals & design principles

- **Decision-first.** The screen answers one question — *OVER or UNDER for the next
  round?* — and everything else supports that.
- **Anchored on the market, honest about edge.** A 15-minute market is near-efficient; the
  app treats the live Kalshi price as the best prior and only deviates with real, supported
  signal. Most rounds deserve a **SKIP**.
- **Calibrated, not confident.** It grades its own picks and pulls its probabilities toward
  what actually happened. Accuracy beats a confident-looking number that's wrong.
- **Cheap by default.** Free data does the heavy lifting; the paid AI is opt-in, gated, and
  runs at most once per round while you're watching.
- **Stable, not jumpy.** The headline pick locks per round; only the "live lean" moves.
- **No backend to run.** Static app + one optional serverless Worker. Keys never touch the
  browser.
- **Apple/iOS feel.** Near-black dark UI, system fonts, large legible numerals, a slow
  ambient glow, responsive from phone to ultrawide.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| **App** | Single-file **vanilla HTML/CSS/JS** (`eth-tracker.html`) | Zero build, loads instantly, trivially hostable on Pages |
| **Fonts** | Space Mono + system stack | Apple-like typography with no asset pipeline |
| **Live price** | **Coinbase Exchange WebSocket** (`wss://ws-feed.exchange.coinbase.com`, ticker) | Real-time, free, no key |
| **Candles** | **Coinbase Exchange REST** (`/candles?granularity=…` 60/300/900/3600/86400) → **CoinGecko** fallback | OHLCV for indicators, volatility, momentum, and the zoomable chart |
| **Order book** | **Coinbase Exchange REST** (`/book?level=2`) | Bid/ask imbalance near the touch |
| **Crowd odds** | **Kalshi public API** via the Worker | The actual market the bet tracks (current + next round) |
| **AI** | **Cloudflare Worker** proxy → Anthropic **Claude** / Google **Gemini** / **Groq** | Key stays server-side; provider + model switchable; **Haiku** default |
| **Auto-tracker** | **Cloudflare Worker cron** + **KV** | 24/7 per-coin record from free data, no LLM |
| **Hosting** | **GitHub Pages** (app) + **Cloudflare Workers** (proxy + cron) | Both free, both Git-deployed |
| **Storage** | Browser **localStorage** + Worker **KV** | Track record + settings per device; crowd cache + auto-tracker server-side |

No frameworks, no bundler, no npm install for the app itself.

---

## Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │  Browser — eth-tracker.html (GitHub Pages)   │
  Coinbase WS ──▶│  live price ─┐                               │
  Coinbase REST ─▶│  candles ───┤                               │
                 │  1m micro ───┼─▶ probability engine ─▶ Auto  │
  Coinbase book ─▶│  order book │   (position model +     Pick  │
                 │             │    market + AI + calib.)  │     │
                 │  accuracy + calibration (localStorage) ─┘     │
                 └───────┬───────────────────────┬───────────────┘
                  GET ?picks │            POST {price, strike,    │ HTTPS
                  (free)     │              market, indicators,   │
                             │              history, secondsLeft, │
                             ▼              noAI?}                 ▼
                 ┌─────────────────────────────────────────────┐
                 │  Cloudflare Worker (cloudflare-worker/...)   │
                 │   fetch: Kalshi crowd (cur+next) + LLM read  │
                 │   scheduled (cron /15m): free per-coin pick  │
                 │       + grade → KV  (no LLM, no AI spend)    │
                 │   returns {crowd, ai, provider} / picks      │
                 └───────┬─────────────────┬─────────────────────┘
                         ▼                 ▼              ▼
                  Kalshi API        LLM provider     CROWD_KV (crowd cache + picks)
```

The browser never sees the AI key and can't call Kalshi directly (no CORS) — the Worker
does those two things, plus the cron that keeps a free 24/7 record.

---

## The 15-minute round model

Rounds are aligned to wall-clock quarter hours (`:00`, `:15`, `:30`, `:45`).

- `nextBoundary(now)` rounds **up** to the next quarter hour — that's `currentRoundEnd`.
- At each boundary `tickTimer` **grades** the round that just ended, **opens** a new one
  (capturing the strike + a signal snapshot), re-locks the headline pick, refreshes the
  free crowd, and pulls the fresh auto-tracker record.
- A countdown + progress bar show time remaining (12-hour AM/PM labels); the final ~40
  seconds (`BET_WINDOW = 40s`) is the **bet window** when the locked **next-round** pick
  surfaces as a ribbon.

---

## The probability engine

The headline likelihood is one number — `combinedOdds()` → `P(OVER)` — built from a
**weighted, market-anchored blend** and then **calibrated** to your history:

1. **Position / barrier model** (`barrierOver`) — the physics of an OVER/UNDER:
   `Φ( ln(price/line) / (σ·√(time-left/900)) )`, where σ is per-round volatility from
   **1-minute** candles (`refreshMicro`). Its weight grows as the position becomes decisive;
   it bows out in the final 2 min (the next round opens at the line, so there's no distance
   edge yet).
2. **The market** (`crowdOver` of the scope-correct Kalshi market, ~0.42) — the efficient
   prior; uses the **next** round's market during the bet window. Passed through `favLongshotAdj`
   first: the **favorite-longshot bias** (favorites are systematically under-priced on Kalshi)
   means we nudge the implied probability a touch further toward a clear favorite (capped at 5 pts).
3. **AI** (`aiOver`, **earned weight** via `aiWeight`) — Claude's own **numeric** probability
   (`probOver`). The weight is no longer fixed: it starts at **0.30** and is set by the model's own
   **report card** (each directional call graded against the Kalshi outcome, pooled per model) —
   rising above 0.30 when it beats a coin-flip, falling below when it doesn't, shrunk toward 0.30
   until the sample is meaningful. *"Trust the AI more"* raises the ceiling (0.45 → 0.60).
4. **Indicators** (`indOver`, ~0.22) — the bull/bear tally (correlated, so demoted).
5. **Order-book imbalance** (`obiOver`, ~0.07) and **short-term drift** — *moderate* momentum
   continues (`momOver`, ~0.08), but a genuinely **extreme** spike/dump (≈2σ) is an over-reaction
   that snaps back, so `panicFadeOver` (~0.12) **replaces** plain momentum and leans *against* it.

`calibrate()` then nudges the raw blend toward your realized results: among past rounds whose
model-confidence sat in the same band, how often did that side actually win? (Laplace-smoothed,
weighted by sample size, gated until ≥8 samples.) `normCdf` is an Abramowitz-Stegun approximation.

**What you see vs. what picks the side (as of r38).** The blend above is the **picker** —
`combinedOdds()` chooses the direction and drives the commit/hold logic. But the **% displayed** on
the pick card, the This/Next round chips, and the payout is the **market's own implied probability**
(`marketPct()`, from the live Kalshi price) for the chosen side — the same number your exchange quotes
and the one that sets the payout, so everything on screen agrees with where you actually place the bet
(and it stops twitching, because the market price is stable where the blend jiggled). The blend's own
estimate stays visible only as the **"Live:" lean** and the **+EV edge** on the payout line (app % vs
market %). When the market already prices the chosen side **≥90%**, the card shows *"already nearly
settled"* instead of **BUY**, since a bet there pays ~1.0x (just your stake back).

These two edges are the most robust findings from a survey of what works on 15-min crypto
prediction markets — the favorite-longshot bias (CEPR/Whelan, *Makers and Takers: The Economics of
the Kalshi Prediction Market*, on 300k+ contracts), and momentum-continuation-with-extreme-reversal
(Turbine's 1,000-strategy Kalshi-BTC-15m backtest, where "panic-fade" was profitable on all 150
variants; Wen/Bouri/Xu/Zhao 2022 on intraday crypto momentum vs reversal). The same backtests found
**complexity doesn't pay**, so both are kept small and simple, and the AI prompt states them outright.

---

## Indicator engine

From 15-minute candles (plus the order book), the app computes a panel and turns each into a
bull/bear vote or an info chip:

| Indicator | What it reads |
|---|---|
| **RSI (14)** | Momentum oscillator — overbought/oversold |
| **MACD (12,26,9)** | Trend/momentum histogram |
| **EMA 9 / 21** | Short-term trend direction (cross) |
| **Price vs EMA 21** | Above/below the short trend line |
| **Price vs EMA 50** | Above/below the mid-term trend |
| **Momentum 1h (ROC)** | Rate of change over the last hour |
| **Bollinger %B** | Position within the 20-period bands |
| **Volume** | Current bar vs 20-bar average (context, not a vote) |
| **Order Book** | Live bid/ask size imbalance within ±0.15% of mid (info + small tilt) |

Two layers keep it usable: **`renderRoundCall`** (the locked direction, set once at the
boundary) and **`renderLean`** (a small "live lean" that updates intra-round without
disturbing the locked call).

---

## The Auto Pick card — "what & when to buy"

> **Layout note (r93).** What used to be three cards — the price card, the countdown card and the
> pick card — is now **one card**. Price and clock share its top row; the verdict (`renderHero()`)
> owns the middle; the price-vs-line rail and the cost row sit under it; "Show the numbers behind
> this" holds the evidence. Everything described below still renders from the same functions into the
> same ids — several of the rows are simply no longer *drawn* while the verdict is showing, because
> they restated it. The suppressed set is `#pickStrength`, `#recoScope`, `#buyLine`, `#buyHint`,
> `#dualPick`, `#payout`, `#favZone`, `#offBook`.

> **The verdict is a bet slip (r99).** `renderHero()` now renders the call into `#verdict`, a block
> whose **fill is the instruction**: solid green/red = act on it, outlined = it only *leans*, grey =
> sit this one out. The block keeps the same size and position in every state, so nothing below it
> moves as rounds turn over — only the fill changes. Inside it sit the headline (a light verb plus a
> heavy italic side) and `#heroSlip`, the bet in four terms:
>
> ```
> 78¢ IN · $1.00 OUT · NEED 79.2% · RUNS 83%
> ```
>
> **`NEED` vs `RUNS` is the comparison the whole app exists to make.** `NEED` is the break-even win
> rate — the price plus the fee — and it comes from `betMath()`, so it follows the venue you selected
> (Kalshi and Robinhood demand materially different win rates at the same price). `RUNS` is the
> **measured** hit rate for rounds bought at this price, from the 24/7 graded record via
> `measuredAtPrice()`. If RUNS clears NEED there is an edge and it prints green; if it doesn't, it
> prints red, however good the call itself looks. RUNS only appears once at least **20** graded rounds
> sit in the ±2.5¢ band — under that, the app's own estimate shows instead, labelled `APP`, because a
> hit rate off six rounds is not a hit rate.
>
> On a **SKIP** round the slip prices the crowd's favourite anyway (`CROWD 61¢ · BAND 78–82¢ ·
> NEED 62.4%`) — "what would this have cost me" is exactly the question worth being able to ask on a
> round you were told to pass. That fallback is deliberately **not** applied to a sided round whose own
> price is missing: the favourite could be the opposite side, and quoting it would state the cost of a
> bet you weren't offered.
>
> `slipRow()` is pure display — it reads the price, the venue and the graded history and returns a
> string. It never touches a pick, a lock or a grade.

The headline card (`renderPickCard()`) turns everything into one plain instruction:

- **BUY OVER ↑ / BUY UNDER ↓** in large type, with a plain-language subtitle and a hint.
- **The live market price %** (the Kalshi price for the shown side, via `marketPct()`) — the same
  number your exchange quotes and the one that sets the payout. The **direction stays locked** for the
  round; the blend that *picked* it shows up only as the "Live:" lean and the payout's +EV edge. When a
  side is already near-certain (≥ `DEAD_MONEY_PCT`, 90%) the card shows **"already nearly settled"**
  instead of BUY (it pays ~1.0x). If a coin has **no live Kalshi crowd**, the % falls back to the blended
  estimate, labelled **"est ·"** rather than "market ·".
- **Phase-aware scope + next-round pick.** Most of the round it reads *"● LIVE · THIS round ·
  closes h:mm AM/PM"*. In the final **2 minutes** a **NEXT-round** pick locks in — *"◷ NEXT round
  h:mm–h:mm · locked …"* — buy it when the round opens. **SKIP** when there's no clear edge.
- **Zoomable mini chart** (`drawMiniChart` → `drawLiveChart` / `drawTFChart`) — the live price
  racing the strike (green above / red below, dashed strike line), with timeframe buttons
  (Live · 1m · 5m · 10m · 15m · 30m · 1h · 1d) that pull historical closes against the same
  line to beat.
- **"The read"** — the crowd + AI rows that feed the blend, plus the plain-English "why".

---

## Accuracy tracker & calibration

Every locked pick is stored with its strike, direction, round time, and a **signal snapshot**
(indicator net, model probability, order-book imbalance, AI verdict, crowd, conviction). When
the round ends, `gradeRound()` compares the close to the strike — scoring the pick you actually
**committed** (the locked one) — and records the outcome. `historySummary()` derives, over the
retained window (~7 days):

- overall **hit rate**, current **streak**, separate **OVER** / **UNDER** hit-rates;
- a **confidence-calibration** table (when it claimed N% likely, that side truly won X%);
- **conditional hit-rates** (when indicators strongly agreed; when the order book agreed);
- the recent rounds with the signals behind each.

This summary is sent to the AI on every read, and `calibrate()` uses it locally so the live
probability reflects *your* results. The **Pick Accuracy** panel shows Rounds / Correct /
Streak / Hit Rate inline, and notes when the odds are calibrated.

---

## 24/7 Auto-Tracker (cron)

A **scheduled** Worker (`crons = ["*/15 * * * *"]`) keeps an independent, always-on record —
even when no tab is open — using **only free data and no LLM**, so it adds nothing to AI spend.
Each run, per coin with a Kalshi series:

1. Grades the previous round's pick on the **~60-second Coinbase trade average at the boundary**
   (`cbAvg60`, matching how Kalshi's CF-Benchmarks index settles; the finalized boundary candle
   `cbCloseAt` is the fallback) — fast and Kalshi-free so grading can never stall — then **reconciles**
   it to Kalshi's own settled result (`result: yes/no` → OVER/UNDER, literally what you bet on), kept
   off the critical path (`reconcileKalshi`). It upgrades a few un-confirmed rounds per cron (**capped
   at ~8/coin** — kept moderate to stay polite to Kalshi's per-IP rate limit); a backlog still clears
   over a few crons and every round converges to Kalshi. A separate **confirmed hit-rate** counts *only* Kalshi-settled
   rounds — the definitive number, exactly what Robinhood paid.
   **"Too close to call" (r89).** When the proxy settles within **`VOID_MARGIN_PCT` (default 0.02%)** of the
   line, the round is recorded **void** (`void: true`, `actual: null`, the provisional side kept as
   `provisional`) rather than graded. This isn't caution for its own sake — measured against the 7,378
   rounds Kalshi later confirmed, the proxy called the wrong side **38.8%** of the time inside ±0.01% and
   **24.7%** from 0.01–0.02%, versus **0.3%** beyond 0.10%. That ±0.02% sliver is ~11% of rounds but
   **60% of every grading error we make**; voiding it takes the proxy's error rate from **5.8% → 2.6%**.
   A void round is skipped by every tally (it is *not* scored as a loss) and by `learnFromRound`, so the
   model never trains on a label that's wrong a quarter of the time. If the round has a Kalshi ticker,
   `reconcileKalshi` clears the void and grades it definitively later. Set `VOID_MARGIN_PCT=0` to disable.
2. Locks **one** pick per round and **won't overwrite it** once made (a `!rec.pending` same-round
   guard) — so the tracked side can't drift to the near-certain outcome before grading. It only
   locks on a round that's **still undecided**: ≥ **6 minutes** of time left **and** odds that
   aren't pinned (**3–97%**) — a market sitting at 0/100 is already settled, and "grading" a pick
   made on it would be free. (The 6-min floor — rather than insisting on a brand-new ~15-min market —
   is deliberate: free-tier crons fire **late**, often several minutes past the boundary, so a
   genuinely fresh round may already show only ~7–10 min left; 6 still guarantees the outcome is
   open. Earlier this floor was 12, which silently dropped picks whenever the cron ran late — the
   "stopped logging while I was away" bug.) It acts only on **fresh** Kalshi data, and the cron now
   **retries the fetch and warms the cache itself** instead of relying on the app being open. And
   whenever the Kalshi path locks **nothing** — for *any* reason: Kalshi unreachable/stale (it
   rate-limits the server's IP, mostly while the app is closed), *or* a late cron leaving no market in
   the 6–16.5-min window, *or* the only open market already decided — a **Kalshi-independent fallback**
   self-anchors the round from the clock + the live Coinbase price — strike = the price at the round's
   open, close = the next 15-min boundary — and logs the lean from momentum + book + the learned model alone
   (`nextRoundClose` + a `self: true` market). This is **purely additive**: a normal Kalshi-reachable
   pick is unchanged; the fallback only fires when the tracker would otherwise log nothing, so **any
   cron that runs records a round**. **Since r85 the fallback is much rarer and much smarter.** The
   2026-07 audit found ~78% of rounds ended up self-anchored — a fresh Kalshi market shows "Target
   price: TBD" junk quotes for its first minute or two, and the old code treated that as "no market at
   all". Three fixes: **(a)** `fetchCrowd` now keeps the market's **identity** (a quotes-less *shell*:
   ticker/close/strike) even when the price is unusable, so a self-anchored round still gets its
   **ticker attached** and `reconcileKalshi` later grades it against Kalshi's definitive result;
   **(b)** if any series-coin self-anchored, the cron waits **~75s** for quotes to go live and
   **re-locks that pick with the crowd** — guarded so it only ever happens minutes into a round
   (≥10 min must remain), never near a close, and a retry that fails keeps the original; **(c)** a
   **crowd gate**: the tracker **never commits a bet without a live crowd price** — audited blind
   commits went 6/12 (a coin flip) vs 40/50 (80%) with the crowd; crowd-less rounds still log their
   lean (the shadow record) and still train the model, they just can't claim a bet. Self-anchored
   rounds are flagged **· self-tracked** in the app (and are never Kalshi-confirmed unless
   reconciliation upgrades them). The pick
   itself is the simple blend: the
   **Kalshi market price** nudged by **1-min momentum**, **order-book imbalance** and the learned
   model, with **SKIP** near 50/50 (`freePick`). The commit is **confluence-gated** — it only fires
   when several *independent* reads point the same way, when they conflict (a wider SKIP band, **±0.10 aligned → ±0.20 split**) — and reports how many reads agree (`agree`) and
   the share of signal-weight behind the side (`conf`), so a low-agreement pick or a SKIP is itself
   an honest "this round is a coin-flip". The pick is held untouched until the round closes, then
   step 1 grades that genuinely-uncertain call — the only thing the Hit-Rate ever counts.
3. Stores the latest pick + a rolling history + hit rate in `CROWD_KV`. The whole auto-tracker —
   every coin **and** the pooled model — lives in **one** consolidated record (read back per-coin
   via `?picks=COIN`), so a cron run is a single KV write and stays inside the free tier.

### What it's doing right (and what a hot streak does/doesn't prove)

The tracker's edge isn't picking *more* — it's picking **rarely and well**. `freePick` blends four
*independent* reads: the **Kalshi crowd price** (weight **0.55**, nudged to lean *into* a confident
favorite — favourite-longshot bias), **1-min momentum** (ride a moderate drift; *fade* a ≈2σ
over-reaction that tends to snap back), **order-book imbalance** (who's actually buying vs selling
right now), and the **learned per-coin model** (0.20). It then commits **only when those reads are
both lopsided and agree** — the SKIP band *widens* from ±0.10 (aligned) to ±0.20 (split) — so it
**sits out the majority of rounds** (typically ~85–90%). That discipline is the whole game: it
protects the hit-rate by refusing the coin-flips.

So a **winning run means the market has been in a persistent / trending regime** where the crowd, the
flow and momentum keep pointing the same way and the round keeps settling on that side — exactly the
**confluence** setups the blend is built to catch.

**The honest caveat, so a streak isn't over-read:** a confirmed run (e.g. *12 in a row*) is **real** —
graded against Kalshi's settled result, which is what Robinhood paid — and a genuinely good sign. But
it has a **variance** component (at a ~70–75% per-bet hit-rate, ~12 straight lands a few percent of
the time) and is **regime-dependent**: when the market turns choppy / mean-reverting, confluent
setups get rarer and the streak *will* break. The thing to trust is the **per-bet hit-rate over a
large sample** and the **bet-rate** (how disciplined it's staying) — **not** the streak itself. The
repeatable edge is the *SKIP-unless-confluent* discipline, not the run.

The **exact `freePick` formula** — every input, weight, the commit band, and the favourite-longshot
and panic-fade rules — is **kept on record in [`cloudflare-worker/README.md`](cloudflare-worker/README.md)**
(under _The pick algorithm_), so it survives future sessions and rewrites.

Read it at `…/?picks=ETH` (or `?picks` for all coins). The app shows it in the **24/7
Auto-Tracker** panel (`fetchAutoTracker` / `renderAutoTracker`), and the Worker folds the
record into the AI prompt as an independent reality check on the market.

### The online learning model (per-coin, pooled)

Each cron round also updates a tiny **online logistic regression** that learns, per coin, how
round-open signals map to the chance price finishes OVER — then feeds what it's learned to the
AI and the auto-tracker panel. Design choices are grounded in the literature:

- **Features:** order-book imbalance, 1-min momentum, volatility regime, crowd lean,
  **last-round direction** (continuation vs reversal), **time-of-day** (sin/cos), **round-shape**
  (where the latest price sat in the just-closed round's high–low range, an exhaustion tell), and
  two classic technicals computed server-side from 1-min closes — **RSI(14)** (re-centred so
  +1 = overbought, −1 = oversold) and the **MACD(12,26,9) histogram** (price-scaled, `tanh`-squashed) —
  and a **cross-asset market-momentum** factor (`marketMom`): the net 1-min momentum of the *other*
  tracked coins, since crypto moves together and BTC tends to *lead*, so a coin's next move partly
  follows the pack (the cron processes **BTC first** so the others read its fresh momentum, at zero
  extra data cost; the weight starts at 0 and is learned, so it can only help once it proves itself).
  Order flow is the strongest short-horizon predictor — but it's a *seconds*-scale signal (Cont et
  al. 2010; Sirignano & Cont 2018), so at 15 min the model simply *learns* to down-weight it.
  Saved models auto-migrate when features are added (`padModel` zero-pads the weight vector, so an
  existing model behaves identically until it learns the new signal).
- **Trained on the definitive outcome — Coinbase *and* Kalshi.** The label each round teaches the
  model is the *actual* settled result (did it finish OVER or UNDER the line), learned from the rich
  Coinbase-derived features above **plus** the Kalshi crowd lean. For Kalshi-ticketed rounds the
  training is **deferred until Kalshi confirms** its settled result, so the model learns Kalshi's
  truth — not a provisional Coinbase-candle grade that can flip on a thin round; self-tracked
  (Kalshi-down) rounds train on their Coinbase close-vs-open outcome. Each round teaches the model
  **exactly once** (a `trained` flag), with a grace net so a round Kalshi never confirms still
  teaches it. (Previously it trained on a raw close-vs-open proxy at grade time; this aligns the
  learning target with what's actually predicted *and* graded.)
- **Settlement margin recorded per round.** Every graded round now stores *how far past the line it
  closed* — signed `$` and `%` (`over` / `overPct`) — so a near-miss and a blowout are no longer the
  same data point. This feeds the AI's after-round read and the model's mean-reversion sense
  (`rec.lastMargin`), and is the groundwork for confidence that scales with how decisively recent
  rounds resolved.
- **Online logistic regression with a constant learning rate** (η≈0.05, not 1/√t) so it keeps
  tracking a drifting market, with **L2 shrinkage** because samples are scarce.
- **Partial pooling:** each coin's weights are shrunk toward a **shared global model** by how
  much data the coin has earned (κ≈150 ≈ 1.5 days), because microstructure features are
  *universal across coins* (Bieganowski & Ślepaczuk 2026). Cold coins ride the pooled model.
- **Cold-start gate:** the output is shrunk toward 50/50 until the pooled model has enough
  data, so it never emits a confident guess from noise.
- **Honest ceiling.** 15-minute direction is near-random; a real 53% edge needs ~2,500 graded
  rounds (~26 days/coin) to even confirm. The model is therefore used as a **faint, calibrated
  tilt + abstention aid**, never a crystal ball — and the panel labels its confidence by sample
  size (*warming up → building → established*). It lives in `worker.js` (`featuresFor`,
  `trainModel`, `predictBlend`, `modelInsights`) and persists in KV alongside the rest of the
  auto-tracker state, in one consolidated record (see *Data persistence*).

---

## AI Co-Pilot (Cloudflare Worker)

`cloudflare-worker/worker.js` takes the app's snapshot and returns a disciplined, **numeric**
verdict.

- **Providers (switchable):** Anthropic Claude (paid; **`claude-haiku-4-5`** is the cheap default,
  Sonnet/Opus selectable), Google Gemini (free tier), Groq (free tier). Auto-detected from the key
  present, or forced with `AI_PROVIDER`; the app can request a specific model per call.
- **Live model catalogue (r94):** the list of models you can pick is **fetched from the providers**,
  not hard-coded. `?models` merges each provider's own list-models endpoint (only for keys that are
  set), drops anything that can't do a chat completion, caches ~6h in KV (`cfg:models`, warmed by
  the cron) and serves the last good list if a refresh fails. The app rebuilds its dropdown from it
  and keeps your selection even if the providers stop listing it. At **call** time, a model that has
  disappeared from its provider's list is swapped for the newest one in the same family
  (`liveModel`) — a retired id would otherwise 404 and cost the round its AI read entirely.
- **Structured output:** `{probOver, verdict, confidence, edge, rationale}` — Anthropic via
  JSON-schema, Gemini/Groq via JSON modes, with a tolerant `extractJson()` fallback and a
  `normalize()` that derives `probOver` if omitted.
- **Consensus read (`getAIRead` → `aiConsensus`):** a single LLM read on a near-coin-flip is
  noisy, so each round's read is actually **several samples at varied temperature** (`AI_SAMPLES`,
  default 3) whose `probOver` is **averaged**. The verdict comes from that average, and the
  **cross-sample agreement becomes the confidence** — unanimous *and* lopsided → High, split →
  Low. Set `AI_SAMPLES=1` to fall back to the old single read. Cached per round, so it's a few
  calls per round, not per tick. (Free providers make this essentially free.)
- **The prompt** (`buildPrompt`) is built around market efficiency: **anchor on the Kalshi
  price** (don't re-derive it), here's **the math** (distance, time-left, volatility, the
  position-model probability, momentum), the indicators are **correlated** so don't over-count
  them, here's **your calibration + conditional hit-rates** and the **24/7 auto-tracker's**
  record — then strict **SKIP discipline** (only past a real margin) and a **plain-English**
  rationale. It reframes for the **next round** when ≤120s remain.
- **Cost controls:**
  - **Crowd-only path** — the app can POST `noAI: true` to refresh the free Kalshi price +
    strike with **no LLM call**. This path **also returns the round's shared cached AI read**
    (just a free KV read, tagged with its timestamp `aiTs`) so every device can converge on the
    one read without paying — see *Shared AI read* below.
  - **Once per round, shared across devices** — the paid read fires once at the 2-min lock and is
    cached under a per-round/per-coin/per-model key (`airead:{coin}:{model}:{boundaryMs}:{this|next}`,
    ~30-min TTL). Every other device — and every later tick on the same device — re-serves that
    **one** cached read instead of paying again. The app adopts a shared read only when its `aiTs`
    is **newer** than the one it already holds (newer-read-wins), so a background poll never reverts
    a fresher local read. Net: identical AI input on all devices, **one paid call per round, not one
    per device** — same read quality, no accuracy traded for the consistency.
  - **Visibility-gated** — no automatic paid reads while the tab is hidden.
  - **"AI spend" setting** — *Every round* (**default now that the AI is free** — reads every
    round for the most stable call), *Smart* (only reads when the call is close or contrarian to
    the market), or *Manual only*. On a paid provider, switch to *Smart* or *Manual* to control cost.
  - Set a hard monthly cap in the Anthropic console for belt-and-suspenders.

Setup details (keys, vars, Git deploy, cron) live in
[`cloudflare-worker/README.md`](cloudflare-worker/README.md).

---

## Next-round ribbon & conviction

In the final `BET_WINDOW` (40s) the Auto Pick card surfaces a prominent, pulsing
**next-round ribbon** with the locked pick for the **next** round (BUY OVER/UNDER + the blended
% + the lock timestamp), colored to the side. `convictionFor()` tiers it:

- ⭐ **STRONG** — indicators **and** AI **and** crowd all point the same way.
- ⚡ **EDGE vs CROWD** — you and the AI agree, but the crowd leans the other way.
- 🔒 **LOCKED** — normal; place it or skip.

The locked pick is committed once (after a brief settle on a fresh read) and held steady so it
doesn't flicker.

---

## Crowd odds (Kalshi)

The Worker reads the nearest-expiry open market in the coin's 15-minute Kalshi series
(`KXETH15M` / `KXBTC15M` / `KXSOL15M`) and turns its YES bid/ask midpoint into an implied OVER
probability — **and also returns the next round's market** (`next`), which the app uses during
the bet window. Reliability details:

- **Quote parsing.** Kalshi prices in **dollars as strings** (`yes_bid_dollars: "0.5000"` →
  50%); `overFromMarket()` parses `*_dollars` (×100) with legacy-cent + `last_price_dollars`
  fallbacks. `strikeFromMarket()` reads `floor_strike` (or parses the subtitle).
- **Browser-like User-Agent** — Kalshi throttles default bot agents straight to `429`.
- **Retry on 429** (`kalshiFetch()`, 300/600/900 ms backoff).
- **KV-backed cache** (`CROWD_KV`) — one good fetch shared across every isolate and served
  (flagged *stale*) for up to 15 min through throttled gaps; a 60s fresh window avoids
  re-hitting Kalshi. The cron also warms this cache for the live app.

The `?crowd=COIN` GET route dumps `httpStatus`, the raw market, the derived `overPct`/`strike`,
and the cached value/age. A coin with no series ticker simply shows crowd `n/a`.

---

## Design system

A flat, warm-black theme:

- **Warm near-black** `#0b0a09` ground with **solid** `#17150f` cards and hairline borders (r98 —
  the translucent glass cards and the drifting accent aurora are gone; deleted, in git history).
  r99 warmed the whole ladder: the greys were dead-neutral blue-black (`#0a0a0b` / `#1c1c1e`), which
  with no glass left to carry warmth read as *unfinished* rather than *restrained*. Text warmed with
  it — `--label` is `#edeae6`, not `#fff`, because pure white on a warm black reads blue by contrast.
  Same lightness ladder and contrast ratios throughout; only the hue moved.
- **Two accents, strictly semantic (r98):** green `#30d158` (over/go — also the ⭐ star and the
  brand mark) and red `#ff453a` (under/loss). Skip/caution surfaces are neutral grey; the old
  orange and blue accents are retired. r99: `--accent-rgb` now matches `--green` exactly
  (`48,209,88`) — it had been `13,224,89`, a second green, so tokenised borders and focus rings sat a
  visibly different hue next to a solid green fill.
- **Typography carries the personality, in exactly two places (r99).** The wordmark is heavy italic
  with the app's green as its full stop, and the verdict headline splits into a light 300-weight verb
  and a heavy italic side — `Bet` **OVER**. Nothing else on the page is italic. The rule is that the
  loud weight only ever falls on the word that changes what you do.
- **The clock is boxed digits (r99).** Each character of the countdown sits in its own recessed well
  (page-ground fill, green rim) beside the price, at a size chosen so the two blocks finish the same
  height. Before this it was plain numerals in the same colour and weight as everything else, which
  made it invisible at a glance — you had to read it to find it. The digits are sized against the
  *longest realistic price string* at seven widths: boxing them made the clock ~80px wider than the
  numerals it replaced, and the desktop call column is only ~410px, so a six-figure coin was losing
  digits to an ellipsis. On phones the change pill drops to its own line rather than the price
  shrinking — of the three things in that row, the price is the one that must never be abbreviated.
- **Brand coin icons** as crisp inline **SVG** (ETH diamond, BTC ₿, SOL bars, DOGE Ð, SHIB,
  XRP) — tiny and impossible to corrupt.
- **Hairlines:** `--hair` `rgba(255,255,255,.09)` and `--hair2` `rgba(255,255,255,.06)` — the
  internal dividers inside the verdict card. (These were referenced by the r90 CSS but only actually
  *defined* in r93; before that they silently fell back to `currentColor`.)
- **12-hour clock** with AM/PM everywhere.
- **Responsive (r93):** a **segmented** coin control on tablet/desktop, a **dropdown** on mobile.
  One layout engine, two shapes:
  - **< 1024px** — a single flex column, ordered by the questions you ask in order: the call
    (price + clock + verdict, one card) → the record strip → the chart → the closed doors.
  - **≥ 1024px** — two panes, `the call | the chart`, with the record under the call and three
    full-width doors below. iPad portrait gets the two-pane layout, not a stack.
  - `.stackL` is a real flex column with **zero gap**, which is what welds the price card and the
    verdict card into one; `.stackR` is `display: contents` so its modules place themselves as
    grid items.
  - **No column may end in a void.** A short verdict (a SKIP round draws no rail or cost row) used
    to leave a tall empty patch beside the chart, and an empty region reads as a bug rather than as
    breathing room — that was the r92 iPad complaint. r99 helps here by keeping the verdict slab the
    same size in every state, so the column's height no longer swings with the call.
- **One door per thing you set once.** The gear in the nav opens Settings (play style, AI weighting
  and trust, worker/model/spend, alerts). Diagnostics — AI read, Live Indicators, the full round log,
  the chart's overlay switches — are `<details>`, collapsed by default at every width.
- Help affordances: an info sheet (`EXPLAIN` map) defines each indicator + panel in plain
  English.

---

## Design files (Figma)

The UI is mocked up in Figma with the same design system across three breakpoints:

**📐 Figma file:** https://www.figma.com/design/K8o8dinrXn2XmHO7T3i9JV/

| Frame | Layout |
|---|---|
| **📱 Mobile · 390** | single-column stack |
| **📲 Tablet · 834** | two-column layout |
| **🖥 Desktop · 1440** | 3-up top row (hero · timer · pick) + grid |

The file also includes a **`style-guide`** frame that documents the design system — color +
gradient palettes, typography, the **Crypto Icons** (brand marks reproduced as SVG in the app),
the **chart components**, and the **Indicators & Desktop Chart** assets: the BULL/BEAR/NEU/INFO
signal chips, the indicator panel and the RSI/MACD/Stochastic sub-panes at **desktop & mobile**
sizes, plus the **desktop price-vs-line chart** — all reproduced from the live app in Space Mono.
A board of curated references sits alongside.

### Inspiration (via Mobbin)

- [Binance · Events (Higher/Lower)](https://mobbin.com/screens/96c7545e-029f-4356-bd8c-afe4c5954a81) — short-term Higher/Lower on a candle chart with time increments + payout %; the closest analogue.
- [Crypto.com · ETH Leverage](https://mobbin.com/screens/20740a03-a93e-4c43-9e44-5ec28a59c06d) — dashed current-price line + green Buy / red Sell (the "line to beat").
- [Binance · Price Predict](https://mobbin.com/screens/1ae4ce0d-625a-4005-a98c-e5554bd92f86) — "I think ETH is going ↑/↓".
- [Coinbase · BTC chart](https://mobbin.com/screens/f7580aa4-4e73-4a2a-800f-4682a03bbd30) — true-black candles, 15M interval, indicators.
- [Formula 1® · Predict](https://mobbin.com/screens/a8c724bd-26fe-4105-a82c-5ebb7fcbcd3a) — binary YES/NO with a round countdown.
- [OKX · Simple Options](https://mobbin.com/screens/39f1d20c-ed59-4cb5-a7b2-c2ea40e26b7e) — one-button "going up ↑" simplicity.

---

## Data persistence

Client-side, in `localStorage` (per device, no account):

| Key | Holds |
|---|---|
| `pickTracker_v1` | graded round history + signal snapshots (~7 days) |
| `workerUrl_v1` | saved AI Worker URL |
| `aiModel_v1` | preferred AI model — **also synced across devices** via the Worker (`cfg:aimodel` KV); this local copy is just a cache. Defaults to Claude Sonnet 4.6. |
| `aiBudget_v1` | AI spend mode (`smart` / `always` / `manual`) |

Server-side, in Worker **KV** (`CROWD_KV`):

| Key | Holds |
|---|---|
| `crowd:<series>` | shared Kalshi crowd-odds cache (stale-serve through 429s) |
| `auto:state` | the entire 24/7 auto-tracker in **one** record — every coin's pick/history/hit-rate/learned model **and** the pooled global model. Written once per cron run (a single KV write, to stay under the free tier's 1,000/day); read back per-coin via `?picks=COIN`. Seeds itself from the older `picks:<COIN>` + `model:global` keys on first run, then they expire. **Only the newest 300 rounds per coin live here** — older rounds survive in the archive below. |
| `arch:<YYYY-MM-DD>` | **permanent round archive (r85)** — every graded round, appended exactly once ~3h after it settles (so Kalshi reconciliation has converged), no expiry. Rows carry the full round record plus the raw **crowd %** at lock, Kalshi's posted **kStrike**, and the preserved Coinbase proxy close (`pxClose`). List days with `?archive`; fetch one with `?archive=YYYY-MM-DD` (`&dl=1` downloads). ~1 extra KV write per cron. |

---

## Deployment

**App → GitHub Pages.** `.github/workflows/pages.yml` copies `eth-tracker.html` to
`index.html` and publishes on every push to `main`.

**Worker → Cloudflare (Git-connected).** The repo's root `wrangler.toml` points Cloudflare at
`cloudflare-worker/worker.js`; **every push redeploys the Worker** (no manual `wrangler
deploy` needed).
- Public, non-secret vars (the Kalshi series tickers) live in `wrangler.toml [vars]` because
  Git deploys wipe plain-text dashboard variables — only **Secrets** persist.
- API keys are added as **Secrets** in the Worker dashboard and survive deploys.
- A **KV namespace** (`CROWD_KV`) is bound for the crowd cache **and** the auto-tracker picks.
- The **cron trigger** (`[triggers] crons`) drives the 24/7 auto-tracker — free-tier
  compatible, no AI spend. Confirm it under the Worker → **Triggers** tab after a deploy.

---

## Repository layout

```
.
├── eth-tracker.html              # the entire app (served as index.html)
├── wrangler.toml                 # Worker config: [vars], KV, and the cron trigger
├── cloudflare-worker/
│   ├── worker.js                 # AI + Kalshi-crowd proxy + scheduled auto-tracker
│   └── README.md                 # Worker setup (keys, providers, deploy, cron)
├── .github/workflows/pages.yml   # GitHub Pages deploy
└── README.md                     # this file
```

---

## Local development

The app is a static file — just open it:

```bash
# from the repo root
python3 -m http.server 8000
# then visit http://localhost:8000/eth-tracker.html
```

Live price, indicators, volatility/momentum, the chart, and the accuracy tracker work with no
setup. To exercise the AI panel and the auto-tracker locally, point the **AI Co-Pilot** box at
a deployed Worker URL, or run the Worker with `wrangler dev` (see the Worker README). Quick
sanity check on the JS: extract the `<script>` and run `node --check`.

---

## Crucial code map

`eth-tracker.html`
- `COINS` / `COIN_ICONS` — per-coin config + inline-SVG brand icons.
- `connectWS` / live price handling; `loadCoinbaseCandles` / `refreshMicro` / `refreshOrderBook`
  — candles, 1-min volatility + momentum, order-book imbalance.
- probability engine: `indOver` / `aiOver` / `crowdOver` / `obiOver` / `momOver` / `barrierOver`
  (+ `normCdf`, `sigmaRoundFallback`) → `rawCombinedOdds` → `calibrate` → `combinedOdds`.
- `renderPickCard` (locked call + next-round ribbon + glow) / `renderLean` / `setGlow`.
- `renderHero` — the verdict slab: picks the fill (`go`/`no`/`soft`/`skip`), builds the two-weight
  headline via `v(verb, side)`, and calls `slipRow`. Derives no pick of its own.
- `slipRow` / `measuredAtPrice` / `betMath` — the bet in four terms (`IN`/`OUT`/`NEED`/`RUNS`).
  `NEED` is venue-aware break-even; `RUNS` is the measured hit rate at that price, gated at n ≥ 20.
- `myRecordLine` / `resolveMyBets` / `toggleMyBet` — your own logged bets (`myBets.v1`) and the
  W/L form chips.
- `drawMiniChart` → `drawLiveChart` / `drawTFChart`, `loadTFCloses` — zoomable chart.
- `nextBoundary` / `tickTimer` — round clock, grading, per-round refresh.
- `openRound` / `gradeRound` / `snapshotFeat` / `historySummary` — record + calibration data.
- `callWorker` (paid + `crowdOnly`) / `marketContext` / `aiWorthIt` / `refreshCrowd` /
  `applyCrowd` — AI + free crowd, visibility + smart-spend gating.
- `fetchAutoTracker` / `renderAutoTracker` — the 24/7 panel; `hm`/`hma`/`hms`/`rangeHM` — 12h clock.

`cloudflare-worker/worker.js`
- `fetch` handler — health check, `?discover`, `?crowd`, `?picks` diagnostics, the POST path
  (crowd + AI, or `noAI` crowd-only).
- `scheduled` — the cron: `runCoinPick` (grade + `freePick` + KV) using `cbMicro` / `cbObi`.
- `getKalshiCrowd` / `fetchCrowd` — crowd (current + `next`) with KV + stale-serve.
- `buildPrompt` — market-anchored, physics + calibration + auto-tracker, numeric `probOver`.
- `pickProvider` / `getAIRead` / `readAnthropic` / `readGemini` / `readGroq` / `normalize`.

---

## Disclaimer

This is an educational tool for tracking and reasoning about a short-term prediction market.
It is **not financial advice**. Prices, indicators, AI output, crowd odds, and the calibrated
probabilities can all be wrong; 15-minute markets are effectively a coin flip with costs, and
no model can predict the future. Never stake more than you can afford to lose.
