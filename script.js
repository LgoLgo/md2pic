// ===== 应用状态管理 =====
const AppState = {
    zoom: 100,
    background: 'gradient1',
    fontSize: 18,
    padding: 40,
    width: 640,
    mode: 'free', // 'free' | 'xhs'
    fixedHeights: { xhs: null },
    watermark: 'LanLance'
};

// 状态管理器
const StateManager = {
    state: AppState,
    listeners: [],

    get(key) {
        return this.state[key];
    },

    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.notify(key, value, oldValue);
    },

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) this.listeners.splice(index, 1);
        };
    },

    notify(key, value, oldValue) {
        this.listeners.forEach(fn => {
            try {
                fn(key, value, oldValue);
            } catch (e) {
                console.error('状态监听器错误:', e);
            }
        });
    }
};

// 为了兼容性，保留旧的全局变量作为访问器
let currentZoom = AppState.zoom;
let currentBackground = AppState.background;
let currentFontSize = AppState.fontSize;
let currentPadding = AppState.padding;
let currentWidth = AppState.width;
let currentMode = AppState.mode;
let fixedHeights = AppState.fixedHeights;
let currentWatermark = AppState.watermark;

// ===== 工具函数 =====

/**
 * 防抖函数：延迟执行，在 delay 毫秒内多次调用只执行最后一次
 */
function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * 动态加载脚本（懒加载 CDN）
 */
const loadedScripts = new Set();
async function loadScript(src) {
    if (loadedScripts.has(src)) return;
    if (src.includes('html2canvas') && typeof html2canvas !== 'undefined') {
        loadedScripts.add(src);
        return;
    }
    if (src.includes('jspdf') && typeof jsPDF !== 'undefined') {
        loadedScripts.add(src);
        return;
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loadedScripts.add(src);
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * 可选库配置（按需加载）
 */
const optionalLibs = {
    mhchem: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/mhchem.min.js'
};

/**
 * 加载可选库
 */
async function loadOptionalLib(name) {
    const src = optionalLibs[name];
    if (src && !loadedScripts.has(src)) {
        await loadScript(src);
    }
}

/**
 * 确保导出所需的库已加载
 */
async function ensureExportLibsLoaded() {
    const libs = [
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];
    await Promise.all(libs.map(loadScript));
}

/**
 * CORS 图片代理：将跨域图片 URL 转换为代理 URL
 */
function corsProxyUrl(url) {
    // 跳过 data: 和 blob: URL
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
    // 跳过同源图片
    try {
        const imgUrl = new URL(url, window.location.href);
        if (imgUrl.origin === window.location.origin) return url;
    } catch (e) {
        return url;
    }
    // 使用 weserv.nl 代理（免费、支持 CORS）
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
}

/**
 * HTML 清理函数：移除潜在的 XSS 攻击代码
 * 注意：这是一个基础版本，建议在生产环境中使用 DOMPurify 等专业库
 */
function sanitizeHTML(html) {
    // 创建临时 DOM 容器
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 移除危险的标签
    const dangerousTags = ['script', 'iframe', 'object', 'embed', 'link'];
    dangerousTags.forEach(tag => {
        const elements = temp.querySelectorAll(tag);
        elements.forEach(el => el.remove());
    });

    // 移除危险的属性（on* 事件处理器）
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
        // 移除所有 on* 属性
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        });

        // 清理 href 和 src 中的 javascript: 协议
        if (el.hasAttribute('href')) {
            const href = el.getAttribute('href');
            if (href && href.trim().toLowerCase().startsWith('javascript:')) {
                el.removeAttribute('href');
            }
        }
        if (el.hasAttribute('src')) {
            const src = el.getAttribute('src');
            if (src && src.trim().toLowerCase().startsWith('javascript:')) {
                el.removeAttribute('src');
            }
        }
    });

    return temp.innerHTML;
}

// ===== 撤销/重做管理器 =====
class UndoRedoManager {
    constructor(maxHistory = 50) {
        this.history = [];
        this.index = -1;
        this.maxHistory = maxHistory;
        this.isUndoRedo = false;
    }

    push(state) {
        if (this.isUndoRedo) return;
        // 移除当前位置之后的历史
        this.history = this.history.slice(0, this.index + 1);
        this.history.push(state);
        // 限制历史大小
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.index++;
        }
    }

    undo() {
        if (this.index > 0) {
            this.index--;
            return this.history[this.index];
        }
        return null;
    }

    redo() {
        if (this.index < this.history.length - 1) {
            this.index++;
            return this.history[this.index];
        }
        return null;
    }

    canUndo() { return this.index > 0; }
    canRedo() { return this.index < this.history.length - 1; }
}

const undoRedoManager = new UndoRedoManager();

// ===== 自动保存 =====
const AUTOSAVE_KEY = 'md2pic_draft';
const AUTOSAVE_SETTINGS_KEY = 'md2pic_settings';

function autoSave(content) {
    try {
        localStorage.setItem(AUTOSAVE_KEY, content);
        localStorage.setItem(AUTOSAVE_SETTINGS_KEY, JSON.stringify({
            background: currentBackground,
            fontSize: typeof currentFontSize !== 'undefined' ? currentFontSize : 18,
            width: typeof currentWidth !== 'undefined' ? currentWidth : 640,
            padding: typeof currentPadding !== 'undefined' ? currentPadding : 40,
            mode: typeof currentMode !== 'undefined' ? currentMode : 'free',
            watermark: typeof currentWatermark !== 'undefined' ? currentWatermark : 'LanLance'
        }));
    } catch (e) {
        console.warn('自动保存失败:', e);
        // 用户友好提示：可能是存储空间已满
        if (typeof showNotification === 'function') {
            showNotification('自动保存失败，可能是浏览器存储空间已满', 'warning');
        }
    }
}

function loadDraft() {
    try {
        return localStorage.getItem(AUTOSAVE_KEY);
    } catch (e) {
        console.warn('加载草稿失败:', e);
        if (typeof showNotification === 'function') {
            showNotification('加载草稿失败，将使用默认内容', 'info');
        }
        return null;
    }
}

function loadSettings() {
    try {
        const settings = localStorage.getItem(AUTOSAVE_SETTINGS_KEY);
        return settings ? JSON.parse(settings) : null;
    } catch (e) {
        console.warn('加载设置失败:', e);
        if (typeof showNotification === 'function') {
            showNotification('加载设置失败，将使用默认设置', 'info');
        }
        return null;
    }
}

// ===== 数学公式渲染器 =====
class MathRenderer {
    constructor() {
        this.isKaTeXLoaded = false;
        this.checkKaTeXAvailability();
    }

    checkKaTeXAvailability() {
        this.isKaTeXLoaded = typeof katex !== 'undefined' && typeof renderMathInElement !== 'undefined';
        if (!this.isKaTeXLoaded) {
            console.warn('KaTeX not loaded. Math formulas will not be rendered.');
        } else {
            // 检查mhchem扩展是否可用
            const hasMhchem = typeof katex.__defineMacro !== 'undefined' ||
                (window.katex && window.katex.__plugins && window.katex.__plugins['mhchem']);
            if (hasMhchem) {
                console.log('KaTeX with mhchem extension loaded successfully');
            } else {
                console.warn('KaTeX loaded but mhchem extension may not be available');
            }
        }
    }

    renderMath(element) {
        if (!this.isKaTeXLoaded) {
            console.warn('KaTeX not available for math rendering');
            return;
        }

        try {
            renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false,
                errorColor: '#cc0000',
                strict: false,
                trust: true,
                macros: {
                    // 物理常量
                    '\\emc': 'E=mc^{2}',
                    '\\hbar': '\\hslash',
                    '\\kb': 'k_B',
                    '\\NA': 'N_A',
                    // 常用符号
                    '\\R': '\\mathbb{R}',
                    '\\C': '\\mathbb{C}',
                    '\\N': '\\mathbb{N}',
                    '\\Z': '\\mathbb{Z}',
                    '\\Q': '\\mathbb{Q}',
                    // 微积分
                    '\\dd': '\\mathrm{d}',
                    '\\dv': ['\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}', 2],
                    '\\pdv': ['\\frac{\\partial#1}{\\partial#2}', 2],
                    // 向量
                    '\\vb': ['\\mathbf{#1}', 1],
                    '\\vu': ['\\hat{\\mathbf{#1}}', 1],
                    // 物理单位
                    '\\unit': ['\\,\\mathrm{#1}', 1]
                },
                fleqn: false,
                displayMode: false
            });
        } catch (error) {
            console.error('Math rendering error:', error);
            this.showMathError(element, error.message);
        }
    }

    showMathError(element, errorMessage) {
        const errorElements = element.querySelectorAll('.katex-error');
        errorElements.forEach(errorEl => {
            errorEl.style.color = '#cc0000';
            errorEl.title = `Math Error: ${errorMessage}`;
        });
    }

    // 预处理Markdown中的数学公式
    preprocessMath(markdown) {
        // 处理质能守恒公式的特殊情况
        markdown = markdown.replace(/E\s*=\s*mc\^?2/g, '$E=mc^{2}$');

        // 处理其他常见物理公式
        markdown = markdown.replace(/F\s*=\s*ma/g, '$F=ma$');
        markdown = markdown.replace(/v\s*=\s*u\s*\+\s*at/g, '$v=u+at$');
        markdown = markdown.replace(/s\s*=\s*ut\s*\+\s*½at²/g, '$s=ut+\\frac{1}{2}at^{2}$');
        markdown = markdown.replace(/v²\s*=\s*u²\s*\+\s*2as/g, '$v^{2}=u^{2}+2as$');

        // 处理数学常量
        markdown = markdown.replace(/π/g, '$\\pi$');
        markdown = markdown.replace(/∞/g, '$\\infty$');
        markdown = markdown.replace(/±/g, '$\\pm$');
        markdown = markdown.replace(/≤/g, '$\\leq$');
        markdown = markdown.replace(/≥/g, '$\\geq$');
        markdown = markdown.replace(/≠/g, '$\\neq$');
        markdown = markdown.replace(/∈/g, '$\\in$');
        markdown = markdown.replace(/∉/g, '$\\notin$');
        markdown = markdown.replace(/⊆/g, '$\\subseteq$');
        markdown = markdown.replace(/⊇/g, '$\\supseteq$');
        markdown = markdown.replace(/∪/g, '$\\cup$');
        markdown = markdown.replace(/∩/g, '$\\cap$');
        markdown = markdown.replace(/∅/g, '$\\emptyset$');

        // 处理希腊字母
        markdown = markdown.replace(/α/g, '$\\alpha$');
        markdown = markdown.replace(/β/g, '$\\beta$');
        markdown = markdown.replace(/γ/g, '$\\gamma$');
        markdown = markdown.replace(/δ/g, '$\\delta$');
        markdown = markdown.replace(/ε/g, '$\\epsilon$');
        markdown = markdown.replace(/θ/g, '$\\theta$');
        markdown = markdown.replace(/λ/g, '$\\lambda$');
        markdown = markdown.replace(/μ/g, '$\\mu$');
        markdown = markdown.replace(/σ/g, '$\\sigma$');
        markdown = markdown.replace(/φ/g, '$\\phi$');
        markdown = markdown.replace(/ω/g, '$\\omega$');

        return markdown;
    }
}

// 创建全局数学渲染器实例
const mathRenderer = new MathRenderer();

