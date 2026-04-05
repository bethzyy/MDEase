# MDEase PRD — 产品需求文档

## 1. 产品概述

**产品名称**: MDEase
**产品类型**: Chrome 扩展（Content Script）
**目标用户**: 经常在本地阅读和编辑 Markdown 文件的开发者、技术写作者
**核心价值**: 将 Chrome 打开本地 .md 文件的体验从「纯文本预览」升级为「飞书式 WYSIWYG 编辑器」

## 2. 用户场景

### 场景一：阅读 Markdown 文档
用户用 Chrome 打开本地 `.md` 文件 → MDEase 自动渲染为格式化的 HTML → 左侧显示目录导航，右侧显示渲染内容

### 场景二：快速编辑
用户发现文档有错别字 → 直接点击渲染后的文字进行修改（WYSIWYG）→ 用工具栏按钮添加格式 → Ctrl+S 保存草稿

### 场景三：多文件导航
用户在写一本电子书，所有章节是独立的 .md 文件 → 侧边栏选择文件夹 → 文件树显示所有章节 → 点击切换文件

### 场景四：源码级编辑
用户需要编辑复杂的表格或嵌套列表 → Ctrl+E 切换到源码模式 → 编辑原始 Markdown → Ctrl+E 返回预览

## 3. 功能需求

### 3.1 Markdown 渲染
- 自动拦截 `file:///*/*.md` 的页面加载
- 使用 marked.js 解析 Markdown → HTML
- 支持 GFM（表格、任务列表、删除线）
- 代码块使用 highlight.js 语法高亮
- 生成 HTML 注入 contenteditable 容器

### 3.2 WYSIWYG 编辑
- 预览区域设置 `contenteditable="true"`，直接点击编辑
- 格式工具栏按钮：
  - **B** — 加粗（`document.execCommand('bold')`）
  - **I** — 斜体（`document.execCommand('italic')`）
  - **H2** — 二级标题（`formatBlock`）
  - **H3** — 三级标题（`formatBlock`）
  - **列表** — 有序/无序列表
  - **引用** — blockquote
  - **代码块** — 插入 `<pre><code>` 元素
  - **链接** — prompt 输入 URL 后插入 `<a>` 元素
- Tab 键插入 4 空格
- 粘贴代码类内容时保持纯文本格式

### 3.3 源码模式
- Ctrl+E 或点击「源码」按钮切换
- WYSIWYG → 源码：使用 turndown.js 将 HTML 转回 Markdown
- 源码 → WYSIWYG：使用 marked.js 重新渲染
- **往返保护**：未编辑时直接使用原始 Markdown，避免 turndown 往返损失
- 源码模式下格式工具栏禁用

### 3.4 侧边栏

#### 文件树视图
- 顶部分段控件：文件夹图标 ↔ 列表图标
- 文件夹图标高亮时显示文件树
- 用户点击「选择文件夹」按钮 → `<input webkitdirectory>` → 过滤 .md 文件
- 当前文件蓝色高亮
- 点击其他文件跳转打开
- 文件列表缓存到 IndexedDB，下次自动加载

#### 大纲视图
- 列表图标高亮时显示标题目录（TOC）
- 从 h1-h6 标题自动生成
- 支持搜索过滤（可折叠搜索框）
- 点击标题平滑滚动到对应位置
- Scroll Spy 高亮当前阅读位置

### 3.5 草稿存储
- 使用 IndexedDB 存储，key 为文件路径（`window.location.href`）
- 存储结构：`{ path, content, lastModified }`
- 保存时：WYSIWYG 模式先 turndown 转回 Markdown 再存储
- 页面加载时检测草稿，toast 提示「发现草稿」+ 加载按钮
- Ctrl+S 快捷键保存

### 3.6 导出
- 将当前内容导出为 .md 文件
- 使用 Blob + `<a download>` 实现，零额外权限
- 文件名默认为原文件名

### 3.7 状态栏
- 底部显示：字符数、词数（中英文混合计算）、预估阅读时间

## 4. 非功能需求

### 4.1 性能
- TOC 更新使用 300ms 节流
- 文件列表按文件名排序
- 大文件（>1MB）无特殊处理，依赖浏览器原生性能

### 4.2 兼容性
- Chrome 88+（Manifest V3 最低版本）
- Windows / macOS / Linux 的 file:// 协议
- 中文文件名正确显示

### 4.3 安全
- 零额外权限声明（不需要 fileSystem、downloads）
- 不访问任何外部网络资源
- 不收集任何用户数据

## 5. 技术架构

```
┌─────────────────────────────────────────────┐
│                Chrome Extension              │
├─────────────────────────────────────────────┤
│  manifest.json (MV3)                        │
│  content_scripts: file:///*/*.md           │
├─────────────────────────────────────────────┤
│  加载顺序:                                   │
│  1. marked.min.js    → window.marked       │
│  2. highlight.min.js → window.hljs         │
│  3. turndown.js      → window.TurndownService│
│  4. db.js            → window.MDEaseDB      │
│  5. content.js       → 主逻辑 IIFE          │
│  6. styles.css       → 自动注入              │
└─────────────────────────────────────────────┘
```

### 数据流

```
本地 .md 文件
    ↓ (Chrome 打开)
file:// 协议渲染为纯文本 <pre>
    ↓ (content.js extractMarkdown)
原始 Markdown 文本
    ↓ (marked.parse → contenteditable)
WYSIWYG 编辑视图 ←→ (turndown ↔ marked) → 源码视图
    ↓ (Ctrl+S / 保存草稿)
IndexedDB 草稿存储
    ↓ (导出)
Blob → <a download> → .md 文件下载
```

## 6. 已知限制

1. **file:// 目录枚举**：浏览器安全限制，无法自动列出目录文件，需用户手动选择文件夹
2. **turndown 往返有损**：HTML→Markdown 转换无法完美还原所有格式（通过 dirty flag 最小化往返）
3. **contenteditable 局限**：复杂编辑操作（如表格编辑）建议切换到源码模式
4. **文件列表持久性**：清除浏览器数据会丢失 IndexedDB 中的草稿和文件列表缓存

## 7. 版本规划

### v1.0.0（当前）
- WYSIWYG 编辑 + 源码模式
- 文件树 + 大纲目录（分段控件切换）
- TOC 搜索过滤
- 草稿 IndexedDB 存储
- 导出 .md 文件

### v1.1.0（计划）
- 深色模式
- 自动保存（定时 30s）
- 拖拽文件到浏览器直接打开
- 更多语言的高亮主题选择

### v2.0.0（远期）
- Markdown 分屏预览（左源码右预览）
- 图片拖拽上传（Base64 内嵌）
- 多标签页支持
- 协同编辑（WebSocket）
