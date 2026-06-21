/**
 * Cloudflare Worker — AI Co-Pilot for the 15-Min Tracker.
 *
 * Fetches live Kalshi crowd odds (browsers can't, CORS) and asks an LLM to weigh
 * the app's indicators + 7-day track record against the crowd. The LLM provider is
 * switchable with one env var — keep Claude (paid, sharpest) or a free tier.
 *
 * --- Env vars (Cloudflare dashboard → the Worker → Settings → Variables) ---
 * Pick ONE provider by adding its key (or force it with AI_PROVIDER):
 *   ANTHROPIC_API_KEY  (Secret) — Claude. console.anthropic.com  (default Haiku 4.5, ~0.05–0.1¢/read)
 *   GEMINI_API_KEY     (Secret) — Google Gemini. aistudio.google.com/apikey  (free tier)
 *   GROQ_API_KEY       (Secret) — Groq. console.groq.com/keys  (free tier, very fast)
 *
 * Optional:
 *   AI_PROVIDER  (Text)  — "anthropic" | "gemini" | "groq". Default: whichever key exists.
 *   AI_MODEL     (Text)  — override the model id for the chosen provider.
 *   KALSHI_SERIES_ETH / _BTC / _SOL (Text) — Kalshi 15-min series tickers for crowd odds.
 *   ACCESS_TOKEN (Secret) — if set, requests must include ?token=THATVALUE.
 *
 * Binding (optional but recommended):
 *   CROWD_KV (KV namespace) — shares one good Kalshi fetch across all Worker isolates
 *     and serves it through 429s. Wired in wrangler.toml; without it the cache is
 *     per-isolate only, so crowd will flap to n/a more often under Kalshi throttling.
 *
 * A coin with no KALSHI_SERIES_* just returns crowd:null; the AI read still runs.
 */

const KALSHI_BASE = "https://external-api.kalshi.com/trade-api/v2";

const DEFAULT_MODELS = {
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
};

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten to your Pages origin if you like
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const provider = pickProvider(env);

    if (request.method === "GET") {
      const u = new URL(request.url);
      // Helper to find Kalshi 15-min series tickers: open ?discover=ETH in your browser.
      if (u.searchParams.has("discover")) {
        const coin = (u.searchParams.get("discover") || "").toUpperCase();
        try { return json(await discover(coin)); } catch (e) { return json({ error: e.message }, 502); }
      }
      // Crowd diagnostic: open ?crowd=ETH to see exactly why crowd shows n/a.
      if (u.searchParams.has("crowd")) {
        const coin = (u.searchParams.get("crowd") || "").toUpperCase();
        const t = env["KALSHI_SERIES_" + coin];
        if (!t) return json({ coin, seriesVarSet: false, hint: "Add KALSHI_SERIES_" + coin + " as a Text variable (Settings → Variables and Secrets)." });
        const kv = env.CROWD_KV ? await kvGet(env, t) : null;
        const kvCached = kv ? { overPct: kv.data && kv.data.overPct, ageSec: Math.round((Date.now() - kv.t) / 1000) } : null;
        try {
          const r = await kalshiFetch(`${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(t)}&status=open&limit=200`);
          const b = await r.json().catch(() => ({}));
          const ms = (b.markets || []).filter((m) => m.close_time).sort((a, c) => new Date(a.close_time) - new Date(c.close_time));
          const m = ms[0];
          const over = m ? overFromMarket(m) : null;
          const strike = m ? strikeFromMarket(m) : null;
          if (over != null && env.CROWD_KV) await kvPut(env, t, { t: Date.now(), data: { overPct: over, source: "Kalshi", ticker: m.ticker, closeTime: m.close_time, strike } });
          return json({ coin, seriesTicker: t, httpStatus: r.status, openMarkets: (b.markets || []).length, rawMarket: m || null, overPct: over, strike, kvCached });
        } catch (e) { return json({ coin, seriesTicker: t, error: e.message, kvCached }, 502); }
      }
      // Auto-tracker readout: ?picks=ETH for one coin, or ?picks for all configured coins.
      if (u.searchParams.has("picks")) {
        const st = await loadState(env);
        const coin = (u.searchParams.get("picks") || "").toUpperCase();
        if (coin) return json(st.coins[coin] || { coin, empty: true });
        return json(st.coins || {});
      }
      // One-time cleanup: ?reset=ETH zeroes the auto-tracker's record for a coin (hit-rate
      // counters + history + pending) so it rebuilds on correctly-graded rounds only. The learned
      // model is kept by default (it self-heals); add &model=1 to wipe that too. Honors
      // ACCESS_TOKEN like the POST path — set that secret first if you want this locked down.
      if (u.searchParams.has("reset")) {
        if (env.ACCESS_TOKEN && u.searchParams.get("token") !== env.ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);
        const coin = (u.searchParams.get("reset") || "").toUpperCase();
        if (!coin) return json({ error: "specify a coin, e.g. ?reset=ETH" }, 400);
        const st = await loadState(env);
        const prev = st.coins[coin] || { coin };
        const keepModel = u.searchParams.get("model") !== "1";
        const fresh = { coin, pending: null, history: [], graded: 0, correct: 0, hitRatePct: null, lastActual: null, updated: Date.now() };
        if (keepModel && prev.model) { fresh.model = prev.model; fresh.learned = prev.learned || null; }
        st.coins[coin] = fresh;
        await saveState(env, st);
        return json({ ok: true, coin, reset: true, modelKept: keepModel && !!prev.model, clearedGraded: prev.graded || 0 });
      }
      // Quick health check: shows which provider is wired up.
      return json({ ok: true, provider, model: env.AI_MODEL || DEFAULT_MODELS[provider] || null });
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    if (env.ACCESS_TOKEN) {
      const token = new URL(request.url).searchParams.get("token");
      if (token !== env.ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

    const coin = String(body.coin || "ETH").toUpperCase();

    let crowd = null;
    const seriesTicker = env["KALSHI_SERIES_" + coin];
    if (seriesTicker) { try { crowd = await getKalshiCrowd(env, seriesTicker); } catch (_) { crowd = null; } }

    // Cheap path: the client can refresh the (free) Kalshi crowd + strike without paying
    // for an LLM call. Used between decisions and when the tab isn't actively watched.
    if (body.noAI) return json({ crowd, ai: null, provider });

    // Give the AI the full picture: the 24/7 auto-tracker's own record (its market-anchored
    // guesses + how they actually settled) on top of the client's live history.
    let autopicks = null;
    try { const st = await loadState(env); autopicks = st.coins[coin] || null; } catch (_) {}

    let ai;
    try { ai = await getAIRead(env, provider, body, crowd, autopicks); }
    catch (e) { ai = { verdict: "SKIP", confidence: "Low", edge: "n/a", probOver: 50, rationale: "AI error: " + e.message }; }

    return json({ crowd, ai, provider });
  },

  // Cron (every 15 min): compute a pick from FREE data only — no LLM call, so no AI spend —
  // grade the previous round, and update the online learning model. Keeps a 24/7 record even
  // when no tab is open. Coins run sequentially so the shared (pooled) model updates cleanly.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      // One consolidated KV record for the whole auto-tracker (every coin + the pooled model),
      // so a cron run is a SINGLE KV write instead of ~7 — keeping us inside the free tier's
      // 1,000 writes/day. (Previously each coin and the global model each wrote their own key.)
      const st = await loadState(env);
      const coins = AUTO_COINS.filter((c) => env["KALSHI_SERIES_" + c]);
      for (const c of coins) { try { await runCoinPick(env, c, st); } catch (_) {} }
      await saveState(env, st);
    })());
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function pickProvider(env) {
  const p = (env.AI_PROVIDER || "").toLowerCase();
  if (p) return p;
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.GROQ_API_KEY) return "groq";
  return "none";
}

