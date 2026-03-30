/**
 * Jest 全局 setup：自动配置 Puppeteer 可执行路径
 * macOS 优先使用系统 Chrome，避免内置 Chromium 在新系统上崩溃
 */
const fs = require('fs');

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  '/usr/bin/google-chrome',       // Linux CI (GitHub Actions)
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',    // Ubuntu
  '/usr/bin/chromium',            // Debian/Alpine
];

if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  const found = CANDIDATES.find(p => fs.existsSync(p));
  if (found) process.env.PUPPETEER_EXECUTABLE_PATH = found;
}
