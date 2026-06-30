# AI Co-Pilot Worker — setup

This Worker is the bridge that lets the tracker show **live Kalshi crowd odds** and an
**AI read**. A browser can't reach Kalshi, and an API key can't live in a public file, so
the Worker does that part. You can run the AI on a **free** model or on **Claude** (paid).

There are two ways to deploy. You connected the repo to Cloudflare, so use **A**.

---

## A. Git-connected deploy (auto-deploys on every push) ← you chose this
Your repo already has the two files Cloudflare needs:
- [`/wrangler.toml`](../wrangler.toml) — tells Cloudflare the entry point.
- [`cloudflare-worker/worker.js`](./worker.js) — the code.

**One-time fix-ups:**
1. Open `/wrangler.toml` and set **`name`** to the *exact* Worker name you created in the
   dashboard. (If they differ, the build makes a second worker and your secrets/URL won't match.)
2. In the Worker → **Settings → Build**, leave **Root directory** empty (repo root). The
   root `wrangler.toml` points at `cloudflare-worker/worker.js` for you.
3. Add your provider key + any vars (next section) under **Settings → Variables and Secrets**.
   Secrets you set in the dashboard **persist across Git deploys** — never commit keys.

Every `git push` now redeploys the Worker automatically. The first deploy may need a manual
**Retry** after you've set `name` + the secret.

## B. Quick-edit deploy (no Git)
Workers & Pages → Create Worker → **Edit code** → paste `worker.js` → **Deploy**. Then add
variables as below. (Use this only if you'd rather not use the Git connection.)

---

## Choose your AI — free or paid (you can switch anytime)
Add **one** key as a **Secret** under **Settings → Variables and Secrets**. The Worker
auto-detects which provider to use; or force it with a Text var `AI_PROVIDER`.

| Provider | Key name | Where to get it | Cost |
|---|---|---|---|
| **Gemini** (free) | `GEMINI_API_KEY` | aistudio.google.com/apikey | Free tier |
| **Groq** (free, very fast) | `GROQ_API_KEY` | console.groq.com/keys | Free tier |
| **Claude** (sharpest) | `ANTHROPIC_API_KEY` | console.anthropic.com | **Haiku default, ~0.05–0.1¢ / read** |

- **Pick from the app:** the model you choose in **AI Co-Pilot setup** now also picks the
  **provider** — select *Gemini 2.0 Flash* and it uses Gemini, a Claude model and it uses Claude
  (as long as that provider's key is set in the Worker). So with multiple keys you can switch
  brains right from the app, no dashboard trip. `AI_PROVIDER`, if set, is a **hard override** that
  always wins; leave it unset to let the app's dropdown decide. (`resolveProvider` in `worker.js`.)
- **Synced across your devices:** the model you pick is saved on the Worker (a tiny `cfg:aimodel` KV
  key) and every device pulls it on app-open and on tab-focus — pick a model on your phone and your
  laptop follows next load. The app reads it with a GET `?aimodel` and saves it with a POST
  `{ "setModel": "…" }`. Note a *paid* model picked anywhere applies everywhere (the other devices'
  reads bill for it); the **spend mode** (Smart / Every-round / Manual) stays per-device.
  (`syncSharedModel` / `pushSharedModel` in the app.)
- **Keep options open:** add more than one key and flip between them by setting
  `AI_PROVIDER` = `gemini` | `groq` | `anthropic`. No redeploy of code needed — just save the var.
- Override the model with `AI_MODEL` if you want (defaults: `claude-haiku-4-5`,
  `gemini-2.0-flash`, `llama-3.3-70b-versatile`). A model id that doesn't match the active provider
  is ignored (so a stale dropdown choice can't 404 the read); the response's `provider` field tells
  the app which brain answered, and the app labels the read **AI · Gemini / Claude / Groq** to match.
- **Consensus samples:** `AI_SAMPLES` (default `3`, max `5`) sets how many reads are taken per
  round and **averaged** into one calibrated verdict, with cross-sample agreement as the
  confidence. Set `AI_SAMPLES=1` for a single read (the old behavior). Each sample is one model
  call, so on a **paid** provider this multiplies per-round cost — keep it at 1–2 there; on a free
  provider leave it at 3.
- **Check it worked:** open the Worker URL in a browser (a GET) — it returns
  `{"ok":true,"provider":"…","model":"…"}` so you can confirm which brain is active.

## B-as-in-budget: cap Claude spend
Spend is small by design, but cap it anyway:
- **console.anthropic.com → Settings → Limits / Billing** → set a **monthly spend limit**
  (e.g. $5). The key stops working past that cap.
- The default model is **Haiku** (~0.05–0.1¢/read). The app pays for **at most one** read per
  15-min round (the 2-min lock), **never while the tab is hidden**, and its **AI spend** setting
  (Smart / Every round / Manual) only pays when the call is close or contrarian. Refreshing the
  free **Kalshi crowd** between reads sends `noAI: true` and makes **no LLM call**.
- **Shared per-round read cache:** the Worker stores each read keyed by
  `airead:<coin>:<model>:<round-boundary>:<this|next>` (~30-min TTL) and serves it to every other
  device — and every repeat tap — within that round, so it's **one paid read per round per coin no
  matter how many devices are open**. The app's "read now contradicts the market" catch-up sends
  `fresh: true` to bypass the cache and then overwrites the shared entry (so the one catch-up benefits
  everyone). (POST handler in `worker.js`.)
- **Shared read piggybacks the free crowd poll (cross-device convergence):** the `noAI` crowd
  response **also carries the round's cached AI read** (a free KV read) plus its write timestamp
  `aiTs`, so a device that never pays for its own read still **converges on the shared one** on its
  regular ~1/min poll. The app adopts it only when `aiTs` is **newer** than the read it already
  holds (newer-read-wins), so a poll can't revert a fresher local/manual read. Both the `noAI`
  branch and the full read path return `aiTs`; the full path writes it as `ts` when it caches.
  Net: identical AI input on every device, still **one paid call per round**. (`noAI` branch +
  `airead:` write in `worker.js`; `applyCrowd` in `eth-tracker.html`.)

## (Optional) Crowd odds — Kalshi series tickers
Without these, the AI still works; the **Crowd** line just shows `n/a`.
Add Text vars `KALSHI_SERIES_ETH`, `KALSHI_SERIES_BTC`, `KALSHI_SERIES_SOL` set to the
15-minute series tickers (find them at kalshi.com/markets or
`https://external-api.kalshi.com/trade-api/v2/series?category=Crypto`). The Worker auto-picks
the nearest-expiry open market in that series.

## 24/7 auto-tracker (cron) — free, no AI spend
The root `wrangler.toml` adds **two cron triggers** (`[triggers] crons = ["*/15 * * * *", "8,23,38,53 * * * *"]`).
The `*/15` trigger is the auto-tracker loop below; the `8,23,38,53` trigger is the near-lock "bet now" scanner
(`scanLateLocks`, ~7 min before each close — see Notifications). Every
15 minutes the Worker's `scheduled` handler makes a market-anchored pick for each coin that has
a `KALSHI_SERIES_*` set — using **only free data** (Kalshi price + Coinbase 1-min momentum +
order book, **no LLM**) — grades the previous round (settling on a **~60-second average** of trades
over the final minute, the way Kalshi/CF Benchmarks settle, not a single tick), and stores the whole
tracker in **KV** as a single consolidated record (read back per-coin via `?picks=COIN`).
- **Costs nothing beyond the free tier:** no Anthropic calls on the schedule. The cron writes
  **one** KV key per run (all coins + the pooled model together), so it stays well under the free
  tier's limit of **1,000 KV writes/day** — even running 24/7 it's ~96 writes/day.
- **Cross-asset feature is free:** the per-coin model reads a `marketMom` feature (net momentum of
  the *other* coins — crypto moves together, BTC leads). It **reuses momentum already computed each
  run** (the cron processes **BTC first** so the others get its fresh read), so it adds **zero extra
  Coinbase/Kalshi subrequests** — no impact on the free-tier per-invocation budget.
- **Read it:** open `…workers.dev/?picks=ETH` (or `?picks` for all coins) — latest pick, rolling
  history, and hit rate. The app shows this in its **24/7 Auto-Tracker** panel and feeds the
  record into the AI prompt.
- **Which coins are tracked:** **all of `AUTO_COINS`** (the paid plan has the subrequest headroom).
  Coins with a `KALSHI_SERIES_*` grade against Kalshi's settled result; the rest are **self-graded**
  on the Coinbase close vs the round's open (they skip the Kalshi crowd fetch, so no extra Kalshi
  load). `?best` returns the live `tracked` list.
- **After deploying,** confirm the schedule under the Worker → **Triggers** tab.
- Uses the same **`CROWD_KV`** namespace already bound for the crowd cache — nothing extra to set up.

### The pick algorithm (`freePick`), kept on record

The 24/7 tracker's pick is a **deterministic, no-LLM blend**. Per coin, per round:

**Inputs**
- `crowdOverPct` — Kalshi market's implied P(OVER), 0–100
- `mom` — 1-min momentum (signed log-return drift); `sig` — per-minute return volatility (σ)
- `obi` — order-book imbalance within ±0.15% of mid (−1 sell-heavy … +1 buy-heavy)
- `modelOver` — the learned per-coin logistic model's P(OVER)
- `calib` — calibration map (scored, **not** applied by default: `CALIBRATE_PICKS = false`)

**Each input becomes one P(OVER) "read" with a fixed weight** (missing inputs drop out and the weights renormalize):

| Read | Formula → P(OVER) | Weight |
|---|---|---|
| **Crowd** (market) | `favLongshotAdj(clamp(crowdOverPct/100, .02, .98))` | **0.55** |
| **Momentum** — *ride* (\|z\| < 2) | `clamp(0.5 + 0.5·tanh(mom·120), .40, .60)` | 0.15 |
| **Momentum** — *panic-fade* (\|z\| ≥ 2) | `clamp(0.5 − sign(z)·(.05 + .09·s), .38, .62)` | 0.18 |
| **Order book** | `clamp(0.5 + 0.5·tanh(2·obi), .30, .70)` | 0.15 |
| **Learned model** | `clamp(modelOver, .05, .95)` | 0.20 |

where `z = mom·3.16/sig` (momentum in σ units) and `s = min(1, (|z|−2)/2)`.

- **`favLongshotAdj(p)`** corrects the favourite-longshot bias: for a confident read (`|p−0.5| ≥ 0.06`) it pushes `p` *further* from 0.5 by `clamp((p−0.5)·0.12, ±0.05)` — firm up favorites, never chase the cheap longshot. Near 50/50 it does nothing.
- **Panic-fade vs ride:** a ≈2σ move is treated as an over-reaction and *faded*; a moderate drift is *ridden*.

**Blend:** `pRaw = Σ(pᵢ·wᵢ) / Σwᵢ`. The pick uses `pRaw` (the RAW model).

**Confluence:** `dir = sign(pRaw − 0.5)`; `conf =` (weight of reads leaning the same way as `dir`, past a 0.005 margin) ÷ (total weight); `agree =` how many reads do.

**Commit / SKIP gate:** `band = 0.10 + 0.10·(1 − conf)`
- `pRaw ≥ 0.5 + band` → **OVER**  ·  `pRaw ≤ 0.5 − band` → **UNDER**  ·  otherwise → **SKIP**

So fully-aligned reads commit past **±0.10**; fully-split reads need **±0.20**. It SKIPs the majority *by design* — that selectivity is the edge.

**Calibration-band skip gate (`bandEdgeOK`, accuracy #2):** after the commit gate above, a non-SKIP side is *only kept* if **this coin's graded rounds whose `pRaw` sat in the same ±8-pt band have actually cleared ~break-even** — `(hit + 0.5) / (n + 1) ≥ 0.515`. A band that's only ever been a coin-flip is downgraded to **SKIP** (its "edge" was noise). Inert until a band has **≥ 15** graded rounds, so it never fires on thin evidence; it can only ever skip *more*, so it can't hurt the measured record. Mirrors the app's `bandEdgeOK`, so the scoreboard measures the same discipline the live pick uses. *(The app's two other accuracy passes are deliberately app-only: #1 settlement-aware sharpens the live final-2-min read but the Worker locks at open and never re-picks; #3 regime needs the live tick stream the Worker doesn't have.)*

**Output:** `{ side, prob = round(pRaw·100), conf, agree }`.

**Lock & grade (the honesty layer):** one pick per round, never overwritten (`!rec.pending`); only locks a still-open round (≥ 6 min left **and** odds 3–97%); graded on the finalized boundary candle, then **reconciled to Kalshi's settled result** — the definitive outcome, exactly what Robinhood pays (a separate **confirmed hit-rate** counts only Kalshi-settled rounds). If Kalshi is unreachable, a self-anchored fallback grades on the Coinbase close vs the round's open (flagged *self-tracked*, never counted as confirmed).

*(Source of truth: `freePick`, `bandEdgeOK`, `favLongshotAdj`, `reconcileKalshi` in `worker.js` — update this table if those change.)*

### Backups — the learned state is snapshotted hourly *and* daily

The whole tracker (every coin's model + history + the pooled model) lives in **one** KV record
(`auto:state`), overwritten each cron run. So that a bad write or an accidental wipe can't erase the
learning, the cron keeps **two rolling backup rings**:

- **Hourly** — once per clock hour into `auto:state:hourly:<0-23>` (the **last 24 hours**), gated by `lastBackupHour`.
- **Daily** — once per UTC day into `auto:state:backup:<0-6>` (the **last 7 days**), gated by `lastBackupDay`.

So you can roll back to within **an hour** over the last day, or within **a day** over the last week.
The cost is fixed and tiny: **24 + 1 = 25 extra KV writes/day** on top of the cron's 96 → **~121/day**,
against the free tier's **1,000/day**. (Storage: ~32 copies of a small record — trivial vs the 1 GB free allowance.)

- **List them:** `…workers.dev/?backups` → `hourly` and `daily` arrays; each slot's timestamp, coin count and model size (`modelN`), plus the live model size to compare against.
- **Restore one:** `…workers.dev/?restore=hourly:<0-23>` or `?restore=daily:<0-6>` → copies that slot back over the live state (find the slot with `?backups` first). **This overwrites the current record** — recovery only.
- **Lock them down:** both honor `ACCESS_TOKEN` exactly like `?reset` — set that secret and pass `&token=…`, especially for `?restore`.
- Purely protective: the backup path only ever **copies** the record — it never reads into, tunes, or touches a pick. (`maybeBackup` in `worker.js`.)

## Phone alerts on a high-confidence pick (optional, free)
Get a push **on your phone even when the app is closed** the moment a coin opens a
**high-confidence, non-SKIP** pick (≥75% and ≥3 independent reads agreeing).

**Recommended — Discord webhook (most reliable).** ntfy.sh's free server often returns **429** from
Cloudflare Workers (shared IPs) *even with a token*, so Discord is the dependable path:
1. In Discord: pick a channel → **Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL**.
2. Worker → **Settings → Variables and Secrets** → add a **Secret** **`DISCORD_WEBHOOK`** = that URL → **Deploy**.
3. Test: open `…workers.dev/?testpush=discord` — it posts to your channel and returns `{"discord":{"sent":true}}`. Real pings then arrive automatically. (`pushDiscord` in `worker.js`.)

**Three kinds of ping fire automatically** once a channel is set (all from one read-only `scanLateLocks` pass on the `:08/:23/:38/:53` cron, except the open-pick one):
- **Forming favorite — "time to act"** — ≈7 min before each close, pings when a side is in the **forming-favorite band that still PAYS — `LOCK_MIN_PROB` (default 62% ≈ 1.6x) to `LOCK_MAX_PROB` (default 74% ≈ 1.35x)**. This was deliberately moved **down** from the old 75–92% near-lock band: a side priced ≥ ~75% pays ≤1.3x **and** the round's nearly over — "too late, too little." The new band catches a side **while it's still forming AND still pays**, with time to place it. Skimmable message — *"Predict (ETH - Over 1.5x)"*. (`scanLateLocks`.)
- **Value entry "longshot about to cross"** — same scan: pings when price is on one side, **momentum is carrying it toward the line**, and the side it's heading to is still a **big-multiplier underdog (≥ 2.0x)**. This is the *profit* signal — higher variance, so size small. (Mirrors the app's `primeCheck` cue, pushed even with the app closed.)
- **Open pick (earliest)** — the regular 15-min cron pings the **moment a round opens** with the tracker's committed pick (≈13 min to act). Loosened so it actually fires: **`NTFY_MIN_PROB` default 68%** and **`NTFY_MIN_AGREE` default 2** (was 75% / 3 — too strict, almost never qualified). Still **skips dead-money** sides (≥ `NTFY_DEAD_PCT`, default 90%) and shows the multiplier. (`notifyHotPicks`.)
- **STRONG — BET** — a louder variant of the open-pick ping: when that strong pick is **also momentum-confirmed** (short-term move already heading the pick's way — the server-side analog of the app's "app + AI + momentum all line up"), it goes out as a distinct **"🔥 STRONG — BET (SOL - Over)"** alert instead of the normal "Predict (…)". This is the native notification the **app shows phones/tablets in place of the desktop banner**, and it reaches you even with the app closed. (`notifyHotPicks`.)

Make sure your Discord channel's **notifications are on** (and the Discord phone app can push) so these reach your phone.

**Or use ntfy** (works only if the Worker's shared IP isn't rate-limited):
1. Install the free **ntfy** app (iOS/Android) and pick a hard-to-guess **topic** name (e.g.
   `crypto-tracker-9f3k2`). Subscribe to it in the app.
2. In the Worker → **Settings → Variables and Secrets**, add a Text var **`NTFY_TOPIC`** = that
   topic name (or a full `https://ntfy.sh/<topic>` URL if you self-host). Optional **`NTFY_MIN_PROB`**
   (default `75`) to tune the bar, and **`NTFY_DEAD_PCT`** (default `90`) — the open-pick ping skips any
   side the market already prices at/above this (it pays ~1.0x, so there's no profit to alert on).
   - **Strongly recommended: also set `NTFY_TOKEN`.** Cloudflare Workers send from shared IPs, and the
     free ntfy.sh server rate-limits by IP — so anonymous pushes from a Worker frequently get
     **HTTP 429** and silently fail. Fix: create a free account at **ntfy.sh** → **Account → Access
     tokens → Create token**, then add it as a **Secret** named `NTFY_TOKEN`. The Worker sends it as
     `Authorization: Bearer …`, moving the rate limit to your account so pushes go through reliably.
     (Subscribe to your topic in the app while signed in to that same account.)
3. Save. On the next 15-min cron that produces a strong pick, you'll get a push like
   *"ETH OVER 78% · SOL UNDER 80% — bet this 15-min round"*. One push per coin per round; SKIPs never
   ping you. (`notifyHotPicks` in `worker.js`.) The app also has an in-app **🔔 alert toggle** in
   *AI Co-Pilot setup* for when a tab is open.
4. **Test it without waiting for a real pick:** open
   `https://<your-worker>/?testpush=<your exact NTFY_TOPIC>` in a browser. The Worker fires one ntfy
   push straight to your phone and returns `{ "sent": true }`. It's gated by the topic itself (which
   already lets anyone publish to the channel), so it adds no new secret. Strong picks are rare (~8% of
   rounds), so this is the quick way to confirm the whole chain works end-to-end.

## Connect the app
Open the live app → **AI Co-Pilot** → paste the Worker URL → **Save & Get AI Read**.
It saves on your device. The crowd refreshes for free; the paid AI read runs at most once per
round while the tab is open (tune it with the **AI spend** setting).

## Optional hardening
- **Abuse guard:** add a Secret `ACCESS_TOKEN`, then call the Worker as `…workers.dev/?token=VALUE`.
- **Lock CORS:** in `worker.js`, change `Access-Control-Allow-Origin: "*"` to `https://graphicaljerry.github.io`.
