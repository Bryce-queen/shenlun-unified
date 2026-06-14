const CACHE_NAME = 'shenlun-unified-2026-06-14-security';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './manifest.json',
  './icon.svg',
  './申论统一修炼台.html',
  './404.html'
];

self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.matchAll({type:'window'}))
      .then(clients=>clients.forEach(client=>client.postMessage({type:'APP_UPDATED'})))
  );
  self.clients.claim();
});

self.addEventListener('message', event=>{
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event=>{
  if(event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(event.request, copy));
      return response;
    }).catch(()=>caches.match('./index.html')))
  );
});
