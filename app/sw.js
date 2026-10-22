// Lets the app open with no internet. Always tries the network first so updates show up,
// and falls back to the saved copy when offline. Also shows the push notifications.
const CACHE = "sonics-v2";
const FILES = ["./", "index.html", "data.js", "manifest.webmanifest", "icon-180.png", "icon-512.png"];
const NOTIFY_CACHE = "sonics-notify";   // the app saves today's alert schedule here

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("sonics-v") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

async function readJSON(key) {
  try {
    const res = await (await caches.open(NOTIFY_CACHE)).match(key);
    return res ? await res.json() : null;
  } catch (e) { return null; }
}

// The server sends an empty "ping" at a task time. Pick the alert whose time just arrived.
async function alertForNow() {
  const test = await readJSON("test");
  if (test && Date.now() - test.at < 2 * 60 * 1000) return { title: "✅ Sonics notifications work", body: "You'll get your daily tasks here." };
  const sched = (await readJSON("schedule")) || [];
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
  let best = null, bestGap = 31;
  for (const s of sched) {
    const [h, m] = s.time.split(":").map(Number);
    const gap = (now - (h * 60 + m) + 1440) % 1440;
    if (gap < bestGap) { best = s; bestGap = gap; }
  }
  return best || { title: "Sonics", body: "Something's waiting for you in the app." };
}

self.addEventListener("push", e => {
  e.waitUntil(alertForNow().then(a => self.registration.showNotification(a.title, {
    body: a.body, icon: "icon-180.png", badge: "icon-180.png", tag: "sonics-" + (a.time || "x"),
  })));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});
