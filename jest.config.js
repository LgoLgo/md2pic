// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.test.js'],
  testTimeout: 60000,
  // macOS：优先使用系统 Chrome，避免 Puppeteer 内置 Chromium 崩溃
  globalSetup: undefined,
  testEnvironmentOptions: {},
  setupFiles: ['<rootDir>/tests/setup.js'],
};