// ===== 图表渲染器 =====
class DiagramRenderer {
    constructor() {
        this.isMermaidLoaded = false;
        this.mermaidConfig = {
            startOnLoad: false,
            theme: 'default',
            themeVariables: {
                primaryColor: '#6366f1',
                primaryTextColor: '#1f2937',
                primaryBorderColor: '#4f46e5',
                lineColor: '#6b7280',
                secondaryColor: '#f3f4f6',
                tertiaryColor: '#ffffff'
            },
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            },
            sequence: {
                useMaxWidth: true,
                wrap: true
            },
            gantt: {
                useMaxWidth: true
            }
        };
        this.checkMermaidAvailability();
    }

    checkMermaidAvailability() {
        this.isMermaidLoaded = typeof mermaid !== 'undefined';
        if (this.isMermaidLoaded) {
            try {
                mermaid.initialize(this.mermaidConfig);
                console.log('Mermaid initialized successfully');
            } catch (error) {
                console.error('Mermaid initialization error:', error);
                this.isMermaidLoaded = false;
            }
        } else {
            console.warn('Mermaid not loaded. Diagrams will not be rendered.');
        }
    }

    async renderDiagram(element, diagramCode, diagramId) {
        if (!this.isMermaidLoaded) {
            console.warn('Mermaid not available for diagram rendering');
            this.showDiagramError(element, 'Mermaid library not loaded');
            return;
        }

        try {
            // 清除之前的内容
            element.innerHTML = '';

            // 渲染图表
            const { svg } = await mermaid.render(diagramId, diagramCode);
            element.innerHTML = svg;

            // 添加图表容器样式
            element.classList.add('mermaid-diagram');

        } catch (error) {
            console.error('Diagram rendering error:', error);
            this.showDiagramError(element, error.message);
        }
    }

    showDiagramError(element, errorMessage) {
        element.innerHTML = `
            <div class="diagram-error">
                <i class="fas fa-exclamation-triangle"></i>
                <div class="error-title">图表渲染错误</div>
                <div class="error-message">${errorMessage}</div>
            </div>
        `;
        element.classList.add('diagram-error-container');
    }

    // 预处理Markdown中的图表代码
    preprocessDiagram(markdown) {
        // 为每个mermaid代码块生成唯一ID
        let diagramCounter = 0;
        return markdown.replace(/```mermaid\s*\n([\s\S]*?)\n```/g, (match, code) => {
            const diagramId = `mermaid-diagram-${++diagramCounter}`;
            return `<div class="mermaid-container" data-diagram-id="${diagramId}" data-diagram-code="${encodeURIComponent(code.trim())}"></div>`;
        });
    }

    // 渲染页面中的所有图表
    async renderDiagrams(container) {
        if (!this.isMermaidLoaded) {
            return;
        }

        const diagramContainers = container.querySelectorAll('.mermaid-container');

        for (const diagramContainer of diagramContainers) {
            const diagramId = diagramContainer.getAttribute('data-diagram-id');
            const diagramCode = decodeURIComponent(diagramContainer.getAttribute('data-diagram-code'));

            if (diagramId && diagramCode) {
                await this.renderDiagram(diagramContainer, diagramCode, diagramId);
            }
        }
    }

    // 设置主题
    setTheme(theme) {
        if (!this.isMermaidLoaded) {
            return;
        }

        this.mermaidConfig.theme = theme;
        try {
            mermaid.initialize(this.mermaidConfig);
        } catch (error) {
            console.error('Theme update error:', error);
        }
    }
}

// 创建全局图表渲染器实例
const diagramRenderer = new DiagramRenderer();

// ECharts 渲染器类
class EChartsRenderer {
    constructor() {
        this.isEChartsLoaded = false;
        // 使用 WeakMap 存储实例，自动垃圾回收
        this.instances = new WeakMap();
        this.checkEChartsAvailability();
    }

    checkEChartsAvailability() {
        this.isEChartsLoaded = typeof echarts !== 'undefined';
        if (!this.isEChartsLoaded) {
            console.warn('ECharts not loaded. ECharts diagrams will not be rendered.');
        }
    }

    async renderEChart(element, chartConfig, chartId) {
        if (!this.isEChartsLoaded) {
            console.warn('ECharts not available for chart rendering');
            this.showEChartError(element, 'ECharts library not loaded');
            return;
        }

        try {
            // 清理之前的实例（如果存在）
            this.destroy(element);

            // 清除之前的内容
            element.innerHTML = '';

            // 创建图表容器
            const chartContainer = document.createElement('div');
            chartContainer.id = chartId;
            chartContainer.style.width = '100%';
            chartContainer.style.height = '400px';
            chartContainer.style.minHeight = '300px';
            element.appendChild(chartContainer);

            // 解析配置
            let config;
            if (typeof chartConfig === 'string') {
                config = JSON.parse(chartConfig);
            } else {
                config = chartConfig;
            }

            // 初始化图表
            const chart = echarts.init(chartContainer);
            chart.setOption(config);

            // 响应式调整
            const resizeObserver = new ResizeObserver(() => {
                chart.resize();
            });
            resizeObserver.observe(chartContainer);

            // 使用 WeakMap 存储图表实例
            this.instances.set(element, {
                chart,
                resizeObserver,
                container: chartContainer
            });

        } catch (error) {
            console.error('ECharts rendering error:', error);
            this.showEChartError(element, error.message);
        }
    }

    showEChartError(element, errorMessage) {
        element.innerHTML = `
            <div class="echarts-error" style="
                padding: 20px;
                border: 2px dashed #ff6b6b;
                border-radius: 8px;
                background-color: #ffe0e0;
                color: #d63031;
                text-align: center;
                font-family: monospace;
            ">
                <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                ECharts Error: ${errorMessage}
            </div>
        `;
    }

    preprocessECharts(markdown) {
        // 处理 ```echarts 代码块
        return markdown.replace(/```echarts\s*\n([\s\S]*?)\n```/g, (match, code) => {
            const chartId = 'echarts-' + Math.random().toString(36).substr(2, 9);
            return `<div class="echarts-container" data-echarts-id="${chartId}" data-echarts-config="${encodeURIComponent(code.trim())}"></div>`;
        });
    }

    async renderECharts(container) {
        const echartsElements = container.querySelectorAll('.echarts-container');

        for (const element of echartsElements) {
            const chartId = element.getAttribute('data-echarts-id');
            const configData = decodeURIComponent(element.getAttribute('data-echarts-config'));

            await this.renderEChart(element, configData, chartId);
        }
    }

    /**
     * 清理单个 ECharts 实例
     */
    destroy(element) {
        const instance = this.instances.get(element);
        if (instance) {
            try {
                // 断开 ResizeObserver
                if (instance.resizeObserver) {
                    instance.resizeObserver.disconnect();
                }
                // 销毁图表实例
                if (instance.chart) {
                    instance.chart.dispose();
                }
            } catch (e) {
                console.warn('清理 ECharts 实例失败:', e);
            }
            // 从 WeakMap 中删除
            this.instances.delete(element);
        }
    }

    /**
     * 清理指定容器内的所有 ECharts 实例
     */
    destroyAll(container) {
        if (!container) return;

        const echartsElements = container.querySelectorAll('.echarts-container');
        echartsElements.forEach(element => {
            this.destroy(element);
        });
    }
}


// 创建全局 ECharts 渲染器实例
const echartsRenderer = new EChartsRenderer();

// ===== 卡片渲染器 =====
class CardRenderer {
    constructor() {
        // 卡片渲染器不需要外部依赖
    }

    // 预处理Markdown中的卡片语法
    preprocessCards(markdown) {
        // 处理 :::card 语法，支持不同类型的卡片
        let result = markdown.replace(/:::card(?:\s+(info|success|warning|error))?\s*\n([\s\S]*?)\n:::/g, (match, type, content) => {
            const cardType = type || 'default';
            const cardId = 'card-' + Math.random().toString(36).substr(2, 9);
            return `<div class="card-container" data-card-id="${cardId}" data-card-type="${cardType}" data-card-content="${encodeURIComponent(content.trim())}"></div>`;
        });

        // 处理 Obsidian Callout 语法：> [!type][-] title（忽略折叠标记，始终展开）
        result = result.replace(/^>\s*\[!(\w+)\]([+\-]?)\s*(.*?)\n((?:^>.*\n?)*)/gm, (match, type, collapsible, title, content) => {
            const cardId = 'card-' + Math.random().toString(36).substr(2, 9);
            const cleanContent = content.replace(/^>\s?/gm, '').trim();
            const isCollapsible = false;
            const displayTitle = title || type.charAt(0).toUpperCase() + type.slice(1);

            // 类型映射：Obsidian 类型 → Madopic 卡片类型
            const typeMap = {
                note: 'info', abstract: 'info', info: 'info',
                tip: 'success', success: 'success',
                question: 'info', warning: 'warning',
                failure: 'error', danger: 'error', bug: 'error',
                example: 'default', quote: 'default'
            };
            const cardType = typeMap[type.toLowerCase()] || 'info';

            return `<div class="card-container obsidian-callout"
                         data-card-id="${cardId}"
                         data-card-type="${cardType}"
                         data-card-title="${encodeURIComponent(displayTitle)}"
                         data-collapsible="${isCollapsible}"
                         data-card-content="${encodeURIComponent(cleanContent)}"></div>\n\n`;
        });

        return result;
    }

    // 渲染页面中的所有卡片
    async renderCards(container) {
        const cardContainers = container.querySelectorAll('.card-container');

        for (const cardContainer of cardContainers) {
            const cardId = cardContainer.getAttribute('data-card-id');
            const cardType = cardContainer.getAttribute('data-card-type');
            const cardContent = decodeURIComponent(cardContainer.getAttribute('data-card-content'));

            if (cardId && cardContent) {
                await this.renderCard(cardContainer, cardContent, cardType);
            }
        }
    }

    // 渲染单个卡片
    async renderCard(element, content, type) {
        try {
            // 清除之前的内容
            element.innerHTML = '';

            // 获取 Obsidian Callout 特有属性
            const title = element.getAttribute('data-card-title')
                ? decodeURIComponent(element.getAttribute('data-card-title'))
                : '';
            const isCollapsible = element.getAttribute('data-collapsible') === 'true';
            const isObsidian = element.classList.contains('obsidian-callout');

            // 解析卡片内容的Markdown
            let htmlContent = '';
            try {
                htmlContent = marked.parse(content);
            } catch (err) {
                console.error('卡片内容Markdown解析失败: ', err);
                htmlContent = '<p>卡片内容解析失败</p>';
            }

            // 创建卡片HTML结构
            const cardHtml = `
                <div class="madopic-card ${type !== 'default' ? 'card-' + type : ''} ${isObsidian ? 'obsidian-style' : ''}">
                    ${title ? `
                        <div class="card-title ${isCollapsible ? 'collapsible' : ''}"
                             ${isCollapsible ? `onclick="this.parentElement.classList.toggle('collapsed')"` : ''}>
                            <span class="title-text">${title}</span>
                            ${isCollapsible ? '<span class="toggle-icon">▼</span>' : ''}
                        </div>
                    ` : ''}
                    <div class="card-content">
                        ${htmlContent}
                    </div>
                </div>
            `;

            element.innerHTML = cardHtml;

        } catch (error) {
            console.error('卡片渲染错误:', error);
            element.innerHTML = `
                <div class="madopic-card">
                    <div class="card-content">
                        <p style="color: #ef4444;">卡片渲染失败：${error.message}</p>
                    </div>
                </div>
            `;
        }
    }
}

// 创建全局卡片渲染器实例
const cardRenderer = new CardRenderer();

// ===== 导出相关常量 =====
// 控制导出清晰度的缩放倍数范围
const EXPORT_MIN_SCALE = 2;
const EXPORT_MAX_SCALE = 3;

function getPreferredExportScale() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlScale = parseFloat(urlParams.get('scale'));
        const storedScale = parseFloat(localStorage.getItem('md2pic_export_scale'));
        const base = Number.isFinite(urlScale)
            ? urlScale
            : (Number.isFinite(storedScale)
                ? storedScale
                : Math.max(2, window.devicePixelRatio || 1));
        return Math.min(EXPORT_MAX_SCALE, Math.max(EXPORT_MIN_SCALE, base));
    } catch (_) {
        return Math.max(EXPORT_MIN_SCALE, Math.min(EXPORT_MAX_SCALE, 2));
    }
}

const EXPORT_SCALE = getPreferredExportScale();

// 海报背景固定为白色

// DOM 元素
const markdownInput = document.getElementById('markdownInput');
const lineNumbersEl = document.querySelector('.line-numbers');
const posterContent = document.getElementById('posterContent');
const markdownPoster = document.getElementById('markdownPoster');
const previewContent = document.getElementById('previewContent');
const layoutPanel = document.getElementById('layoutPanel');
const overlay = document.getElementById('overlay');
const zoomLevel = document.querySelector('.zoom-level');

// 图片数据存储（使用 Map 提供更好的性能）
const imageDataStore = new Map();

// 图片缓存管理器
const ImageCache = {
    cache: new Map(),
    maxSize: 50, // 最多缓存 50 张图片

    set(url, data) {
        // 如果缓存已满，删除最早的项
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(url, {
            data,
            timestamp: Date.now()
        });
    },

    get(url) {
        const item = this.cache.get(url);
        return item ? item.data : null;
    },

    has(url) {
        return this.cache.has(url);
    },

    clear() {
        this.cache.clear();
    },

    // 清理超过指定时间的缓存（默认 30 分钟）
    cleanup(maxAge = 30 * 60 * 1000) {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > maxAge) {
                this.cache.delete(key);
            }
        }
    }
};

// 预览渲染状态
let hasInitialPreviewRendered = false;
let lastRenderedMarkdown = '';

// 初始化应用
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    setupEventListeners();
    updatePreview();
});

