// Sonics notification server (a Cloudflare Worker).
//
// It only stores, per phone: the push address, the task times and the time zone. No names, habits or journal.
// Every 5 minutes (cron), it sends an empty push to each phone whose task time just arrived. The phone's
// service worker decides what the alert says, from the schedule the app saved on the phone.
//
// Routes (called by the app):
//   POST /subscribe    {subscription, times: ["07:00", "12:00", ...], tz}  -> save or update
//   POST /unsubscribe  {endpoint}                                         -> delete
//   POST /test         {endpoint}                                         -> send one ping now

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const WINDOW_MIN = 5; // matches the cron schedule in wrangler.toml

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ ok: true, service: "sonics-notify" });
    const url = new URL(request.url);
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

    if (url.pathname === "/subscribe") {
      const sub = body.subscription;
      if (!sub || !validEndpoint(sub.endpoint)) return json({ error: "bad subscription" }, 400);
      const times = (body.times || []).filter(t => /^\d{2}:\d{2}$/.test(t)).slice(0, 10);
      const tz = typeof body.tz === "string" && body.tz.length < 64 ? body.tz : "America/Los_Angeles";
      await env.SUBS.put(await keyFor(sub.endpoint), JSON.stringify({ endpoint: sub.endpoint, times, tz }));
      return json({ ok: true });
    }
    if (url.pathname === "/unsubscribe") {
      if (!validEndpoint(body.endpoint)) return json({ error: "bad endpoint" }, 400);
      await env.SUBS.delete(await keyFor(body.endpoint));
      return json({ ok: true });
    }
    if (url.pathname === "/test") {
      if (!validEndpoint(body.endpoint)) return json({ error: "bad endpoint" }, 400);
      const known = await env.SUBS.get(await keyFor(body.endpoint));
      if (!known) return json({ error: "not subscribed" }, 404);
      const status = await sendPush(body.endpoint, env);
      return json({ ok: status >= 200 && status < 300, status });
    }
    return json({ error: "not found" }, 404);
  },

  // Every 5 minutes: ping phones with a task time in the last 5 minutes (their local time).
  async scheduled(event, env) {
    const now = new Date(event.scheduledTime);
    let cursor;
    do {
      const page = await env.SUBS.list({ cursor });
      for (const k of page.keys) {
        const raw = await env.SUBS.get(k.name);
        if (!raw) continue;
        const sub = JSON.parse(raw);
        if (!sub.times.some(t => dueNow(t, sub.tz, now))) continue;
        const status = await sendPush(sub.endpoint, env);
        if (status === 404 || status === 410) await env.SUBS.delete(k.name); // phone unsubscribed or app removed
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

// Only real browser push services, so this can't be used to send requests anywhere else.
function validEndpoint(e) {
  if (typeof e !== "string" || e.length > 1000) return false;
  try {
    const h = new URL(e).hostname;
    return new URL(e).protocol === "https:" && (h.endsWith("push.apple.com") || h.endsWith("googleapis.com") ||
      h.endsWith("mozilla.com") || h.endsWith("notify.windows.com"));
  } catch { return false; }
}

async function keyFor(endpoint) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return "sub:" + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Is the task time "HH:MM" (in time zone tz) within the last WINDOW_MIN minutes before now?
function dueNow(hhmm, tz, now) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch { return false; }
  const h = +parts.find(p => p.type === "hour").value, m = +parts.find(p => p.type === "minute").value;
  const nowMin = h * 60 + m;
  const [th, tm] = hhmm.split(":").map(Number);
  const diff = (nowMin - (th * 60 + tm) + 1440) % 1440;
  return diff < WINDOW_MIN;
}

// ---- Web Push with no message body (so no encryption needed), signed with our VAPID key ----
function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function vapidJWT(audience, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT,
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(header + "." + claims));
  return header + "." + claims + "." + b64url(sig);
}

async function sendPush(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJWT(aud, env);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { TTL: "3600", Urgency: "normal", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, "Content-Length": "0" },
  });
  if (!res.ok) console.log("push failed", res.status, (await res.text()).slice(0, 200));
  return res.status;
}
