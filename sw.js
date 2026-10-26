/* 高考英语刷题 · 离线缓存 + 自动更新
 *
 * 策略（兼顾「秒开」与「保持最新」）：
 *   - 页面本身（导航请求）：**缓存优先 + 后台更新** —— 有缓存就立刻显示（不再等 650 KB 题库下完），
 *     同时在后台绕过 HTTP 缓存取最新版；新版本装好后页面会提示「点这里刷新」。
 *   - 其他资源（含 bank.js）：缓存优先 + 后台静默更新。
 *   - 新版本装好立即接管（skipWaiting + clients.claim），页面侧会提示「点这里刷新」。
 *
 * build.mjs 会把 1793026835860 换成构建时间戳，从而淘汰旧缓存。
 */
const CACHE = 'gk-english-1793026835860';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './bank.js?v=1793026835860'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const offline = () => new Response('离线且没有缓存，请先联网打开一次。', {
  status: 503,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDoc = req.mode === 'navigate'
    || req.destination === 'document'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('/index.html');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    if (isDoc) {
      /* 缓存优先：先用上次的页面秒开；后台再绕过 HTTP 缓存取最新那份写回缓存。
       * 新版本由 SW 自身更新（版本号变化）+ 页面的「点这里刷新」提示来交付。 */
      const hit = await cache.match(req, { ignoreSearch: true })
        || await cache.match('./index.html')
        || await cache.match('./');
      const revalidate = fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.ok) {
          cache.put('./index.html', res.clone());
          cache.put('./', res.clone());
        }
        return res;
      }).catch(() => null);
      if (hit) {
        event.waitUntil(revalidate);   // 后台更新，不阻塞这次打开
        return hit;
      }
      const fresh = await revalidate;
      return fresh || offline();
    }

    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(network);   // 后台静默更新，不阻塞这次打开
      return cached;
    }
    const fresh = await network;
    return fresh || offline();
  })());
});