// 初始化应用
function initializeApp() {
    // 配置 marked 选项（marked v5+ 使用 marked.use，setOptions 已废弃）
    marked.use({
        breaks: true,
        gfm: true,
        renderer: {
            hr(token) {
                return '<hr class="md-hr">\n';
            }
        }
    });

    // 海报背景固定白色
    markdownPoster.style.background = '#fff';

    // 应用初始设置
    applyFontSize(currentFontSize);
    applyPadding(currentPadding);
    applyWidth(currentWidth);

    // 初始化图表渲染器主题
    diagramRenderer.setTheme('default');

    // 更新缩放显示
    updateZoomDisplay();

    // 初始化行号
    updateLineNumbers();
}

// 设置事件监听器
function setupEventListeners() {
    // Markdown 输入监听
    // 更平滑的输入预览：稍延长防抖并在输入结束时仅渲染一次
    markdownInput.addEventListener('input', debounce(updatePreview, 250));
    markdownInput.addEventListener('input', updateLineNumbers);
    markdownInput.addEventListener('scroll', syncLineNumbersScroll);

    // 工具栏按钮
    setupToolbarButtons();

    // 缩放控制
    document.getElementById('zoomIn').addEventListener('click', zoomIn);
    document.getElementById('zoomOut').addEventListener('click', zoomOut);

    // 文字布局设置面板
    document.getElementById('layoutBtn').addEventListener('click', openLayoutPanel);
    document.getElementById('cancelLayout').addEventListener('click', closeLayoutPanel);
    document.getElementById('applyLayout').addEventListener('click', applyLayoutSettings);

    overlay.addEventListener('click', closeAllPanels);

    // 滑块事件监听
    setupSliders();

    // 导出功能
    setupExportButtons();
    setupModeButtons();


    // 图片处理
    setupImageHandlers();

    // 键盘快捷键
    setupKeyboardShortcuts();
}

// 设置导出按钮事件
function setupExportButtons() {
    const exportPngBtn = document.getElementById('exportPngBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportHtmlBtn = document.getElementById('exportHtmlBtn');

    if (exportPngBtn) {
        exportPngBtn.addEventListener('click', exportToPNG);
    }

    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportToPDF);
    }

    if (exportHtmlBtn) {
        exportHtmlBtn.addEventListener('click', exportToHTML);
    }
}

// 模式按钮绑定
function setupModeButtons() {
    const group = document.getElementById('modeGroup');
    if (!group) return;
    group.querySelectorAll('button[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            setMode(mode);
        });
    });
}

function setMode(mode) {
    if (!['free', 'xhs'].includes(mode)) return;
    currentMode = mode;
    // 切换按钮激活态
    const group = document.getElementById('modeGroup');
    if (group) {
        group.querySelectorAll('button[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
        });
    }
    // PDF/HTML 仅自由模式可用
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportHtmlBtn = document.getElementById('exportHtmlBtn');
    const isFree = mode === 'free';
    if (exportPdfBtn) exportPdfBtn.style.display = isFree ? '' : 'none';
    if (exportHtmlBtn) exportHtmlBtn.style.display = isFree ? '' : 'none';
    // 预览区域视觉反馈（仅预览容器外层，不改导出逻辑）
    applyPreviewModeFrame();
}

function applyPreviewModeFrame() {
    markdownPoster.dataset.mode = currentMode;
    // 移除旧的分页线
    markdownPoster.querySelectorAll('.xhs-page-divider').forEach(el => el.remove());

    if (currentMode === 'xhs') {
        // xhs 模式：显示全部内容，用虚线标注分页位置
        markdownPoster.style.height = '';
        markdownPoster.style.minHeight = '600px';
        markdownPoster.style.overflow = 'visible';
        posterContent.style.maxHeight = '';
        posterContent.style.overflow = 'visible';

        // 用与导出相同的逻辑计算分页线位置
        const rect = markdownPoster.getBoundingClientRect();
        const pageHeight = Math.round((rect.width / 3) * 4);
        const posterRect = markdownPoster.getBoundingClientRect();

        // 收集分页断点（与 exportXhsPages 逻辑一致）
        const dividerYs = [];
        let pageStart = 0;
        let pageUsedBottom = 0;

        const children = Array.from(posterContent.children);
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childRect = child.getBoundingClientRect();
            const childTop = childRect.top - posterRect.top;
            const childBottom = childRect.bottom - posterRect.top;
            const childHeight = childBottom - childTop;

            if (childHeight > pageHeight) {
                // 超大元素：前后都断页
                if (pageUsedBottom > pageStart) {
                    dividerYs.push(childTop);
                }
                dividerYs.push(childBottom);
                pageStart = childBottom;
                pageUsedBottom = childBottom;
            } else if (childBottom > pageStart + pageHeight && childTop > pageStart) {
                dividerYs.push(childTop);
                pageStart = childTop;
                pageUsedBottom = Math.max(pageStart, childBottom);
            } else {
                // 孤行标题检测：标题在页末但下一个元素会到下一页 → 把标题也移过去
                const isHeading = /^H[1-6]$/.test(child.tagName);
                if (isHeading && i + 1 < children.length) {
                    const nextRect = children[i + 1].getBoundingClientRect();
                    const nextBottom = nextRect.bottom - posterRect.top;
                    if (nextBottom > pageStart + pageHeight && childTop > pageStart) {
                        dividerYs.push(childTop);
                        pageStart = childTop;
                    }
                }
                pageUsedBottom = Math.max(pageUsedBottom, childBottom);
            }
        }

        // 绘制分页参考线
        for (const y of dividerYs) {
            const divider = document.createElement('div');
            divider.className = 'xhs-page-divider';
            divider.style.cssText = `
                position: absolute; left: 0; right: 0;
                top: ${y}px; height: 2px;
                background: repeating-linear-gradient(90deg, #5B5BD6 0, #5B5BD6 8px, transparent 8px, transparent 16px);
                z-index: 10; pointer-events: none;
            `;
            markdownPoster.appendChild(divider);
        }
    } else {
        markdownPoster.style.height = '';
        markdownPoster.style.minHeight = '600px';
        markdownPoster.style.overflow = 'hidden';
        posterContent.style.maxHeight = '';
        posterContent.style.overflow = '';
    }
}

// 设置工具栏按钮
function setupToolbarButtons() {
    document.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', function () {
            const action = this.getAttribute('data-action');
            handleToolbarAction(action);
        });
    });
}

// 处理工具栏动作
function handleToolbarAction(action) {
    const textarea = markdownInput;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const beforeText = textarea.value.substring(0, start);
    const afterText = textarea.value.substring(end);

    let insertText = '';
    let cursorPos = start;

    switch (action) {
        case 'bold':
            insertText = `**${selectedText || '粗体文本'}**`;
            cursorPos = start + (selectedText ? insertText.length : 2);
            break;
        case 'italic':
            insertText = `*${selectedText || '斜体文本'}*`;
            cursorPos = start + (selectedText ? insertText.length : 1);
            break;
        case 'heading':
            insertText = `## ${selectedText || '标题'}`;
            cursorPos = start + (selectedText ? insertText.length : 3);
            break;
        case 'list':
            insertText = `\n- ${selectedText || '列表项'}`;
            cursorPos = start + (selectedText ? insertText.length : 3);
            break;
        case 'link':
            insertText = `[${selectedText || '链接文本'}](https://example.com)`;
            cursorPos = start + (selectedText ? insertText.length : 1);
            break;
        case 'image':
            insertImage();
            return;
        case 'flowchart':
            MarkdownHelper.insertFlowchart();
            return;
        case 'sequence':
            MarkdownHelper.insertSequenceDiagram();
            return;
        case 'gantt':
            MarkdownHelper.insertGanttChart();
            return;
        case 'pie':
            MarkdownHelper.insertPieChart();
            return;
        case 'math':
            MarkdownHelper.insertMathFormulas();
            return;
        case 'physics':
            MarkdownHelper.insertPhysicsFormulas();
            return;
        case 'chemistry':
            MarkdownHelper.insertChemistryFormulas();
            return;
        case 'echarts':
            MarkdownHelper.insertEChartsTemplate();
            return;
        case 'einstein':
            MarkdownHelper.insertEinsteinFormula();
            return;
        case 'card':
            MarkdownHelper.insertCard();
            return;
        case 'callout':
            MarkdownHelper.insertCallout();
            return;
        case 'empty-line':
            // 插入可在预览中可见的"Markdown 空行"占位段落
            insertText = `\n\n<p class="md-empty-line">&nbsp;</p>\n\n`;
            cursorPos = start + insertText.length;
            break;
        case 'clear':
            textarea.value = '';
            updatePreview();
            textarea.focus();
            return;
    }

    textarea.value = beforeText + insertText + afterText;
    textarea.setSelectionRange(cursorPos, cursorPos);
    textarea.focus();
    updatePreview();
}

// 更新预览
async function updatePreview() {
    const markdownText = markdownInput.value.trim();
    // 同步行号（在去抖预览之外也保证立即更新）
    updateLineNumbers();

    // 自动保存草稿
    autoSave(markdownInput.value);

    // 检查是否为空内容
    if (!markdownText) {
        showEmptyPreview();
        return;
    }

    // 按需加载化学公式库
    if (markdownText.includes('\\ce{') || markdownText.includes('\\cf{')) {
        await loadOptionalLib('mhchem');
    }

    // 预处理数学公式
    let processedMarkdown = mathRenderer.preprocessMath(markdownText);

    // 保护块级 $$...$$ 公式，避免 marked 的 breaks:true 将换行变为 <br> 破坏 KaTeX 匹配
    const mathBlocks = [];
    processedMarkdown = processedMarkdown.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
        const idx = mathBlocks.length;
        mathBlocks.push(match);
        return `<div class="katex-block-placeholder" data-math-idx="${idx}"></div>`;
    });

    // 预处理图表
    processedMarkdown = diagramRenderer.preprocessDiagram(processedMarkdown);

    // 预处理 ECharts 图表
    processedMarkdown = echartsRenderer.preprocessECharts(processedMarkdown);

    // 预处理卡片
    processedMarkdown = cardRenderer.preprocessCards(processedMarkdown);

    // 将连续多个空行转为对应数量的 <br>（先保护代码块，避免破坏其内容）
    const codeBlocks = [];
    processedMarkdown = processedMarkdown.replace(/```[\s\S]*?```/g, (match) => {
        const idx = codeBlocks.length;
        codeBlocks.push(match);
        return `<code-block-placeholder data-code-idx="${idx}"></code-block-placeholder>`;
    });
    processedMarkdown = processedMarkdown.replace(/(\n\s*){3,}/g, (match) => {
        const count = (match.match(/\n/g) || []).length - 2;
        return '\n\n' + '<br>'.repeat(count) + '\n\n';
    });
    codeBlocks.forEach((block, idx) => {
        processedMarkdown = processedMarkdown.replace(
            `<code-block-placeholder data-code-idx="${idx}"></code-block-placeholder>`,
            block
        );
    });

    // 确保 --- 分割线前后有空行（避免被识别为 Setext 标题下划线）
    processedMarkdown = processedMarkdown.replace(/([^\n])\n(---+)\n/g, '$1\n\n$2\n\n');
    processedMarkdown = processedMarkdown.replace(/\n(---+)\n([^\n])/g, '\n\n$1\n\n$2');

    // 替换简化的base64为完整版本进行预览
    processedMarkdown = replaceImageDataForPreview(processedMarkdown);

    // 仅在已完成至少一次渲染后，且内容确实未变化时跳过
    if (hasInitialPreviewRendered && processedMarkdown === lastRenderedMarkdown) {
        return;
    }
    lastRenderedMarkdown = processedMarkdown;

    let htmlContent = '';
    try {
        htmlContent = marked.parse(processedMarkdown);
        // 安全性：清理潜在的 XSS 攻击代码
        htmlContent = sanitizeHTML(htmlContent);
    } catch (err) {
        console.error('Markdown 渲染失败: ', err);
        htmlContent = '<p style="color:#ef4444">渲染失败，请检查 Markdown 内容。</p>';
        if (typeof showNotification === 'function') {
            showNotification('Markdown 渲染失败，请检查内容格式', 'error');
        }
    }
    posterContent.innerHTML = htmlContent;

    // 还原被保护的块级 $$...$$ 公式
    if (mathBlocks.length > 0) {
        posterContent.querySelectorAll('.katex-block-placeholder').forEach(el => {
            const idx = parseInt(el.getAttribute('data-math-idx'), 10);
            if (mathBlocks[idx] !== undefined) {
                const wrapper = document.createElement('div');
                wrapper.className = 'katex-block-restored';
                wrapper.textContent = mathBlocks[idx];
                el.replaceWith(wrapper);
            }
        });
    }

    // 渲染数学公式
    mathRenderer.renderMath(posterContent);

    // 渲染图表
    await diagramRenderer.renderDiagrams(posterContent);

    // 渲染 ECharts 图表
    await echartsRenderer.renderECharts(posterContent);

    // 渲染卡片
    await cardRenderer.renderCards(posterContent);

    // 代码高亮（Prism.js）
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(posterContent);
    }

    // 确保内容容器可见
    posterContent.style.display = 'block';

    // 重新应用当前的字体大小设置
    applyFontSize(currentFontSize);

    // 仅首次渲染使用淡入动画，后续输入不再触发，避免屏闪
    if (!hasInitialPreviewRendered) {
        posterContent.style.animation = 'fadeIn 0.3s ease';
        hasInitialPreviewRendered = true;
    } else {
        posterContent.style.animation = '';
    }

    // xhs 模式：渲染完成后重绘分页参考线
    if (currentMode === 'xhs') {
        // 等一帧让 DOM 高度稳定
        requestAnimationFrame(() => applyPreviewModeFrame());
    }
}

