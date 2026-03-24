# SnapCrit

A lightweight Chrome extension for capturing design feedback during live prototype reviews. Activate it, select DOM elements or the full page, add notes, and export a clean HTML report.

---

## Features

- **Element picker** — hover and click any DOM element to select it (blue DevTools-style outline)
- **Full page capture** — screenshot the visible viewport with a single click
- **Inline notes** — add feedback directly on the captured element
- **Clean export** — one-click HTML report with screenshots and notes side by side, grouped by URL
- **No accounts, no sync** — everything stays in session storage until you export

---

## Usage

1. Click the SnapCrit icon in Chrome to activate the floating toolbar
2. Choose **Select Element** or **Full Page**
3. Click an element (or confirm full page) → a note input appears
4. Add your note and save
5. Repeat across any pages
6. Click **Export** → downloads a self-contained `.html` report

---

## Install (Developer Mode)

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder

---

## File Structure

```
├── manifest.json       # Extension config (Manifest V3)
├── content.js          # Injected script: toolbar, element picker, note popup
├── background.js       # Service worker: cross-tab message coordination
├── popup.html/js       # Extension icon popup
├── report.html/js      # Export report viewer
├── icons/              # Extension icons (16, 32, 48, 128px)
└── privacy-policy.html # Privacy policy (no data collected)
```

---

## Export Report

The exported `.html` file is fully self-contained (base64 screenshots, no external dependencies). Each note shows:

- Screenshot of the selected element or viewport (left)
- Your note text (right)

Notes are grouped by page URL and formatted to print cleanly as a PDF.

---

## License

MIT
