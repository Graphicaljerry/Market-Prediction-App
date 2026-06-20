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
| **Claude** (sharpest) | `ANTHROPIC_API_KEY` | console.anthropic.com | ~1–3¢ / read |

- **Keep options open:** add more than one key and flip between them by setting
  `AI_PROVIDER` = `gemini` | `groq` | `anthropic`. No redeploy of code needed — just save the var.
- Override the model with `AI_MODEL` if you want (defaults: `gemini-2.0-flash`,
  `llama-3.3-70b-versatile`, `claude-opus-4-8`).
- **Check it worked:** open the Worker URL in a browser (a GET) — it returns
  `{"ok":true,"provider":"…","model":"…"}` so you can confirm which brain is active.

## B-as-in-budget: cap Claude spend
If you use Claude, set a hard ceiling so it can never surprise you:
- **console.anthropic.com → Settings → Limits / Billing** → set a **monthly spend limit**
  (e.g. $5). The key stops working past that cap.
- The app only calls the AI **once per 15-min round** (not every tick), so usage stays small.

## (Optional) Crowd odds — Kalshi series tickers
Without these, the AI still works; the **Crowd** line just shows `n/a`.
Add Text vars `KALSHI_SERIES_ETH`, `KALSHI_SERIES_BTC`, `KALSHI_SERIES_SOL` set to the
15-minute series tickers (find them at kalshi.com/markets or
`https://external-api.kalshi.com/trade-api/v2/series?category=Crypto`). The Worker auto-picks
the nearest-expiry open market in that series.

## Connect the app
Open the live app → **AI Co-Pilot** → paste the Worker URL → **Save & Get AI Read**.
It saves on your device and auto-refreshes once per 15-minute round.

## Optional hardening
- **Abuse guard:** add a Secret `ACCESS_TOKEN`, then call the Worker as `…workers.dev/?token=VALUE`.
- **Lock CORS:** in `worker.js`, change `Access-Control-Allow-Origin: "*"` to `https://graphicaljerry.github.io`.
