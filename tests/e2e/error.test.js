// tests/e2e/error.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exportFree, exportXhs } = require('../../cli/export');

describe('错误处理', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pic-err-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('空 Markdown 文件：自由模式不抛出异常', async () => {
    const emptyFile = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(emptyFile, '');
    const outFile = path.join(tmpDir, 'output.png');
    await expect(exportFree(emptyFile, outFile)).resolves.not.toThrow();
  });

  test('空 Markdown 文件：小红书模式不抛出异常', async () => {
    const emptyFile = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(emptyFile, '');
    await expect(exportXhs(emptyFile, tmpDir)).resolves.not.toThrow();
  });
});
