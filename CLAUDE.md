# Feedback Capture — Chrome Extension

## Purpose
A lightweight Chrome extension for capturing design feedback during live prototype reviews. Activate it, select DOM elements or full page, add notes, export a clean HTML report (screenshot + note, side by side).

## Tech Stack
- Chrome Extension (Manifest V3)
- Vanilla HTML/CSS/JS (no framework — content scripts need to be lightweight)
- Tailwind CSS via CDN for the popup and report pages
- `html2canvas` for element/page screenshot capture

## Key Components
- `manifest.json` — extension config, permissions
- `content.js` — injected into every page; handles toolbar, element picker, highlight overlay, note popup
- `content.css` — styles for toolbar, highlight, popup (scoped to avoid conflicts)
- `background.js` — service worker; coordinates messaging between content scripts across tabs
- `popup.html` / `popup.js` — extension icon popup (minimal, just an activate button)
- `report.html` / `report.js` — the generated export report (opened as a new tab)

## Core User Flow
1. Click extension icon → floating toolbar appears (top-center of page)
2. Toolbar buttons: Select Element · Full Page · Export · Exit
3. Select Element → hover highlights DOM elements (blue outline), click to select → note popup appears near element
4. Full Page → viewport highlighted → note popup appears → captures visible viewport
5. Notes saved in `chrome.storage.session` keyed by URL
6. Export → downloads a self-contained `.html` file with all notes grouped by page URL
7. Exit → clears session, removes toolbar

## Export Report Format
- Self-contained HTML file (base64-embedded screenshots)
- Each note: screenshot (left) + note text (right), side by side
- Notes grouped by page URL
- Clean, printable layout — designed to look good as PDF

---

## Design Context

### Users
Product designers and anyone running live prototype reviews. Used during presentations in front of stakeholders — tool must be invisible enough not to distract from the prototype being reviewed.

### Brand Personality
Invisible, precise, trusted. Like a good design tool — you don't think about it, it just works.

### Aesthetic Direction
- Clean and minimal. No color beyond functional use.
- Light mode only.
- Feels like a native browser tool (Chrome DevTools aesthetic), not a SaaS product.
- Anti-reference: nothing loud, branded, or that draws attention away from the page being reviewed.

### Design Principles
1. **Don't compete with the content** — UI feels like a light layer, not a product
2. **Precise and familiar** — blue outline highlight (like DevTools), standard patterns
3. **Minimal surface area** — only show what's needed for the current action
4. **Export is the product** — report should be clean and professional enough to share
5. **Zero friction** — activate, capture, export. No accounts, no sync, no modals beyond note input
