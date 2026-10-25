/* 高考英语刷题 · 离线缓存
 * 目标：第一次联网打开后，之后断网/网络差也能正常做题。
 * 策略：缓存优先 + 后台更新（有网时静默拉新版本，下次打开生效）。
 * 构建时 build.mjs 会把 CACHE 版本号替换掉，从而触发旧缓存淘汰。
 */
const CACHE = 'gk-english-1792934625033';
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(network);   // 后台静默更新，不阻塞当前这次打开
      return cached;
    }
    const fresh = await network;
    if (fresh) return fresh;
    return new Response('离线且没有缓存，请先联网打开一次。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
