/**
 * Cloudflare Worker — AI Co-Pilot for the 15-Min Tracker.
 *
 * Does two things the static app can't do on its own:
 *   1. Fetches live Kalshi crowd odds (Kalshi blocks browser CORS).
 *   2. Calls Claude (server-side, so the API key stays secret) to weigh the
 *      app's indicators + 7-day track record against the crowd.
 *
 * Env vars (set in the Cloudflare dashboard → Settings → Variables):
 *   ANTHROPIC_API_KEY   (Secret, required)  — your Anthropic API key.
 *   KALSHI_SERIES_ETH   (Text, optional)    — Kalshi 15-min series ticker for ETH.
 *   KALSHI_SERIES_BTC   (Text, optional)    — ...for BTC.
 *   KALSHI_SERIES_SOL   (Text, optional)    — ...for SOL.
 *   ACCESS_TOKEN        (Secret, optional)   — if set, requests must send the
 *                                             same value as ?token=... (basic abuse guard).
 *
 * If a coin's KALSHI_SERIES_* is not set, crowd odds come back as null and the
 * AI read still runs on the indicators + history alone.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const KALSHI_BASE = "https://external-api.kalshi.com/trade-api/v2";
const MODEL = "claude-opus-4-8";

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten to your Pages origin if you like
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    if (env.ACCESS_TOKEN) {
      const token = new URL(request.url).searchParams.get("token");
      if (token !== env.ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

    const coin = String(body.coin || "ETH").toUpperCase();

    // 1) Crowd odds from Kalshi (optional — only if a series ticker is configured).
    let crowd = null;
    const seriesTicker = env["KALSHI_SERIES_" + coin];
    if (seriesTicker) {
      try { crowd = await getKalshiCrowd(seriesTicker); } catch (_) { crowd = null; }
    }

    // 2) Claude read.
    let ai;
    if (env.ANTHROPIC_API_KEY) {
      try { ai = await getClaudeRead(env.ANTHROPIC_API_KEY, body, crowd); }
      catch (e) { ai = { verdict: "SKIP", confidence: "Low", edge: "n/a", rationale: "AI error: " + e.message }; }
    } else {
      ai = { verdict: "SKIP", confidence: "Low", edge: "n/a", rationale: "ANTHROPIC_API_KEY is not set on the Worker." };
    }

    return json({ crowd, ai });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

// --- Kalshi -------------------------------------------------------------
async function getKalshiCrowd(seriesTicker) {
  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=200`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("kalshi " + r.status);
  const data = await r.json();
  const markets = (data.markets || []).filter((m) => m.close_time);
  if (!markets.length) return null;
  // The nearest-expiry open market is the round currently being traded.
  markets.sort((a, b) => new Date(a.close_time) - new Date(b.close_time));
  const m = markets[0];
  // yes price (cents) ≈ implied probability the market resolves YES (price up / over).
  const yesMid = avg(m.yes_bid, m.yes_ask);
  if (yesMid == null) return null;
  return { overPct: yesMid, source: "Kalshi", ticker: m.ticker, closeTime: m.close_time };
}

function avg(a, b) {
  const xs = [a, b].filter((v) => typeof v === "number");
  if (!xs.length) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

// --- Claude -------------------------------------------------------------
async function getClaudeRead(apiKey, body, crowd) {
  const indicators = (body.indicators || [])
    .map((i) => `- ${i.name}: ${i.value} (${i.label})`)
    .join("\n");

  const h = body.history || {};
  const recent = (h.recent || [])
    .map((x) => `${x.time} ${x.pick}->${x.actual} ${x.correct ? "OK" : "X"}`)
    .join(", ");
  const historyLine = h.graded
    ? `Track record (last ${h.graded} graded rounds): overall hit rate ${h.hitRatePct}%, current streak ${h.currentStreak}, OVER picks ${h.overHitPct ?? "n/a"}% right, UNDER picks ${h.underHitPct ?? "n/a"}% right. Recent: ${recent}.`
    : `No graded history yet.`;

  const crowdLine =
    crowd && typeof crowd.overPct === "number"
      ? `The Kalshi crowd currently prices OVER at ~${crowd.overPct.toFixed(0)}% probability.`
      : `Live crowd odds are unavailable for this round.`;

  const prompt =
`You are a disciplined short-term trading assistant for a 15-minute OVER/UNDER market: will ${body.coin} close ABOVE its round-open "price to beat" 15 minutes from now?

Live price: ${body.price}
Price to beat (strike): ${body.strike}
The user's indicator engine pick: ${body.pick}

Live 15-minute indicators:
${indicators}

${historyLine}

${crowdLine}

Decide OVER, UNDER, or SKIP. Weigh the technicals, the user's historical hit rate (trust directions that have actually worked for them), AND the crowd. The strongest opportunities are when a well-supported technical read DISAGREES with the crowd (the crowd may be overreacting). If signals are mixed, the edge is small, or the crowd already strongly agrees with a weak technical case, prefer SKIP. Set "edge" to "against-crowd" if your verdict opposes the crowd's lean, "with-crowd" if it matches, else "n/a". Keep "rationale" under 240 characters.`;

  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
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

  if (!r.ok) {
    const t = await r.text();
    throw new Error("anthropic " + r.status + " " + t.slice(0, 140));
  }
  const data = await r.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("no text block in response");
  return JSON.parse(textBlock.text);
}