// --- Kalshi -------------------------------------------------------------
// A browser-like User-Agent: Kalshi throttles the default bot UA hard (429s).
const KALSHI_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};
const crowdMem = new Map();   // L1: { t, data } per isolate (isolates are short-lived)
const FRESH_MS = 60000;       // don't re-hit Kalshi if our value is younger than this
const STALE_MS = 900000;      // serve last good value through errors for up to 15 min
const KV_TTL = 1800;          // seconds KV keeps an entry

// Returns crowd odds, preferring a fresh cache and falling back to the last good value
// (flagged stale) when Kalshi rate-limits us. env.CROWD_KV (if bound) shares one good
// fetch across every Worker isolate — essential because Kalshi 429s Cloudflare's IPs.
async function getKalshiCrowd(env, seriesTicker, persist = true) {
  const now = Date.now();
  let cached = crowdMem.get(seriesTicker);
  if ((!cached || now - cached.t >= FRESH_MS) && env.CROWD_KV) {
    const kv = await kvGet(env, seriesTicker);          // pull the shared value
    if (kv && (!cached || kv.t > cached.t)) cached = kv;
  }
  if (cached && now - cached.t < FRESH_MS) return cached.data;   // fresh enough, no fetch

  try {
    const data = await fetchCrowd(seriesTicker);
    if (data) {
      const entry = { t: now, data };
      crowdMem.set(seriesTicker, entry);
      // Persist to the shared cache only on the live (app) path. The 15-min cron passes
      // persist=false — it still READS this cache, but never writes it, so the free-tier KV
      // write budget is spent on data that matters. The app keeps this cache warm while in use.
      if (env.CROWD_KV && persist) await kvPut(env, seriesTicker, entry);   // share with other isolates
      return data;
    }
    return staleOrNull(cached, now);
  } catch (_) {
    return staleOrNull(cached, now);   // 429 / down → last known
  }
}

