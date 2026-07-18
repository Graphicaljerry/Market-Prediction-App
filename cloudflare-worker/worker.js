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
          const r = await kalshiFetch(env, `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(t)}&status=open&limit=200`);
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
      // Add &dl=1 to receive it as a DOWNLOADED .json file (Content-Disposition: attachment) —
      // the one-tap way to export the record on iPhone/iPad (Safari drops it into Files),
      // instead of select-all-copying a wall of JSON. Read-only, same data either way.
      if (u.searchParams.has("picks")) {
        const st = await loadState(env);
        const coin = (u.searchParams.get("picks") || "").toUpperCase();
        const body = coin ? (st.coins[coin] || { coin, empty: true }) : (st.coins || {});
        if (u.searchParams.has("dl")) {
          const name = "tracker-picks-" + (coin || "all") + "-" + new Date().toISOString().slice(0, 10) + ".json";
          return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="' + name + '"', ...CORS } });
        }
        return json(body);
      }
      // Permanent round archive: ?archive lists the available days; ?archive=YYYY-MM-DD returns that
      // day's graded rounds for every coin (add &dl=1 to download the file). Unlike ?picks — which only
      // holds the newest 300 rounds per coin — this survives forever (see archiveRounds).
      if (u.searchParams.has("archive")) {
        if (!env.CROWD_KV) return json({ error: "no KV namespace bound" }, 500);
        const day = u.searchParams.get("archive") || "";
        if (!day) {
          const days = [];
          let cursor;
          do {
            const l = await env.CROWD_KV.list({ prefix: "arch:", cursor });
            for (const k of l.keys || []) days.push(k.name.slice(5));
            cursor = l.list_complete ? null : l.cursor;
          } while (cursor);
          return json({ days: days.sort(), hint: "?archive=YYYY-MM-DD for a day's rounds (&dl=1 to download)" });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "use ?archive=YYYY-MM-DD" }, 400);
        const raw = await env.CROWD_KV.get("arch:" + day);
        if (!raw) return json({ error: "no archive for " + day }, 404);
        const headers = { "Content-Type": "application/json", ...CORS };
        if (u.searchParams.has("dl")) headers["Content-Disposition"] = 'attachment; filename="tracker-archive-' + day + '.json"';
        return new Response(raw, { status: 200, headers });
      }
      // Best bet across all coins right now — a compact ranked leaderboard for the app's footer ticker.
      if (u.searchParams.has("best")) {
        const st = await loadState(env);
        return json({ best: rankBest(st), tracked: AUTO_COINS.filter((c) => CB_PRODUCT[c]), ts: Date.now() });
      }
      // Phone-push self-test: ?testpush=<your exact NTFY_TOPIC> fires ONE ntfy push to your subscribed
      // device, proving the whole chain (worker -> ntfy -> phone) without waiting for a real hot pick.
      // Gated by the topic itself: knowing it already lets you publish to the channel, so no new secret.
      if (u.searchParams.has("testpush")) {
        const tp = u.searchParams.get("testpush");
        const gate = (env.NTFY_TOPIC && tp === env.NTFY_TOPIC) || (env.DISCORD_WEBHOOK && tp === "discord");
        if (!gate) return json({ sent: false, error: "pass ?testpush=<your exact NTFY_TOPIC>, or ?testpush=discord once DISCORD_WEBHOOK is set" }, 401);
        const out = {};
        if (env.NTFY_TOPIC) {
          const nurl = /^https?:\/\//.test(env.NTFY_TOPIC) ? env.NTFY_TOPIC : `https://ntfy.sh/${env.NTFY_TOPIC}`;
          const r = await fetch(nurl, {
            method: "POST",
            headers: { Title: "Test ping - notifications are working", Priority: "high", Tags: "white_check_mark", ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}) },
            body: "Test ping from the tracker.",
          }).catch(() => null);
          out.ntfy = { sent: !!(r && r.ok), httpStatus: r ? r.status : 0, authed: !!env.NTFY_TOKEN };
        }
        if (env.DISCORD_WEBHOOK) {
          const d = await pushDiscord(env, "Test ping from the 15-min tracker — Discord notifications are working. Real pings fire only on strong, non-skip picks.");
          out.discord = { sent: !!(d && d.ok), httpStatus: d ? d.status : 0 };
        }
        return json(Object.keys(out).length ? out : { sent: false, error: "set NTFY_TOPIC and/or DISCORD_WEBHOOK first" });
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
      // List both rolling backup rings of the learned state (read-only; token-gated like ?reset).
      if (u.searchParams.has("backups")) {
        if (env.ACCESS_TOKEN && u.searchParams.get("token") !== env.ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);
        const readRing = async (prefix, n) => {
          const out = [];
          for (let i = 0; i < n; i++) {
            const b = await kvGetRaw(env, prefix + i);
            out.push(b && b.state
              ? { slot: i, backupAt: b.backupAt, day: b.day, hour: b.hour, coins: b.state.coins ? Object.keys(b.state.coins).length : 0, modelN: b.state.global ? b.state.global.n : null }
              : { slot: i, empty: true });
          }
          return out;
        };
        const live = await loadState(env);
        return json({ ok: true, liveModelN: live.global ? live.global.n : null, hourly: await readRing("auto:state:hourly:", HOURLY_SLOTS), daily: await readRing("auto:state:backup:", BACKUP_SLOTS) });
      }
      // Restore the live state from a backup slot — OVERWRITES current (token-gated like ?reset).
      // Format: ?restore=hourly:<0-23> or ?restore=daily:<0-6> (find the slot via ?backups first).
      if (u.searchParams.has("restore")) {
        if (env.ACCESS_TOKEN && u.searchParams.get("token") !== env.ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);
        const m = /^(daily|hourly):(\d+)$/.exec(u.searchParams.get("restore") || "");
        if (!m) return json({ error: "use ?restore=hourly:<0-23> or ?restore=daily:<0-6> (see ?backups)" }, 400);
        const kind = m[1], slot = parseInt(m[2], 10), max = kind === "hourly" ? HOURLY_SLOTS : BACKUP_SLOTS;
        if (!(slot >= 0 && slot < max)) return json({ error: "slot out of range — " + kind + " is 0-" + (max - 1) }, 400);
        const b = await kvGetRaw(env, (kind === "hourly" ? "auto:state:hourly:" : "auto:state:backup:") + slot);
        if (!b || !b.state) return json({ error: kind + " slot " + slot + " is empty" }, 404);
        await kvPutRaw(env, STATE_KEY, b.state);
        return json({ ok: true, restored: true, kind, slot, backupAt: b.backupAt, day: b.day, hour: b.hour, coins: b.state.coins ? Object.keys(b.state.coins).length : 0 });
      }
      // The AI model is a SHARED setting (synced across devices): return the choice saved in KV.
      // null = no shared choice yet, so each app keeps its own local default.
      if (u.searchParams.has("aimodel")) {
        const cfg = await kvGetRaw(env, AIMODEL_KEY);
        return json({ model: cfg && cfg.model ? cfg.model : null, ts: cfg ? cfg.ts || null : null });
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

    // Persist the SHARED AI-model choice so every device reflects it. A tiny separate KV key the cron
    // never touches (no race with the auto-tracker state); stored without a TTL so the choice sticks.
    if (body.setModel != null) {
      const m = String(body.setModel);
      if (!/^[a-z0-9.\-]{1,60}$/i.test(m)) return json({ error: "bad model" }, 400);
      try { if (env.CROWD_KV) await env.CROWD_KV.put(AIMODEL_KEY, JSON.stringify({ model: m, ts: Date.now() })); } catch (_) {}
      return json({ ok: true, model: m });
    }

    const coin = String(body.coin || "ETH").toUpperCase();
    const aiProvider = resolveProvider(env, body.model);   // the app's chosen model can pick the provider

    let crowd = null;
    const seriesTicker = env["KALSHI_SERIES_" + coin];
    if (seriesTicker) { try { crowd = await getKalshiCrowd(env, seriesTicker); } catch (_) { crowd = null; } }

    // Cheap path: the client can refresh the (free) Kalshi crowd + strike without paying for an LLM call.
    // We ALSO piggyback the SHARED cached AI read for this round (just a free KV read) so every device
    // CONVERGES on the one read — identical AI across all devices, no extra LLM cost. The full path below
    // still does the actual (paid) compute once per round; this only re-serves what's already cached.
    if (body.noAI) {
      let sharedAi = null, sharedProv = aiProvider, sharedTs = 0;
      try {
        const bMs = Math.ceil(Date.now() / 9e5) * 9e5;
        const isN = typeof body.secondsLeft === "number" && body.secondsLeft <= 120;
        let hit = await kvGetRaw(env, `airead:${coin}:${body.model || aiProvider}:${bMs}:${isN ? "n" : "t"}`);
        // Coverage fix (audit): the read ABOUT this round taken at the 2-min lock was cached under the
        // PREVIOUS round's boundary with ":n". If no fresher this-round (":t") read exists, fall back to
        // it — so devices converge on the lock read for the WHOLE round it's about, not just during the
        // lock window itself. (The 30-min TTL keeps it alive through the round.)
        if ((!hit || !hit.ai) && !isN) hit = await kvGetRaw(env, `airead:${coin}:${body.model || aiProvider}:${bMs - 9e5}:n`);
        if (hit && hit.ai) { sharedAi = hit.ai; sharedProv = hit.provider || aiProvider; sharedTs = hit.ts || 0; }
      } catch (_) {}
      return json({ crowd, ai: sharedAi, provider: sharedProv, aiTs: sharedTs, cached: !!sharedAi, shared: !!sharedAi });
    }

    // Give the AI the full picture: the 24/7 auto-tracker's own record (its market-anchored
    // guesses + how they actually settled) on top of the client's live history.
    let autopicks = null;
    try { const st = await loadState(env); autopicks = st.coins[coin] || null; } catch (_) {}

    // Shared per-round read cache: the FIRST AI read for a (coin, model, 15-min round, this/next-phase)
    // is stored, and every other device — or repeat tap — within that round reuses it instead of paying
    // for a new LLM call. So it's ONE paid read per round per coin no matter how many devices are open
    // or how many times you tap. Keyed by the absolute 15-min boundary so keys never collide across
    // rounds (~30-min TTL). The app sends fresh:true ONLY for its "the read now contradicts the market,
    // catch it up" refresh — that bypasses the cache and then REPLACES the shared entry, so the one
    // catch-up read benefits every device.
    const nowMs = Date.now();
    const boundaryMs = Math.ceil(nowMs / 9e5) * 9e5;                                    // end of the current 15-min round
    const isNext = typeof body.secondsLeft === "number" && body.secondsLeft <= 120;     // final 2 min → the read judges the NEXT round
    const readKey = `airead:${coin}:${body.model || aiProvider}:${boundaryMs}:${isNext ? "n" : "t"}`;
    if (!body.fresh) {
      const hit = await kvGetRaw(env, readKey);
      if (hit && hit.ai) return json({ crowd, ai: hit.ai, provider: hit.provider || aiProvider, aiTs: hit.ts || 0, cached: true });
    }

    let ai, ok = true;
    try { ai = await getAIRead(env, aiProvider, body, crowd, autopicks); }
    catch (e) { ok = false; ai = { verdict: "SKIP", confidence: "Low", edge: "n/a", probOver: 50, rationale: "AI error: " + e.message }; }
    // Cache only a SUCCESSFUL read (~30-min TTL) so a transient API error isn't frozen in for the round.
    if (ok) { try { if (env.CROWD_KV) await env.CROWD_KV.put(readKey, JSON.stringify({ ai, provider: aiProvider, ts: nowMs }), { expirationTtl: 1800 }); } catch (_) {} }
    return json({ crowd, ai, provider: aiProvider, aiTs: nowMs });
  },

  // Cron (every 15 min): compute a pick from FREE data only — no LLM call, so no AI spend —
  // grade the previous round, and update the online learning model. Keeps a 24/7 record even
  // when no tab is open. Coins run sequentially so the shared (pooled) model updates cleanly.
  async scheduled(event, env, ctx) {
    // The :08/:23/:38/:53 trigger fires ~7 min before each 15-min close: scan EVERY coin for a side
    // that's clearly leaning but STILL BETTABLE. (The platform LOCKS a side once it's near-certain, so
    // a 3-min/99% ping is too late to act on — that was the old bug.) This pings you while you can still
    // place it, and ONLY reads crowd odds + sends a notification — it never touches the proven loop.
    if (event.cron === "8,23,38,53 * * * *") { ctx.waitUntil(scanLateLocks(env).catch(() => {})); return; }
    ctx.waitUntil((async () => {
      // One consolidated KV record for the whole auto-tracker (every coin + the pooled model),
      // so a cron run is a SINGLE KV write instead of ~7 — keeping us inside the free tier's
      // 1,000 writes/day. (Previously each coin and the global model each wrote their own key.)
      const st = await loadState(env);
      // Process the market leader (BTC) FIRST so the other coins' models can read its FRESH momentum
      // this same run as a cross-asset feature (crypto moves together, BTC leads). Order-only change.
      const coins = AUTO_COINS.filter((c) => CB_PRODUCT[c]).sort((a, b) => (a === "BTC" ? -1 : b === "BTC" ? 1 : 0));   // ALL coins log now: Kalshi-graded where a series exists, else self-graded on Coinbase (paid plan has the subrequest headroom)
      const runStart = Date.now();
      for (const c of coins) { try { await runCoinPick(env, c, st); } catch (_) {} }
      // SECOND CHANCE (2026-07 data audit): a round locked WITHOUT crowd input — usually because the cron
      // fired inside a round's first ~2 minutes, when the fresh Kalshi market still shows TBD/junk quotes —
      // used to stay blind for its whole 15 minutes. That was ~78% of all rounds, worst at :00 slots (9%
      // Kalshi coverage). If a series-configured coin just self-anchored, wait ~75s for Kalshi's quotes to
      // go live and re-lock that coin's pick WITH the crowd. "One pick per round" still holds — the round's
      // single recorded pick becomes the better-informed one, taken minutes into a 15-minute round, never
      // near the close (guarded: ≥10 min must remain before we even wait). A retry that can't lock anything
      // keeps the original blind pick; one that lands a different ROUND is discarded outright.
      const retry = coins.filter((c) => {
        const p = st.coins[c] && st.coins[c].pending;
        return env["KALSHI_SERIES_" + c] && p && p.self && typeof p.ts === "number" && p.ts >= runStart &&
               typeof p.closeMs === "number" && (p.closeMs - Date.now()) >= 10 * 60000;
      });
      if (retry.length) {
        await sleep(75000);
        for (const c of retry) {
          const rec = st.coins[c];
          const old = rec && rec.pending;
          if (!old || !old.self || !(old.ts >= runStart)) continue;   // something changed mid-wait — leave it alone
          rec.pending = null;
          try { await runCoinPick(env, c, st); } catch (_) {}
          if (!rec.pending) rec.pending = old;                                              // retry locked nothing → keep the original
          else if (Math.abs((rec.pending.closeMs || 0) - old.closeMs) > 90000) rec.pending = old;   // different round → never skip ahead
          else if (rec.pending.ts !== old.ts) rec.pending.retried = true;                   // upgraded in place — marked for the record
        }
      }
      try { await notifyHotPicks(env, st); } catch (_) {}   // background phone push on a high-confidence pick (ntfy) — runs AFTER the retry so upgraded picks ping correctly
      try { await maybeBackup(env, st); } catch (_) {}      // once-a-day rolling snapshot of the learned state (7-slot ring); never blocks the save
      try { await archiveRounds(env, st); } catch (_) {}    // permanent per-day round archive (rounds >3h old, exactly once); never blocks the save
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
    const data = await fetchCrowd(env, seriesTicker);
    if (data && typeof data.overPct === "number") {
      const entry = { t: now, data };
      crowdMem.set(seriesTicker, entry);
      // Persist successful fetches to the shared cache when persist=true. Both the live (app) path
      // AND the 15-min cron now write it — the cron can't lean on the app being open to keep Kalshi
      // data warm, so it persists its own fetches (a few KV writes/run, still far under the free-tier
      // budget). Shared across every Worker isolate so one success serves them all.
      if (env.CROWD_KV && persist) await kvPut(env, seriesTicker, entry);
      return data;
    }
    if (data) {
      // A quotes-less SHELL (fresh market identity, no usable price — typical in the first minute or two
      // after a round opens). Never cached: it must not evict a last-good price. If the last good price
      // still belongs to this same round (same closeTime), hand it back on the fresh shell; else return
      // the shell as-is so callers at least know WHICH market this round is (ticker → Kalshi grading).
      const stale = staleOrNull(cached, now);
      if (stale && typeof stale.overPct === "number" && stale.closeTime === data.closeTime) {
        return { ...data, overPct: stale.overPct, stale: true };
      }
      return data;
    }
    return staleOrNull(cached, now);
  } catch (_) {
    return staleOrNull(cached, now);   // 429 / down → last known
  }
}

// One Kalshi round-trip → implied OVER probability (or null). Throws on hard HTTP error.
async function fetchCrowd(env, seriesTicker) {
  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=200`;
  const r = await kalshiFetch(env, url);
  if (!r.ok) throw new Error("kalshi " + r.status);
  const data = await r.json();
  const markets = (data.markets || []).filter((m) => m.close_time);
  if (!markets.length) return null;
  markets.sort((a, b) => new Date(a.close_time) - new Date(b.close_time));
  const m = markets[0];
  const over = overFromMarket(m);
  // Quotes can lag a round's open by a minute or two (the fresh market shows "Target price: TBD" with a
  // junk/pinned book). We used to return null here — throwing away the market's IDENTITY along with its
  // unusable price — which left the whole round self-anchored with NO ticker, so it could never be
  // reconciled to Kalshi's settled result (2026-07 audit: only 22% of rounds ended Kalshi-graded, worst
  // at :00 slots). Now the SHELL (ticker/closeTime/strike) always comes back; overPct stays null until
  // real quotes exist. Every caller that prices off the crowd already requires a numeric overPct, and
  // getKalshiCrowd never caches a quotes-less shell over a last-good price.
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

// --- Optional Kalshi API-key auth (r86) -----------------------------------------------------------
// Kalshi rate-limits Cloudflare's SHARED egress IPs — the cause of the ~55% of rounds that still fetch
// no crowd even after the r85 retry (16% coverage at :00 slots). Authenticated requests are limited
// per ACCOUNT instead of per IP. Create a key at kalshi.com → Account → API keys, then add two
// Secrets: KALSHI_API_KEY_ID (the key's UUID) and KALSHI_PRIVATE_KEY (the RSA private key PEM it gives
// you once). Every Kalshi request is then signed (RSA-PSS/SHA-256 over timestamp+method+path, per
// Kalshi's API docs). No key set → anonymous fetch exactly as before; a bad key falls back to
// anonymous (sentinel "" stops it re-trying a broken import on every call) so a misconfigured secret
// can never stall a pick.
let _kalshiKey = null;   // cached CryptoKey per isolate; "" = import failed, stay anonymous
async function kalshiAuthHeaders(env, method, url) {
  if (!env || !env.KALSHI_API_KEY_ID || !env.KALSHI_PRIVATE_KEY || _kalshiKey === "") return null;
  try {
    if (!_kalshiKey) {
      const pem = String(env.KALSHI_PRIVATE_KEY).replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
      const der = Uint8Array.from(atob(pem), (ch) => ch.charCodeAt(0));
      _kalshiKey = await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSA-PSS", hash: "SHA-256" }, false, ["sign"]);
    }
    const ts = String(Date.now());
    const path = new URL(url).pathname;                       // Kalshi signs ts + METHOD + path (no query string)
    const sig = await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, _kalshiKey, new TextEncoder().encode(ts + method + path));
    let bin = ""; const bytes = new Uint8Array(sig);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { "KALSHI-ACCESS-KEY": env.KALSHI_API_KEY_ID, "KALSHI-ACCESS-SIGNATURE": btoa(bin), "KALSHI-ACCESS-TIMESTAMP": ts };
  } catch (_) { _kalshiKey = ""; return null; }
}
// Kalshi's rate limit is bursty; a couple of short retries usually clears a 429.
async function kalshiFetch(env, url) {
  const auth = await kalshiAuthHeaders(env, "GET", url);
  const headers = auth ? { ...KALSHI_HEADERS, ...auth } : KALSHI_HEADERS;
  let r;
  for (let i = 0; i < 3; i++) {
    r = await fetch(url, { headers });
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
  const nextRound = secs != null && secs <= 120;   // matches the client BET_WINDOW (2 min): in the final stretch this round is near-settled, judge the next
  const m = body.market || {};

  // The right market prior: this round's price is near-settled in the final ~2 min, so for the
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

  const cm = ap && ap.pending && ap.pending.caseMem;
  const caseLine = cm && typeof cm.overPct === "number"
    ? `CASE MEMORY ("have we seen this setup before?"): of the ${cm.n} past rounds whose open looked most like this one (nearest-neighbour over the same features the model uses), ${cm.overPct}% finished OVER${(cm.side === "OVER" || cm.side === "UNDER") ? " → a faint " + cm.side + " lean" : " — no clear lean"}. It complements the learned model (which fits one global rule) by catching LOCAL patterns; treat it as a faint tilt.${typeof ap.caseHitPct === "number" && ap.caseGraded >= 10 ? " When this memory has actually leaned, it's been right " + ap.caseHitPct + "% of the time so far — calibrate your trust accordingly." : ""}`
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
${autoLine ? "\n" + autoLine + "\n" : ""}${learnedLine ? "\n" + learnedLine + "\n" : ""}${caseLine ? "\n" + caseLine + "\n" : ""}
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

"plan": a SHORT one-sentence GAME PLAN for how to actually PLAY it — the round's character (choppy / trending hard / quiet and pinned to the line) plus an entry tactic, aimed at the NEXT round. Make it about TIMING, not just direction, because the user bets a fresh round that opens at ~50/50. e.g. "Choppy with wicks both ways — if you play it, wait for a dip back toward the line instead of chasing." / "It already ran hard, so the easy entry's gone — only worth it on a pullback." / "Quiet and stuck on the line — likely a coin-flip, save your money." Plain English, no jargon or numbers.

Respond with ONLY this JSON, no markdown:
{"probOver":<0-100 integer>,"verdict":"OVER|UNDER|SKIP","confidence":"Low|Medium|High","edge":"with-crowd|against-crowd|n/a","rationale":"plain-English, 1-2 sentences","plan":"one-sentence tactical game plan"}`;
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
    plan: String(o.plan || "").slice(0, 220),
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
  const hasKey = (provider === "anthropic" && env.ANTHROPIC_API_KEY) || (provider === "gemini" && env.GEMINI_API_KEY) || (provider === "groq" && env.GROQ_API_KEY);
  if (!hasKey) return { verdict: "SKIP", confidence: "Low", edge: "n/a", rationale: "No AI provider configured — add ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY.", plan: "" };
  const once = (t) => provider === "anthropic" ? readAnthropic(env.ANTHROPIC_API_KEY, model, prompt, t)
    : provider === "gemini" ? readGemini(env.GEMINI_API_KEY, model, prompt, t)
    : readGroq(env.GROQ_API_KEY, model, prompt, t);
  // FREE AI → take a CONSENSUS of several samples at varied temperature. Averaging cuts the variance of a
  // single noisy read, and the cross-sample agreement becomes an honest confidence. Cached per round, so it's
  // a few calls per round (not per tick). Tune with AI_SAMPLES (default 3; set 1 to disable the ensemble).
  const n = Math.max(1, Math.min(5, Number(env.AI_SAMPLES) || 3));
  if (n === 1) return await once();
  const temps = [0.2, 0.5, 0.8, 0.35, 0.65];
  const res = (await Promise.all(Array.from({ length: n }, (_, i) => once(temps[i % temps.length]).catch(() => null)))).filter(Boolean);
  if (!res.length) return { verdict: "SKIP", confidence: "Low", edge: "n/a", rationale: "AI temporarily unavailable — try again next round.", plan: "" };
  if (res.length === 1) return res[0];
  return aiConsensus(res);
}
// Combine several AI samples into one calibrated read: average probOver, verdict from the average, and a
// confidence reflecting how strongly the samples AGREED (unanimous + lopsided = High; split = Low).
function aiConsensus(rs) {
  const pv = (r) => typeof r.probOver === "number" ? r.probOver : r.verdict === "OVER" ? 62 : r.verdict === "UNDER" ? 38 : 50;
  const avg = Math.round(rs.reduce((a, r) => a + pv(r), 0) / rs.length);
  const verdict = avg >= 55 ? "OVER" : avg <= 45 ? "UNDER" : "SKIP";
  const agreeN = rs.filter((r) => r.verdict === verdict).length;
  const frac = agreeN / rs.length;
  const confidence = (frac >= 0.8 && (avg >= 62 || avg <= 38)) ? "High" : frac >= 0.6 ? "Medium" : "Low";
  let rep = rs[0], best = 1e9;
  for (const r of rs) { const d = Math.abs(pv(r) - avg); if (d < best) { best = d; rep = r; } }
  return { probOver: avg, verdict, confidence, edge: rep.edge || "n/a", rationale: rep.rationale || "", plan: rep.plan || "", samples: rs.length, agree: agreeN };
}

async function readAnthropic(key, model, prompt, temp) {
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: typeof temp === "number" ? temp : 1,
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
              plan: { type: "string" },
            },
            required: ["probOver", "verdict", "confidence", "edge", "rationale", "plan"],
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

async function readGemini(key, model, prompt, temp) {
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: typeof temp === "number" ? temp : 0.3, maxOutputTokens: 400 },
    }),
  });
  if (!r.ok) throw new Error("gemini " + r.status + " " + (await r.text()).slice(0, 140));
  const data = await r.json();
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error("no gemini text");
  return normalize(extractJson(text));
}

