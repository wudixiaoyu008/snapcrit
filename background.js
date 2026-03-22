chrome.action.onClicked.addListener(async (tab) => {
  // Try messaging the existing content script first
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'activate' });
    return;
  } catch (_) {}

  // Content script not ready or orphaned — reset and re-inject
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.__feedbackCapture = false;
        const old = document.getElementById('__fc-toolbar-host');
        if (old) old.remove();
      },
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 80));
    await chrome.tabs.sendMessage(tab.id, { action: 'activate' });
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // keep channel open for async response
  }

  if (msg.action === 'openReport') {
    // Store the HTML in local storage, then open the report viewer tab
    const key = 'report_' + Date.now();
    chrome.storage.local.set({ [key]: msg.html }, () => {
      chrome.tabs.create({ url: `report.html?key=${key}` });
    });
  }
});
