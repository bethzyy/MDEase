# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MDEase is a Chrome Extension (Manifest V3) that turns Chrome's plain-text `file://` .md viewing into a WYSIWYG Markdown editor. Zero frameworks — vanilla JS + CSS.

## Development Setup

No build step. Load as unpacked extension:

1. Chrome → `chrome://extensions` → enable Developer Mode
2. Click "Load unpacked" → select this project folder
3. **Required**: Enable "Allow access to file URLs" in extension details
4. Open any local `.md` file to test

After code changes, click the refresh icon on the extension card in `chrome://extensions`.

## Architecture

### Load Order (content_scripts)

```
marked.min.js → highlight.min.js → turndown.js → db.js → content.js → styles.css
```

All libs expose global variables: `window.marked`, `window.hljs`, `window.TurndownService`, `window.MDEaseDB`.

### Key Files

| File | Role |
|------|------|
| `content.js` | Single IIFE containing all UI logic, rendering, editing, translation, event handling |
| `background.js` | Service Worker — `scanDirectory` (file tree), `translateMarkdown` (ZhipuAI API via Anthropic-compatible endpoint), `getApiKey`/`setApiKey` (chrome.storage.local) |
| `db.js` | IndexedDB wrapper — two stores: `drafts` (keyPath: path) and `filelists` (keyPath: dirPath) |
| `styles.css` | All styles including highlight.js GitHub Dark theme, CSS custom properties in `:root` |

### Data Flow

```
file:///*.md → Chrome renders <pre> → content.js extractMarkdown()
  → marked.parse() → contenteditable WYSIWYG view
  ↔ (turndown ↔ marked) → source textarea view
  → Ctrl+S → turndown() → IndexedDB draft
  → Export → Blob + <a download>
  → Translate → background.js → ZhipuAI GLM-4-Flash (Anthropic API) → translated markdown
```

### Directory Scanning (background.js)

Content scripts cannot access `file://` directories (CORS blocks fetch/XHR/iframe). The background service worker bypasses this:
1. `chrome.tabs.create({ url: dirUrl, active: false })` — opens directory in background tab
2. `chrome.scripting.executeScript()` — reads DOM `<a>` links for .md files
3. Closes tab, returns file list to content script via `chrome.runtime.sendMessage`

Init sequence: load IndexedDB cache first (instant) → only scan if no cache (avoids tab flash on every navigation).

### Translation (background.js)

Content scripts on `file://` cannot make cross-origin fetch calls (CORS). The background service worker handles API calls:
1. content.js sends `{ type: 'translateMarkdown', markdown, apiKey }` via `chrome.runtime.sendMessage`
2. background.js calls `https://open.bigmodel.cn/api/anthropic/v1/messages` (Anthropic-compatible format)
3. Returns translated markdown to content.js
4. API key stored in `chrome.storage.local`, configured via in-page settings dialog

**Translation cache**: content.js caches the translated result and the source markdown in memory. When toggling between original and translated view, if the source content hasn't changed, the cached translation is reused (no API call). Cache invalidates when: (a) user edits content, (b) page is refreshed.

### State Management

All state lives in a single `state` object inside content.js's IIFE. Key flags:
- `state.mode` — `'wysiwyg'` or `'source'`
- `state.wysiwygDirty` — prevents unnecessary turndown round-trips (only converts HTML→MD when user actually edited)
- `state.isTranslated` — whether currently viewing translated content
- `state.translatedMarkdown` — cached translation result
- `state.translatedSourceMarkdown` — source markdown used for last translation (enables cache reuse when toggling original/translated without re-calling API)

### Layout Structure

```
#mdease-app (flex row)
├── #sidebar (flex column, full height)
│   ├── #sidebar-tabs (folder / outline / search icons)
│   └── .sidebar-panel (#panel-files or #panel-outline)
└── #content-wrapper (flex column)
    ├── #toolbar (format buttons + sidebar toggle)
    ├── #content-area (wysiwyg or source)
    └── #status-bar (chars, words, read time)
```

## file:// Protocol Constraints

- **No CDN** — all libs must be bundled locally in `lib/`
- **No directory enumeration from content script** — must go through background.js
- **URL construction** — use `new URL(href, dirUrl).href`, never manual string concatenation
- **File paths** — use `decodeURIComponent()` when displaying filenames from `file://` URLs

## User Preferences

- Communicate in Chinese
- Use `/bug-retro` skill for experience accumulation after bug fixes
