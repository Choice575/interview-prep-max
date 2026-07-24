importScripts('./version.js');
const CACHE_NAME = self.IPMAX_CACHE_NAME;

const ASSETS = [
  './', './index.html', './styles.css', './version.js', './date.js', './storage.js', './progress.js', './coach.js', './ai-coach.js', './coach-ui.js', './app.js', './interview-prep-max.webmanifest', './assets/icon-192.png', './assets/icon-512.png',
  './tasks/base_questions.json', './tasks/ts.json', './tasks/subnet.json',
  './tasks/cmd.json', './tasks/code.json', './tasks/git.json', './tasks/regex.json',
  './tasks/ansible_pb.json', './tasks/dockerfile.json', './tasks/k8s.json', './tasks/ports.json',
  './tasks/labs.json', './tasks/tips.json', './tasks/incidents.json', './tasks/study_map.json', './tasks/study_tests.json',
  './tasks/senior_cases.json', './tasks/best_practices.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('message', event => {
  if(event.data&&event.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  event.respondWith((async()=>{
    try {
      const response=await fetch(event.request);
      if(response.ok){
        const cache=await caches.open(CACHE_NAME);
        await cache.put(event.request,response.clone());
      }
      return response;
    } catch(error) {
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached) return cached;
      return new Response('Offline resource unavailable',{status:503,statusText:'Service Unavailable'});
    }
  })());
});