// 防抖版本的 updatePreview
const debouncedUpdatePreview = debounce(updatePreview, 300);

// ===== 行号逻辑 =====
function updateLineNumbers() {
    if (!lineNumbersEl) return;
    const value = markdownInput.value || '';
    const lines = value.split('\n').length;
    // 构造包含行号的内容（使用换行分隔）
    let content = '';
    for (let i = 1; i <= lines; i++) {
        content += (i === 1 ? '' : '\n') + i;
    }
    lineNumbersEl.textContent = content || '1';
    // 高度同步
    lineNumbersEl.style.height = markdownInput.scrollHeight + 'px';
    syncLineNumbersScroll();
}

function syncLineNumbersScroll() {
    if (!lineNumbersEl) return;
    lineNumbersEl.scrollTop = markdownInput.scrollTop;
}

// 显示空内容提示
function showEmptyPreview() {
    posterContent.innerHTML = `
        <div class="empty-preview">
            <div class="empty-icon">
                <i class="fab fa-markdown"></i>
            </div>
            <h3>开始创作吧！</h3>
            <p>在左侧编辑器中输入 Markdown 内容</p>
            <div class="empty-tips">
                <div class="tip-item">
                    <i class="fas fa-lightbulb"></i>
                    <span>支持标题、列表、链接、图片等格式</span>
                </div>
                <div class="tip-item">
                    <i class="fas fa-keyboard"></i>
                    <span>使用工具栏快捷按钮快速插入格式</span>
                </div>
                <div class="tip-item">
                    <i class="fas fa-palette"></i>
                    <span>点击"自定义"按钮调整背景和样式</span>
                </div>
            </div>
        </div>
    `;
    hasInitialPreviewRendered = false;
}

// 为图片元素设置跨域与防盗链相关属性
function applyImageAttributes(root) {
    const imgs = root.querySelectorAll('img');
    imgs.forEach((img) => {
        try {
            if (!img.getAttribute('crossorigin')) {
                img.setAttribute('crossorigin', 'anonymous');
            }
            if (!img.getAttribute('referrerpolicy')) {
                img.setAttribute('referrerpolicy', 'no-referrer');
            }
            if (!img.getAttribute('decoding')) {
                img.setAttribute('decoding', 'sync');
            }
            if (!img.getAttribute('loading')) {
                img.setAttribute('loading', 'eager');
            }
        } catch (_) {
            // 忽略单个图片设置失败
        }
    });
}

// 缩放控制
function zoomIn() {
    if (currentZoom < 150) {
        currentZoom += 25;
        applyZoom();
    }
}

function zoomOut() {
    if (currentZoom > 50) {
        currentZoom -= 25;
        applyZoom();
    }
}

function applyZoom() {
    previewContent.className = 'preview-content';
    if (currentZoom !== 100) {
        previewContent.classList.add(`zoom-${currentZoom}`);
    }
    updateZoomDisplay();
}

function updateZoomDisplay() {
    zoomLevel.textContent = `${currentZoom}%`;
}

