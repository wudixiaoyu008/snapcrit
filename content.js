(function () {
  'use strict';

  if (window.__feedbackCapture) return;
  window.__feedbackCapture = true;

  const STORAGE_KEY = 'fc_notes';
  const ACTIVE_KEY = 'fc_active';

  let isActive = false;
  let mode = 'idle'; // 'idle' | 'select-element' | 'full-page'
  let selectListenersActive = false;
  let toolbarHost = null;
  let toolbarShadow = null;
  let popupHost = null;
  let popupShadow = null;
  let highlightEl = null;
  let pendingScreenshot = null;
  let localNotes = []; // in-memory primary store, persisted to session storage for cross-page

  // Auto-activate if session is marked active (user navigated to a new page)
  // Guard against orphaned content scripts (extension reloaded, storage blocked)
  try {
    chrome.storage.session.get(ACTIVE_KEY, (result) => {
      if (chrome.runtime.lastError) return; // orphaned context, ignore silently
      if (result && result[ACTIVE_KEY]) activate();
    });
  } catch (_) { /* extension context invalid */ }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'activate') {
      activate();
      sendResponse({ ok: true });
    }
  });

  // ─── Activation ────────────────────────────────────────────────────────────

  async function activate() {
    if (isActive) return;
    isActive = true;
    try { chrome.storage.session.set({ [ACTIVE_KEY]: true }); } catch (_) {}
    // Sync notes from previous pages in this session
    localNotes = await getStoredNotes();
    injectToolbar();
    updateNoteCount(localNotes.length);
  }

  function deactivate() {
    if (selectListenersActive) removeSelectListeners();
    removeNotePopup();
    removeHighlight();
    if (toolbarHost) { toolbarHost.remove(); toolbarHost = null; toolbarShadow = null; }
    document.body.style.cursor = '';
    mode = 'idle';
    selectListenersActive = false;
    isActive = false;
    localNotes = [];
    window.__feedbackCapture = false;
    try { chrome.storage.session.remove([ACTIVE_KEY, STORAGE_KEY]); } catch (_) {}
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  function injectToolbar() {
    toolbarHost = document.createElement('div');
    toolbarHost.id = '__fc-toolbar-host';
    Object.assign(toolbarHost.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      pointerEvents: 'none',
    });

    toolbarShadow = toolbarHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = getToolbarCSS();
    toolbarShadow.appendChild(style);

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.style.pointerEvents = 'auto';
    toolbar.innerHTML = `
      <button class="btn mode-btn" id="btn-select">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1.5 1.5l4 9.5 1.8-4.2 4.2-1.8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        Select Element
      </button>
      <button class="btn mode-btn" id="btn-fullpage">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1.5" y="1.5" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M6.5 4v5M4 6.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        Full Page
      </button>
      <div class="sep"></div>
      <span class="count" id="note-count">0 notes</span>
      <div class="sep"></div>
      <button class="btn export-btn" id="btn-export">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1.5v7M4 6l2.5 2.5L9 6M2 10v1.5a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Export
      </button>
      <button class="btn exit-btn" id="btn-exit">Exit</button>
    `;

    toolbarShadow.appendChild(toolbar);
    document.body.appendChild(toolbarHost);

    toolbarShadow.getElementById('btn-select').addEventListener('click', () => toggleMode('select-element'));
    toolbarShadow.getElementById('btn-fullpage').addEventListener('click', () => toggleMode('full-page'));
    toolbarShadow.getElementById('btn-export').addEventListener('click', handleExport);
    toolbarShadow.getElementById('btn-exit').addEventListener('click', deactivate);
  }

  function getToolbarCSS() {
    return `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      .toolbar {
        display: flex; align-items: center; gap: 3px;
        background: rgba(255,255,255,0.97);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; padding: 5px 6px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; color: #18181b; white-space: nowrap; user-select: none;
      }
      .btn {
        display: flex; align-items: center; gap: 5px; padding: 5px 10px;
        border: none; border-radius: 7px; background: transparent; color: #18181b;
        font-size: 13px; font-family: inherit; cursor: pointer;
        transition: background 0.1s; outline: none; line-height: 1;
      }
      .btn:hover { background: rgba(0,0,0,0.06); }
      .btn:active { background: rgba(0,0,0,0.09); }
      .mode-btn.active { background: rgba(37,99,235,0.09); color: #2563eb; font-weight: 500; }
      .export-btn { background: #18181b; color: #fff; font-weight: 500; }
      .export-btn:hover { background: #27272a; }
      .exit-btn { color: #71717a; }
      .sep { width: 1px; height: 16px; background: rgba(0,0,0,0.09); margin: 0 2px; }
      .count { font-size: 12px; color: #71717a; padding: 0 4px; min-width: 46px; text-align: center; }
    `;
  }

  // ─── Mode ──────────────────────────────────────────────────────────────────

  function toggleMode(newMode) {
    setMode(mode === newMode ? 'idle' : newMode);
  }

  function setMode(newMode) {
    // Clean up current mode first
    if (selectListenersActive) removeSelectListeners();
    removeNotePopup();
    removeHighlight();

    mode = newMode;
    updateModeButtons();

    if (mode === 'select-element') {
      addSelectListeners();
    } else if (mode === 'full-page') {
      triggerFullPageCapture();
    }
  }

  function updateModeButtons() {
    if (!toolbarShadow) return;
    const sBtn = toolbarShadow.getElementById('btn-select');
    const fBtn = toolbarShadow.getElementById('btn-fullpage');
    if (sBtn) sBtn.classList.toggle('active', mode === 'select-element');
    if (fBtn) fBtn.classList.toggle('active', mode === 'full-page');
  }

  function addSelectListeners() {
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onElementClick, true);
    document.body.style.cursor = 'crosshair';
    selectListenersActive = true;
  }

  function removeSelectListeners() {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onElementClick, true);
    document.body.style.cursor = '';
    selectListenersActive = false;
  }

  // ─── Element picker ────────────────────────────────────────────────────────

  function onMouseOver(e) {
    if (isOwnEl(e.target)) return;
    showHighlight(e.target.getBoundingClientRect());
  }

  function onMouseOut(e) {
    if (isOwnEl(e.target)) return;
    removeHighlight();
  }

  function onElementClick(e) {
    if (isOwnEl(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    triggerElementCapture(e.target);
  }

  function isOwnEl(el) {
    return el === toolbarHost || el === popupHost || el === highlightEl;
  }

  // ─── Highlight ─────────────────────────────────────────────────────────────

  // Accepts a DOMRect or plain {top, left, width, height} object
  function showHighlight(rect) {
    if (!highlightEl) {
      highlightEl = document.createElement('div');
      highlightEl.id = '__fc-highlight';
      Object.assign(highlightEl.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483646',
        border: '2px solid #2563eb',
        background: 'rgba(37,99,235,0.05)',
        boxShadow: '0 0 0 3px rgba(37,99,235,0.12)',
        borderRadius: '2px',
      });
      document.body.appendChild(highlightEl);
    }
    Object.assign(highlightEl.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      display: 'block',
    });
  }

  function removeHighlight() {
    if (highlightEl) highlightEl.style.display = 'none';
  }

  // ─── Capture ───────────────────────────────────────────────────────────────

  async function triggerElementCapture(el) {
    // Pause hover/click listeners during capture — but keep mode = 'select-element'
    // so we can resume after the popup is dismissed
    removeSelectListeners();
    removeHighlight();

    const rect = el.getBoundingClientRect();
    const screenshot = await captureAndCrop(rect);
    pendingScreenshot = screenshot;

    // Show the selected element highlighted while popup is open
    showHighlight(rect);

    showNotePopup(rect, false, function onDismiss() {
      removeHighlight();
      // Resume select-element mode if it's still the active mode
      if (mode === 'select-element') {
        addSelectListeners();
      }
    });
  }

  async function triggerFullPageCapture() {
    const rect = { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };

    const screenshot = await captureAndCrop(rect);
    pendingScreenshot = screenshot;

    // Show viewport highlight while popup is open
    showHighlight(rect);

    showNotePopup(null, true, function onDismiss() {
      removeHighlight();
      // Full page is one-shot: return to idle after dismiss
      mode = 'idle';
      updateModeButtons();
    });
  }

  async function captureAndCrop(rect) {
    // Hide extension UI before capture so it doesn't appear in the screenshot
    if (toolbarHost) toolbarHost.style.visibility = 'hidden';
    if (highlightEl) highlightEl.style.display = 'none';
    if (popupHost) popupHost.style.visibility = 'hidden';

    await sleep(60);

    const dataUrl = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'captureTab' }, (res) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(res?.dataUrl || null);
      });
    });

    // Restore UI
    if (toolbarHost) toolbarHost.style.visibility = '';
    if (popupHost) popupHost.style.visibility = '';

    if (!dataUrl) return null;
    return cropImage(dataUrl, rect);
  }

  function cropImage(dataUrl, rect) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          Math.round(rect.left * dpr), Math.round(rect.top * dpr),
          Math.round(rect.width * dpr), Math.round(rect.height * dpr),
          0, 0, canvas.width, canvas.height
        );
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // ─── Note popup ────────────────────────────────────────────────────────────

  function showNotePopup(rect, isFullPage, onDismiss) {
    removeNotePopup();

    popupHost = document.createElement('div');
    popupHost.id = '__fc-popup-host';

    const W = 264, H = 154, MARGIN = 10;
    let top, left;

    if (isFullPage || !rect) {
      top = window.innerHeight / 2 - H / 2;
      left = window.innerWidth / 2 - W / 2;
    } else {
      // Prefer below element; fall back to above if not enough space
      top = rect.bottom + MARGIN + H < window.innerHeight
        ? rect.bottom + MARGIN
        : rect.top - H - MARGIN;
      top = Math.max(MARGIN, Math.min(top, window.innerHeight - H - MARGIN));
      left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - W - MARGIN));
    }

    Object.assign(popupHost.style, {
      position: 'fixed',
      top: top + 'px',
      left: left + 'px',
      width: W + 'px',
      zIndex: '2147483647',
    });

    popupShadow = popupHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = getPopupCSS();
    popupShadow.appendChild(style);

    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
      <div class="popup-header">
        <span class="label">${isFullPage ? 'Full page' : 'Element'}</span>
        <button class="close-btn" id="btn-close" title="Cancel">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <textarea class="textarea" id="note-input" placeholder="Add feedback or note…"></textarea>
      <div class="popup-footer">
        <span class="hint">⌘↵ to save</span>
        <button class="save-btn" id="btn-save">Save</button>
      </div>
    `;
    popupShadow.appendChild(popup);
    document.body.appendChild(popupHost);

    const textarea = popupShadow.getElementById('note-input');
    textarea.focus();

    const dismiss = (doSave) => {
      const val = textarea.value.trim();
      if (doSave && val) {
        saveNote(val, onDismiss);
      } else {
        removeNotePopup();
        if (onDismiss) onDismiss();
      }
    };

    popupShadow.getElementById('btn-save').addEventListener('click', () => dismiss(true));
    popupShadow.getElementById('btn-close').addEventListener('click', () => dismiss(false));
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) dismiss(true);
      if (e.key === 'Escape') dismiss(false);
    });
  }

  function getPopupCSS() {
    return `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      .popup {
        background: #fff; border: 1px solid rgba(0,0,0,0.10); border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; overflow: hidden;
      }
      .popup-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 9px 12px 7px; border-bottom: 1px solid rgba(0,0,0,0.06);
      }
      .label { font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; }
      .close-btn {
        display: flex; align-items: center; justify-content: center;
        width: 20px; height: 20px; border: none; background: none;
        color: #a1a1aa; cursor: pointer; border-radius: 4px; padding: 0;
      }
      .close-btn:hover { background: rgba(0,0,0,0.06); color: #18181b; }
      .textarea {
        width: 100%; padding: 10px 12px; border: none; outline: none; resize: none;
        font-family: inherit; font-size: 13px; color: #18181b; line-height: 1.5;
        background: #fff; height: 72px;
      }
      .popup-footer {
        display: flex; align-items: center; justify-content: space-between;
        padding: 7px 12px; border-top: 1px solid rgba(0,0,0,0.06);
      }
      .hint { font-size: 11px; color: #a1a1aa; }
      .save-btn {
        background: #18181b; color: #fff; border: none; border-radius: 6px;
        padding: 5px 14px; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer;
      }
      .save-btn:hover { background: #27272a; }
    `;
  }

  function removeNotePopup() {
    if (popupHost) { popupHost.remove(); popupHost = null; popupShadow = null; }
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  function saveNote(noteText, onDone) {
    removeNotePopup();
    localNotes.push({
      url: window.location.href,
      pageTitle: document.title,
      screenshot: pendingScreenshot,
      note: noteText,
      timestamp: Date.now(),
    });
    // Persist async for cross-page access — don't block on it
    try { chrome.storage.session.set({ [STORAGE_KEY]: localNotes }); } catch (_) {}
    pendingScreenshot = null;
    updateNoteCount(localNotes.length);
    if (onDone) onDone();
  }

  function getStoredNotes() {
    return new Promise((resolve) => {
      try {
        chrome.storage.session.get(STORAGE_KEY, (r) => {
          if (chrome.runtime.lastError) { resolve([]); return; }
          resolve((r && r[STORAGE_KEY]) || []);
        });
      } catch (_) { resolve([]); }
    });
  }

  function updateNoteCount(count) {
    if (!toolbarShadow) return;
    const el = toolbarShadow.getElementById('note-count');
    if (el) el.textContent = count + (count === 1 ? ' note' : ' notes');
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  function handleExport() {
    if (!localNotes.length) {
      if (toolbarShadow) {
        const el = toolbarShadow.getElementById('note-count');
        if (el) {
          const prev = el.textContent;
          el.textContent = 'No notes yet';
          el.style.color = '#ef4444';
          setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 2000);
        }
      }
      return;
    }
    const html = buildReport(localNotes);
    const filename = `feedback-${new Date().toISOString().slice(0, 10)}.html`;
    // Route through background: blob URLs can't cross content script → service worker contexts
    chrome.runtime.sendMessage({ action: 'openReport', html, filename });
  }

  function buildReport(notes) {
    const grouped = {};
    for (const n of notes) {
      if (!grouped[n.url]) grouped[n.url] = { title: n.pageTitle, items: [] };
      grouped[n.url].items.push(n);
    }

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const total = notes.length;

    // Plain table layout — pastes cleanly into Google Docs
    const sections = Object.entries(grouped).map(([url, { title, items }]) => {
      const rows = items.map((n, i) => `
        <tr>
          <td style="width:50%;padding:12px;border:1px solid #d1d5db;vertical-align:top;background:#f9fafb;">
            ${n.screenshot
              ? `<img src="${n.screenshot}" alt="Capture ${i + 1}" style="width:100%;height:auto;display:block;" />`
              : '<span style="font-size:12px;color:#9ca3af;">No capture</span>'}
          </td>
          <td style="width:50%;padding:16px;border:1px solid #d1d5db;vertical-align:top;font-size:14px;line-height:1.6;color:#111827;">
            <span style="display:inline-block;width:20px;height:20px;background:#111827;color:#fff;border-radius:50%;font-size:11px;font-weight:700;text-align:center;line-height:20px;margin-right:8px;">${i + 1}</span>${esc(n.note)}
          </td>
        </tr>`).join('');

      return `
        <p style="margin:32px 0 6px;font-size:15px;font-weight:600;color:#111827;">${esc(title || 'Untitled Page')}</p>
        <p style="margin:0 0 12px;font-size:12px;color:#6b7280;">${esc(url)}</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:40px;">
          ${rows}
        </table>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Feedback Report — ${date}</title>
<style>
  body { margin: 0; padding: 40px 56px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
<h1 style="font-size:22px;font-weight:700;margin:0 0 4px;"">Feedback Report</h1>
<p style="margin:0 0 40px;font-size:13px;color:#6b7280;">${date} · ${total} ${total === 1 ? 'note' : 'notes'}</p>
${sections}
</body>
</html>`;
  }

  // ─── Utils ─────────────────────────────────────────────────────────────────

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
