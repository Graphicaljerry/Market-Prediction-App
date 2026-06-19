# AI Co-Pilot Worker — setup (≈10 minutes, dashboard only, no CLI)

This little Cloudflare Worker is the bridge that lets the tracker show **live Kalshi
crowd odds** and an **AI read** from Claude. Both need a server (a browser can't reach
Kalshi, and your API key must stay secret), so the Worker does that part.

You'll need:
- A **Cloudflare** account (free): https://dash.cloudflare.com/sign-up
- An **Anthropic API key**: https://console.anthropic.com → API Keys (pay-as-you-go; each AI read costs ~1–3¢)
- *(Optional)* Kalshi 15-min **series tickers** for crowd odds (see step 5)

---

## 1. Create the Worker
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Give it a name (e.g. `eth-copilot`) → **Deploy** (it ships a hello-world).

## 2. Paste the code
1. Click **Edit code**.
2. Delete the sample, paste the entire contents of [`worker.js`](./worker.js).
3. **Deploy** (top right).

## 3. Add your Anthropic key (required)
1. Worker → **Settings** → **Variables and Secrets** → **Add**.
2. Type **Secret**, name **`ANTHROPIC_API_KEY`**, value = your key → **Save and deploy**.

## 4. Copy the Worker URL
On the Worker's page it looks like `https://eth-copilot.YOUR-SUBDOMAIN.workers.dev`. Copy it.

## 5. (Optional) Crowd odds — add Kalshi series tickers
Without these, the AI read still works; the **Crowd** line just shows `n/a`.
1. Find the 15-minute series ticker for each coin on Kalshi (browse the crypto
   markets at https://kalshi.com/markets, or query
   `https://external-api.kalshi.com/trade-api/v2/series?category=Crypto`).
2. Back in **Variables and Secrets**, add **Text** variables:
   - `KALSHI_SERIES_ETH` = the ETH 15-min series ticker
   - `KALSHI_SERIES_BTC` = the BTC one
   - `KALSHI_SERIES_SOL` = the SOL one
3. **Save and deploy.** (The Worker auto-picks the nearest-expiry open market in that series.)

> Crowd note: it reads the market's `yes` mid-price as the implied probability that
> price finishes **over** the strike. If a particular series is framed the opposite way,
> the OVER% would be inverted — tell me the ticker and I'll adjust the mapping.

## 6. Connect the app
Open the live app → **AI Co-Pilot** → paste the Worker URL → **Save & Get AI Read**.
It saves on your device and auto-refreshes once per 15-minute round.

---

## Optional hardening
- **Abuse guard:** add a Secret `ACCESS_TOKEN`; then call the Worker as
  `https://…workers.dev/?token=YOUR_VALUE`. (Tell me and I'll have the app append it.)
- **Lock CORS:** in `worker.js`, change `Access-Control-Allow-Origin: "*"` to your exact
  Pages origin (`https://graphicaljerry.github.io`).
- **Cost control:** the AI read fires once per round (not every tick); set spend limits in
  the Anthropic console if you want a hard cap.

## Local dev (optional, needs Node + Wrangler)
```bash
npm i -g wrangler
wrangler login
wrangler deploy            # from this folder, with a wrangler.toml of your own
```
The dashboard flow above is the simplest path and needs none of this.
