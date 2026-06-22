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

- **Keep options open:** add more than one key and flip between them by setting
  `AI_PROVIDER` = `gemini` | `groq` | `anthropic`. No redeploy of code needed — just save the var.
- Override the model with `AI_MODEL` if you want (defaults: `claude-haiku-4-5`,
  `gemini-2.0-flash`, `llama-3.3-70b-versatile`). The app also sends its own model choice
  (Haiku by default) and can pick Sonnet/Opus per call from the **AI Co-Pilot** settings.
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

## (Optional) Crowd odds — Kalshi series tickers
Without these, the AI still works; the **Crowd** line just shows `n/a`.
Add Text vars `KALSHI_SERIES_ETH`, `KALSHI_SERIES_BTC`, `KALSHI_SERIES_SOL` set to the
15-minute series tickers (find them at kalshi.com/markets or
`https://external-api.kalshi.com/trade-api/v2/series?category=Crypto`). The Worker auto-picks
the nearest-expiry open market in that series.

## 24/7 auto-tracker (cron) — free, no AI spend
The root `wrangler.toml` adds a **cron trigger** (`[triggers] crons = ["*/15 * * * *"]`). Every
15 minutes the Worker's `scheduled` handler makes a market-anchored pick for each coin that has
a `KALSHI_SERIES_*` set — using **only free data** (Kalshi price + Coinbase 1-min momentum +
order book, **no LLM**) — grades the previous round (settling on a **~60-second average** of trades
over the final minute, the way Kalshi/CF Benchmarks settle, not a single tick), and stores the whole
tracker in **KV** as a single consolidated record (read back per-coin via `?picks=COIN`).
- **Costs nothing beyond the free tier:** no Anthropic calls on the schedule. The cron writes
  **one** KV key per run (all coins + the pooled model together), so it stays well under the free
  tier's limit of **1,000 KV writes/day** — even running 24/7 it's ~96 writes/day.
- **Read it:** open `…workers.dev/?picks=ETH` (or `?picks` for all coins) — latest pick, rolling
  history, and hit rate. The app shows this in its **24/7 Auto-Tracker** panel and feeds the
  record into the AI prompt.
- **After deploying,** confirm the schedule under the Worker → **Triggers** tab.
- Uses the same **`CROWD_KV`** namespace already bound for the crowd cache — nothing extra to set up.

## Connect the app
Open the live app → **AI Co-Pilot** → paste the Worker URL → **Save & Get AI Read**.
It saves on your device. The crowd refreshes for free; the paid AI read runs at most once per
round while the tab is open (tune it with the **AI spend** setting).

## Optional hardening
- **Abuse guard:** add a Secret `ACCESS_TOKEN`, then call the Worker as `…workers.dev/?token=VALUE`.
- **Lock CORS:** in `worker.js`, change `Access-Control-Allow-Origin: "*"` to `https://graphicaljerry.github.io`.