// 文字布局设置面板
function openLayoutPanel() {
    layoutPanel.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLayoutPanel() {
    layoutPanel.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// 关闭所有面板
function closeAllPanels() {
    layoutPanel.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

function applyLayoutSettings() {
    // 应用字体大小设置
    currentFontSize = parseFloat(document.getElementById('fontSizeSlider').value);
    applyFontSize(currentFontSize);

    // 应用边距设置
    currentPadding = parseFloat(document.getElementById('paddingSlider').value);
    applyPadding(currentPadding);

    // 应用宽度设置
    currentWidth = parseInt(document.getElementById('widthSlider').value);
    applyWidth(currentWidth);

    // 应用水印设置
    const wmInput = document.getElementById('watermarkInput');
    if (wmInput) {
        currentWatermark = wmInput.value.trim();
    }

    closeLayoutPanel();

    // 显示成功提示
    showNotification('设置已更新！', 'success');
}

function applyFontSize(fontSize) {
    // 使用CSS变量统一管理字体大小，避免大量DOM操作
    posterContent.style.setProperty('--dynamic-font-size', `${fontSize}px`);
    posterContent.style.setProperty('--dynamic-h1-size', `${Math.round(fontSize * 1.75)}px`);
    posterContent.style.setProperty('--dynamic-h2-size', `${Math.round(fontSize * 1.375)}px`);
    posterContent.style.setProperty('--dynamic-h3-size', `${Math.round(fontSize * 1.125)}px`);
    posterContent.style.setProperty('--dynamic-h4-size', `${Math.round(fontSize * 1.05)}px`);
    posterContent.style.setProperty('--dynamic-h5-h6-size', `${Math.round(fontSize * 0.95)}px`);
    posterContent.style.setProperty('--dynamic-code-size', `${Math.round(fontSize * 0.875)}px`);
    posterContent.style.setProperty('--dynamic-quote-size', `${Math.round(fontSize * 0.95)}px`);
}

function applyPadding(padding) {
    // 调整外层容器的内边距，即图片中红色箭头指向的边距
    markdownPoster.style.padding = `${padding}px`;
}

function applyWidth(width) {
    // 调整预览区的整体宽度（导出图片的宽度）
    markdownPoster.style.width = `${width}px`;
}

function setupSliders() {
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const paddingSlider = document.getElementById('paddingSlider');
    const paddingValue = document.getElementById('paddingValue');
    const widthSlider = document.getElementById('widthSlider');
    const widthValue = document.getElementById('widthValue');

    // 字体大小滑块
    fontSizeSlider.addEventListener('input', function () {
        const value = parseFloat(this.value);
        fontSizeValue.textContent = `${value}px`;
        // 实时预览
        applyFontSize(value);
    });

    // 边距滑块
    paddingSlider.addEventListener('input', function () {
        const value = parseFloat(this.value);
        paddingValue.textContent = `${value}px`;
        // 实时预览
        applyPadding(value);
    });

    // 宽度滑块
    widthSlider.addEventListener('input', function () {
        const value = this.value;
        widthValue.textContent = `${value}px`;
        // 实时预览
        applyWidth(parseInt(value));
    });

    // 初始化滑块值显示
    fontSizeValue.textContent = `${fontSizeSlider.value}px`;
    paddingValue.textContent = `${paddingSlider.value}px`;
    widthValue.textContent = `${widthSlider.value}px`;
}


// ===== 导出相关工具 =====
/**
 * 创建一个与预览完全一致的离屏克隆节点用于导出。
 * 关键点：同步计算样式与实际渲染宽度，并统一为 border-box，避免行宽与换行偏差。
 * 返回被追加到 body 的节点，调用方负责移除。
 */
async function createExactExportNode() {
    const clone = markdownPoster.cloneNode(true);
    clone.id = 'md2pic-export-poster';
    const mpComputed = getComputedStyle(markdownPoster);
    Object.assign(clone.style, {
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        margin: '0',
        width: `${markdownPoster.getBoundingClientRect().width}px`,
        padding: mpComputed.padding,
        boxSizing: 'border-box',
        background: markdownPoster.style.background || mpComputed.background,
        transform: 'none'
    });
    // 移除内部动画/滤镜但不改变布局
    const inner = clone.querySelector('.poster-content');
    if (inner) {
        const pcComputed = getComputedStyle(posterContent);
        inner.style.animation = 'none';
        inner.style.width = `${posterContent.getBoundingClientRect().width}px`;
        inner.style.padding = pcComputed.padding;
        inner.style.boxSizing = 'border-box';
        inner.style.backdropFilter = pcComputed.backdropFilter || 'none';
        inner.style.webkitBackdropFilter = pcComputed.webkitBackdropFilter || 'none';
    }
    // xhs 模式：单页导出时固定 3:4 比例（多页导出走 exportXhsPages）
    if (currentMode === 'xhs') {
        const rect = markdownPoster.getBoundingClientRect();
        const target = Math.round((rect.width / 3) * 4);
        clone.style.height = `${target}px`;
        clone.style.minHeight = `${target}px`;
        clone.style.overflow = 'hidden';

        const mpComputed = getComputedStyle(markdownPoster);
        const paddingTop = parseFloat(mpComputed.paddingTop) || 0;
        const paddingBottom = parseFloat(mpComputed.paddingBottom) || 0;
        const innerMax = Math.max(0, target - paddingTop - paddingBottom);
        const inner = clone.querySelector('.poster-content');
        if (inner) {
            inner.style.maxHeight = `${innerMax}px`;
            inner.style.overflow = 'hidden';
        }
    }
    document.body.appendChild(clone);

    // 为导出节点重新渲染数学公式
    const cloneContent = clone.querySelector('.poster-content');
    if (cloneContent) {
        mathRenderer.renderMath(cloneContent);

        // 为导出节点的Mermaid图表生成新的唯一ID，避免与原始预览区冲突
        const mermaidContainers = cloneContent.querySelectorAll('.mermaid-container');
        mermaidContainers.forEach((container, index) => {
            const timestamp = Date.now();
            const newId = `export-mermaid-${timestamp}-${index}`;
            container.setAttribute('data-diagram-id', newId);
        });

        // 为导出节点重新渲染图表
        await diagramRenderer.renderDiagrams(cloneContent);

        // 为导出节点重新渲染ECharts图表
        await echartsRenderer.renderECharts(cloneContent);

        // 为导出节点重新渲染卡片
        await cardRenderer.renderCards(cloneContent);

        // 额外等待确保所有渲染完成
        await new Promise(resolve => setTimeout(resolve, 500));

        // 再等待一帧确保DOM更新完成
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    return clone;
}

/**
 * 确保导出节点中的所有图片都可被 html2canvas 捕获。
 * 做法：为每个 <img> 设置 crossorigin/referrerpolicy，并强制等待加载完毕。
 */
async function prepareImagesForExport(root) {
    const images = Array.from(root.querySelectorAll('img'));
    const loadPromises = images.map((img) => new Promise((resolve) => {
        try {
            // 仅导出阶段设置跨域与防盗链（避免影响预览）
            img.setAttribute('crossorigin', 'anonymous');
            img.setAttribute('referrerpolicy', 'no-referrer');
            // 若已完成加载则直接 resolve
            if (img.complete && img.naturalWidth > 0) return resolve();
            // 监听加载/失败
            const clean = () => {
                img.removeEventListener('load', onLoad);
                img.removeEventListener('error', onError);
            };
            const onLoad = () => { clean(); resolve(); };
            const onError = () => {
                clean();
                // 第一次失败，尝试代理加速/绕过 CORS 防盗链
                tryProxyImage(img).finally(resolve);
            };
            img.addEventListener('load', onLoad, { once: true });
            img.addEventListener('error', onError, { once: true });
            // 触发重新加载（给 src 加一个无副作用查询串）。
            // 对 data: 协议不处理；对 blob: 协议尝试转成 dataURL（html2canvas 不抓取跨上下文 blob）
            try {
                if (img.src.startsWith('data:')) {
                    // 已是 dataURL，无需处理
                } else if (img.src.startsWith('blob:')) {
                    // 尝试将 blob 读取为 dataURL
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', img.src, true);
                    xhr.responseType = 'blob';
                    xhr.onload = () => {
                        try {
                            const reader = new FileReader();
                            reader.onload = () => { img.src = reader.result; };
                            reader.onerror = () => { };
                            reader.readAsDataURL(xhr.response);
                        } catch (_) { }
                    };
                    xhr.onerror = () => { };
                    xhr.send();
                } else {
                    const url = new URL(img.src, window.location.href);
                    url.searchParams.set('md2pic_cache_bust', Date.now().toString());
                    img.src = url.href;
                }
            } catch (_) {
                // 若 URL 构造失败则忽略
            }
        } catch (_) {
            resolve();
        }
    }));
    await Promise.race([
        Promise.allSettled(loadPromises),
        new Promise((resolve) => setTimeout(resolve, 3000)) // 最多等待 3s，避免卡死
    ]);
}

/**
 * 若图片加载失败，尝试通过公共图片代理服务加载，提升导出命中率。
 * 代理：images.weserv.nl（仅用于 http/https 且跨源情况）。
 */
function tryProxyImage(img) {
    return new Promise((resolve) => {
        try {
            if (img.dataset.md2picProxied === '1') return resolve();
            const original = new URL(img.src, window.location.href);
            // 同源或 data/blob 不代理
            if (original.origin === window.location.origin) return resolve();
            if (original.protocol !== 'http:' && original.protocol !== 'https:') return resolve();

            // 构造代理 URL（去掉协议）
            const hostless = original.href.replace(/^https?:\/\//i, '');
            // 代理默认会设置允许跨域，附带 no-referrer。若原图为 https，确保代理也为 https
            const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(hostless)}&n=-1&output=png`;

            const onLoad = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); resolve(); };
            const cleanup = () => {
                img.removeEventListener('load', onLoad);
                img.removeEventListener('error', onError);
            };

            img.addEventListener('load', onLoad, { once: true });
            img.addEventListener('error', onError, { once: true });
            img.dataset.md2picProxied = '1';
            img.setAttribute('crossorigin', 'anonymous');
            img.setAttribute('referrerpolicy', 'no-referrer');
            img.src = proxied;
        } catch (_) {
            resolve();
        }
    });
}

/**
 * 导出为 PNG（通过克隆节点离屏渲染，保证与预览一致）。
 * 流程：等待字体 → 克隆节点 → 读取尺寸 → html2canvas 渲染 → 透明边缘裁剪 → 触发下载 → 清理。
 */
async function exportToPNG() {
    // 小红书模式走多页分页导出
    if (currentMode === 'xhs') {
        return exportXhsPages();
    }

    let exportNode = null;
    try {
        showNotification('正在生成图片...', 'info');

        // 懒加载导出所需的库
        await ensureExportLibsLoaded();

        exportNode = await createExactExportNode();

        // 预处理导出节点中的图片：设置跨域/防盗链属性并强制重新加载，尽量保证可被 html2canvas 捕获
        try {
            await prepareImagesForExport(exportNode);
        } catch (_) {
            // 忽略单个图片处理失败
        }

        // 等待字体与一帧渲染
        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (_) { }
        }
        await new Promise(r => requestAnimationFrame(r));

        const rect = exportNode.getBoundingClientRect();
        const targetWidth = Math.ceil(rect.width);
        const targetHeight = Math.ceil(rect.height);

        // Canvas 尺寸预检查（浏览器限制通常为 32767px）
        const maxCanvasSize = 32767;
        const estimatedHeight = targetHeight * EXPORT_SCALE;
        if (estimatedHeight > maxCanvasSize) {
            showNotification(`内容过长（约${Math.round(estimatedHeight)}px），可能导致导出失败。建议缩短内容或降低导出比例。`, 'warning');
        }

        const tryScales = getExportScaleCandidates(EXPORT_SCALE);
        const canvas = await renderWithFallbackScales(exportNode, targetWidth, targetHeight, tryScales);

        // 尝试裁剪透明边缘，如果因跨域图片导致失败则跳过裁剪
        let trimmedCanvas = null;
        if (currentMode === 'free') {
            try {
                trimmedCanvas = trimTransparentEdges(canvas);
            } catch (error) {
                console.warn('无法裁剪透明边缘（可能包含跨域图片）:', error.message);
            }
        }
        const outputCanvas = trimmedCanvas || canvas;

        // 自由模式水印（左上角，Supreme 贴纸风格）
        if (currentWatermark) {
            const wmCtx = outputCanvas.getContext('2d');
            const wmScale = outputCanvas.width / (currentWidth || 640);
            const wmFontSize = Math.round(13 * wmScale);
            wmCtx.font = `700 italic ${wmFontSize}px 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Courier New', monospace`;
            const textMetrics = wmCtx.measureText(currentWatermark);
            const padH = Math.round(6 * wmScale);
            const padV = Math.round(3 * wmScale);
            const boxX = Math.round(8 * wmScale);
            const boxY = Math.round(8 * wmScale);
            const boxW = textMetrics.width + padH * 2;
            const boxH = wmFontSize + padV * 2;
            wmCtx.fillStyle = 'rgba(17,17,17,0.82)';
            wmCtx.fillRect(boxX, boxY, boxW, boxH);
            wmCtx.fillStyle = '#ffffff';
            wmCtx.textAlign = 'left';
            wmCtx.textBaseline = 'middle';
            wmCtx.fillText(currentWatermark, boxX + padH, boxY + boxH / 2);
        }

        // 增强 toDataURL 错误处理
        let dataUrl;
        try {
            dataUrl = outputCanvas.toDataURL('image/png', 1.0);
        } catch (dataUrlError) {
            console.error('toDataURL 失败:', dataUrlError);
            if (dataUrlError.name === 'SecurityError') {
                showNotification('导出失败：图片包含跨域资源，无法导出。请移除外部图片后重试。', 'error');
            } else {
                showNotification('导出失败：无法生成图片数据。请尝试缩短内容。', 'error');
            }
            return;
        }

        const link = document.createElement('a');
        link.download = `md2pic-${getFormattedTimestamp()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('图片导出成功！', 'success');
    } catch (error) {
        console.error('导出失败:', error);
        // 提供更具体的错误信息
        let errorMsg = '导出失败，请重试';
        if (error.message) {
            if (error.message.includes('缩放倍数')) {
                errorMsg = '导出失败：内容过大，请缩短内容后重试';
            } else if (error.message.includes('tainted') || error.message.includes('cross-origin')) {
                errorMsg = '导出失败：包含跨域图片，请移除外部图片后重试';
            } else if (error.message.includes('memory') || error.message.includes('heap')) {
                errorMsg = '导出失败：内存不足，请缩短内容或关闭其他页面后重试';
            }
        }
        showNotification(errorMsg, 'error');
    } finally {
        if (exportNode && exportNode.parentNode) {
            exportNode.parentNode.removeChild(exportNode);
        }
    }
}

/**
 * 小红书多页分页导出。
 * 按 3:4 比例将内容切割为多页，Mermaid 图表单独占一页，每页右下角标注页码。
 *
 * 关键设计：导出节点使用 position:absolute 置于屏外，
 * 用 offsetTop（相对父容器）计算子元素位置，避免 fixed 定位时
 * getBoundingClientRect 返回负值导致分页错误。
 */
async function exportXhsPages() {
    let wrapper = null;
    let exportNode = null;
    try {
        showNotification('正在生成小红书图片...', 'info');
        await ensureExportLibsLoaded();

        const posterWidth = markdownPoster.getBoundingClientRect().width;
        const pageHeight = Math.round(posterWidth * 4 / 3);
        const pageWidth = Math.ceil(posterWidth);

        // 用一个绝对定位的 wrapper 容纳导出节点，使 offsetTop 可用
        wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            position: 'absolute',
            top: '0',
            left: '-9999px',
            width: `${pageWidth}px`,
            overflow: 'visible',
            pointerEvents: 'none'
        });
        document.body.appendChild(wrapper);

        exportNode = markdownPoster.cloneNode(true);
        exportNode.id = 'md2pic-export-poster';
        const mpComputed = getComputedStyle(markdownPoster);
        Object.assign(exportNode.style, {
            position: 'relative',
            top: '0',
            left: '0',
            margin: '0',
            width: `${pageWidth}px`,
            padding: mpComputed.padding,
            boxSizing: 'border-box',
            background: '#fff',
            transform: 'none',
            height: 'auto',
            minHeight: 'auto',
            overflow: 'visible',
            // 去掉边框和阴影，避免影响截图边缘
            border: 'none',
            boxShadow: 'none',
            borderRadius: '0'
        });
        const inner = exportNode.querySelector('.poster-content');
        if (inner) {
            const pcComputed = getComputedStyle(posterContent);
            inner.style.animation = 'none';
            inner.style.width = `${posterContent.getBoundingClientRect().width}px`;
            inner.style.padding = pcComputed.padding;
            inner.style.boxSizing = 'border-box';
            inner.style.maxHeight = '';
            inner.style.overflow = 'visible';
        }
        wrapper.appendChild(exportNode);

        // 重新渲染所有内容
        const cloneContent = exportNode.querySelector('.poster-content');
        if (cloneContent) {
            mathRenderer.renderMath(cloneContent);
            cloneContent.querySelectorAll('.mermaid-container').forEach((c, i) => {
                c.setAttribute('data-diagram-id', `xhs-mermaid-${Date.now()}-${i}`);
            });
            await diagramRenderer.renderDiagrams(cloneContent);
            await echartsRenderer.renderECharts(cloneContent);
            await cardRenderer.renderCards(cloneContent);
            await new Promise(r => setTimeout(r, 600));
            await new Promise(r => requestAnimationFrame(r));
        }

        try { await prepareImagesForExport(exportNode); } catch (_) { }
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) { } }
        await new Promise(r => requestAnimationFrame(r));

        // 计算分页切割点
        // 策略：所有元素统一处理，不截断任何元素。
        //   - 当前页放不下整个元素 → 在该元素前分页
        //   - 超大元素（高度 > pageHeight，如巨型图表）→ 单独占一页，高度自适应
        const contentEl = exportNode.querySelector('.poster-content');
        const exportNodeRect = exportNode.getBoundingClientRect();

        // pages 数组：每项 { startY, endY }，表示截图的 y 区间
        const pages = [];
        let pageStart = 0;       // 当前页起点
        let pageUsedBottom = 0;  // 当前页已用到的底部 y

        if (contentEl) {
            const children = Array.from(contentEl.children);
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const childRect = child.getBoundingClientRect();
                const childTop = childRect.top - exportNodeRect.top;
                const childBottom = childRect.bottom - exportNodeRect.top;
                const childHeight = childBottom - childTop;

                if (childHeight > pageHeight) {
                    // 超大元素：先结束当前页，然后单独占一页
                    if (pageUsedBottom > pageStart) {
                        pages.push({ startY: pageStart, endY: childTop });
                    }
                    pages.push({ startY: childTop, endY: childBottom });
                    pageStart = childBottom;
                    pageUsedBottom = childBottom;
                } else if (childBottom > pageStart + pageHeight && childTop > pageStart) {
                    // 当前页放不下 → 在此元素前分页
                    pages.push({ startY: pageStart, endY: childTop });
                    pageStart = childTop;
                    pageUsedBottom = Math.max(pageStart, childBottom);
                } else {
                    // 孤行标题检测：标题在页末但下一个元素会到下一页 → 把标题也移过去
                    const isHeading = /^H[1-6]$/.test(child.tagName);
                    if (isHeading && i + 1 < children.length) {
                        const nextRect = children[i + 1].getBoundingClientRect();
                        const nextBottom = nextRect.bottom - exportNodeRect.top;
                        if (nextBottom > pageStart + pageHeight && childTop > pageStart) {
                            pages.push({ startY: pageStart, endY: childTop });
                            pageStart = childTop;
                        }
                    }
                    pageUsedBottom = Math.max(pageUsedBottom, childBottom);
                }
            }
        }
        // 最后一页
        if (pageUsedBottom > pageStart) {
            pages.push({ startY: pageStart, endY: pageUsedBottom });
        }
        // 兜底：没有任何内容
        if (pages.length === 0) {
            pages.push({ startY: 0, endY: pageHeight });
        }

        const totalPages = pages.length;
        const tryScales = getExportScaleCandidates(EXPORT_SCALE);

        // 逐页截取并下载
        // 每页内容截图后，合成到固定 3:4 白色画布上，内容居中带圆角阴影和四边留白
        // outerGap：内容卡片到白布边缘的距离（白布留白）
        // innerPad：截图内容四周额外加的白色内边距（让内容不贴边）
        const outerGapRatio = 0.07; // 白布四边留白比例（相对 pageWidth）
        const innerPadRatio = 0.04; // 内容四周内边距比例

        for (let i = 0; i < totalPages; i++) {
            const { startY, endY } = pages[i];
            const clipHeight = Math.ceil(endY - startY);

            // 截取内容区域
            const contentCanvas = await renderWithFallbackScales(exportNode, pageWidth, clipHeight, tryScales, {
                y: startY,
                height: clipHeight
            });

            const scale = contentCanvas.width / pageWidth;
            const outerGap = Math.round(pageWidth * outerGapRatio * scale);
            const innerPad = Math.round(pageWidth * innerPadRatio * scale);

            // 最终画布：固定 3:4 白色背景
            const finalWidth = contentCanvas.width;
            const finalHeight = Math.round(finalWidth * 4 / 3);
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth;
            finalCanvas.height = finalHeight;
            const ctx = finalCanvas.getContext('2d');

            // 白色背景
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, finalWidth, finalHeight);

            // 内容卡片可用区域（白布减去四边 outerGap）
            const cardMaxW = finalWidth - outerGap * 2;
            const cardMaxH = finalHeight - outerGap * 2;

            // 内容截图加上 innerPad 后的尺寸
            const paddedW = contentCanvas.width + innerPad * 2;
            const paddedH = contentCanvas.height + innerPad * 2;

            // 按比例缩放，使带内边距的内容适配卡片区域
            const scaleRatio = Math.min(1, cardMaxW / paddedW, cardMaxH / paddedH);
            const cardW = Math.round(paddedW * scaleRatio);
            const cardH = Math.round(paddedH * scaleRatio);
            const cardX = Math.round((finalWidth - cardW) / 2);
            const cardY = Math.round((finalHeight - cardH) / 2);

            // 内容在卡片内的实际绘制区域
            const padScaled = Math.round(innerPad * scaleRatio);
            const drawX = cardX + padScaled;
            const drawY = cardY + padScaled;
            const drawW = cardW - padScaled * 2;
            const drawH = cardH - padScaled * 2;

            // 绘制白色卡片（带阴影）
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.13)';
            ctx.shadowBlur = Math.round(20 * scale);
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = Math.round(4 * scale);
            ctx.fillStyle = '#ffffff';
            // 圆角卡片
            const r = Math.round(10 * scale);
            ctx.beginPath();
            ctx.moveTo(cardX + r, cardY);
            ctx.lineTo(cardX + cardW - r, cardY);
            ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + r, r);
            ctx.lineTo(cardX + cardW, cardY + cardH - r);
            ctx.arcTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH, r);
            ctx.lineTo(cardX + r, cardY + cardH);
            ctx.arcTo(cardX, cardY + cardH, cardX, cardY + cardH - r, r);
            ctx.lineTo(cardX, cardY + r);
            ctx.arcTo(cardX, cardY, cardX + r, cardY, r);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // 裁剪到圆角区域后绘制内容
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cardX + r, cardY);
            ctx.lineTo(cardX + cardW - r, cardY);
            ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + r, r);
            ctx.lineTo(cardX + cardW, cardY + cardH - r);
            ctx.arcTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH, r);
            ctx.lineTo(cardX + r, cardY + cardH);
            ctx.arcTo(cardX, cardY + cardH, cardX, cardY + cardH - r, r);
            ctx.lineTo(cardX, cardY + r);
            ctx.arcTo(cardX, cardY, cardX + r, cardY, r);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(contentCanvas, drawX, drawY, drawW, drawH);
            ctx.restore();

            // 水印（左上角，Supreme 贴纸风格）
            if (currentWatermark) {
                const wmFontSize = Math.round(14 * scale);
                ctx.font = `700 italic ${wmFontSize}px 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Courier New', monospace`;
                const wmMetrics = ctx.measureText(currentWatermark);
                const wmPadH = Math.round(7 * scale);
                const wmPadV = Math.round(4 * scale);
                const wmBoxX = Math.round(14 * scale);
                const wmBoxY = Math.round(12 * scale);
                const wmBoxW = wmMetrics.width + wmPadH * 2;
                const wmBoxH = wmFontSize + wmPadV * 2;
                ctx.fillStyle = 'rgba(17,17,17,0.82)';
                ctx.fillRect(wmBoxX, wmBoxY, wmBoxW, wmBoxH);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(currentWatermark, wmBoxX + wmPadH, wmBoxY + wmBoxH / 2);
            }

            // 页码（右下角，相对白布）
            const text = `${i + 1}/${totalPages}`;
            const fontSize = Math.round(20 * scale);
            ctx.font = `${fontSize}px 'JetBrains Mono', 'Courier New', monospace`;
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(text, finalWidth - Math.round(16 * scale), finalHeight - Math.round(14 * scale));

            const canvas = finalCanvas;

            const dataUrl = canvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            link.download = `md2pic-xhs-${getFormattedTimestamp()}-${i + 1}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // 稍作间隔避免浏览器下载队列阻塞
            if (i < totalPages - 1) await new Promise(r => setTimeout(r, 200));
        }

        showNotification(`小红书图片导出成功！共 ${totalPages} 张`, 'success');
    } catch (error) {
        console.error('小红书导出失败:', error);
        showNotification('导出失败，请重试', 'error');
    } finally {
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
        }
    }
}

async function exportToPDF() {
    let exportNode = null;
    try {
        showNotification('正在生成 PDF...', 'info');

        // 懒加载导出所需的库
        await ensureExportLibsLoaded();

        exportNode = await createExactExportNode();

        // 预处理导出节点中的图片
        try {
            await prepareImagesForExport(exportNode);
        } catch (_) {
            // 忽略单个图片处理失败
        }

        // 等待字体与一帧渲染
        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (_) { }
        }
        await new Promise(r => requestAnimationFrame(r));

        const rect = exportNode.getBoundingClientRect();
        const targetWidth = Math.ceil(rect.width);
        const targetHeight = Math.ceil(rect.height);

        const tryScales = getExportScaleCandidates(EXPORT_SCALE);
        const canvas = await renderWithFallbackScales(exportNode, targetWidth, targetHeight, tryScales);

        // 尝试裁剪透明边缘，如果因跨域图片导致失败则跳过裁剪
        let trimmedCanvas = null;
        if (currentMode === 'free') {
            try {
                trimmedCanvas = trimTransparentEdges(canvas);
            } catch (error) {
                console.warn('无法裁剪透明边缘（可能包含跨域图片）:', error.message);
            }
        }
        const outputCanvas = trimmedCanvas || canvas;

        // 创建 PDF
        const { jsPDF } = window.jspdf;

        const canvasWidth = outputCanvas.width;
        const canvasHeight = outputCanvas.height;

        // 计算 PDF 页面尺寸（毫米）
        // 默认使用 A4 纸张，但根据内容比例调整
        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;
        const aspectRatio = canvasWidth / canvasHeight;

        let pdfWidth, pdfHeight, orientation;

        if (aspectRatio > 1) {
            orientation = 'landscape';
            pdfWidth = A4_HEIGHT_MM;
            pdfHeight = A4_WIDTH_MM;

            if (aspectRatio > pdfWidth / pdfHeight) {
                pdfHeight = pdfWidth / aspectRatio;
            }
        } else {
            orientation = 'portrait';
            pdfWidth = A4_WIDTH_MM;
            pdfHeight = A4_HEIGHT_MM;

            if (aspectRatio < pdfWidth / pdfHeight) {
                pdfWidth = pdfHeight * aspectRatio;
            }
        }

        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'mm',
            format: [pdfWidth, pdfHeight],
            compress: false
        });

        // 增强 toDataURL 错误处理
        let imgData;
        try {
            imgData = outputCanvas.toDataURL('image/png', 1.0);
        } catch (dataUrlError) {
            console.error('toDataURL 失败:', dataUrlError);
            if (dataUrlError.name === 'SecurityError') {
                showNotification('PDF 导出失败：图片包含跨域资源。请移除外部图片后重试。', 'error');
            } else {
                showNotification('PDF 导出失败：无法生成图片数据。', 'error');
            }
            return;
        }

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        pdf.save(`md2pic-${getFormattedTimestamp()}.pdf`);

        showNotification('PDF 导出成功！', 'success');
    } catch (error) {
        console.error('PDF 导出失败:', error);
        let errorMsg = 'PDF 导出失败，请重试';
        if (error.message) {
            if (error.message.includes('缩放倍数')) {
                errorMsg = 'PDF 导出失败：内容过大，请缩短内容后重试';
            } else if (error.message.includes('tainted') || error.message.includes('cross-origin')) {
                errorMsg = 'PDF 导出失败：包含跨域图片，请移除外部图片后重试';
            }
        }
        showNotification(errorMsg, 'error');
    } finally {
        if (exportNode && exportNode.parentNode) {
            exportNode.parentNode.removeChild(exportNode);
        }
    }
}

// 导出为独立可打开的 HTML 文件
async function exportToHTML() {
    let exportNode = null;
    try {
        showNotification('正在生成 HTML...', 'info');

        // 并行拉取需要内联的样式
        const cssFetchPromise = Promise.all([
            fetchCssBySelector('link[href*="style.css"]'),
            fetchCssBySelector('link[rel="stylesheet"][href*="katex"]')
        ]);

        // 克隆并渲染离屏节点
        exportNode = await createExactExportNode();

        // 将 ECharts 图表替换为静态图片，确保离线可见
        await replaceEChartsWithImages(exportNode);

        // 收集样式（尽量内联，失败时保留外链兜底）
        const [localCss, katexCss] = await cssFetchPromise;

        // 组装完整 HTML
        const html = buildStandaloneHTML(exportNode, { localCss, katexCss });

        // 触发下载
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `md2pic-${getFormattedTimestamp()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('HTML 导出成功！', 'success');
    } catch (error) {
        console.error('HTML 导出失败:', error);
        showNotification('HTML 导出失败，请重试', 'error');
    } finally {
        if (exportNode && exportNode.parentNode) {
            exportNode.parentNode.removeChild(exportNode);
        }
    }
}

// 根据 <link> 选择器抓取 CSS 内容
async function fetchCssBySelector(selector) {
    try {
        const link = document.querySelector(selector);
        if (!link || !link.href) return { inline: '', href: '' };
        const href = link.href;
        const css = await fetchTextSafe(href);
        return { inline: css || '', href };
    } catch (_) {
        return { inline: '', href: '' };
    }
}

// 安全获取文本，失败返回空字符串
async function fetchTextSafe(url) {
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return '';
        return await res.text();
    } catch (_) {
        return '';
    }
}

// 将克隆节点中的 ECharts 图表替换为 <img>（使用实例导出的 dataURL）
async function replaceEChartsWithImages(root) {
    const containers = root.querySelectorAll('.echarts-container');
    for (const container of containers) {
        try {
            // chartContainer 是我们在渲染时创建的内部 div，实例挂在其属性上
            const chartContainer = container.querySelector('div[id^="echarts-"]');
            let dataUrl = '';
            if (chartContainer && chartContainer._echartsInstance && typeof chartContainer._echartsInstance.getDataURL === 'function') {
                dataUrl = chartContainer._echartsInstance.getDataURL({ type: 'png', pixelRatio: 1, backgroundColor: '#ffffff' });
            } else {
                // 兜底：合并所有 canvas 层
                const canvases = container.querySelectorAll('canvas');
                if (canvases.length > 0) {
                    const base = canvases[0];
                    const temp = document.createElement('canvas');
                    temp.width = base.width;
                    temp.height = base.height;
                    const tctx = temp.getContext('2d');
                    canvases.forEach(c => {
                        try { tctx.drawImage(c, 0, 0); } catch (_) { }
                    });
                    dataUrl = temp.toDataURL('image/png');
                }
            }

            if (dataUrl) {
                const img = new Image();
                img.src = dataUrl;
                img.style.width = '100%';
                img.style.height = 'auto';
                // 用静态图替换整个容器内容
                container.innerHTML = '';
                container.appendChild(img);
            }
        } catch (_) {
            // 忽略单个失败，继续处理其他图表
        }
    }
}

// 构建可独立打开的 HTML 文本
function buildStandaloneHTML(exportNode, parts) {
    const { localCss, katexCss } = parts || {};
    const title = document.title || 'Madopic Export';

    // 处理样式注入策略：优先内联，失败时保留外链
    const cssBlocks = [];
    if (localCss && localCss.inline) {
        cssBlocks.push(`<style>\n${localCss.inline}\n</style>`);
    } else if (localCss && localCss.href) {
        cssBlocks.push(`<link rel="stylesheet" href="${localCss.href}">`);
    }

    if (katexCss && katexCss.inline) {
        cssBlocks.push(`<style>\n${katexCss.inline}\n</style>`);
    } else if (katexCss && katexCss.href) {
        cssBlocks.push(`<link rel="stylesheet" href="${katexCss.href}">`);
    }

    // 为导出页添加极简 reset，并强制覆盖离屏/滚动样式，确保可见与可滚动
    cssBlocks.push(`<style>\nhtml,body{margin:0;padding:0;background:#f3f4f6;}\nbody{overflow-y:auto !important;overflow-x:hidden;}\n#md2pic-export-poster{position:relative !important;top:auto !important;left:auto !important;margin:40px auto !important;display:block !important;transform:none !important;height:auto !important;min-height:0 !important;overflow:visible !important;}\n#md2pic-export-poster .poster-content{max-height:none !important;overflow:visible !important;}\n</style>`);

    const head = `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${escapeHtml(title)}</title>\n${cssBlocks.join('\n')}\n</head>`;

    // 克隆节点，清理离屏相关 inline 样式
    const node = exportNode.cloneNode(true);
    try {
        node.style.position = '';
        node.style.top = '';
        node.style.left = '';
        node.style.margin = '40px auto';
        node.style.display = 'block';
        node.style.transform = '';
        // 若为固定比例模式（xhs/pyq），取消导出 HTML 的裁剪，保留完整内容
        node.style.height = '';
        node.style.minHeight = '';
        node.style.overflow = 'visible';
        const innerForHtml = node.querySelector('.poster-content');
        if (innerForHtml) {
            innerForHtml.style.maxHeight = '';
            innerForHtml.style.overflow = 'visible';
        }
    } catch (_) { }

    // 仅导出卡片区域，无需运行任何脚本
    const body = `<body>\n${node.outerHTML}\n</body>\n</html>`;

    return `${head}\n${body}`;
}

function escapeHtml(str) {
    try {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    } catch (_) {
        return '' + str;
    }
}

/**
 * 生成按优先级降序的导出 scale 备选列表。
 * 例如：首选 s，然后尝试 2、1.5、1.25、1。
 */
function getExportScaleCandidates(preferred) {
    const candidates = [preferred, 2, 1.5, 1.25, 1];
    const unique = [];
    for (const s of candidates) {
        if (Number.isFinite(s) && s > 0 && !unique.includes(s)) unique.push(s);
    }
    return unique.sort((a, b) => b - a);
}

/**
 * 尝试按多个缩放倍数依次渲染，直到成功为止。
 */
async function renderWithFallbackScales(node, targetWidth, targetHeight, scales, extraOpts = {}) {
    let lastError = null;
    for (const scale of scales) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const canvas = await html2canvas(node, {
                backgroundColor: '#ffffff',
                scale,
                useCORS: true,
                allowTaint: false,
                logging: false,
                width: targetWidth,
                height: targetHeight,
                windowWidth: targetWidth,
                windowHeight: targetHeight,
                scrollX: 0,
                scrollY: 0,
                ...extraOpts,
                imageTimeout: 15000,
                onclone: function (clonedDoc) {
                    const clonedTarget = clonedDoc.getElementById('md2pic-export-poster');
                    if (clonedTarget) {
                        clonedTarget.style.setProperty('position', 'absolute', 'important');
                        clonedTarget.style.setProperty('top', '0', 'important');
                        clonedTarget.style.setProperty('left', '0', 'important');
                        clonedTarget.style.setProperty('margin', '0', 'important');
                        clonedTarget.style.setProperty('width', `${currentWidth}px`, 'important');
                        clonedTarget.style.setProperty('padding', `${currentPadding}px`, 'important');
                        clonedTarget.style.setProperty('box-sizing', 'border-box', 'important');
                    }
                    // 再次为克隆文档内的图片设置跨域/防盗链属性（双保险）
                    try {
                        clonedDoc.querySelectorAll('img').forEach((img) => {
                            if (!img.getAttribute('crossorigin')) img.setAttribute('crossorigin', 'anonymous');
                            if (!img.getAttribute('referrerpolicy')) img.setAttribute('referrerpolicy', 'no-referrer');
                            if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'sync');
                            if (!img.getAttribute('loading')) img.setAttribute('loading', 'eager');
                        });
                    } catch (_) { }

                    // 特殊处理KaTeX数学公式元素
                    try {
                        const katexElements = clonedDoc.querySelectorAll('.katex, .katex-display, .katex-mathml');
                        katexElements.forEach(el => {
                            // 确保KaTeX元素的样式被正确保留
                            el.style.setProperty('font-family', 'KaTeX_Main, "Times New Roman", serif', 'important');
                            if (el.classList.contains('katex-display')) {
                                el.style.setProperty('display', 'block', 'important');
                                el.style.setProperty('text-align', 'center', 'important');
                            }
                        });
                    } catch (_) { }

                    // 特殊处理Mermaid图表SVG
                    try {
                        const mermaidSvgs = clonedDoc.querySelectorAll('.mermaid svg');
                        mermaidSvgs.forEach(svg => {
                            // 确保SVG有明确的尺寸和样式
                            if (!svg.getAttribute('width') && svg.getBoundingClientRect) {
                                const rect = svg.getBoundingClientRect();
                                if (rect.width > 0) svg.setAttribute('width', rect.width);
                                if (rect.height > 0) svg.setAttribute('height', rect.height);
                            }
                            svg.style.setProperty('display', 'block', 'important');
                            svg.style.setProperty('max-width', '100%', 'important');
                        });
                    } catch (_) { }

                    clonedDoc.documentElement.style.setProperty('overflow', 'hidden', 'important');
                    clonedDoc.body.style.setProperty('margin', '0', 'important');
                    clonedDoc.body.style.setProperty('padding', '0', 'important');
                }
            });
            if (scale !== scales[0]) {
                showNotification(`显存不足，已自动降至 ${Math.round(scale * 100)}% 清晰度导出`, 'warning');
            }
            return canvas;
        } catch (err) {
            lastError = err;
            // 继续尝试下一个较低的 scale
        }
    }
    throw lastError || new Error('所有缩放倍数均导出失败');
}

// ===== 通知系统 =====
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;

    // 添加样式
    Object.assign(notification.style, {
        position: 'fixed',
        top: '80px',
        right: '20px',
        background: getNotificationColor(type),
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        zIndex: '10000',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        fontSize: '14px',
        fontWeight: '500'
    });

    // 如果存在缩放工具栏，则将通知定位到百分比（缩放工具栏）下方
    try {
        const anchor = document.querySelector('.preview-tools') || document.querySelector('.zoom-level');
        if (anchor && typeof anchor.getBoundingClientRect === 'function') {
            const rect = anchor.getBoundingClientRect();
            // fixed 定位采用视口坐标，直接使用 rect.bottom 即可
            const computedTop = Math.max(rect.bottom + 10, 10);
            notification.style.top = `${Math.round(computedTop)}px`;
        } else {
            // 略微下移默认位置，避免遮挡顶部工具栏
            notification.style.top = '120px';
        }
    } catch (e) {
        // 发生异常时退回到略低的默认位置
        notification.style.top = '120px';
    }

    notification.querySelector('.notification-content').style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    document.body.appendChild(notification);

    // 动画显示
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    // 自动隐藏
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function getNotificationIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };
    return icons[type] || icons.info;
}

