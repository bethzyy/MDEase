// background.js - MDEase Service Worker
// Handles directory scanning via chrome.tabs + chrome.scripting

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'scanDirectory') {
    scanDirectory(message.dirUrl)
      .then((files) => sendResponse({ success: true, files }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'translateMarkdown') {
    translateMarkdown(message.markdown, message.apiKey)
      .then((result) => sendResponse({ success: true, translated: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'getApiKey') {
    getApiKey()
      .then((apiKey) => sendResponse({ apiKey }))
      .catch(() => sendResponse({ apiKey: '' }));
    return true;
  }

  if (message.type === 'setApiKey') {
    chrome.storage.local.set({ zhipuApiKey: message.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// ========== Translation via Anthropic-compatible API ==========
async function getApiKey() {
  const stored = await chrome.storage.local.get(['zhipuApiKey']);
  return stored.zhipuApiKey || '';
}
async function translateMarkdown(markdown, apiKey) {
  const systemPrompt =
    'You are a professional translator. Translate the following Markdown document from English to Chinese. Rules:\n' +
    '1. Translate all natural language text (paragraphs, headings, list items, blockquotes, table cells, alt text of images).\n' +
    '2. Do NOT translate code blocks (content inside ``` ... ``` or inline code `...`). Keep them exactly as-is.\n' +
    '3. Do NOT translate URLs, file paths, or HTML tags.\n' +
    '4. Preserve all Markdown formatting exactly (headings, lists, tables, links, images, etc.).\n' +
    '5. Output ONLY the translated Markdown, nothing else. No explanations, no preamble.';

  const response = await fetch('https://open.bigmodel.cn/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'glm-4-flash-250414',
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: markdown }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error('API error ' + response.status + ': ' + errBody);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function scanDirectory(dirUrl) {
  const tab = await chrome.tabs.create({ url: dirUrl, active: false });

  try {
    await waitForTabComplete(tab.id);
    await delay(300); // ensure DOM is rendered

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return Array.from(document.querySelectorAll('a'))
          .map((a) => a.getAttribute('href'))
          .filter(
            (href) =>
              href &&
              /\.(md|markdown|mdown)$/i.test(href) &&
              !href.endsWith('/') &&
              !href.startsWith('../') &&
              !href.startsWith('?')
          )
          .map((href) => decodeURIComponent(href));
      },
    });

    return results[0]?.result || [];
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {}
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 5000);

    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);

    // tab might already be loaded
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
