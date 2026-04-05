# MDEase

> WYSIWYG Markdown 编辑器 Chrome 扩展 — 像飞书一样直接在预览界面编辑本地 .md 文件。

## 功能特性

- **WYSIWYG 编辑** — What You See Is What You Get，渲染后的 Markdown 直接点击编辑，所见即所得
- **格式工具栏** — 加粗、斜体、标题、列表、引用、代码块、链接
- **源码模式** — Ctrl+E 切换原始 Markdown 编辑（适合复杂结构）
- **文件树导航** — 选择文件夹后浏览所有 .md 文件，点击切换
- **大纲目录** — 自动生成标题目录，支持搜索过滤
- **草稿存储** — IndexedDB 自动缓存，刷新不丢失
- **导出** — 一键导出为 .md 文件
- **代码高亮** — highlight.js 支持 190+ 种语言
- **键盘快捷键** — Ctrl+S 保存、Ctrl+E 切换模式、Tab 缩进

## 安装

1. 下载本项目
2. 打开 Chrome → `chrome://extensions` → 开启**开发者模式**
3. 点击 **加载已解压的扩展程序** → 选择 `MDEase` 文件夹
4. **重要**：在扩展详情页开启 **「允许访问文件网址」**
5. 用 Chrome 打开任意本地 `.md` 文件即可使用

## 使用方式

| 操作 | 说明 |
|------|------|
| 直接点击内容 | WYSIWYG 编辑 |
| 工具栏 B / I / H2 / H3 | 加粗 / 斜体 / 二级标题 / 三级标题 |
| Ctrl+B / Ctrl+I | 加粗 / 斜体快捷键 |
| Ctrl+E | 切换源码/预览模式 |
| Ctrl+S | 保存草稿 |
| Escape | 从源码模式返回预览 |
| Tab | 插入 4 空格缩进 |
| 侧边栏文件夹图标 | 文件树视图 |
| 侧边栏列表图标 | 大纲目录视图 |
| 大纲搜索按钮 | 过滤标题 |

## 技术栈

- **Manifest V3** — Chrome 扩展最新标准
- **marked v17** — Markdown → HTML 解析（GFM 支持）
- **highlight.js v11** — 代码语法高亮
- **turndown** — HTML → Markdown 逆向转换
- **IndexedDB** — 本地草稿存储
- **原生 JS + CSS** — 零框架依赖

## 项目结构

```
MDEase/
├── manifest.json       # MV3 扩展配置
├── content.js          # 主逻辑：UI、渲染、编辑、事件
├── db.js               # IndexedDB 存储模块
├── styles.css          # 全部样式 + highlight.js 主题
├── lib/
│   ├── marked.min.js   # Markdown 解析器
│   ├── highlight.min.js # 代码高亮
│   └── turndown.js     # HTML→Markdown 转换
└── icons/              # 扩展图标
```

## 注意事项

- `file://` 协议下第三方库必须本地打包，无法使用 CDN
- 用户需手动开启「允许访问文件网址」权限（Chrome 安全限制）
- 文件树功能需要用户手动选择文件夹（浏览器安全限制）
- 文件列表会缓存到 IndexedDB，同一目录下次打开自动加载

## License

MIT
