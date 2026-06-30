// ==UserScript==
// @name         📄 Gap Detector — Skripsi Edition
// @namespace    https://docs.google.com
// @version      5.0.0
// @description  Detects pages with large empty spaces at the bottom in Google Docs
// @author       Skripsi Tools
// @match        https://docs.google.com/document/d/*
// @all-frames   true
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ─── Wait for editor ───────────────────────────────────────────────────────
  function waitForEditor(cb) {
    if (document.querySelector('.kix-page-paginated')) { cb(); return; }
    const obs = new MutationObserver(() => {
      if (document.querySelector('.kix-page-paginated')) { obs.disconnect(); cb(); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ─── DOM builder (no innerHTML — CSP safe) ────────────────────────────────
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'textContent') el.textContent = v;
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (!c) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  // ─── Actual document page index from DOM element ──────────────────────────
  // Google Docs uses a ROTATING TILE system: only 2–3 .kix-page-paginated DOM
  // elements exist at any time, recycled as the user scrolls. We identify which
  // real document page each tile represents by its offsetTop within its parent
  // (the tile manager positions each tile at pageIndex × pageHeight).
  function getDocPageIndex(page) {
    const h = page.offsetHeight;
    if (!h) return null;
    // offsetTop is relative to the rotating tile manager — dividing by page
    // height gives us the 0-based real page index in the document.
    return Math.round(page.offsetTop / h);
  }

  // ─── Canvas pixel scan ────────────────────────────────────────────────────
  // Returns gap fraction (0–1) for rendered tiles, null for recycled/blank tiles.
  function getCanvasGapFraction(page) {
    const canvas = page.querySelector('canvas');
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;

    let ctx;
    try { ctx = canvas.getContext('2d'); } catch (e) { return null; }
    if (!ctx) return null;

    const w = canvas.width, h = canvas.height;

    // Step 1 — Is this tile actually rendered? Sample the top 15%.
    // If all white/transparent → recycled blank tile → return null.
    const topH = Math.max(Math.floor(h * 0.15), 10);
    let topData;
    try { topData = ctx.getImageData(0, 0, w, topH).data; } catch (e) { return null; }

    let hasTopContent = false;
    for (let i = 0; i < topData.length; i += 16) {
      if (topData[i + 3] > 10 && (topData[i] < 245 || topData[i + 1] < 245 || topData[i + 2] < 245)) {
        hasTopContent = true; break;
      }
    }
    if (!hasTopContent) return null; // recycled blank tile

    // Step 2 — Scan bottom 70% upward to find the last content row.
    const scanStart = Math.floor(h * 0.30);
    const scanH = h - scanStart;
    let data;
    try { data = ctx.getImageData(0, scanStart, w, scanH).data; } catch (e) { return null; }

    let lastRow = 0;
    outer:
    for (let y = scanH - 1; y >= 0; y--) {
      for (let x = 0; x < w; x += 6) {
        const i = (y * w + x) * 4;
        if (data[i + 3] > 10 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) {
          lastRow = y; break outer;
        }
      }
    }

    return (h - (scanStart + lastRow)) / h;
  }

  // ─── Main ─────────────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('gdoc-gap-panel')) return;

    let GAP_THRESHOLD = 0.22;
    let enabled = true;
    let scanTimer = null;
    let isDragging = false, dragOX = 0, dragOY = 0;

    // KEY FIX: Map keyed by REAL document page index, not DOM slot index.
    const detectedGaps = new Map(); // docPageIndex → { pageNum, gapFrc, sev }

    GM_addStyle(`
      .gdoc-gap-overlay {
        position: absolute; left: 0; right: 0; bottom: 0;
        pointer-events: none; z-index: 800;
        display: flex; align-items: flex-start;
        justify-content: center; padding-top: 10px;
      }
      .gdoc-gap-overlay.warning {
        background: linear-gradient(to top, rgba(251,146,60,0.30), transparent);
        border-top: 2px dashed rgba(251,146,60,0.8);
      }
      .gdoc-gap-overlay.danger {
        background: linear-gradient(to top, rgba(239,68,68,0.35), transparent);
        border-top: 2px dashed rgba(239,68,68,0.9);
      }
      .gdoc-gap-label {
        display: inline-flex; align-items: center; gap: 5px;
        background: rgba(15,15,25,0.82); color: #f1f5f9;
        font-size: 11px; font-family: system-ui, sans-serif;
        font-weight: 600; padding: 4px 10px; border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.12);
      }
      .gdoc-gap-label.warning { border-color: rgba(251,146,60,0.5); }
      .gdoc-gap-label.danger  { border-color: rgba(239,68,68,0.5); }

      #gdoc-gap-panel {
        position: fixed; top: 80px; right: 20px; width: 252px;
        background: #13131f; color: #e2e8f0; border-radius: 14px;
        font-family: system-ui, sans-serif; font-size: 12px;
        z-index: 99999; overflow: hidden; user-select: none;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07);
      }
      #gdoc-gap-panel.minimized #gdoc-gap-panel-body { display: none; }
      #gdoc-gap-panel-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px 10px; background: rgba(255,255,255,0.04);
        border-bottom: 1px solid rgba(255,255,255,0.07); cursor: grab;
      }
      #gdoc-gap-panel-header:active { cursor: grabbing; }
      #gdoc-gap-panel-title {
        margin: 0; font-size: 13px; font-weight: 700; color: #c4b5fd;
        display: flex; align-items: center; gap: 7px;
      }
      .gdoc-scan-dot {
        display: inline-block; width: 7px; height: 7px;
        border-radius: 50%; background: #4ade80;
        animation: gdoc-pulse 1.5s infinite;
      }
      .gdoc-scan-dot.paused { background: #64748b; animation: none; }
      @keyframes gdoc-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      #gdoc-gap-minimize {
        background: none; border: none; color: #64748b; cursor: pointer;
        padding: 2px 6px; border-radius: 4px; font-size: 14px; line-height: 1;
      }
      #gdoc-gap-minimize:hover { color: #e2e8f0; background: rgba(255,255,255,0.08); }
      #gdoc-gap-panel-body { padding: 12px 14px 14px; }
      .gdoc-gap-subtitle { color: #475569; font-size: 10px; margin-bottom: 10px; line-height: 1.5; }
      #gdoc-gap-list {
        max-height: 240px; overflow-y: auto;
        display: flex; flex-direction: column; gap: 4px;
        scrollbar-width: thin; scrollbar-color: #334155 transparent;
      }
      .gdoc-gap-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 7px 10px; background: rgba(255,255,255,0.04);
        border-radius: 8px; cursor: pointer; border: 1px solid transparent;
        transition: background 0.15s;
      }
      .gdoc-gap-item:hover { background: rgba(255,255,255,0.09); }
      .gdoc-page-num { font-weight: 600; color: #93c5fd; font-size: 12px; }
      .gdoc-page-sub { font-size: 10px; color: #6c7086; margin-top: 1px; }
      .gdoc-gap-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; }
      .gdoc-gap-badge.warning { background: rgba(251,146,60,0.15); color: #fb923c; border: 1px solid rgba(251,146,60,0.3); }
      .gdoc-gap-badge.danger  { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
      .gdoc-gap-empty { color: #475569; text-align: center; padding: 16px 0; font-style: italic; font-size: 11px; }
      .gdoc-gap-ok    { color: #4ade80; text-align: center; padding: 14px 0; font-size: 11px; font-weight: 500; }
      .gdoc-gap-hint  { color: #64748b; text-align: center; padding: 4px 0 8px; font-size: 10px; line-height: 1.5; }
      #gdoc-gap-controls {
        margin-top: 12px; padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex; flex-direction: column; gap: 9px;
      }
      .gdoc-slider-row { display: flex; align-items: center; gap: 8px; }
      .gdoc-slider-label { font-size: 10px; color: #64748b; white-space: nowrap; }
      .gdoc-slider-val   { font-size: 10px; color: #c4b5fd; font-weight: 600; min-width: 32px; text-align: right; }
      #gdoc-threshold-slider { flex: 1; accent-color: #a78bfa; cursor: pointer; }
      #gdoc-gap-toggle {
        width: 100%; padding: 7px;
        border: 1px solid rgba(167,139,250,0.3); border-radius: 8px;
        background: rgba(167,139,250,0.08); color: #c4b5fd;
        cursor: pointer; font-size: 11px; font-weight: 600;
        font-family: system-ui, sans-serif; transition: background 0.15s;
      }
      #gdoc-gap-toggle:hover { background: rgba(167,139,250,0.17); }
      #gdoc-gap-toggle.paused { background: rgba(100,116,139,0.10); border-color: rgba(100,116,139,0.3); color: #64748b; }
      #gdoc-gap-clear {
        width: 100%; padding: 5px;
        border: 1px solid rgba(100,116,139,0.2); border-radius: 8px;
        background: transparent; color: #64748b;
        cursor: pointer; font-size: 10px;
        font-family: system-ui, sans-serif; transition: background 0.15s;
      }
      #gdoc-gap-clear:hover { background: rgba(255,255,255,0.05); color: #94a3b8; }
    `);

    // ── Panel ────────────────────────────────────────────────────────────────
    const scanDot  = h('span', { className: 'gdoc-scan-dot', id: 'gdoc-scan-dot' });
    const minBtn   = h('button', { id: 'gdoc-gap-minimize' }, '─');
    const panTitle = h('p', { id: 'gdoc-gap-panel-title' }, '📄 Gap Detector ', scanDot);
    const panHdr   = h('div', { id: 'gdoc-gap-panel-header' }, panTitle, minBtn);
    const subtitle = h('div', { className: 'gdoc-gap-subtitle' },
      'Gulir dokumen dari atas ke bawah untuk memindai semua halaman');
    const gapList  = h('div', { id: 'gdoc-gap-list' },
      h('div', { className: 'gdoc-gap-empty' }, '⏳ Belum ada halaman terpindai...'));
    const slider   = h('input', { type: 'range', id: 'gdoc-threshold-slider', min: '10', max: '55', value: '22' });
    const sliderVal= h('span', { className: 'gdoc-slider-val', id: 'gdoc-threshold-val' }, '22%');
    const sliderRow= h('div', { className: 'gdoc-slider-row' },
      h('span', { className: 'gdoc-slider-label' }, 'Ambang batas'), slider, sliderVal);
    const toggleBtn= h('button', { id: 'gdoc-gap-toggle' }, '⏸ Jeda Pemindaian');
    const clearBtn = h('button', { id: 'gdoc-gap-clear' }, '🗑 Hapus Semua Hasil');
    const controls = h('div', { id: 'gdoc-gap-controls' }, sliderRow, toggleBtn, clearBtn);
    const panBody  = h('div', { id: 'gdoc-gap-panel-body' }, subtitle, gapList, controls);
    const panel    = h('div', { id: 'gdoc-gap-panel' }, panHdr, panBody);
    document.body.appendChild(panel);

    // ── Drag ─────────────────────────────────────────────────────────────────
    panHdr.addEventListener('mousedown', e => {
      isDragging = true;
      dragOX = e.clientX - panel.getBoundingClientRect().left;
      dragOY = e.clientY - panel.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      panel.style.left  = (e.clientX - dragOX) + 'px';
      panel.style.top   = (e.clientY - dragOY) + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    minBtn.addEventListener('click', () => {
      panel.classList.toggle('minimized');
      minBtn.textContent = panel.classList.contains('minimized') ? '□' : '─';
    });
    slider.addEventListener('input', function () {
      GAP_THRESHOLD = this.value / 100;
      sliderVal.textContent = this.value + '%';
      runScan();
    });
    toggleBtn.addEventListener('click', function () {
      enabled = !enabled;
      if (enabled) {
        this.textContent = '⏸ Jeda Pemindaian';
        this.classList.remove('paused');
        scanDot.classList.remove('paused');
        runScan();
      } else {
        this.textContent = '▶ Mulai Pemindaian';
        this.classList.add('paused');
        scanDot.classList.add('paused');
        clearTimeout(scanTimer);
        clearOverlays();
      }
    });
    clearBtn.addEventListener('click', () => {
      detectedGaps.clear();
      clearOverlays();
      renderPanel();
    });

    // ── Helpers ──────────────────────────────────────────────────────────────
    function clearList() { while (gapList.firstChild) gapList.removeChild(gapList.firstChild); }
    function clearOverlays() { document.querySelectorAll('[data-gap-overlay]').forEach(e => e.remove()); }

    // ── Scan ─────────────────────────────────────────────────────────────────
    function runScan() {
      if (!enabled) return;
      clearOverlays();

      const tiles = document.querySelectorAll('.kix-page-paginated');
      if (!tiles.length) { scheduleScan(); return; }

      tiles.forEach(tile => {
        if (getComputedStyle(tile).position === 'static') tile.style.position = 'relative';

        // Get the REAL document page index this tile represents
        const docIdx = getDocPageIndex(tile);
        if (docIdx === null) return;

        const gapFrc = getCanvasGapFraction(tile);

        if (gapFrc === null) {
          // Recycled/blank tile — do NOT touch the Map entry for this page
          return;
        }

        if (gapFrc > GAP_THRESHOLD) {
          const sev = gapFrc > 0.40 ? 'danger' : 'warning';
          detectedGaps.set(docIdx, { pageNum: docIdx + 1, gapFrc, sev });
        } else {
          // Canvas is live and shows no gap → user fixed it
          detectedGaps.delete(docIdx);
        }

        // Draw overlay on this tile if it has a gap
        if (detectedGaps.has(docIdx)) {
          const { gapFrc: gf, sev } = detectedGaps.get(docIdx);
          const gapPx = Math.max(Math.round(gf * tile.offsetHeight), 24);
          const label   = h('span', { className: 'gdoc-gap-label ' + sev },
            '⚠ Kosong ' + Math.round(gf * 100) + '%');
          const overlay = h('div', { className: 'gdoc-gap-overlay ' + sev });
          overlay.style.height = gapPx + 'px';
          overlay.dataset.gapOverlay = 'true';
          overlay.appendChild(label);
          tile.appendChild(overlay);
        }
      });

      renderPanel();
      scheduleScan();
    }

    function renderPanel() {
      clearList();
      const sorted = Array.from(detectedGaps.values()).sort((a, b) => a.pageNum - b.pageNum);
      const scanned = detectedGaps.size > 0 || document.querySelector('.kix-page-paginated canvas');

      if (!sorted.length) {
        gapList.appendChild(h('div', { className: 'gdoc-gap-empty' },
          scanned ? '✅ Tidak ada celah ditemukan sejauh ini' : '⏳ Belum ada halaman terpindai...'));
        if (scanned) {
          gapList.appendChild(h('div', { className: 'gdoc-gap-hint' },
            'Lanjutkan gulir untuk memindai lebih banyak halaman'));
        }
        return;
      }

      gapList.appendChild(h('div', { className: 'gdoc-gap-hint' },
        `${sorted.length} halaman bermasalah ditemukan`));

      sorted.forEach(r => {
        const item = h('div', { className: 'gdoc-gap-item' },
          h('div', {},
            h('p', { className: 'gdoc-page-num' }, 'Halaman ' + r.pageNum),
            h('p', { className: 'gdoc-page-sub' }, Math.round(r.gapFrc * 100) + '% ruang kosong di bawah')),
          h('span', { className: 'gdoc-gap-badge ' + r.sev },
            r.sev === 'danger' ? '🔴 Parah' : '🟠 Sedang')
        );
        item.addEventListener('click', () => {
          // Scroll to the correct absolute position in the document
          const tileH = document.querySelector('.kix-page-paginated')?.offsetHeight || 1123;
          const scrollTarget = r.pageNum * tileH;
          const scrollArea = document.querySelector('.kix-scrollareadocumentplugin')
                          || document.querySelector('.kix-rotatingtilemanager')?.parentElement;
          if (scrollArea) {
            scrollArea.scrollTo({ top: scrollTarget, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
          }
        });
        gapList.appendChild(item);
      });
    }

    function scheduleScan() {
      clearTimeout(scanTimer);
      if (enabled) scanTimer = setTimeout(runScan, 1500);
    }

    setTimeout(runScan, 800);
  }

  waitForEditor(init);
})();
