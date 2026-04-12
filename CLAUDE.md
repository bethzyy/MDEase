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
| `content.js` | Single IIFE containing all UI logic, rendering, editing, event handling |
| `background.js` | Service Worker — receives `scanDirectory` messages, opens background tab, extracts .md file links via `chrome.scripting.executeScript` |
| `db.js` | IndexedDB wrapper — two stores: `drafts` (keyPath: path) and `filelists` (keyPath: dirPath) |
| `styles.css` | All styles including highlight.js GitHub Dark theme, CSS custom properties in `:root` |

### Data Flow

```
file:///*.md → Chrome renders <pre> → content.js extractMarkdown()
  → marked.parse() → contenteditable WYSIWYG view
  ↔ (turndown ↔ marked) → source textarea view
  → Ctrl+S → turndown() → IndexedDB draft
  → Export → Blob + <a download>
```

### Directory Scanning (background.js)

Content scripts cannot access `file://` directories (CORS blocks fetch/XHR/iframe). The background service worker bypasses this:
1. `chrome.tabs.create({ url: dirUrl, active: false })` — opens directory in background tab
2. `chrome.scripting.executeScript()` — reads DOM `<a>` links for .md files
3. Closes tab, returns file list to content script via `chrome.runtime.sendMessage`

Init sequence: load IndexedDB cache first (instant) → only scan if no cache (avoids tab flash on every navigation).

### State Management

All state lives in a single `state` object inside content.js's IIFE. Key flags:
- `state.mode` — `'wysiwyg'` or `'source'`
- `state.wysiwygDirty` — prevents unnecessary turndown round-trips (only converts HTML→MD when user actually edited)

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
