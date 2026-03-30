// tests/e2e/free-mode.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exportFree } = require('../../cli/export');

const FIXTURE = path.resolve(__dirname, '../fixtures/simple.md');

describe('自由模式导出', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pic-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('导出单张 PNG，文件存在且大小 > 0', async () => {
    const outFile = path.join(tmpDir, 'output.png');
    await exportFree(FIXTURE, outFile);
    expect(fs.existsSync(outFile)).toBe(true);
    expect(fs.statSync(outFile).size).toBeGreaterThan(1000);
  });

  test('输出文件是有效的 PNG（magic bytes）', async () => {
    const outFile = path.join(tmpDir, 'output.png');
    await exportFree(FIXTURE, outFile);
    const buf = fs.readFileSync(outFile);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4E);
    expect(buf[3]).toBe(0x47);
  });
});
