// Service Worker для Interview Prep Max — кэширование для оффлайн-работы
const CACHE_NAME = 'ipmax-v6';
const ASSETS = [
  '/',
  '/index.html',
  '/interview-prep-max.webmanifest'
];

// Установка: кэшируем все основные ресурсы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  // Активируем сразу, не ждём перезагрузки
  self.skipWaiting();
});

// Активация: чистим старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Стратегия: Network First, падаем в кэш
self.addEventListener('fetch', event => {
  // Не кэшируем Google Fonts (они со своими заголовками CORS)
  if (event.request.url.includes('fonts.googleapis.com') || 
      event.request.url.includes('fonts.gstatic.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Кэшируем успешные ответы
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Оффлайн — отдаём из кэша
        return caches.match(event.request);
      })
  );
});
