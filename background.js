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
