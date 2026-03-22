(function () {
  'use strict';

  if (window.__feedbackCapture) return;
  window.__feedbackCapture = true;

  const STORAGE_KEY = 'fc_notes';
  const ACTIVE_KEY = 'fc_active';

  let isActive = false;
  let mode = 'idle';
  let toolbarHost = null;
  let toolbarShadow = null;
  let popupHost = null;
  let popupShadow = null;
  let highlightEl = null;
  let pendingScreenshot = null;

  // Auto-activate if session is marked active (e.g. user navigated to new page)
  chrome.storage.session.get(ACTIVE_KEY, (result) => {
    if (result[ACTIVE_KEY]) activate();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'activate') {
      activate();
      sendResponse({ ok: true });
    }
  });

  // ─── Activation ────────────────────────────────────────────────────────────

  function activate() {
    if (isActive) return;
    isActive = true;
    chrome.storage.session.set({ [ACTIVE_KEY]: true });
    injectToolbar();
  }

  function deactivate() {
    setMode('idle');
    removeNotePopup();
    removeHighlight();
    if (toolbarHost) { toolbarHost.remove(); toolbarHost = null; toolbarShadow = null; }
    document.body.style.cursor = '';
    isActive = false;
    window.__feedbackCapture = false;
    chrome.storage.session.remove([ACTIVE_KEY, STORAGE_KEY]);
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
        display: flex;
        align-items: center;
        gap: 3px;
        background: rgba(255,255,255,0.97);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 12px;
        padding: 5px 6px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #18181b;
        white-space: nowrap;
        user-select: none;
      }
      .btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: #18181b;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.1s;
        outline: none;
        line-height: 1;
      }
      .btn:hover { background: rgba(0,0,0,0.06); }
      .btn:active { background: rgba(0,0,0,0.09); }
      .mode-btn.active {
        background: rgba(37,99,235,0.09);
        color: #2563eb;
        font-weight: 500;
      }
      .export-btn {
        background: #18181b;
        color: #fff;
        font-weight: 500;
      }
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
    const prev = mode;
    mode = newMode;

    if (toolbarShadow) {
      const sBtn = toolbarShadow.getElementById('btn-select');
      const fBtn = toolbarShadow.getElementById('btn-fullpage');
      if (sBtn) sBtn.classList.toggle('active', mode === 'select-element');
      if (fBtn) fBtn.classList.toggle('active', mode === 'full-page');
    }

    if (prev === 'select-element') {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      document.removeEventListener('click', onElementClick, true);
      document.body.style.cursor = '';
      removeHighlight();
    }

    if (mode === 'select-element') {
      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('mouseout', onMouseOut, true);
      document.addEventListener('click', onElementClick, true);
      document.body.style.cursor = 'crosshair';
    } else if (mode === 'full-page') {
      removeNotePopup();
      triggerFullPageCapture();
    }
  }

  // ─── Element picker ────────────────────────────────────────────────────────

  function onMouseOver(e) {
    if (isOwnEl(e.target)) return;
    showHighlight(e.target);
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
    if (!el) return false;
    const path = el.closest ? null : null;
    return el === toolbarHost || el === popupHost || el === highlightEl;
  }

  // ─── Highlight ─────────────────────────────────────────────────────────────

  function showHighlight(el) {
    const rect = el.getBoundingClientRect();
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
    setMode('idle');
    const rect = el.getBoundingClientRect();
    const screenshot = await captureAndCrop(rect);
    pendingScreenshot = screenshot;
    showNotePopup(rect, false);
  }

  async function triggerFullPageCapture() {
    const rect = { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    const screenshot = await captureAndCrop(rect);
    pendingScreenshot = screenshot;
    setMode('idle');
    showNotePopup(null, true);
  }

  async function captureAndCrop(rect) {
    // Hide extension UI before capture
    if (toolbarHost) toolbarHost.style.visibility = 'hidden';
    if (highlightEl) highlightEl.style.display = 'none';
    if (popupHost) popupHost.style.visibility = 'hidden';

    await sleep(60);

    const dataUrl = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'captureTab' }, (res) => {
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

  function showNotePopup(rect, isFullPage) {
    removeNotePopup();

    popupHost = document.createElement('div');
    popupHost.id = '__fc-popup-host';

    const W = 264, H = 154, MARGIN = 10;
    let top, left;

    if (isFullPage) {
      top = window.innerHeight / 2 - H / 2;
      left = window.innerWidth / 2 - W / 2;
    } else {
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

    popupShadow.getElementById('btn-save').addEventListener('click', () => {
      const val = textarea.value.trim();
      if (val) saveNote(val);
      else removeNotePopup();
    });

    popupShadow.getElementById('btn-close').addEventListener('click', removeNotePopup);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const val = textarea.value.trim();
        if (val) saveNote(val);
      }
      if (e.key === 'Escape') removeNotePopup();
    });
  }

  function getPopupCSS() {
    return `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      .popup {
        background: #fff;
        border: 1px solid rgba(0,0,0,0.10);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        overflow: hidden;
      }
      .popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px 7px;
        border-bottom: 1px solid rgba(0,0,0,0.06);
      }
      .label {
        font-size: 11px;
        font-weight: 600;
        color: #a1a1aa;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border: none;
        background: none;
        color: #a1a1aa;
        cursor: pointer;
        border-radius: 4px;
        padding: 0;
      }
      .close-btn:hover { background: rgba(0,0,0,0.06); color: #18181b; }
      .textarea {
        width: 100%;
        padding: 10px 12px;
        border: none;
        outline: none;
        resize: none;
        font-family: inherit;
        font-size: 13px;
        color: #18181b;
        line-height: 1.5;
        background: #fff;
        height: 72px;
      }
      .popup-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 12px;
        border-top: 1px solid rgba(0,0,0,0.06);
      }
      .hint { font-size: 11px; color: #a1a1aa; }
      .save-btn {
        background: #18181b;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 5px 14px;
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
      }
      .save-btn:hover { background: #27272a; }
    `;
  }

  function removeNotePopup() {
    if (popupHost) { popupHost.remove(); popupHost = null; popupShadow = null; }
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  async function saveNote(noteText) {
    removeNotePopup();
    const note = {
      url: window.location.href,
      pageTitle: document.title,
      screenshot: pendingScreenshot,
      note: noteText,
      timestamp: Date.now(),
    };
    const stored = await getStoredNotes();
    stored.push(note);
    await chrome.storage.session.set({ [STORAGE_KEY]: stored });
    pendingScreenshot = null;
    updateNoteCount(stored.length);
  }

  function getStoredNotes() {
    return new Promise((resolve) => {
      chrome.storage.session.get(STORAGE_KEY, (r) => resolve(r[STORAGE_KEY] || []));
    });
  }

  function updateNoteCount(count) {
    if (!toolbarShadow) return;
    const el = toolbarShadow.getElementById('note-count');
    if (el) el.textContent = count + (count === 1 ? ' note' : ' notes');
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  async function handleExport() {
    const notes = await getStoredNotes();
    if (!notes.length) {
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
    const html = buildReport(notes);
    downloadHTML(html);
  }

  function buildReport(notes) {
    const grouped = {};
    for (const n of notes) {
      if (!grouped[n.url]) grouped[n.url] = { title: n.pageTitle, items: [] };
      grouped[n.url].items.push(n);
    }

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const total = notes.length;

    const sections = Object.entries(grouped).map(([url, { title, items }]) => {
      const rows = items.map((n, i) => `
        <div class="note-row">
          <div class="note-img">
            ${n.screenshot
              ? `<img src="${n.screenshot}" alt="Capture ${i + 1}" />`
              : '<span class="no-img">No capture</span>'}
          </div>
          <div class="note-body">
            <span class="note-num">${i + 1}</span>
            <p class="note-text">${esc(n.note)}</p>
          </div>
        </div>`).join('');

      return `
        <section>
          <div class="page-meta">
            <span class="page-title">${esc(title || 'Untitled Page')}</span>
            <a class="page-url" href="${esc(url)}" target="_blank">${esc(url)}</a>
          </div>
          <div class="notes">${rows}</div>
        </section>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Feedback Report — ${date}</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;font-size:14px;color:#18181b;background:#f9f9f9;-webkit-font-smoothing:antialiased}
.report-header{background:#fff;border-bottom:1px solid #e4e4e7;padding:36px 56px}
.report-title{font-size:24px;font-weight:700;margin:0 0 6px;letter-spacing:-.01em}
.report-meta{font-size:13px;color:#71717a;margin:0}
.report-body{max-width:880px;margin:0 auto;padding:40px 56px}
section{margin-bottom:48px}
.page-meta{margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #e4e4e7}
.page-title{display:block;font-size:15px;font-weight:600;margin-bottom:4px}
.page-url{font-size:12px;color:#2563eb;text-decoration:none;word-break:break-all;opacity:.8}
.page-url:hover{opacity:1;text-decoration:underline}
.notes{display:flex;flex-direction:column;gap:12px}
.note-row{display:flex;gap:0;background:#fff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden;min-height:110px}
.note-img{flex:0 0 220px;background:#f4f4f5;border-right:1px solid #e4e4e7;display:flex;align-items:center;justify-content:center;overflow:hidden}
.note-img img{width:100%;height:100%;object-fit:contain;display:block}
.no-img{font-size:12px;color:#a1a1aa}
.note-body{flex:1;padding:18px 22px;display:flex;gap:14px;align-items:flex-start}
.note-num{flex:0 0 auto;width:21px;height:21px;background:#18181b;color:#fff;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.note-text{margin:0;font-size:14px;line-height:1.65;color:#18181b;white-space:pre-wrap;word-break:break-word}
@media print{body{background:#fff}.report-header{border-color:#000}.note-row{break-inside:avoid;border-color:#ccc}}
</style>
</head>
<body>
<header class="report-header">
  <h1 class="report-title">Feedback Report</h1>
  <p class="report-meta">${date} &nbsp;·&nbsp; ${total} ${total === 1 ? 'note' : 'notes'}</p>
</header>
<main class="report-body">
${sections}
</main>
</body>
</html>`;
  }

  function downloadHTML(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─── Utils ─────────────────────────────────────────────────────────────────

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
