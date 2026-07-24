#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = __dirname;
const errors = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => { if (!condition) errors.push(message); };

const version = read('version.js');
const app = read('app.js');
const sw = read('sw.js');
const html = read('index.html');
const manifest = JSON.parse(read('interview-prep-max.webmanifest'));

expect(/self\.IPMAX_VERSION\s*=\s*'\d+\.\d+\.\d+'/.test(version), 'version.js должен содержать semver IPMAX_VERSION');
expect(/self\.IPMAX_CACHE_NAME\s*=\s*'ipmax-v'\s*\+\s*self\.IPMAX_VERSION/.test(version), 'имя offline-кеша должно строиться из IPMAX_VERSION');
expect(/const APP_VERSION\s*=\s*self\.IPMAX_VERSION\s*\|\|\s*'dev'/.test(app), 'app.js должен использовать IPMAX_VERSION из version.js');
expect(/importScripts\('\.\/version\.js'\);/.test(sw), 'sw.js должен импортировать version.js');
expect(/const CACHE_NAME\s*=\s*self\.IPMAX_CACHE_NAME;/.test(sw), 'sw.js должен использовать IPMAX_CACHE_NAME');

const versionScriptIndex = html.indexOf('<script src="./version.js"></script>');
const dateScriptIndex = html.indexOf('<script src="./date.js"></script>');
const storageScriptIndex = html.indexOf('<script src="./storage.js"></script>');
const progressScriptIndex = html.indexOf('<script src="./progress.js"></script>');
const coachScriptIndex = html.indexOf('<script src="./coach.js"></script>');
const aiCoachScriptIndex = html.indexOf('<script src="./ai-coach.js"></script>');
const progressIoScriptIndex = html.indexOf('<script src="./progress-io.js"></script>');
const analyticsUiScriptIndex = html.indexOf('<script src="./analytics-ui.js"></script>');
const homeUiScriptIndex = html.indexOf('<script src="./home-ui.js"></script>');
const coachUiScriptIndex = html.indexOf('<script src="./coach-ui.js"></script>');
const appScriptIndex = html.indexOf('<script src="./app.js"></script>');
expect(versionScriptIndex !== -1 && dateScriptIndex > versionScriptIndex && storageScriptIndex > dateScriptIndex && progressScriptIndex > storageScriptIndex && coachScriptIndex > progressScriptIndex && aiCoachScriptIndex > coachScriptIndex && progressIoScriptIndex > aiCoachScriptIndex && analyticsUiScriptIndex > progressIoScriptIndex && homeUiScriptIndex > analyticsUiScriptIndex && coachUiScriptIndex > homeUiScriptIndex && appScriptIndex > coachUiScriptIndex, 'index.html должен загружать browser-модули до app.js в установленном порядке');
expect(manifest.start_url === './' && manifest.scope === './', 'manifest должен использовать относительные start_url и scope');

const requiredIcons = [
  { src: './assets/icon-192.png', size: 192, sizes: '192x192', purpose: 'any' },
  { src: './assets/icon-512.png', size: 512, sizes: '512x512', purpose: 'any maskable' }
];
requiredIcons.forEach(icon => {
  const declared = manifest.icons.find(candidate => candidate.src === icon.src && candidate.sizes === icon.sizes && candidate.type === 'image/png' && candidate.purpose === icon.purpose);
  const target = path.join(root, icon.src.slice(2));
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
dataFiles.forEach(file => expect(fs.existsSync(path.join(root, file)), `отсутствует ${file}, указанный в DATA_FILES`));

const assetsBlock = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
expect(!!assetsBlock, 'не найден ASSETS в sw.js');
const assets = assetsBlock ? [...assetsBlock[1].matchAll(/'(\.\/[^']+)'/g)].map(match => match[1]) : [];
['./index.html', './styles.css', './version.js', './date.js', './storage.js', './progress.js', './coach.js', './ai-coach.js', './progress-io.js', './analytics-ui.js', './home-ui.js', './coach-ui.js', './app.js', './interview-prep-max.webmanifest', './assets/icon-192.png', './assets/icon-512.png'].forEach(file => {
  expect(assets.includes(file), `offline-кеш не содержит ${file}`);
});
dataFiles.forEach(file => expect(assets.includes('./' + file), `offline-кеш не содержит ./${file}`));

if (errors.length) {
  console.error('Release integrity check failed:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(`Release integrity check passed: ${dataFiles.length} data files and ${assets.length} cached assets.`);
