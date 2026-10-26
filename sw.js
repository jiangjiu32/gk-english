/* 高考英语刷题 · 离线缓存 + 自动更新
 *
 * 策略（重点解决「每次都要重新发链接才更新」）：
 *   - 页面本身（导航请求）：**网络优先** —— 只要联网，打开链接/刷新拿到的永远是线上最新版本；
 *     断网时回退到上次缓存，照样能做题。
 *   - 其他资源：缓存优先 + 后台静默更新。
 *   - 新版本装好立即接管（skipWaiting + clients.claim），页面侧会提示「点这里刷新」。
 *
 * build.mjs 会把 1793008295135 换成构建时间戳，从而淘汰旧缓存。
 */
const CACHE = 'gk-english-__VERSION__';
const ASSETS = ['./', './index.html', './manifest.webmanifest'];

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
      /* 网络优先：绕过 HTTP 缓存，拿到的一定是服务器上最新的那份 */
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          cache.put('./index.html', fresh.clone());
          cache.put('./', fresh.clone());
          return fresh;
        }
      } catch (e) { /* 断网，走缓存 */ }
      const hit = await cache.match(req, { ignoreSearch: true })
        || await cache.match('./index.html')
        || await cache.match('./');
      return hit || offline();
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