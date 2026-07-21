const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'node test-server.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI
  }
});
