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
      // Best bet across all coins right now — a compact ranked leaderboard for the app's footer ticker.
      if (u.searchParams.has("best")) {
        const st = await loadState(env);
        return json({ best: rankBest(st), ts: Date.now() });
      }
      // One-time cleanup: ?reset=ETH zeroes the auto-tracker's record for a coin (hit-rate
      // counters + history + pending) so it rebuilds on correctly-graded rounds only; ?reset=all does
      // every coin ATOMICALLY in one state write (so the app's "Clear all" can't race per-coin resets
      // into clobbering each other). The learned model is kept by default; add &model=1 to wipe it.
      // Honors ACCESS_TOKEN like the POST path — set that secret first if you want this locked down.
      if (u.searchParams.has("reset")) {
        if (env.ACCESS_TOKEN && u.searchParams.get("token") !== env.ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);
        const coin = (u.searchParams.get("reset") || "").toUpperCase();
        if (!coin) return json({ error: "specify a coin, e.g. ?reset=ETH (or ?reset=all)" }, 400);
        const st = await loadState(env);
        const keepModel = u.searchParams.get("model") !== "1";
        const resetOne = (cn) => {
          const prev = st.coins[cn] || { coin: cn };
          const fresh = { coin: cn, pending: null, history: [], graded: 0, correct: 0, hitRatePct: null, lastActual: null, updated: Date.now() };
          if (keepModel && prev.model) { fresh.model = prev.model; fresh.learned = prev.learned || null; }
          st.coins[cn] = fresh;
          return prev.graded || 0;
        };
        if (coin === "ALL") {
          let cleared = 0; for (const cn of AUTO_COINS) cleared += resetOne(cn);
          await saveState(env, st);
          return json({ ok: true, coin: "ALL", reset: true, coins: AUTO_COINS.length, modelKept: keepModel, clearedGraded: cleared });
        }
        const cleared = resetOne(coin);
        await saveState(env, st);
        return json({ ok: true, coin, reset: true, modelKept: keepModel, clearedGraded: cleared });
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
    const aiProvider = resolveProvider(env, body.model);   // the app's chosen model can pick the provider

    let crowd = null;
    const seriesTicker = env["KALSHI_SERIES_" + coin];
    if (seriesTicker) { try { crowd = await getKalshiCrowd(env, seriesTicker); } catch (_) { crowd = null; } }

    // Cheap path: the client can refresh the (free) Kalshi crowd + strike without paying
    // for an LLM call. Used between decisions and when the tab isn't actively watched.
    if (body.noAI) return json({ crowd, ai: null, provider: aiProvider });

    // Give the AI the full picture: the 24/7 auto-tracker's own record (its market-anchored
    // guesses + how they actually settled) on top of the client's live history.
    let autopicks = null;
    try { const st = await loadState(env); autopicks = st.coins[coin] || null; } catch (_) {}

    let ai;
    try { ai = await getAIRead(env, aiProvider, body, crowd, autopicks); }
    catch (e) { ai = { verdict: "SKIP", confidence: "Low", edge: "n/a", probOver: 50, rationale: "AI error: " + e.message }; }

    return json({ crowd, ai, provider: aiProvider });
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
      try { await notifyHotPicks(env, st); } catch (_) {}   // background phone push on a high-confidence pick (ntfy)
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
// Which provider does a model id belong to? (claude-* → Anthropic, gemini-* → Gemini, llama/etc → Groq)
function providerOfModel(model) {
  const m = (model || "").toLowerCase();
  if (m.startsWith("gemini")) return "gemini";
  if (m.startsWith("claude")) return "anthropic";
  if (m.includes("llama") || m.includes("mixtral") || m.includes("gemma") || m.includes("qwen")) return "groq";
  return null;
}
function providerHasKey(env, p) {
  return p === "anthropic" ? !!env.ANTHROPIC_API_KEY : p === "gemini" ? !!env.GEMINI_API_KEY : p === "groq" ? !!env.GROQ_API_KEY : false;
}
// Resolve the provider for THIS read. Precedence: a dashboard AI_PROVIDER override always wins;
// otherwise the provider implied by the model the APP picked (if that provider's key is set) — so the
// in-app dropdown switches providers, not just model names; otherwise the key-order auto-pick.
function resolveProvider(env, model) {
  const forced = (env.AI_PROVIDER || "").toLowerCase();
  if (forced) return forced;
  const want = providerOfModel(model);
  if (want && providerHasKey(env, want)) return want;
  return pickProvider(env);
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
      // Persist successful fetches to the shared cache when persist=true. Both the live (app) path
      // AND the 15-min cron now write it — the cron can't lean on the app being open to keep Kalshi
      // data warm, so it persists its own fetches (a few KV writes/run, still far under the free-tier
      // budget). Shared across every Worker isolate so one success serves them all.
      if (env.CROWD_KV && persist) await kvPut(env, seriesTicker, entry);
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
  const next1 = m1 ? { overPct: overFromMarket(m1), strike: strikeFromMarket(m1), closeTime: m1.close_time, ticker: m1.ticker } : null;
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
  const apRecent = apHist.slice(0, 14).map((x) => `${x.time} ${x.side}->${x.actual} ${x.correct ? "OK" : "X"}${typeof x.overPct === "number" ? " by " + (x.overPct > 0 ? "+" : "") + x.overPct + "%" : ""}`).join(", ");
  const autoLine = (ap && (ap.graded || apHist.length))
    ? `24/7 AUTO-TRACKER (an independent, market-anchored system — Kalshi price + momentum + order book, NO AI — that picks and is graded every round even while the user is away): ${ap.hitRatePct ?? "n/a"}% over ${ap.graded || apHist.length} rounds.${ap.pending ? ` Its current pick: ${ap.pending.side === "SKIP" ? "SKIP (no confident edge — its reads conflict)" : ap.pending.side + " " + ap.pending.prob + "%" + (typeof ap.pending.agree === "number" ? " · " + ap.pending.agree + " of its independent reads agree" + (typeof ap.pending.conf === "number" ? " (" + Math.round(ap.pending.conf * 100) + "% of signal-weight)" : "") : "")} (crowd ${ap.pending.signals && ap.pending.signals.crowdOver}% over). A SKIP or a low-agreement pick is itself a signal that the next round is a coin-flip.` : ""} Recent guesses->results: ${apRecent}. Treat it as a reality check on the market: where this dumb-but-honest system keeps winning, the market is efficient — agree with it; where it has been wrong lately, look for the edge it's missing.`
    : (ap && ap.pending ? `24/7 auto-tracker current pick: ${ap.pending.side}${ap.pending.side !== "SKIP" ? " " + ap.pending.prob + "%" : ""} (not enough graded rounds yet).` : "");

  // What the per-coin online model has learned (faint tilts on a near-efficient market).
  const lr = ap && ap.learned;
  const sg = ap && ap.pending && ap.pending.signals;
  const techBit = sg && (typeof sg.rsi === "number" || typeof sg.macdH === "number" || typeof sg.stochK === "number")
    ? ` Technicals at this open: ${[typeof sg.rsi === "number" ? "RSI(14) " + sg.rsi + (sg.rsi >= 70 ? " (overbought)" : sg.rsi <= 30 ? " (oversold)" : "") : null, typeof sg.macdH === "number" ? "MACD-hist " + (sg.macdH > 0 ? "+" : "") + sg.macdH + (sg.macdH > 0 ? " (bullish momentum)" : sg.macdH < 0 ? " (bearish momentum)" : "") : null, typeof sg.stochK === "number" ? "Stochastic %K " + sg.stochK + (sg.stochK >= 80 ? " (overbought)" : sg.stochK <= 20 ? " (oversold)" : "") : null].filter(Boolean).join(", ")}.`
    : "";
  const streakBit = lr && lr.streak ? ` Recent arrows: ${lr.streak.len} ${lr.streak.dir} rounds in a row (a run can mean a live trend OR a reversal is overdue — read it with the technicals, don't assume either).` : "";
  const marginBit = lr && typeof lr.avgMarginAbsPct === "number"
    ? ` Recent rounds settled ${lr.avgMarginAbsPct < 0.05 ? "razor-thin" : "by ±" + lr.avgMarginAbsPct + "%"} past the line${typeof lr.thinSharePct === "number" && lr.thinSharePct >= 25 ? ` (${lr.thinSharePct}% within a hair of it — fragile, so lower conviction)` : ""}.`
    : "";
  const learnedLine = lr
    ? `LEARNED MODEL for ${body.coin} (online logistic regression, ${lr.n} graded rounds, pooled across coins): current read P(OVER) ≈ ${ap.pending && typeof ap.pending.modelOver === "number" ? ap.pending.modelOver + "%" : "n/a"}.${lr.tendencies && lr.tendencies.length ? " Learned tendencies: " + lr.tendencies.join("; ") + "." : ""}${lr.afterUpOverPct != null ? ` Round-to-round: after an UP round it finishes OVER ${lr.afterUpOverPct}% of the time; after a DOWN round ${lr.afterDownOverPct}%.` : ""}${streakBit}${marginBit}${techBit} (15-min direction is near-random, so weight this as a faint tilt, not gospel.)`
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
4. PROVEN EDGES (back-tested on Kalshi 15-min crypto + prediction-market research) — apply these:
   (a) Favorite-longshot bias: favorites are systematically UNDER-priced, longshots over-priced. So a lopsided crowd (≈65%+ one side) that agrees with where price sits and which way flow leans is a high-probability bet — lean INTO it, and NEVER buy the cheap longshot hoping for an upset.
   (b) Drift continuation, not reversion: once the market is decisively one way (≈60%+) with time left, it tends to KEEP drifting that way. Fading a confident, aligned market is a losing template on these short brackets — bet against it only for a specific, nameable reason.
   (c) Panic-fade EXCEPTION — the ONE time to fade is a genuinely EXTREME, sudden spike or dump (a violent over-reaction far beyond the normal wiggle): those tend to snap back, so lean AGAINST the extreme move. Ride moderate momentum; fade only the over-reaction.
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
// The app sends a model id, but it may belong to a DIFFERENT provider than the Worker is set to
// (e.g. the dropdown is on a Claude model while AI_PROVIDER=gemini). Only honor the app's model when
// it matches the active provider; otherwise fall back to AI_MODEL or the provider default — so
// switching providers in the dashboard "just works" without also changing the app's dropdown.
function modelForProvider(provider, model, env) {
  const m = (model || "").toLowerCase();
  const matches = provider === "anthropic" ? m.startsWith("claude")
    : provider === "gemini" ? m.startsWith("gemini")
    : provider === "groq" ? (m.includes("llama") || m.includes("mixtral") || m.includes("gemma") || m.includes("qwen") || m.includes("groq"))
    : false;
  return (matches && model) ? String(model).trim() : (env.AI_MODEL || DEFAULT_MODELS[provider]);
}
async function getAIRead(env, provider, body, crowd, autopicks) {
  const prompt = buildPrompt(body, crowd, autopicks);
  const model = modelForProvider(provider, body.model, env);
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
// --- Server-side technical indicators (computed on oldest→newest close arrays) ---
// Wilder RSI(14): >70 overbought / <30 oversold; a momentum/exhaustion gauge the model learns from.
function rsiOf(closes, period) {
  period = period || 14;
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  let avgG = gain / period, avgL = loss / period;
  for (let i = period + 1; i < closes.length; i++) {           // Wilder smoothing
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}
// EMA series (SMA-seeded); index < period-1 is undefined. Used for MACD.
function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];
  const k = 2 / (period + 1), out = [];
  let ema = values.slice(0, period).reduce((s, x) => s + x, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) { ema = values[i] * k + ema * (1 - k); out[i] = ema; }
  return out;
}
// MACD(12,26,9) histogram = (EMA12−EMA26) − signalEMA9. Positive = bullish momentum building.
function macdHistOf(closes, fast, slow, signal) {
  fast = fast || 12; slow = slow || 26; signal = signal || 9;
  if (!Array.isArray(closes) || closes.length < slow + signal) return null;
  const ef = emaSeries(closes, fast), es = emaSeries(closes, slow), macd = [];
  for (let i = 0; i < closes.length; i++) { if (ef[i] != null && es[i] != null) macd.push(ef[i] - es[i]); }
  if (macd.length < signal) return null;
  const sig = emaSeries(macd, signal), lastSig = sig[sig.length - 1];
  if (lastSig == null) return null;
  return macd[macd.length - 1] - lastSig;   // histogram
}
// Stochastic oscillator (%K, %D): where the close sits in the last `kPeriod` high–low range
// (0 = at the lows, 100 = at the highs); %D is a short SMA of %K. >80 overbought / <20 oversold.
function stochOf(closes, highs, lows, kPeriod, dPeriod) {
  kPeriod = kPeriod || 14; dPeriod = dPeriod || 3;
  const n = closes.length;
  if (!(n >= kPeriod + dPeriod)) return null;
  const ks = [];
  for (let i = kPeriod - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) { if (highs[j] > hi) hi = highs[j]; if (lows[j] < lo) lo = lows[j]; }
    ks.push(hi > lo ? (closes[i] - lo) / (hi - lo) * 100 : 50);
  }
  const k = ks[ks.length - 1], dArr = ks.slice(-dPeriod);
  return { k: Math.round(k), d: Math.round(dArr.reduce((s, x) => s + x, 0) / dArr.length) };
}
// Last price + recent 1-min momentum + per-minute realized volatility from Coinbase 1-min candles.
async function cbMicro(product) {
  const rows = await cbJson(`/products/${product}/candles?granularity=60`);   // [time,low,high,open,close,vol], newest first
  if (!Array.isArray(rows) || rows.length < 12) return null;
  const closes = rows.map((x) => x[4]).reverse();   // oldest → newest
  const highs = rows.map((x) => x[2]).reverse(), lows = rows.map((x) => x[1]).reverse();
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
  const rsi = rsiOf(closes, 14);              // momentum/exhaustion (0–100)
  const macdH = macdHistOf(closes, 12, 26, 9); // signed momentum-of-momentum in price units
  const stoch = stochOf(closes, highs, lows, 14, 3); // close's position in the recent 14-min range
  // Stochastic isn't a learned-model feature (it's strongly correlated with RSI + rangeClose, and a
  // scarce-data model overfits on redundant inputs) — it's surfaced to the AI + panel as context.
  return { price: pN, mom, sig, rngClose, rsi, macdH, stochK: stoch ? stoch.k : null, stochD: stoch ? stoch.d : null };   // sig = per-minute log-return stdev
}
// The price AT a round's close. We grade on the finalized boundary CANDLE close (cbCloseAt) — the
// definitive price at closeMs, which matches the close / next-round strike Robinhood shows and is
// immune to a frozen or thinly-sampled feed. cbAvg60 (the ~60-sec average) is kept only as a
// fallback: it sounds like Kalshi's CF-Benchmarks averaging, but over a volatile final minute (a dip
// that recovers right at the bell) the average lands on the OPPOSITE side from the actual close —
// which is exactly what logged rounds on the wrong side. Both return null if the window is incomplete.
async function cbAvg60(product, closeMs) {
  if (!(closeMs > 0)) return null;
  const rows = await cbJson(`/products/${product}/trades?limit=400`).catch(() => null);
  if (!Array.isArray(rows) || !rows.length) return null;
  const from = closeMs - 60000;
  let sum = 0, n = 0;
  for (const t of rows) {
    const ms = Date.parse(t.time), p = parseFloat(t.price);
    if (ms >= from && ms <= closeMs && p > 0) { sum += p; n++; }
  }
  return n >= 5 ? sum / n : null;
}
async function cbCloseAt(product, closeMs) {
  if (!(closeMs > 0)) return null;
  const rows = await cbJson(`/products/${product}/candles?granularity=60`).catch(() => null);
  if (!Array.isArray(rows)) return null;
  const bucket = Math.floor(closeMs / 1000) - 60;   // 1-min candle covering [closeMs-60s, closeMs]
  for (const r of rows) if (r[0] === bucket) return r[4];   // r = [time,low,high,open,close,vol]
  return null;
}
// The DEFINITIVE outcome straight from Kalshi: once a 15-min "above" market settles, its result is
// "yes" (closed above the strike → OVER) or "no" (→ UNDER) — literally what you bet on, so grading
// against it can't disagree with Robinhood, even on a razor-thin round. Returns null until it has
// actually resolved (so callers fall back to the candle close in the meantime).
async function kalshiResult(ticker) {
  if (!ticker) return null;
  try {
    const r = await kalshiFetch(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`);
    if (!r || !r.ok) return null;
    const m = (await r.json()).market;
    const res = m && typeof m.result === "string" ? m.result.toLowerCase() : "";
    return res === "yes" ? "OVER" : res === "no" ? "UNDER" : null;
  } catch (_) { return null; }
}
// Upgrade rounds graded provisionally on the Coinbase candle close to Kalshi's DEFINITIVE settled
// result. This matters a lot: Kalshi settles on a 60-sec CF-Benchmarks index (many exchanges), so a
// single Coinbase candle close can land on the OPPOSITE side on a thin round — only Kalshi's own
// result is guaranteed to match Robinhood. We now reconcile several recent rounds per cron so the
// arrows converge to Kalshi within one cycle instead of trickling one at a time.
async function reconcileKalshi(rec) {
  const h = rec.history || [];
  for (let i = 0, checked = 0; i < h.length && checked < 12; i++) {  // up to ~12 unconfirmed rounds/coin/cron — clears any backlog so EVERY round converges to Kalshi's settled result
    const e = h[i];
    if (e.src === "kalshi" || !e.ticker) continue;
    checked++;
    const kal = await kalshiResult(e.ticker);
    if (!kal) continue;                                   // not settled yet — retried next cron
    e.src = "kalshi"; e.actual = kal;                     // row-level truth; the caller recomputes all aggregates from history
    if (e.side === "OVER" || e.side === "UNDER") e.correct = (kal === e.side);
  }
  if (h[0]) rec.lastActual = h[0].actual;
}
// Background phone push (ntfy.sh) the moment a coin opens a HIGH-CONFIDENCE, non-SKIP pick — the rare
// rounds the tracker is willing to bet AND several independent reads agree. To enable: set a Worker
// var NTFY_TOPIC (a hard-to-guess topic name, or a full https URL), install the free ntfy app, and
// subscribe to that topic. Optional NTFY_MIN_PROB (default 75). One push per round per coin.
async function notifyHotPicks(env, st) {
  if (!env.NTFY_TOPIC) return;
  const minProb = Number(env.NTFY_MIN_PROB) || 75;
  const hot = [];
  for (const c of AUTO_COINS) {
    const rec = st.coins && st.coins[c], p = rec && rec.pending;
    if (!p || p.notified) continue;
    if ((p.side === "OVER" || p.side === "UNDER") && (p.prob || 0) >= minProb && (p.agree || 0) >= 3) {
      hot.push(`${c} ${p.side} ${p.prob}%`);
      p.notified = true;   // one push per round (persisted by the saveState that follows)
    }
  }
  if (!hot.length) return;
  const url = /^https?:\/\//.test(env.NTFY_TOPIC) ? env.NTFY_TOPIC : `https://ntfy.sh/${env.NTFY_TOPIC}`;
  await fetch(url, {
    method: "POST",
    headers: { Title: "High-confidence pick — not a skip", Priority: "high", Tags: "dart" },
    body: hot.join("   ·   ") + "  — bet this 15-min round",
  }).catch(() => {});
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
// Favorite-longshot bias (the most replicated prediction-market finding; on Kalshi, across 300k+
// contracts, favorites earn a small positive return while cheap longshots bleed — CEPR/Whelan 2025):
// favorites are UNDER-priced, so nudge the market's implied probability a touch further toward the
// favorite. Gentle, capped, and only for a clear favorite.
function favLongshotAdj(p) {
  if (typeof p !== "number") return p;
  const d = p - 0.5;
  if (Math.abs(d) < 0.06) return p;
  return Math.max(0.02, Math.min(0.98, p + Math.max(-0.05, Math.min(0.05, d * 0.12))));
}
// --- Calibration (measure how trustworthy the % is) + scoring ------------------------------------
// Platt scaling maps the model's RAW blended P(OVER) through a learned logistic so a stated "70%"
// actually lands ~70% of the time. For now this is MEASUREMENT-ONLY: we compute and score it, but the
// live pick still uses the raw model (the proven picker, untouched). Flip CALIBRATE_PICKS to true once
// the Brier score proves a correction would help — then the same map is applied before the decision.
const CALIBRATE_PICKS = false;
function calibApply(pRaw, calib) {
  if (!calib || typeof calib.a !== "number") return pRaw;
  const pc = Math.min(0.999, Math.max(0.001, pRaw));
  const z = calib.a * Math.log(pc / (1 - pc)) + (calib.b || 0);
  return Math.min(0.98, Math.max(0.02, 1 / (1 + Math.exp(-z))));
}
// Fit Platt {a,b} on (raw P(OVER) → did it finish OVER). We fit on the RAW probability — never the
// already-calibrated one — so calibration can't feed back on itself. Identity until ~80 graded rounds.
function fitCalib(history) {
  const xs = [], ys = [];
  for (const e of history || []) {
    if (e.actual !== "OVER" && e.actual !== "UNDER") continue;
    const pr = typeof e.pRaw === "number" ? e.pRaw / 100 : (typeof e.pOver === "number" ? e.pOver / 100 : null);
    if (pr == null) continue;
    const pc = Math.min(0.999, Math.max(0.001, pr));
    xs.push(Math.log(pc / (1 - pc))); ys.push(e.actual === "OVER" ? 1 : 0);
  }
  const n = xs.length;
  if (n < 80) return { a: 1, b: 0, n };                          // not enough to calibrate honestly yet
  let a = 1, b = 0; const lr = 0.05, lam = 0.02 / Math.sqrt(n);  // L2 pull toward identity, looser as data grows
  for (let it = 0; it < 400; it++) {
    let ga = 0, gb = 0;
    for (let i = 0; i < n; i++) { const p = 1 / (1 + Math.exp(-(a * xs[i] + b))); const d = p - ys[i]; ga += d * xs[i]; gb += d; }
    ga = ga / n + lam * (a - 1); gb = gb / n + lam * b;
    a -= lr * ga; b -= lr * gb;
  }
  return { a: Math.max(0.2, Math.min(3, a)), b: Math.max(-2, Math.min(2, b)), n };
}
// Scoring on the probabilities we ACTUALLY acted on (the calibrated P(OVER)): Brier + log-loss (lower
// is better; Brier 0.25 = always guessing 50%) and a 5-bucket reliability curve (stated % vs realized).
function scoreCalib(history) {
  let n = 0, brier = 0, ll = 0; const B = 5, bn = [0, 0, 0, 0, 0], by = [0, 0, 0, 0, 0], bp = [0, 0, 0, 0, 0];
  for (const e of history || []) {
    if (e.actual !== "OVER" && e.actual !== "UNDER") continue;
    const pov = typeof e.pOver === "number" ? e.pOver / 100 : null;
    if (pov == null) continue;
    const p = Math.min(0.999, Math.max(0.001, pov)), y = e.actual === "OVER" ? 1 : 0;
    brier += (p - y) * (p - y); ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p)); n++;
    const bi = Math.min(B - 1, Math.floor(p * B)); bn[bi]++; by[bi] += y; bp[bi] += p;
  }
  if (!n) return null;
  const bins = [];
  for (let i = 0; i < B; i++) if (bn[i]) bins.push({ p: Math.round(bp[i] / bn[i] * 100), real: Math.round(by[i] / bn[i] * 100), n: bn[i] });
  return { n, brier: Math.round(brier / n * 1000) / 1000, logloss: Math.round(ll / n * 1000) / 1000, bins };
}
// Market-anchored free pick: crowd price (favorite-longshot-adjusted) nudged by momentum + book +
// the learned model; SKIP near 50/50. modelOver shrinks to 0.5 while the model is cold, so it only
// sways the pick once it has actually learned something. CONFLUENCE-GATED: on a near-efficient
// market the only real edge is several INDEPENDENT reads pointing the same way, so we demand more
// edge to commit when the reads conflict (wider SKIP band) and less when they align — and report how
// many agree (`agree`) and the share of signal-weight in agreement (`conf`) so the pick can be sized.
function freePick(crowdOverPct, mom, obi, modelOver, sig, calib) {
  const parts = [];
  if (typeof crowdOverPct === "number") parts.push({ p: favLongshotAdj(Math.max(0.02, Math.min(0.98, crowdOverPct / 100))), w: 0.55 });
  if (typeof mom === "number") {
    // Panic-fade: a genuinely EXTREME move (≈2σ over the lookback) is an over-reaction that snaps
    // back (Turbine Kalshi-15m backtest; Wen/Bouri 2022) — fade it; moderate drift continues, ride it.
    const z = (typeof sig === "number" && sig > 0) ? mom * 3.16 / sig : 0;
    if (Math.abs(z) >= 2.0) { const s = Math.min(1, (Math.abs(z) - 2.0) / 2.0); parts.push({ p: Math.max(0.38, Math.min(0.62, 0.5 - (z > 0 ? 1 : -1) * (0.05 + 0.09 * s))), w: 0.18 }); }
    else parts.push({ p: Math.max(0.4, Math.min(0.6, 0.5 + 0.5 * Math.tanh(mom * 120))), w: 0.15 });
  }
  if (typeof obi === "number") parts.push({ p: Math.max(0.3, Math.min(0.7, 0.5 + 0.5 * Math.tanh(2 * obi))), w: 0.15 });
  if (typeof modelOver === "number") parts.push({ p: Math.max(0.05, Math.min(0.95, modelOver)), w: 0.2 });
  if (!parts.length) return null;
  let ws = 0, ac = 0; for (const x of parts) { ws += x.w; ac += x.p * x.w; }
  const pRaw = ac / ws;
  const pOver = CALIBRATE_PICKS ? calibApply(pRaw, calib) : pRaw;   // measurement-only by default: the pick uses the RAW model (unchanged); calibration is only scored
  const dir = pOver >= 0.5 ? 1 : -1;
  // Confluence: weighted share of reads leaning the SAME way as the blend (and a plain count).
  let agreeW = 0, agreeN = 0, totW = 0;
  for (const x of parts) { totW += x.w; if ((x.p - 0.5) * dir > 0.005) { agreeW += x.w; agreeN++; } }
  const conf = totW ? agreeW / totW : 0;
  // Commit threshold widens as the reads split: ±0.08 when fully aligned (the old band) up to ±0.18
  // when they're at odds — so a conflicted, barely-lopsided blend now SKIPs instead of guessing.
  const band = 0.08 + 0.10 * (1 - conf);
  const side = pOver >= 0.5 + band ? "OVER" : pOver <= 0.5 - band ? "UNDER" : "SKIP";
  return { pOver, pRaw, side, conf: Math.round(conf * 100) / 100, agree: agreeN };
}
// Rank all coins by how confident their CURRENT-round pick is, for the app's "best bet now" ticker.
// Confidence = how lopsided the pick is (edge) × how much INDEPENDENT confluence backs it (conf) ×
// the coin's shrunk historical reliability (a real track record is trusted more, but only once it
// has the samples to mean something). SKIP picks are excluded — there's no confident bet there.
function rankBest(st) {
  const out = [];
  for (const coin of AUTO_COINS) {
    const rec = st.coins && st.coins[coin];
    const p = rec && rec.pending;
    if (!p || (p.side !== "OVER" && p.side !== "UNDER") || typeof p.prob !== "number") continue;
    const edge = Math.max(0, (p.prob - 50) / 50);                       // 0 … ~0.9 — how lopsided
    const conf = typeof p.conf === "number" ? p.conf : 0.5;            // confluence share, 0 … 1
    const n = rec.graded || 0, shr = Math.min(1, n / 30);              // trust the record only with samples
    const reliab = typeof rec.hitRatePct === "number" ? (0.5 + (rec.hitRatePct / 100 - 0.5) * shr) : 0.5;
    const score = edge * (0.6 + 0.4 * conf) * (0.6 + 0.8 * reliab);
    out.push({
      coin, side: p.side, prob: p.prob,
      conf: typeof p.conf === "number" ? Math.round(p.conf * 100) / 100 : null,
      agree: typeof p.agree === "number" ? p.agree : null,
      hitRatePct: typeof rec.hitRatePct === "number" ? rec.hitRatePct : null,
      betRatePct: typeof rec.betRatePct === "number" ? rec.betRatePct : null,     // coverage — how often it commits
      shadowHitPct: typeof rec.shadowHitPct === "number" ? rec.shadowHitPct : null, // if it bet every round
      graded: n, seen: rec.shadowGraded || rec.seen || 0, closeMs: p.closeMs || null, score: Math.round(score * 1000) / 1000,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
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
const FEATS = ["book", "momentum", "volregime", "crowdLean", "lastDir", "todSin", "todCos", "rangeClose", "rsi", "macdHist", "lastMargin"];
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
  // RSI re-centered to 0 at 50 (so +1 = fully overbought, −1 = oversold); MACD histogram scaled by
  // price (it grows with price level) then squashed so a strong cross saturates near ±1.
  const rsi = typeof signals.rsi === "number" ? clampF((signals.rsi - 50) / 50, -1, 1) : 0;
  const macdH = (typeof signals.macdH === "number" && typeof signals.price === "number" && signals.price > 0)
    ? Math.tanh(signals.macdH / signals.price * 800) : 0;
  // How far the LAST round settled past its line (signed %): lastDir gave only the direction, this
  // adds the magnitude — so the model can learn whether a big over-shoot tends to continue or revert.
  const lastMargin = typeof signals.lastMargin === "number" ? Math.tanh(signals.lastMargin * 4) : 0;
  const hourFrac = ((new Date(ts).getUTCHours()) + new Date(ts).getUTCMinutes() / 60) / 24;
  return [obi, mom, volr, crowdLean, lastDir, Math.sin(2 * Math.PI * hourFrac), Math.cos(2 * Math.PI * hourFrac), rngClose, rsi, macdH, lastMargin];
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
  if (w.length > 8 && Math.abs(w[8]) > 0.12) tend.push(w[8] > 0 ? "a high RSI (overbought) has tended to keep pushing OVER (momentum)" : "a high RSI has tended to fade back UNDER (overbought = exhaustion)");
  if (w.length > 9 && Math.abs(w[9]) > 0.12) tend.push(w[9] > 0 ? "a rising MACD histogram has led to OVER" : "a rising MACD histogram has led to UNDER");
  if (w.length > 10 && Math.abs(w[10]) > 0.12) tend.push(w[10] > 0 ? "a big over-shoot last round tends to keep going (momentum)" : "a big over-shoot last round tends to snap back (mean-reversion)");
  // round-to-round transition rates from graded history (interpretable regime read)
  let uu = 0, un = 0, du = 0, dn = 0;
  for (let i = 0; i + 1 < history.length; i++) {
    const prev = history[i + 1].actual, cur = history[i].actual;   // history is newest-first
    if (prev === "OVER") { cur === "OVER" ? uu++ : un++; } else if (prev === "UNDER") { cur === "OVER" ? du++ : dn++; }
  }
  const afterUp = uu + un >= 5 ? Math.round(uu / (uu + un) * 100) : null;
  const afterDown = du + dn >= 5 ? Math.round(du / (du + dn) * 100) : null;
  // Recent OVER/UNDER streak (the "arrows" pattern) + how decisively rounds have been settling.
  let streak = 0; const sDir = history[0] && history[0].actual;
  if (sDir === "OVER" || sDir === "UNDER") { for (let i = 0; i < history.length && history[i].actual === sDir; i++) streak++; }
  const margins = history.slice(0, 12).map((x) => x.overPct).filter((x) => typeof x === "number");
  let avgMarginAbsPct = null, thinSharePct = null;
  if (margins.length >= 4) {
    avgMarginAbsPct = Math.round(margins.reduce((s, x) => s + Math.abs(x), 0) / margins.length * 1e3) / 1e3;
    thinSharePct = Math.round(margins.filter((x) => Math.abs(x) < 0.05).length / margins.length * 100);   // within ~0.05% of the line
  }
  // Plain-English regime read from the recent transition rates: does direction tend to flip
  // (choppy / mean-reverting) or persist (trending)? "stay" = P(same direction as last round).
  let regime = null;
  const tot = uu + un + du + dn;
  if (tot >= 10) {
    const stay = (uu + dn) / tot;   // share of rounds that repeated the prior direction
    regime = stay >= 0.6 ? "trending — rounds tend to repeat direction" : stay <= 0.4 ? "choppy — rounds tend to alternate (mean-reverting)" : "mixed — no strong round-to-round pattern";
  }
  // Honest confidence by sample size: a true 53% edge needs ~2,500 graded rounds to confirm.
  const confidence = coin.n >= 2500 ? "established" : coin.n >= 600 ? "building" : "warming up";
  return { n: coin.n, confidence, tendencies: tend, afterUpOverPct: afterUp, afterDownOverPct: afterDown,
    streak: streak >= 2 ? { dir: sDir, len: streak } : null, avgMarginAbsPct, thinSharePct, regime };
}

async function runCoinPick(env, coin, st) {
  const series = env["KALSHI_SERIES_" + coin], product = CB_PRODUCT[coin];
  if (!series || !product) return;
  const global = st.global;
  const [micro, obi] = await Promise.all([
    cbMicro(product).catch(() => null),
    cbObi(product).catch(() => null),
  ]);
  // The cron can't rely on the app to keep the Kalshi crowd cache warm (the app is usually closed
  // when this runs), and Kalshi 429s Cloudflare's shared egress IPs — so make a few attempts to land
  // FRESH data and PERSIST a success, keeping the shared cache (and the app/best endpoints) warm.
  // Without this the cron routinely saw only stale data and locked no pick — the "stopped logging
  // while I was away" bug. A couple of 1s waits only happen when a fetch is actually failing.
  let crowd = null;
  for (let i = 0; i < 3; i++) {
    crowd = await getKalshiCrowd(env, series, true).catch(() => null);
    if (crowd && !crowd.stale) break;
    if (i < 2) await sleep(1000);
  }
  const rec = st.coins[coin] || (st.coins[coin] = { coin, pending: null, history: [], graded: 0, correct: 0 });
  const coinModel = padModel(rec.model || newModel());

  // 1) grade the previous pick once its round has closed — and LEARN from the outcome.
  // Settle against the price AT THE CLOSE (the finalized 1-min candle ending at closeMs), NOT the
  // live price when this cron happens to run — a late cron or a post-close tick used to flip rounds.
  const p = rec.pending;
  if (p && Date.now() >= (p.closeMs || 0) && typeof p.strike === "number") {
    let settle = await cbCloseAt(product, p.closeMs);                        // the finalized boundary candle close — definitive, matches Robinhood's close / next-strike
    if (settle == null) settle = await cbAvg60(product, p.closeMs);           // fallback: ~60-sec average only if that candle hasn't posted yet
    if (settle == null && micro && typeof micro.price === "number") settle = micro.price;   // last resort if both are missing
    // Grade immediately on the candle close — accurate, and ZERO extra Kalshi load on the critical
    // path. reconcileKalshi() (at the end of this function, wrapped) upgrades it to Kalshi's
    // definitive result on a later cron. We now grade EVERY round, including the ones it SKIPped:
    // a SKIP still records what it leaned + the real outcome (shadow-grading) so the app can show
    // both the disciplined hit-rate (bets only) AND an honest "if it bet every round" hit-rate, and
    // the coverage (how often it actually bets). The model learns from every round either way.
    const actual = (typeof settle === "number" ? (settle > p.strike ? "OVER" : settle < p.strike ? "UNDER" : "FLAT") : null);
    if (actual && actual !== "FLAT") {
      const bet = (p.side === "OVER" || p.side === "UNDER");
      const lean = bet ? p.side : (p.pOver >= 50 ? "OVER" : "UNDER");          // the side it leaned, even on a SKIP
      const correct = bet ? (actual === p.side) : null;
      const over$ = (typeof settle === "number") ? Math.round((settle - p.strike) * 100) / 100 : null;
      const overPct = (over$ != null && p.strike > 0) ? Math.round((settle - p.strike) / p.strike * 1e5) / 1e3 : null;
      rec.history.unshift({ time: p.label, ts: p.ts || null, side: p.side, lean, actual, correct, skipped: !bet, prob: p.prob, pOver: typeof p.pOver === "number" ? p.pOver : null, pRaw: typeof p.pRaw === "number" ? p.pRaw : null, strike: p.strike, close: typeof settle === "number" ? settle : null, over: over$, overPct: overPct, ticker: p.ticker || null, src: "candle" });
      if (rec.history.length > 300) rec.history.pop();
      rec.lastMargin = overPct;   // signed % the last round settled past its line (mean-reversion / momentum tell)
      rec.lastActual = actual;
      // online update — learn from EVERY round (bet or skip): open-features -> did price finish OVER (1) or UNDER (0)?
      const closeOver = typeof settle === "number" ? (settle > (typeof p.openPrice === "number" ? p.openPrice : p.strike) ? 1 : 0) : (actual === "OVER" ? 1 : 0);
      if (Array.isArray(p.feat)) { trainModel(coinModel, p.feat, closeOver); trainModel(global, p.feat, closeOver); }
    }
    rec.pending = null;
  }

  // 2) Lock ONE pick per round, and never touch it again until that round closes.
  //    INTEGRITY: if a pick is already pending we DON'T re-pick (the !rec.pending gate) — re-picking
  //    mid-round is what would let the tracked side drift to the near-certain outcome and fake a
  //    ~100% hit rate. We also never lock on an ALREADY-DECIDED market: a round must still have real
  //    time left (>=6 min) AND odds that aren't pinned (3-97%); a market sitting at 0/100 is settled,
  //    and "grading" a pick made on it is the exact free-money trap this guard prevents.
  //    COVERAGE: the floor is 6 (not 12) min because free-tier crons fire LATE — often several
  //    minutes past the boundary — so by the time we run, a genuinely fresh round may show only
  //    ~7-10 min left; 6 still guarantees the outcome is open. We only act on FRESH crowd data
  //    (a stale cache carries an old close time whose round already settled), so an app-closed cron
  //    that couldn't reach Kalshi makes no pick rather than a bogus one.
  if (!rec.pending) {
    const nowMs = Date.now();
    let mkt = null;
    if (crowd && !crowd.stale) {
      for (const c of [crowd, crowd.next]) {                        // markets[0] (soonest) then markets[1] (next)
        if (!c || !c.closeTime || c.strike == null || typeof c.overPct !== "number") continue;
        if (c.overPct <= 3 || c.overPct >= 97) continue;            // already-decided market — never lock a fake pick
        const left = (new Date(c.closeTime).getTime() - nowMs) / 60000;
        if (left >= 6 && left <= 16.5) { mkt = c; break; }          // an open, still-undecided round (tolerates a late cron)
      }
    }
    if (mkt) {
      const sigVals = { crowdOver: mkt.overPct, mom: micro && micro.mom, obi: obi, sig: micro && micro.sig, rngClose: micro && micro.rngClose, rsi: micro && micro.rsi, macdH: micro && micro.macdH, price: micro && micro.price, lastMargin: rec.lastMargin };
      const nowTs = nowMs;
      const feat = featuresFor(coinModel, sigVals, rec.lastActual, nowTs);
      if (micro && typeof micro.sig === "number" && micro.sig > 0) coinModel.avgSig = coinModel.avgSig == null ? micro.sig : 0.97 * coinModel.avgSig + 0.03 * micro.sig;
      const modelOver = predictBlend(coinModel, global, feat);      // learned P(OVER) for this round
      const fp = freePick(mkt.overPct, micro && micro.mom, obi, modelOver, micro && micro.sig, rec.calib);
      if (fp) {
        const d = new Date(nowTs);
        rec.pending = {
          coin, ticker: mkt.ticker || null, strike: mkt.strike, openPrice: micro ? micro.price : mkt.strike, side: fp.side,
          pOver: Math.round(fp.pOver * 100),
          pRaw: Math.round(fp.pRaw * 100),                          // pre-calibration blend — fit the calibrator on this, never on itself
          prob: Math.round((fp.side === "UNDER" ? 1 - fp.pOver : fp.pOver) * 100),
          conf: fp.conf, agree: fp.agree,                            // confluence: share of reads (0–1) + count agreeing
          modelOver: Math.round(modelOver * 100),
          closeMs: new Date(mkt.closeTime).getTime(),                // grade exactly when THIS round closes
          ts: nowTs,                                                 // client formats this to 12-hour local time
          label: pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC",   // fallback for older clients
          feat,                                                      // remembered so the next run can learn from it
          signals: { crowdOver: Math.round(mkt.overPct), mom: micro ? round4(micro.mom) : null, obi: obi != null ? Math.round(obi * 100) / 100 : null, rsi: micro && typeof micro.rsi === "number" ? Math.round(micro.rsi) : null, macdH: micro && typeof micro.macdH === "number" ? round4(micro.macdH) : null, stochK: micro && typeof micro.stochK === "number" ? micro.stochK : null, stochD: micro && typeof micro.stochD === "number" ? micro.stochD : null },
        };
      }
    }
  }
  rec.model = coinModel;
  // Kalshi upgrade runs LAST and wrapped — off the critical path, so a Kalshi hiccup can't stall the
  // grade/pick above or get us rate-limited into a failed crowd fetch next cron.
  try { await reconcileKalshi(rec); } catch (_) {}
  // Recompute ALL scoreboard stats from history — one source of truth, no counter drift through
  // reconcile or shadow-grading. bet = committed OVER/UNDER; shadow = EVERY round by the side it
  // leaned (so we can show "if it bet every round" + how often it actually bets / coverage).
  let g = 0, c = 0, sg = 0, sc = 0;
  for (const e of rec.history) {
    if (e.actual !== "OVER" && e.actual !== "UNDER") continue;
    const ln = e.lean || e.side;
    if (ln === "OVER" || ln === "UNDER") { sg++; if (ln === e.actual) sc++; }
    if (e.side === "OVER" || e.side === "UNDER") { g++; if (e.side === e.actual) c++; }
  }
  rec.graded = g; rec.correct = c;
  rec.shadowGraded = sg; rec.shadowCorrect = sc; rec.seen = sg;     // seen = every round it evaluated (bet or skip)
  rec.hitRatePct = g ? Math.round(c / g * 100) : null;
  rec.shadowHitPct = sg ? Math.round(sc / sg * 100) : null;        // if it had bet every round
  rec.betRatePct = sg ? Math.round(g / sg * 100) : null;           // coverage — how often it actually commits
  // The DEFINITIVE hit-rate: only rounds Kalshi has actually settled (src==="kalshi"). reconcileKalshi
  // upgrades every round to this within a cron or two, so it converges to exactly what Robinhood paid.
  let cg = 0, cc = 0;
  for (const e of rec.history) {
    if (e.src === "kalshi" && (e.actual === "OVER" || e.actual === "UNDER") && (e.side === "OVER" || e.side === "UNDER")) { cg++; if (e.side === e.actual) cc++; }
  }
  rec.confirmedGraded = cg; rec.confirmedCorrect = cc; rec.confirmedHitPct = cg ? Math.round(cc / cg * 100) : null;
  rec.calib = fitCalib(rec.history);     // Platt {a,b} — applied to the NEXT round's pick (read back in step 2)
  rec.score = scoreCalib(rec.history);   // Brier / log-loss / reliability curve — surfaced in the app
  rec.learned = modelInsights(coinModel, global, rec.history);     // plain-language read for the prompt + app (post-reconcile)
  rec.updated = Date.now();
  // No per-coin write here — the whole auto-tracker is persisted once per cron run by saveState().
}
