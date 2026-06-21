/**
 * Local visual preview — renders eth-tracker.html in a headless browser and saves a PNG,
 * so the design can be reviewed without a real device. The sandbox can't reach Coinbase/
 * Kalshi, so realistic market data is mocked via request interception (the app's own code
 * then populates everything, including the recommendation glow).
 *
 * One-time setup (per ephemeral session — Chromium downloads from chrome-for-testing):
 *   npm install puppeteer
 * Run:
 *   node tools/preview.js                  # mobile (390px) -> tools/preview.png
 *   node tools/preview.js desktop out.png  # desktop (1280px)
 *
 * Chromium is pulled from storage.googleapis.com/chrome-for-testing-public (reachable even
 * when most egress is locked down); api.exchange.coinbase.com is blocked, hence the mocks.
 */
const path = require("path");
let puppeteer;
try { puppeteer = require("puppeteer"); }
catch (_) { console.error("Missing puppeteer. Run:  npm install puppeteer"); process.exit(2); }

const mode = (process.argv[2] || "mobile").toLowerCase();
const outArg = process.argv[3];
const isMobile = mode !== "desktop";
const out = path.resolve(outArg || path.join(__dirname, "preview.png"));
const htmlPath = path.resolve(__dirname, "..", "eth-tracker.html");

// ---- mock market data (newest-first candles, like Coinbase) ----
const now = Math.floor(Date.now() / 1000), base = 1726.11;
function candles(n, step) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = now - i * step, age = i;
    const trend = base * (1 - 0.012 * (age / n));
    const noise = Math.sin(age / 5) * 2 + Math.cos(age / 13) * 3;
    const c = trend + noise, o = c + Math.sin(age / 4) * 1.5;
    out.push([t, Math.min(o, c) - 1.2, Math.max(o, c) + 1.2, o, c, 1000 + ((age * 97) % 500)]);
  }
  return out;
}
const c900 = candles(150, 900), c60 = candles(90, 60);
const mid = base, bids = [], asks = [];
for (let i = 0; i < 25; i++) {
  bids.push([(mid - 0.1 - i * 0.2).toFixed(2), (6 + ((i * 7) % 4)).toFixed(2), 1]);
  asks.push([(mid + 0.1 + i * 0.2).toFixed(2), (3 + ((i * 5) % 3)).toFixed(2), 1]);
}
const book = { bids, asks };
const CORS = { "Access-Control-Allow-Origin": "*" };

(async () => {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport(isMobile
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = req.url();
    try {
      if (u.includes("/candles")) return req.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(u.includes("granularity=60") ? c60 : c900) });
      if (u.includes("/book")) return req.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(book) });
      req.continue();
    } catch (_) { try { req.continue(); } catch (e) {} }
  });
  // seed some graded rounds so Pick Accuracy + Recent Rounds (and the See-more) populate
  const rounds = [];
  for (let i = 0; i < 14; i++) {
    const over = i % 3 !== 0, correct = i % 4 !== 0;
    const h = (23 - Math.floor(i / 4)), m = [45, 30, 15, 0][i % 4];
    rounds.push({ coin: "ETH", time: (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM"),
      pick: over ? "OVER" : "UNDER", actual: correct ? (over ? "OVER" : "UNDER") : (over ? "UNDER" : "OVER"),
      correct, pct: (Math.sin(i) * 0.3).toFixed(3) * 1, feat: { pOver: 0.6, net: 3 } });
  }
  await page.evaluateOnNewDocument((r) => { try { localStorage.setItem("pickTracker_v1", JSON.stringify(r)); } catch (e) {} }, rounds);
  await page.goto("file://" + htmlPath, { waitUntil: "domcontentloaded", timeout: 20000 });
  await new Promise((r) => setTimeout(r, 7000));   // let fonts/data/render settle
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log("saved " + out + "  (" + (isMobile ? "mobile 390px" : "desktop 1280px") + ")");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
