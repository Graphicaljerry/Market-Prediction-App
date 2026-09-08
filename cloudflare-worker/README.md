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
  `{ "setModel": "…" }`. (r94: ids may now contain `/` — Groq namespaces its catalogue as
  `meta-llama/…`, `openai/gpt-oss-…` — which the old validation pattern rejected outright, so those
  models could never sync. A shared id the local dropdown doesn't list is now adopted and added
  rather than ignored.) Note a *paid* model picked anywhere applies everywhere (the other devices'
  reads bill for it); the **spend mode** (Smart / Every-round / Manual) stays per-device.
  (`syncSharedModel` / `pushSharedModel` in the app.)
- **The model list updates itself (r94).** The dropdown used to be five hard-coded options, so every
  time a provider shipped something new the app quietly kept using last year's model. Now the Worker
  asks each provider what it currently serves — `GET /v1/models` (Anthropic), `GET /v1beta/models`
  (Google), `GET /openai/v1/models` (Groq) — merges the answers, and the app builds its picker from
  that. It only queries providers whose key is set, and list endpoints are **not** inference calls,
  so this costs nothing on any provider, free tier included.
  - **`?models`** returns the catalogue: `{ok, provider, ts, cached, models:[{id,label,provider,tier}], errors}`.
    **`?models=refresh`** forces a re-fetch past the cache.
  - **Cached ~6h** in KV (`cfg:models`) and warmed by the 15-min cron, so neither the dropdown nor an
    AI read ever waits on three provider calls. If a provider is down its failure is reported in
    `errors` and the others still list; if *all* of them fail, the last good list is served and
    flagged `stale`. Better a slightly old list than an empty one.
  - **Not chat-capable → not listed.** Embeddings, image/video, speech and safety-classifier models
    are filtered out; picking one would just break the read. For Google the test **fails open**: a
    model is dropped only if it *explicitly* advertises its methods without `generateContent`. A
    strict "must declare it" test means that the day Google omits or renames that field, every
    Gemini model disappears and the provider silently vanishes from the picker.
  - **Every provider is accounted for, every time.** The response carries
    `providers: {anthropic|gemini|groq: {key, ok, count, why}}` — including the ones that weren't
    called. Without it, *no key set* and *key works but returned nothing* look identical from the
    app: the provider is just missing, with nothing to explain it. **If a provider isn't in your
    dropdown, open `?models` and read its `why`.** The most common answer is that its key isn't set
    in the Worker — free-tier Gemini and Groq each need their own key (`GEMINI_API_KEY`,
    `GROQ_API_KEY`); an Anthropic key alone only ever lists Claude models.
  - **Paginated lists are followed** — Anthropic's `has_more`/`last_id` and Google's
    `nextPageToken`, bounded to 6 pages.
  - **Adding or removing a key takes effect immediately.** The cached list records which providers
    had a key when it was built; if that set no longer matches the environment, the cache is
    rebuilt on the spot rather than waiting out the 6h TTL. So setting `GEMINI_API_KEY` in the
    dashboard puts Gemini in the picker on the next app load — no redeploy, no `?models=refresh`,
    no waiting. Revoking a key drops that provider just as fast.
  - **Self-healing model ids.** If the model about to be called is no longer in its provider's list,
    it has been retired and calling it would 404 — the round would get **no AI read at all**. The
    Worker substitutes the newest model in the same family (a retired `…-sonnet-4-6` → the newest
    sonnet, a retired `…-flash` → the newest flash) so the cost/capability tier you chose is kept,
    and only falls back to "newest overall" when there's no family match. It does nothing while the
    catalogue is unavailable. (`liveModel` in `worker.js`.)
- **Keep options open:** add more than one key and flip between them by setting
  `AI_PROVIDER` = `gemini` | `groq` | `anthropic`. No redeploy of code needed — just save the var.
- Override the model with `AI_MODEL` if you want. The built-in defaults (`claude-haiku-4-5`,
  `gemini-2.0-flash`, `llama-3.3-70b-versatile`) are now **last-resort only** — they apply before the
  first catalogue refresh lands, and are themselves subject to the retirement substitution above. A
  model id that doesn't match the active provider is ignored (so a stale dropdown choice can't 404
  the read); the response's `provider` field tells the app which brain answered, and the app labels
  the read **AI · Gemini / Claude / Groq** to match.
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
  If the current round has no `:t` entry yet, the `noAI` branch **falls back to the previous
  boundary's `:n` key** — that's where the 2-min-lock read about *this* round lives — so the shared
  read reaches every device for the whole round it's about, not just during the lock window (r80).
  Net: identical AI input on every device, still **one paid call per round**. (`noAI` branch +
  `airead:` write in `worker.js`; `applyCrowd` in `eth-tracker.html`.)

