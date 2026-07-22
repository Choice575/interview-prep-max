const { defineConfig } = require('@playwright/test');

const usesExternalServer = process.env.IPMAX_EXTERNAL_SERVER === '1';

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', timezoneId: 'Europe/Moscow', trace: 'retain-on-failure' },
  webServer: usesExternalServer
    ? undefined
    : {
        command: 'node test-server.js',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI
      }
});
