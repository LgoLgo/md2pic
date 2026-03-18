# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **重要**：每次对代码做出功能性修改后，必须同步更新本文件，确保文档与代码实现一致。

## 项目概述

**Md2Pic** 是一个运行在浏览器端的 Markdown 可视化导出工具。项目特点：
- **零构建工具链**：原生 HTML/CSS/JavaScript，所有依赖通过 CDN 加载
- **单文件架构**：核心逻辑集中在 `script.js`（约 3300 行），样式在 `style.css`
- **实时渲染**：支持数学公式（KaTeX）、流程图（Mermaid）、数据图表（ECharts）、Callout 卡片
- **两种导出模式**：自由模式（单张完整图）、小红书模式（自适应分页）
- **CLI 支持**：通过 Puppeteer 实现命令行导出（`cli/` 目录）
- **GitHub Pages 部署**：通过 GitHub Actions 自动部署

## 核心架构

### 渲染管线（异步串行）
```
Markdown 输入
  ↓ 块级 $$...$$ 公式保护（避免 marked 的 breaks:true 破坏）
  ↓ Mermaid / ECharts / Card 预处理（转为占位 div）
  ↓ marked.js 解析
HTML 输出
  ↓ 还原 $$...$$ 公式占位符
  ↓ KaTeX 渲染数学公式
  ↓ Mermaid 渲染流程图/序列图/甘特图
  ↓ ECharts 渲染数据图表
  ↓ CardRenderer 渲染卡片
最终 DOM
  ↓ html2canvas（PNG）/ jsPDF（PDF）
导出文件
```

### 关键类与模块

#### 1. 状态管理
- **AppState / currentMode**：全局模式状态
  - 管理：缩放、字体大小、边距、导出模式（free / xhs）、水印文字（watermark）
  - 位置：`script.js:1-55`

#### 2. 渲染器
- **MathRenderer** (`script.js:276-396`)：KaTeX 数学公式渲染
  - 支持行内 `$...$` 和块级 `$$...$$` 公式
  - 块级公式在预处理阶段被保护（替换为 `.katex-block-placeholder`），marked 解析后还原为 `.katex-block-restored` 再交给 KaTeX
  - 按需加载 mhchem 化学公式扩展（检测到 `\ce{` 时触发）

- **DiagramRenderer** (`script.js:402-522`)：Mermaid 图表渲染
  - 异步渲染流程图、序列图、甘特图、饼图等
  - 自动生成唯一 ID 避免导出时与预览区冲突
  - 预处理：将 ` ```mermaid ` 块转为 `<div class="mermaid-container" data-diagram-id="..." data-diagram-code="...">`

- **EChartsRenderer** (`script.js:528-670`)：ECharts 数据可视化
  - 响应式图表，支持 JSON 配置
  - WeakMap 管理图表实例，自动垃圾回收

- **CardRenderer** (`script.js:673+`)：自定义信息卡片
  - 语法：`:::card [info|warning|success|error]`
  - 支持 Obsidian Callout 语法：`> [!note] 标题`
  - 无标题时内容上下 padding 对称（`12px 16px`），有标题时内容上边距缩小

#### 3. 导出系统
- **createExactExportNode**：创建独立导出 DOM
  - 克隆预览节点，避免影响实时预览
  - 重新渲染所有公式/图表（确保完整性）
  - 为 Mermaid 图表生成新 ID（`export-mermaid-${timestamp}-${index}`）

- **prepareImagesForExport**：图片跨域处理
  - 设置 `crossorigin="anonymous"` 和 `referrerpolicy="no-referrer"`
  - blob: URL 转 dataURL，避免 html2canvas 跨上下文问题
  - 失败时使用 weserv.nl 代理绕过 CORS

- **renderWithFallbackScales**：多尺度导出降级
  - 优先尝试高分辨率（scale: 2），失败则降级到 1.5 → 1.25 → 1

- **小红书分页导出**（`exportXhsPages`）：多页导出
  - 所有元素统一处理，当前页放不下则在元素前分页
  - 超大元素（高度 > pageHeight）单独占一页
  - 孤行标题检测：标题在页末但下一个元素会溢出时，标题随下一页
  - 白布固定 3:4 比例
  - 每页右下角标注页码（如 `1/3`）
  - 每页左上角绘制水印署名（`currentWatermark`，默认 `LanLance`）
  - 导出文件名：`md2pic-xhs-{timestamp}-1.png`、`md2pic-xhs-{timestamp}-2.png`...

- **自由模式水印**：导出 PNG 后在 canvas 左上角绘制水印署名
  - 水印文字通过布局面板的"左上角署名"输入框设置，持久化到 localStorage

### 关键技术点

#### 块级公式保护
- `marked.js` 启用了 `breaks: true`，会将 `$$` 后的换行转为 `<br>`，破坏 KaTeX 匹配
- 解决：预处理阶段提取 `$$...$$` 为占位 `<div class="katex-block-placeholder">`
- `marked.parse` 后、KaTeX 渲染前，还原为 `<div class="katex-block-restored">` 并写入原始公式文本
- KaTeX 的 `renderMathInElement` 正常匹配 `$$...$$`

#### 导出时的特殊处理
1. **独立 DOM 节点**：导出时创建 `#md2pic-export-poster` 隔离节点
2. **ID 冲突解决**：为导出节点的 Mermaid 图表生成新 ID
3. **异步渲染等待**：数学公式 → 图表 → ECharts → 卡片（串行），额外等待 500ms + requestAnimationFrame
4. **图片跨域**：仅在导出阶段设置 crossorigin/referrerpolicy

