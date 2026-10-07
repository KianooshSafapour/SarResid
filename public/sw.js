/* سررسید (SarResid) service worker — conservative offline shell.
 * Strategy: network-first for pages & API; stale-while-revalidate for static assets.
 * Never caches POST/PUT/PATCH/DELETE. Cache version bumped on every release.
 * FIX round-17: pure cache-first for /_next/static served STALE code after deploys
 * (Turbopack dev chunk URLs are module-id hashed, not content hashed) — this made
 * deployed features appear to "revert". Static now revalidates in background and
 * dev-internal chunks are never cached. */
const CACHE = 'hz-shell-v17'
const SHELL = ['/', '/favicon.svg', '/logo.svg', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // API always live (freshness > offline)
  // Turbopack/dev-internal chunks must NEVER be cached — they mutate at the same URL.
  if (url.pathname.includes('/_next/static/chunks/') && /(_\.js|\.map)$/.test(url.pathname)) return
  if (req.headers.get('accept')?.includes('text/html')) {
    // network-first with cache fallback
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/')))
    )
    return
  }
  // static: stale-while-revalidate — instant cache, silent background refresh
  e.respondWith(
    caches.match(req).then((m) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => m)
      return m || net
    })
  )
})
