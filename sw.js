// Service Worker v9 — Interview Prep Max
const CACHE_NAME = 'ipmax-v9';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './interview-prep-max.webmanifest',
  './tasks/base_questions.json', './tasks/ts.json', './tasks/subnet.json',
  './tasks/cmd.json', './tasks/code.json', './tasks/git.json', './tasks/regex.json',
  './tasks/ansible_pb.json', './tasks/dockerfile.json', './tasks/k8s.json', './tasks/ports.json',
  './tasks/labs.json', './tasks/tips.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
