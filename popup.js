const btn = document.getElementById('btn-main');
const status = document.getElementById('status');

async function init() {
  const result = await chrome.storage.session.get('fc_active');
  if (result.fc_active) {
    btn.textContent = 'Already active';
    btn.className = 'btn btn-deactivate';
    status.innerHTML = '<span class="dot"></span>Toolbar is visible on the page';
  }
}

btn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const result = await chrome.storage.session.get('fc_active');
  if (result.fc_active) {
    window.close();
    return;
  }

  // Step 1: try messaging the existing content script
  let activated = false;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'activate' });
    if (response?.ok) activated = true;
  } catch (_) {
    // Content script not responding — extension may have been reloaded
    // or content script wasn't injected yet on this page
  }

  if (!activated) {
    // Step 2: reset stale state from old content script (if extension was reloaded),
    // then inject a fresh copy of content.js
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Clear the guard flag so the new injection doesn't bail out
          window.__feedbackCapture = false;
          // Remove stale toolbar left by the old content script
          const old = document.getElementById('__fc-toolbar-host');
          if (old) old.remove();
        },
      });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });

      await new Promise((r) => setTimeout(r, 80));

      await chrome.tabs.sendMessage(tab.id, { action: 'activate' });
      activated = true;
    } catch (e) {
      status.textContent = "Can't activate on this page.";
      status.style.color = '#ef4444';
      return;
    }
  }

  window.close();
});

init();