// One Kalshi round-trip → implied OVER probability (or null). Throws on hard HTTP error.
async function fetchCrowd(seriesTicker) {
  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=200`;
  const r = await kalshiFetch(url);
  if (!r.ok) throw new Error("kalshi " + r.status);
  const data = await r.json();
  const markets = (data.markets || []).filter((m) => m.close_time);
  if (!markets.length) return null;
  markets.sort((a, b) => new Date(a.close_time) - new Date(b.close_time));
  const m = markets[0];
  const over = overFromMarket(m);
  if (over == null) return null;   // quotes not posted yet (e.g. right at round open) → caller serves stale
  // Also surface the NEXT round's market — that's the one the client locks a bet on in the
  // final 2 minutes, when this round's price is already pinned near 0/100 and useless as a prior.
  const m1 = markets[1];
  const next1 = m1 ? { overPct: overFromMarket(m1), strike: strikeFromMarket(m1), closeTime: m1.close_time } : null;
  return { overPct: over, source: "Kalshi", ticker: m.ticker, closeTime: m.close_time, strike: strikeFromMarket(m), next: next1 };
}

// The market's strike — the real "line to beat". Kalshi 15-min "above" markets carry a
// numeric floor_strike; fall back to parsing the subtitle ("$4,110 or above" → 4110).
function strikeFromMarket(m) {
  if (!m) return null;
  if (typeof m.floor_strike === "number") return m.floor_strike;
  if (typeof m.cap_strike === "number") return m.cap_strike;
  const s = m.yes_sub_title || m.subtitle || m.title || "";
  const mm = String(s).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return mm ? parseFloat(mm[1]) : null;
}

function staleOrNull(cached, now) {
  if (cached && (now - cached.t) < STALE_MS) return { ...cached.data, stale: true };
  return null;
}

// Kalshi's rate limit is bursty; a couple of short retries usually clears a 429.
async function kalshiFetch(url) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await fetch(url, { headers: KALSHI_HEADERS });
    if (r.status !== 429) return r;
    await sleep(300 * (i + 1));   // 300ms, 600ms, 900ms
  }
  return r;
}
function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

async function kvGet(env, key) {
  try { const s = await env.CROWD_KV.get("crowd:" + key); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}
async function kvPut(env, key, entry) {
  try { await env.CROWD_KV.put("crowd:" + key, JSON.stringify(entry), { expirationTtl: KV_TTL }); } catch (_) {}
}
function avg(a, b) {
  const xs = [a, b].filter((v) => typeof v === "number");
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

// Implied OVER % straight from a market row's quote fields. Newer Kalshi rows price
// in dollars as strings ("0.5100" = 51%); older rows used integer cents (yes_bid: 51).
function overFromMarket(m) {
  if (!m) return null;
  const yesBid = dollarsToPct(m.yes_bid_dollars) ?? centsToPct(m.yes_bid);
  const yesAsk = dollarsToPct(m.yes_ask_dollars) ?? centsToPct(m.yes_ask);
  let over = avg(yesBid, yesAsk);   // midpoint of the YES bid/ask = implied P(OVER)
  if (over == null) {
    const last = dollarsToPct(m.last_price_dollars) ?? centsToPct(m.last_price);
    if (last != null) over = last;
  }
  return over;
}
// "0.5100" (dollars, 0–1) → 51. Ignores 0/blank (no quote) and out-of-range values.
function dollarsToPct(v) {
  const n = typeof v === "string" ? parseFloat(v) : (typeof v === "number" ? v : NaN);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n * 100 : null;
}
// Legacy integer-cent field (51 → 51); 0 means no quote.
function centsToPct(v) {
  return typeof v === "number" && v > 0 && v <= 100 ? v : null;
}

// Lists candidate Kalshi crypto series so you can pick the 15-minute one and set
// KALSHI_SERIES_<COIN> to its ticker. Open ?discover=ETH (or BTC/SOL) in a browser.
async function discover(coin) {
  // Try the series catalog first.
  let r = await fetch(`${KALSHI_BASE}/series?category=Crypto`, { headers: KALSHI_HEADERS });
  if (r.ok) {
    const data = await r.json();
    const all = (data.series || []).map((s) => ({ ticker: s.ticker, title: s.title || s.name || "" }));
    const hit = coin ? all.filter((s) => (s.ticker + " " + s.title).toUpperCase().includes(coin)) : all;
    return { kind: "series", hint: "Set KALSHI_SERIES_" + (coin || "ETH") + " to the 15-minute series ticker below.", count: hit.length, series: hit.slice(0, 60) };
  }
  // Fallback: scan open markets and collect distinct series tickers.
  r = await fetch(`${KALSHI_BASE}/markets?status=open&limit=1000`, { headers: KALSHI_HEADERS });
  if (!r.ok) throw new Error("kalshi " + r.status);
  const d2 = await r.json();
  const seen = {}, out = [];
  for (const m of d2.markets || []) {
    const text = (m.ticker + " " + (m.title || "")).toUpperCase();
    if (coin && !text.includes(coin)) continue;
    if (m.series_ticker && !seen[m.series_ticker]) {
      seen[m.series_ticker] = 1;
      out.push({ series_ticker: m.series_ticker, sample_market: m.ticker, title: m.title, close_time: m.close_time });
    }
  }
  return { kind: "markets", hint: "Set KALSHI_SERIES_" + (coin || "ETH") + " to the series_ticker of the 15-minute market.", count: out.length, series: out.slice(0, 60) };
}

// --- Prompt (shared across providers) ----------------------------------
const fnum = (v, d = 2) => (typeof v === "number" && isFinite(v)) ? (v >= 0 && d > 0 ? v.toFixed(d) : v.toFixed(d)) : null;

function buildPrompt(body, crowd, autopicks) {
  const secs = typeof body.secondsLeft === "number" ? body.secondsLeft : null;
  const nextRound = secs != null && secs <= 120;
  const m = body.market || {};

  // The right market prior: this round's price is near-settled in the final 2 min, so for the
  // NEXT-round decision use the next market's price when we have it.
  const cur = crowd && typeof crowd.overPct === "number" ? crowd : null;
  const nxt = crowd && crowd.next && typeof crowd.next.overPct === "number" ? crowd.next : null;
  const useCrowd = nextRound ? (nxt || cur) : cur;
  const crowdLine = useCrowd
    ? `Kalshi market price — real money, the crowd's best guess: OVER ≈ ${Number(useCrowd.overPct).toFixed(0)}%${crowd.stale ? " (briefly stale)" : ""}. This is a live prediction market and your single best prior; it already bakes in volatility, time left, and obvious flow.`
    : `Kalshi market price: unavailable this round — lean on the math below and stay humble (assume ~50/50 unless a signal is strong).`;

  // The math that actually decides an OVER/UNDER: where price sits vs the line, how much time
  // is left, and how big a typical move is over that time.
  const mathLines = [
    `Live price: ${body.price}`,
    `Line to beat: ${body.strike}`,
    typeof m.distancePct === "number" ? `Distance to line: ${m.distancePct >= 0 ? "+" : ""}${fnum(m.distancePct, 3)}% — price is ${m.distancePct >= 0 ? "ABOVE (OVER winning now)" : "BELOW (UNDER winning now)"}` : null,
    secs != null ? `Time left this round: ${secs}s of 900` : null,
    typeof m.sigRoundPct === "number" ? `Typical full-round move (volatility): ±${fnum(m.sigRoundPct, 3)}%` : null,
    typeof m.barrierOverPct === "number" ? `Position model P(OVER) — distance vs time-left vs volatility: ${Math.round(m.barrierOverPct)}%` : null,
    typeof m.momentumPct === "number" ? `Short-term momentum (last few min): ${m.momentumPct >= 0 ? "+" : ""}${fnum(m.momentumPct, 4)}%/min` : null,
    typeof m.roundHigh === "number" && typeof m.roundLow === "number" ? `This round's graph so far — high ${fnum(m.roundHigh, 2)}, low ${fnum(m.roundLow, 2)}${typeof m.rangePosPct === "number" ? `; price is sitting ${Math.round(m.rangePosPct)}% of the way up that range (100% = at the high, 0% = at the low)` : ""}.` : null,
    typeof m.highVsLinePct === "number" && typeof m.lowVsLinePct === "number" ? `Range vs the line: the high reached ${m.highVsLinePct >= 0 ? "+" : ""}${fnum(m.highVsLinePct, 3)}% (${m.highVsLinePct >= 0 ? "above" : "below"} the line), the low ${m.lowVsLinePct >= 0 ? "+" : ""}${fnum(m.lowVsLinePct, 3)}%. Read it: price repeatedly testing a side and failing to hold = mean-reversion risk; fresh highs/lows toward the close = momentum.` : null,
  ].filter(Boolean).join("\n");

  const indicators = (body.indicators || []).map((i) => `- ${i.name}: ${i.value} (${i.label})`).join("\n");

  // --- track record / calibration ---
  const h = body.history || {};
  const recent = (h.recent || []).map((x) => {
    const extra = [x.net != null ? `net ${x.net > 0 ? "+" : ""}${x.net}` : null, x.said ? `said ${x.said}` : null, x.obi != null ? `book ${x.obi > 0 ? "+" : ""}${x.obi}` : null].filter(Boolean).join("/");
    return `${x.time} ${x.pick}->${x.actual} ${x.correct ? "OK" : "X"}${extra ? " [" + extra + "]" : ""}`;
  }).join(", ");
  const calLine = (h.confidenceCalibration || []).length
    ? "Confidence calibration — " + h.confidenceCalibration.map((c) => `when it claimed ${c.saidLikely}, that side truly won ${c.actuallyWonPct}% (n=${c.n})`).join("; ") + "."
    : "";
  const condBits = [];
  if (h.whenIndicatorsStronglyAgree) condBits.push(`indicators strongly agreeing → ${h.whenIndicatorsStronglyAgree.hitPct}% (n=${h.whenIndicatorsStronglyAgree.n})`);
  if (h.whenOrderBookAgrees) condBits.push(`order book agreeing with the pick → ${h.whenOrderBookAgrees.hitPct}% (n=${h.whenOrderBookAgrees.n})`);
  const condLine = condBits.length ? "Conditional hit-rates — " + condBits.join("; ") + "." : "";
  const historyLine = h.graded
    ? `Last ${h.graded} graded rounds: overall ${h.hitRatePct}% right, streak ${h.currentStreak}, OVER ${h.overHitPct ?? "n/a"}% / UNDER ${h.underHitPct ?? "n/a"}%. ${calLine} ${condLine}
Recent (pick->result [signals]): ${recent}.`
    : `No graded history yet — keep confidence modest.`;

  // The always-on auto-tracker's own record: a simpler market-anchored system (Kalshi price +
  // momentum + order book, no AI) that has been guessing + getting graded every round, 24/7.
  const ap = autopicks || null;
  const apHist = ap && Array.isArray(ap.history) ? ap.history : [];
  const apRecent = apHist.slice(0, 14).map((x) => `${x.time} ${x.side}->${x.actual} ${x.correct ? "OK" : "X"}`).join(", ");
  const autoLine = (ap && (ap.graded || apHist.length))
    ? `24/7 AUTO-TRACKER (an independent, market-anchored system — Kalshi price + momentum + order book, NO AI — that picks and is graded every round even while the user is away): ${ap.hitRatePct ?? "n/a"}% over ${ap.graded || apHist.length} rounds.${ap.pending ? ` Its current pick: ${ap.pending.side}${ap.pending.side !== "SKIP" ? " " + ap.pending.prob + "%" : ""} (crowd ${ap.pending.signals && ap.pending.signals.crowdOver}% over).` : ""} Recent guesses->results: ${apRecent}. Treat it as a reality check on the market: where this dumb-but-honest system keeps winning, the market is efficient — agree with it; where it has been wrong lately, look for the edge it's missing.`
    : (ap && ap.pending ? `24/7 auto-tracker current pick: ${ap.pending.side}${ap.pending.side !== "SKIP" ? " " + ap.pending.prob + "%" : ""} (not enough graded rounds yet).` : "");

  // What the per-coin online model has learned (faint tilts on a near-efficient market).
  const lr = ap && ap.learned;
  const learnedLine = lr
    ? `LEARNED MODEL for ${body.coin} (online logistic regression, ${lr.n} graded rounds, pooled across coins): current read P(OVER) ≈ ${ap.pending && typeof ap.pending.modelOver === "number" ? ap.pending.modelOver + "%" : "n/a"}.${lr.tendencies && lr.tendencies.length ? " Learned tendencies: " + lr.tendencies.join("; ") + "." : ""}${lr.afterUpOverPct != null ? ` Round-to-round: after an UP round it finishes OVER ${lr.afterUpOverPct}% of the time; after a DOWN round ${lr.afterDownOverPct}%.` : ""} (15-min direction is near-random, so weight this as a faint tilt, not gospel.)`
    : "";

  const scopeLine = nextRound
    ? `Only ~${secs}s remain in THIS round, so treat it as settled — do NOT advise on it. Judge the NEXT 15-minute round, which opens in ~${secs}s at ≈ the current price (${body.price}). At that open the line resets to ~the live price, so the position model is ~50% by design — your ONLY edge for the next round is which way it drifts from here.`
    : `Judge THIS round: will ${body.coin} be ABOVE the line (${body.strike}) at the close, ~${secs ?? "?"}s from now? The position model already reflects how far you are from the line and how little time is left — respect it.`;

  return `You are a sharp, disciplined quant trading a 15-minute crypto OVER/UNDER market on ${body.coin}. OVER pays if the price is above the line at the close; UNDER if below.

${scopeLine}

THE MARKET (your prior):
${crowdLine}

THE MATH (what actually settles an OVER/UNDER):
${mathLines}

LIVE SIGNALS (15-min candles + order book; note several trend lines are correlated, so don't count them as independent votes):
${indicators}

YOUR TRACK RECORD ON THIS DEVICE:
${historyLine}
${autoLine ? "\n" + autoLine + "\n" : ""}${learnedLine ? "\n" + learnedLine + "\n" : ""}
HOW TO DECIDE — your one goal is a HIGH HIT-RATE on the bets you place, NOT betting every round.
15-min direction is close to a coin-flip, so most rounds have no edge and the winning move is to
SKIP. Reason in this order, then output only JSON:
1. Anchor on the market price. It is hard to beat; do not re-derive it. Your job is to spot the rare moments it's wrong or slow.
2. THIS round: the position model P(OVER) is usually the best estimate. If price is already well above/below the line with little time left, the round is nearly settled — take that side and trust it; the single most reliable bet is a decisive position late in the round.
3. CONFLUENCE is the edge. Only call a side when several INDEPENDENT reads point the SAME way: the market (crowd), the position model, short-term momentum, order-book pressure (who is buying vs selling right now), the recent-round pattern, and the track record. If they disagree, or it is a fresh ≈50/50 next round with no standout signal, SKIP.
4. Ride aligned favorites; don't fade them. A lopsided crowd (≈70%+ one side) that agrees with where price sits and which way flow is leaning is a high-probability bet. Betting AGAINST a confident, aligned market needs a specific, nameable reason (clear momentum/flow it hasn't priced) — otherwise it's a coin-flip, so SKIP.
5. Calibrate to the record: if a confidence band historically won LESS than it claimed, pull your number toward 50. Lean into setups that have actually paid off here; avoid ones that haven't.
6. Output probOver = your probability OVER wins (0–100). Turn it into a side only past a real margin: probOver ≥ 60 → OVER, ≤ 40 → UNDER, else SKIP. Expect to SKIP the majority of rounds — that is exactly what protects the hit rate.

"edge": "against-crowd" if your side opposes the market, "with-crowd" if it matches, else "n/a". (Agreeing with a confident crowd is rarely a real edge.)

"rationale": plain, everyday English for a non-trader — ONE or two short sentences telling the story: what price just did, the ONE thing that decides it (friendly words, no jargon/acronyms/numbers), and how sure you are. e.g. "It jumped above the line and there's barely 3 minutes left, so it'd take a sharp drop to lose — I'm fairly confident it stays over."

Respond with ONLY this JSON, no markdown:
{"probOver":<0-100 integer>,"verdict":"OVER|UNDER|SKIP","confidence":"Low|Medium|High","edge":"with-crowd|against-crowd|n/a","rationale":"plain-English, 1-2 sentences"}`;
}

