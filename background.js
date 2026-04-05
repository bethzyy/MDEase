// background.js - MDEase Service Worker
// Handles directory scanning via chrome.tabs + chrome.scripting

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'scanDirectory') {
    scanDirectory(message.dirUrl)
      .then((files) => sendResponse({ success: true, files }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

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