## ⚠️ (Do this first) Kalshi API key — the single biggest accuracy lever

**The key is free.** Kalshi charges nothing for API access — it comes with the account you already
have, and **read-only access doesn't even require the account to be funded**. You only ever pay the
normal per-trade fee on trades *you* place; this Worker never places one (it only reads prices and
settled results). The free "Basic" tier allows ~200 reads/second — the tracker uses roughly 1 per
15 minutes per coin.

**Why it matters more than anything else in the app.** Kalshi rate-limits Cloudflare's **shared**
egress IPs, and it tightened that throttling around **Jul 31, 2026**: crowd coverage fell from ~50%
of rounds to **~25%**, and because the tracker refuses to bet without a live crowd price (r85), its
commit rate fell **14% → 8%**. It is starving. Worse, without Kalshi's own settled result **63% of
rounds get graded by our Coinbase proxy**, which the month audit measured as calling the wrong side
**5.8% of the time overall** (12.4% on BNB). Authenticated requests are limited **per account**
instead of per IP, which fixes both at once.

1. On **kalshi.com** → **Account → Settings → API keys → Create key** (on some builds: **Profile →
   API**). It shows you two things: a **Key ID** (a UUID) and an **RSA private key** file (`.pem`).
   **Download the private key — Kalshi shows it exactly once.**
2. In Cloudflare: **Workers & Pages → your Worker → Settings → Variables and Secrets → Add**, type
   **Secret** (not Text — Secrets are write-only and never readable back), twice:
   - `KALSHI_API_KEY_ID` = the Key ID
   - `KALSHI_PRIVATE_KEY` = the **entire** PEM text, including the
     `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Paste it as-is; line breaks
     are fine.
3. **Verify it: open `…workers.dev/?authcheck`.** It signs a request to a private Kalshi endpoint —
   which only succeeds if the signature genuinely verifies — and reports back:
   - `{"ok":true, …}` → the key works; requests are authenticated from now on.
   - `"importFailed":true` → the PEM was pasted wrong (usually a missing BEGIN/END line).
   - `httpStatus: 401` → the Key ID and private key aren't from the same key pair; re-create and
     re-paste both.
   - `secrets:{…false}` → that Secret didn't save. `?authcheck` **never returns the key itself** — only
     booleans for whether each secret exists.

No redeploy is needed; the next cron picks it up. Every Kalshi request is then signed (RSA-PSS/SHA-256
over timestamp+method+path, Kalshi's standard scheme). No key → anonymous requests exactly as before;
a malformed key **falls back to anonymous** rather than ever stalling a pick.
(`kalshiAuthHeaders` + the `?authcheck` route in `worker.js`.)

**Keep the key out of Git.** It belongs only in the Cloudflare dashboard as a Secret — never in
`wrangler.toml`, never in a commit. If it ever leaks, delete the key on kalshi.com and make a new one.

## (Optional) Crowd odds — Kalshi series tickers
Without these, the AI still works; the **Crowd** line just shows `n/a`.
Add Text vars `KALSHI_SERIES_ETH`, `KALSHI_SERIES_BTC`, `KALSHI_SERIES_SOL` set to the
15-minute series tickers (find them at kalshi.com/markets or
`https://external-api.kalshi.com/trade-api/v2/series?category=Crypto`). The Worker auto-picks
the nearest-expiry open market in that series.

## 24/7 auto-tracker (cron) — free, no AI spend
The root `wrangler.toml` adds **two cron triggers** (`[triggers] crons = ["4,19,34,49 * * * *", "8,23,38,53 * * * *"]`).
The `4,19,34,49` trigger is the auto-tracker loop below — it fires **four minutes into each round**, not on the
boundary, because the Sept-2026 audit of 21,412 archived rounds found the same strong favorite won far more often
when locked with 10–12 minutes left than with 12–14 (the market is sharper a few minutes in; revert to `*/15` to
restore the old timing exactly). The `8,23,38,53` trigger is the near-lock "bet now" scanner
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
- **Export it:** add `&dl=1` (e.g. `…workers.dev/?picks&dl=1`) to download the same data as a `.json` file — the one-tap way to save the record on iPhone/iPad (lands in Files) for offline analysis.
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
| **Order book** | `clamp(0.5 + 0.5·tanh(2·obi), .30, .70)` | 0.05 — demoted from 0.15 (2026-07 audit: sign-hit 47.2% over 2,324 rounds, slightly inverted) |
| **Learned model** | `clamp(modelOver, .05, .95)` | 0.20 |

