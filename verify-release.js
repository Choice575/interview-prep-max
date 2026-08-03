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
const changelog = read('CHANGELOG.md');
const manifest = JSON.parse(read('interview-prep-max.webmanifest'));

const versionMatch = version.match(/self\.IPMAX_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
const appVersion = versionMatch && versionMatch[1];
expect(!!appVersion, 'version.js должен содержать semver IPMAX_VERSION');
expect(/self\.IPMAX_CACHE_PREFIX\s*=\s*'ipmax-v'/.test(version), 'version.js должен задавать собственный префикс offline-кеша');
expect(/self\.IPMAX_CACHE_NAME\s*=\s*self\.IPMAX_CACHE_PREFIX\s*\+\s*self\.IPMAX_VERSION/.test(version), 'имя offline-кеша должно строиться из префикса и IPMAX_VERSION');
expect(!!appVersion && changelog.includes(`## v${appVersion} (`), 'CHANGELOG должен начинаться с записи текущей версии');
expect(/const APP_VERSION\s*=\s*self\.IPMAX_VERSION\s*\|\|\s*'dev'/.test(app), 'app.js должен использовать IPMAX_VERSION из version.js');
expect(/importScripts\('\.\/version\.js'\);/.test(sw), 'sw.js должен импортировать version.js');
expect(/const CACHE_NAME\s*=\s*self\.IPMAX_CACHE_NAME;/.test(sw), 'sw.js должен использовать IPMAX_CACHE_NAME');
expect(/const CACHE_PREFIX\s*=\s*self\.IPMAX_CACHE_PREFIX;/.test(sw), 'sw.js должен использовать собственный префикс при очистке кешей');

const versionScriptIndex = html.indexOf('<script src="./version.js"></script>');
const dateScriptIndex = html.indexOf('<script src="./date.js"></script>');
const storageScriptIndex = html.indexOf('<script src="./storage.js"></script>');
const progressScriptIndex = html.indexOf('<script src="./progress.js"></script>');
const coachScriptIndex = html.indexOf('<script src="./coach.js"></script>');
const aiCoachScriptIndex = html.indexOf('<script src="./ai-coach.js"></script>');
const progressIoScriptIndex = html.indexOf('<script src="./progress-io.js"></script>');
const offlineUiScriptIndex = html.indexOf('<script src="./offline-ui.js"></script>');
const sourcesUiScriptIndex = html.indexOf('<script src="./sources-ui.js"></script>');
const catalogUiScriptIndex = html.indexOf('<script src="./catalog-ui.js"></script>');
const analyticsUiScriptIndex = html.indexOf('<script src="./analytics-ui.js"></script>');
const homeUiScriptIndex = html.indexOf('<script src="./home-ui.js"></script>');
const examUiScriptIndex = html.indexOf('<script src="./exam-ui.js"></script>');
const studyUiScriptIndex = html.indexOf('<script src="./study-ui.js"></script>');
const coachUiScriptIndex = html.indexOf('<script src="./coach-ui.js"></script>');
const appScriptIndex = html.indexOf('<script src="./app.js"></script>');
expect(versionScriptIndex !== -1 && dateScriptIndex > versionScriptIndex && storageScriptIndex > dateScriptIndex && progressScriptIndex > storageScriptIndex && coachScriptIndex > progressScriptIndex && aiCoachScriptIndex > coachScriptIndex && progressIoScriptIndex > aiCoachScriptIndex && offlineUiScriptIndex > progressIoScriptIndex && sourcesUiScriptIndex > offlineUiScriptIndex && catalogUiScriptIndex > sourcesUiScriptIndex && analyticsUiScriptIndex > catalogUiScriptIndex && homeUiScriptIndex > analyticsUiScriptIndex && examUiScriptIndex > homeUiScriptIndex && studyUiScriptIndex > examUiScriptIndex && coachUiScriptIndex > studyUiScriptIndex && appScriptIndex > coachUiScriptIndex, 'index.html должен загружать browser-модули до app.js в установленном порядке');
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

const shellBlock = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/);
const dataBlock = sw.match(/const DATA_ASSETS = \[([\s\S]*?)\];/);
expect(!!shellBlock, 'не найден SHELL_ASSETS в sw.js');
expect(!!dataBlock, 'не найден DATA_ASSETS в sw.js');
expect(/const ASSETS = SHELL_ASSETS\.concat\(DATA_ASSETS\);/.test(sw), 'sw.js должен объединять shell и датасеты в ASSETS');
expect(/await cache\.addAll\(SHELL_ASSETS\);/.test(sw), 'offline-shell обязан кешироваться атомарно');
expect(/cache\.add\(asset\)\.then\(\(\) => null\)\.catch\(\(\) => asset\)/.test(sw), 'датасеты обязаны кешироваться по отдельности с обработкой сбоя');
const shellAssets = shellBlock ? [...shellBlock[1].matchAll(/'(\.\/[^']+)'/g)].map(match => match[1]) : [];
const dataAssets = dataBlock ? [...dataBlock[1].matchAll(/'(\.\/[^']+)'/g)].map(match => match[1]) : [];
const assets = shellAssets.concat(dataAssets);
['./index.html', './styles.css', './version.js', './date.js', './storage.js', './progress.js', './coach.js', './ai-coach.js', './progress-io.js', './offline-ui.js', './sources-ui.js', './best-practices-ui.js', './external-tasks-ui.js', './interview-practice-ui.js', './analytics-ui.js', './home-ui.js', './exam-ui.js', './study-ui.js', './coach-ui.js', './app.js', './interview-prep-max.webmanifest', './assets/icon-192.png', './assets/icon-512.png'].forEach(file => {
  expect(assets.includes(file), `offline-кеш не содержит ${file}`);
});
dataFiles.forEach(file => expect(assets.includes('./' + file), `offline-кеш не содержит ./${file}`));

if (errors.length) {
  console.error('Release integrity check failed:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(`Release ${appVersion} integrity check passed: ${dataFiles.length} data files and ${assets.length} cached assets.`);
