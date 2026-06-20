/**
 * Cloudflare Worker — AI Co-Pilot for the 15-Min Tracker.
 *
 * Fetches live Kalshi crowd odds (browsers can't, CORS) and asks an LLM to weigh
 * the app's indicators + 7-day track record against the crowd. The LLM provider is
 * switchable with one env var — keep Claude (paid, sharpest) or a free tier.
 *
 * --- Env vars (Cloudflare dashboard → the Worker → Settings → Variables) ---
 * Pick ONE provider by adding its key (or force it with AI_PROVIDER):
 *   ANTHROPIC_API_KEY  (Secret) — Claude. console.anthropic.com  (paid, ~1–3¢/read)
 *   GEMINI_API_KEY     (Secret) — Google Gemini. aistudio.google.com/apikey  (free tier)
 *   GROQ_API_KEY       (Secret) — Groq. console.groq.com/keys  (free tier, very fast)
 *
 * Optional:
 *   AI_PROVIDER  (Text)  — "anthropic" | "gemini" | "groq". Default: whichever key exists.
 *   AI_MODEL     (Text)  — override the model id for the chosen provider.
 *   KALSHI_SERIES_ETH / _BTC / _SOL (Text) — Kalshi 15-min series tickers for crowd odds.
 *   ACCESS_TOKEN (Secret) — if set, requests must include ?token=THATVALUE.
 *
 * A coin with no KALSHI_SERIES_* just returns crowd:null; the AI read still runs.
 */

const KALSHI_BASE = "https://external-api.kalshi.com/trade-api/v2";

