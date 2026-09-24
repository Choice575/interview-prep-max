(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxDataLoader = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  function create(options) {
    const ready = new Map();
    const pending = new Map();
    const request = options.fetch || fetch;
    function loadOne(key) {
      if (!Object.hasOwn(options.files, key)) return Promise.reject(new Error('Unknown dataset: ' + key));
      if (ready.has(key)) return Promise.resolve(ready.get(key));
      if (pending.has(key)) return pending.get(key);
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Dataset timeout: ' + key));
        }, options.timeoutMs || 15000);
      });
      const task = Promise.race([timeout, (async () => {
        const response = await request(options.files[key], {cache:'no-cache', signal:controller.signal});
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + key);
        const data = await response.json();
        if (!data || typeof data !== 'object') throw new Error('Invalid dataset: ' + key);
        return data;
      })()]).then(data => {
        if (options.onLoad) options.onLoad(key, data);
        ready.set(key, data);
        return data;
      }).finally(() => {
        clearTimeout(timer);
        pending.delete(key);
      });
      pending.set(key, task);
      return task;
    }
    return {
      load: keys => Promise.all([...new Set(keys)].map(loadOne)),
      has: key => ready.has(key),
      hasAll: keys => keys.every(key => ready.has(key))
    };
  }
  return {create};
});