function normalize(o) {
  o = o || {};
  const verdict = ["OVER", "UNDER", "SKIP"].includes(o.verdict) ? o.verdict : "SKIP";
  const confidence = ["Low", "Medium", "High"].includes(o.confidence) ? o.confidence : "Low";
  let p = Number(o.probOver);
  if (!Number.isFinite(p)) {                       // model omitted it → derive from verdict + confidence
    const base = confidence === "High" ? 80 : confidence === "Medium" ? 68 : 58;
    p = verdict === "OVER" ? base : verdict === "UNDER" ? 100 - base : 50;
  }
  p = Math.max(0, Math.min(100, Math.round(p)));
  return {
    probOver: p,
    verdict,
    confidence,
    edge: ["with-crowd", "against-crowd", "n/a"].includes(o.edge) ? o.edge : "n/a",
    rationale: String(o.rationale || "").slice(0, 320),
  };
}
function extractJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  const m = text && text.match(/\{[\s\S]*\}/); // tolerate stray prose around the JSON
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  throw new Error("model did not return JSON");
}

// --- Providers ----------------------------------------------------------
async function getAIRead(env, provider, body, crowd, autopicks) {
  const prompt = buildPrompt(body, crowd, autopicks);
  const model = (body.model && String(body.model).trim()) || env.AI_MODEL || DEFAULT_MODELS[provider];
  if (provider === "anthropic") return readAnthropic(env.ANTHROPIC_API_KEY, model, prompt);
  if (provider === "gemini") return readGemini(env.GEMINI_API_KEY, model, prompt);
  if (provider === "groq") return readGroq(env.GROQ_API_KEY, model, prompt);
  return { verdict: "SKIP", confidence: "Low", edge: "n/a", rationale: "No AI provider configured — add ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY." };
}