where `z = mom·3.16/sig` (momentum in σ units) and `s = min(1, (|z|−2)/2)`.

- **`favLongshotAdj(p)`** corrects the favourite-longshot bias: for a confident read (`|p−0.5| ≥ 0.06`) it pushes `p` *further* from 0.5 by `clamp((p−0.5)·0.12, ±0.05)` — firm up favorites, never chase the cheap longshot. Near 50/50 it does nothing.
- **Panic-fade vs ride:** a ≈2σ move is treated as an over-reaction and *faded*; a moderate drift is *ridden*.

**Blend:** `pRaw = Σ(pᵢ·wᵢ) / Σwᵢ`. The pick uses `pRaw` (the RAW model).

**Confluence:** `dir = sign(pRaw − 0.5)`; `conf =` (weight of reads leaning the same way as `dir`, past a 0.005 margin) ÷ (total weight); `agree =` how many reads do.

**Commit / SKIP gate:** `band = 0.12 + 0.10·(1 − conf)`
- `pRaw ≥ 0.5 + band` → **OVER**  ·  `pRaw ≤ 0.5 − band` → **UNDER**  ·  otherwise → **SKIP**

So fully-aligned reads commit past **±0.12**; fully-split reads need **±0.22**. It SKIPs the majority *by design* — that selectivity is the edge.

**Floor raised 0.10 → 0.12 (r89)** on the full-month audit of 2,290 committed picks. Sorted by how far the blend sat from 50/50, the bottom slice was noise and everything above it was not:

| edge \|p−50\| | hit rate | n |
|---|---|---|
| **10–12** | **54.7%** — a coin flip, loses to fees | 86 |
| 12–16 | 69.5% | 810 |
| 16–22 | 77.3% | 862 |
| 22+ | 86.0% | 477 |

Dropping the 10–12 slice costs **3.8% of bet volume** and lifts the committed record **75.8% → 76.3%**. It's a small sample (n=86), so this is a deliberately modest, reversible trim — restore `0.10` to revert exactly.

**Crowd gate (r85, from the 2026-07 data audit):** a non-SKIP side is only kept if the pick was made **with a live crowd price**. Audited: commits made with the crowd present hit **40/50 (80%)**; blind commits (momentum + model only) went **6/12 — a coin flip**. A crowd-less round still logs its lean (the shadow record) and still trains the model — it just can't claim a bet. Like the band gate below, it can only ever skip *more*.

