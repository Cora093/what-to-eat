// 离线缓存:安装时把应用文件、菜谱数据和内置封面全部缓存,之后优先读缓存。
// 改了任何应用文件后,必须把 VERSION 加一,旧缓存才会被清掉、新文件才会生效。
const VERSION = 1;
const CACHE = `what-to-eat-v${VERSION}`;

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css',
  'js/app.js', 'js/views.js', 'js/db.js', 'js/seed.js', 'js/shopping.js', 'js/image.js', 'js/backup.js',
  'data/dishes.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL); // 任何一个失败就整体安装失败,避免半截缓存
    const data = await (await fetch('data/dishes.json')).json();
    const covers = data.dishes.filter((d) => d.cover).map((d) => `covers/${d.id}.webp`);
    // 封面缓存失败不影响使用,下次在线访问时会补上
    await Promise.allSettled(covers.map((u) => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
