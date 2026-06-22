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
> Supports **ETH**, **BTC**, **SOL**, **DOGE**, **SHIB**, and **XRP** (segmented control on
> desktop, a dropdown on mobile).

---

## What's new (latest)

Recent work, newest first:

- **Zoom + pan on the charts and indicators (Coinbase-style).** On a timeframe chart (1m+): **scroll-wheel or pinch to zoom**, **drag (mouse) / one-finger drag (touch) to pan**, **double-click/double-tap to reset**. The indicator sub-panes and EMA/Bollinger overlays follow in lockstep (they share the chart's x-positions via `state.vp` → `chartPts`). On touch a **long-press** still summons the crosshair and a **vertical drag still scrolls the page**; on desktop, hover still scrubs. The live tick view is unchanged (it's a single in-progress round).
- **The Auto Pick now commits and holds instead of flip-flopping.** Early in a round, when price is near the line (a coin-flip), the card says **"WAITING — no clear side yet"** rather than guessing. It commits to OVER/UNDER only once the blended probability is decisive (≥ 58% / ≤ 42%), then **holds** that side while it stays ahead (≥ 50%) — so a small wiggle across the line no longer flips the call; only a real loss of the edge un-commits (`thisRoundCommitted`). The small "Live:" line still shows the moment-to-moment read.
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
  reads this record too. Read it directly at `…/?picks=ETH`.
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
7. In the final two minutes, the pick card surfaces a prominent **next-round ribbon** with
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
- A countdown + progress bar show time remaining (12-hour AM/PM labels); the final 2
  minutes (`BET_WINDOW = 120s`) is the **bet window** when the locked **next-round** pick
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
   prior; uses the **next** round's market during the bet window.
3. **AI** (`aiOver`, ~0.30) — Claude's own **numeric** probability (`probOver`).
4. **Indicators** (`indOver`, ~0.22) — the bull/bear tally (correlated, so demoted).
5. **Order-book imbalance** (`obiOver`, ~0.07) and **short-term momentum** (`momOver`, ~0.08)
   — gentle, short-horizon tilts.

`calibrate()` then nudges the raw blend toward your realized results: among past rounds whose
model-confidence sat in the same band, how often did that side actually win? (Laplace-smoothed,
weighted by sample size, gated until ≥8 samples.) `normCdf` is an Abramowitz-Stegun approximation.

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

The headline card (`renderPickCard()`) turns everything into one plain instruction:

- **BUY OVER ↑ / BUY UNDER ↓** in large type, with a plain-language subtitle and a hint.
- **A single blended likelihood %** from [the probability engine](#the-probability-engine).
  The % updates live; the **direction stays locked** for the round.
- **Phase-aware scope + next-round ribbon.** Most of the round it reads *"✅ THIS round ·
  closes h:mm AM/PM"*. In the final 2 minutes a pulsing **ribbon** shows the locked
  **NEXT-round** pick — *"⏭ NEXT ROUND · BUY OVER ↑ when it opens h:mm · 🔒 locked …"*.
  **SKIP** when there's no clear edge.
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

1. Grades the previous round's pick on the **finalized boundary candle close** (`cbCloseAt` →
   `cbAvg60`) — fast and Kalshi-free so grading can never stall — then **reconciles** it to Kalshi's
   own settled result (`result: yes/no` → OVER/UNDER, literally what you bet on) on a later cron,
   kept off the critical path (`reconcileKalshi`, ≤1 Kalshi call/coin/cron).
2. Makes a fresh pick the simple way: the **Kalshi market price** nudged by **1-min momentum**
   and **order-book imbalance**, with **SKIP** near 50/50 (`freePick`).
3. Stores the latest pick + a rolling history + hit rate in `CROWD_KV`. The whole auto-tracker —
   every coin **and** the pooled model — lives in **one** consolidated record (read back per-coin
   via `?picks=COIN`), so a cron run is a single KV write and stays inside the free tier.

Read it at `…/?picks=ETH` (or `?picks` for all coins). The app shows it in the **24/7
Auto-Tracker** panel (`fetchAutoTracker` / `renderAutoTracker`), and the Worker folds the
record into the AI prompt as an independent reality check on the market.

### The online learning model (per-coin, pooled)