function getNotificationColor(type) {
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6',
        warning: '#f59e0b'
    };
    return colors[type] || colors.info;
}

// ===== 键盘快捷键 =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'b':
                    e.preventDefault();
                    handleToolbarAction('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    handleToolbarAction('italic');
                    break;
                case 's':
                    e.preventDefault();
                    exportToPNG();
                    break;
                case '=':
                case '+':
                    e.preventDefault();
                    zoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    zoomOut();
                    break;
            }
        }

        // ESC 键关闭面板
        if (e.key === 'Escape') {
            closeCustomPanel();
        }
    });
}

// ===== 错误处理 =====
window.addEventListener('error', function (e) {
    console.error('应用错误:', e.error);
    showNotification('应用出现错误，请刷新页面重试', 'error');
});

// 页面可见性改变时优化性能
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        // 页面隐藏时暂停某些操作
    } else {
        // 页面可见时恢复操作
        updatePreview();
    }
});

// 添加一些实用的格式化快捷方法
const MarkdownHelper = {
    // 插入表格
    insertTable: function (rows = 3, cols = 3) {
        const textarea = markdownInput;
        let table = '\n| ';

        // 表头
        for (let i = 0; i < cols; i++) {
            table += `列${i + 1} | `;
        }
        table += '\n| ';

        // 分隔线
        for (let i = 0; i < cols; i++) {
            table += '--- | ';
        }
        table += '\n';

        // 数据行
        for (let row = 0; row < rows - 1; row++) {
            table += '| ';
            for (let col = 0; col < cols; col++) {
                table += '数据 | ';
            }
            table += '\n';
        }

        const cursorPos = textarea.selectionStart;
        const beforeText = textarea.value.substring(0, cursorPos);
        const afterText = textarea.value.substring(cursorPos);

        textarea.value = beforeText + table + afterText;
        textarea.setSelectionRange(cursorPos + table.length, cursorPos + table.length);
        updatePreview();
    },

    // 插入代码块
    insertCodeBlock: function (language = '') {
        const textarea = markdownInput;
        const codeBlock = `\n\`\`\`${language}\n// 在这里输入代码\nconsole.log('Hello World!');\n\`\`\`\n`;

        const cursorPos = textarea.selectionStart;
        const beforeText = textarea.value.substring(0, cursorPos);
        const afterText = textarea.value.substring(cursorPos);

        textarea.value = beforeText + codeBlock + afterText;
        textarea.setSelectionRange(cursorPos + 4 + language.length, cursorPos + 4 + language.length);
        updatePreview();
    },

    // 通用的插入方法
    insertAtCursor: function (text) {
        const textarea = markdownInput;
        const cursorPos = textarea.selectionStart;
        const beforeText = textarea.value.substring(0, cursorPos);
        const afterText = textarea.value.substring(cursorPos);

        textarea.value = beforeText + text + afterText;
        textarea.setSelectionRange(cursorPos + text.length, cursorPos + text.length);
        textarea.focus();
        updatePreview();
    },

    // 插入质能守恒公式
    insertEinsteinFormula: function () {
        const formula = `

## 质能守恒定律

$$E = mc^{2}$$

其中：
- $E$ 表示能量
- $m$ 表示质量  
- $c$ 表示光速

`;
        this.insertAtCursor(formula);
    },

    // 插入数学公式模板
    insertMathFormulas: function () {
        const formulas = `

## 常用数学公式

### 代数
**二次公式：** $x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}$

**因式分解：** $a^{2} - b^{2} = (a+b)(a-b)$

### 微积分
**导数定义：** $f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$

**基本积分：** $\\int_a^b f(x)dx = F(b) - F(a)$

### 三角函数
**勾股定理：** $a^{2} + b^{2} = c^{2}$

**正弦定理：** $\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}$

### 统计学
**均值：** $\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i$

**方差：** $\\sigma^{2} = \\frac{1}{n}\\sum_{i=1}^{n} (x_i - \\bar{x})^{2}$

`;
        this.insertAtCursor(formulas);
    },

    // 插入物理公式模板
    insertPhysicsFormulas: function () {
        const formulas = `

## 物理公式集合

### 经典力学
**牛顿第二定律：** $F = ma$

**万有引力定律：** $F = G\\frac{m_1 m_2}{r^{2}}$

**动能：** $E_k = \\frac{1}{2}mv^{2}$

**势能：** $E_p = mgh$

### 电磁学
**库仑定律：** $F = k\\frac{q_1 q_2}{r^{2}}$

**欧姆定律：** $V = IR$

**电功率：** $P = VI = I^{2}R = \\frac{V^{2}}{R}$

### 现代物理
**质能关系：** $E = mc^{2}$

**德布罗意波长：** $\\lambda = \\frac{h}{p}$

**海森堡不确定性原理：** $\\Delta x \\Delta p \\geq \\frac{\\hbar}{2}$

`;
        this.insertAtCursor(formulas);
    },

    // 插入化学公式模板
    insertChemistryFormulas: function () {
        const formulas = `

## 化学公式集合

### 基本化学反应
**燃烧反应：** $\\ce{CH4 + 2O2 -> CO2 + 2H2O}$

**酸碱中和：** $\\ce{HCl + NaOH -> NaCl + H2O}$

**氧化还原：** $\\ce{2Na + Cl2 -> 2NaCl}$

### 有机化学
**甲烷：** $\\ce{CH4}$

**乙醇：** $\\ce{C2H5OH}$

**葡萄糖：** $\\ce{C6H12O6}$

### 化学平衡
**平衡常数：** $K_c = \\frac{[C]^c[D]^d}{[A]^a[B]^b}$

**pH定义：** $pH = -\\log[H^+]$

### 理想气体
**理想气体定律：** $PV = nRT$

`;
        this.insertAtCursor(formulas);
    },

    // 插入流程图
    insertFlowchart: function () {
        const flowchart = `
\`\`\`mermaid
flowchart TD
    A[开始] --> B{判断条件}
    B -->|是| C[执行操作]
    B -->|否| D[其他操作]
    C --> E[结束]
    D --> E
\`\`\`
`;
        this.insertAtCursor(flowchart);
    },

    // 插入序列图
    insertSequenceDiagram: function () {
        const sequenceDiagram = `
\`\`\`mermaid
sequenceDiagram
    participant A as 用户
    participant B as 系统
    A->>B: 发送请求
    B-->>A: 返回响应
    A->>B: 确认收到
\`\`\`
`;
        this.insertAtCursor(sequenceDiagram);
    },

    // 插入甘特图
    insertGanttChart: function () {
        const ganttChart = `
\`\`\`mermaid
gantt
    title 项目进度计划
    dateFormat  YYYY-MM-DD
    section 阶段一
    任务1           :a1, 2024-01-01, 30d
    任务2           :after a1, 20d
    section 阶段二
    任务3           :2024-02-01, 25d
    任务4           :20d
\`\`\`
`;
        this.insertAtCursor(ganttChart);
    },

    // 插入饼图
    insertPieChart: function () {
        const pieChart = `
\`\`\`mermaid
pie title 数据分布
    "类别A" : 42.96
    "类别B" : 50.05
    "类别C" : 10.01
    "其他" : 5
\`\`\`
`;
        this.insertAtCursor(pieChart);
    },

    // 插入卡片
    insertCard: function () {
        const cardTemplate = `

:::card
**卡片标题**

这是一个精美的卡片内容区域。你可以在这里添加：

- 重要信息
- 产品特色
- 使用说明
- 任何想要突出显示的内容

支持 **粗体**、*斜体*、\`代码\` 和 [链接](https://example.com) 等格式。
:::

**不同类型的卡片示例：**

:::card info
**信息卡片**

这是一个信息类型的卡片，适合展示提示信息。
:::

:::card success
**成功卡片**

这是一个成功类型的卡片，适合展示成功状态。
:::

:::card warning
**警告卡片**

这是一个警告类型的卡片，适合展示注意事项。
:::

:::card error
**错误卡片**

这是一个错误类型的卡片，适合展示错误信息。
:::

`;
        this.insertAtCursor(cardTemplate);
    },

    // 插入 Obsidian Callout
    insertCallout: function () {
        const calloutTemplate = `
> [!note] 笔记标题
> 这是笔记内容
> 支持多行文本

**其他类型示例：**

> [!tip] 提示
> 这是一个提示信息

> [!warning] 警告
> 这是一个警告信息

> [!question]- 可折叠问题
> 点击标题可折叠/展开内容
> 注意标题后的 \`-\` 符号

`;
        this.insertAtCursor(calloutTemplate);
    },

    // 插入ECharts图表模板
    insertEChartsTemplate: function () {
        const echartsTemplate = `

## ECharts 图表示例

### 饼图
\`\`\`echarts
{
  "title": {
    "text": "访问来源统计",
    "left": "center"
  },
  "tooltip": {
    "trigger": "item",
    "formatter": "{a} <br/>{b} : {c} ({d}%)"
  },
  "legend": {
    "orient": "vertical",
    "left": "left",
    "data": ["搜索引擎", "直接访问", "推荐", "其他", "社交平台"]
  },
  "series": [{
    "name": "访问来源",
    "type": "pie",
    "radius": "55%",
    "center": ["50%", "60%"],
    "data": [
      {"value": 10440, "name": "搜索引擎"},
      {"value": 4770, "name": "直接访问"},
      {"value": 2430, "name": "推荐"},
      {"value": 342, "name": "其他"},
      {"value": 18, "name": "社交平台"}
    ]
  }]
}
\`\`\`

### 柱状图
\`\`\`echarts
{
  "title": {
    "text": "月度销售数据",
    "left": "center"
  },
  "tooltip": {
    "trigger": "axis"
  },
  "xAxis": {
    "type": "category",
    "data": ["1月", "2月", "3月", "4月", "5月", "6月"]
  },
  "yAxis": {
    "type": "value"
  },
  "series": [{
    "name": "销售额",
    "type": "bar",
    "data": [120, 200, 150, 80, 70, 110],
    "itemStyle": {
      "color": "#5470c6"
    }
  }]
}
\`\`\`

`;
        this.insertAtCursor(echartsTemplate);
    }
};

