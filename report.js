const params = new URLSearchParams(location.search);
const key = params.get('key');

if (!key) {
  document.body.innerHTML = '<p style="padding:2rem;color:#ef4444">No report key provided.</p>';
} else {
  chrome.storage.local.get(key, (result) => {
    const html = result[key];
    chrome.storage.local.remove(key); // clean up immediately after reading

    if (!html) {
      document.body.innerHTML = '<p style="padding:2rem;color:#ef4444">Report data not found. It may have already been loaded.</p>';
      return;
    }

    // Write the full report HTML into this page
    document.open();
    document.write(html);
    document.close();
  });
}
