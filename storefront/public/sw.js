/* سرویس‌ورکر ویترین — پوستهٔ آفلاین + کش استاتیک؛ API هرگز کش نمی‌شود */
const VERSION = 'hz-shop-v1'
const SHELL = ['/', '/offline', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg', '/manifest.webmanifest', '/fonts/Vazirmatn-Regular.woff2', '/fonts/Vazirmatn-Medium.woff2', '/fonts/Vazirmatn-Bold.woff2', '/img/placeholder.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return // دادهٔ زنده هرگز کش نمی‌شود

  // صفحات: شبکه اول، بازگشت به کش/آفلاین
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(e.request, copy))
          return res
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/offline'))),
    )
    return
  }

  // استاتیک: کش اول با بازآوری در پس‌زمینه
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetching = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(e.request, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || fetching
    }),
  )
})