// 图片处理相关函数
function insertImage() {
    const imageInput = document.getElementById('imageInput');
    imageInput.click();
}

function setupImageHandlers() {
    const imageInput = document.getElementById('imageInput');

    // 文件选择处理
    imageInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        }
        // 清空输入，允许选择同一文件
        e.target.value = '';
    });

    // 剪贴板粘贴图片处理
    markdownInput.addEventListener('paste', function (e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    handleImageFile(file);
                }
                break;
            }
        }
    });
}

function handleImageFile(file) {
    showNotification('正在处理图片...', 'info');

    convertImageToBase64(file)
        .then(base64 => {
            insertImageIntoMarkdown(base64, file.name);
            showNotification('图片插入成功！', 'success');
        })
        .catch(error => {
            console.error('图片处理失败:', error);
            showNotification('图片处理失败，请重试', 'error');
        });
}

function convertImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            resolve(e.target.result);
        };
        reader.onerror = function (error) {
            reject(error);
        };
        reader.readAsDataURL(file);
    });
}

function insertImageIntoMarkdown(base64, filename) {
    const textarea = markdownInput;
    const cursorPos = textarea.selectionStart;
    const beforeText = textarea.value.substring(0, cursorPos);
    const afterText = textarea.value.substring(cursorPos);

    // 创建简化的图片Markdown语法用于显示（截断base64）
    const base64Header = base64.split(',')[0] + ','; // 保留data:image/xxx;base64,部分
    const base64Data = base64.split(',')[1]; // 获取实际的base64数据
    const shortBase64 = base64Header + base64Data.substring(0, 50) + '...'; // 只显示前50个字符

    const imageMarkdown = `\n![${filename}](${shortBase64})\n`;

    // 存储完整的图片数据供预览和导出使用
    storeImageData(shortBase64, base64);

    // 插入到光标位置
    textarea.value = beforeText + imageMarkdown + afterText;
    textarea.setSelectionRange(cursorPos + imageMarkdown.length, cursorPos + imageMarkdown.length);
    textarea.focus();
    updatePreview();
}

