    (function () {
      'use strict';

      /* ============================================================================
       * BACKEND API URL (RENDER / LOCALHOST)
       * Put your Render backend URL here:
       * e.g. const BACKEND_URL = 'https://your-app-name.onrender.com';
       * ============================================================================ */
      const BACKEND_URL = window.location.origin.includes('onrender.com')
        ? window.location.origin
        : 'http://localhost:5000'; // <-- CHANGE THIS TO YOUR RENDER LINK WHEN DEPLOYED!

      /* ============================================================================
       * 1. STATE MODEL (With 4-Edge '+' Handles, Border-Gap Headings, Auto-Layout Text,
       *    Cells Table, Clipboard Copy/Paste, and Style Format Painter)
       * ============================================================================ */
      const sheets = [
        { id: 'sheet_1', name: 'Sheet 1', notesHTML: '', notesMarkdown: '', shapes: [], camera: { x: 0, y: 0, zoom: 1 } },
        { id: 'sheet_2', name: 'Sheet 2', notesHTML: '', notesMarkdown: '', shapes: [], camera: { x: 0, y: 0, zoom: 1 } }
      ];

      const imageCache = new Map();

      const FONT_STACKS = {
        sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        serif: "'Playfair Display', Georgia, serif",
        hand: "'Caveat', cursive",
        arch: "'Architects Daughter', cursive",
        mono: "'JetBrains Mono', monospace"
      };

      const app = {
        currentSheetIdx: 0,
        viewMode: 'SPLIT',
        splitRatio: 0.38,
        markdownMode: false,
        activeTool: 'select',
        lastNavTool: 'select',
        lastShapeTool: 'rect',
        lastDrawTool: 'arrow',
        strokeColor: '#F2F4F8',
        strokeWidth: 2,
        strokeDash: 'solid',
        fillMode: 'solid',
        fontFamily: 'sans',
        fontItalic: false,
        handDrawnRough: false,
        snapToGrid: true,
        showEdgePlusHandles: true,
        camera: sheets[0].camera,
        shapes: sheets[0].shapes,
        selectedIds: new Set(),
        hoveredShapeId: null,
        hoveredEdgeSide: null, // 'top' | 'right' | 'bottom' | 'left'
        activeEdgeMenuTarget: null, // { shapeId, side }
        freeTransformActive: false,
        lastTransformDelta: { scaleX: 1.18, scaleY: 1.18, dx: 0, dy: 0 },
        clipboardShapes: [],
        copiedStyle: null,
        stylePainterArmed: false,
        lastMouseWorld: { x: 240, y: 180 },
        undoStack: [],
        redoStack: [],
        interaction: {
          mode: 'none',
          startScreen: { x: 0, y: 0 },
          startWorld: { x: 0, y: 0 },
          currWorld: { x: 0, y: 0 },
          activeShape: null,
          resizeHandle: null,
          initialBounds: null,
          initialGroupBox: null,
          initialSnapshots: new Map(),
          altClonedDuringDrag: false,
          spacePressed: false
        },
        editingShapeId: null,
        editingTargetMeta: null // { mode: 'body' | 'edge' | 'cell', side?: string, row?: number, col?: number }
      };

      const canvas = document.getElementById('draw-canvas');
      const ctx = canvas.getContext('2d');
      const viewportEl = document.getElementById('canvas-viewport');
      const inlineShell = document.getElementById('inline-editor-shell');
      const inlineEditor = document.getElementById('inline-canvas-editor');
      const edgePlusMenu = document.getElementById('edge-plus-menu');
      const richNotesEl = document.getElementById('rich-notes-editor');
      const rawNotesEl = document.getElementById('raw-notes-editor');

      const SHAPE_SVGS = {
        select: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/>',
        pan: '<path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
        rect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
        diamond: '<polygon points="12 2 22 12 12 22 2 12 12 2"/>',
        ellipse: '<circle cx="12" cy="12" r="9"/>',
        cylinder: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>',
        frame: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/>',
        table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
        arrow: '<line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/>',
        line: '<line x1="4" y1="20" x2="20" y2="4"/>',
        freedraw: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>',
        text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'
      };

      function getOrLoadImage(dataUrl) {
        if (!dataUrl) return null;
        if (imageCache.has(dataUrl)) return imageCache.get(dataUrl);
        const img = new Image();
        img.onload = function () { renderCanvas(); };
        img.src = dataUrl;
        imageCache.set(dataUrl, img);
        return img;
      }

      function buildCanvasFont(s, defaultSize) {
        const famKey = s.fontFamily || 'sans';
        const fam = FONT_STACKS[famKey] || FONT_STACKS.sans;
        const baseSize = s.fontSize || defaultSize || 14;
        const size = famKey === 'hand' ? Math.round(baseSize * 1.22) : baseSize;
        const italicPrefix = s.fontItalic ? 'italic ' : '';
        const weight = famKey === 'hand' ? '700 ' : '600 ';
        return italicPrefix + weight + size + 'px ' + fam;
      }

      /* ============================================================================
       * 2. AUTO-LAYOUT TEXT REFLOW & WORD-WRAPPING ENGINE
       * ============================================================================ */
      function wrapTextIntoLines(text, maxWidthPx, fontSpec) {
        ctx.save();
        ctx.font = fontSpec;
        const paragraphs = String(text || '').split('\n');
        const wrappedLines = [];
        const boundW = Math.max(28, maxWidthPx);

        paragraphs.forEach(function (para) {
          if (!para) {
            wrappedLines.push('');
            return;
          }
          const words = para.split(' ');
          let currentLine = '';

          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const candidate = currentLine ? (currentLine + ' ' + word) : word;
            if (ctx.measureText(candidate).width <= boundW) {
              currentLine = candidate;
            } else {
              if (currentLine) {
                wrappedLines.push(currentLine);
                currentLine = word;
              } else {
                // Single very long word exceeds width: break character by character
                let chunk = '';
                for (let c = 0; c < word.length; c++) {
                  const testChunk = chunk + word[c];
                  if (ctx.measureText(testChunk).width > boundW && chunk.length > 0) {
                    wrappedLines.push(chunk);
                    chunk = word[c];
                  } else {
                    chunk = testChunk;
                  }
                }
                currentLine = chunk;
              }
            }
          }
          if (currentLine) wrappedLines.push(currentLine);
        });

        ctx.restore();
        return wrappedLines.length > 0 ? wrappedLines : [''];
      }

      /* ============================================================================
       * 3. 4-EDGE '+' QUICK ACTION HANDLES & TABLE '+' HANDLES
       * ============================================================================ */
      function isBoxWithEdgePlus(s) {
        return ['rect', 'diamond', 'ellipse', 'cylinder', 'frame', 'sticky', 'table'].includes(s.type);
      }

      function getShapeFourEdgePlusCenters(s) {
        const b = getNormalizedBox(s);
        const offset = 15 / app.camera.zoom;
        return [
          { side: 'top', x: b.x + b.w / 2, y: b.y - offset },
          { side: 'right', x: b.x + b.w + offset, y: b.y + b.h / 2 },
          { side: 'bottom', x: b.x + b.w / 2, y: b.y + b.h + offset },
          { side: 'left', x: b.x - offset, y: b.y + b.h / 2 }
        ];
      }

      function hitTestEdgePlusHandle(wx, wy) {
        if (!app.showEdgePlusHandles) return null;
        // Check hovered shape or single selected shape
        const candidates = [];
        if (app.hoveredShapeId) {
          const hs = app.shapes.find(function (s) { return s.id === app.hoveredShapeId; });
          if (hs && isBoxWithEdgePlus(hs)) candidates.push(hs);
        }
        if (app.selectedIds.size === 1) {
          const selId = Array.from(app.selectedIds)[0];
          const ss = app.shapes.find(function (s) { return s.id === selId; });
          if (ss && isBoxWithEdgePlus(ss) && !candidates.includes(ss)) candidates.push(ss);
        }

        const hitRadius = 12 / app.camera.zoom;
        for (let i = 0; i < candidates.length; i++) {
          const s = candidates[i];
          const centers = getShapeFourEdgePlusCenters(s);
          for (let j = 0; j < centers.length; j++) {
            const c = centers[j];
            if (Math.hypot(wx - c.x, wy - c.y) <= hitRadius) {
              return { shape: s, side: c.side, x: c.x, y: c.y };
            }
          }
        }
        return null;
      }

      function hitTestTableAddRowColHandles(wx, wy) {
        if (app.selectedIds.size !== 1) return null;
        const selId = Array.from(app.selectedIds)[0];
        const s = app.shapes.find(function (item) { return item.id === selId; });
        if (!s || s.type !== 'table') return null;
        const b = getNormalizedBox(s);
        const r = 11 / app.camera.zoom;
        // Add Column badge at top-right edge; Add Row badge at bottom-left edge
        const addColPt = { x: b.x + b.w + 14 / app.camera.zoom, y: b.y + 14 / app.camera.zoom };
        const addRowPt = { x: b.x + 14 / app.camera.zoom, y: b.y + b.h + 14 / app.camera.zoom };
        if (Math.hypot(wx - addColPt.x, wy - addColPt.y) <= r) return { shape: s, action: 'add_col' };
        if (Math.hypot(wx - addRowPt.x, wy - addRowPt.y) <= r) return { shape: s, action: 'add_row' };
        return null;
      }

      function openEdgePlusActionMenu(shape, side, worldX, worldY) {
        app.activeEdgeMenuTarget = { shapeId: shape.id, side: side };
        const scr = worldToScreen(worldX, worldY);
        edgePlusMenu.classList.remove('hidden');
        edgePlusMenu.style.left = Math.max(8, Math.round(scr.x - 52)) + 'px';
        edgePlusMenu.style.top = Math.max(8, Math.round(scr.y - 42)) + 'px';
      }

      function closeEdgePlusActionMenu() {
        app.activeEdgeMenuTarget = null;
        edgePlusMenu.classList.add('hidden');
      }

      /* ============================================================================
       * 4. COPY / PASTE SHAPES, OS CLIPBOARD IMAGES/TEXT & STYLE FORMAT PAINTER
       * ============================================================================ */
      function copySelectedShapesToInternalClipboard() {
        if (app.selectedIds.size === 0) return;
        app.clipboardShapes = app.shapes
          .filter(function (s) { return app.selectedIds.has(s.id); })
          .map(function (s) { return JSON.parse(JSON.stringify(s)); });
        pulseFeedback();
      }

      function pasteFromInternalClipboard() {
        if (!app.clipboardShapes || app.clipboardShapes.length === 0) return false;
        pushUndoState();
        const newSelection = new Set();
        app.clipboardShapes.forEach(function (item, idx) {
          const copy = JSON.parse(JSON.stringify(item));
          copy.id = 'shp_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000);
          copy.x += 28;
          copy.y += 28;
          if (copy.points) {
            copy.points = copy.points.map(function (p) { return { x: p.x + 28, y: p.y + 28 }; });
          }
          app.shapes.push(copy);
          newSelection.add(copy.id);
        });
        // Update clipboard offset so consecutive Ctrl+V cascades neatly
        app.clipboardShapes.forEach(function (item) {
          item.x += 28;
          item.y += 28;
        });
        app.selectedIds = newSelection;
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
        return true;
      }

      function copySelectedStyle() {
        if (app.selectedIds.size === 0) return;
        const firstId = Array.from(app.selectedIds)[0];
        const s = app.shapes.find(function (item) { return item.id === firstId; });
        if (!s) return;
        app.copiedStyle = {
          stroke: s.stroke || '#F2F4F8',
          strokeWidth: s.strokeWidth || 2,
          strokeDash: s.strokeDash || 'solid',
          fillMode: s.fillMode || 'solid',
          fontFamily: s.fontFamily || 'sans',
          fontItalic: Boolean(s.fontItalic),
          fontSize: s.fontSize || 14,
          stickyColor: s.stickyColor || null
        };
        app.stylePainterArmed = true;
        document.getElementById('btn-style-painter').classList.add('active');
        document.getElementById('btn-dock-painter').classList.add('active');
        pulseFeedback();
      }

      function applyCopiedStyleToShape(targetShape) {
        if (!app.copiedStyle || !targetShape) return;
        pushUndoState();
        targetShape.stroke = app.copiedStyle.stroke;
        targetShape.strokeWidth = app.copiedStyle.strokeWidth;
        targetShape.strokeDash = app.copiedStyle.strokeDash;
        targetShape.fillMode = app.copiedStyle.fillMode;
        targetShape.fontFamily = app.copiedStyle.fontFamily;
        targetShape.fontItalic = app.copiedStyle.fontItalic;
        targetShape.fontSize = app.copiedStyle.fontSize;
        if (targetShape.type === 'sticky' && app.copiedStyle.stickyColor) {
          targetShape.stickyColor = app.copiedStyle.stickyColor;
        }
        app.stylePainterArmed = false;
        document.getElementById('btn-style-painter').classList.remove('active');
        document.getElementById('btn-dock-painter').classList.remove('active');
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function pasteStyleToSelection() {
        if (!app.copiedStyle || app.selectedIds.size === 0) return;
        pushUndoState();
        app.shapes.forEach(function (s) {
          if (!app.selectedIds.has(s.id)) return;
          s.stroke = app.copiedStyle.stroke;
          s.strokeWidth = app.copiedStyle.strokeWidth;
          s.strokeDash = app.copiedStyle.strokeDash;
          s.fillMode = app.copiedStyle.fillMode;
          s.fontFamily = app.copiedStyle.fontFamily;
          s.fontItalic = app.copiedStyle.fontItalic;
          s.fontSize = app.copiedStyle.fontSize;
          if (s.type === 'sticky' && app.copiedStyle.stickyColor) {
            s.stickyColor = app.copiedStyle.stickyColor;
          }
        });
        app.stylePainterArmed = false;
        document.getElementById('btn-style-painter').classList.remove('active');
        document.getElementById('btn-dock-painter').classList.remove('active');
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      // Listen for native OS / Browser Paste (Images & Text copied from outside!)
      window.addEventListener('paste', function (e) {
        const activeEl = document.activeElement;
        const isTyping = Boolean(app.editingShapeId) || (activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable
        ));
        if (isTyping) return; // Let native paste work inside notepad or text input

        const cd = e.clipboardData;
        if (!cd) return;

        // 1. Check if clipboard contains an image file (screenshot or copied web image)
        if (cd.items) {
          for (let i = 0; i < cd.items.length; i++) {
            const item = cd.items[i];
            if (item.type && item.type.startsWith('image/')) {
              e.preventDefault();
              const file = item.getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = function (ev) {
                  addUploadedImageToCanvas(ev.target.result, 'Pasted Image', 0);
                };
                reader.readAsDataURL(file);
                return;
              }
            }
          }
        }

        // 2. If user copied internal canvas shapes and no new external text overrides it, paste shapes
        const pastedText = cd.getData('text/plain');
        if (app.clipboardShapes.length > 0 && !pastedText) {
          e.preventDefault();
          pasteFromInternalClipboard();
          return;
        }

        // 3. If external text is in clipboard, paste it as an Auto-Layout Text Node on Canvas
        if (pastedText && pastedText.trim()) {
          e.preventDefault();
          pushUndoState();
          const pt = app.lastMouseWorld || { x: 180, y: 140 };
          const textNode = {
            id: 'shp_paste_' + Date.now(),
            type: 'text',
            x: snapVal(pt.x),
            y: snapVal(pt.y),
            w: 240,
            h: 48,
            text: pastedText.trim(),
            fontSize: 16,
            fontFamily: app.fontFamily,
            fontItalic: app.fontItalic,
            stroke: app.strokeColor,
            strokeWidth: app.strokeWidth,
            fillMode: 'none'
          };
          app.shapes.push(textNode);
          app.selectedIds.clear();
          app.selectedIds.add(textNode.id);
          renderCanvas();
        triggerAutoSave();
          pulseFeedback();
        }
      });

      /* ============================================================================
       * 5. EXCEL-STYLE BOTTOM SHEET TABS & PHOTOSHOP SHORTCUTS
       * ============================================================================ */
      function renderExcelSheetsBar() {
        const strip = document.getElementById('excel-sheets-strip');
        let html = sheets.map(function (sh, idx) {
          const activeClass = idx === app.currentSheetIdx ? ' active' : '';
          return `<div class="sheet-tab${activeClass}" data-sheet-idx="${idx}" title="Click to switch · Double-click to rename">
            <span class="sheet-name-label">${escapeHTML(sh.name)}</span>
            <button type="button" class="sheet-close-btn" data-delete-sheet="${idx}" aria-label="Delete ${escapeHTML(sh.name)}" title="Delete Page">×</button>
          </div>`;
        }).join('');

        html += `<button type="button" class="icon-btn" id="btn-excel-add-sheet" style="width:24px;height:24px;margin-left:4px;" aria-label="Add New Sheet" title="Add New Blank Page (+)">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>`;

        strip.innerHTML = html;
      }

      function saveCurrentSheetState() {
        const cur = sheets[app.currentSheetIdx];
        if (!cur) return;
        cur.notesHTML = richNotesEl.innerHTML;
        cur.notesMarkdown = rawNotesEl.value;
        cur.shapes = app.shapes;
        cur.camera = { x: app.camera.x, y: app.camera.y, zoom: app.camera.zoom };
      }

      function switchToSheet(idx) {
        if (idx < 0 || idx >= sheets.length) return;
        commitInlineTextEditor();
        closeEdgePlusActionMenu();
        saveCurrentSheetState();
        app.currentSheetIdx = idx;
        const target = sheets[idx];
        app.shapes = target.shapes;
        app.camera = target.camera || { x: 0, y: 0, zoom: 1 };
        richNotesEl.innerHTML = target.notesHTML || '';
        rawNotesEl.value = target.notesMarkdown || '';
        app.selectedIds.clear();
        app.freeTransformActive = false;
        app.undoStack = [];
        app.redoStack = [];
        renderExcelSheetsBar();
        renderCanvas();
        triggerAutoSave();
      }

      function addNewSheet() {
        saveCurrentSheetState();
        const nextNum = sheets.length + 1;
        sheets.push({
          id: 'sheet_' + Date.now(),
          name: 'Sheet ' + nextNum,
          notesHTML: '',
          notesMarkdown: '',
          shapes: [],
          camera: { x: 0, y: 0, zoom: 1 }
        });
        switchToSheet(sheets.length - 1);
        pulseFeedback();
      }

      function deleteSheetAt(idx) {
        if (sheets.length <= 1) {
          pushUndoState();
          sheets[0].name = 'Sheet 1';
          sheets[0].notesHTML = '';
          sheets[0].notesMarkdown = '';
          sheets[0].shapes = [];
          sheets[0].camera = { x: 0, y: 0, zoom: 1 };
          app.shapes = sheets[0].shapes;
          app.camera = sheets[0].camera;
          richNotesEl.innerHTML = '';
          rawNotesEl.value = '';
          app.selectedIds.clear();
          renderExcelSheetsBar();
          renderCanvas();
        triggerAutoSave();
          pulseFeedback();
          return;
        }
        sheets.splice(idx, 1);
        const nextIdx = Math.min(app.currentSheetIdx, sheets.length - 1);
        app.currentSheetIdx = nextIdx;
        const target = sheets[nextIdx];
        app.shapes = target.shapes;
        app.camera = target.camera || { x: 0, y: 0, zoom: 1 };
        richNotesEl.innerHTML = target.notesHTML || '';
        rawNotesEl.value = target.notesMarkdown || '';
        app.selectedIds.clear();
        renderExcelSheetsBar();
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function resetToZeroState() {
        app.camera.x = 0;
        app.camera.y = 0;
        app.camera.zoom = 1;
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function fitAllDiagramsToScreen() {
        if (app.shapes.length === 0) {
          resetToZeroState();
          return;
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        app.shapes.forEach(function (s) {
          const b = getNormalizedBox(s);
          if (b.x < minX) minX = b.x;
          if (b.y < minY) minY = b.y;
          if (b.x + b.w > maxX) maxX = b.x + b.w;
          if (b.y + b.h > maxY) maxY = b.y + b.h;
        });

        const dpr = window.devicePixelRatio || 1;
        const vw = canvas.width / dpr;
        const vh = canvas.height / dpr;
        const contentW = Math.max(80, maxX - minX);
        const contentH = Math.max(80, maxY - minY);
        const pad = 90;

        const scaleX = (vw - pad * 2) / contentW;
        const scaleY = (vh - pad * 2) / contentH;
        const newZoom = Math.min(2.2, Math.max(0.25, Number(Math.min(scaleX, scaleY).toFixed(2))));

        app.camera.zoom = newZoom;
        app.camera.x = Math.round(vw / 2 - (minX + contentW / 2) * newZoom);
        app.camera.y = Math.round(vh / 2 - (minY + contentH / 2) * newZoom);
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function toggleFreeTransformMode() {
        if (app.selectedIds.size === 0 && app.shapes.length > 0) {
          app.shapes.forEach(function (s) { app.selectedIds.add(s.id); });
        }
        if (app.selectedIds.size === 0) return;
        app.freeTransformActive = !app.freeTransformActive;
        document.getElementById('btn-free-transform').classList.toggle('active', app.freeTransformActive);
        setTool('select');
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function getSelectionGroupBox() {
        if (app.selectedIds.size === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        app.shapes.forEach(function (s) {
          if (!app.selectedIds.has(s.id)) return;
          const b = getNormalizedBox(s);
          if (b.x < minX) minX = b.x;
          if (b.y < minY) minY = b.y;
          if (b.x + b.w > maxX) maxX = b.x + b.w;
          if (b.y + b.h > maxY) maxY = b.y + b.h;
        });
        if (!Number.isFinite(minX)) return null;
        return { x: minX, y: minY, w: Math.max(20, maxX - minX), h: Math.max(20, maxY - minY) };
      }

      function repeatLastTransform() {
        if (app.selectedIds.size === 0) return;
        const gb = getSelectionGroupBox();
        if (!gb) return;
        pushUndoState();
        const sx = app.lastTransformDelta.scaleX || 1.15;
        const sy = app.lastTransformDelta.scaleY || 1.15;
        const factor = (sx + sy) / 2;
        const cx = gb.x + gb.w / 2;
        const cy = gb.y + gb.h / 2;

        app.shapes.forEach(function (s) {
          if (!app.selectedIds.has(s.id)) return;
          if (s.type === 'freedraw' && s.points) {
            s.points = s.points.map(function (pt) {
              return { x: cx + (pt.x - cx) * sx, y: cy + (pt.y - cy) * sy };
            });
          } else {
            const nb = getNormalizedBox(s);
            const newW = Math.max(16, nb.w * sx);
            const newH = Math.max(16, nb.h * sy);
            s.x = cx + (nb.x - cx) * sx;
            s.y = cy + (nb.y - cy) * sy;
            s.w = newW;
            s.h = newH;
          }
          s.fontSize = Math.max(9, Math.round((s.fontSize || 14) * factor));
          s.strokeWidth = Math.max(1, Math.min(20, Number(((s.strokeWidth || 2) * factor).toFixed(1))));
        });
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      /* ============================================================================
       * 6. UNDO / REDO & GEOMETRY HELPERS
       * ============================================================================ */
      function cloneShapes(list) {
        return JSON.parse(JSON.stringify(list));
      }

      function pushUndoState() {
        app.undoStack.push(cloneShapes(app.shapes));
        if (app.undoStack.length > 45) app.undoStack.shift();
        app.redoStack = [];
      }

      function performUndo() {
        if (app.undoStack.length === 0) return;
        app.redoStack.push(cloneShapes(app.shapes));
        app.shapes = app.undoStack.pop();
        sheets[app.currentSheetIdx].shapes = app.shapes;
        app.selectedIds.clear();
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function performRedo() {
        if (app.redoStack.length === 0) return;
        app.undoStack.push(cloneShapes(app.shapes));
        app.shapes = app.redoStack.pop();
        sheets[app.currentSheetIdx].shapes = app.shapes;
        app.selectedIds.clear();
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function screenToWorld(sx, sy) {
        return {
          x: (sx - app.camera.x) / app.camera.zoom,
          y: (sy - app.camera.y) / app.camera.zoom
        };
      }

      function worldToScreen(wx, wy) {
        return {
          x: wx * app.camera.zoom + app.camera.x,
          y: wy * app.camera.zoom + app.camera.y
        };
      }

      function snapVal(v) {
        return app.snapToGrid ? Math.round(v / 10) * 10 : v;
      }

      function getNormalizedBox(s) {
        if (s.type === 'freedraw' && s.points && s.points.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let i = 0; i < s.points.length; i++) {
            if (s.points[i].x < minX) minX = s.points[i].x;
            if (s.points[i].y < minY) minY = s.points[i].y;
            if (s.points[i].x > maxX) maxX = s.points[i].x;
            if (s.points[i].y > maxY) maxY = s.points[i].y;
          }
          return { x: minX, y: minY, w: Math.max(12, maxX - minX), h: Math.max(12, maxY - minY) };
        }
        if (s.type === 'text') {
          const baseFs = s.fontSize || 16;
          const fs = s.fontFamily === 'hand' ? Math.round(baseFs * 1.22) : baseFs;
          const boxW = Math.max(48, Math.abs(s.w) || 160);
          const fontSpec = buildCanvasFont(s, baseFs);
          const wrapped = wrapTextIntoLines(s.text || 'Text', boxW - 8, fontSpec);
          const computedH = Math.max(28, Math.round(wrapped.length * (fs * 1.32) + 8));
          return { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: boxW, h: computedH };
        }
        return {
          x: Math.min(s.x, s.x + s.w),
          y: Math.min(s.y, s.y + s.h),
          w: Math.abs(s.w),
          h: Math.abs(s.h)
        };
      }

      function distanceToSegment(px, py, x1, y1, x2, y2) {
        const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = lenSq !== 0 ? dot / lenSq : -1;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }
        return Math.hypot(px - xx, py - yy);
      }

      function hitTestShape(s, wx, wy) {
        const pad = Math.max(8, (s.strokeWidth || 2) + 4);
        if (s.type === 'arrow' || s.type === 'line') {
          return distanceToSegment(wx, wy, s.x, s.y, s.x + s.w, s.y + s.h) <= pad;
        }
        if (s.type === 'freedraw' && s.points) {
          for (let i = 0; i < s.points.length - 1; i++) {
            if (distanceToSegment(wx, wy, s.points[i].x, s.points[i].y, s.points[i + 1].x, s.points[i + 1].y) <= pad) {
              return true;
            }
          }
          return false;
        }
        const b = getNormalizedBox(s);
        return wx >= b.x - 4 && wx <= b.x + b.w + 4 && wy >= b.y - 4 && wy <= b.y + b.h + 4;
      }

      function findTopShapeAt(wx, wy, excludeConnectors) {
        for (let i = app.shapes.length - 1; i >= 0; i--) {
          const s = app.shapes[i];
          if (excludeConnectors && (s.type === 'arrow' || s.type === 'line' || s.type === 'freedraw')) continue;
          if (hitTestShape(s, wx, wy)) return s;
        }
        return null;
      }

      function computeEdgeAnchorPoint(shape, targetX, targetY) {
        const b = getNormalizedBox(shape);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const dx = targetX - cx;
        const dy = targetY - cy;
        if (dx === 0 && dy === 0) return { x: cx, y: cy };
        const hw = Math.max(1, b.w / 2);
        const hh = Math.max(1, b.h / 2);

        if (shape.type === 'ellipse') {
          const angle = Math.atan2(dy, dx);
          return { x: cx + hw * Math.cos(angle), y: cy + hh * Math.sin(angle) };
        }
        if (shape.type === 'diamond') {
          const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
          return { x: cx + dx * t, y: cy + dy * t };
        }
        const scale = Math.min(hw / Math.max(0.001, Math.abs(dx)), hh / Math.max(0.001, Math.abs(dy)));
        return { x: cx + dx * scale, y: cy + dy * scale };
      }

      function updateAttachedArrows() {
        const shapeMap = new Map();
        app.shapes.forEach(function (s) { shapeMap.set(s.id, s); });

        app.shapes.forEach(function (s) {
          if (s.type !== 'arrow' && s.type !== 'line') return;
          const startShape = s.startBindId ? shapeMap.get(s.startBindId) : null;
          const endShape = s.endBindId ? shapeMap.get(s.endBindId) : null;

          if (startShape && endShape) {
            const sb = getNormalizedBox(startShape);
            const eb = getNormalizedBox(endShape);
            const p1 = computeEdgeAnchorPoint(startShape, eb.x + eb.w / 2, eb.y + eb.h / 2);
            const p2 = computeEdgeAnchorPoint(endShape, sb.x + sb.w / 2, sb.y + sb.h / 2);
            s.x = p1.x;
            s.y = p1.y;
            s.w = p2.x - p1.x;
            s.h = p2.y - p1.y;
          } else if (startShape) {
            const endPt = { x: s.x + s.w, y: s.y + s.h };
            const p1 = computeEdgeAnchorPoint(startShape, endPt.x, endPt.y);
            s.x = p1.x;
            s.y = p1.y;
            s.w = endPt.x - p1.x;
            s.h = endPt.y - p1.y;
          } else if (endShape) {
            const startPt = { x: s.x, y: s.y };
            const p2 = computeEdgeAnchorPoint(endShape, startPt.x, startPt.y);
            s.w = p2.x - startPt.x;
            s.h = p2.y - startPt.y;
          }
        });
      }

      function getBoxHandles(b) {
        return [
          { id: 'nw', x: b.x, y: b.y },
          { id: 'n', x: b.x + b.w / 2, y: b.y },
          { id: 'ne', x: b.x + b.w, y: b.y },
          { id: 'e', x: b.x + b.w, y: b.y + b.h / 2 },
          { id: 'se', x: b.x + b.w, y: b.y + b.h },
          { id: 's', x: b.x + b.w / 2, y: b.y + b.h },
          { id: 'sw', x: b.x, y: b.y + b.h },
          { id: 'w', x: b.x, y: b.y + b.h / 2 }
        ];
      }

      function getResizeHandles(s) {
        if (s.type === 'arrow' || s.type === 'line') {
          return [
            { id: 'start', x: s.x, y: s.y },
            { id: 'end', x: s.x + s.w, y: s.y + s.h }
          ];
        }
        return getBoxHandles(getNormalizedBox(s));
      }

      function hitTestGroupTransformHandle(wx, wy) {
        if (app.selectedIds.size < 2 && !app.freeTransformActive) return null;
        const gb = getSelectionGroupBox();
        if (!gb) return null;
        const handles = getBoxHandles(gb);
        const radius = 9 / app.camera.zoom;
        for (let i = 0; i < handles.length; i++) {
          if (Math.hypot(wx - handles[i].x, wy - handles[i].y) <= radius) {
            return { groupBox: gb, handleId: handles[i].id };
          }
        }
        return null;
      }

      function hitTestResizeHandle(wx, wy) {
        if (app.selectedIds.size !== 1) return null;
        const selId = Array.from(app.selectedIds)[0];
        const s = app.shapes.find(function (item) { return item.id === selId; });
        if (!s) return null;
        const handles = getResizeHandles(s);
        const radius = 9 / app.camera.zoom;
        for (let i = 0; i < handles.length; i++) {
          if (Math.hypot(wx - handles[i].x, wy - handles[i].y) <= radius) {
            return { shape: s, handleId: handles[i].id };
          }
        }
        return null;
      }

      /* ============================================================================
       * 7. HTML5 2D CANVAS RENDERER (With Border-Gap Edge Headings, Cells Table,
       *    Auto-Layout Wrapped Text, and 4-Edge '+' Hover Icons)
       * ============================================================================ */
      function resizeCanvasToViewport() {
        const rect = viewportEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        renderCanvas();
        triggerAutoSave();
      }

      function drawHachureFill(b, color) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(b.x, b.y, b.w, b.h);
        ctx.clip();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1.2;
        for (let x = b.x - b.h; x < b.x + b.w + b.h; x += 9) {
          ctx.beginPath();
          ctx.moveTo(x, b.y + b.h);
          ctx.lineTo(x + b.h, b.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      function applyShapeDash(s) {
        const sw = s.strokeWidth || 2;
        if (s.strokeDash === 'dashed') {
          ctx.setLineDash([sw * 3.2, sw * 2]);
        } else if (s.strokeDash === 'dotted') {
          ctx.setLineDash([sw * 0.8, sw * 2.2]);
        } else if (s.type === 'frame') {
          ctx.setLineDash([6, 4]);
        } else {
          ctx.setLineDash([]);
        }
      }

      /* Render Border-Gap Edge Headings (Top, Right, Bottom, Left)
       * Blanks out the middle section of that edge's border line and renders the heading text right inside the gap! */
      function renderEdgeLabelsWithBorderGap(s, b, strokeCol) {
        if (!s.edgeLabels) return;
        const sides = ['top', 'right', 'bottom', 'left'];
        ctx.save();
        ctx.setLineDash([]);
        const fs = Math.max(11, Math.round((s.fontSize || 13) * 0.9));
        ctx.font = buildCanvasFont(s, fs);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const bgMaskColor = (s.fillMode === 'solid' && s.type !== 'frame') ? '#14171C' : '#0D0E11';

        sides.forEach(function (side) {
          const txt = s.edgeLabels[side];
          if (!txt) return;
          const tw = ctx.measureText(txt).width + 14;
          const th = fs + 6;
          let gx = b.x + b.w / 2;
          let gy = b.y;

          if (side === 'top') { gx = b.x + b.w / 2; gy = b.y; }
          else if (side === 'bottom') { gx = b.x + b.w / 2; gy = b.y + b.h; }
          else if (side === 'left') { gx = b.x; gy = b.y + b.h / 2; }
          else if (side === 'right') { gx = b.x + b.w; gy = b.y + b.h / 2; }

          // Blank out the border line segment behind the edge text so the text sits seamlessly inside the border gap!
          ctx.fillStyle = '#0D0E11';
          ctx.fillRect(gx - tw / 2, gy - th / 2, tw, th);
          if (s.fillMode === 'solid' && s.type === 'rect') {
            ctx.fillStyle = bgMaskColor;
            if (side === 'top') ctx.fillRect(gx - tw / 2, gy, tw, th / 2);
            if (side === 'bottom') ctx.fillRect(gx - tw / 2, gy - th / 2, tw, th / 2);
          }

          ctx.fillStyle = strokeCol;
          ctx.fillText(txt, gx, gy);
        });
        ctx.restore();
      }

      /* Render Interactive Cells Table ('table') */
      function renderTableShape(s, b, strokeCol, sw, isSelected) {
        const rows = Math.max(1, s.rows || 3);
        const cols = Math.max(1, s.cols || 3);
        if (!s.cells) {
          s.cells = [];
          for (let r = 0; r < rows; r++) {
            const rowArr = [];
            for (let c = 0; c < cols; c++) {
              rowArr.push(r === 0 ? ('Header ' + (c + 1)) : '');
            }
            s.cells.push(rowArr);
          }
        }
        const cellW = b.w / cols;
        const cellH = b.h / rows;

        ctx.save();
        ctx.setLineDash([]);
        // Table Background
        ctx.fillStyle = '#14171C';
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 6);
        ctx.fill();

        // Header Row Tint
        ctx.fillStyle = 'rgba(226, 241, 99, 0.1)';
        ctx.fillRect(b.x, b.y, b.w, cellH);

        // Grid Lines
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = sw;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 6);
        for (let r = 1; r < rows; r++) {
          const ry = b.y + r * cellH;
          ctx.moveTo(b.x, ry);
          ctx.lineTo(b.x + b.w, ry);
        }
        for (let c = 1; c < cols; c++) {
          const cx = b.x + c * cellW;
          ctx.moveTo(cx, b.y);
          ctx.lineTo(cx, b.y + b.h);
        }
        ctx.stroke();

        // Cell Contents
        const fs = s.fontSize || 12.5;
        ctx.font = buildCanvasFont(s, fs);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = (s.cells[r] && s.cells[r][c]) ? s.cells[r][c] : '';
            if (!val) continue;
            if (app.editingShapeId === s.id && app.editingTargetMeta && app.editingTargetMeta.mode === 'cell' && app.editingTargetMeta.row === r && app.editingTargetMeta.col === c) {
              continue;
            }
            ctx.fillStyle = r === 0 ? '#E2F163' : '#F2F4F8';
            ctx.fillText(val, b.x + c * cellW + cellW / 2, b.y + r * cellH + cellH / 2, Math.max(16, cellW - 10));
          }
        }

        // If selected, draw "+ Col" and "+ Row" quick badges
        if (isSelected) {
          const r = 9 / app.camera.zoom;
          const addColPt = { x: b.x + b.w + 14 / app.camera.zoom, y: b.y + 14 / app.camera.zoom };
          const addRowPt = { x: b.x + 14 / app.camera.zoom, y: b.y + b.h + 14 / app.camera.zoom };
          [addColPt, addRowPt].forEach(function (pt) {
            ctx.fillStyle = '#E2F163';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0D0E11';
            ctx.lineWidth = 1.6 / app.camera.zoom;
            const arm = 4 / app.camera.zoom;
            ctx.beginPath();
            ctx.moveTo(pt.x - arm, pt.y);
            ctx.lineTo(pt.x + arm, pt.y);
            ctx.moveTo(pt.x, pt.y - arm);
            ctx.lineTo(pt.x, pt.y + arm);
            ctx.stroke();
          });
        }

        ctx.restore();
      }

      function renderShape(s, isSelected) {
        ctx.save();
        const strokeCol = s.stroke || '#F2F4F8';
        const sw = Number(s.strokeWidth) || 2;
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = sw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        applyShapeDash(s);

        const b = getNormalizedBox(s);
        const fillStyle = s.fillMode || 'solid';

        if (s.type === 'table') {
          renderTableShape(s, b, strokeCol, sw, isSelected);
        } else if (s.type === 'sticky') {
          ctx.setLineDash([]);
          const noteColor = s.stickyColor || (s.stroke && s.stroke !== '#F2F4F8' ? s.stroke : '#FEF08A');
          const fold = Math.min(18, Math.max(10, Math.min(b.w, b.h) * 0.14));

          ctx.fillStyle = noteColor;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x + b.w, b.y);
          ctx.lineTo(b.x + b.w, b.y + b.h - fold);
          ctx.lineTo(b.x + b.w - fold, b.y + b.h);
          ctx.lineTo(b.x, b.y + b.h);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
          ctx.beginPath();
          ctx.moveTo(b.x + b.w - fold, b.y + b.h);
          ctx.lineTo(b.x + b.w, b.y + b.h - fold);
          ctx.lineTo(b.x + b.w - fold, b.y + b.h - fold);
          ctx.closePath();
          ctx.fill();

          if (s.text && !(s.id === app.editingShapeId && app.editingTargetMeta && app.editingTargetMeta.mode === 'body')) {
            ctx.fillStyle = '#111317';
            const baseFs = s.fontSize || 15;
            const fontSpec = buildCanvasFont(s, baseFs);
            const wrapped = wrapTextIntoLines(s.text, b.w - 24, fontSpec);
            ctx.font = fontSpec;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const fs = s.fontFamily === 'hand' ? Math.round(baseFs * 1.22) : baseFs;
            const lh = fs * 1.28;
            wrapped.forEach(function (line, i) {
              ctx.fillText(line, b.x + 12, b.y + 12 + i * lh);
            });
          }
        } else if (s.type === 'image' && s.dataUrl) {
          const img = getOrLoadImage(s.dataUrl);
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 6);
          ctx.clip();
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, b.x, b.y, b.w, b.h);
          } else {
            ctx.fillStyle = '#121418';
            ctx.fillRect(b.x, b.y, b.w, b.h);
          }
          ctx.restore();
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 6);
          ctx.stroke();
        } else if (s.type === 'rect') {
          if (fillStyle === 'solid') {
            ctx.fillStyle = '#14171C';
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 6);
            ctx.fill();
          } else if (fillStyle === 'hachure') {
            drawHachureFill(b, strokeCol);
          }
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 6);
          ctx.stroke();
        } else if (s.type === 'frame') {
          ctx.fillStyle = 'rgba(20, 23, 28, 0.25)';
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 6);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
          if (s.text && !(s.id === app.editingShapeId && app.editingTargetMeta && app.editingTargetMeta.mode === 'body')) {
            ctx.fillStyle = strokeCol;
            ctx.font = buildCanvasFont(s, 11);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(s.text, b.x + 8, b.y - 5);
          }
        } else if (s.type === 'diamond') {
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          ctx.beginPath();
          ctx.moveTo(cx, b.y);
          ctx.lineTo(b.x + b.w, cy);
          ctx.lineTo(cx, b.y + b.h);
          ctx.lineTo(b.x, cy);
          ctx.closePath();
          if (fillStyle === 'solid') {
            ctx.fillStyle = '#14171C';
            ctx.fill();
          } else if (fillStyle === 'hachure') {
            drawHachureFill(b, strokeCol);
          }
          ctx.stroke();
        } else if (s.type === 'ellipse') {
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(2, b.w / 2), Math.max(2, b.h / 2), 0, 0, Math.PI * 2);
          if (fillStyle === 'solid') {
            ctx.fillStyle = '#14171C';
            ctx.fill();
          } else if (fillStyle === 'hachure') {
            drawHachureFill(b, strokeCol);
          }
          ctx.stroke();
        } else if (s.type === 'cylinder') {
          const ry = Math.min(16, Math.max(6, b.h * 0.16));
          const cx = b.x + b.w / 2;
          if (fillStyle === 'solid') {
            ctx.fillStyle = '#14171C';
            ctx.beginPath();
            ctx.ellipse(cx, b.y + ry, b.w / 2, ry, 0, 0, Math.PI * 2);
            ctx.rect(b.x, b.y + ry, b.w, Math.max(1, b.h - ry * 2));
            ctx.ellipse(cx, b.y + b.h - ry, b.w / 2, ry, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.ellipse(cx, b.y + ry, Math.max(2, b.w / 2), ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(b.x, b.y + ry);
          ctx.lineTo(b.x, b.y + b.h - ry);
          ctx.ellipse(cx, b.y + b.h - ry, Math.max(2, b.w / 2), ry, 0, Math.PI, 0, true);
          ctx.lineTo(b.x + b.w, b.y + ry);
          ctx.stroke();
        } else if (s.type === 'arrow' || s.type === 'line') {
          const x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          if (s.type === 'arrow') {
            ctx.setLineDash([]);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = Math.max(10, sw * 3.2);
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
          }

          if (s.text && !(s.id === app.editingShapeId && app.editingTargetMeta && app.editingTargetMeta.mode === 'body')) {
            ctx.setLineDash([]);
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const fs = s.fontSize || 11.5;
            ctx.font = buildCanvasFont(s, fs);
            const tw = ctx.measureText(s.text).width + 12;
            ctx.fillStyle = '#0D0E11';
            ctx.fillRect(mx - tw / 2, my - (fs * 0.8), tw, fs * 1.6);
            ctx.fillStyle = '#F2F4F8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.text, mx, my);
          }
        } else if (s.type === 'freedraw' && s.points && s.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length - 1; i++) {
            const xc = (s.points[i].x + s.points[i + 1].x) / 2;
            const yc = (s.points[i].y + s.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, xc, yc);
          }
          const last = s.points[s.points.length - 1];
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        } else if (s.type === 'text' && !(s.id === app.editingShapeId && app.editingTargetMeta && app.editingTargetMeta.mode === 'body') && s.text) {
          // Auto-Layout Wrapped Text Rendering!
          ctx.setLineDash([]);
          ctx.fillStyle = strokeCol;
          const baseFs = s.fontSize || 16;
          const fontSpec = buildCanvasFont(s, baseFs);
          const wrappedLines = wrapTextIntoLines(s.text, b.w - 8, fontSpec);
          ctx.font = fontSpec;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          const effectiveFs = s.fontFamily === 'hand' ? Math.round(baseFs * 1.22) : baseFs;
          wrappedLines.forEach(function (ln, idx) {
            ctx.fillText(ln, b.x + 4, b.y + 4 + idx * (effectiveFs * 1.32));
          });
        }

        // Centered Auto-Wrapped Body Text Inside Geometric Shapes
        if (['rect', 'diamond', 'ellipse', 'cylinder'].includes(s.type) && s.text && !(s.id === app.editingShapeId && app.editingTargetMeta && app.editingTargetMeta.mode === 'body')) {
          ctx.setLineDash([]);
          ctx.fillStyle = '#F2F4F8';
          const baseFs = s.fontSize || 13.5;
          const fontSpec = buildCanvasFont(s, baseFs);
          const wrappedLines = wrapTextIntoLines(s.text, b.w - 18, fontSpec);
          ctx.font = fontSpec;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const effectiveFs = s.fontFamily === 'hand' ? Math.round(baseFs * 1.22) : baseFs;
          const lh = effectiveFs * 1.25;
          const startY = b.y + b.h / 2 - ((wrappedLines.length - 1) * lh) / 2;
          wrappedLines.forEach(function (line, i) {
            ctx.fillText(line, b.x + b.w / 2, startY + i * lh);
          });
        }

        // Render Border-Gap Edge Headings on Top, Right, Bottom, Left!
        renderEdgeLabelsWithBorderGap(s, b, strokeCol);

        // Single-shape Selection Outline & 8 Resize Handles
        if (isSelected && app.selectedIds.size === 1 && !app.freeTransformActive) {
          ctx.setLineDash([]);
          ctx.strokeStyle = '#58C4DC';
          ctx.lineWidth = 1.2 / app.camera.zoom;
          if (s.type !== 'arrow' && s.type !== 'line') {
            ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
          }
          const hs = 7 / app.camera.zoom;
          getResizeHandles(s).forEach(function (h) {
            ctx.fillStyle = '#0D0E11';
            ctx.strokeStyle = '#58C4DC';
            ctx.lineWidth = 1.5 / app.camera.zoom;
            ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
            ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          });
        }

        // Render 4-Edge '+' Quick Action Icons when Hovered or Selected!
        if (app.showEdgePlusHandles && isBoxWithEdgePlus(s) && (app.hoveredShapeId === s.id || (isSelected && app.selectedIds.size === 1))) {
          ctx.setLineDash([]);
          const plusCenters = getShapeFourEdgePlusCenters(s);
          const pr = 8.5 / app.camera.zoom;
          const arm = 3.8 / app.camera.zoom;
          plusCenters.forEach(function (c) {
            const isHoveredEdge = (app.hoveredShapeId === s.id && app.hoveredEdgeSide === c.side);
            ctx.fillStyle = isHoveredEdge ? '#E2F163' : '#181B22';
            ctx.strokeStyle = isHoveredEdge ? '#0D0E11' : '#58C4DC';
            ctx.lineWidth = 1.4 / app.camera.zoom;
            ctx.beginPath();
            ctx.arc(c.x, c.y, pr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // '+' glyph inside circle
            ctx.strokeStyle = isHoveredEdge ? '#0D0E11' : '#F2F4F8';
            ctx.lineWidth = 1.6 / app.camera.zoom;
            ctx.beginPath();
            ctx.moveTo(c.x - arm, c.y);
            ctx.lineTo(c.x + arm, c.y);
            ctx.moveTo(c.x, c.y - arm);
            ctx.lineTo(c.x, c.y + arm);
            ctx.stroke();
          });
        }

        ctx.restore();
      }

      function renderCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = '#0D0E11';
        ctx.fillRect(0, 0, width, height);

        const gridStep = 24 * app.camera.zoom;
        if (gridStep >= 10) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
          const offsetX = ((app.camera.x % gridStep) + gridStep) % gridStep;
          const offsetY = ((app.camera.y % gridStep) + gridStep) % gridStep;
          for (let x = offsetX; x < width; x += gridStep) {
            for (let y = offsetY; y < height; y += gridStep) {
              ctx.fillRect(x, y, 1.2, 1.2);
            }
          }
        }

        ctx.translate(app.camera.x, app.camera.y);
        ctx.scale(app.camera.zoom, app.camera.zoom);

        updateAttachedArrows();

        app.shapes.forEach(function (s) {
          if (s.type === 'frame') renderShape(s, app.selectedIds.has(s.id));
        });
        app.shapes.forEach(function (s) {
          if (s.type !== 'frame') renderShape(s, app.selectedIds.has(s.id));
        });

        if (app.selectedIds.size > 1 || (app.freeTransformActive && app.selectedIds.size >= 1)) {
          const gb = getSelectionGroupBox();
          if (gb) {
            ctx.save();
            ctx.strokeStyle = '#E2F163';
            ctx.lineWidth = 1.4 / app.camera.zoom;
            ctx.setLineDash([5 / app.camera.zoom, 3 / app.camera.zoom]);
            ctx.strokeRect(gb.x - 5, gb.y - 5, gb.w + 10, gb.h + 10);
            ctx.setLineDash([]);
            const hs = 8.5 / app.camera.zoom;
            getBoxHandles(gb).forEach(function (h) {
              ctx.fillStyle = '#E2F163';
              ctx.strokeStyle = '#0D0E11';
              ctx.lineWidth = 1.4 / app.camera.zoom;
              ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
              ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
            });
            ctx.restore();
          }
        }

        if (app.interaction.mode === 'marquee') {
          const x = Math.min(app.interaction.startWorld.x, app.interaction.currWorld.x);
          const y = Math.min(app.interaction.startWorld.y, app.interaction.currWorld.y);
          const w = Math.abs(app.interaction.currWorld.x - app.interaction.startWorld.x);
          const h = Math.abs(app.interaction.currWorld.y - app.interaction.startWorld.y);
          ctx.fillStyle = 'rgba(88, 196, 220, 0.1)';
          ctx.strokeStyle = '#58C4DC';
          ctx.lineWidth = 1 / app.camera.zoom;
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        }

        ctx.restore();
        document.getElementById('zoom-pct-readout').textContent = Math.round(app.camera.zoom * 100) + '%';
      }

      /* ============================================================================
       * 8. INLINE TEXT / EDGE HEADING / TABLE CELL EDITOR
       * ============================================================================ */
      function syncInlineEditorFontStyle(shape) {
        const famKey = (shape && shape.fontFamily) || app.fontFamily || 'sans';
        const isIt = (shape && typeof shape.fontItalic === 'boolean') ? shape.fontItalic : app.fontItalic;
        inlineEditor.style.fontFamily = FONT_STACKS[famKey] || FONT_STACKS.sans;
        inlineEditor.style.fontStyle = isIt ? 'italic' : 'normal';
        document.querySelectorAll('[data-inline-font]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-inline-font') === famKey);
        });
        document.getElementById('btn-inline-italic').classList.toggle('active', isIt);
      }

      function openInlineTextEditor(shape, targetMeta) {
        closeEdgePlusActionMenu();
        app.editingShapeId = shape.id;
        app.editingTargetMeta = targetMeta || { mode: 'body' };

        const b = getNormalizedBox(shape);
        let cx = shape.type === 'arrow' || shape.type === 'line' ? (shape.x + shape.w / 2) : (b.x + b.w / 2);
        let cy = shape.type === 'arrow' || shape.type === 'line' ? (shape.y + shape.h / 2) : (b.y + b.h / 2);
        let initialValue = shape.text || '';

        if (app.editingTargetMeta.mode === 'edge') {
          const side = app.editingTargetMeta.side;
          if (!shape.edgeLabels) shape.edgeLabels = {};
          initialValue = shape.edgeLabels[side] || '';
          if (side === 'top') { cx = b.x + b.w / 2; cy = b.y; }
          else if (side === 'bottom') { cx = b.x + b.w / 2; cy = b.y + b.h; }
          else if (side === 'left') { cx = b.x; cy = b.y + b.h / 2; }
          else if (side === 'right') { cx = b.x + b.w; cy = b.y + b.h / 2; }
        } else if (app.editingTargetMeta.mode === 'cell') {
          const r = app.editingTargetMeta.row;
          const c = app.editingTargetMeta.col;
          const rows = Math.max(1, shape.rows || 3);
          const cols = Math.max(1, shape.cols || 3);
          const cellW = b.w / cols;
          const cellH = b.h / rows;
          cx = b.x + c * cellW + cellW / 2;
          cy = b.y + r * cellH + cellH / 2;
          initialValue = (shape.cells && shape.cells[r] && shape.cells[r][c]) ? shape.cells[r][c] : '';
        }

        const scr = worldToScreen(cx, cy);
        const boxW = app.editingTargetMeta.mode === 'edge' ? 160 : Math.max(160, Math.min(340, (b.w + 24) * app.camera.zoom));
        const boxH = app.editingTargetMeta.mode === 'edge' ? 42 : Math.max(54, Math.min(200, (b.h + 16) * app.camera.zoom));

        inlineShell.classList.remove('hidden');
        inlineShell.style.left = Math.max(8, Math.round(scr.x - boxW / 2)) + 'px';
        inlineShell.style.top = Math.max(8, Math.round(scr.y - boxH / 2 - 28)) + 'px';
        inlineEditor.style.width = Math.round(boxW) + 'px';
        inlineEditor.style.height = Math.round(boxH) + 'px';
        inlineEditor.style.fontSize = Math.max(13, Math.round((shape.fontSize || 15) * app.camera.zoom)) + 'px';
        inlineEditor.style.textAlign = (shape.type === 'sticky' || shape.type === 'text') && app.editingTargetMeta.mode === 'body' ? 'left' : 'center';
        inlineEditor.value = initialValue;
        syncInlineEditorFontStyle(shape);
        renderCanvas();
        triggerAutoSave();
        setTimeout(function () {
          inlineEditor.focus();
          const len = inlineEditor.value.length;
          inlineEditor.setSelectionRange(len, len);
        }, 15);
      }

      function commitInlineTextEditor() {
        if (!app.editingShapeId) return;
        const s = app.shapes.find(function (item) { return item.id === app.editingShapeId; });
        const meta = app.editingTargetMeta || { mode: 'body' };
        if (s) {
          const val = inlineEditor.value.replace(/^\n+|\n+$/g, '');
          if (meta.mode === 'edge') {
            if (!s.edgeLabels) s.edgeLabels = {};
            s.edgeLabels[meta.side] = val.trim();
          } else if (meta.mode === 'cell') {
            if (s.cells && s.cells[meta.row]) {
              s.cells[meta.row][meta.col] = val.trim();
            }
          } else {
            s.text = val;
            if (s.type === 'text' && !s.text.trim()) {
              app.shapes = app.shapes.filter(function (item) { return item.id !== s.id; });
              sheets[app.currentSheetIdx].shapes = app.shapes;
            }
          }
        }
        app.editingShapeId = null;
        app.editingTargetMeta = null;
        inlineShell.classList.add('hidden');
        renderCanvas();
        triggerAutoSave();
        triggerAutoSave();
      }

      inlineShell.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      inlineShell.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      inlineShell.addEventListener('click', function (e) { e.stopPropagation(); });

      inlineEditor.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
          e.preventDefault();
          commitInlineTextEditor();
          return;
        }
        // In table cell mode, pressing Tab jumps to the next cell cleanly!
        if (e.key === 'Tab' && app.editingTargetMeta && app.editingTargetMeta.mode === 'cell') {
          e.preventDefault();
          const s = app.shapes.find(function (item) { return item.id === app.editingShapeId; });
          if (!s) return;
          const r = app.editingTargetMeta.row;
          const c = app.editingTargetMeta.col;
          const rows = s.rows || 3;
          const cols = s.cols || 3;
          commitInlineTextEditor();
          const nextC = (c + 1) % cols;
          const nextR = (c + 1 >= cols) ? ((r + 1) % rows) : r;
          openInlineTextEditor(s, { mode: 'cell', row: nextR, col: nextC });
        }
      });
      inlineEditor.addEventListener('keyup', function (e) { e.stopPropagation(); });
      inlineEditor.addEventListener('input', function () {
        const s = app.shapes.find(function (item) { return item.id === app.editingShapeId; });
        const meta = app.editingTargetMeta || { mode: 'body' };
        if (s) {
          if (meta.mode === 'edge') {
            if (!s.edgeLabels) s.edgeLabels = {};
            s.edgeLabels[meta.side] = inlineEditor.value;
          } else if (meta.mode === 'cell') {
            if (s.cells && s.cells[meta.row]) s.cells[meta.row][meta.col] = inlineEditor.value;
          } else {
            s.text = inlineEditor.value;
          }
          renderCanvas();
        triggerAutoSave();
        }
      });

      document.getElementById('btn-inline-done').addEventListener('click', function () {
        commitInlineTextEditor();
      });

      document.querySelectorAll('[data-inline-font]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const fam = btn.getAttribute('data-inline-font');
          setFontFamilyChoice(fam);
          const s = app.shapes.find(function (item) { return item.id === app.editingShapeId; });
          if (s) {
            s.fontFamily = fam;
            syncInlineEditorFontStyle(s);
          }
          inlineEditor.focus();
        });
      });

      document.getElementById('btn-inline-italic').addEventListener('click', function () {
        app.fontItalic = !app.fontItalic;
        const s = app.shapes.find(function (item) { return item.id === app.editingShapeId; });
        if (s) {
          s.fontItalic = !s.fontItalic;
          syncInlineEditorFontStyle(s);
        }
        inlineEditor.focus();
      });

      /* ============================================================================
       * 9. 4-EDGE '+' POPOVER BUTTON ACTIONS
       * ============================================================================ */
      edgePlusMenu.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

      // Action 1: Write Border-Gap Heading Text on that Edge (Top, Right, Bottom, or Left)
      document.getElementById('btn-edge-write-text').addEventListener('click', function () {
        if (!app.activeEdgeMenuTarget) return;
        const s = app.shapes.find(function (item) { return item.id === app.activeEdgeMenuTarget.shapeId; });
        const side = app.activeEdgeMenuTarget.side;
        closeEdgePlusActionMenu();
        if (s) {
          openInlineTextEditor(s, { mode: 'edge', side: side });
        }
      });

      // Action 2: Start Connecting an Arrow from that Edge to Another Box
      document.getElementById('btn-edge-connect-box').addEventListener('click', function () {
        if (!app.activeEdgeMenuTarget) return;
        const s = app.shapes.find(function (item) { return item.id === app.activeEdgeMenuTarget.shapeId; });
        const side = app.activeEdgeMenuTarget.side;
        closeEdgePlusActionMenu();
        if (!s) return;

        pushUndoState();
        const b = getNormalizedBox(s);
        let ax = b.x + b.w / 2, ay = b.y + b.h / 2;
        if (side === 'top') { ax = b.x + b.w / 2; ay = b.y; }
        else if (side === 'bottom') { ax = b.x + b.w / 2; ay = b.y + b.h; }
        else if (side === 'left') { ax = b.x; ay = b.y + b.h / 2; }
        else if (side === 'right') { ax = b.x + b.w; ay = b.y + b.h / 2; }

        const newArrow = {
          id: 'shp_arrow_' + Date.now(),
          type: 'arrow',
          x: ax,
          y: ay,
          w: side === 'left' ? -90 : (side === 'right' ? 90 : 0),
          h: side === 'top' ? -90 : (side === 'bottom' ? 90 : 0),
          text: '',
          fontSize: 12,
          fontFamily: app.fontFamily,
          stroke: app.strokeColor,
          strokeWidth: app.strokeWidth,
          strokeDash: app.strokeDash,
          fillMode: 'none',
          startBindId: s.id,
          endBindId: null
        };
        app.shapes.push(newArrow);
        app.selectedIds.clear();
        app.selectedIds.add(newArrow.id);
        setTool('select');
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      });

      // Action 3: Spawn & Connect a New Box in that Direction (Top, Right, Bottom, or Left)
      document.getElementById('btn-edge-spawn-box').addEventListener('click', function () {
        if (!app.activeEdgeMenuTarget) return;
        const s = app.shapes.find(function (item) { return item.id === app.activeEdgeMenuTarget.shapeId; });
        const side = app.activeEdgeMenuTarget.side;
        closeEdgePlusActionMenu();
        if (!s) return;

        pushUndoState();
        const b = getNormalizedBox(s);
        const gap = 80;
        let nx = b.x, ny = b.y;
        if (side === 'right') nx = b.x + b.w + gap;
        else if (side === 'left') nx = b.x - b.w - gap;
        else if (side === 'bottom') ny = b.y + b.h + gap;
        else if (side === 'top') ny = b.y - b.h - gap;

        const spawnedBox = {
          id: 'shp_spawn_' + Date.now(),
          type: s.type === 'sticky' || s.type === 'table' ? 'rect' : s.type,
          x: snapVal(nx),
          y: snapVal(ny),
          w: b.w,
          h: b.h,
          text: '',
          fontSize: s.fontSize || 14,
          fontFamily: s.fontFamily || app.fontFamily,
          fontItalic: s.fontItalic,
          stroke: s.stroke || app.strokeColor,
          strokeWidth: s.strokeWidth || app.strokeWidth,
          strokeDash: s.strokeDash || app.strokeDash,
          fillMode: s.fillMode || app.fillMode
        };

        const connArrow = {
          id: 'shp_conn_' + Date.now(),
          type: 'arrow',
          x: 0,
          y: 0,
          w: 80,
          h: 0,
          text: '',
          fontSize: 12,
          fontFamily: app.fontFamily,
          stroke: s.stroke || app.strokeColor,
          strokeWidth: s.strokeWidth || app.strokeWidth,
          fillMode: 'none',
          startBindId: s.id,
          endBindId: spawnedBox.id
        };

        app.shapes.push(spawnedBox, connArrow);
        app.selectedIds.clear();
        app.selectedIds.add(spawnedBox.id);
        setTool('select');
        renderCanvas();
        triggerAutoSave();
        openInlineTextEditor(spawnedBox, { mode: 'body' });
      });

      /* ============================================================================
       * 10. CANVAS POINTER INTERACTIONS
       * ============================================================================ */
      function snapshotSelectedShapes() {
        const map = new Map();
        app.shapes.forEach(function (s) {
          if (app.selectedIds.has(s.id)) {
            const nb = getNormalizedBox(s);
            map.set(s.id, {
              x: s.type === 'arrow' || s.type === 'line' ? s.x : nb.x,
              y: s.type === 'arrow' || s.type === 'line' ? s.y : nb.y,
              w: s.type === 'arrow' || s.type === 'line' ? s.w : nb.w,
              h: s.type === 'arrow' || s.type === 'line' ? s.h : nb.h,
              fontSize: s.fontSize || (s.type === 'text' ? 16 : 14),
              strokeWidth: s.strokeWidth || 2,
              points: s.points ? JSON.parse(JSON.stringify(s.points)) : null
            });
          }
        });
        return map;
      }

      canvas.addEventListener('pointerdown', function (e) {
        closeAllPopovers();
        closeEdgePlusActionMenu();
        if (app.editingShapeId) {
          commitInlineTextEditor();
          return;
        }

        canvas.setPointerCapture(e.pointerId);
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);

        app.lastMouseWorld = { x: world.x, y: world.y };
        app.interaction.startScreen = { x: sx, y: sy };
        app.interaction.startWorld = { x: world.x, y: world.y };
        app.interaction.currWorld = { x: world.x, y: world.y };
        app.interaction.altClonedDuringDrag = false;

        if (app.activeTool === 'pan' || e.button === 1 || app.interaction.spacePressed) {
          app.interaction.mode = 'panning';
          app.interaction.initialCamera = { x: app.camera.x, y: app.camera.y };
          canvas.className = 'cursor-panning';
          return;
        }

        // Check if user clicked a Table "+ Col" or "+ Row" handle
        const tableHandle = hitTestTableAddRowColHandles(world.x, world.y);
        if (tableHandle) {
          pushUndoState();
          const tbl = tableHandle.shape;
          if (tableHandle.action === 'add_col') {
            tbl.cols = (tbl.cols || 3) + 1;
            tbl.w += 70;
            tbl.cells.forEach(function (rowArr, rIdx) {
              rowArr.push(rIdx === 0 ? ('Header ' + tbl.cols) : '');
            });
          } else if (tableHandle.action === 'add_row') {
            tbl.rows = (tbl.rows || 3) + 1;
            tbl.h += 36;
            const newRow = [];
            for (let c = 0; c < (tbl.cols || 3); c++) newRow.push('');
            tbl.cells.push(newRow);
          }
          renderCanvas();
        triggerAutoSave();
          pulseFeedback();
          return;
        }

        // Check if user clicked any of the 4-Edge '+' Quick Action Handles on a box!
        const edgePlusHit = hitTestEdgePlusHandle(world.x, world.y);
        if (edgePlusHit) {
          app.selectedIds.clear();
          app.selectedIds.add(edgePlusHit.shape.id);
          renderCanvas();
        triggerAutoSave();
          openEdgePlusActionMenu(edgePlusHit.shape, edgePlusHit.side, edgePlusHit.x, edgePlusHit.y);
          return;
        }

        if (app.activeTool === 'eraser') {
          pushUndoState();
          app.interaction.mode = 'erasing';
          const hit = findTopShapeAt(world.x, world.y, false);
          if (hit) {
            app.shapes = app.shapes.filter(function (s) { return s.id !== hit.id; });
            sheets[app.currentSheetIdx].shapes = app.shapes;
            app.selectedIds.delete(hit.id);
            renderCanvas();
        triggerAutoSave();
          }
          return;
        }

        if (app.activeTool === 'sticky') {
          pushUndoState();
          const stickyColors = ['#FEF08A', '#A7F3D0', '#BAE6FD', '#FECDD3', '#DDD6FE'];
          const pickedStickyCol = (app.strokeColor && app.strokeColor !== '#F2F4F8')
            ? app.strokeColor
            : stickyColors[app.shapes.length % stickyColors.length];
          const stickyShape = {
            id: 'sticky_' + Date.now(),
            type: 'sticky',
            x: snapVal(world.x - 85),
            y: snapVal(world.y - 75),
            w: 175,
            h: 155,
            text: '',
            fontSize: 16,
            fontFamily: app.fontFamily || 'hand',
            fontItalic: app.fontItalic,
            stickyColor: pickedStickyCol,
            stroke: pickedStickyCol,
            strokeWidth: 2,
            fillMode: 'solid',
            edgeLabels: {}
          };
          app.shapes.push(stickyShape);
          app.selectedIds.clear();
          app.selectedIds.add(stickyShape.id);
          setTool('select');
          renderCanvas();
        triggerAutoSave();
          openInlineTextEditor(stickyShape, { mode: 'body' });
          return;
        }

        if (app.activeTool === 'text') {
          const existing = findTopShapeAt(world.x, world.y, false);
          if (existing && existing.type !== 'image') {
            openInlineTextEditor(existing, { mode: 'body' });
            setTool('select');
            return;
          }
          pushUndoState();
          const newTextShape = {
            id: 'shp_' + Date.now(),
            type: 'text',
            x: snapVal(world.x),
            y: snapVal(world.y),
            w: 180,
            h: 36,
            text: '',
            fontSize: 18,
            fontFamily: app.fontFamily,
            fontItalic: app.fontItalic,
            stroke: app.strokeColor,
            strokeWidth: app.strokeWidth,
            strokeDash: app.strokeDash,
            fillMode: 'none'
          };
          app.shapes.push(newTextShape);
          app.selectedIds.clear();
          app.selectedIds.add(newTextShape.id);
          setTool('select');
          openInlineTextEditor(newTextShape, { mode: 'body' });
          return;
        }

        if (app.activeTool === 'select') {
          const groupHit = hitTestGroupTransformHandle(world.x, world.y);
          if (groupHit) {
            pushUndoState();
            app.interaction.mode = 'group_transform';
            app.interaction.resizeHandle = groupHit.handleId;
            app.interaction.initialGroupBox = groupHit.groupBox;
            app.interaction.initialSnapshots = snapshotSelectedShapes();
            return;
          }

          const handleHit = hitTestResizeHandle(world.x, world.y);
          if (handleHit) {
            pushUndoState();
            app.interaction.mode = 'resizing';
            app.interaction.activeShape = handleHit.shape;
            app.interaction.resizeHandle = handleHit.handleId;
            if (handleHit.shape.type === 'arrow' || handleHit.shape.type === 'line') {
              app.interaction.initialBounds = {
                x: handleHit.shape.x,
                y: handleHit.shape.y,
                w: handleHit.shape.w,
                h: handleHit.shape.h,
                fontSize: handleHit.shape.fontSize || 12,
                strokeWidth: handleHit.shape.strokeWidth || 2
              };
            } else {
              const nb = getNormalizedBox(handleHit.shape);
              handleHit.shape.x = nb.x;
              handleHit.shape.y = nb.y;
              handleHit.shape.w = nb.w;
              handleHit.shape.h = nb.h;
              app.interaction.initialBounds = {
                x: nb.x,
                y: nb.y,
                w: nb.w,
                h: nb.h,
                fontSize: handleHit.shape.fontSize || (handleHit.shape.type === 'text' ? 16 : 14),
                strokeWidth: handleHit.shape.strokeWidth || 2
              };
            }
            return;
          }

          const hitShape = findTopShapeAt(world.x, world.y, false);
          if (hitShape) {
            // If Style Format Painter is armed, apply copied style immediately on click!
            if (app.stylePainterArmed && app.copiedStyle) {
              app.selectedIds.clear();
              app.selectedIds.add(hitShape.id);
              applyCopiedStyleToShape(hitShape);
              return;
            }

            if (!e.shiftKey && !app.selectedIds.has(hitShape.id)) {
              app.selectedIds.clear();
            }
            app.selectedIds.add(hitShape.id);
            syncUIWithSelectedShape(hitShape);
            pushUndoState();

            if (e.altKey) {
              const clonedSet = new Set();
              app.shapes.forEach(function (s) {
                if (app.selectedIds.has(s.id)) {
                  const copy = JSON.parse(JSON.stringify(s));
                  copy.id = 'shp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                  app.shapes.push(copy);
                  clonedSet.add(copy.id);
                }
              });
              app.selectedIds = clonedSet;
              app.interaction.altClonedDuringDrag = true;
            }

            app.interaction.mode = 'moving';
            app.interaction.initialSnapshots = snapshotSelectedShapes();
            renderCanvas();
        triggerAutoSave();
          } else {
            if (!e.shiftKey) {
              app.selectedIds.clear();
              app.freeTransformActive = false;
              document.getElementById('btn-free-transform').classList.remove('active');
            }
            app.interaction.mode = 'marquee';
            renderCanvas();
        triggerAutoSave();
          }
          return;
        }

        // Shape, Table, or Freehand Creation
        pushUndoState();
        app.interaction.mode = 'creating';
        const sxSnap = snapVal(world.x);
        const sySnap = snapVal(world.y);

        const newShape = {
          id: 'shp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          type: app.activeTool,
          x: sxSnap,
          y: sySnap,
          w: 0,
          h: 0,
          text: '',
          fontSize: 14,
          fontFamily: app.fontFamily,
          fontItalic: app.fontItalic,
          stroke: app.strokeColor,
          strokeWidth: app.strokeWidth,
          strokeDash: app.strokeDash,
          fillMode: app.fillMode,
          edgeLabels: {},
          rows: app.activeTool === 'table' ? 3 : undefined,
          cols: app.activeTool === 'table' ? 3 : undefined,
          cells: app.activeTool === 'table' ? [
            ['Col 1', 'Col 2', 'Col 3'],
            ['', '', ''],
            ['', '', '']
          ] : undefined,
          startBindId: null,
          endBindId: null,
          points: app.activeTool === 'freedraw' ? [{ x: world.x, y: world.y }] : null
        };

        if (app.activeTool === 'arrow' || app.activeTool === 'line') {
          const startTarget = findTopShapeAt(world.x, world.y, true);
          if (startTarget) newShape.startBindId = startTarget.id;
        }

        app.shapes.push(newShape);
        app.interaction.activeShape = newShape;
        app.selectedIds.clear();
        app.selectedIds.add(newShape.id);
        renderCanvas();
      });

      canvas.addEventListener('pointermove', function (e) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        app.lastMouseWorld = { x: world.x, y: world.y };
        app.interaction.currWorld = { x: world.x, y: world.y };

        // Hover Tracking for 4-Edge '+' Quick Action Handles when idle
        if (app.interaction.mode === 'none') {
          const edgeHit = hitTestEdgePlusHandle(world.x, world.y);
          if (edgeHit) {
            const changed = app.hoveredShapeId !== edgeHit.shape.id || app.hoveredEdgeSide !== edgeHit.side;
            app.hoveredShapeId = edgeHit.shape.id;
            app.hoveredEdgeSide = edgeHit.side;
            canvas.className = 'cursor-pointer';
            if (changed) renderCanvas();
            return;
          }
          const topHit = findTopShapeAt(world.x, world.y, true);
          const nextHoverId = (topHit && isBoxWithEdgePlus(topHit)) ? topHit.id : null;
          if (nextHoverId !== app.hoveredShapeId || app.hoveredEdgeSide !== null) {
            app.hoveredShapeId = nextHoverId;
            app.hoveredEdgeSide = null;
            canvas.className = app.activeTool === 'pan' ? 'cursor-pan' : (app.activeTool === 'select' ? 'cursor-select' : '');
            renderCanvas();
        triggerAutoSave();
          }
          return;
        }

        if (app.interaction.mode === 'panning') {
          app.camera.x = app.interaction.initialCamera.x + (sx - app.interaction.startScreen.x);
          app.camera.y = app.interaction.initialCamera.y + (sy - app.interaction.startScreen.y);
          renderCanvas();
        triggerAutoSave();
          return;
        }

        if (app.interaction.mode === 'erasing') {
          const hit = findTopShapeAt(world.x, world.y, false);
          if (hit) {
            app.shapes = app.shapes.filter(function (s) { return s.id !== hit.id; });
            sheets[app.currentSheetIdx].shapes = app.shapes;
            app.selectedIds.delete(hit.id);
            renderCanvas();
        triggerAutoSave();
          }
          return;
        }

        if (app.interaction.mode === 'creating' && app.interaction.activeShape) {
          const s = app.interaction.activeShape;
          if (s.type === 'freedraw') {
            s.points.push({ x: world.x, y: world.y });
          } else {
            s.w = snapVal(world.x) - s.x;
            s.h = snapVal(world.y) - s.y;
            if (s.type === 'arrow' || s.type === 'line') {
              const endTarget = findTopShapeAt(world.x, world.y, true);
              s.endBindId = (endTarget && endTarget.id !== s.startBindId) ? endTarget.id : null;
            }
          }
          renderCanvas();
        triggerAutoSave();
          return;
        }

        if (app.interaction.mode === 'moving') {
          const dx = snapVal(world.x - app.interaction.startWorld.x);
          const dy = snapVal(world.y - app.interaction.startWorld.y);
          app.shapes.forEach(function (s) {
            if (!app.selectedIds.has(s.id)) return;
            const init = app.interaction.initialSnapshots.get(s.id);
            if (!init) return;
            if (s.type === 'freedraw' && init.points) {
              s.points = init.points.map(function (pt) {
                return { x: pt.x + dx, y: pt.y + dy };
              });
            } else {
              s.x = init.x + dx;
              s.y = init.y + dy;
              if (s.type === 'arrow' || s.type === 'line') {
                s.startBindId = null;
                s.endBindId = null;
              }
            }
          });
          renderCanvas();
        triggerAutoSave();
          return;
        }

        if (app.interaction.mode === 'group_transform' && app.interaction.initialGroupBox) {
          const gb = app.interaction.initialGroupBox;
          const h = app.interaction.resizeHandle;
          const wx = snapVal(world.x), wy = snapVal(world.y);

          let nx = gb.x, ny = gb.y, nw = gb.w, nh = gb.h;
          if (h.includes('e')) nw = Math.max(24, wx - gb.x);
          if (h.includes('s')) nh = Math.max(24, wy - gb.y);
          if (h.includes('w')) {
            const right = gb.x + gb.w;
            nx = Math.min(right - 24, wx);
            nw = right - nx;
          }
          if (h.includes('n')) {
            const bottom = gb.y + gb.h;
            ny = Math.min(bottom - 24, wy);
            nh = bottom - ny;
          }

          const scaleX = nw / Math.max(1, gb.w);
          const scaleY = nh / Math.max(1, gb.h);
          const uniformFactor = (scaleX + scaleY) / 2;
          app.lastTransformDelta = { scaleX: scaleX, scaleY: scaleY, dx: 0, dy: 0 };

          app.shapes.forEach(function (s) {
            if (!app.selectedIds.has(s.id)) return;
            const init = app.interaction.initialSnapshots.get(s.id);
            if (!init) return;

            if (s.type === 'freedraw' && init.points) {
              s.points = init.points.map(function (pt) {
                return {
                  x: nx + (pt.x - gb.x) * scaleX,
                  y: ny + (pt.y - gb.y) * scaleY
                };
              });
            } else {
              s.x = nx + (init.x - gb.x) * scaleX;
              s.y = ny + (init.y - gb.y) * scaleY;
              s.w = init.w * scaleX;
              s.h = init.h * scaleY;
            }
            s.fontSize = Math.max(9, Math.round(init.fontSize * uniformFactor));
            s.strokeWidth = Math.max(1, Math.min(20, Number((init.strokeWidth * uniformFactor).toFixed(1))));
          });

          renderCanvas();
        triggerAutoSave();
          return;
        }

        // Single-Shape Resizing:
        // - For Text / Shapes WITHOUT Ctrl: Auto-Layout Width/Height Reflow (text wraps cleanly, fontSize stays fixed!)
        // - WITH Ctrl (or Ctrl+T Free Transform active): Proportional Font Size Scaling!
        if (app.interaction.mode === 'resizing' && app.interaction.activeShape) {
          const s = app.interaction.activeShape;
          const b = app.interaction.initialBounds;
          const h = app.interaction.resizeHandle;
          const wx = snapVal(world.x), wy = snapVal(world.y);

          if (s.type === 'arrow' || s.type === 'line') {
            if (h === 'start') {
              const endX = b.x + b.w, endY = b.y + b.h;
              s.x = wx;
              s.y = wy;
              s.w = endX - wx;
              s.h = endY - wy;
              const st = findTopShapeAt(world.x, world.y, true);
              s.startBindId = st ? st.id : null;
            } else if (h === 'end') {
              s.w = wx - s.x;
              s.h = wy - s.y;
              const et = findTopShapeAt(world.x, world.y, true);
              s.endBindId = et ? et.id : null;
            }
            renderCanvas();
        triggerAutoSave();
            return;
          }

          let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
          if (h.includes('e')) nw = Math.max(36, wx - b.x);
          if (h.includes('s')) nh = Math.max(24, wy - b.y);
          if (h.includes('w')) {
            const right = b.x + b.w;
            nx = Math.min(right - 36, wx);
            nw = right - nx;
          }
          if (h.includes('n')) {
            const bottom = b.y + b.h;
            ny = Math.min(bottom - 24, wy);
            nh = bottom - ny;
          }

          if (s.type === 'image' && e.shiftKey && b.w > 0 && b.h > 0) {
            nh = Math.round(nw * (b.h / b.w));
          }

          s.x = nx;
          s.y = ny;
          s.w = nw;
          s.h = nh;

          const scaleRatio = ((nw / Math.max(1, b.w)) + (nh / Math.max(1, b.h))) / 2;
          app.lastTransformDelta = { scaleX: nw / Math.max(1, b.w), scaleY: nh / Math.max(1, b.h), dx: 0, dy: 0 };

          // Only scale fontSize if user holds Ctrl/Cmd (or Ctrl+T Free Transform is active);
          // Otherwise, normal drag works as Auto-Layout Reflow!
          if (e.ctrlKey || e.metaKey || app.freeTransformActive) {
            s.fontSize = Math.max(9, Math.round((b.fontSize || 14) * scaleRatio));
          }
          renderCanvas();
        triggerAutoSave();
          return;
        }

        if (app.interaction.mode === 'marquee') {
          const mx = Math.min(app.interaction.startWorld.x, world.x);
          const my = Math.min(app.interaction.startWorld.y, world.y);
          const mw = Math.abs(world.x - app.interaction.startWorld.x);
          const mh = Math.abs(world.y - app.interaction.startWorld.y);
          app.selectedIds.clear();
          app.shapes.forEach(function (s) {
            const sb = getNormalizedBox(s);
            if (sb.x + sb.w >= mx && sb.x <= mx + mw && sb.y + sb.h >= my && sb.y <= my + mh) {
              app.selectedIds.add(s.id);
            }
          });
          renderCanvas();
        triggerAutoSave();
        }
      });

      canvas.addEventListener('pointerup', function (e) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}

        if (app.interaction.mode === 'creating' && app.interaction.activeShape) {
          const s = app.interaction.activeShape;
          if (s.type !== 'freedraw' && s.type !== 'arrow' && s.type !== 'line') {
            const nb = getNormalizedBox(s);
            s.x = nb.x;
            s.y = nb.y;
            if (s.type === 'table') {
              s.w = nb.w < 30 ? 240 : nb.w;
              s.h = nb.h < 30 ? 114 : nb.h;
            } else {
              s.w = nb.w < 16 ? 130 : nb.w;
              s.h = nb.h < 16 ? (s.type === 'cylinder' ? 84 : 62) : nb.h;
            }
          } else if ((s.type === 'arrow' || s.type === 'line') && Math.hypot(s.w, s.h) < 12) {
            s.w = 110;
            s.h = 0;
          }
          if (s.type !== 'freedraw') {
            setTool('select');
          }
        }

        if (app.interaction.mode === 'panning') {
          canvas.className = app.activeTool === 'pan' ? 'cursor-pan' : 'cursor-select';
        }

        const wasActiveInteraction = app.interaction.mode !== 'none' && app.interaction.mode !== 'panning';
        app.interaction.mode = 'none';
        app.interaction.activeShape = null;
        app.interaction.resizeHandle = null;
        renderCanvas();
        triggerAutoSave();
        if (wasActiveInteraction) {
          triggerAutoSave();
        }
      });

      // Double-click: Table cell editing, Shape body editing, or Quick Box creation
      canvas.addEventListener('dblclick', function (e) {
        const rect = canvas.getBoundingClientRect();
        const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const hit = findTopShapeAt(world.x, world.y, false);

        if (hit && hit.type === 'table') {
          const b = getNormalizedBox(hit);
          const rows = Math.max(1, hit.rows || 3);
          const cols = Math.max(1, hit.cols || 3);
          const colIdx = Math.min(cols - 1, Math.max(0, Math.floor((world.x - b.x) / (b.w / cols))));
          const rowIdx = Math.min(rows - 1, Math.max(0, Math.floor((world.y - b.y) / (b.h / rows))));
          openInlineTextEditor(hit, { mode: 'cell', row: rowIdx, col: colIdx });
          return;
        }
        if (hit && hit.type !== 'image' && hit.type !== 'freedraw') {
          openInlineTextEditor(hit, { mode: 'body' });
        } else if (!hit) {
          pushUndoState();
          const quickBox = {
            id: 'shp_' + Date.now(),
            type: 'rect',
            x: snapVal(world.x - 65),
            y: snapVal(world.y - 30),
            w: 130,
            h: 60,
            text: '',
            fontSize: 14,
            fontFamily: app.fontFamily,
            fontItalic: app.fontItalic,
            stroke: app.strokeColor,
            strokeWidth: app.strokeWidth,
            strokeDash: app.strokeDash,
            fillMode: app.fillMode,
            edgeLabels: {}
          };
          app.shapes.push(quickBox);
          app.selectedIds.clear();
          app.selectedIds.add(quickBox.id);
          renderCanvas();
        triggerAutoSave();
          openInlineTextEditor(quickBox, { mode: 'body' });
        }
      });

      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 35) {
          const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
          const nextZoom = Math.min(3.0, Math.max(0.25, app.camera.zoom * zoomFactor));
          app.camera.x = mx - ((mx - app.camera.x) / app.camera.zoom) * nextZoom;
          app.camera.y = my - ((my - app.camera.y) / app.camera.zoom) * nextZoom;
          app.camera.zoom = nextZoom;
        } else {
          app.camera.x -= e.deltaX;
          app.camera.y -= e.deltaY;
        }
        renderCanvas();
        triggerAutoSave();
      }, { passive: false });

      /* ============================================================================
       * 11. CUSTOM COLOR SWATCH ADDER, FONTS, EMOJIS & UI BINDINGS
       * ============================================================================ */
      function applyColorSelection(col, addCustomSwatchIfNew) {
        const normCol = col.toUpperCase();
        app.strokeColor = normCol;
        document.getElementById('active-color-dot').style.background = normCol;

        // If user picked a custom color from the '+' Color Wheel, dynamically add it as a clickable swatch!
        if (addCustomSwatchIfNew) {
          const existing = document.querySelector(`.swatch-dot[data-color="${normCol}"]`);
          if (!existing) {
            ['dock-swatches-row', 'ribbon-color-strip'].forEach(function (containerId) {
              const container = document.getElementById(containerId);
              if (!container) return;
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'swatch-dot active';
              btn.setAttribute('data-color', normCol);
              btn.style.background = normCol;
              btn.setAttribute('aria-label', normCol);
              btn.addEventListener('click', function () {
                applyColorSelection(normCol, false);
              });
              container.appendChild(btn);
            });
          }
        }

        document.querySelectorAll('.swatch-dot').forEach(function (el) {
          el.classList.toggle('active', el.getAttribute('data-color').toUpperCase() === normCol);
        });
        if (app.selectedIds.size > 0) {
          pushUndoState();
          app.shapes.forEach(function (s) {
            if (app.selectedIds.has(s.id)) {
              s.stroke = normCol;
              if (s.type === 'sticky') s.stickyColor = normCol;
            }
          });
          renderCanvas();
        triggerAutoSave();
        }
      }

      function setFontFamilyChoice(famKey) {
        app.fontFamily = famKey;
        document.querySelectorAll('[data-font-family]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-font-family') === famKey);
        });
        document.querySelectorAll('[data-inline-font]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-inline-font') === famKey);
        });
        if (app.selectedIds.size > 0) {
          pushUndoState();
          app.shapes.forEach(function (s) {
            if (app.selectedIds.has(s.id)) s.fontFamily = famKey;
          });
          renderCanvas();
        triggerAutoSave();
        }
      }

      function toggleItalicStyle() {
        app.fontItalic = !app.fontItalic;
        document.getElementById('fmt-italic').classList.toggle('active', app.fontItalic);
        if (app.selectedIds.size > 0) {
          pushUndoState();
          app.shapes.forEach(function (s) {
            if (app.selectedIds.has(s.id)) s.fontItalic = !s.fontItalic;
          });
          renderCanvas();
        triggerAutoSave();
        } else if (document.activeElement === richNotesEl) {
          document.execCommand('italic', false, null);
        }
      }

      function insertEmojiSticker(emojiChar) {
        if (app.editingShapeId) {
          const start = inlineEditor.selectionStart || inlineEditor.value.length;
          inlineEditor.value = inlineEditor.value.slice(0, start) + emojiChar + inlineEditor.value.slice(start);
          const s = app.shapes.find(function (item) { return item.id === app.editingShapeId; });
          if (s) s.text = inlineEditor.value;
          inlineEditor.focus();
          return;
        }
        pushUndoState();
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;
        const centerWorld = screenToWorld(cw / 2, ch / 2);
        const emojiNode = {
          id: 'emoji_' + Date.now(),
          type: 'text',
          x: snapVal(centerWorld.x - 20 + Math.floor(Math.random() * 40 - 20)),
          y: snapVal(centerWorld.y - 20 + Math.floor(Math.random() * 40 - 20)),
          w: 54,
          h: 48,
          text: emojiChar,
          fontSize: 34,
          fontFamily: 'sans',
          stroke: '#F2F4F8',
          strokeWidth: 2,
          fillMode: 'none'
        };
        app.shapes.push(emojiNode);
        app.selectedIds.clear();
        app.selectedIds.add(emojiNode.id);
        closeAllPopovers();
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function setStrokeThickness(val) {
        const num = Math.max(1, Math.min(16, Number(val) || 2));
        app.strokeWidth = num;
        document.getElementById('thickness-slider').value = String(num);
        document.getElementById('thickness-readout').textContent = num + 'px';
        document.querySelectorAll('[data-thick]').forEach(function (btn) {
          btn.classList.toggle('active', Number(btn.getAttribute('data-thick')) === num);
        });
        if (app.selectedIds.size > 0) {
          pushUndoState();
          app.shapes.forEach(function (s) {
            if (app.selectedIds.has(s.id)) s.strokeWidth = num;
          });
          renderCanvas();
        triggerAutoSave();
        }
      }

      function adjustSelectedThicknessOrScale(delta) {
        if (app.selectedIds.size > 0) {
          pushUndoState();
          app.shapes.forEach(function (s) {
            if (!app.selectedIds.has(s.id)) return;
            s.strokeWidth = Math.max(1, Math.min(16, (s.strokeWidth || 2) + delta));
            s.fontSize = Math.max(9, Math.min(84, (s.fontSize || 14) + delta * 2));
          });
          renderCanvas();
        triggerAutoSave();
        } else {
          setStrokeThickness(app.strokeWidth + delta);
        }
      }

      function setStrokeDash(dashMode) {
        app.strokeDash = dashMode;
        document.querySelectorAll('[data-dash]').forEach(function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-dash') === dashMode);
        });
        if (app.selectedIds.size > 0) {
          pushUndoState();
          app.shapes.forEach(function (s) {
            if (app.selectedIds.has(s.id)) s.strokeDash = dashMode;
          });
          renderCanvas();
        triggerAutoSave();
        }
      }

      function syncUIWithSelectedShape(s) {
        if (!s) return;
        if (s.strokeWidth) {
          app.strokeWidth = s.strokeWidth;
          document.getElementById('thickness-slider').value = String(Math.round(s.strokeWidth));
          document.getElementById('thickness-readout').textContent = Math.round(s.strokeWidth) + 'px';
        }
        if (s.stroke) {
          app.strokeColor = s.stroke;
          document.getElementById('active-color-dot').style.background = s.stroke;
          document.querySelectorAll('.swatch-dot').forEach(function (sw) {
            sw.classList.toggle('active', sw.getAttribute('data-color').toUpperCase() === s.stroke.toUpperCase());
          });
        }
        if (s.fontFamily) {
          app.fontFamily = s.fontFamily;
          document.querySelectorAll('[data-font-family]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-font-family') === s.fontFamily);
          });
        }
      }

      function toggleNotepadVisibility(forceShow) {
        if (typeof forceShow === 'boolean') {
          setViewMode(forceShow ? 'SPLIT' : 'CANVAS');
        } else {
          setViewMode(app.viewMode === 'CANVAS' ? 'SPLIT' : 'CANVAS');
        }
      }

      function setViewMode(mode) {
        app.viewMode = mode;
        const notesPane = document.getElementById('notes-pane');
        const splitter = document.getElementById('splitter-bar');
        const canvasPane = document.getElementById('canvas-pane');
        const quickToggleBtn = document.getElementById('btn-quick-notepad-toggle');

        document.getElementById('view-notes-btn').classList.toggle('active', mode === 'NOTES');
        document.getElementById('view-split-btn').classList.toggle('active', mode === 'SPLIT');
        document.getElementById('view-canvas-btn').classList.toggle('active', mode === 'CANVAS');
        quickToggleBtn.classList.toggle('active', mode !== 'CANVAS');

        if (mode === 'NOTES') {
          notesPane.classList.remove('hidden');
          notesPane.style.width = '100%';
          splitter.classList.add('hidden');
          canvasPane.classList.add('hidden');
        } else if (mode === 'CANVAS') {
          notesPane.classList.add('hidden');
          splitter.classList.add('hidden');
          canvasPane.classList.remove('hidden');
        } else {
          notesPane.classList.remove('hidden');
          notesPane.style.width = Math.round(app.splitRatio * 100) + '%';
          splitter.classList.remove('hidden');
          canvasPane.classList.remove('hidden');
        }
        setTimeout(resizeCanvasToViewport, 20);
      }

      function addUploadedImageToCanvas(dataUrl, fileName, indexOffset) {
        const img = new Image();
        img.onload = function () {
          pushUndoState();
          const aspect = img.naturalWidth > 0 ? (img.naturalHeight / img.naturalWidth) : 0.75;
          const w = 240;
          const h = Math.max(60, Math.round(w * aspect));
          const dpr = window.devicePixelRatio || 1;
          const cw = canvas.width / dpr;
          const ch = canvas.height / dpr;
          const centerWorld = screenToWorld(cw / 2, ch / 2);

          const imgShape = {
            id: 'img_' + Date.now() + '_' + (indexOffset || 0),
            type: 'image',
            x: snapVal(centerWorld.x - w / 2 + (indexOffset || 0) * 24),
            y: snapVal(centerWorld.y - h / 2 + (indexOffset || 0) * 24),
            w: w,
            h: h,
            dataUrl: dataUrl,
            text: fileName || '',
            fontSize: 13,
            stroke: app.strokeColor,
            strokeWidth: app.strokeWidth,
            fillMode: 'none'
          };
          imageCache.set(dataUrl, img);
          app.shapes.push(imgShape);
          app.selectedIds.clear();
          app.selectedIds.add(imgShape.id);
          setTool('select');
          renderCanvas();
        triggerAutoSave();
          pulseFeedback();
        };
        img.src = dataUrl;
      }

      function handleCanvasImageFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        Array.from(fileList).forEach(function (file, idx) {
          if (!file.type.startsWith('image/')) return;
          const reader = new FileReader();
          reader.onload = function (ev) {
            addUploadedImageToCanvas(ev.target.result, file.name, idx);
          };
          reader.readAsDataURL(file);
        });
      }

      function handleNotesFileOrImageUpload(fileList) {
        if (!fileList || fileList.length === 0) return;
        if (app.viewMode === 'CANVAS') setViewMode('SPLIT');
        Array.from(fileList).forEach(function (file, idx) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (ev) {
              const dataUrl = ev.target.result;
              if (!app.markdownMode) {
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = file.name;
                img.className = 'embedded-canvas-img';
                richNotesEl.appendChild(img);
              }
              addUploadedImageToCanvas(dataUrl, file.name, idx);
              pulseFeedback();
            };
            reader.readAsDataURL(file);
          } else {
            const reader = new FileReader();
            reader.onload = function (ev) {
              const content = String(ev.target.result || '');
              if (app.markdownMode) {
                rawNotesEl.value += '\n\n## ' + file.name + '\n' + content + '\n';
              } else {
                const chip = document.createElement('div');
                chip.className = 'file-attachment-chip';
                chip.textContent = '📎 ' + file.name;
                richNotesEl.appendChild(chip);

                const pre = document.createElement('pre');
                pre.textContent = content.slice(0, 4000);
                richNotesEl.appendChild(pre);
              }
              pulseFeedback();
            };
            reader.readAsText(file);
          }
        });
      }

      function closeAllPopovers() {
        document.querySelectorAll('.icon-popover').forEach(function (p) {
          p.classList.add('hidden');
        });
      }

      function setTool(toolName) {
        commitInlineTextEditor();
        closeEdgePlusActionMenu();
        app.activeTool = toolName;

        const navBtn = document.getElementById('btn-nav-combo');
        const shapeBtn = document.getElementById('btn-shape-combo');
        const drawBtn = document.getElementById('btn-draw-combo');
        const stickyBtn = document.getElementById('btn-dock-sticky');
        const eraserBtn = document.getElementById('btn-eraser-tool');

        navBtn.classList.toggle('active', ['select', 'pan'].includes(toolName));
        shapeBtn.classList.toggle('active', ['rect', 'diamond', 'ellipse', 'cylinder', 'frame', 'table'].includes(toolName));
        drawBtn.classList.toggle('active', ['arrow', 'line', 'freedraw', 'text'].includes(toolName));
        stickyBtn.classList.toggle('active', toolName === 'sticky');
        eraserBtn.classList.toggle('active', toolName === 'eraser');

        if (['select', 'pan'].includes(toolName)) {
          app.lastNavTool = toolName;
          document.getElementById('icon-nav-current').innerHTML = SHAPE_SVGS[toolName];
          document.querySelectorAll('[data-pick-nav]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-pick-nav') === toolName);
          });
        } else if (['rect', 'diamond', 'ellipse', 'cylinder', 'frame', 'table'].includes(toolName)) {
          app.lastShapeTool = toolName;
          document.getElementById('icon-shape-current').innerHTML = SHAPE_SVGS[toolName];
          document.querySelectorAll('[data-pick-shape]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-pick-shape') === toolName);
          });
        } else if (['arrow', 'line', 'freedraw', 'text'].includes(toolName)) {
          app.lastDrawTool = toolName;
          document.getElementById('icon-draw-current').innerHTML = SHAPE_SVGS[toolName];
          document.querySelectorAll('[data-pick-draw]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-pick-draw') === toolName);
          });
        }

        if (toolName === 'pan') canvas.className = 'cursor-pan';
        else if (toolName === 'select') canvas.className = 'cursor-select';
        else canvas.className = '';
      }

      window.addEventListener('dragover', function (e) { e.preventDefault(); });
      window.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        if (e.target.closest('#notes-pane')) {
          handleNotesFileOrImageUpload(e.dataTransfer.files);
        } else {
          const files = Array.from(e.dataTransfer.files);
          const imgs = files.filter(function (f) { return f.type.startsWith('image/'); });
          const docs = files.filter(function (f) { return !f.type.startsWith('image/'); });
          if (imgs.length > 0) handleCanvasImageFiles(imgs);
          if (docs.length > 0) handleNotesFileOrImageUpload(docs);
        }
      });

      function compileDSLToCanvasShapes() {
        const raw = document.getElementById('dsl-input').value.trim();
        if (!raw) return;
        pushUndoState();

        const nodeMap = new Map();
        const edges = [];

        function ensureNode(rawToken) {
          const clean = rawToken.trim();
          const typeMatch = clean.match(/^([A-Za-z0-9_ -]+?)(?:\s*\[(db|cylinder|diamond|circle|ellipse|frame|sticky|table)\])?$/i);
          const name = (typeMatch ? typeMatch[1] : clean).trim();
          const tag = (typeMatch && typeMatch[2] ? typeMatch[2].toLowerCase() : 'rect');
          if (!nodeMap.has(name)) {
            let shapeType = 'rect';
            if (tag === 'db' || tag === 'cylinder') shapeType = 'cylinder';
            else if (tag === 'diamond') shapeType = 'diamond';
            else if (tag === 'circle' || tag === 'ellipse') shapeType = 'ellipse';
            else if (tag === 'frame') shapeType = 'frame';
            else if (tag === 'sticky') shapeType = 'sticky';
            else if (tag === 'table') shapeType = 'table';
            nodeMap.set(name, { name: name, type: shapeType });
          }
          return name;
        }

        raw.split('\n').forEach(function (line) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
          const arrowMatch = trimmed.match(/^(.+?)\s*->\s*(.+?)(?:\s*:\s*(.+))?$/);
          if (arrowMatch) {
            const fromName = ensureNode(arrowMatch[1]);
            const toName = ensureNode(arrowMatch[2]);
            edges.push({ from: fromName, to: toName, label: (arrowMatch[3] || '').trim() });
          } else {
            ensureNode(trimmed);
          }
        });

        const createdIds = new Map();
        const nodesArr = Array.from(nodeMap.values());
        const startX = 70;
        const startY = 80 + (app.shapes.length > 0 ? 120 : 0);

        nodesArr.forEach(function (n, idx) {
          const col = idx % 3;
          const row = Math.floor(idx / 3);
          const shp = {
            id: 'shp_dsl_' + Date.now() + '_' + idx,
            type: n.type,
            x: startX + col * 210,
            y: startY + row * 125,
            w: 136,
            h: n.type === 'cylinder' ? 82 : 60,
            text: n.name,
            fontSize: 13.5,
            fontFamily: app.fontFamily,
            fontItalic: app.fontItalic,
            stroke: app.strokeColor,
            strokeWidth: app.strokeWidth,
            strokeDash: app.strokeDash,
            fillMode: app.fillMode,
            edgeLabels: {}
          };
          app.shapes.push(shp);
          createdIds.set(n.name, shp.id);
        });

        edges.forEach(function (e, idx) {
          const sId = createdIds.get(e.from);
          const tId = createdIds.get(e.to);
          if (!sId || !tId) return;
          app.shapes.push({
            id: 'shp_edge_' + Date.now() + '_' + idx,
            type: 'arrow',
            x: 0,
            y: 0,
            w: 100,
            h: 0,
            text: e.label,
            fontSize: 11.5,
            fontFamily: app.fontFamily,
            stroke: app.strokeColor,
            strokeWidth: app.strokeWidth,
            strokeDash: app.strokeDash,
            fillMode: 'none',
            startBindId: sId,
            endBindId: tId
          });
        });

        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function togglePopover(popoverId) {
        const target = document.getElementById(popoverId);
        const wasHidden = target.classList.contains('hidden');
        closeAllPopovers();
        if (wasHidden) target.classList.remove('hidden');
      }

      function deleteSelectedShapes() {
        if (app.selectedIds.size === 0) return;
        pushUndoState();
        app.shapes = app.shapes.filter(function (s) { return !app.selectedIds.has(s.id); });
        sheets[app.currentSheetIdx].shapes = app.shapes;
        app.selectedIds.clear();
        app.freeTransformActive = false;
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function duplicateSelectedShapes() {
        if (app.selectedIds.size === 0) return;
        pushUndoState();
        const newSelection = new Set();
        app.shapes.forEach(function (s) {
          if (app.selectedIds.has(s.id)) {
            const copy = JSON.parse(JSON.stringify(s));
            copy.id = 'shp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            copy.x += 24;
            copy.y += 24;
            if (copy.points) {
              copy.points = copy.points.map(function (p) { return { x: p.x + 24, y: p.y + 24 }; });
            }
            app.shapes.push(copy);
            newSelection.add(copy.id);
          }
        });
        app.selectedIds = newSelection;
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function selectAllShapes() {
        app.selectedIds.clear();
        app.shapes.forEach(function (s) { app.selectedIds.add(s.id); });
        renderCanvas();
        triggerAutoSave();
        pulseFeedback();
      }

      function bringSelectedToFront() {
        if (app.selectedIds.size === 0) return;
        pushUndoState();
        const unsel = app.shapes.filter(function (s) { return !app.selectedIds.has(s.id); });
        const sel = app.shapes.filter(function (s) { return app.selectedIds.has(s.id); });
        app.shapes = unsel.concat(sel);
        sheets[app.currentSheetIdx].shapes = app.shapes;
        renderCanvas();
        triggerAutoSave();
      }

      function sendSelectedToBack() {
        if (app.selectedIds.size === 0) return;
        pushUndoState();
        const sel = app.shapes.filter(function (s) { return app.selectedIds.has(s.id); });
        const unsel = app.shapes.filter(function (s) { return !app.selectedIds.has(s.id); });
        app.shapes = sel.concat(unsel);
        sheets[app.currentSheetIdx].shapes = app.shapes;
        renderCanvas();
        triggerAutoSave();
      }

      function escapeHTML(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      let pulseTimer = null;
      let saveTimer = null;

      function triggerAutoSave() {
        saveCurrentSheetState();
        try {
          localStorage.setItem('architecture_workspace_backup', JSON.stringify({
            sheets: sheets,
            activeSheetIdx: app.currentSheetIdx,
            viewMode: app.viewMode,
            splitRatio: app.splitRatio
          }));
        } catch (e) {}

        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async function () {
          try {
            await fetch(`${BACKEND_URL}/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: 'My Architecture Workspace',
                sheets: sheets,
                activeSheetIdx: app.currentSheetIdx,
                viewMode: app.viewMode,
                splitRatio: app.splitRatio
              })
            });
          } catch (err) {
            // Backend offline or unreachable
          }
        }, 300);
      }

      function pulseFeedback() {
        const el = document.getElementById('status-pulse');
        if (el) {
          el.classList.remove('hidden');
          if (pulseTimer) clearTimeout(pulseTimer);
          pulseTimer = setTimeout(function () {
            el.classList.add('hidden');
          }, 650);
        }
        triggerAutoSave();
      }

      /* ============================================================================
       * 12. BIND ALL UI CONTROLS & KEYBOARD SHORTCUTS
       * ============================================================================ */
      function bindUIEvents() {
        // 1. Top Ribbon Tab Switching & Collapse
        const ribbonStrip = document.getElementById('ribbon-content-strip');
        document.querySelectorAll('[data-ribbon-tab]').forEach(function (tabBtn) {
          tabBtn.addEventListener('click', function () {
            const tabName = tabBtn.getAttribute('data-ribbon-tab');
            document.querySelectorAll('[data-ribbon-tab]').forEach(function (b) {
              b.classList.toggle('active', b === tabBtn);
            });
            document.querySelectorAll('.sub-pane').forEach(function (pane) {
              pane.classList.toggle('hidden', pane.id !== 'ribbon-pane-' + tabName);
            });
            ribbonStrip.classList.remove('hidden');
            setTimeout(resizeCanvasToViewport, 20);
          });
        });

        document.getElementById('btn-collapse-ribbon').addEventListener('click', function (e) {
          const collapsed = ribbonStrip.classList.toggle('hidden');
          e.currentTarget.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'
            : '<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>';
          setTimeout(resizeCanvasToViewport, 20);
        });

        // 2. Excel-Style Bottom Sheet Bar
        const sheetsStrip = document.getElementById('excel-sheets-strip');
        sheetsStrip.addEventListener('click', function (e) {
          const delBtn = e.target.closest('[data-delete-sheet]');
          if (delBtn) {
            e.stopPropagation();
            deleteSheetAt(Number(delBtn.getAttribute('data-delete-sheet')));
            return;
          }
          if (e.target.closest('#btn-excel-add-sheet')) {
            addNewSheet();
            return;
          }
          const tab = e.target.closest('[data-sheet-idx]');
          if (tab) {
            switchToSheet(Number(tab.getAttribute('data-sheet-idx')));
          }
        });

        sheetsStrip.addEventListener('dblclick', function (e) {
          const tab = e.target.closest('[data-sheet-idx]');
          if (!tab) return;
          const idx = Number(tab.getAttribute('data-sheet-idx'));
          const labelSpan = tab.querySelector('.sheet-name-label');
          if (!labelSpan) return;
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = sheets[idx].name;
          inp.style.cssText = 'width:76px;height:18px;background:#121418;color:#E2F163;border:1px solid #E2F163;border-radius:3px;font-size:11px;padding:0 4px;outline:none;';
          labelSpan.replaceWith(inp);
          inp.focus();
          inp.select();
          function commitName() {
            sheets[idx].name = inp.value.trim() || ('Sheet ' + (idx + 1));
            renderExcelSheetsBar();
          }
          inp.addEventListener('blur', commitName);
          inp.addEventListener('keydown', function (ev) {
            ev.stopPropagation();
            if (ev.key === 'Enter' || ev.key === 'Escape') {
              ev.preventDefault();
              commitName();
            }
          });
        });

        // 3. Copy/Paste, Style Painter, Table, Sticky Note, Free Transform, Fit All, Zero State
        document.getElementById('btn-copy-shape').addEventListener('click', copySelectedShapesToInternalClipboard);
        document.getElementById('btn-paste-shape').addEventListener('click', function () {
          pasteFromInternalClipboard();
        });
        document.getElementById('btn-copy-style').addEventListener('click', copySelectedStyle);
        document.getElementById('btn-paste-style').addEventListener('click', pasteStyleToSelection);
        document.getElementById('btn-style-painter').addEventListener('click', function () {
          if (app.stylePainterArmed) {
            pasteStyleToSelection();
          } else {
            copySelectedStyle();
          }
        });
        document.getElementById('btn-dock-painter').addEventListener('click', function () {
          if (app.stylePainterArmed) {
            pasteStyleToSelection();
          } else {
            copySelectedStyle();
          }
        });

        document.getElementById('btn-top-table').addEventListener('click', function () { setTool('table'); });
        document.getElementById('btn-top-sticky').addEventListener('click', function () { setTool('sticky'); });
        document.getElementById('btn-dock-sticky').addEventListener('click', function () { setTool('sticky'); });

        document.getElementById('btn-free-transform').addEventListener('click', toggleFreeTransformMode);
        document.getElementById('btn-fit-all').addEventListener('click', fitAllDiagramsToScreen);
        document.getElementById('btn-zero-state').addEventListener('click', resetToZeroState);
        document.getElementById('zoom-pct-readout').addEventListener('click', resetToZeroState);
        document.getElementById('btn-select-all').addEventListener('click', selectAllShapes);

        // 4. Font Families & Italic Style
        document.querySelectorAll('[data-font-family]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setFontFamilyChoice(btn.getAttribute('data-font-family'));
          });
        });
        document.getElementById('fmt-italic').addEventListener('click', toggleItalicStyle);

        // 5. Special Emojis Popover
        document.getElementById('btn-emoji-combo').addEventListener('click', function () {
          togglePopover('popover-emojis');
        });
        document.querySelectorAll('[data-emoji]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            insertEmojiSticker(btn.getAttribute('data-emoji'));
          });
        });

        // 6. Notepad Hide / Show
        document.getElementById('btn-quick-notepad-toggle').addEventListener('click', function () {
          toggleNotepadVisibility();
        });
        document.getElementById('view-notes-btn').addEventListener('click', function () { setViewMode('NOTES'); });
        document.getElementById('view-split-btn').addEventListener('click', function () { setViewMode('SPLIT'); });
        document.getElementById('view-canvas-btn').addEventListener('click', function () { setViewMode('CANVAS'); });

        // 7. Colors (All Swatches + First-Position '+' Color Pickers that Add Custom Swatches)
        document.querySelectorAll('.swatch-dot').forEach(function (sw) {
          sw.addEventListener('click', function () {
            applyColorSelection(sw.getAttribute('data-color'), false);
          });
        });
        document.getElementById('custom-color-picker').addEventListener('change', function (e) {
          applyColorSelection(e.target.value, true);
        });
        document.getElementById('dock-color-picker').addEventListener('change', function (e) {
          applyColorSelection(e.target.value, true);
        });

        document.querySelectorAll('[data-thick]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setStrokeThickness(Number(btn.getAttribute('data-thick')));
          });
        });
        document.getElementById('thickness-slider').addEventListener('input', function (e) {
          setStrokeThickness(Number(e.target.value));
        });
        document.querySelectorAll('[data-dash]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setStrokeDash(btn.getAttribute('data-dash'));
          });
        });

        // 8. Image & File Uploads
        const inputCanvasImg = document.getElementById('input-upload-canvas-img');
        const inputNotesFile = document.getElementById('input-upload-notes-file');
        function triggerCanvasImgUpload() { inputCanvasImg.value = ''; inputCanvasImg.click(); }
        function triggerNotesFileUpload() { inputNotesFile.value = ''; inputNotesFile.click(); }

        document.getElementById('btn-top-upload-img').addEventListener('click', triggerCanvasImgUpload);
        document.getElementById('btn-rib-upload-canvas-img').addEventListener('click', triggerCanvasImgUpload);
        document.getElementById('btn-dock-upload-img').addEventListener('click', triggerCanvasImgUpload);
        document.getElementById('btn-top-upload-file').addEventListener('click', triggerNotesFileUpload);
        document.getElementById('btn-rib-upload-notes-file').addEventListener('click', triggerNotesFileUpload);

        inputCanvasImg.addEventListener('change', function (e) { handleCanvasImageFiles(e.target.files); });
        inputNotesFile.addEventListener('change', function (e) { handleNotesFileOrImageUpload(e.target.files); });

        // 9. Quick Tools & Floating Dock Popovers
        document.querySelectorAll('[data-quick-tool]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setTool(btn.getAttribute('data-quick-tool'));
          });
        });

        document.getElementById('btn-compress-dock').addEventListener('click', function (e) {
          const items = document.getElementById('dock-items');
          const compressed = items.classList.toggle('hidden');
          e.currentTarget.innerHTML = compressed
            ? '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>'
            : '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';
          closeAllPopovers();
        });

        document.getElementById('btn-nav-combo').addEventListener('click', function () {
          if (['select', 'pan'].includes(app.activeTool)) togglePopover('popover-nav');
          else { setTool(app.lastNavTool); closeAllPopovers(); }
        });
        document.querySelectorAll('[data-pick-nav]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setTool(btn.getAttribute('data-pick-nav'));
            closeAllPopovers();
          });
        });

        document.getElementById('btn-shape-combo').addEventListener('click', function () {
          if (['rect', 'diamond', 'ellipse', 'cylinder', 'frame', 'table'].includes(app.activeTool)) togglePopover('popover-shapes');
          else { setTool(app.lastShapeTool); togglePopover('popover-shapes'); }
        });
        document.querySelectorAll('[data-pick-shape]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setTool(btn.getAttribute('data-pick-shape'));
            closeAllPopovers();
          });
        });

        document.getElementById('btn-draw-combo').addEventListener('click', function () {
          if (['arrow', 'line', 'freedraw', 'text'].includes(app.activeTool)) togglePopover('popover-draw');
          else { setTool(app.lastDrawTool); togglePopover('popover-draw'); }
        });
        document.querySelectorAll('[data-pick-draw]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setTool(btn.getAttribute('data-pick-draw'));
            closeAllPopovers();
          });
        });

        document.getElementById('btn-eraser-tool').addEventListener('click', function () {
          closeAllPopovers();
          if (app.selectedIds.size > 0) deleteSelectedShapes();
          else setTool('eraser');
        });

        document.getElementById('btn-style-combo').addEventListener('click', function () {
          togglePopover('popover-style');
        });

        document.querySelectorAll('[data-fill]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const fm = btn.getAttribute('data-fill');
            app.fillMode = fm;
            document.querySelectorAll('[data-fill]').forEach(function (el) {
              el.classList.toggle('active', el.getAttribute('data-fill') === fm);
            });
            if (app.selectedIds.size > 0) {
              pushUndoState();
              app.shapes.forEach(function (s) {
                if (app.selectedIds.has(s.id)) s.fillMode = fm;
              });
              renderCanvas();
        triggerAutoSave();
            }
          });
        });

        document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedShapes);

        // 10. Diagram-as-Code Overlay
        const codeBox = document.getElementById('code-float-box');
        document.getElementById('btn-toggle-code-box').addEventListener('click', function (e) {
          closeAllPopovers();
          const open = !codeBox.classList.toggle('hidden');
          e.currentTarget.classList.toggle('active', open);
          if (open) document.getElementById('dsl-input').focus();
        });
        document.getElementById('btn-close-code-box').addEventListener('click', function () {
          codeBox.classList.add('hidden');
          document.getElementById('btn-toggle-code-box').classList.remove('active');
        });
        document.getElementById('btn-apply-dsl').addEventListener('click', compileDSLToCanvasShapes);

        // 11. Undo / Redo / Zoom / Internal Settings & Shortcuts Modal
        document.getElementById('btn-undo').addEventListener('click', performUndo);
        document.getElementById('btn-redo').addEventListener('click', performRedo);
        document.getElementById('zoom-in-btn').addEventListener('click', function () {
          app.camera.zoom = Math.min(3.0, Number((app.camera.zoom + 0.15).toFixed(2)));
          renderCanvas();
        triggerAutoSave();
        });
        document.getElementById('zoom-out-btn').addEventListener('click', function () {
          app.camera.zoom = Math.max(0.25, Number((app.camera.zoom - 0.15).toFixed(2)));
          renderCanvas();
        triggerAutoSave();
        });
        document.getElementById('btn-toggle-snap').addEventListener('click', function (e) {
          app.snapToGrid = !app.snapToGrid;
          e.currentTarget.classList.toggle('active', app.snapToGrid);
          document.getElementById('chk-setting-snap').checked = app.snapToGrid;
        });

        const settingsModal = document.getElementById('settings-modal');
        document.getElementById('btn-open-settings').addEventListener('click', function () {
          settingsModal.classList.remove('hidden');
        });
        document.getElementById('btn-toggle-shortcuts').addEventListener('click', function () {
          settingsModal.classList.toggle('hidden');
        });
        document.getElementById('btn-close-settings').addEventListener('click', function () {
          settingsModal.classList.add('hidden');
        });
        document.getElementById('chk-setting-snap').addEventListener('change', function (e) {
          app.snapToGrid = e.target.checked;
          document.getElementById('btn-toggle-snap').classList.toggle('active', app.snapToGrid);
        });
        document.getElementById('chk-setting-edge-plus').addEventListener('change', function (e) {
          app.showEdgePlusHandles = e.target.checked;
          renderCanvas();
        triggerAutoSave();
        });

        // 12. Open Splitter Dragging
        const splitter = document.getElementById('splitter-bar');
        let draggingSplitter = false;
        splitter.addEventListener('pointerdown', function (e) {
          draggingSplitter = true;
          splitter.setPointerCapture(e.pointerId);
          splitter.classList.add('active');
        });
        splitter.addEventListener('pointermove', function (e) {
          if (!draggingSplitter) return;
          const rect = document.getElementById('split-workspace').getBoundingClientRect();
          const ratio = Math.min(0.76, Math.max(0.18, (e.clientX - rect.left) / rect.width));
          app.splitRatio = ratio;
          document.getElementById('notes-pane').style.width = Math.round(ratio * 100) + '%';
          resizeCanvasToViewport();
        });
        splitter.addEventListener('pointerup', function (e) {
          draggingSplitter = false;
          try { splitter.releasePointerCapture(e.pointerId); } catch (err) {}
          splitter.classList.remove('active');
          resizeCanvasToViewport();
        });
        splitter.addEventListener('dblclick', function () {
          toggleNotepadVisibility();
        });

        // 13. Notes Formatting
        function insertRichBlock(tag, defaultText) {
          if (app.viewMode === 'CANVAS') setViewMode('SPLIT');
          richNotesEl.focus();
          const el = document.createElement(tag);
          el.textContent = defaultText;
          richNotesEl.appendChild(el);
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }

        document.getElementById('fmt-h1').addEventListener('click', function () {
          if (app.markdownMode) rawNotesEl.value += '\n# ';
          else insertRichBlock('h1', 'Heading');
        });
        document.getElementById('fmt-h2').addEventListener('click', function () {
          if (app.markdownMode) rawNotesEl.value += '\n## ';
          else insertRichBlock('h2', 'Section');
        });
        document.getElementById('fmt-bold').addEventListener('click', function () {
          if (app.markdownMode) rawNotesEl.value += ' **** ';
          else document.execCommand('bold', false, null);
        });
        document.getElementById('fmt-list').addEventListener('click', function () {
          if (app.markdownMode) rawNotesEl.value += '\n- ';
          else document.execCommand('insertUnorderedList', false, null);
        });
        document.getElementById('fmt-code').addEventListener('click', function () {
          if (app.markdownMode) rawNotesEl.value += '\n```\n\n```\n';
          else insertRichBlock('pre', '// code');
        });
        document.getElementById('fmt-embed-canvas').addEventListener('click', function () {
          if (app.viewMode === 'CANVAS') setViewMode('SPLIT');
          const dataUrl = canvas.toDataURL('image/png');
          if (app.markdownMode) {
            app.markdownMode = false;
            rawNotesEl.classList.add('hidden');
            richNotesEl.classList.remove('hidden');
            document.getElementById('toggle-md-mode').classList.remove('active');
          }
          const img = document.createElement('img');
          img.src = dataUrl;
          img.alt = 'Diagram';
          img.className = 'embedded-canvas-img';
          richNotesEl.appendChild(img);
          pulseFeedback();
        });
        document.getElementById('toggle-md-mode').addEventListener('click', function (e) {
          app.markdownMode = !app.markdownMode;
          e.currentTarget.classList.toggle('active', app.markdownMode);
          if (app.markdownMode) {
            rawNotesEl.value = rawNotesEl.value || richNotesEl.innerText;
            richNotesEl.classList.add('hidden');
            rawNotesEl.classList.remove('hidden');
            rawNotesEl.focus();
          } else {
            if (rawNotesEl.value.trim() && !richNotesEl.innerHTML.trim()) {
              richNotesEl.innerText = rawNotesEl.value;
            }
            rawNotesEl.classList.add('hidden');
            richNotesEl.classList.remove('hidden');
            richNotesEl.focus();
          }
        });

        // Continuous auto-save listeners on notepad text editing
        richNotesEl.addEventListener('input', triggerAutoSave);
        rawNotesEl.addEventListener('input', triggerAutoSave);

        // Immediate flush on page refresh or tab close
        window.addEventListener('beforeunload', function () {
          saveCurrentSheetState();
          try {
            const payload = JSON.stringify({
              title: 'My Architecture Workspace',
              sheets: sheets,
              activeSheetIdx: app.currentSheetIdx,
              viewMode: app.viewMode,
              splitRatio: app.splitRatio
            });
            localStorage.setItem('architecture_workspace_backup', payload);
            if (navigator.sendBeacon) {
              navigator.sendBeacon(`${BACKEND_URL}/save`, new Blob([payload], { type: 'application/json' }));
            }
          } catch (e) {}
        });

        // 14. Export & Clear
        document.getElementById('btn-export-png').addEventListener('click', function () {
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = sheets[app.currentSheetIdx].name.toLowerCase().replace(/\s+/g, '_') + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          pulseFeedback();
        });

        document.getElementById('btn-export-md').addEventListener('click', function () {
          const textBody = app.markdownMode ? rawNotesEl.value : richNotesEl.innerText;
          const shapeSummary = app.shapes
            .filter(function (s) { return s.text; })
            .map(function (s) { return '- [' + s.type.toUpperCase() + '] ' + s.text; })
            .join('\n');
          const mdContent = (textBody || '') + (shapeSummary ? '\n\n' + shapeSummary + '\n' : '\n');
          const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = sheets[app.currentSheetIdx].name.toLowerCase().replace(/\s+/g, '_') + '.md';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          pulseFeedback();
        });

        document.getElementById('btn-clear-all').addEventListener('click', function () {
          pushUndoState();
          app.shapes = [];
          sheets[app.currentSheetIdx].shapes = app.shapes;
          richNotesEl.innerHTML = '';
          rawNotesEl.value = '';
          app.selectedIds.clear();
          renderCanvas();
        triggerAutoSave();
          pulseFeedback();
        });

        // 15. Global Photoshop & Canvas Keyboard Shortcuts
        window.addEventListener('keydown', function (e) {
          const activeEl = document.activeElement;
          const isTyping = Boolean(app.editingShapeId) || (activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.isContentEditable
          ));

          if (isTyping) return;

          if (e.code === 'Space') {
            e.preventDefault();
            app.interaction.spacePressed = true;
            canvas.className = 'cursor-pan';
            return;
          }

          const mod = e.metaKey || e.ctrlKey;

          // Copy / Paste Style: Ctrl+Alt+C / Ctrl+Alt+V
          if (mod && e.altKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            copySelectedStyle();
            return;
          }
          if (mod && e.altKey && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            pasteStyleToSelection();
            return;
          }
          // Copy Selected Shapes: Ctrl+C
          if (mod && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            copySelectedShapesToInternalClipboard();
            return;
          }
          // Cut Selected Shapes: Ctrl+X
          if (mod && (e.key === 'x' || e.key === 'X')) {
            e.preventDefault();
            copySelectedShapesToInternalClipboard();
            deleteSelectedShapes();
            return;
          }
          // Paste Shapes: Ctrl+V (also triggers native 'paste' event if external image/text)
          if (mod && (e.key === 'v' || e.key === 'V')) {
            if (app.clipboardShapes.length > 0) {
              e.preventDefault();
              pasteFromInternalClipboard();
              return;
            }
          }

          if (mod && e.key === '0') {
            e.preventDefault();
            resetToZeroState();
            return;
          }
          if (mod && e.key === '1') {
            e.preventDefault();
            fitAllDiagramsToScreen();
            return;
          }
          if (mod && (e.key === 't' || e.key === 'T')) {
            e.preventDefault();
            if (e.shiftKey) repeatLastTransform();
            else toggleFreeTransformMode();
            return;
          }
          if (mod && (e.key === 'h' || e.key === 'H')) {
            e.preventDefault();
            toggleNotepadVisibility();
            return;
          }
          if (mod && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            selectAllShapes();
            return;
          }
          if (mod && (e.key === 'j' || e.key === 'J' || e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            duplicateSelectedShapes();
            return;
          }
          if (mod && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            if (e.shiftKey) performRedo();
            else performUndo();
            return;
          }
          if (mod && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            performRedo();
            return;
          }

          if (e.key === '[') {
            e.preventDefault();
            adjustSelectedThicknessOrScale(-1);
            return;
          }
          if (e.key === ']') {
            e.preventDefault();
            adjustSelectedThicknessOrScale(1);
            return;
          }
          if (e.key === '?') {
            settingsModal.classList.toggle('hidden');
            return;
          }
          if (e.key === 'Escape') {
            app.freeTransformActive = false;
            app.stylePainterArmed = false;
            document.getElementById('btn-free-transform').classList.remove('active');
            document.getElementById('btn-style-painter').classList.remove('active');
            document.getElementById('btn-dock-painter').classList.remove('active');
            settingsModal.classList.add('hidden');
            closeEdgePlusActionMenu();
            closeAllPopovers();
            renderCanvas();
        triggerAutoSave();
            return;
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            deleteSelectedShapes();
            return;
          }

          const k = e.key.toLowerCase();
          if (k === 'h') setTool('pan');
          else if (k === 'v' || k === '1') setTool('select');
          else if (k === 'r' || k === '2') setTool('rect');
          else if (k === 'd' || k === '3') setTool('diamond');
          else if (k === 'o' || k === '4') setTool('ellipse');
          else if (k === 'b' || k === '5') setTool('cylinder');
          else if (k === 'f' || k === '6') setTool('frame');
          else if (k === 'g') setTool('table');
          else if (k === 'a' || k === '7') setTool('arrow');
          else if (k === 'l' || k === '8') setTool('line');
          else if (k === 'p' || k === '9') setTool('freedraw');
          else if (k === 't' || k === '0') setTool('text');
          else if (k === 's') setTool('sticky');
          else if (k === 'e') setTool('eraser');
        });

        window.addEventListener('keyup', function (e) {
          if (e.code === 'Space') {
            app.interaction.spacePressed = false;
            if (!app.editingShapeId) {
              setTool(app.activeTool);
            }
          }
        });

        window.addEventListener('resize', resizeCanvasToViewport);
      }

      window.addEventListener('DOMContentLoaded', async function (e) {
        // 1. Clear display areas before loading fresh data
        if (richNotesEl) richNotesEl.innerHTML = '';
        if (rawNotesEl) rawNotesEl.value = '';

        // 2. Fetch latest saved state from backend on refresh
        try {
          let response = await fetch(`${BACKEND_URL}/refresh`);
          let data = await response.json();

          if (data && data.success && data.workspace && data.workspace.sheets && data.workspace.sheets.length > 0) {
            sheets.length = 0;
            data.workspace.sheets.forEach(function (s) { sheets.push(s); });
            app.currentSheetIdx = Math.min(data.workspace.activeSheetIdx || 0, sheets.length - 1);
            const activeSheet = sheets[app.currentSheetIdx];
            app.shapes = activeSheet.shapes || [];
            app.camera = activeSheet.camera || { x: 0, y: 0, zoom: 1 };
            if (activeSheet.notesHTML) richNotesEl.innerHTML = activeSheet.notesHTML;
            if (activeSheet.notesMarkdown) rawNotesEl.value = activeSheet.notesMarkdown;
            if (data.workspace.viewMode) app.viewMode = data.workspace.viewMode;
            if (data.workspace.splitRatio) app.splitRatio = data.workspace.splitRatio;
          }
        } catch (err) {
          console.warn('Backend /refresh unavailable, falling back to local backup:', err.message);
          try {
            const backup = JSON.parse(localStorage.getItem('architecture_workspace_backup'));
            if (backup && backup.sheets && backup.sheets.length > 0) {
              sheets.length = 0;
              backup.sheets.forEach(function (s) { sheets.push(s); });
              app.currentSheetIdx = Math.min(backup.activeSheetIdx || 0, sheets.length - 1);
              const activeSheet = sheets[app.currentSheetIdx];
              app.shapes = activeSheet.shapes || [];
              app.camera = activeSheet.camera || { x: 0, y: 0, zoom: 1 };
              if (activeSheet.notesHTML) richNotesEl.innerHTML = activeSheet.notesHTML;
              if (activeSheet.notesMarkdown) rawNotesEl.value = activeSheet.notesMarkdown;
            }
          } catch (e) {}
        }

        renderExcelSheetsBar();
        bindUIEvents();
        resizeCanvasToViewport();
        renderCanvas();
      });
    })();