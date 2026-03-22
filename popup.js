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

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'activate' });
    window.close();
  } catch (e) {
    // Content script not ready, inject it
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    setTimeout(async () => {
      await chrome.tabs.sendMessage(tab.id, { action: 'activate' });
      window.close();
    }, 100);
  }
});

init();
