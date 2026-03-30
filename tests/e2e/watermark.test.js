// tests/e2e/watermark.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exportFree, exportXhs } = require('../../cli/export');

const FIXTURE = path.resolve(__dirname, '../fixtures/simple.md');

describe('水印参数', () => {
  let tmpDir;

  beforeAll(() => {
    if (!fs.existsSync(FIXTURE)) throw new Error(`Fixture 不存在: ${FIXTURE}`);
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pic-wm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exportFree 接受 watermark 选项，文件正常生成', async () => {
    const outFile = path.join(tmpDir, 'output.png');
    await exportFree(FIXTURE, outFile, { watermark: 'TestUser' });
    expect(fs.existsSync(outFile)).toBe(true);
    expect(fs.statSync(outFile).size).toBeGreaterThan(1000);
  });

  test('exportXhs 接受 watermark 选项，文件正常生成', async () => {
    await exportXhs(FIXTURE, tmpDir, { watermark: 'TestUser' });
    const pngs = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThanOrEqual(1);
  });
});