async function readAnthropic(key, model, prompt) {
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              probOver: { type: "integer" },
              verdict: { type: "string", enum: ["OVER", "UNDER", "SKIP"] },
              confidence: { type: "string", enum: ["Low", "Medium", "High"] },
              edge: { type: "string", enum: ["with-crowd", "against-crowd", "n/a"] },
              rationale: { type: "string" },
            },
            required: ["probOver", "verdict", "confidence", "edge", "rationale"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 140));
  const data = await r.json();
  const tb = (data.content || []).find((b) => b.type === "text");
  if (!tb) throw new Error("no text block");
  return normalize(extractJson(tb.text));
}

async function readGemini(key, model, prompt) {
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 400 },
    }),
  });
  if (!r.ok) throw new Error("gemini " + r.status + " " + (await r.text()).slice(0, 140));
  const data = await r.json();
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error("no gemini text");
  return normalize(extractJson(text));
}

async function readGroq(key, model, prompt) {
  if (!key) throw new Error("GROQ_API_KEY missing");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only a JSON object matching the user's requested shape." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error("groq " + r.status + " " + (await r.text()).slice(0, 140));
  const data = await r.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error("no groq text");
  return normalize(extractJson(text));
}

// --- Scheduled auto-tracker (free data only — no LLM, no AI spend) --------
// Runs on cron. Per coin: grade the previous round's pick, then make a fresh pick for the
// round that just opened, using the Kalshi market price (anchor) nudged by short-term
// momentum and order-book pressure. Stored in CROWD_KV and read back via ?picks=COIN.
const AUTO_COINS = ["ETH", "BTC", "SOL", "DOGE", "SHIB", "XRP"];
const CB_BASE = "https://api.exchange.coinbase.com";
const CB_PRODUCT = { ETH: "ETH-USD", BTC: "BTC-USD", SOL: "SOL-USD", DOGE: "DOGE-USD", SHIB: "SHIB-USD", XRP: "XRP-USD" };
const CB_HEADERS = { "User-Agent": "market-prediction-app-cron/1.0", Accept: "application/json" };
const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
const round4 = (x) => Math.round(x * 1e4) / 1e4;

