# 15-Minute Crypto Over/Under Tracker

A single-page web app that mirrors Coinbase's **"15 min Ethereum"** market (the
Kalshi-powered Over/Under: *will the price be above its round-open level 15 minutes
from now?*) and helps you decide which way to bet. It pulls **live prices**, computes
**technical indicators** in your browser, **auto-grades** its own track record, and
folds in an **AI Co-Pilot** that weighs your indicators + your 7-day hit rate against
the **live Kalshi crowd odds** — then tells you what to play for the **next round**
right before the clock runs out.

> **Live app:** https://graphicaljerry.github.io/Market-Prediction-App/
> Supports **ETH**, **BTC**, and **SOL**, switchable in the header.

---

## Table of contents
- [What it does](#what-it-does)
- [Goals & design principles](#goals--design-principles)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [The 15-minute round model](#the-15-minute-round-model)
- [Indicator engine](#indicator-engine)
- [Accuracy tracker](#accuracy-tracker)
- [AI Co-Pilot (Cloudflare Worker)](#ai-co-pilot-cloudflare-worker)
- [Bet Window & conviction alerts](#bet-window--conviction-alerts)
- [Crowd odds (Kalshi)](#crowd-odds-kalshi)
- [Design system](#design-system)
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
2. Pulls **15-minute candles** and computes a panel of **technical indicators**.
3. Combines those into a single **Auto Pick** (OVER / UNDER / SKIP), **locked once per
   round** so it doesn't flicker.
4. **Records and grades** every pick automatically so you build a real hit-rate history.
5. Asks an **AI Co-Pilot** to weigh the technicals + your track record + the **Kalshi
   crowd** and issue a blunt verdict with a one-line rationale.
6. In the final two minutes, opens a **Bet Window** that surfaces the freshest call for
   the **next** round — with **conviction alerts** when indicators, AI, and crowd align.

---

## Goals & design principles

- **Decision-first.** The screen answers one question — *OVER or UNDER for the next
  round?* — and everything else supports that.
- **Honest about itself.** It grades its own picks and shows the running hit rate. No
  cherry-picking.
- **Fresh when it matters.** The recommendation that counts is computed **near the round
  boundary**, on the most recent data, not at page load.
- **Stable, not jumpy.** The headline pick locks per round; only the "live lean" moves.
- **No backend to run.** Everything is static + one optional serverless Worker. Keys
  never touch the browser.
- **Apple/iOS feel.** True-black dark UI, SF system fonts, system accent colors, large
  legible numerals, responsive from phone to ultrawide.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| **App** | Single-file **vanilla HTML/CSS/JS** (`eth-tracker.html`) | Zero build, loads instantly, trivially hostable on Pages |
| **Fonts** | Google Fonts + system SF stack | Apple-like typography with no asset pipeline |
| **Live price** | **Coinbase Exchange WebSocket** (`wss://ws-feed.exchange.coinbase.com`, ticker channel, no auth) | Real-time, free, no key |
| **Candles** | **Coinbase Exchange REST** (`/products/<X>-USD/candles?granularity=900`) → **CoinGecko** fallback | 15-min OHLCV for the indicators |
| **Crowd odds** | **Kalshi public API** via the Worker | The actual market the bet tracks |
| **AI** | **Cloudflare Worker** proxy → Anthropic **Claude** / Google **Gemini** / **Groq** | Key stays server-side; provider is switchable |
| **Hosting** | **GitHub Pages** (static app) + **Cloudflare Workers** (AI/crowd proxy) | Both free, both Git-deployed |
| **Storage** | Browser **localStorage** | Track record + settings persist per device, no DB |

No frameworks, no bundler, no npm install for the app itself.

---

## Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │  Browser — eth-tracker.html (GitHub Pages)   │
                 │                                              │
  Coinbase WS ──▶│  live price ─┐                               │
  Coinbase REST ─▶│  candles ───┼─▶ indicator engine ─▶ Auto   │
  CoinGecko ─────▶│  (fallback) │        │              Pick    │
                 │             └─▶ accuracy tracker ◀──┘  │     │
                 │                   (localStorage)        │     │
                 │                                         ▼     │
                 │            POST {price, strike, pick,         │
                 │              indicators, history,             │
                 │              secondsLeft}                     │
                 └───────────────────┬───────────────────────────┘
                                     │ HTTPS
                                     ▼
                 ┌─────────────────────────────────────────────┐
                 │  Cloudflare Worker (cloudflare-worker/...)   │
                 │   • fetch Kalshi crowd odds (server-side)    │
                 │   • call Claude / Gemini / Groq (key hidden) │
                 │   • return {crowd, ai, provider}             │
                 └───────────────────┬───────────────────────────┘
                          ┌──────────┴───────────┐
                          ▼                      ▼
                   Kalshi public API      LLM provider API
```

The browser never sees the AI key and can't call Kalshi directly (no CORS) — the Worker
exists to do exactly those two things.

---

## The 15-minute round model

Rounds are aligned to wall-clock quarter hours (`:00`, `:15`, `:30`, `:45`).

- `nextBoundary(now)` rounds **up** to the next quarter hour — that's `currentRoundEnd`.
- At each boundary the timer **grades** the round that just ended, **opens** a new one
  (capturing the current price as the new strike), re-locks the headline pick, and fires
  a fresh AI read a few seconds in.
- A countdown + progress bar show time remaining; both turn amber in the final 2 minutes.

---

## Indicator engine

From the 15-minute candles the app computes a panel and turns each into a bull/bear vote:

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

The votes are tallied into a single **Auto Pick**. Two layers keep it usable:
- **`renderRoundCall`** — the big locked card, set **once** at the round boundary.
- **`renderLean`** — a small "live lean" that may update intra-round without disturbing
  the locked call.

---

## Accuracy tracker

Every locked pick is stored with its strike, direction, and round time. When the round
ends, `gradeRound()` compares the close to the strike and marks the pick correct or not.
`historySummary()` derives, over the retained window (~7 days / a few hundred rounds):

- overall **hit rate**, current **streak**
- **OVER** hit-rate and **UNDER** hit-rate separately (so the AI can trust the direction
  that's actually worked for you)
- the last ~12 graded rounds as a recent-form string

This summary is sent to the AI on every read, so its advice is grounded in *your* results,
not generic priors.

---

## AI Co-Pilot (Cloudflare Worker)

`cloudflare-worker/worker.js` is a module-syntax Worker with one job: take the app's
snapshot and return a disciplined verdict.

- **Providers (switchable):** Anthropic Claude (`claude-opus-4-8` default, sharpest),
  Google Gemini (`gemini-2.0-flash`, free), Groq (`llama-3.3-70b-versatile`, free). It
  auto-detects from whichever key is present, or you force it with `AI_PROVIDER`. The app
  can also request a specific model per call.
- **Structured output:** Anthropic uses `output_config` JSON-schema so the verdict is
  always `{verdict, confidence, edge, rationale}`; Gemini/Groq use JSON response modes,
  with a tolerant `extractJson()` fallback.
- **Prompt:** `buildPrompt()` lays out live price, strike, the indicator votes, the
  track-record line, and the crowd line, then asks for OVER/UNDER/SKIP. It explicitly
  rewards **well-supported technicals that disagree with the crowd** (potential edge) and
  prefers **SKIP** when signals are mixed or the edge is thin.
- **Next-round framing:** the app sends `secondsLeft`. When ≤120s remain, the current
  round is effectively settled, so the prompt **reframes the question for the next round**
  (strike ≈ current price) and the AI panel is labelled *"Next round HH:MM–HH:MM · as of
  HH:MM."* Otherwise it reads the current round.
- **Cost control:** the AI is called roughly **once per round**, not per tick. With Claude
  you can set a hard monthly spend cap in the Anthropic console.

Setup details (keys, vars, Git deploy) live in
[`cloudflare-worker/README.md`](cloudflare-worker/README.md).

---

## Bet Window & conviction alerts

In the final `BET_WINDOW` (120s) the **Bet Window** banner activates and shows the call
for the **next** round, plus a conviction tier from `convictionFor()`:

- ⭐ **STRONG SIGNAL** — indicators **and** AI **and** crowd all point the same way.
- ⚡ **EDGE vs CROWD** — you and the AI agree, but the crowd leans the other way (the
  contrarian setup the prompt hunts for).
- 🔔 **BET WINDOW** — normal; place it or skip.

Outside the window the banner counts down to when the next window opens.

---

## Crowd odds (Kalshi)

The Worker reads the nearest-expiry open market in the coin's 15-minute Kalshi series
(`KXETH15M` / `KXBTC15M` / `KXSOL15M`), using `yes_bid`/`yes_ask` (cents ≈ implied OVER
probability), falling back to `last_price`. Reliability touches:

- a **60-second fresh cache** so rapid reads don't hammer Kalshi;
- a **browser-like User-Agent** (Kalshi throttles default bot agents to 429);
- **stale-serve on error** — if Kalshi rate-limits or hiccups, the last good value is
  served (flagged *"last known"*) for up to 10 minutes instead of dropping to `n/a`.

A coin with no series ticker simply shows crowd `n/a`; the AI read still runs.

---

## Design system

iOS/Apple-inspired dark theme:

- **True black** `#000` background, layered translucent cards.
- **SF system font stack** (`-apple-system`) with large monospaced numerals for prices.
- **System accent colors:** green `#30d158` (OVER/bull), red `#ff453a` (UNDER/bear),
  orange `#ff9f0a` (skip/caution), blue `#0a84ff` (info/next-round).
- **Responsive** from phone through iPad/MacBook to ultrawide via fluid grids.
- Help affordances: an info sheet (`EXPLAIN` map) defines each indicator in plain English.

---

## Data persistence

All client-side, in `localStorage` (per device, no account):

| Key | Holds |
|---|---|
| `pickTracker_v1` | graded round history (~7 days) |
| `workerUrl_v1` | saved AI Worker URL (defaults to the baked-in one) |
| `aiModel_v1` | preferred AI model |

---

## Deployment

**App → GitHub Pages.** `.github/workflows/pages.yml` copies `eth-tracker.html` to
`index.html` and publishes on every push to `main`. (Pages must be enabled with the
**GitHub Actions** source; on a private repo that's a one-time manual toggle.)

**Worker → Cloudflare (Git-connected).** The repo's root `wrangler.toml` points Cloudflare
at `cloudflare-worker/worker.js`; every push redeploys the Worker.
- Public, non-secret vars (the Kalshi series tickers) live in `wrangler.toml [vars]`
  because **Git deploys wipe plain-text dashboard variables** — only **Secrets** persist.
- API keys are added as **Secrets** in the Worker dashboard and survive deploys.

---

## Repository layout

```
.
├── eth-tracker.html              # the entire app (served as index.html)
├── wrangler.toml                 # Cloudflare Worker config + public [vars]
├── cloudflare-worker/
│   ├── worker.js                 # AI + Kalshi-crowd proxy
│   └── README.md                 # Worker setup (keys, providers, deploy)
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

Live price, indicators, and the accuracy tracker work with no setup. To exercise the AI
panel locally, point it at a deployed Worker URL in the **AI Co-Pilot** box, or run the
Worker with `wrangler dev` (see the Worker README).

---

## Crucial code map

`eth-tracker.html`
- `COINS` — per-coin config (Coinbase product, CoinGecko id, symbol).
- `connectWS` / `onLivePrice` — WebSocket subscription and live price handling.
- indicator builder — RSI/MACD/EMA/Bollinger/ROC/Volume → vote list.
- `renderRoundCall` (locked) vs `renderLean` (live lean).
- `nextBoundary` / `tickTimer` — round clock, grading, per-round AI trigger.
- `updateBetWindow` / `convictionFor` / `crowdDirOf` — Bet Window + conviction tiers.
- `callWorker` / `historySummary` / `scopeAt` / `renderAI` — AI request, track-record
  payload, round-scope labelling, and result rendering.

`cloudflare-worker/worker.js`
- `fetch` handler — health check, `?discover=COIN`, `?crowd=COIN` diagnostics, and the
  POST path (crowd + AI).
- `getKalshiCrowd` — crowd odds with fresh cache, browser UA, and stale-serve.
- `buildPrompt` — phase-aware prompt (current vs **next** round near the limit).
- `pickProvider` / `getAIRead` / `readAnthropic` / `readGemini` / `readGroq` / `normalize`.

---

## Disclaimer

This is an educational tool for tracking and reasoning about a short-term prediction
market. It is **not financial advice**. Prices, indicators, AI output, and crowd odds can
all be wrong; 15-minute markets are effectively a coin flip with costs. Never stake more
than you can afford to lose.
