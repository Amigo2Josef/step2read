/* Step2Read service worker: lets the app open and run with no signal.
   Opening the app: when online, the newest version is fetched first (a slow or absent connection
   falls back to the copy saved on the phone within a few seconds), so updates appear at once.
   Results are never handled here: they are saved on the phone and sent by the app. */
const CACHE = "step2read-v1.3.1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  const done = (async () => {
    const ks = await caches.keys();
    const old = ks.filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    return old.length > 0;
  })();
  e.waitUntil(done);
  // Once active: pages still showing an older version (opened before this update) reload onto the
  // new one, keeping their full address so an invite or reset link in it is read by the new version.
  done.then((upgraded) => { if (upgraded) setTimeout(async () => { for (const c of await self.clients.matchAll({ type: "window" })) { try { c.navigate(c.url); } catch (x) {} } }, 50); });
});
const timeout = (ms) => new Promise((r) => setTimeout(() => r(null), ms));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // results go straight to the network
  const url = new URL(req.url);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !isFont) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const same = url.origin === location.origin;
    const net = fetch(same ? new Request(req, { cache: "no-cache" }) : req).then((r) => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
    if (req.mode === "navigate") { // newest page first, saved copy if the network is slow or off
      const r = await Promise.race([net, timeout(4000)]);
      if (r && r.ok) return r;
      return (await c.match(req, { ignoreSearch: true })) || (await c.match("./index.html")) || (await net) || Response.error();
    }
    const hit = await c.match(req, { ignoreSearch: same });
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  }));
});
