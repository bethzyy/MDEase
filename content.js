// content.js - MDEase WYSIWYG Markdown Editor
(function () {
  'use strict';

  // ========== State ==========
  const state = {
    filePath: window.location.href,
    rawMarkdown: '',
    currentContent: '',
    mode: 'wysiwyg', // 'wysiwyg' | 'source'
    tocItems: [],
    filename: '',
    dirPath: '', // directory path of current file
    dirName: '', // directory name for display
    fileTree: [], // array of {name, path} for .md files in the directory
    wysiwygDirty: false,
    translatedMarkdown: '',
    translatedSourceMarkdown: '',
    isTranslated: false,
    isTranslating: false,
  };

  // ========== Path Helpers ==========
  function getDirPath(filePath) {
    try {
      const url = new URL(filePath);
      const pathname = url.pathname;
      const lastSlash = pathname.lastIndexOf('/');
      return pathname.substring(0, lastSlash + 1); // include trailing slash
    } catch {
      return '';
    }
  }

  function getDirName(dirPath) {
    const parts = dirPath.replace(/\/$/, '').split('/');
    const name = parts[parts.length - 1] || parts[parts.length - 2] || '';
    return decodeURIComponent(name);
  }

  // ========== Markdown Extraction ==========
  function extractMarkdown() {
    const pre = document.querySelector('pre');
    if (pre) return pre.textContent;
    return document.body ? document.body.innerText : '';
  }

  // ========== Slugify ==========
  function slugify(text) {
    const plain = text.replace(/<[^>]+>/g, '');
    return plain
      .toLowerCase()
      .trim()
      .replace(/[\s]+/g, '-')
      .replace(/[^\w\u4e00-\u9fff-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ========== Configure Marked ==========
  function configureMarked() {
    const renderer = {
      code({ text, lang }) {
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
        const highlighted = hljs.highlight(text, { language }).value;
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
      },
      heading({ text, depth }) {
        const parsed = marked.parseInline(text);
        const slug = slugify(text);
        state.tocItems.push({ level: depth, text: parsed, slug });
        return `<h${depth} id="${slug}"><a class="heading-anchor" href="#${slug}" aria-hidden="true">#</a>${parsed}</h${depth}>`;
      },
    };
    marked.use({ renderer, gfm: true, breaks: false });
  }

  // ========== Configure Turndown ==========
  let turndownService = null;
  function configureTurndown() {
    turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
    });

    turndownService.addRule('headingAnchor', {
      filter: (node) => node.nodeName === 'A' && node.classList.contains('heading-anchor'),
      replacement: () => '',
    });

    turndownService.addRule('fencedCodeBlock', {
      filter: (node) => node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE',
      replacement: (content, node) => {
        const code = node.firstChild;
        const lang = code.className ? (code.className.match(/language-(\S+)/) || [])[1] || '' : '';
        return '\n```' + lang + '\n' + code.textContent + '\n```\n';
      },
    });

    turndownService.addRule('taskListItems', {
      filter: (node) => node.nodeName === 'LI' && node.querySelector('input[type="checkbox"]'),
      replacement: (content, node) => {
        const checkbox = node.querySelector('input[type="checkbox"]');
        const checked = checkbox && checkbox.checked ? 'x' : ' ';
        function extractInline(n) {
          if (n.nodeType === 3) return n.textContent;
          if (n.nodeName === 'INPUT') return '';
          const tag = n.nodeName;
          const inner = [...n.childNodes].map(extractInline).join('');
          if (tag === 'SPAN' && n.style && n.style.color) return `<span style="color:${n.style.color}">${inner}</span>`;
          if (tag === 'STRONG' || tag === 'B') return `**${inner}**`;
          if (tag === 'EM' || tag === 'I') return `*${inner}*`;
          if (tag === 'CODE') return `\`${n.textContent}\``;
          if (tag === 'A') return `[${inner}](${n.getAttribute('href') || ''})`;
          return inner;
        }
        const text = [...node.childNodes].map(extractInline).join('').trim();
        return `- [${checked}] ${text}\n`;
      },
    });

    turndownService.addRule('coloredSpan', {
      filter: (node) => node.nodeName === 'SPAN' && node.style && node.style.color,
      replacement: (content, node) => {
        if (node.querySelector('p,h1,h2,h3,h4,h5,h6,table,thead,tbody,tfoot,tr,th,td,ul,ol,li,blockquote,pre,div')) {
          return content;
        }
        return `<span style="color:${node.style.color}">${node.innerHTML}</span>`;
      },
    });

    turndownService.addRule('hr', {
      filter: 'hr',
      replacement: () => '\n\n---\n\n',
    });

    turndownService.addRule('table', {
      filter: (node) => node.nodeName === 'TABLE',
      replacement: (content, node) => {
        function inlineContent(node) {
          if (node.nodeType === 3) return node.textContent.replace(/\|/g, '\\|');
          const tag = node.nodeName;
          const inner = [...node.childNodes].map(inlineContent).join('');
          if (tag === 'STRONG' || tag === 'B') return '**' + inner + '**';
          if (tag === 'EM' || tag === 'I') return '*' + inner + '*';
          if (tag === 'CODE') return '`' + node.textContent + '`';
          if (tag === 'SPAN' && node.style && node.style.color) return `<span style="color:${node.style.color}">${inner}</span>`;
          if (tag === 'A') return '[' + inner + '](' + (node.getAttribute('href') || '') + ')';
          if (tag === 'BR') return ' ';
          return inner;
        }
        function cellText(cell) {
          return [...cell.childNodes].map(inlineContent).join('').replace(/\s+/g, ' ').trim();
        }

        const rows = [];
        const thead = node.querySelector('thead');
        const tbody = node.querySelector('tbody');

        if (thead) {
          const ths = [...thead.querySelectorAll('th, td')];
          rows.push('| ' + ths.map(cellText).join(' | ') + ' |');
          rows.push('| ' + ths.map(() => '---').join(' | ') + ' |');
        }

        const bodyRows = tbody
          ? [...tbody.querySelectorAll('tr')]
          : [...node.querySelectorAll('tr')].slice(thead ? 0 : 1);

        if (!thead && bodyRows.length) {
          const firstCells = [...bodyRows[0].querySelectorAll('td, th')];
          rows.push('| ' + firstCells.map(cellText).join(' | ') + ' |');
          rows.push('| ' + firstCells.map(() => '---').join(' | ') + ' |');
          bodyRows.slice(1).forEach((row) => {
            const cells = [...row.querySelectorAll('td, th')].map(cellText);
            rows.push('| ' + cells.join(' | ') + ' |');
          });
        } else {
          bodyRows.forEach((row) => {
            const cells = [...row.querySelectorAll('td, th')].map(cellText);
            rows.push('| ' + cells.join(' | ') + ' |');
          });
        }

        return rows.length ? '\n\n' + rows.join('\n') + '\n\n' : content;
      },
    });
  }

  // ========== File Tree ==========

  // 从目录列表 HTML 中提取 .md 文件
  function parseMdLinksFromDoc(doc, dirUrl) {
    const links = doc.querySelectorAll('a');
    const mdFiles = [];
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      if (href.endsWith('/') || href.startsWith('../') || href.startsWith('?')) return;
      if (!/\.(md|markdown|mdown)$/i.test(href)) return;
      const name = decodeURIComponent(href.split('/').pop());
      const filePath = dirUrl + encodeURIComponent(name);
      mdFiles.push({ name, path: filePath });
    });
    return mdFiles;
  }

  // 保存扫描结果
  function filesEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((f, i) => f.path === b[i].path && f.name === b[i].name);
  }

  function applyFileTree(mdFiles) {
    if (!mdFiles || mdFiles.length === 0) return false;
    mdFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    if (filesEqual(state.fileTree, mdFiles)) return true; // no change, skip re-render
    state.fileTree = mdFiles;
    renderFileTree();
    try { window.MDEaseDB.saveFileList(state.dirPath, mdFiles); } catch {}
    return true;
  }

  // 自动扫描当前目录（通过 background service worker）
  async function autoScanDirectory() {
    if (!state.dirPath) return false;
    const dirUrl = 'file://' + state.dirPath;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'scanDirectory',
        dirUrl,
      });
      if (response && response.success && response.files && response.files.length > 0) {
        const mdFiles = response.files.map((href) => {
          const fullUrl = new URL(href, dirUrl).href;
          const name = decodeURIComponent(fullUrl.split('/').pop());
          return { name, path: fullUrl };
        });
        console.log('[MDEase] 扫描完成，找到', mdFiles.length, '个 .md 文件');
        return applyFileTree(mdFiles);
      } else {
        console.log('[MDEase] 目录扫描返回空结果:', dirUrl);
      }
    } catch (e) {
      console.log('[MDEase] 自动扫描失败:', e.message);
    }
    return false;
  }

  async function loadCachedFileList() {
    try {
      const files = await window.MDEaseDB.loadFileList(state.dirPath);
      if (files && files.length > 0) {
        state.fileTree = files;
        renderFileTree();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  function renderFileTree() {
    const container = document.getElementById('file-tree-list');
    if (!container) return;
    container.innerHTML = '';

    if (state.fileTree.length === 0) {
      container.innerHTML = '<li class="file-tree-empty">暂无文件</li>';
      return;
    }

    state.fileTree.forEach((file) => {
      const li = document.createElement('li');
      li.className = 'file-tree-item';
      if (file.name === state.filename) {
        li.classList.add('active');
      }
      li.innerHTML = `<span class="file-icon">&#128196;</span><span class="file-name">${file.name}</span>`;
      li.addEventListener('click', () => {
        if (file.name === state.filename) return;
        window.location.href = file.path;
      });
      container.appendChild(li);
    });
  }

  function setupFolderPicker() {
    // Create hidden file input for folder selection
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      // Filter for .md files
      const mdFiles = files
        .filter((f) => f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.mdown'))
        .map((f) => {
          // Build file:// URL from the webkitRelativePath
          const dirPath = state.dirPath;
          const filePath = 'file://' + dirPath + encodeURIComponent(f.name);
          return { name: f.name, path: filePath };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

      if (mdFiles.length === 0) {
        showToast('该文件夹中没有找到 .md 文件', 'error');
        return;
      }

      state.fileTree = mdFiles;
      renderFileTree();

      // Cache to IndexedDB
      try {
        window.MDEaseDB.saveFileList(state.dirPath, mdFiles);
      } catch {
        // ignore
      }

      showToast(`已加载 ${mdFiles.length} 个文件`);
    });

    // Bind the button
    const btn = document.getElementById('btn-open-folder');
    if (btn) {
      btn.addEventListener('click', () => input.click());
    }
  }

  // ========== Build UI ==========
  function buildUI() {
    // Extract filename and directory
    try {
      const pathname = new URL(state.filePath).pathname;
      state.filename = decodeURIComponent(pathname.split('/').pop()) || 'document.md';
      state.dirPath = getDirPath(state.filePath);
      state.dirName = getDirName(state.dirPath);
    } catch {
      state.filename = 'document.md';
      state.dirPath = '';
      state.dirName = '';
    }

    // Clear Chrome's default rendering
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    document.body.innerHTML = `
      <div id="mdease-app">
        <div id="toast-container"></div>
        <div id="main-layout">
          <aside id="sidebar">
            <div id="sidebar-tabs">
              <button class="sidebar-tab" data-tab="files" title="文件">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5V6.5A1.5 1.5 0 0 0 14.5 5H8l-2-4H1.5z"/></svg>
              </button>
              <button class="sidebar-tab active" data-tab="outline" title="大纲">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 2.5zm0 5A.5.5 0 0 1 2.5 7h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 7zm0 5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg>
              </button>
              <button class="sidebar-tab sidebar-tab-action disabled" id="btn-toggle-filter" title="搜索标题">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
              </button>
            </div>
            <div id="panel-files" class="sidebar-panel hidden">
              <ul id="file-tree-list"></ul>
            </div>
            <div id="panel-outline" class="sidebar-panel">
              <input type="text" id="toc-filter-input" class="hidden" placeholder="搜索标题..." />
              <ul id="toc-list"></ul>
            </div>
          </aside>
          <div id="content-wrapper">
            <header id="toolbar">
              <button class="toolbar-btn" id="btn-toggle-sidebar" title="收起侧边栏">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V3.5A1.5 1.5 0 0 0 12.5 2h-9zM3 3.5a.5.5 0 0 1 .5-.5h3v10h-3a.5.5 0 0 1-.5-.5v-9zm4.5 9.5v-10h5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-5z"/></svg>
              </button>
              <div class="toolbar-center" id="format-toolbar">
                <button class="fmt-btn" data-cmd="bold" title="加粗 (Ctrl+B)"><b>B</b></button>
                <button class="fmt-btn" data-cmd="italic" title="斜体 (Ctrl+I)"><i>I</i></button>
                <span class="fmt-sep"></span>
                <button class="fmt-btn" data-cmd="h2" title="标题 2">H2</button>
                <button class="fmt-btn" data-cmd="h3" title="标题 3">H3</button>
                <span class="fmt-sep"></span>
                <button class="fmt-btn" data-cmd="insertUnorderedList" title="无序列表">&#8226;</button>
                <button class="fmt-btn" data-cmd="insertOrderedList" title="有序列表">1.</button>
                <button class="fmt-btn" data-cmd="blockquote" title="引用">&gt;</button>
                <button class="fmt-btn" data-cmd="codeBlock" title="代码块">&lt;/&gt;</button>
                <button class="fmt-btn" data-cmd="link" title="链接">&#128279;</button>
                <span class="fmt-sep"></span>
                <div class="color-picker-wrapper" id="color-picker-wrapper">
                  <button class="fmt-btn color-apply-btn" id="btn-color-apply" title="应用当前颜色">
                    <span id="color-btn-indicator">A</span>
                  </button>
                  <button class="fmt-btn color-dropdown-btn" id="btn-color-dropdown" title="选择颜色">
                    <svg width="7" height="4" viewBox="0 0 7 4" fill="currentColor"><path d="M0 0l3.5 4L7 0H0z"/></svg>
                  </button>
                  <div id="color-panel" class="color-panel hidden">
                    <div class="color-swatches">
                      <button class="color-swatch" data-color="#f44336" style="background:#f44336" title="红色"></button>
                      <button class="color-swatch" data-color="#e91e63" style="background:#e91e63" title="粉红"></button>
                      <button class="color-swatch" data-color="#9c27b0" style="background:#9c27b0" title="紫色"></button>
                      <button class="color-swatch" data-color="#3f51b5" style="background:#3f51b5" title="靛蓝"></button>
                      <button class="color-swatch" data-color="#2196f3" style="background:#2196f3" title="蓝色"></button>
                      <button class="color-swatch" data-color="#00bcd4" style="background:#00bcd4" title="青色"></button>
                      <button class="color-swatch" data-color="#4caf50" style="background:#4caf50" title="绿色"></button>
                      <button class="color-swatch" data-color="#ff9800" style="background:#ff9800" title="橙色"></button>
                      <button class="color-swatch" data-color="#ff5722" style="background:#ff5722" title="深橙"></button>
                      <button class="color-swatch" data-color="#795548" style="background:#795548" title="棕色"></button>
                      <button class="color-swatch" data-color="#607d8b" style="background:#607d8b" title="蓝灰"></button>
                      <button class="color-swatch" data-color="#000000" style="background:#000000" title="黑色"></button>
                    </div>
                    <div class="color-custom-row">
                      <label class="color-custom-label" title="自定义颜色">
                        <input type="color" id="custom-color-input" value="#e53935">
                        <span>自定义</span>
                      </label>
                      <button id="btn-clear-color">清除</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="toolbar-right">
                <button class="toolbar-btn" id="btn-translate" title="翻译为中文">翻译</button>
                <button class="toolbar-btn" id="btn-source" title="源码模式 (Ctrl+E)">源码</button>
                <button class="toolbar-btn" id="btn-save-draft" title="保存草稿 (Ctrl+S)">保存草稿</button>
                <button class="toolbar-btn" id="btn-export" title="导出 .md 文件">导出</button>
              </div>
            </header>
            <main id="content-area">
              <div id="wysiwyg-container">
                <div id="preview-content" contenteditable="true" spellcheck="false"></div>
              </div>
              <div id="source-container" class="hidden">
                <textarea id="source-textarea" spellcheck="false"></textarea>
              </div>
            </main>
            <footer id="status-bar">
              <span id="status-info"></span>
            </footer>
          </div>
        </div>
      </div>
    `;

    // Immediately apply saved tab state so there is no outline→files flash during async init
    const savedTab = sessionStorage.getItem('mdease-active-tab') || 'outline';
    if (savedTab !== 'outline') {
      document.querySelector('.sidebar-tab[data-tab="outline"]')?.classList.remove('active');
      document.querySelector(`.sidebar-tab[data-tab="${savedTab}"]`)?.classList.add('active');
      document.getElementById('panel-files')?.classList.toggle('hidden', savedTab !== 'files');
      document.getElementById('panel-outline')?.classList.add('hidden');
      document.getElementById('btn-toggle-filter')?.classList.add('disabled');
    }
  }

  // ========== Render Preview ==========
  function renderPreview(markdown) {
    const content = markdown || state.currentContent;
    state.tocItems = [];
    state.wysiwygDirty = false;

    // Strip <style> and <script> tags to prevent content CSS from leaking into sidebar/toolbar
    let html = marked.parse(content);
    html = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
    const previewEl = document.getElementById('preview-content');
    if (previewEl) {
      previewEl.innerHTML = html;
    }

    generateTOC();
    updateStatusBar(content);
  }

  // ========== Generate TOC ==========
  function generateTOC() {
    const container = document.getElementById('toc-list');
    if (!container) return;

    container.innerHTML = '';

    if (state.tocItems.length === 0) {
      container.innerHTML = '<li class="toc-empty">暂无标题</li>';
      return;
    }

    const minLevel = Math.min(...state.tocItems.map((h) => h.level));

    state.tocItems.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'toc-item toc-level-' + item.level;
      li.style.paddingLeft = (item.level - minLevel) * 16 + 12 + 'px';
      // Strip HTML from item.text to prevent nested <a> tags rendering as blue links
      const a = document.createElement('a');
      a.href = '#' + item.slug;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = item.text;
      a.textContent = tempDiv.textContent;
      li.appendChild(a);
      container.appendChild(li);
    });
  }

  // ========== Update Status Bar ==========
  function updateStatusBar(content) {
    const el = document.getElementById('status-info');
    if (!el) return;
    const text = content || state.currentContent || '';
    const chars = text.length;
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = text
      .replace(/[\u4e00-\u9fff]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    const totalWords = cjk + words;
    const readMin = Math.max(1, Math.ceil(totalWords / 300));
    el.textContent = `${chars} 字符 | ${totalWords} 词 | 约 ${readMin} 分钟阅读` + (state.isTranslated ? ' | 已翻译' : '');
  }

  // ========== Mode Switching ==========
  function switchToWysiwyg() {
    state.mode = 'wysiwyg';
    const sourceEl = document.getElementById('source-textarea');
    if (sourceEl && !sourceEl.classList.contains('hidden')) {
      state.currentContent = sourceEl.value;
    }
    const contentToRender = state.isTranslated ? state.translatedMarkdown : state.currentContent;
    renderPreview(contentToRender);

    document.getElementById('wysiwyg-container').classList.remove('hidden');
    document.getElementById('source-container').classList.add('hidden');
    document.getElementById('format-toolbar').classList.remove('disabled');
    document.getElementById('btn-source').classList.remove('active');
    document.getElementById('btn-source').textContent = '源码';
  }

  function switchToSource() {
    state.mode = 'source';
    if (!state.wysiwygDirty) {
      // currentContent is already the source markdown
    } else {
      const previewEl = document.getElementById('preview-content');
      if (previewEl) {
        state.currentContent = turndownService.turndown(previewEl.innerHTML);
      }
    }

    const contentToUse = state.isTranslated ? state.translatedMarkdown : state.currentContent;
    const sourceEl = document.getElementById('source-textarea');
    if (sourceEl) {
      sourceEl.value = contentToUse;
    }

    document.getElementById('wysiwyg-container').classList.add('hidden');
    document.getElementById('source-container').classList.remove('hidden');
    document.getElementById('format-toolbar').classList.add('disabled');
    document.getElementById('btn-source').classList.add('active');
    document.getElementById('btn-source').textContent = '预览';
    sourceEl.focus();

    updateStatusBar(contentToUse);
  }

  function toggleMode() {
    if (state.mode === 'wysiwyg') {
      switchToSource();
    } else {
      switchToWysiwyg();
    }
  }

  // ========== Draft Management ==========
  async function saveCurrentDraft() {
    try {
      let content;
      if (state.mode === 'source') {
        content = document.getElementById('source-textarea').value;
        state.currentContent = content;
      } else {
        const previewEl = document.getElementById('preview-content');
        content = turndownService.turndown(previewEl.innerHTML);
        state.currentContent = content;
      }
      await window.MDEaseDB.saveDraft(state.filePath, content);
      showToast('草稿已保存');
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
    }
  }

  function loadDraftContent(draft) {
    state.currentContent = draft.content;
    if (state.mode === 'source') {
      document.getElementById('source-textarea').value = draft.content;
      updateStatusBar(draft.content);
    } else {
      renderPreview(draft.content);
    }
    showToast('草稿已加载');
  }

  async function checkForDraft() {
    try {
      const has = await window.MDEaseDB.hasDraft(state.filePath);
      if (has) {
        const draft = await window.MDEaseDB.loadDraft(state.filePath);
        const timeStr = new Date(draft.lastModified).toLocaleString('zh-CN');
        showToast(`发现草稿 (${timeStr})`, 'info', {
          actionText: '加载草稿',
          actionCallback: () => loadDraftContent(draft),
        });
      }
    } catch {
      // IndexedDB not available
    }
  }

  // ========== Export ==========
  function exportAsMd() {
    let content;
    if (state.mode === 'source') {
      content = document.getElementById('source-textarea').value;
    } else {
      const previewEl = document.getElementById('preview-content');
      content = turndownService.turndown(previewEl.innerHTML);
    }

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('文件已导出');
  }

  // ========== Toast System ==========
  function showToast(message, type = 'success', options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    let html = '<span class="toast-message">' + message + '</span>';
    if (options.actionText) {
      html += '<button class="toast-action">' + options.actionText + '</button>';
    }
    toast.innerHTML = html;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    if (options.actionText && options.actionCallback) {
      toast.querySelector('.toast-action').addEventListener('click', () => {
        options.actionCallback();
        removeToast(toast);
      });
    }

    setTimeout(() => removeToast(toast), 5000);
  }

  function removeToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    toast.addEventListener('transitionend', () => toast.remove());
  }

  // ========== Translation ==========
  function showApiKeyDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.innerHTML =
      '<div class="settings-dialog">' +
        '<h3>翻译设置</h3>' +
        '<p>请输入智谱AI API Key（<a href="https://open.bigmodel.cn/usercenter/apikeys" target="_blank">获取API Key</a>）</p>' +
        '<input type="password" id="api-key-input" placeholder="请输入 API Key..." />' +
        '<div class="settings-actions">' +
          '<button class="toolbar-btn" id="btn-settings-cancel">取消</button>' +
          '<button class="toolbar-btn" id="btn-settings-save">保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    chrome.runtime.sendMessage({ type: 'getApiKey' }, (resp) => {
      const input = document.getElementById('api-key-input');
      if (input && resp && resp.apiKey) input.value = resp.apiKey;
    });

    document.getElementById('btn-settings-cancel').onclick = () => overlay.remove();
    document.getElementById('btn-settings-save').onclick = () => {
      const key = document.getElementById('api-key-input').value.trim();
      if (!key) { showToast('请输入 API Key', 'error'); return; }
      chrome.runtime.sendMessage({ type: 'setApiKey', apiKey: key }, () => {
        showToast('API Key 已保存');
        overlay.remove();
      });
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  async function handleTranslate() {
    const btn = document.getElementById('btn-translate');
    if (!btn) return;

    // Check if extension context is still valid (e.g. after extension reload)
    if (!chrome.runtime?.id) {
      showToast('扩展已更新，请刷新页面后重试', 'error');
      return;
    }

    // Toggle back to original
    if (state.isTranslated) {
      state.isTranslated = false;
      btn.textContent = '翻译';
      btn.title = '翻译为中文';
      btn.classList.remove('active');

      if (state.mode === 'source') {
        document.getElementById('source-textarea').value = state.currentContent;
      } else {
        renderPreview(state.currentContent);
      }
      return;
    }

    // Check API key
    let apiKey;
    try {
      const keyResp = await chrome.runtime.sendMessage({ type: 'getApiKey' });
      apiKey = keyResp && keyResp.apiKey;
    } catch {
      showToast('扩展已更新，请刷新页面后重试', 'error');
      return;
    }
    if (!apiKey) {
      showApiKeyDialog();
      return;
    }

    // Get current markdown
    let markdown;
    if (state.mode === 'source') {
      markdown = document.getElementById('source-textarea').value;
    } else if (state.wysiwygDirty) {
      markdown = turndownService.turndown(document.getElementById('preview-content').innerHTML);
    } else {
      markdown = state.currentContent;
    }

    // 缓存命中：原文未变，直接复用上次翻译
    if (state.translatedMarkdown && markdown === state.translatedSourceMarkdown) {
      state.isTranslated = true;
      btn.textContent = '原文';
      btn.title = '查看原文';
      btn.classList.add('active');
      if (state.mode === 'source') {
        document.getElementById('source-textarea').value = state.translatedMarkdown;
      } else {
        renderPreview(state.translatedMarkdown);
      }
      showToast('已加载翻译缓存');
      return;
    }

    // Loading state
    state.isTranslating = true;
    btn.textContent = '翻译中...';
    btn.disabled = true;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'translateMarkdown',
        markdown: markdown,
        apiKey: apiKey,
      });

      if (resp && resp.success) {
        state.translatedMarkdown = resp.translated;
        state.translatedSourceMarkdown = markdown;
        state.isTranslated = true;
        window.MDEaseDB.saveTranslation(state.filePath, markdown, resp.translated).catch(() => {});
        btn.textContent = '原文';
        btn.title = '查看原文';
        btn.classList.add('active');

        if (state.mode === 'source') {
          document.getElementById('source-textarea').value = resp.translated;
        } else {
          renderPreview(resp.translated);
        }
        showToast('翻译完成');
      } else {
        throw new Error(resp ? resp.error : '翻译失败');
      }
    } catch (err) {
      showToast('翻译失败: ' + err.message, 'error');
      btn.textContent = '翻译';
    } finally {
      state.isTranslating = false;
      btn.disabled = false;
    }
  }

  // ========== Format Toolbar ==========
  function setupFormatToolbar() {
    document.getElementById('format-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn || document.getElementById('format-toolbar').classList.contains('disabled')) return;

      const cmd = btn.dataset.cmd;
      switch (cmd) {
        case 'bold':
          document.execCommand('bold');
          break;
        case 'italic':
          document.execCommand('italic');
          break;
        case 'h2':
          document.execCommand('formatBlock', false, '<h2>');
          break;
        case 'h3':
          document.execCommand('formatBlock', false, '<h3>');
          break;
        case 'insertUnorderedList':
          document.execCommand('insertUnorderedList');
          break;
        case 'insertOrderedList':
          document.execCommand('insertOrderedList');
          break;
        case 'blockquote':
          document.execCommand('formatBlock', false, '<blockquote>');
          break;
        case 'codeBlock':
          insertCodeBlock();
          break;
        case 'link':
          insertLink();
          break;
      }
    });
  }

  function applyTextColor(color) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    let ancestor = range.commonAncestorContainer;
    while (ancestor && ancestor.id !== 'preview-content') {
      if (ancestor.nodeName === 'PRE' || ancestor.nodeName === 'CODE') {
        showToast('代码块内不支持颜色标注', 'error');
        return;
      }
      ancestor = ancestor.parentNode;
    }
    const probe = range.cloneContents();
    if (probe.querySelector('p,h1,h2,h3,h4,h5,h6,table,thead,tbody,tfoot,tr,th,td,ul,ol,li,blockquote,pre,div')) {
      showToast('请在单个段落内选择文字后再标色', 'error');
      return;
    }
    const span = document.createElement('span');
    span.style.color = color;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    state.wysiwygDirty = true;
    document.getElementById('color-btn-indicator').style.borderBottomColor = color;
  }

  function clearTextColor() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const previewEl = document.getElementById('preview-content');
    previewEl.querySelectorAll('span[style]').forEach((span) => {
      if (span.style.color && selection.containsNode(span, true)) {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
      }
    });
    state.wysiwygDirty = true;
  }

  function setupColorPicker() {
    const wrapper = document.getElementById('color-picker-wrapper');
    const panel = document.getElementById('color-panel');
    const applyBtn = document.getElementById('btn-color-apply');
    const dropBtn = document.getElementById('btn-color-dropdown');
    const customInput = document.getElementById('custom-color-input');
    const clearBtn = document.getElementById('btn-clear-color');
    const indicator = document.getElementById('color-btn-indicator');

    let currentColor = '#e53935';
    let savedRange = null;

    function setCurrentColor(color) {
      currentColor = color;
      indicator.style.borderBottomColor = color;
      customInput.value = color;
      chrome.storage.local.set({ 'mdease-custom-color': color });
    }

    function restoreRange() {
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }

    // Init: load saved color
    chrome.storage.local.get('mdease-custom-color', (result) => {
      if (result['mdease-custom-color']) setCurrentColor(result['mdease-custom-color']);
    });

    // Apply button: mousedown prevents focus steal so selection stays intact
    applyBtn.addEventListener('mousedown', (e) => e.preventDefault());
    applyBtn.addEventListener('click', () => applyTextColor(currentColor));

    // Dropdown button: save range + toggle panel
    dropBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
      panel.classList.toggle('hidden');
    });

    panel.addEventListener('mousedown', (e) => e.preventDefault());

    panel.querySelectorAll('.color-swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        restoreRange();
        setCurrentColor(swatch.dataset.color);
        applyTextColor(currentColor);
        panel.classList.add('hidden');
        savedRange = null;
      });
    });

    customInput.addEventListener('change', () => {
      restoreRange();
      setCurrentColor(customInput.value);
      applyTextColor(currentColor);
      panel.classList.add('hidden');
      savedRange = null;
    });

    clearBtn.addEventListener('click', () => {
      restoreRange();
      clearTextColor();
      panel.classList.add('hidden');
      savedRange = null;
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) panel.classList.add('hidden');
    });
  }

  function insertCodeBlock() {
    const selection = window.getSelection();
    const text = selection.toString() || 'code here';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'hljs';
    code.textContent = text;
    pre.appendChild(code);

    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(pre);
      range.setStartAfter(pre);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function insertLink() {
    const selection = window.getSelection();
    const text = selection.toString() || 'link text';
    const url = prompt('请输入链接地址:', 'https://');
    if (url === null) return;

    const a = document.createElement('a');
    a.href = url;
    a.textContent = text;

    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(a);
      range.setStartAfter(a);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  // ========== WYSIWYG Listeners ==========
  function setupWysiwygListeners() {
    const previewEl = document.getElementById('preview-content');
    let debounceTimer = null;

    previewEl.addEventListener('input', () => {
      state.wysiwygDirty = true;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        rebuildTOCFromDOM();
        const md = turndownService.turndown(previewEl.innerHTML);
        updateStatusBar(md);
      }, 300);
    });

    previewEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '    ');
      }
    });

    previewEl.addEventListener('paste', (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      const text = clipboardData.getData('text/plain');
      if (text.includes('\t') || text.includes('```') || /^ {4}/m.test(text)) {
        e.preventDefault();
        document.execCommand('insertText', false, text);
      }
    });
  }

  function rebuildTOCFromDOM() {
    const previewEl = document.getElementById('preview-content');
    if (!previewEl) return;

    state.tocItems = [];
    previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
      const clone = heading.cloneNode(true);
      clone.querySelectorAll('.heading-anchor').forEach((a) => a.remove());
      const text = clone.textContent.trim();
      const slug = slugify(text);
      if (!heading.id) heading.id = slug;
      state.tocItems.push({
        level: parseInt(heading.tagName[1]),
        text,
        slug: heading.id,
      });
    });
    generateTOC();
  }

  // ========== Source Editor Listeners ==========
  function setupSourceListeners() {
    const sourceEl = document.getElementById('source-textarea');
    let debounceTimer = null;

    sourceEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.currentContent = sourceEl.value;
        updateStatusBar(state.currentContent);
      }, 200);
    });

    sourceEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = sourceEl.selectionStart;
        const end = sourceEl.selectionEnd;
        sourceEl.value = sourceEl.value.substring(0, start) + '    ' + sourceEl.value.substring(end);
        sourceEl.selectionStart = sourceEl.selectionEnd = start + 4;
      }
    });
  }

  // ========== Scroll Spy ==========
  function setupScrollSpy() {
    const previewEl = document.getElementById('preview-content');
    if (!previewEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            document.querySelectorAll('.toc-item.active').forEach((el) => el.classList.remove('active'));
            const tocLink = document.querySelector('.toc-item a[href="#' + entry.target.id + '"]');
            if (tocLink) {
              tocLink.closest('.toc-item').classList.add('active');
            }
          }
        });
      },
      { root: previewEl, rootMargin: '-80px 0px -80% 0px', threshold: 0 }
    );

    function observeHeadings() {
      previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => observer.observe(h));
    }

    observeHeadings();

    const mo = new MutationObserver(() => observeHeadings());
    mo.observe(previewEl, { childList: true, subtree: true });
  }

  // ========== Keyboard Shortcuts ==========
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentDraft();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        toggleMode();
      }
      if (e.key === 'Escape' && state.mode === 'source') {
        switchToWysiwyg();
      }
    });
  }

  // ========== Event Listeners ==========
  function setupEventListeners() {
    document.getElementById('btn-source').addEventListener('click', toggleMode);
    document.getElementById('btn-translate').addEventListener('click', handleTranslate);
    document.getElementById('btn-save-draft').addEventListener('click', saveCurrentDraft);
    document.getElementById('btn-export').addEventListener('click', exportAsMd);

    // Sidebar toggle
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const btn = document.getElementById('btn-toggle-sidebar');
      const collapsed = sidebar.classList.toggle('collapsed');
      btn.title = collapsed ? '展开侧边栏' : '收起侧边栏';
    });

    setupFormatToolbar();
    setupColorPicker();
    setupWysiwygListeners();
    setupSourceListeners();
    setupKeyboardShortcuts();
    setupFolderPicker();
    setupSidebarTabs();
    setupTocFilter();

    // TOC click → smooth scroll
    document.getElementById('toc-list').addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      e.preventDefault();
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // ========== Sidebar Tab Switching ==========
  function setupSidebarTabs() {
    const filterBtn = document.getElementById('btn-toggle-filter');
    const filterInput = document.getElementById('toc-filter-input');

    document.getElementById('sidebar-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.sidebar-tab[data-tab]');
      if (!tab) return;
      const tabName = tab.dataset.tab;
      sessionStorage.setItem('mdease-active-tab', tabName);
      document.querySelectorAll('.sidebar-tab[data-tab]').forEach((b) => b.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-files').classList.toggle('hidden', tabName !== 'files');
      document.getElementById('panel-outline').classList.toggle('hidden', tabName !== 'outline');

      // 切换到文件 tab 时刷新目录列表
      if (tabName === 'files') {
        autoScanDirectory();
      }

      // 放大镜：文件 tab 时禁用，大纲 tab 时启用
      filterBtn.classList.toggle('disabled', tabName !== 'outline');
      // 切换到文件 tab 时关闭搜索框
      if (tabName !== 'outline') {
        filterInput.classList.add('hidden');
        filterInput.value = '';
        filterTOC('');
        filterBtn.classList.remove('active');
      }
    });
  }

  // ========== TOC Filter ==========
  function setupTocFilter() {
    const input = document.getElementById('toc-filter-input');
    const toggleBtn = document.getElementById('btn-toggle-filter');

    toggleBtn.addEventListener('click', () => {
      if (toggleBtn.classList.contains('disabled')) return;
      const isOpen = !input.classList.contains('hidden');
      input.classList.toggle('hidden', isOpen);
      toggleBtn.classList.toggle('active', !isOpen);
      if (!isOpen) {
        input.value = '';
        input.focus();
        filterTOC('');
      } else {
        input.value = '';
        filterTOC('');
      }
    });

    input.addEventListener('input', () => filterTOC(input.value));
  }

  function filterTOC(keyword) {
    const items = document.querySelectorAll('#toc-list .toc-item');
    const kw = keyword.toLowerCase().trim();
    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.classList.toggle('filtered-out', kw && !text.includes(kw));
    });
  }

  // ========== Init ==========
  async function init() {
    console.log('[MDEase] Initializing on:', state.filePath);

    // 1. Extract markdown
    state.rawMarkdown = extractMarkdown();
    state.currentContent = state.rawMarkdown;

    // 2. Configure parsers
    configureMarked();
    configureTurndown();

    // 3. Build UI
    buildUI();

    // 4. Render preview
    renderPreview(state.currentContent);

    // 5. Load cached file list (with timeout to prevent hanging)
    let hasCache = false;
    try {
      hasCache = await Promise.race([
        loadCachedFileList(),
        new Promise(resolve => setTimeout(() => resolve(false), 3000))
      ]);
    } catch (e) { /* ignore */ }

    // 6. Scan only if no cache (first visit). Subsequent refreshes happen when user opens the files panel.
    if (!hasCache) {
      autoScanDirectory();
    }

    // 7. Check for draft
    await checkForDraft();

    // 8. Load translation cache from IndexedDB
    try {
      const cached = await Promise.race([
        window.MDEaseDB.loadTranslation(state.filePath),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ]);
      if (cached) {
        state.translatedMarkdown = cached.translatedMarkdown;
        state.translatedSourceMarkdown = cached.sourceMarkdown;
      }
    } catch (e) { /* ignore */ }

    // 9. Setup events
    setupEventListeners();

    // 8. Scroll spy
    setupScrollSpy();

    console.log('[MDEase] Ready.');
  }

  init();
})();
