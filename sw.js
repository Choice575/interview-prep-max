importScripts('./version.js');
const CACHE_NAME = self.IPMAX_CACHE_NAME;
const CACHE_PREFIX = self.IPMAX_CACHE_PREFIX;

// The shell installs atomically: without it the app cannot start offline at all.
const SHELL_ASSETS = [
  './', './index.html', './styles.css',
  './version.js', './date.js', './storage.js',
  './progress.js', './coach.js', './ai-coach.js',
  './progress-io.js', './offline-ui.js', './sources-ui.js', './best-practices-ui.js', './interview-practice-ui.js', './analytics-ui.js', './home-ui.js',
  './exam-ui.js', './study-ui.js', './coach-ui.js',
  './app.js', './interview-prep-max.webmanifest', './assets/icon-192.png',
  './assets/icon-512.png'
];

// Datasets cache individually so one unavailable file cannot block the install.
const DATA_ASSETS = [
  './tasks/base_questions.json', './tasks/ts.json', './tasks/subnet.json',
  './tasks/cmd.json', './tasks/code.json', './tasks/git.json',
  './tasks/regex.json', './tasks/ansible_pb.json', './tasks/dockerfile.json',
  './tasks/k8s.json', './tasks/ports.json', './tasks/labs.json',
  './tasks/tips.json', './tasks/incidents.json', './tasks/study_map.json',
  './tasks/study_tests.json', './tasks/senior_cases.json', './tasks/best_practices.json', './tasks/question_sources.json', './tasks/interview_practice.json'
];

// Full asset list. Not read by precache() (shell and datasets are cached
// separately), but verify-release.js asserts this line exists as the single
// place where the complete cache manifest is visible.
// eslint-disable-next-line no-unused-vars
const ASSETS = SHELL_ASSETS.concat(DATA_ASSETS);

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_ASSETS);
  const failed = await Promise.all(DATA_ASSETS.map(asset =>
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

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  event.respondWith((async()=>{
    try {
      const response=await fetch(event.request);
      if(response.ok&&response.type!=='opaque'){
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