const DEFAULT_MODELS = {
  anthropic: "claude-opus-4-8",
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
        try {
          // single Kalshi call to keep rate-limit pressure low
          const r = await fetch(`${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(t)}&status=open&limit=200`, { headers: KALSHI_HEADERS });
          const b = await r.json().catch(() => ({}));
          const ms = (b.markets || []).filter((m) => m.close_time).sort((a, c) => new Date(a.close_time) - new Date(c.close_time));
          const m = ms[0];
          let over = m ? overFromMarket(m) : null;
          let obOver = null;
          if (over == null && m) obOver = await overFromOrderbook(m.ticker);   // list row had no quotes → try the book
          return json({ coin, seriesTicker: t, httpStatus: r.status, openMarkets: (b.markets || []).length, rawMarket: m || null, overFromMarket: over, overFromOrderbook: obOver, overPct: over != null ? over : obOver });
        } catch (e) { return json({ coin, seriesTicker: t, error: e.message }, 502); }
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
    if (seriesTicker) { try { crowd = await getKalshiCrowd(seriesTicker); } catch (_) { crowd = null; } }

    let ai;
    try { ai = await getAIRead(env, provider, body, crowd); }
    catch (e) { ai = { verdict: "SKIP", confidence: "Low", edge: "n/a", rationale: "AI error: " + e.message }; }

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
const crowdCache = new Map(); // seriesTicker -> { t, data } : avoid hammering Kalshi
const FRESH_MS = 60000;   // serve cache without re-fetching for 60s
const STALE_MS = 600000;  // on error, keep serving the last good value for up to 10 min
async function getKalshiCrowd(seriesTicker) {
  const cached = crowdCache.get(seriesTicker);
  if (cached && Date.now() - cached.t < FRESH_MS) return cached.data; // 60s fresh cache
  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=200`;
  try {
    const r = await fetch(url, { headers: KALSHI_HEADERS });
    if (!r.ok) throw new Error("kalshi " + r.status);
    const data = await r.json();
    const markets = (data.markets || []).filter((m) => m.close_time);
    if (!markets.length) return staleOrNull(cached);
    markets.sort((a, b) => new Date(a.close_time) - new Date(b.close_time));
    const m = markets[0];
    let over = overFromMarket(m);
    if (over == null) over = await overFromOrderbook(m.ticker);   // illiquid list row → derive mid from the order book
    if (over == null) return staleOrNull(cached);
    const result = { overPct: over, source: "Kalshi", ticker: m.ticker, closeTime: m.close_time };
    crowdCache.set(seriesTicker, { t: Date.now(), data: result });
    return result;
  } catch (e) {
    // Rate-limited or down: serve the last good value (marked stale) instead of n/a.
    const stale = staleOrNull(cached);
    if (stale) return stale;
    throw e;
  }
}
// Returns the cached value (flagged stale) if it's still within the stale window, else null.
function staleOrNull(cached) {
  if (cached && Date.now() - cached.t < STALE_MS) return { ...cached.data, stale: true };
  return null;
}
function avg(a, b) {
  const xs = [a, b].filter((v) => typeof v === "number");
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

// Implied OVER % straight from a market row's quote fields (cents = probability).
function overFromMarket(m) {
  if (!m) return null;
  let over = avg(m.yes_bid, m.yes_ask);
  if (over == null && typeof m.last_price === "number" && m.last_price > 0) over = m.last_price;
  return over;
}

// Fallback when the list row carries no quotes: pull the order book and take the
// YES midpoint. Kalshi books are priced in cents; yes_ask ≈ 100 − best NO bid.
async function overFromOrderbook(ticker) {
  try {
    const r = await fetch(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}/orderbook?depth=1`, { headers: KALSHI_HEADERS });
    if (!r.ok) return null;
    const d = await r.json();
    const ob = (d && d.orderbook) || {};
    const yesBid = bestPrice(ob.yes);
    const noBid = bestPrice(ob.no);
    const yesAsk = noBid != null ? 100 - noBid : null;
    return avg(yesBid, yesAsk);
  } catch (_) { return null; }
}
// Best bid on one side: rows are [price_cents, size]; the highest price is the top bid.
function bestPrice(side) {
  if (!Array.isArray(side) || !side.length) return null;
  let best = null;
  for (const lvl of side) {
    const p = Array.isArray(lvl) ? lvl[0] : null;
    if (typeof p === "number" && (best == null || p > best)) best = p;
  }
  return best;
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
function buildPrompt(body, crowd) {
  const indicators = (body.indicators || []).map((i) => `- ${i.name}: ${i.value} (${i.label})`).join("\n");
  const h = body.history || {};
  const recent = (h.recent || []).map((x) => `${x.time} ${x.pick}->${x.actual} ${x.correct ? "OK" : "X"}`).join(", ");
  const historyLine = h.graded
    ? `Track record (last ${h.graded} graded rounds): overall hit rate ${h.hitRatePct}%, current streak ${h.currentStreak}, OVER picks ${h.overHitPct ?? "n/a"}% right, UNDER picks ${h.underHitPct ?? "n/a"}% right. Recent: ${recent}.`
    : `No graded history yet.`;
  const crowdLine = crowd && typeof crowd.overPct === "number"
    ? `The Kalshi crowd currently prices OVER at ~${crowd.overPct.toFixed(0)}% probability${crowd.stale ? " (last known, odds feed briefly stale)" : ""}.`
    : `Live crowd odds are unavailable for this round.`;

  // Phase awareness: in the final stretch of a round the current market is all but
  // decided, so the useful question is the NEXT round, which opens at ~the current price.
  const secs = typeof body.secondsLeft === "number" ? body.secondsLeft : null;
  const nextRound = secs != null && secs <= 120;
  const scopeLine = nextRound
    ? `IMPORTANT: only ~${secs}s remain in the CURRENT round, so it is effectively settled — DO NOT advise on it. Make your call for the NEXT 15-minute round, which opens in ~${secs}s. At that open the "price to beat" resets to roughly the current live price (${body.price}), so judge whether ${body.coin} will be ABOVE ~${body.price} fifteen minutes after the next round begins. Use the live indicators below as your most-recent read of momentum into that open.`
    : `Judge the CURRENT round: will ${body.coin} close ABOVE its round-open "price to beat" by the time this round ends?`;
  const question = nextRound
    ? `You are a disciplined short-term trading assistant for a 15-minute OVER/UNDER market on ${body.coin}, recommending the NEXT round before it begins.`
    : `You are a disciplined short-term trading assistant for a 15-minute OVER/UNDER market: will ${body.coin} close ABOVE its round-open "price to beat" 15 minutes from now?`;

  return `${question}

${scopeLine}

Live price: ${body.price}
Price to beat (strike)${nextRound ? " for the current round (already settling)" : ""}: ${body.strike}
The user's indicator engine pick: ${body.pick}

Live 15-minute indicators:
${indicators}

${historyLine}

${crowdLine}

Decide OVER, UNDER, or SKIP${nextRound ? " for the NEXT round" : ""}. Weigh the technicals, the user's historical hit rate (trust directions that have actually worked for them), AND the crowd. The strongest opportunities are when a well-supported technical read DISAGREES with the crowd (the crowd may be overreacting). If signals are mixed, the edge is small, or the crowd already strongly agrees with a weak technical case, prefer SKIP. Set "edge" to "against-crowd" if your verdict opposes the crowd's lean, "with-crowd" if it matches, else "n/a".

Be blunt and terse. The "rationale" is ONE short sentence, max ~100 characters — name the single deciding factor only. No preamble, no hedging, no restating the question.

Respond with ONLY a JSON object, no markdown, exactly:
{"verdict":"OVER|UNDER|SKIP","confidence":"Low|Medium|High","edge":"with-crowd|against-crowd|n/a","rationale":"one short blunt sentence"}`;
}

function normalize(o) {
  o = o || {};
  return {
    verdict: ["OVER", "UNDER", "SKIP"].includes(o.verdict) ? o.verdict : "SKIP",
    confidence: ["Low", "Medium", "High"].includes(o.confidence) ? o.confidence : "Low",
    edge: ["with-crowd", "against-crowd", "n/a"].includes(o.edge) ? o.edge : "n/a",
    rationale: String(o.rationale || "").slice(0, 160),
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
              verdict: { type: "string", enum: ["OVER", "UNDER", "SKIP"] },
              confidence: { type: "string", enum: ["Low", "Medium", "High"] },
              edge: { type: "string", enum: ["with-crowd", "against-crowd", "n/a"] },
              rationale: { type: "string" },
            },
            required: ["verdict", "confidence", "edge", "rationale"],
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
