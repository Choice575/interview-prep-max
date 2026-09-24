const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('./public/data-loader.js');

test('loads only requested datasets and shares concurrent requests', async () => {
  const calls=[]; const published=[];
  const loader=create({files:{core:'/core',extra:'/extra'},fetch:async path=>{
    calls.push(path); return {ok:true,json:async()=>[path]};
  },onLoad:key=>published.push(key)});
  await Promise.all([loader.load(['core','core']),loader.load(['core'])]);
  await loader.load(['core']);
  assert.deepEqual(calls,['/core']);
  assert.deepEqual(published,['core']);
  assert.equal(loader.has('extra'),false);
});

test('a failed dataset leaves successful data usable and can be retried', async () => {
  let failed=true;
  const loader=create({files:{good:'/good',bad:'/bad'},fetch:async path=>({
    ok:path!=='/bad'||!failed,status:503,json:async()=>({items:[]})
  })});
  await assert.rejects(loader.load(['good','bad']),/503/);
  assert.equal(loader.has('good'),true);
  assert.equal(loader.has('bad'),false);
  failed=false;
  await loader.load(['bad']);
  assert.equal(loader.hasAll(['good','bad']),true);
});

test('times out stalled requests, ignores late results and retries cleanly', async () => {
  let resolveFirst; let calls=0; const published=[];
  const loader=create({files:{core:'/core'},timeoutMs:15,onLoad:(_,data)=>published.push(data),fetch:()=>{
    calls++;
    if(calls===1)return new Promise(resolve=>{resolveFirst=resolve;});
    return Promise.resolve({ok:true,json:async()=>['new']});
  }});
  await assert.rejects(loader.load(['core']),/timeout/);
  await loader.load(['core']);
  resolveFirst({ok:true,json:async()=>['old']});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.deepEqual(published,[['new']]);
});

test('rejects invalid JSON values and unknown dataset names', async () => {
  const loader=create({files:{core:'/core'},fetch:async()=>({ok:true,json:async()=>null})});
  await assert.rejects(loader.load(['core']),/Invalid dataset/);
  await assert.rejects(loader.load(['missing']),/Unknown dataset/);
  await assert.rejects(loader.load(['constructor']),/Unknown dataset/);
});
