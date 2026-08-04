// Flat config for ESLint 9. The app is plain browser-global JS (no bundler),
// so the goal here is catching real defects — unused variables, accidental
// globals, unreachable code — not enforcing a style.
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  self: 'readonly',
  globalThis: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  caches: 'readonly',
  crypto: 'readonly',
  console: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  FileReader: 'readonly',
  AbortController: 'readonly',
  Response: 'readonly',
  Request: 'readonly',
  Headers: 'readonly',
  performance: 'readonly',
  structuredClone: 'readonly',
  HTMLElement: 'readonly',
  DOMException: 'readonly',
  Storage: 'readonly',
  Response: 'readonly'
};

const nodeGlobals = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  globalThis: 'readonly',
  global: 'writable',
  fetch: 'readonly',
  AbortController: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  // Available as Node globals since v18 (undici).
  Response: 'readonly',
  Request: 'readonly',
  Headers: 'readonly',
  structuredClone: 'readonly'
};

// Functions defined in app.js but called from inline onclick= handlers in
// index.html, plus module globals that load via script tags. ESLint cannot see
// those call sites, so they must not be reported as unused.
const appGlobals = {
  IPMaxStudyUI: 'readonly',
  IPMaxExamUI: 'readonly',
  IPMaxHomeUI: 'readonly',
  IPMaxAnalyticsUI: 'readonly',
  IPMaxOfflineUI: 'readonly',
  IPMaxSourcesUI: 'readonly',
  IPMaxBestPracticesUI: 'readonly',
  IPMaxCatalogUI: 'readonly',
  IPMaxChapterUI: 'readonly',
  IPMaxRouter: 'readonly',
  IPMaxGamification: 'readonly',
  IPMaxGamificationUI: 'readonly',
  IPMaxDaily: 'readonly',
  IPMaxDailyUI: 'readonly',
  IPMaxTrainersUI: 'readonly',
  IPMaxQuestionBankUI: 'readonly',
  IPMaxExternalTasksUI: 'readonly',
  IPMaxInterviewPracticeUI: 'readonly',
  IPMaxAICoach: 'readonly',
  IPMaxCoach: 'readonly',
  IPMaxProgress: 'readonly',
  IPMaxProgressIO: 'readonly',
  IPMaxStorage: 'readonly',
  IPMaxDate: 'readonly',
  IPMaxQuestionQuality: 'readonly',
  IPMaxStudyCurriculumRules: 'readonly',
  InterviewCoachUI: 'readonly',
  InterviewCoach: 'readonly',
  ProgressTracker: 'readonly',
  IPMAX_VERSION: 'readonly',
  IPMAX_CACHE_NAME: 'readonly',
  IPMAX_CACHE_PREFIX: 'readonly'
};

const rules = {
  // Real defects only.
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-fallthrough': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-cond-assign': 'error',
  'no-sparse-arrays': 'error',
  'no-prototype-builtins': 'off',
  'no-async-promise-executor': 'error',
  'no-compare-neg-zero': 'error',
  'no-irregular-whitespace': 'error',
  'require-atomic-updates': 'off',
  'valid-typeof': 'error',
  eqeqeq: 'off'
};

export default [
  {
    // Browser-side application code: globals declared via script tags.
    files: ['app.js', 'sw.js', 'version.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...browserGlobals,
        ...appGlobals,
        // Service Worker only.
        importScripts: 'readonly',
        clients: 'readonly',
        skipWaiting: 'readonly'
      }
    },
    rules
  },
  {
    // Playwright specs: page.evaluate() bodies run in the browser, so browser
    // globals appear inside Node-side test files.
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, ...browserGlobals, ...appGlobals }
    },
    rules
  },
  {
    // UMD modules: work in both the browser and Node.
    files: [
      'coach.js', 'coach-ui.js', 'ai-coach.js', 'storage.js', 'progress.js', 'progress-io.js',
      'date.js', 'home-ui.js', 'exam-ui.js', 'study-ui.js', 'analytics-ui.js', 'offline-ui.js',
      'sources-ui.js', 'best-practices-ui.js', 'catalog-ui.js', 'chapter-ui.js', 'router.js', 'question-bank-ui.js', 'external-tasks-ui.js', 'interview-practice-ui.js', 'study-curriculum-rules.js', 'question-quality.js',
      'gamification.js', 'gamification-ui.js', 'daily.js', 'daily-ui.js', 'trainers-ui.js'
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...browserGlobals, ...nodeGlobals, ...appGlobals }
    },
    rules
  },
  {
    // Node-only tooling and tests.
    // NOTE: scripts/**/*.js must be listed explicitly. Without it no config
    // block matched those files, so ESLint walked them with zero rules — an
    // undefined global in a generator passed `npm run lint` silently.
    files: [
      'server.js', 'test-server.js', 'validate.js', 'verify-release.js',
      'playwright.config.js', '*.test.js', 'e2e/**/*.js', 'scripts/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, ...appGlobals }
    },
    rules
  },
  {
    ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**']
  }
];