// 存储图片数据映射
function storeImageData(shortBase64, fullBase64) {
    imageDataStore.set(shortBase64, fullBase64);
}

// 替换预览中的简化base64为完整base64
function replaceImageDataForPreview(content) {
    let result = content;
    imageDataStore.forEach((fullBase64, shortBase64) => {
        result = result.replace(new RegExp(escapeRegExp(shortBase64), 'g'), fullBase64);
    });
    return result;
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 生成格式化的时间戳字符串 (YYYYMMDDHHMMSS)
function getFormattedTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// 获取当前配置（便于调试与外部接入）
function getCurrentMadopicConfig() {
    return {
        width: currentWidth,
        padding: currentPadding,
        fontSize: currentFontSize,
        background: markdownPoster.style.background,
        exportScale: EXPORT_SCALE
    };
}

// 导出全局对象供调试使用
window.MadopicApp = {
    updatePreview,
    exportToPNG,
    exportToPDF,
    MarkdownHelper,
    showNotification,
    insertImage,
    handleImageFile,
    getCurrentMadopicConfig,
    mathRenderer,
    diagramRenderer,
    echartsRenderer,
    cardRenderer
};

/**
 * 裁剪画布四周完全透明的像素，去除导出后可能出现的空白边缘。
 * 返回新的裁剪画布；若无需裁剪则返回 null。
 */
function trimTransparentEdges(sourceCanvas) {
    const ctx = sourceCanvas.getContext('2d');
    const { width, height } = sourceCanvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    let top = 0;
    let bottom = height - 1;
    let left = 0;
    let right = width - 1;
    const isRowTransparent = (y) => {
        const base = y * width * 4;
        for (let x = 0; x < width; x++) {
            if (data[base + x * 4 + 3] !== 0) return false;
        }
        return true;
    };
    const isColTransparent = (x, t, b) => {
        for (let y = t; y <= b; y++) {
            const idx = (y * width + x) * 4 + 3;
            if (data[idx] !== 0) return false;
        }
        return true;
    };

    while (top <= bottom && isRowTransparent(top)) top++;
    while (bottom >= top && isRowTransparent(bottom)) bottom--;
    while (left <= right && isColTransparent(left, top, bottom)) left++;
    while (right >= left && isColTransparent(right, top, bottom)) right--;

    // 若全透明或无需要裁剪
    if (top === 0 && left === 0 && right === width - 1 && bottom === height - 1) return null;
    if (top > bottom || left > right) return null;

    const newWidth = right - left + 1;
    const newHeight = bottom - top + 1;
    const trimmed = document.createElement('canvas');
    trimmed.width = newWidth;
    trimmed.height = newHeight;
    const tctx = trimmed.getContext('2d');
    tctx.drawImage(sourceCanvas, left, top, newWidth, newHeight, 0, 0, newWidth, newHeight);
    return trimmed;
}

// ===== 撤销/重做快捷键 =====
document.addEventListener('keydown', (e) => {
    // Ctrl+Z 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const state = undoRedoManager.undo();
        if (state !== null && markdownInput) {
            undoRedoManager.isUndoRedo = true;
            markdownInput.value = state;
            undoRedoManager.isUndoRedo = false;
            updatePreview();
        }
    }
    // Ctrl+Y 或 Ctrl+Shift+Z 重做
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const state = undoRedoManager.redo();
        if (state !== null && markdownInput) {
            undoRedoManager.isUndoRedo = true;
            markdownInput.value = state;
            undoRedoManager.isUndoRedo = false;
            updatePreview();
        }
    }
});

// 保存输入状态到撤销栈（防抖）
const pushUndoState = debounce(() => {
    if (markdownInput) {
        undoRedoManager.push(markdownInput.value);
    }
}, 500);

// ===== 拖拽图片插入 =====
function setupDragDropImage() {
    if (!markdownInput) return;

    markdownInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        markdownInput.classList.add('drag-over');
    });

    markdownInput.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        markdownInput.classList.remove('drag-over');
    });

    markdownInput.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        markdownInput.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                await handleImageFile(file);
            }
        }
    });
}

// ===== 触屏双指缩放 =====
function setupPinchZoom() {
    const previewContainer = document.getElementById('previewContainer');
    if (!previewContainer) return;

    let initialDistance = 0;
    let initialZoom = 100;

    previewContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialZoom = currentZoom;
        }
    }, { passive: true });

    previewContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scale = currentDistance / initialDistance;
            let newZoom = Math.round(initialZoom * scale);
            newZoom = Math.max(25, Math.min(200, newZoom));
            if (newZoom !== currentZoom) {
                currentZoom = newZoom;
                const previewContent = document.querySelector('.preview-content');
                if (previewContent) {
                    previewContent.style.transform = `scale(${currentZoom / 100})`;
                }
                const zoomLevel = document.querySelector('.zoom-level');
                if (zoomLevel) {
                    zoomLevel.textContent = `${currentZoom}%`;
                }
            }
        }
    }, { passive: true });
}

// ===== 汉堡菜单（移动端响应式） =====
function setupHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const toolbarRight = document.getElementById('toolbarRight');
    if (!hamburgerBtn || !toolbarRight) return;

    hamburgerBtn.addEventListener('click', () => {
        toolbarRight.classList.toggle('mobile-open');
        hamburgerBtn.classList.toggle('active');
    });

    // 点击菜单项后自动关闭
    toolbarRight.addEventListener('click', (e) => {
        if (e.target.closest('.btn')) {
            toolbarRight.classList.remove('mobile-open');
            hamburgerBtn.classList.remove('active');
        }
    });
}

// ===== 草稿恢复 =====
function restoreDraft() {
    const draft = loadDraft();
    const settings = loadSettings();

    if (draft && markdownInput) {
        // 只有当草稿内容与默认内容不同时才恢复
        const defaultContent = markdownInput.value;
        if (draft !== defaultContent && draft.trim().length > 0) {
            markdownInput.value = draft;
            undoRedoManager.push(draft);
        }
    }

    // 恢复设置
    if (settings) {
        if (settings.background) {
            currentBackground = settings.background;
        }
        if (settings.mode && typeof switchMode === 'function') {
            // 稍后在 DOM 准备好后切换模式
        }
        if (typeof settings.watermark === 'string') {
            currentWatermark = settings.watermark;
            const wmInput = document.getElementById('watermarkInput');
            if (wmInput) wmInput.value = currentWatermark;
        }
    }
}

// ===== 初始化所有优化功能 =====
function initOptimizations() {
    // 恢复草稿
    restoreDraft();

    // 初始化撤销栈
    if (markdownInput) {
        undoRedoManager.push(markdownInput.value);

        // 监听输入事件，记录撤销状态
        markdownInput.addEventListener('input', () => {
            pushUndoState();
            debouncedUpdatePreview();
        });
    }

    // 设置拖拽图片
    setupDragDropImage();

    // 设置触屏缩放
    setupPinchZoom();

    // 设置汉堡菜单
    setupHamburgerMenu();

    console.log('Madopic 优化功能已初始化');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOptimizations);
} else {
    initOptimizations();
}