/**
 * md2pic CLI 导出逻辑（Puppeteer）
 * 支持自由模式（单张）和小红书模式（多张分页）
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 启动浏览器，加载本地 index.html，注入 Markdown 内容并等待渲染完成。
 * @returns {{ browser, page }}
 */
async function launchAndLoad(mdContent) {
    const launchOptions = {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // 加载本地 index.html（使用 file:// 协议）
    const htmlPath = path.resolve(__dirname, '../index.html');
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    // 注入 Markdown 内容，触发渲染
    await page.evaluate((content) => {
        const input = document.getElementById('markdownInput');
        if (!input) throw new Error('未找到 markdownInput 元素');
        input.value = content;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, mdContent);

    // 等待渲染完成（Mermaid / ECharts 可能需要额外时间）
    await page.waitForTimeout(1500);

    return { browser, page };
}

/**
 * 自由模式：导出单张完整图
 * @param {string} mdFile  输入 Markdown 文件路径
 * @param {string} outFile 输出 PNG 文件路径
 */
async function exportFree(mdFile, outFile) {
    const mdContent = fs.readFileSync(mdFile, 'utf-8');
    const { browser, page } = await launchAndLoad(mdContent);

    try {
        // 确保是自由模式
        await page.evaluate(() => {
            if (typeof setMode === 'function') setMode('free');
        });
        await page.waitForTimeout(300);

        // 暴露文件保存函数到页面
        const savedFiles = [];
        await page.exposeFunction('__md2picSave', (dataUrl, filename) => {
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            const filePath = path.resolve(outFile || filename);
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            savedFiles.push(filePath);
            return filePath;
        });

        // 劫持下载行为，调用 __md2picSave
        await page.evaluate(() => {
            const origCreate = document.createElement.bind(document);
            document.createElement = function (tag) {
                const el = origCreate(tag);
                if (tag.toLowerCase() === 'a') {
                    const origClick = el.click.bind(el);
                    el.click = function () {
                        if (el.download && el.href && el.href.startsWith('data:')) {
                            window.__md2picSave(el.href, el.download);
                            return;
                        }
                        origClick();
                    };
                }
                return el;
            };
        });

        // 触发导出
        await page.evaluate(() => {
            if (typeof exportToPNG === 'function') return exportToPNG();
        });
        await page.waitForTimeout(3000);

        if (savedFiles.length > 0) {
            console.log(`✓ 导出成功: ${savedFiles[0]}`);
        } else {
            console.error('✗ 导出失败：未生成文件');
        }
    } finally {
        await browser.close();
    }
}

/**
 * 小红书模式：导出多张分页图
 * @param {string} mdFile  输入 Markdown 文件路径
 * @param {string} outDir  输出目录
 */
async function exportXhs(mdFile, outDir) {
    const mdContent = fs.readFileSync(mdFile, 'utf-8');
    const { browser, page } = await launchAndLoad(mdContent);

    try {
        // 切换到小红书模式
        await page.evaluate(() => {
            if (typeof setMode === 'function') setMode('xhs');
        });
        await page.waitForTimeout(300);

        // 确保输出目录存在
        const resolvedDir = path.resolve(outDir || '.');
        fs.mkdirSync(resolvedDir, { recursive: true });

        const savedFiles = [];
        await page.exposeFunction('__md2picSave', (dataUrl, filename) => {
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            const filePath = path.join(resolvedDir, filename);
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            savedFiles.push(filePath);
            return filePath;
        });

        await page.evaluate(() => {
            const origCreate = document.createElement.bind(document);
            document.createElement = function (tag) {
                const el = origCreate(tag);
                if (tag.toLowerCase() === 'a') {
                    const origClick = el.click.bind(el);
                    el.click = function () {
                        if (el.download && el.href && el.href.startsWith('data:')) {
                            window.__md2picSave(el.href, el.download);
                            return;
                        }
                        origClick();
                    };
                }
                return el;
            };
        });

        // 触发小红书多页导出
        await page.evaluate(() => {
            if (typeof exportXhsPages === 'function') return exportXhsPages();
            if (typeof exportToPNG === 'function') return exportToPNG();
        });
        await page.waitForTimeout(5000);

        if (savedFiles.length > 0) {
            console.log(`✓ 导出成功：共 ${savedFiles.length} 张`);
            savedFiles.forEach(f => console.log(`  ${f}`));
        } else {
            console.error('✗ 导出失败：未生成文件');
        }
    } finally {
        await browser.close();
    }
}

module.exports = { exportFree, exportXhs };
