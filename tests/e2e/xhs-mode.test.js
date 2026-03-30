// tests/e2e/xhs-mode.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exportXhs } = require('../../cli/export');

const FIXTURE = path.resolve(__dirname, '../fixtures/simple.md');

describe('小红书模式导出', () => {
  let tmpDir;

  beforeAll(() => {
    if (!fs.existsSync(FIXTURE)) throw new Error(`Fixture 不存在: ${FIXTURE}`);
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pic-xhs-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('导出至少 1 张 PNG', async () => {
    await exportXhs(FIXTURE, tmpDir);
    const pngs = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThanOrEqual(1);
  });

  test('每张图都是有效 PNG', async () => {
    await exportXhs(FIXTURE, tmpDir);
    const pngs = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
    for (const png of pngs) {
      const buf = fs.readFileSync(path.join(tmpDir, png));
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50);
    }
  });

  test('输出目录不存在时自动创建', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'output');
    await exportXhs(FIXTURE, nestedDir);
    expect(fs.existsSync(nestedDir)).toBe(true);
    const pngs = fs.readdirSync(nestedDir).filter(f => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThanOrEqual(1);
  });
});