#### 小红书分页逻辑
- 页面宽度固定，最大高度 = 宽度 × 4/3
- 遍历 `posterContent` 子元素，统一处理：
  - 当前页放不下 → 在元素前分页，元素移到下一页
  - 超大元素（高度 > pageHeight）→ 单独占一页
  - 孤行标题检测：`H1-H6` 在页末且下一元素溢出时，标题一起移到下一页
- 白布高度自适应：`max(3:4, 内容卡片 + 留白)`，内容少时保持 3:4，内容多时自动拉高
- 每页用 `{ startY, endY }` 区间描述，截图后合成到白色画布
- 预览模式下用虚线分页参考线（逻辑与导出一致）

#### Base64 图片管理
- **压缩存储**：Markdown 中显示短码（如 `[IMG:abc123]`），内存中保存完整 Base64
- **导出时替换**：`replaceBase64Placeholders` 函数将短码替换为完整数据

#### 代码块优化
- 移除水平滚动，使用 CSS `white-space: pre-wrap` 自动换行
- 长代码行完整显示，避免截断
- Prism.js 语法高亮

## 开发指南

### 本地运行
```bash
npm start
# 浏览器访问 http://localhost:8080
```

### 文件结构
```
md2pic/
├── index.html          # 主页面（含默认 Markdown 展示内容）
├── script.js           # 核心逻辑（~3300 行）
├── style.css           # 样式（极客像素风）
├── manifest.json       # PWA 配置
├── favicon.svg         # 图标
├── package.json        # npm 配置 + CLI bin
├── CLAUDE.md           # 本文件（AI 开发指南）
├── CHANGELOG.md        # 更新日志
├── cli/
│   ├── index.js        # CLI 入口（#!/usr/bin/env node）
│   └── export.js       # Puppeteer 导出逻辑
├── .github/
│   └── workflows/
│       └── ci.yml      # GitHub Pages 自动部署
└── README.md
```

### 修改渲染逻辑
1. **添加新的 Markdown 语法**：在 `marked.js` 的 `renderer` 中扩展，或在预处理阶段添加正则替换
2. **调整导出质量**：修改 `renderWithFallbackScales` 的 `scale` 参数（默认 2）
3. **新增图表类型**：在 `MarkdownHelper` 中添加模板，工具栏按钮绑定在 `handleToolbarAction`
4. **修改分页逻辑**：预览分页线（`applyPreviewModeFrame`）和导出分页（`exportXhsPages`）须保持同步

### 常见问题

#### 导出图片跨域错误
- **原因**：外部图片未设置 CORS 头
- **解决**：`prepareImagesForExport` 会自动使用 weserv.nl 代理

#### 块级数学公式不渲染
- **原因**：`marked.js` 的 `breaks: true` 将 `$$` 后换行变为 `<br>`，破坏 KaTeX 匹配
- **解决**：已通过预处理阶段的公式保护机制解决

#### Mermaid 图表不显示
- **常见原因**：语法错误或主题配置问题
- **调试**：打开浏览器控制台查看 Mermaid 错误
- **ID 冲突**：确保每个图表有唯一 `data-diagram-id`

#### 导出 PNG 失败
1. 检查 html2canvas 是否加载成功
2. 查看 `renderWithFallbackScales` 的降级日志
3. 大图片可能触发浏览器内存限制，尝试降低 `scale` 或减少内容

## 代码规范

### 命名约定
- **类**：PascalCase（如 `MathRenderer`、`DiagramRenderer`）
- **函数**：camelCase（如 `updatePreview`、`exportToPNG`）
- **常量**：UPPER_SNAKE_CASE（如 `MAX_HISTORY`）
- **全局状态**：`current` 前缀（如 `currentZoom`、`currentMode`）

### 异步处理
- 使用 `async/await` 而非 Promise 链
- 导出相关函数必须等待所有渲染完成

### 错误处理
- 渲染错误应降级显示错误提示，而非阻塞整个应用
- 导出失败应提供友好的通知（使用 `NotificationManager`）
- 图片加载失败应有 3 秒超时保护

## 性能优化要点

1. **懒加载 CDN**：html2canvas 和 jsPDF 仅在导出时加载（`loadScript` 函数）
2. **防抖输入**：Markdown 输入使用 250ms 防抖
3. **WeakMap 管理**：ECharts 实例使用 WeakMap，自动垃圾回收
4. **ResizeObserver**：图表响应式调整使用 ResizeObserver 而非全局 resize 事件

## UI 设计风格

**极客像素风**：
- 白色背景，内容区有阴影（`box-shadow: 0 2px 16px rgba(0,0,0,0.10)`）
- 等宽字体用于 UI 标签（`font-family: 'JetBrains Mono', monospace`）
- 像素风边框（`border: 1.5px solid #222`，无圆角或极小圆角）
- 高对比度：黑色文字、白色背景、黑色边框
- 按钮有像素风 hover 效果（位移阴影）
- 主色调：`#111`（近黑）+ `#fff`（白）+ 单一强调色（如 `#5B5BD6`）

修改主题时应统一更新 CSS 变量（`style.css:1-34`）。
