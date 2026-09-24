importScripts('./version.js', './asset-manifest.js');
const CACHE_NAME = self.IPMAX_CACHE_NAME;
const CACHE_PREFIX = self.IPMAX_CACHE_PREFIX;

// Списки ресурсов живут в asset-manifest.js (аудит A4.1).
const MANIFEST = self.IPMAX_ASSETS;
// The shell installs atomically: without it the app cannot start offline at all.
const SHELL_ASSETS = MANIFEST.shell.concat(MANIFEST.scripts);
// Datasets cache individually so one unavailable file cannot block the install.
const DATA_ASSETS = MANIFEST.data;
// eslint-disable-next-line no-unused-vars
const ASSETS = SHELL_ASSETS.concat(DATA_ASSETS);
const CORE_DATA_ASSETS = MANIFEST.coreData;

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_ASSETS);
  const failed = await Promise.all(CORE_DATA_ASSETS.map(asset =>
    cache.add(asset).then(() => null).catch(() => asset)
  ));
  const missing = failed.filter(Boolean);
  if (missing.length) console.warn('Offline datasets unavailable during install:', missing);
  return missing;
}

self.addEventListener('install', event => {
  event.waitUntil(precache());
});

self.addEventListener('message', event => {
  if(event.data&&event.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

async function fetchAndStore(request) {
  const response=await fetch(request);
  if(response.ok&&response.type!=='opaque'){
    const cache=await caches.open(CACHE_NAME);
    await cache.put(request,response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // Датасеты меняются только вместе с версией, а версия даёт новый кеш. Поэтому
  // их отдаём из кеша сразу и обновляем в фоне (stale-while-revalidate): без
  // этого каждое открытие ждёт до 2 МБ карточек по сети (аудит A3.1).
  if (/\/tasks\/[^/]+\.json$/.test(url.pathname)) {
    event.respondWith((async()=>{
      const cached=await caches.match(event.request,{ignoreSearch:true,cacheName:CACHE_NAME});
      const refresh=fetchAndStore(event.request).catch(()=>null);
      if(cached){
        if(typeof event.waitUntil==='function') event.waitUntil(refresh);
        return cached;
      }
      const response=await refresh;
      return response||new Response('Offline resource unavailable',{status:503,statusText:'Service Unavailable'});
    })());
    return;
  }

  event.respondWith((async()=>{
    try {
      return await fetchAndStore(event.request);
    } catch(error) {
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached) return cached;
      return new Response('Offline resource unavailable',{status:503,statusText:'Service Unavailable'});
    }
  })());
});
