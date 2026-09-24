#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = __dirname;
const publicRoot = path.join(root, 'public');
const assetsManifest = require('./public/asset-manifest.js');
const errors = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => { if (!condition) errors.push(message); };

const version = read('public/version.js');
const app = read('public/app.js');
const sw = read('public/sw.js');
const html = read('public/index.html');
const changelog = read('CHANGELOG.md');
const manifest = JSON.parse(read('public/interview-prep-max.webmanifest'));

const versionMatch = version.match(/self\.IPMAX_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
const appVersion = versionMatch && versionMatch[1];
expect(!!appVersion, 'version.js должен содержать semver IPMAX_VERSION');
expect(/self\.IPMAX_CACHE_PREFIX\s*=\s*'ipmax-v'/.test(version), 'version.js должен задавать собственный префикс offline-кеша');
expect(/self\.IPMAX_CACHE_NAME\s*=\s*self\.IPMAX_CACHE_PREFIX\s*\+\s*self\.IPMAX_VERSION/.test(version), 'имя offline-кеша должно строиться из префикса и IPMAX_VERSION');
expect(!!appVersion && changelog.includes(`## v${appVersion} (`), 'CHANGELOG должен начинаться с записи текущей версии');
expect(/const APP_VERSION\s*=\s*self\.IPMAX_VERSION\s*\|\|\s*'dev'/.test(app), 'app.js должен использовать IPMAX_VERSION из version.js');
expect(/importScripts\('\.\/version\.js', '\.\/asset-manifest\.js'\);/.test(sw), 'sw.js должен импортировать version.js и asset-manifest.js');
expect(/const CACHE_NAME\s*=\s*self\.IPMAX_CACHE_NAME;/.test(sw), 'sw.js должен использовать IPMAX_CACHE_NAME');
expect(/const CACHE_PREFIX\s*=\s*self\.IPMAX_CACHE_PREFIX;/.test(sw), 'sw.js должен использовать собственный префикс при очистке кешей');

// Единый список скриптов — public/asset-manifest.js (аудит A4.1). index.html
// обязан подключать ровно их и в том же порядке; каждый скрипт должен лежать
// в public/, а в public/ не должно быть JS-файлов, которых нет в манифесте.
const htmlScripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
expect(JSON.stringify(htmlScripts) === JSON.stringify(assetsManifest.scripts),
  'index.html должен подключать скрипты ровно в порядке public/asset-manifest.js');
expect(assetsManifest.scripts[0] === './version.js' && assetsManifest.scripts.at(-1) === './app.js',
  'version.js грузится первым, app.js — последним');
assetsManifest.scripts.concat(assetsManifest.shell, assetsManifest.data).filter(file => file !== './').forEach(file => {
  expect(fs.existsSync(path.join(publicRoot, file.slice(2))), `в public/ нет ${file} из asset-manifest.js`);
});
const listed = new Set(assetsManifest.scripts.concat(assetsManifest.shell));
fs.readdirSync(publicRoot).filter(file => file.endsWith('.js') && file !== 'sw.js').forEach(file => {
  expect(listed.has('./' + file), `public/${file} не указан в asset-manifest.js`);
});
expect(manifest.start_url === './' && manifest.scope === './', 'manifest должен использовать относительные start_url и scope');

const requiredIcons = [
  { src: './assets/icon-192.png', size: 192, sizes: '192x192', purpose: 'any' },
  { src: './assets/icon-512.png', size: 512, sizes: '512x512', purpose: 'any maskable' }
];
requiredIcons.forEach(icon => {
  const declared = manifest.icons.find(candidate => candidate.src === icon.src && candidate.sizes === icon.sizes && candidate.type === 'image/png' && candidate.purpose === icon.purpose);
  const target = path.join(publicRoot, icon.src.slice(2));
  expect(!!declared, `manifest не содержит ${icon.sizes} PNG-иконку`);
  expect(fs.existsSync(target), `отсутствует ${icon.src}`);
  if (fs.existsSync(target)) {
    const image = fs.readFileSync(target);
    expect(image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${icon.src} не является PNG`);
    expect(image.readUInt32BE(16) === icon.size && image.readUInt32BE(20) === icon.size, `${icon.src} должен быть ${icon.sizes}`);
  }
});
expect(html.includes('<link rel="icon" type="image/png" sizes="192x192" href="./assets/icon-192.png">'), 'index.html должен использовать физическую PNG-иконку');
expect(html.includes('<link rel="apple-touch-icon" href="./assets/icon-192.png">'), 'index.html должен содержать apple-touch-icon');

const dataFilesBlock = app.match(/const DATA_FILES = \{([\s\S]*?)\n\};/);
expect(!!dataFilesBlock, 'не найден DATA_FILES в app.js');
const dataFiles = dataFilesBlock ? [...dataFilesBlock[1].matchAll(/'((?:tasks\/)[^']+\.json)'/g)].map(match => match[1]) : [];
expect(dataFiles.length > 0, 'DATA_FILES не содержит JSON-наборов');
dataFiles.forEach(file => expect(fs.existsSync(path.join(publicRoot, file)), `отсутствует ${file}, указанный в DATA_FILES`));

expect(/const SHELL_ASSETS = MANIFEST\.shell\.concat\(MANIFEST\.scripts\);/.test(sw), 'sw.js должен брать оболочку из asset-manifest.js');
expect(/const DATA_ASSETS = MANIFEST\.data;/.test(sw), 'sw.js должен брать датасеты из asset-manifest.js');
expect(/await cache\.addAll\(SHELL_ASSETS\);/.test(sw), 'offline-shell обязан кешироваться атомарно');
expect(/cache\.add\(asset\)\.then\(\(\) => null\)\.catch\(\(\) => asset\)/.test(sw), 'датасеты обязаны кешироваться по отдельности с обработкой сбоя');
const assets = assetsManifest.shell.concat(assetsManifest.scripts, assetsManifest.data);
['./index.html', './styles.css', './interview-prep-max.webmanifest', './assets/icon-192.png', './assets/icon-512.png'].forEach(file => {
  expect(assets.includes(file), `offline-кеш не содержит ${file}`);
});
dataFiles.forEach(file => expect(assetsManifest.data.includes('./' + file), `asset-manifest.js не содержит ./${file} из DATA_FILES`));
assetsManifest.data.forEach(file => expect(dataFiles.includes(file.slice(2)), `${file} из asset-manifest.js не загружается приложением`));
assetsManifest.coreData.forEach(file => expect(assetsManifest.data.includes(file), `${file} должен входить в data`));

if (errors.length) {
  console.error('Release integrity check failed:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(`Release ${appVersion} integrity check passed: ${dataFiles.length} data files and ${assets.length} cached assets.`);
