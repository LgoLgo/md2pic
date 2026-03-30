/**
 * Jest 全局 setup：自动配置 Puppeteer 可执行路径
 * macOS 优先使用系统 Chrome，避免内置 Chromium 在新系统上崩溃
 */
const fs = require('fs');

const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  if (fs.existsSync(SYSTEM_CHROME)) {
    process.env.PUPPETEER_EXECUTABLE_PATH = SYSTEM_CHROME;
  }
}