Each cron round also updates a tiny **online logistic regression** that learns, per coin, how
round-open signals map to the chance price finishes OVER — then feeds what it's learned to the
AI and the auto-tracker panel. Design choices are grounded in the literature:

- **Features:** order-book imbalance, 1-min momentum, volatility regime, crowd lean,
  **last-round direction** (continuation vs reversal), and **time-of-day** (sin/cos). Order
  flow is the strongest short-horizon predictor — but it's a *seconds*-scale signal (Cont et
  al. 2010; Sirignano & Cont 2018), so at 15 min the model simply *learns* to down-weight it.
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

- **Providers (switchable):** Anthropic Claude (**`claude-haiku-4-5` default** — cheap and
  plenty sharp; Sonnet/Opus selectable), Google Gemini (`gemini-2.0-flash`, free), Groq
  (`llama-3.3-70b-versatile`, free). Auto-detected from the key present, or forced with
  `AI_PROVIDER`; the app can request a specific model per call.
- **Structured output:** `{probOver, verdict, confidence, edge, rationale}` — Anthropic via
  JSON-schema, Gemini/Groq via JSON modes, with a tolerant `extractJson()` fallback and a
  `normalize()` that derives `probOver` if omitted.
- **The prompt** (`buildPrompt`) is built around market efficiency: **anchor on the Kalshi
  price** (don't re-derive it), here's **the math** (distance, time-left, volatility, the
  position-model probability, momentum), the indicators are **correlated** so don't over-count
  them, here's **your calibration + conditional hit-rates** and the **24/7 auto-tracker's**
  record — then strict **SKIP discipline** (only past a real margin) and a **plain-English**
  rationale. It reframes for the **next round** when ≤120s remain.
- **Cost controls:**
  - **Crowd-only path** — the app can POST `noAI: true` to refresh the free Kalshi price +
    strike with **no LLM call**.
  - **Once per round** — the paid read fires at the 2-min lock, not every tick or round-open.
  - **Visibility-gated** — no automatic paid reads while the tab is hidden.
  - **"AI spend" setting** — *Smart* (default; only pays when the call is close or contrarian
    to the market), *Every round*, or *Manual only*.
  - Set a hard monthly cap in the Anthropic console for belt-and-suspenders.

Setup details (keys, vars, Git deploy, cron) live in
[`cloudflare-worker/README.md`](cloudflare-worker/README.md).

---

## Next-round ribbon & conviction

In the final `BET_WINDOW` (120s) the Auto Pick card surfaces a prominent, pulsing
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

iOS/Apple-inspired dark theme:

- **Near-black** `#0a0a0b` background (not pure black), layered translucent glass cards.
- **Recommendation-driven aurora** — a fixed, slowly-drifting glow that stays **green** (the
  signature color, always visible) and crossfades to **red** when the pick is UNDER; the
  centre stays near-black (~70% dark / ~30% gradient). Honors `prefers-reduced-motion`.
- **System accent colors:** green `#30d158` (OVER/bull), red `#ff453a` (UNDER/bear),
  orange `#ff9f0a` (skip/caution), blue `#0a84ff` (info/next-round).
- **Brand coin icons** as crisp inline **SVG** (ETH diamond, BTC ₿, SOL bars, DOGE Ð, SHIB,
  XRP) — tiny and impossible to corrupt.
- **12-hour clock** with AM/PM everywhere.
- **Responsive:** a **segmented** coin control on tablet/desktop, a **dropdown** on mobile;
  fluid grids from phone to ultrawide.
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

The file also includes a **Crypto Icons** style-guide frame (the brand marks reproduced as
SVG in the app) and a board of curated references.

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
| `aiModel_v1` | preferred AI model (defaults to Haiku) |
| `aiBudget_v1` | AI spend mode (`smart` / `always` / `manual`) |

Server-side, in Worker **KV** (`CROWD_KV`):

| Key | Holds |
|---|---|
| `crowd:<series>` | shared Kalshi crowd-odds cache (stale-serve through 429s) |
| `auto:state` | the entire 24/7 auto-tracker in **one** record — every coin's pick/history/hit-rate/learned model **and** the pooled global model. Written once per cron run (a single KV write, to stay under the free tier's 1,000/day); read back per-coin via `?picks=COIN`. Seeds itself from the older `picks:<COIN>` + `model:global` keys on first run, then they expire. |

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
