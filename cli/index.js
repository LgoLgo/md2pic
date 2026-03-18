#!/usr/bin/env node
/**
 * md2pic CLI
 *
 * 用法:
 *   md2pic <input.md> [output.png]          # 自由模式，输出单张图
 *   md2pic <input.md> [output-dir] --xhs    # 小红书模式，输出多张图
 *
 * 示例:
 *   md2pic README.md output.png
 *   md2pic README.md ./out --xhs
 */

const path = require('path');
const fs = require('fs');
const { exportFree, exportXhs } = require('./export');

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
md2pic - Markdown 转图片工具

用法:
  md2pic <input.md> [output]          自由模式，输出单张 PNG
  md2pic <input.md> [output] --xhs   小红书模式，输出多张 PNG

参数:
  input.md   输入的 Markdown 文件
  output     自由模式：输出文件路径（默认 md2pic-output.png）
             小红书模式：输出目录（默认当前目录）

选项:
  --xhs      小红书 3:4 多页分页模式
  -h, --help 显示帮助信息
`);
    process.exit(0);
}

const isXhs = args.includes('--xhs');
const positional = args.filter(a => !a.startsWith('--'));

const inputFile = positional[0];
const outputTarget = positional[1];

if (!inputFile) {
    console.error('错误：请提供输入文件');
    process.exit(1);
}

if (!fs.existsSync(inputFile)) {
    console.error(`错误：文件不存在: ${inputFile}`);
    process.exit(1);
}

(async () => {
    try {
        if (isXhs) {
            const outDir = outputTarget || '.';
            console.log(`[md2pic] 小红书模式: ${inputFile} → ${path.resolve(outDir)}/`);
            await exportXhs(inputFile, outDir);
        } else {
            const outFile = outputTarget || `md2pic-${Date.now()}.png`;
            console.log(`[md2pic] 自由模式: ${inputFile} → ${path.resolve(outFile)}`);
            await exportFree(inputFile, outFile);
        }
    } catch (err) {
        console.error('导出失败:', err.message);
        process.exit(1);
    }
})();
