/* eslint-disable */
// Service worker for Bits Image.
//
// Goals (locked in during planning):
//   - Install-first PWA: standalone window + icons.
//   - Offline shell only — never cache authed HTML.
//   - Cache-first for hashed Next assets (/_next/static/*).
//   - Stale-while-revalidate for the /unlock page.
//   - Network-only for /api/*, server actions (POST), and every other
//     navigation. Offline navigations fall back to cached /unlock so the
//     user sees the gate shell instead of the browser's offline page.
//
// Bump VERSION when caching strategy or precache list changes. Old
// caches whose names don't match the current set are dropped on
// activate.

const VERSION = "v1";
const STATIC_CACHE = `bits-static-${VERSION}`;
const SHELL_CACHE = `bits-shell-${VERSION}`;
const KNOWN_CACHES = new Set([STATIC_CACHE, SHELL_CACHE]);
const PRECACHE_URLS = ["/unlock"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !KNOWN_CACHES.has(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Cache-first for hashed static assets. Different build = different
// hash = different URL = automatic miss + refetch, so this is safe
// to keep forever.
async function staticAssetFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

// Stale-while-revalidate for the precached /unlock shell. Serve the
// cached copy immediately, refresh in the background. Offline = serve
// cache without the refresh.
async function unlockShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match("/unlock");
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put("/unlock", res.clone());
      return res;
    })
    .catch(() => null);
  return hit ?? (await network) ?? new Response("Offline", { status: 503 });
}

// Network-first for every other navigation. Authed pages are private
// and DB-backed — never written to cache. When the network fails, fall
// back to the cached /unlock shell so the user lands somewhere usable.
async function navigateNetworkFirst(req) {
  try {
    return await fetch(req);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const fallback = await cache.match("/unlock");
    return fallback ?? new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Defensive: never touch non-GET. Server actions, mutations, and any
  // request that could carry credentials in its body or return a
  // Set-Cookie response stay on the network.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin requests (analytics, fonts on CDNs, etc.) — let
  // the browser handle them with its own HTTP cache.
  if (url.origin !== self.location.origin) return;

  // /api/* is network-only. Includes /api/img/* (signed R2 redirects)
  // and any future API routes that return user-scoped data.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed Next.js build output: cache forever (URL changes per build).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAssetFirst(req));
    return;
  }

  // Only HTML routes from here on. `mode === "navigate"` is the canonical
  // signal for top-level page loads.
  if (req.mode !== "navigate") return;

  if (url.pathname === "/unlock") {
    event.respondWith(unlockShell(req));
    return;
  }

  event.respondWith(navigateNetworkFirst(req));
});