**Calibration-band skip gate (`bandEdgeOK`, accuracy #2):** after the commit gate above, a non-SKIP side is *only kept* if **this coin's graded rounds whose `pRaw` sat in the same ±8-pt band have actually cleared ~break-even** — `(hit + 0.5) / (n + 1) ≥ 0.515`. A band that's only ever been a coin-flip is downgraded to **SKIP** (its "edge" was noise). Inert until a band has **≥ 15** graded rounds, so it never fires on thin evidence; it can only ever skip *more*, so it can't hurt the measured record. Mirrors the app's `bandEdgeOK`, so the scoreboard measures the same discipline the live pick uses. *(The app's two other accuracy passes are deliberately app-only: #1 settlement-aware sharpens the live final-2-min read but the Worker locks at open and never re-picks; #3 regime needs the live tick stream the Worker doesn't have.)*

**Output:** `{ side, prob = round(pRaw·100), conf, agree }`.

**Lock & grade (the honesty layer):** one pick per round, never overwritten (`!rec.pending`); only locks a still-open round (≥ 6 min left **and** odds 3–97%); graded on the ~60-sec Coinbase trade average at the boundary (candle close as fallback), then **reconciled to Kalshi's settled result** — the definitive outcome, exactly what Robinhood pays (a separate **confirmed hit-rate** counts only Kalshi-settled rounds). If Kalshi is unreachable, a self-anchored fallback grades on the Coinbase close vs the round's open (flagged *self-tracked*, never counted as confirmed).

**"Too close to call" — void grading (r89, `VOID_MARGIN_PCT`, default `0.02`%).** A round whose proxy settle lands within that % of the line is recorded **void** (`void: true`, `actual: null`, the side it *would* have said kept as `provisional`) instead of graded. The month audit measured the proxy against the 7,378 rounds Kalshi later confirmed and found the error is overwhelmingly concentrated in that sliver:

| \|margin\| we saw at grade time | proxy called the WRONG side | n |
|---|---|---|
| 0.00–0.01% | **38.8%** | 400 |
| 0.01–0.02% | **24.7%** | 397 |
| 0.02–0.03% | 14.0% | 449 |
| 0.05–0.10% | 1.9% | 1,619 |
| 0.10%+ | 0.3% | 3,691 |

Those ±0.02% rounds are ~11% of the record but carry **60% of every grading error**; excluding them takes the proxy's error rate from **5.8% → 2.6%**. A void round is skipped by every tally (**not** counted as a loss) and by `learnFromRound`, so the model never trains on a label that's wrong a quarter of the time; the app shows it as a *"Too close · void"* row. A round with a Kalshi ticker is still upgraded later — `reconcileKalshi` clears the void and grades it definitively. Set `VOID_MARGIN_PCT=0` to grade everything the old way.

**Second chance + shells (r85):** a brand-new Kalshi market often shows junk/TBD quotes for its first minute or two, which used to strand ~78% of rounds on the self-anchored path (2026-07 audit; worst at :00 slots — 9% Kalshi coverage). Now: `fetchCrowd` returns the market's **shell** (ticker/close/strike, `overPct: null`) instead of nothing, so a self-anchored round still gets its **ticker attached** and reconciles to Kalshi later; and if any series-coin locked without a crowd price, the cron waits **~75s** and **re-locks that pick with the crowd** (only when ≥10 min still remain — never near a close; a failed retry keeps the original pick; a retry that lands a different round is discarded). Shells are never cached over a last-good price. New per-round record fields: `crowd` (raw crowd % at lock), `kStrike` (Kalshi's posted strike when we self-anchored), `pxClose` (the Coinbase proxy close, preserved when Kalshi's settle overwrites `close`), `retried`.

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

### Permanent round archive (r85) — nothing is destroyed anymore

The live record keeps only the newest **300 rounds per coin** (~3 days) — the 2026-07 audit had to work
inside that single window because everything older had been silently deleted. Now every graded round is
**appended exactly once to a permanent per-day KV key** (`arch:YYYY-MM-DD`, no expiry), ~3 hours after it
settles so Kalshi reconciliation has converged first. Rows are the full round record plus the audit's new
fields (`crowd`, `kStrike`, `pxClose`, `retried`, and since r89 `void`/`provisional`) — everything a future
audit needs to measure calibration, EV net of fees, and proxy-vs-index drift over months instead of days.
The Aug-2026 month audit ran off exactly these files: 40 days, **21,412 rounds**.

- **List days:** `…workers.dev/?archive` → `{ days: ["2026-07-11", …] }`
- **Fetch a day:** `…workers.dev/?archive=2026-07-11` (add `&dl=1` to download the `.json`)
- **Cost:** ~1 extra KV write per cron (~96/day; the first few runs also drain the pre-existing backlog in
  400-round batches). Purely additive: it only **copies** graded rounds — never reads into or touches a pick.
  (`archiveRounds` in `worker.js`.)

## Phone alerts on a high-confidence pick (optional, free)
Get a push **on your phone even when the app is closed** the moment a coin opens a
**high-confidence, non-SKIP** pick (≥75% and ≥3 independent reads agreeing).

**Recommended — Discord webhook (most reliable).** ntfy.sh's free server often returns **429** from
Cloudflare Workers (shared IPs) *even with a token*, so Discord is the dependable path:
1. In Discord: pick a channel → **Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL**.
2. Worker → **Settings → Variables and Secrets** → add a **Secret** **`DISCORD_WEBHOOK`** = that URL → **Deploy**.
3. Test: open `…workers.dev/?testpush=1&token=<ACCESS_TOKEN>` (r100: the old `?testpush=discord` needed no secret and was removed) — it posts to your channel and returns `{"discord":{"sent":true}}`. Real pings then arrive automatically. (`pushDiscord` in `worker.js`.)

**By default (r86.1) exactly ONE kind of ping fires: the ⭐ star bet** — the user asked for star-only
notifications. The other ping types below stay in the code but are OFF unless you set a Text var
**`PING_MODE`** = `all` (default `star`):
- **⭐ Star bet — "A-grade setup, time to act" (the default, and the only default ping)** — ≈7 min before each close, fires when a side is in the favorite band — **`LOCK_MIN_PROB` (default 73% ≈ 1.37x) to `LOCK_MAX_PROB` (default 90% ≈ 1.11x), bounds inclusive** — **AND the 24/7 tracker committed that same side this round**. Message: *"⭐ Star bet (ETH - Over 1.5x)"*. **Band re-centered 65–80 → 73–90 in r89** on the full-month audit (21,412 rounds; 7,349 crowd-priced): the old band's lower half *lost money* — favorites bought at 65–70¢ won only 67.5% and went **−1.4¢ per $** after fees — while 75–90¢ won ~84%. Star-plus-commit went **74.4% / +1.7¢ per $ → 82.9% / +3.7¢ per $**, firing ~30×/day instead of ~48×. Above 90¢ stays excluded: the payout is too thin (90–100¢ ran −8.5¢ per $). The tracker-commit gate is what separates the star from the raw band, which without it managed only 65.7% at the same prices. One read-only state load powers the gate; if it fails, favorite pings stay off (a missed ping costs nothing; a bad ping costs money). (`scanLateLocks`.)
  - **Dead-market gate — retired in r89, default OFF.** `DEAD_MARGIN_PCT` now defaults to `0`. It was added in r86 on two bad days' evidence; across the full month, band favorites won **74.9% in "dead" markets vs 74.2% in "alive"** ones — quiet chop simply didn't hurt them, so the gate was only suppressing good stars. Set `DEAD_MARGIN_PCT=0.08` (a Text var — no deploy needed) to bring it back: it then skips a coin whose last ~8 graded rounds settled with a median |margin| below that value.
- **Value entry "longshot about to cross"** *(`PING_MODE=all` only — the audit found longshots lose ~9%/bet)* — same scan: pings when price is on one side, **momentum is carrying it toward the line**, and the side it's heading to is still a **big-multiplier underdog (≥ 2.0x)**. This is the *profit* signal — higher variance, so size small. (Mirrors the app's `primeCheck` cue, pushed even with the app closed.)
- **Open pick (earliest)** *(`PING_MODE=all` only)* — the regular 15-min cron pings the **moment a round opens** with the tracker's committed pick (≈13 min to act). Loosened so it actually fires: **`NTFY_MIN_PROB` default 68%** and **`NTFY_MIN_AGREE` default 2** (was 75% / 3 — too strict, almost never qualified). Still **skips dead-money** sides (≥ `NTFY_DEAD_PCT`, default 90%) and shows the multiplier. (`notifyHotPicks`.)
- **STRONG — BET** *(`PING_MODE=all` only)* — a louder variant of the open-pick ping: when that strong pick is **also momentum-confirmed** (short-term move already heading the pick's way — the server-side analog of the app's "app + AI + momentum all line up"), it goes out as a distinct **"🔥 STRONG — BET (SOL - Over)"** alert instead of the normal "Predict (…)". This is the native notification the **app shows phones/tablets in place of the desktop banner**, and it reaches you even with the app closed. (`notifyHotPicks`.)

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

