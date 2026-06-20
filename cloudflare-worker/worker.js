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

    let ai;
    try { ai = await getAIRead(env, provider, body, crowd); }
    catch (e) { ai = { verdict: "SKIP", confidence: "Low", edge: "n/a", probOver: 50, rationale: "AI error: " + e.message }; }

    return json({ crowd, ai, provider });
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
async function getKalshiCrowd(env, seriesTicker) {
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
      if (env.CROWD_KV) await kvPut(env, seriesTicker, entry);   // share with other isolates
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

function buildPrompt(body, crowd) {
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

HOW TO DECIDE — reason in this order, then output only JSON:
1. Anchor on the market price. It is hard to beat; do not re-derive it. Your job is to spot the rare moments it's wrong or slow.
2. THIS round: the position model P(OVER) is usually the best estimate. If price is well above/below the line with little time left, it's nearly decided — do not fight it on a hunch.
3. NEXT round (≈50/50 by construction): only a real, fresh edge justifies a side — strong short-term momentum or order-book pressure the crowd hasn't priced yet, or a calibrated pattern from the track record. No edge → SKIP.
4. Calibrate to the record: if a confidence band historically won LESS than it claimed, pull your number toward 50. Lean into setups that have actually paid off here.
5. Output probOver = your probability OVER wins (0–100). Turn it into a side only past a real margin: probOver ≥ 58 → OVER, ≤ 42 → UNDER, else SKIP. Sitting out is winning when there's no edge — expect to SKIP often.

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
async function getAIRead(env, provider, body, crowd) {
  const prompt = buildPrompt(body, crowd);
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
              probOver: { type: "integer", minimum: 0, maximum: 100 },
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