async function cbJson(path) {
  const r = await fetch(CB_BASE + path, { headers: CB_HEADERS });
  if (!r.ok) throw new Error("cb " + r.status);
  return r.json();
}
// Last price + recent 1-min momentum + per-minute realized volatility from Coinbase 1-min candles.
async function cbMicro(product) {
  const rows = await cbJson(`/products/${product}/candles?granularity=60`);   // [time,low,high,open,close,vol], newest first
  if (!Array.isArray(rows) || rows.length < 12) return null;
  const closes = rows.map((x) => x[4]).reverse();   // oldest → newest
  const L = closes.length, look = Math.min(10, L - 1);
  const p0 = closes[L - 1 - look], pN = closes[L - 1];
  const mom = (p0 > 0 && look > 0) ? Math.log(pN / p0) / look : 0;   // avg log-return per minute
  const win = Math.min(30, L - 1), rets = [];
  for (let i = L - win; i < L; i++) { const a = closes[i - 1], b = closes[i]; if (a > 0 && b > 0) rets.push(Math.log(b / a)); }
  let sig = 0;
  if (rets.length > 3) { const m = rets.reduce((s, x) => s + x, 0) / rets.length; sig = Math.sqrt(rets.reduce((s, x) => s + (x - m) * (x - m), 0) / (rets.length - 1)); }
  // Shape of the just-closed ~15-min round: where the latest price sits in that round's own
  // high–low range (+1 = closed at the round high, −1 = at the low) — a momentum/exhaustion tell.
  const seg = rows.slice(0, 15);   // rows are newest-first → the most recent ~15 one-minute candles
  let rngClose = 0;
  if (seg.length >= 8) {
    let hi = -Infinity, lo = Infinity;
    for (const r of seg) { if (r[2] > hi) hi = r[2]; if (r[1] < lo) lo = r[1]; }   // candle = [time,low,high,open,close,vol]
    if (hi > lo) rngClose = clampF((seg[0][4] - lo) / (hi - lo) * 2 - 1, -1, 1);
  }
  return { price: pN, mom, sig, rngClose };   // sig = per-minute log-return stdev
}
// The price AT a round's close: the finalized 1-min candle that ENDS exactly at closeMs (its
// close ≈ the boundary price Coinbase shows and Kalshi settles near). Grading off the latest /
// still-forming candle instead let a late cron or a post-close tick settle a round on the wrong
// side of the line — the same mis-grade we fixed in the client.
async function cbCloseAt(product, closeMs) {
  if (!(closeMs > 0)) return null;
  const rows = await cbJson(`/products/${product}/candles?granularity=60`).catch(() => null);
  if (!Array.isArray(rows)) return null;
  const bucket = Math.floor(closeMs / 1000) - 60;   // 1-min candle covering [closeMs-60s, closeMs]
  for (const r of rows) if (r[0] === bucket) return r[4];   // r = [time,low,high,open,close,vol]
  return null;
}
// Order-book imbalance within ±0.15% of mid (−1 = sell-heavy … +1 = buy-heavy).
async function cbObi(product) {
  const j = await cbJson(`/products/${product}/book?level=2`);
  const bids = j.bids || [], asks = j.asks || [];
  if (!bids.length || !asks.length) return null;
  const mid = (parseFloat(bids[0][0]) + parseFloat(asks[0][0])) / 2;
  if (!(mid > 0)) return null;
  const band = mid * 0.0015; let bv = 0, av = 0, p;
  for (const b of bids) { p = parseFloat(b[0]); if (mid - p > band) break; bv += parseFloat(b[1]); }
  for (const a of asks) { p = parseFloat(a[0]); if (p - mid > band) break; av += parseFloat(a[1]); }
  const tot = bv + av;
  return tot ? (bv - av) / tot : null;
}
// Market-anchored free pick: crowd price nudged by momentum + book + the learned model;
// SKIP near 50/50. modelOver shrinks to 0.5 while the model is cold, so it only sways the
// pick once it has actually learned something.
function freePick(crowdOverPct, mom, obi, modelOver) {
  const parts = [];
  if (typeof crowdOverPct === "number") parts.push({ p: Math.max(0.02, Math.min(0.98, crowdOverPct / 100)), w: 0.55 });
  if (typeof mom === "number") parts.push({ p: Math.max(0.4, Math.min(0.6, 0.5 + 0.5 * Math.tanh(mom * 120))), w: 0.15 });
  if (typeof obi === "number") parts.push({ p: Math.max(0.3, Math.min(0.7, 0.5 + 0.5 * Math.tanh(2 * obi))), w: 0.15 });
  if (typeof modelOver === "number") parts.push({ p: Math.max(0.05, Math.min(0.95, modelOver)), w: 0.2 });
  if (!parts.length) return null;
  let ws = 0, ac = 0; for (const x of parts) { ws += x.w; ac += x.p * x.w; }
  const pOver = ac / ws;
  return { pOver, side: pOver >= 0.58 ? "OVER" : pOver <= 0.42 ? "UNDER" : "SKIP" };
}
async function kvGetRaw(env, key) {
  try { if (!env.CROWD_KV) return null; const s = await env.CROWD_KV.get(key); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}
async function kvPutRaw(env, key, val) {
  try { if (env.CROWD_KV) await env.CROWD_KV.put(key, JSON.stringify(val), { expirationTtl: 60 * 60 * 24 * 30 }); } catch (_) {}
}

// The entire auto-tracker — every coin's pick/history/learned-model plus the pooled global
// model — lives under ONE KV key. A cron run reads it once and writes it once, turning ~7 KV
// writes/run into 1 and keeping us comfortably under the free tier's 1,000 writes/day. The
// first read after upgrading seeds itself from the older per-key layout (picks:<COIN> +
// model:global), so no history or learning is lost; the legacy keys then expire on their own.
const STATE_KEY = "auto:state";
async function loadState(env) {
  let st = await kvGetRaw(env, STATE_KEY);
  if (st && st.coins) { st.global = padModel(st.global || newModel()); return st; }
  st = { v: 2, global: padModel((await kvGetRaw(env, "model:global")) || newModel()), coins: {} };
  for (const c of AUTO_COINS) { const r = await kvGetRaw(env, "picks:" + c); if (r) st.coins[c] = r; }
  return st;
}
async function saveState(env, st) { st.updated = Date.now(); await kvPutRaw(env, STATE_KEY, st); }

// --- Online learning model (per-coin + pooled global) --------------------
// A tiny online logistic regression that learns, per coin, how round-open signals map to the
// chance price finishes OVER. Updated once per round from the graded outcome (free, no LLM).
// Research basis: order-flow imbalance is the strongest short-horizon predictor (Sirignano &
// Cont 2018, arXiv:1803.06917; Bugaenko 2004.08290), and a *pooled* feature→move mapping is
// "universal" and beats isolated per-asset models — so we partial-pool each coin toward a
// shared global model, weighted by how much data the coin has earned.
const FEATS = ["book", "momentum", "volregime", "crowdLean", "lastDir", "todSin", "todCos", "rangeClose"];
// Constant LR (NOT 1/sqrt(t)) so the model keeps tracking a drifting market; strong-ish L2
// because samples are scarce. Tuning per research synthesis (online logistic regression
// under distribution shift): eta ~0.05-0.15, L2 ~3e-3-1e-2.
// POOL_K (~1.5 days at 96/round-day) = how much data a coin needs before its own weights
// diverge from the shared/pooled model; GATE_N keeps the pooled output near 50/50 until it
// has earned data. Research: features are universal across coins (pool the mapping), and a
// real 53% edge needs ~2.5k samples to confirm — so stay humble and shrink hard.
const LR = 0.05, L2 = 0.008, POOL_K = 150, GATE_N = 300;
function newModel() { return { w: FEATS.map(() => 0), b: 0, n: 0, avgSig: null }; }
// Saved models predate later features — pad the weight vector so dimensions line up (new
// weights start at 0, so a migrated model behaves identically until it learns the new signal).
function padModel(m) { if (m && Array.isArray(m.w)) { while (m.w.length < FEATS.length) m.w.push(0); } return m; }
function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); }
function clampF(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
// Build the standardized feature vector at round open. `prevActual` is last round's result.
function featuresFor(model, signals, prevActual, ts) {
  const obi = typeof signals.obi === "number" ? clampF(signals.obi, -1, 1) : 0;
  const mom = typeof signals.mom === "number" ? Math.tanh(signals.mom * 120) : 0;
  let volr = 0;
  if (typeof signals.sig === "number" && signals.sig > 0) {
    if (model.avgSig) volr = clampF(signals.sig / model.avgSig - 1, -1, 1);
  }
  const crowdLean = typeof signals.crowdOver === "number" ? clampF((signals.crowdOver / 100 - 0.5) * 2, -1, 1) : 0;
  const lastDir = prevActual === "OVER" ? 1 : prevActual === "UNDER" ? -1 : 0;
  const rngClose = typeof signals.rngClose === "number" ? clampF(signals.rngClose, -1, 1) : 0;
  const hourFrac = ((new Date(ts).getUTCHours()) + new Date(ts).getUTCMinutes() / 60) / 24;
  return [obi, mom, volr, crowdLean, lastDir, Math.sin(2 * Math.PI * hourFrac), Math.cos(2 * Math.PI * hourFrac), rngClose];
}
function scoreModel(model, f) { let z = model.b; for (let i = 0; i < f.length; i++) z += model.w[i] * f[i]; return z; }
// Partial-pooled probability: blend the coin's linear score toward the pooled (global) one by
// how much data the coin has, then shrink the whole thing toward 50/50 until the pooled model
// has earned enough samples — so a cold model never emits a confident (noisy) guess.
function predictBlend(coin, global, f) {
  const a = coin.n / (coin.n + POOL_K);
  const p = sigmoid(a * scoreModel(coin, f) + (1 - a) * scoreModel(global, f));
  const gate = Math.min(1, global.n / GATE_N);
  return 0.5 + gate * (p - 0.5);
}
// One SGD step of logistic regression with L2 shrinkage.
function trainModel(model, f, y) {
  const p = sigmoid(scoreModel(model, f)), g = y - p;
  for (let i = 0; i < f.length; i++) model.w[i] += LR * (g * f[i] - L2 * model.w[i]);
  model.b += LR * g;
  model.n++;
}
// Plain-language read of what a coin has learned (for the AI prompt + the app panel).
function modelInsights(coin, global, history) {
  if (!coin || coin.n < 12) return null;
  const a = coin.n / (coin.n + POOL_K), w = coin.w.map((cw, i) => a * cw + (1 - a) * global.w[i]);
  const tend = [];
  if (Math.abs(w[1]) > 0.12) tend.push(w[1] > 0 ? "short-term moves tend to continue (momentum)" : "short-term moves tend to fade (mean-reversion)");
  if (Math.abs(w[0]) > 0.12) tend.push(w[0] > 0 ? "buy-side order-book pressure has led to OVER" : "order-book pressure has been contrarian");
  if (Math.abs(w[4]) > 0.12) tend.push(w[4] > 0 ? "tends to repeat last round's direction" : "tends to reverse last round's direction");
  if (Math.abs(w[2]) > 0.12) tend.push(w[2] > 0 ? "more likely OVER when volatility is rising" : "more likely UNDER when volatility is rising");
  if (w.length > 7 && Math.abs(w[7]) > 0.12) tend.push(w[7] > 0 ? "tends to keep going when the prior round closed near an extreme (momentum)" : "tends to reverse when the prior round closed near an extreme (mean-reversion)");
  // round-to-round transition rates from graded history (interpretable regime read)
  let uu = 0, un = 0, du = 0, dn = 0;
  for (let i = 0; i + 1 < history.length; i++) {
    const prev = history[i + 1].actual, cur = history[i].actual;   // history is newest-first
    if (prev === "OVER") { cur === "OVER" ? uu++ : un++; } else if (prev === "UNDER") { cur === "OVER" ? du++ : dn++; }
  }
  const afterUp = uu + un >= 5 ? Math.round(uu / (uu + un) * 100) : null;
  const afterDown = du + dn >= 5 ? Math.round(du / (du + dn) * 100) : null;
  // Honest confidence by sample size: a true 53% edge needs ~2,500 graded rounds to confirm.
  const confidence = coin.n >= 2500 ? "established" : coin.n >= 600 ? "building" : "warming up";
  return { n: coin.n, confidence, tendencies: tend, afterUpOverPct: afterUp, afterDownOverPct: afterDown };
}

async function runCoinPick(env, coin, st) {
  const series = env["KALSHI_SERIES_" + coin], product = CB_PRODUCT[coin];
  if (!series || !product) return;
  const global = st.global;
  const [crowd, micro, obi] = await Promise.all([
    getKalshiCrowd(env, series, false).catch(() => null),   // false: read the shared cache, don't spend a KV write
    cbMicro(product).catch(() => null),
    cbObi(product).catch(() => null),
  ]);
  const rec = st.coins[coin] || (st.coins[coin] = { coin, pending: null, history: [], graded: 0, correct: 0 });
  const coinModel = padModel(rec.model || newModel());

  // 1) grade the previous pick once its round has closed — and LEARN from the outcome.
  // Settle against the price AT THE CLOSE (the finalized 1-min candle ending at closeMs), NOT the
  // live price when this cron happens to run — a late cron or a post-close tick used to flip rounds.
  const p = rec.pending;
  if (p && Date.now() >= (p.closeMs || 0)) {
    if (typeof p.strike === "number" && (p.side === "OVER" || p.side === "UNDER")) {
      let settle = await cbCloseAt(product, p.closeMs);
      if (settle == null && micro && typeof micro.price === "number") settle = micro.price;   // last resort if the close candle is missing
      if (typeof settle === "number") {
        const actual = settle > p.strike ? "OVER" : settle < p.strike ? "UNDER" : "FLAT";
        if (actual !== "FLAT") {
          const correct = actual === p.side;
          rec.history.unshift({ time: p.label, ts: p.ts || null, side: p.side, actual, correct, prob: p.prob, strike: p.strike, close: settle });
          if (rec.history.length > 200) rec.history.pop();
          rec.graded++; if (correct) rec.correct++;
          // online update: the round's open-features -> did it finish OVER (1) or UNDER (0)?
          const closeOver = settle > (typeof p.openPrice === "number" ? p.openPrice : p.strike) ? 1 : 0;
          if (Array.isArray(p.feat)) { trainModel(coinModel, p.feat, closeOver); trainModel(global, p.feat, closeOver); }
          rec.lastActual = actual;
        }
      }
    }
    rec.pending = null;
  }

  // 2) make a fresh pick for the round that just opened (the current Kalshi market)
  if (crowd && typeof crowd.overPct === "number" && typeof crowd.strike === "number") {
    const sigVals = { crowdOver: crowd.overPct, mom: micro && micro.mom, obi: obi, sig: micro && micro.sig, rngClose: micro && micro.rngClose };
    const nowTs = Date.now();
    const feat = featuresFor(coinModel, sigVals, rec.lastActual, nowTs);
    if (micro && typeof micro.sig === "number" && micro.sig > 0) coinModel.avgSig = coinModel.avgSig == null ? micro.sig : 0.97 * coinModel.avgSig + 0.03 * micro.sig;
    const modelOver = predictBlend(coinModel, global, feat);        // learned P(OVER) for this round
    const fp = freePick(crowd.overPct, micro && micro.mom, obi, modelOver);
    if (fp) {
      const d = new Date(nowTs);
      rec.pending = {
        coin, strike: crowd.strike, openPrice: micro ? micro.price : crowd.strike, side: fp.side,
        pOver: Math.round(fp.pOver * 100),
        prob: Math.round((fp.side === "UNDER" ? 1 - fp.pOver : fp.pOver) * 100),
        modelOver: Math.round(modelOver * 100),
        closeMs: crowd.closeTime ? new Date(crowd.closeTime).getTime() : nowTs + 900000,
        ts: nowTs,                                                   // client formats this to 12-hour local time
        label: pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC",   // fallback for older clients
        feat,                                                        // remembered so the next run can learn from it
        signals: { crowdOver: Math.round(crowd.overPct), mom: micro ? round4(micro.mom) : null, obi: obi != null ? Math.round(obi * 100) / 100 : null },
      };
    }
  }
  rec.model = coinModel;
  rec.learned = modelInsights(coinModel, global, rec.history);      // plain-language read for the prompt + app
  rec.hitRatePct = rec.graded ? Math.round(rec.correct / rec.graded * 100) : null;
  rec.updated = Date.now();
  // No per-coin write here — the whole auto-tracker is persisted once per cron run by saveState().
}