## Hardening (r100 — some of it is no longer optional)

The Worker URL is baked into a public web page, so anyone on the internet can call it. The Sept-2026
security audit found that, with no `ACCESS_TOKEN` set, a stranger could run paid AI reads in a loop, wipe the
learned model with one `?reset=all`, pin every device to the priciest AI model, and fire your Discord webhook
until Discord revoked it. `worker.js` now ships with these guards built in:

- **Token required for anything destructive or costly.** `?reset`, `?restore`, `?backups`, `setModel`,
  `?models=refresh`, `?testpush` and cache-bypassing (`fresh`) AI reads all refuse without
  `?token=<ACCESS_TOKEN>` — even when no token is configured (they answer 401 with a hint). **So set the
  Secret `ACCESS_TOKEN`** and paste the same value into the app's **Settings → AI Co-Pilot setup → Access
  token** field; the app then sends it on every Worker call. Everything read-only (`?picks`, `?crowd`, the
  normal AI read) still works without it, exactly as before.
- **`?testpush=discord` no longer exists.** Use `?testpush=1&token=<ACCESS_TOKEN>` (or the exact ntfy topic, as before).
- **Per-IP rate limits.** Every request is counted per client IP (120/min for reads, 30/min for the AI POST, 5 per
  10 min for anything destructive). Out of the box this is a small in-memory window per Worker isolate — free,
  zero-config, but each isolate counts separately. For a real global limit, add a rate-limit binding named `RL`
  (the commented `[[ratelimits]]` block in `wrangler.toml`); the code uses it automatically when bound.
- **CORS is pinned** to `https://graphicaljerry.github.io` (plus `localhost` / `file://` for previews). Serving the app
  from another origin? Set the plain-text var `ALLOWED_ORIGINS` (comma-separated; `*` to open it back up).
- **Request-size cap** (32 KB) on the AI POST and caps on the prompt's client-supplied lists, so nobody can pad a
  request to run up billed tokens. Provider error bodies now go to the Worker log, not back to the caller.