async function readGroq(key, model, prompt, temp) {
  if (!key) throw new Error("GROQ_API_KEY missing");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: typeof temp === "number" ? temp : 0.3,
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
const AUTO_COINS = ["ETH", "BTC", "SOL", "DOGE", "XRP", "HYPE", "BNB"];
const CB_BASE = "https://api.exchange.coinbase.com";
const CB_PRODUCT = { ETH: "ETH-USD", BTC: "BTC-USD", SOL: "SOL-USD", DOGE: "DOGE-USD", XRP: "XRP-USD", HYPE: "HYPE-USD", BNB: "BNB-USD" };
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
// The price AT a round's close. Provisional grading PREFERS cbAvg60 (the ~60-sec trade average
// before closeMs) because that is HOW Kalshi settles — the simple average of the final minute of its
// CF-Benchmarks index — with the finalized boundary CANDLE close (cbCloseAt) as the fallback when the
// trade window is incomplete. Either way it's only a Coinbase PROXY for a multi-exchange index: on a
// thin round the proxy can land on the wrong side (flagged `disputed` when avg-vs-candle disagree),
// and reconcileKalshi upgrades every ticketed round to Kalshi's definitive result soon after.
// Both return null if the window is incomplete.
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
async function kalshiResult(env, ticker) {
  if (!ticker) return null;
  try {
    const r = await kalshiFetch(env, `${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`);
    if (!r || !r.ok) return null;
    const m = (await r.json()).market;
    const res = m && typeof m.result === "string" ? m.result.toLowerCase() : "";
    const actual = res === "yes" ? "OVER" : res === "no" ? "UNDER" : null;
    if (!actual) return null;                              // not resolved yet
    // The settled UNDERLYING value Kalshi expired the contract against — the real number it averaged
    // (its 60-sec CF-Benchmarks index). Lets us show the TRUE close + margin instead of a Coinbase proxy.
    const ev = m && m.expiration_value != null ? parseFloat(m.expiration_value) : NaN;
    return { actual, settle: (isFinite(ev) && ev > 0) ? ev : null };
  } catch (_) { return null; }
}
// Upgrade rounds graded provisionally on the Coinbase candle close to Kalshi's DEFINITIVE settled
// result. This matters a lot: Kalshi settles on a 60-sec CF-Benchmarks index (many exchanges), so a
// single Coinbase candle close can land on the OPPOSITE side on a thin round — only Kalshi's own
// result is guaranteed to match Robinhood. We now reconcile several recent rounds per cron so the
// arrows converge to Kalshi within one cycle instead of trickling one at a time.
async function reconcileKalshi(env, rec, coinModel, global) {
  const h = rec.history || [];
  for (let i = 0, checked = 0; i < h.length && checked < 8; i++) {   // Paid plan lifted the free-tier subrequest budget, so that's no longer the cap. The remaining limit is being POLITE to Kalshi's per-IP rate limit (external — paid doesn't change it), so keep this moderate. The crowd fetch runs FIRST so picks are unaffected; any backlog still converges to Kalshi within a cron or two. Bumped 4→8 on the paid plan for firmer/faster grade convergence.
    const e = h[i];
    if (e.src === "kalshi" || !e.ticker) continue;
    checked++;
    const kal = await kalshiResult(env, e.ticker);
    if (!kal) continue;                                   // not settled yet — retried next cron
    e.src = "kalshi"; e.actual = kal.actual;              // row-level truth; the caller recomputes all aggregates from history
    // Upgrade the displayed close + margin to Kalshi's REAL settled value (not the Coinbase proxy), so the
    // arrow / Recent-Rounds % match exactly what Kalshi paid. Sanity-gated to a sane band around the strike.
    if (kal.settle != null && typeof e.strike === "number" && e.strike > 0 && kal.settle > e.strike * 0.5 && kal.settle < e.strike * 2) {
      if (e.pxClose == null && typeof e.close === "number") e.pxClose = e.close;   // keep the Coinbase proxy close — it measures proxy-vs-index divergence (2026-07 audit)
      e.close = kal.settle; e.kalshiClose = true;
      e.over = Math.round((kal.settle - e.strike) * 100) / 100;
      e.overPct = Math.round((kal.settle - e.strike) / e.strike * 1e5) / 1e3;
    }
    if (e.side === "OVER" || e.side === "UNDER") e.correct = (kal.actual === e.side);
    learnFromRound(coinModel, global, e);                 // train on Kalshi's DEFINITIVE label — the most accurate target
  }
  // Grace net: a round Kalshi hasn't confirmed after ~an hour (index ≥4) still teaches the model — train
  // it on its provisional Coinbase label so no round is lost, after giving Kalshi ample time to confirm.
  for (let i = 4; i < h.length; i++) {
    const e = h[i]; if (!e || e.trained) continue;
    if (e.disputed && e.ticker && e.src !== "kalshi") continue;   // photo-finish on a Kalshi market → wait for the DEFINITIVE result; don't teach the model a shaky proxy
    learnFromRound(coinModel, global, e);
  }
  if (h[0]) rec.lastActual = h[0].actual;
}
// Background phone push (ntfy.sh) the moment a coin opens a HIGH-CONFIDENCE, non-SKIP pick — the rare
// rounds the tracker is willing to bet AND several independent reads agree. To enable: set a Worker
// var NTFY_TOPIC (a hard-to-guess topic name, or a full https URL), install the free ntfy app, and
// subscribe to that topic. Optional NTFY_MIN_PROB (default 75). One push per round per coin.
// Post to a Discord channel via an incoming webhook (free + reliable from Workers — no shared-IP rate
// limits like ntfy.sh). Set DISCORD_WEBHOOK to the webhook URL. 204 = delivered.
async function pushDiscord(env, text) {
  if (!env.DISCORD_WEBHOOK) return null;
  return fetch(env.DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  }).catch(() => null);
}
async function notifyHotPicks(env, st) {
  if (!env.NTFY_TOPIC && !env.DISCORD_WEBHOOK) return;
  // Fired at ROUND OPEN — the EARLIEST, edge-based alert (you get ~13 min to act). Loosened so it
  // actually fires on the tracker's committed pick, rather than waiting for a near-locked favorite.
  const minProb = Number(env.NTFY_MIN_PROB) || 68;
  const minAgree = Number(env.NTFY_MIN_AGREE) || 2;
  const deadPct = Number(env.NTFY_DEAD_PCT) || 90;   // don't ping a side the market already prices >= this — it pays ~1.0x (no profit)
  const hot = [], strongBet = [];
  for (const c of AUTO_COINS) {
    const rec = st.coins && st.coins[c], p = rec && rec.pending;
    if (!p || p.notified) continue;
    if ((p.side === "OVER" || p.side === "UNDER") && (p.prob || 0) >= minProb && (p.agree || 0) >= minAgree) {
      const mp = p.signals && typeof p.signals.crowdOver === "number" ? p.signals.crowdOver : null;
      const sidePct = mp == null ? null : (p.side === "OVER" ? mp : 100 - mp);   // the market price of OUR side
      if (sidePct != null && sidePct >= deadPct) continue;   // dead money — skip the ping, don't even mark it (in case the price eases later)
      const label = `${c} - ${p.side === "OVER" ? "Over" : "Under"}` + (sidePct != null ? ` ${(100 / sidePct).toFixed(1)}x` : "");
      // STRONG — BET: the pick is strong AND short-term momentum is already heading its way — the server-side
      // analog of the app's "app + AI + momentum all line up". These get the louder, distinct alert; this is
      // the native notification phones get in place of the desktop banner.
      const mom = p.signals && typeof p.signals.mom === "number" ? p.signals.mom : null;
      const confirm = mom != null && ((p.side === "OVER" && mom > 0) || (p.side === "UNDER" && mom < 0));
      (confirm ? strongBet : hot).push(label);
      p.notified = true;   // one push per round (persisted by the saveState that follows)
    }
  }
  if (!hot.length && !strongBet.length) return;
  if (strongBet.length) {
    const msg = "STRONG — BET (" + strongBet.join(", ") + ")";
    if (env.NTFY_TOPIC) await ntfyPush(env, "🔥 STRONG — BET", "fire,rotating_light", msg);
    if (env.DISCORD_WEBHOOK) await pushDiscord(env, "🔥🔥 " + msg);
  }
  if (hot.length) {
    const msg = "Predict (" + hot.join(", ") + ")";
    if (env.NTFY_TOPIC) await ntfyPush(env, "Predict — strong pick", "fire", msg);
    if (env.DISCORD_WEBHOOK) await pushDiscord(env, "🔥 " + msg);
  }
}
// Small ntfy push helper (shared by the alert scanners).
async function ntfyPush(env, title, tag, body) {
  if (!env.NTFY_TOPIC) return;
  const url = /^https?:\/\//.test(env.NTFY_TOPIC) ? env.NTFY_TOPIC : `https://ntfy.sh/${env.NTFY_TOPIC}`;
  await fetch(url, { method: "POST", headers: { Title: title, Priority: "high", Tags: tag, ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}) }, body }).catch(() => {});
}
// LATE-ROUND alert scanner — runs ~7 min before each close (the 8,23,38,53 cron). ONE read-only pass over
// every coin's Kalshi crowd (persist=false → no KV writes), firing up to two kinds of ping:
//   • STRONG FAVORITE "bet while you can" — the market clearly favors a side (>= LOCK_MIN_PROB, default 65%)
//     but hasn't locked it (< LOCK_MAX_PROB, default 80%) — AND (r86) the market isn't dead-chop AND the
//     24/7 tracker committed the same side this round. Only that star-plus-commit subset carried the edge.
//   • VALUE ENTRY "longshot about to cross" — price is on one side, momentum is carrying it TOWARD the line,
//     and the side it's heading to is still the big-multiplier underdog (>= 2.5x). Higher variance, real payout.
//     (This is primeCheck's client-side cue, now pushed even with the app closed.)
// Accepts a cached-but-stale crowd ONLY while it still belongs to an open round (closeTime in the future,
// within one 15-min window) — so pings keep firing through Kalshi 429s without ever using last round's data.
async function scanLateLocks(env) {
  if (!env.DISCORD_WEBHOOK && !env.NTFY_TOPIC) return;
  // STRONG-FAVORITE band — the one pattern the 2026-07 data audit found to be reliably +EV: favorites the
  // crowd priced 65–80% went on to WIN ~82% of settled rounds (n=77) — ~+14% per bet net of the taker fee,
  // the classic favorite-longshot bias. Below ~65% the edge fades into fees; above ~80% the payout is too
  // thin for the risk. Band re-centered 62–74 → 65–80 on that evidence. Tune with LOCK_MIN_PROB / LOCK_MAX_PROB.
  const lo = Number(env.LOCK_MIN_PROB) || 65, hi = Number(env.LOCK_MAX_PROB) || 80;
  // Week-2 audit (r86): the RAW favorite band ran ≈ break-even (72.7% of 524), while the tracker's own
  // gated commits hit 78.0% at the same prices — and the band was outright −EV on dead-chop days
  // (Jul 14: 57.6%, Jul 18: 66.7% with 44% photo-finishes). So the favorite ping now requires BOTH:
  //   (a) NOT a dead market — the coin's last ~8 graded rounds must NOT all be settling a hair from the
  //       line (median |margin| >= DEAD_MARGIN_PCT, default 0.08%); and
  //   (b) the 24/7 tracker COMMITTED the same side this round — pinging only the star-plus-commit
  //       subset that actually carried the edge. Fewer pings, better pings.
  // One read-only state load powers both; if it fails, pings stay gated OFF for safety (a missed ping
  // costs nothing; a bad ping costs money). The value-entry longshot ping is unchanged.
  const deadPct = Number(env.DEAD_MARGIN_PCT) || 0.08;
  let st = null;
  try { st = await loadState(env); } catch (_) {}
  const now = Date.now();
  const lockHot = [], valueHot = [];
  for (const c of AUTO_COINS) {
    const t = env["KALSHI_SERIES_" + c];
    if (!t) continue;
    let crowd = null;
    try { crowd = await getKalshiCrowd(env, t, false); } catch (_) {}
    if (!crowd || typeof crowd.overPct !== "number") continue;
    const closeMs = crowd.closeTime ? new Date(crowd.closeTime).getTime() : 0;
    const stillThisRound = closeMs > now && (closeMs - now) <= 16.5 * 60000;   // an open, current 15-min round
    if (crowd.stale && !stillThisRound) continue;   // fresh is always ok; stale only while it's still this round
    const op = crowd.overPct;
    // (1) STRONG-FAVORITE band — gated on market pulse + tracker commitment (see header comment).
    const rec = st && st.coins && st.coins[c];
    let pulse = null;
    if (rec && Array.isArray(rec.history)) {
      const m = [];
      for (const e of rec.history) {
        if (e && typeof e.overPct === "number" && (e.actual === "OVER" || e.actual === "UNDER")) { m.push(Math.abs(e.overPct)); if (m.length >= 8) break; }
      }
      if (m.length >= 4) { m.sort((a, b) => a - b); pulse = m.length % 2 ? m[(m.length - 1) / 2] : (m[m.length / 2 - 1] + m[m.length / 2]) / 2; }
    }
    const dead = pulse != null && pulse < deadPct;
    const pnd = rec && rec.pending;
    const sameRound = pnd && typeof pnd.closeMs === "number" && closeMs > 0 && Math.abs(pnd.closeMs - closeMs) <= 90000;
    const committedSide = sameRound && (pnd.side === "OVER" || pnd.side === "UNDER") ? pnd.side : null;
    if (!dead) {
      if (op >= lo && op < hi && committedSide === "OVER") lockHot.push(`${c} - Over ${(100 / op).toFixed(1)}x`);
      else if (op <= 100 - lo && op > 100 - hi && committedSide === "UNDER") lockHot.push(`${c} - Under ${(100 / (100 - op)).toFixed(1)}x`);
    }
    // (2) VALUE ENTRY — the big-payout longshot the price is racing toward (needs live Coinbase momentum).
    if (stillThisRound && op > 2 && op < 98 && crowd.strike > 0) {
      let micro = null;
      try { micro = await cbMicro(CB_PRODUCT[c]); } catch (_) {}
      if (micro && typeof micro.price === "number" && micro.price > 0 && typeof micro.mom === "number") {
        const rem = (closeMs - now) / 1000;
        const underdog = micro.price < crowd.strike ? "OVER" : "UNDER";          // the side a flip would land on
        const toward = (underdog === "OVER" && micro.mom > 0) || (underdog === "UNDER" && micro.mom < 0);
        const dist = Math.abs(Math.log(crowd.strike / micro.price));             // gap to the line (log)
        const proj = Math.abs(micro.mom) * (rem / 60);                           // projected move over time left
        const impU = underdog === "OVER" ? op / 100 : 1 - op / 100;
        const mult = 1 / Math.max(0.035, impU);
        if (toward && rem >= 60 && rem <= 480 && proj >= dist * 0.8 && mult >= 2.0) {
          valueHot.push(`${c} - ${underdog === "OVER" ? "Over" : "Under"} ${mult.toFixed(1)}x`);
        }
      }
    }
  }
  if (lockHot.length) {
    const msg = "Predict (" + lockHot.join(", ") + ")";
    if (env.DISCORD_WEBHOOK) await pushDiscord(env, "🎯 " + msg);
    await ntfyPush(env, "Predict — pick forming, time to act", "dart", msg);
  }
  if (valueHot.length) {
    const msg = "Predict (" + valueHot.join(", ") + ")";
    if (env.DISCORD_WEBHOOK) await pushDiscord(env, "⚡ " + msg);
    await ntfyPush(env, "Predict — longshot about to cross", "zap", msg);
  }
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
  // Order-book weight DEMOTED 0.15 → 0.05 (2026-07-01 empirical audit): across 2,324 graded rounds the
  // OBI's sign predicted the outcome 47.2% of the time — slightly INVERTED, p<0.01 — so a strong fixed
  // vote was actively hurting. Kept as a whisper (not flipped/removed: one ~3-day window, and the learned
  // model can still earn it back through its own obi feature weight). Revert = restore w: 0.15.
  if (typeof obi === "number") parts.push({ p: Math.max(0.3, Math.min(0.7, 0.5 + 0.5 * Math.tanh(2 * obi))), w: 0.05 });
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
  // Commit threshold widens as the reads split: ±0.10 when fully aligned up to ±0.20 when they're at
  // odds — tightened from ±0.08 so it bets LESS but only on stronger, more-aligned setups (discipline
  // over coverage). Validate via bet-rate vs hit-rate-on-bets in the now-complete record.
  const band = 0.10 + 0.10 * (1 - conf);
  const side = pOver >= 0.5 + band ? "OVER" : pOver <= 0.5 - band ? "UNDER" : "SKIP";
  return { pOver, pRaw, side, conf: Math.round(conf * 100) / 100, agree: agreeN };
}
// Accuracy #2 — calibration-band SELECTION gate (Worker side; mirrors the app's bandEdgeOK so the 24/7
// scoreboard measures the same discipline). A side only stands if THIS coin's graded rounds whose RAW model
// prob sat in the same band have actually cleared ~break-even; otherwise the "edge" is noise → SKIP. Sparse
// band (<15 graded) → no opinion (don't gate), so the proven picker is untouched until the data earns it.
// Only ever makes it skip MORE (skipping never loses), so it can't hurt the measured record. history holds
// pRaw on a 0–100 scale (see rec.pending.pRaw); pRaw01 is the live pick's raw prob on 0–1.
function bandEdgeOK(history, pRaw01) {
  if (!Array.isArray(history) || typeof pRaw01 !== "number") return true;
  const p = pRaw01 * 100, win = 8;
  let n = 0, hit = 0;
  for (const e of history) {
    if (!e || typeof e.pRaw !== "number" || (e.actual !== "OVER" && e.actual !== "UNDER")) continue;
    if (Math.abs(e.pRaw - p) > win) continue;
    n++;
    if ((e.pRaw >= 50) === (e.actual === "OVER")) hit++;   // did the side the model leaned actually win?
  }
  if (n < 15) return true;                       // not enough evidence in this band — trust the model
  return (hit + 0.5) / (n + 1) >= 0.515;         // must clear ~break-even (Laplace-smoothed) or it's a coin-flip band → skip
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
    const mom = p.signals && typeof p.signals.mom === "number" ? p.signals.mom : null;
    const confirm = mom != null && ((p.side === "OVER" && mom > 0) || (p.side === "UNDER" && mom < 0));   // price already heading the way the pick called
    const score = edge * (0.6 + 0.4 * conf) * (0.6 + 0.8 * reliab) * (confirm ? 1.15 : 0.9);   // nudge confirmed-direction picks up the ranking
    out.push({
      coin, side: p.side, prob: p.prob, confirm: confirm,
      conf: typeof p.conf === "number" ? Math.round(p.conf * 100) / 100 : null,
      agree: typeof p.agree === "number" ? p.agree : null,
      hitRatePct: typeof rec.hitRatePct === "number" ? rec.hitRatePct : null,
      betRatePct: typeof rec.betRatePct === "number" ? rec.betRatePct : null,     // coverage — how often it commits
      shadowHitPct: typeof rec.shadowHitPct === "number" ? rec.shadowHitPct : null, // if it bet every round
      crowdOver: p.signals && typeof p.signals.crowdOver === "number" ? p.signals.crowdOver : null,   // live Kalshi market OVER% (for the app's payout/+EV badge + dead-money alert gate); null on self-tracked coins. Display-only — does NOT affect the pick.
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
const AIMODEL_KEY = "cfg:aimodel";   // shared AI-model choice, synced across devices (kept separate from the tracker state)
async function loadState(env) {
  let st = await kvGetRaw(env, STATE_KEY);
  if (st && st.coins) { st.global = padModel(st.global || newModel()); return st; }
  st = { v: 2, global: padModel((await kvGetRaw(env, "model:global")) || newModel()), coins: {} };
  for (const c of AUTO_COINS) { const r = await kvGetRaw(env, "picks:" + c); if (r) st.coins[c] = r; }
  return st;
}
async function saveState(env, st) { st.updated = Date.now(); await kvPutRaw(env, STATE_KEY, st); }
// Daily snapshot of the WHOLE learned state (every coin's model + history + the pooled model) into a
// 7-slot ring — a rolling week of backups — so a single bad write or accidental wipe can't erase the
// learning. Gated by st.lastBackupDay, so it's exactly ONE extra KV write per day (well inside the
// free tier). Purely protective: it only ever COPIES the record — it never reads, changes, or touches
// a pick. Restore a slot with ?restore=<0-6>; list slots with ?backups.
const BACKUP_SLOTS = 7;      // daily ring — a rolling week
const HOURLY_SLOTS = 24;     // hourly ring — a rolling day (finer recovery)
// Snapshot the WHOLE learned state on two rolling rings: one per HOUR (24 slots = the last day) and
// one per DAY (7 slots = the last week). Each ring writes at most once per period (gated by
// lastBackupHour / lastBackupDay), so the extra load is fixed: 24 hourly + 1 daily = 25 extra KV
// writes/day on top of the cron's 96 → ~121/day total, well inside the free tier's 1,000/day. Purely
// protective: it only COPIES the record, never touches a pick. Restore via
// ?restore=hourly:<0-23> or ?restore=daily:<0-6>.
async function maybeBackup(env, st) {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);
  if (st.lastBackupHour !== hour) {                        // at most one hourly snapshot per clock hour
    st.lastBackupHour = hour;
    await kvPutRaw(env, "auto:state:hourly:" + (hour % HOURLY_SLOTS), { backupAt: now, hour, kind: "hourly", state: st });
  }
  const today = Math.floor(now / 86400000);
  if (st.lastBackupDay !== today) {                        // at most one daily snapshot per UTC day
    st.lastBackupDay = today;
    await kvPutRaw(env, "auto:state:backup:" + (today % BACKUP_SLOTS), { backupAt: now, day: today, kind: "daily", state: st });
  }
}

// --- Permanent round archive (data foundation, 2026-07 audit) ------------------------------------
// The live state keeps only the newest 300 rounds per coin (~3 days at 96 rounds/day) — everything
// older used to be DESTROYED, capping every analysis (and the model's evaluable record) at one short
// market window. Now every graded round is appended, exactly once, to a permanent per-day KV key
// (arch:YYYY-MM-DD, NO expiry) after a ~3h settling delay — long enough for reconcileKalshi to have
// converged on Kalshi's definitive result for rounds that have a ticker. Rows carry the full round
// record (incl. the raw crowd % at lock, kStrike, pxClose and src), so future audits can measure
// EV, calibration and proxy-vs-index drift across months, not days. Read back with ?archive (list
// of days) / ?archive=YYYY-MM-DD (&dl=1 downloads). Cost: ~1 extra KV write per cron (~96/day).
// Purely additive: it only COPIES graded rounds — it never reads into, tunes, or touches a pick.
const ARCH_DELAY_MS = 3 * 3600 * 1000;
const ARCH_BATCH = 400;   // per-cron cap — the first few runs drain the pre-existing backlog gradually
async function archiveRounds(env, st) {
  if (!env.CROWD_KV || !st || !st.coins) return;
  const cut = Date.now() - ARCH_DELAY_MS;
  const byDay = new Map();   // "YYYY-MM-DD" -> [{ coin, e }]
  let n = 0;
  outer:
  for (const coin of Object.keys(st.coins)) {
    const rec = st.coins[coin];
    if (!rec || !Array.isArray(rec.history)) continue;
    for (const e of rec.history) {
      if (!e || e.arch || !(e.ts > 0) || e.ts >= cut) continue;
      const day = new Date(e.ts).toISOString().slice(0, 10);
      let arr = byDay.get(day);
      if (!arr) { arr = []; byDay.set(day, arr); }
      arr.push({ coin, e });
      if (++n >= ARCH_BATCH) break outer;
    }
  }
  for (const [day, items] of byDay) {
    const key = "arch:" + day;
    let cur = null;
    try { cur = JSON.parse((await env.CROWD_KV.get(key)) || "null"); } catch (_) { cur = null; }
    const list = cur && Array.isArray(cur.rounds) ? cur.rounds : [];
    const seen = new Set(list.map((r) => r.coin + ":" + r.ts));   // (coin, ts) is unique per round
    let added = 0;
    for (const it of items) {
      if (seen.has(it.coin + ":" + it.e.ts)) { it.e.arch = 1; continue; }   // already archived (e.g. a restored backup re-surfaced it) — just re-flag
      const row = { coin: it.coin, ...it.e };
      delete row.arch; delete row.trained;   // internal bookkeeping — not data
      list.push(row);
      added++;
    }
    if (!added) continue;
    try {
      await env.CROWD_KV.put(key, JSON.stringify({ day, rounds: list, updated: Date.now() }));   // NO TTL — permanent
      for (const it of items) it.e.arch = 1;   // flag ONLY after the write lands, so a failed put retries next cron
    } catch (_) {}
  }
}

// --- Online learning model (per-coin + pooled global) --------------------
// A tiny online logistic regression that learns, per coin, how round-open signals map to the
// chance price finishes OVER. Updated once per round from the graded outcome (free, no LLM).
// Research basis: order-flow imbalance is the strongest short-horizon predictor (Sirignano &
// Cont 2018, arXiv:1803.06917; Bugaenko 2004.08290), and a *pooled* feature→move mapping is
// "universal" and beats isolated per-asset models — so we partial-pool each coin toward a
// shared global model, weighted by how much data the coin has earned.
const FEATS = ["book", "momentum", "volregime", "crowdLean", "lastDir", "todSin", "todCos", "rangeClose", "rsi", "macdHist", "lastMargin", "marketMom"];
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
  // Cross-asset: net momentum of the OTHER tracked coins right now. Crypto moves together and BTC
  // tends to LEAD, so a coin's next 15-min move partly follows the pack. Squashed like the coin's own mom.
  const marketMom = typeof signals.marketMom === "number" ? Math.tanh(signals.marketMom * 120) : 0;
  const hourFrac = ((new Date(ts).getUTCHours()) + new Date(ts).getUTCMinutes() / 60) / 24;
  return [obi, mom, volr, crowdLean, lastDir, Math.sin(2 * Math.PI * hourFrac), Math.cos(2 * Math.PI * hourFrac), rngClose, rsi, macdH, lastMargin, marketMom];
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
// ---- Case memory ("have we seen this setup before?") -------------------------------------------
// Episodic / nearest-neighbour memory: find the K past rounds (pooled across ALL coins) whose
// open-time features are closest to the current setup, and report which way they actually settled.
// Complements the logistic model — that fits ONE global rule; this is non-parametric and can surface
// a LOCAL pattern the line misses. MEASUREMENT-ONLY: it's handed to the AI's prompt and scored against
// outcomes, but it does NOT move the freePick blend until its tracked hit-rate proves it helps.
// 15-min direction is near-random, so expect a faint tilt, not an oracle.
function caseMemory(st, feat, k) {
  if (!Array.isArray(feat) || !st || !st.coins) return null;
  const near = [];
  for (const cn in st.coins) {
    const h = (st.coins[cn] && st.coins[cn].history) || [];
    for (const e of h) {
      if (!Array.isArray(e.feat) || e.feat.length !== feat.length) continue;
      if (e.actual !== "OVER" && e.actual !== "UNDER") continue;
      let d = 0; for (let i = 0; i < feat.length; i++) { const x = feat[i] - e.feat[i]; d += x * x; }
      near.push({ d, over: e.actual === "OVER" ? 1 : 0 });
    }
  }
  if (near.length < 12) return null;                       // too little memory to mean anything yet
  near.sort((a, b) => a.d - b.d);
  const K = Math.min(k || 20, near.length);
  let over = 0; for (let i = 0; i < K; i++) over += near[i].over;
  const overPct = Math.round(over / K * 100);
  return { n: K, overPct, side: overPct >= 60 ? "OVER" : overPct <= 40 ? "UNDER" : "SKIP", pool: near.length };
}
// Train each graded round EXACTLY ONCE, on the most accurate label available: open-time features →
// did the round finish OVER (1) or UNDER (0). Kalshi-ticketed rounds are trained from reconcileKalshi
// once Kalshi confirms the DEFINITIVE settled result (so the model learns Kalshi's truth, not a
// provisional candle grade that can flip on a thin round); self-tracked rounds train on their Coinbase
// outcome at grade time. The `trained` flag guarantees no round ever teaches the model twice.
function learnFromRound(coinModel, global, e) {
  if (!e || e.trained || !Array.isArray(e.feat)) return;
  if (e.actual !== "OVER" && e.actual !== "UNDER") return;
  const y = e.actual === "OVER" ? 1 : 0;
  if (coinModel) trainModel(coinModel, e.feat, y);
  if (global) trainModel(global, e.feat, y);
  e.trained = true;
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
  if (w.length > 11 && Math.abs(w[11]) > 0.12) tend.push(w[11] > 0 ? "follows the broader market — when the other coins are rising, this one leans OVER" : "tends to diverge from the broader market (counter-moves the pack)");
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

// Next 15-min round boundary (UTC :00/:15/:30/:45) at least `minLead` minutes ahead. Used by the
// Kalshi-independent fallback to anchor a self-tracked round from the clock when Kalshi is unreachable.
function nextRoundClose(nowMs, minLead) {
  const Q = 15 * 60000;
  let t = Math.ceil(nowMs / Q) * Q;                       // the next quarter-hour boundary
  while (t - nowMs < (minLead || 0) * 60000) t += Q;      // ...and far enough out to be a real, open round
  return t;
}
// Net momentum of the OTHER tracked coins (excluding `coin`), from the per-run cross-asset snapshot
// in st.market. Stale-guarded to ~20 min so a coin that stopped updating can't drag the signal.
// Returns null until peers have data — the model then treats the feature as neutral (0).
function otherCoinsMom(st, coin) {
  if (!st || !st.market) return null;
  const cutoff = Date.now() - 20 * 60000;
  let sum = 0, n = 0;
  for (const c in st.market) {
    if (c === coin) continue;
    const m = st.market[c];
    if (m && typeof m.mom === "number" && m.ts >= cutoff) { sum += m.mom; n++; }
  }
  return n ? sum / n : null;
}
async function runCoinPick(env, coin, st) {
  const series = env["KALSHI_SERIES_" + coin], product = CB_PRODUCT[coin];
  if (!product) return;   // no Kalshi series? still SELF-track it (Coinbase close vs the round open) — we just skip the Kalshi crowd fetch below
  const global = st.global;
  const [micro, obi] = await Promise.all([
    cbMicro(product).catch(() => null),
    cbObi(product).catch(() => null),
  ]);
  // Cross-asset snapshot: stash this coin's live momentum so the OTHER coins' models can read a
  // market-wide / leader factor THIS SAME run — zero extra fetches (momentum is already computed).
  if (micro && typeof micro.mom === "number") { (st.market || (st.market = {}))[coin] = { mom: micro.mom, ts: Date.now() }; }
  // The cron can't rely on the app to keep the Kalshi crowd cache warm (the app is usually closed
  // when this runs), and Kalshi 429s Cloudflare's shared egress IPs — so make a few attempts to land
  // FRESH data and PERSIST a success, keeping the shared cache (and the app/best endpoints) warm.
  // Without this the cron routinely saw only stale data and locked no pick — the "stopped logging
  // while I was away" bug. A couple of 1s waits only happen when a fetch is actually failing.
  let crowd = null;
  if (series) for (let i = 0; i < 3; i++) {   // self-tracked coins (no series) skip straight to the fallback — zero Kalshi load
    crowd = await getKalshiCrowd(env, series, true).catch(() => null);
    if (crowd && !crowd.stale && typeof crowd.overPct === "number") break;   // hold out for a PRICED read; a quotes-less shell still helps the fallback below
    if (i < 2) await sleep(1000);
  }
  const rec = st.coins[coin] || (st.coins[coin] = { coin, pending: null, history: [], graded: 0, correct: 0 });
  const coinModel = padModel(rec.model || newModel());

  // 1) grade the previous pick once its round has closed — and LEARN from the outcome.
  // Settle against the price AT THE CLOSE (the finalized 1-min candle ending at closeMs), NOT the
  // live price when this cron happens to run — a late cron or a post-close tick used to flip rounds.
  const p = rec.pending;
  if (p && Date.now() >= (p.closeMs || 0) && typeof p.strike === "number") {
    // Match Kalshi's METHOD as closely as free data allows: it settles on a 60-SECOND AVERAGE of a
    // multi-exchange index, so prefer our 60-sec Coinbase average over a single candle close. Also keep
    // the single-candle side and flag the round "disputed" when the two land on OPPOSITE sides — a
    // photo-finish where the proxy can't be trusted, so we won't teach the model until Kalshi confirms
    // (reconcileKalshi upgrades it to the definitive result on a later cron). We grade EVERY round incl.
    // SKIPs (shadow-grading) so the app shows both the bets-only and "if it bet every round" hit-rates;
    // the model learns from every round either way.
    const avg60 = await cbAvg60(product, p.closeMs);
    const candle = await cbCloseAt(product, p.closeMs);
    let settle = avg60 != null ? avg60 : candle;
    if (settle == null && micro && typeof micro.price === "number") settle = micro.price;   // last resort if both are missing
    const actual = (typeof settle === "number" ? (settle > p.strike ? "OVER" : settle < p.strike ? "UNDER" : "FLAT") : null);
    const candleSide = (typeof candle === "number") ? (candle > p.strike ? "OVER" : candle < p.strike ? "UNDER" : "FLAT") : null;
    const disputed = (actual === "OVER" || actual === "UNDER") && !!candleSide && candleSide !== actual;   // 60-sec avg vs single candle disagree → photo-finish
    if (actual && actual !== "FLAT") {
      const bet = (p.side === "OVER" || p.side === "UNDER");
      const lean = bet ? p.side : (p.pOver >= 50 ? "OVER" : "UNDER");          // the side it leaned, even on a SKIP
      const correct = bet ? (actual === p.side) : null;
      const over$ = (typeof settle === "number") ? Math.round((settle - p.strike) * 100) / 100 : null;
      const overPct = (over$ != null && p.strike > 0) ? Math.round((settle - p.strike) / p.strike * 1e5) / 1e3 : null;
      rec.history.unshift({ time: p.label, ts: p.ts || null, side: p.side, lean, actual, correct, skipped: !bet, prob: p.prob, pOver: typeof p.pOver === "number" ? p.pOver : null, pRaw: typeof p.pRaw === "number" ? p.pRaw : null, strike: p.strike, close: typeof settle === "number" ? settle : null, over: over$, overPct: overPct, ticker: p.ticker || null, self: p.self || false, feat: Array.isArray(p.feat) ? p.feat : null, caseMem: p.caseMem || null, disputed: disputed, trained: false, src: p.self ? "self" : "candle",
        // Data-quality fields (2026-07 audit): the crowd price the pick was made AT (crowdLean in feat is a
        // squashed copy — this is the raw %), Kalshi's own posted strike when we self-anchored (to measure
        // strike drift vs our price-now proxy), and whether the second-chance retry upgraded this pick.
        crowd: p.signals && typeof p.signals.crowdOver === "number" ? p.signals.crowdOver : null,
        kStrike: typeof p.kStrike === "number" ? p.kStrike : null,
        retried: p.retried ? true : undefined });
      if (rec.history.length > 300) rec.history.pop();
      rec.lastMargin = overPct;   // signed % the last round settled past its line (mean-reversion / momentum tell)
      rec.lastActual = actual;
      // LEARN from the most accurate label, training each round exactly once. Self-tracked rounds (no
      // Kalshi ticker) get their final label now — their outcome IS the Coinbase close vs the open.
      // Kalshi-ticketed rounds DEFER to reconcileKalshi, which trains them on Kalshi's DEFINITIVE
      // settled result rather than a provisional candle grade that can flip on a thin round.
      if (!p.ticker) learnFromRound(coinModel, global, rec.history[0]);
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
    // Kalshi-independent FALLBACK so the tracker keeps logging 24/7 — the main cause of DROPPED rounds.
    // Self-anchor a round from the clock + the live Coinbase price: strike = price NOW (= the round's
    // open), close = the next 15-min boundary ≥6 min out. PURELY ADDITIVE — it only fires when the
    // Kalshi path above locked NOTHING, for ANY reason: Kalshi unreachable/stale, OR a late cron left no
    // market in the 6–16.5 min window, OR the only open market was already decided. (Previously it fired
    // only on stale crowd, so a late cron with FRESH-but-unusable Kalshi data recorded nothing — that was
    // ~30% of rounds going missing. Now any cron that runs records a round.) A normal Kalshi-reachable
    // pick is byte-for-byte unchanged. No ticker, so reconcileKalshi never claims these as Kalshi-confirmed
    // (they stay honestly "self-tracked"); since the model already trains on close-vs-open, strike = open
    // makes a self-anchored round its cleanest case. Needs only Coinbase (micro), so it still records
    // while Kalshi is rate-limiting the server IP.
    if (!mkt && micro && typeof micro.price === "number") {
      // NEW (2026-07 audit): even when the crowd price is unusable, we often still know WHICH market this
      // round is — a quotes-less shell from fetchCrowd (fresh markets show "Target price: TBD" for the
      // first minute or two). Pin its ticker + close time to the self-anchored round so reconcileKalshi
      // can later grade it against Kalshi's DEFINITIVE settled result. The pick itself still prices off
      // Coinbase only (no crowd input → it can't commit a bet, see the crowd gate below); the strike stays
      // our own price-now (self-consistent with the Coinbase settle proxy), and Kalshi's posted strike, if
      // any, rides along as kStrike for the record. Before this, ~78% of rounds stayed permanently
      // self-graded with no path back to the truth.
      let shell = null;
      if (crowd) {
        for (const cnd of [crowd, crowd.next]) {
          if (!cnd || !cnd.ticker || !cnd.closeTime) continue;
          const left = (new Date(cnd.closeTime).getTime() - nowMs) / 60000;
          if (left >= 6 && left <= 16.5) { shell = cnd; break; }
        }
      }
      mkt = {
        ticker: shell ? shell.ticker : null,
        strike: micro.price,
        kStrike: shell && typeof shell.strike === "number" ? shell.strike : null,
        overPct: null,
        closeTime: shell ? shell.closeTime : nextRoundClose(nowMs, 6),
        self: true,
      };
    }
    if (mkt) {
      const marketMom = otherCoinsMom(st, coin);   // net momentum of the OTHER coins (cross-asset beta / BTC lead-lag); null until peers have data
      const sigVals = { crowdOver: mkt.overPct, mom: micro && micro.mom, obi: obi, sig: micro && micro.sig, rngClose: micro && micro.rngClose, rsi: micro && micro.rsi, macdH: micro && micro.macdH, price: micro && micro.price, lastMargin: rec.lastMargin, marketMom };
      const nowTs = nowMs;
      const feat = featuresFor(coinModel, sigVals, rec.lastActual, nowTs);
      if (micro && typeof micro.sig === "number" && micro.sig > 0) coinModel.avgSig = coinModel.avgSig == null ? micro.sig : 0.97 * coinModel.avgSig + 0.03 * micro.sig;
      const modelOver = predictBlend(coinModel, global, feat);      // learned P(OVER) for this round
      const cmem = caseMemory(st, feat, 20);                        // case memory: nearest past setups → outcome (measurement-only, NOT in the blend below)
      const fp = freePick(mkt.overPct, micro && micro.mom, obi, modelOver, micro && micro.sig, rec.calib);
      // CROWD GATE (2026-07 data audit): never COMMIT a bet without a live crowd price. Committed picks
      // made with the crowd present hit 40/50 (80%); the ones made blind (momentum+model only) went 6/12 —
      // a coin flip. The round still logs its lean (shadow record) and still trains the model; it just
      // can't claim a bet on the scoreboard. Only ever makes it skip MORE, like the band gate below.
      if (fp && fp.side !== "SKIP" && typeof mkt.overPct !== "number") fp.side = "SKIP";
      if (fp && fp.side !== "SKIP" && !bandEdgeOK(rec.history, fp.pRaw)) fp.side = "SKIP";   // accuracy #2: this band hasn't beaten break-even on record → pass (measured on the 24/7 scoreboard)
      if (fp) {
        const d = new Date(nowTs);
        rec.pending = {
          coin, ticker: mkt.ticker || null, self: mkt.self || false, strike: mkt.strike, kStrike: typeof mkt.kStrike === "number" ? mkt.kStrike : null, openPrice: micro ? micro.price : mkt.strike, side: fp.side,
          pOver: Math.round(fp.pOver * 100),
          pRaw: Math.round(fp.pRaw * 100),                          // pre-calibration blend — fit the calibrator on this, never on itself
          prob: Math.round((fp.side === "UNDER" ? 1 - fp.pOver : fp.pOver) * 100),
          conf: fp.conf, agree: fp.agree,                            // confluence: share of reads (0–1) + count agreeing
          modelOver: Math.round(modelOver * 100),
          caseMem: cmem,                                            // "similar past setups" memory — scored, fed to the AI, not yet in the pick
          closeMs: new Date(mkt.closeTime).getTime(),                // grade exactly when THIS round closes
          ts: nowTs,                                                 // client formats this to 12-hour local time
          label: pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC",   // fallback for older clients
          feat,                                                      // remembered so the next run can learn from it
          signals: { crowdOver: typeof mkt.overPct === "number" ? Math.round(mkt.overPct) : null, mom: micro ? round4(micro.mom) : null, obi: obi != null ? Math.round(obi * 100) / 100 : null, rsi: micro && typeof micro.rsi === "number" ? Math.round(micro.rsi) : null, macdH: micro && typeof micro.macdH === "number" ? round4(micro.macdH) : null, stochK: micro && typeof micro.stochK === "number" ? micro.stochK : null, stochD: micro && typeof micro.stochD === "number" ? micro.stochD : null },
        };
      }
    }
  }
  rec.model = coinModel;
  // Kalshi upgrade runs LAST and wrapped — off the critical path, so a Kalshi hiccup can't stall the
  // grade/pick above or get us rate-limited into a failed crowd fetch next cron.
  try { await reconcileKalshi(env, rec, coinModel, global); } catch (_) {}
  // Recompute ALL scoreboard stats from history — one source of truth, no counter drift through
  // reconcile or shadow-grading. bet = committed OVER/UNDER; shadow = EVERY round by the side it
  // leaned (so we can show "if it bet every round" + how often it actually bets / coverage).
  let g = 0, c = 0, sg = 0, sc = 0, cmg = 0, cmc = 0;
  for (const e of rec.history) {
    if (e.actual !== "OVER" && e.actual !== "UNDER") continue;
    const ln = e.lean || e.side;
    if (ln === "OVER" || ln === "UNDER") { sg++; if (ln === e.actual) sc++; }
    if (e.side === "OVER" || e.side === "UNDER") { g++; if (e.side === e.actual) c++; }
    if (e.caseMem && (e.caseMem.side === "OVER" || e.caseMem.side === "UNDER")) { cmg++; if (e.caseMem.side === e.actual) cmc++; }   // case memory, measure-first
  }
  rec.graded = g; rec.correct = c;
  rec.shadowGraded = sg; rec.shadowCorrect = sc; rec.seen = sg;     // seen = every round it evaluated (bet or skip)
  rec.hitRatePct = g ? Math.round(c / g * 100) : null;
  rec.shadowHitPct = sg ? Math.round(sc / sg * 100) : null;        // if it had bet every round
  rec.betRatePct = sg ? Math.round(g / sg * 100) : null;           // coverage — how often it actually commits
  rec.caseGraded = cmg; rec.caseCorrect = cmc; rec.caseHitPct = cmg ? Math.round(cmc / cmg * 100) : null;   // case-memory hit-rate when it leaned (measure-first; not in the pick)
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
