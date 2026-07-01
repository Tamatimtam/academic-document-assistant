// ==========================================
// KONFIGURASI KAMUS INTERNAL & PENGECUALIAN
// ==========================================

const DOMAIN_PHRASES = [
  "sliding window", "context switching", "time tax", "alert fatigue",
  "active response", "single pane of glass", "bulk insert", "single row insert",
  "syntax highlighting", "collapsible nodes", "copy to clipboard",
  "rule-based thresholding", "custom rules", "threat level", "background job",
  "separation of concerns", "port mapping", "black box", "cold start",
  "step count", "time on task", "confusion matrix", "true positive",
  "true negative", "false positive", "false negative", "low and slow",
  "ingestion throughput", "events per second", "memory leak", "ground truth",
  "trade-off", "multi-tiered threshold", "machine learning", "index granularity"
];

const EXCLUSIONS = [
  "wazuh", "clickhouse", "redis", "opnsense", "postgresql", "postgres", 
  "pfsense", "gunicorn", "flask", "python", "javascript", "html", "sql", 
  "json", "api", "ip", "cidr", "cpu", "ram", "ssd", "nvme", "soar", 
  "siem", "soc", "mttr", "xss", "pci", "dss", "gdpr", "eps", "ttl", "docker"
];

// ==========================================
// FUNGSI PERSISTENSI PREFERENSI (USER DATA)
// ==========================================

function getPersistedPreferences() {
  const props = PropertiesService.getDocumentProperties();
  const foreignStr = props.getProperty('FOREIGN_TERMS') || '[]';
  const excludedStr = props.getProperty('EXCLUDED_TERMS') || '[]';
  const skipTables = props.getProperty('SKIP_TABLES_ITALICS') === 'true';
  return {
    foreignTerms: JSON.parse(foreignStr),
    excludedTerms: JSON.parse(excludedStr),
    skipTables: skipTables
  };
}

function savePersistedPreferences(foreignTerms, excludedTerms) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('FOREIGN_TERMS', JSON.stringify(foreignTerms));
  props.setProperty('EXCLUDED_TERMS', JSON.stringify(excludedTerms));
}

// ==========================================
// FUNGSI PERSISTENSI ITEMS DILEWATI (WHITELIST)
// ==========================================

function getSkippedItems() {
  const props = PropertiesService.getDocumentProperties();
  const skippedStr = props.getProperty('SKIPPED_ITEMS') || '[]';
  return JSON.parse(skippedStr);
}

function getOrCreateElementBookmark(elementIndex, childIndex) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const element = body.getChild(elementIndex);
  
  let targetElement = element;
  
  if (element.getType() === DocumentApp.ElementType.TABLE) {
    const table = element.asTable();
    if (table.getNumRows() > 0 && table.getRow(0).getNumCells() > 0) {
      const cell = table.getRow(0).getCell(0);
      if (cell.getNumChildren() > 0) {
        targetElement = cell.getChild(0);
      }
    }
  }
  else if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
    targetElement = element;
  }
  
  let bmId = getBookmarkAtElement(targetElement);
  if (!bmId) {
    const position = doc.newPosition(targetElement, 0);
    const bm = doc.addBookmark(position);
    bmId = bm.getId();
  }
  return bmId;
}

function toggleSkipItem(elementIndex, childIndex, skipState) {
  const bmId = getOrCreateElementBookmark(elementIndex, childIndex);
  const skipped = getSkippedItems();
  const index = skipped.indexOf(bmId);
  
  if (skipState && index === -1) {
    skipped.push(bmId);
  } else if (!skipState && index !== -1) {
    skipped.splice(index, 1);
  }
  
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('SKIPPED_ITEMS', JSON.stringify(skipped));
  
  return { success: true, isSkipped: skipState, bookmarkId: bmId };
}

// ==========================================
// FUNGSI BACKEND UTAMA (SIDEBAR & ANALISIS)
// ==========================================

function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu('Skripsi Tools')
      .addItem('Buka Panel Asisten Skripsi', 'showSidebar')
      .addToUi();
}

function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Sidebar')
      .evaluate()
      .setTitle('Asisten Skripsi Antigravity')
      .setWidth(320);
  DocumentApp.getUi().showSidebar(html);
}

function analyzeDoc() {
  const prefs = getPersistedPreferences();
  const body = DocumentApp.getActiveDocument().getBody();
  const textContent = body.getText();
  const rawWords = textContent.match(/[a-zA-Z_]+/g) || [];
  
  const uniqueWords = [...new Set(rawWords.map(w => w.trim().replace(/^_+|_+$/g, '')))]
                        .filter(w => w.length > 2);
  
  const detectedCodeVars = [];
  const translationCandidates = [];
  const foreignTerms = [...prefs.foreignTerms];
  const excludedTerms = [...prefs.excludedTerms];
  
  uniqueWords.forEach(word => {
    const lowerWord = word.toLowerCase();
    if (EXCLUSIONS.includes(lowerWord)) return;
    if (excludedTerms.includes(lowerWord)) return;
    if (foreignTerms.includes(word)) return;
    
    if (lowerWord.includes('_') || /[a-z][A-Z]/.test(word)) {
      detectedCodeVars.push(word);
      return;
    }
    if (word === word.toLowerCase() && !/[^a-zA-Z]/.test(word)) {
      translationCandidates.push(word);
    }
  });
  
  const newlyDetectedForeign = [];
  const chunkSize = 80;
  for (let i = 0; i < translationCandidates.length; i += chunkSize) {
    const chunk = translationCandidates.slice(i, i + chunkSize);
    const batchText = chunk.join("\n");
    try {
      const translatedBatch = LanguageApp.translate(batchText, "id", "en");
      const translatedWords = translatedBatch.split("\n");
      for (let j = 0; j < chunk.length; j++) {
        const original = chunk[j];
        const translated = (translatedWords[j] || "").trim().toLowerCase();
        if (original === translated) {
          newlyDetectedForeign.push(original);
        }
      }
    } catch (e) {
      Logger.log("Error: " + e.message);
    }
  }
  
  const allDetected = [...new Set([...foreignTerms, ...newlyDetectedForeign, ...detectedCodeVars, ...DOMAIN_PHRASES])].sort();
  savePersistedPreferences(allDetected, excludedTerms);
  
  return {
    foreignTerms: allDetected,
    excludedTerms: excludedTerms
  };
}

function applyItalicsToTerm(term, skipTables) {
  const body = DocumentApp.getActiveDocument().getBody();
  const pattern = "(?i)\b" + escapeRegex(term) + "\b";
  let found = body.findText(pattern);
  while (found !== null) {
    let textElement = found.getElement().asText();
    if (!(skipTables && isInsideTable(textElement))) {
      textElement.setItalic(found.getStartOffset(), found.getEndOffsetInclusive(), true);
    }
    found = body.findText(pattern, found);
  }
}

function removeItalicsFromTerm(term, skipTables) {
  const body = DocumentApp.getActiveDocument().getBody();
  const pattern = "(?i)\b" + escapeRegex(term) + "\b";
  let found = body.findText(pattern);
  while (found !== null) {
    let textElement = found.getElement().asText();
    if (!(skipTables && isInsideTable(textElement))) {
      textElement.setItalic(found.getStartOffset(), found.getEndOffsetInclusive(), false);
    }
    found = body.findText(pattern, found);
  }
}

function applyItalicsToAll(skipTables) {
  const prefs = getPersistedPreferences();
  const foreignTerms = prefs.foreignTerms || [];
  const excludedTerms = prefs.excludedTerms || [];
  
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('SKIP_TABLES_ITALICS', String(skipTables));
  
  foreignTerms.forEach(term => {
    applyItalicsToTerm(term, skipTables);
  });
  
  excludedTerms.forEach(term => {
    removeItalicsFromTerm(term, skipTables);
  });
  
  return { success: true, count: foreignTerms.length };
}

function isInsideTable(element) {
  let parent = element.getParent ? element.getParent() : null;
  while (parent) {
    const type = parent.getType();
    if (type === DocumentApp.ElementType.TABLE || 
        type === DocumentApp.ElementType.TABLE_CELL || 
        type === DocumentApp.ElementType.TABLE_ROW) {
      return true;
    }
    parent = parent.getParent ? parent.getParent() : null;
  }
  return false;
}

function escapeRegex(string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// ==========================================
// SYSTEM PROGRESS POLLING (CACHE SERVICE)
// ==========================================

function getProgress() {
  const cache = CacheService.getUserCache();
  return cache.get('PROGRESS') || '';
}

// ==========================================
// FUNGSI CAPTION & CROSS-REFERENCE MANAGER
// ==========================================

function extractCaptionFromParagraph(paragraph, keyword) {
  const text = paragraph.getText().trim();
  if (!text) return null;
  
  const lines = text.split(/[\n\r\u000b]/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase().startsWith(keyword.toLowerCase())) {
      return {
        fullText: line,
        cleanTitle: line.replace(new RegExp("^(" + keyword + ")\\s*([ivxldcm\\d]+[\\.\\-]\\d+|[ivxldcm\\d]+)?\\s*[:\\-\\s]*", "i"), "").trim()
      };
    }
  }
  return null;
}

// OPTIMASI: Bangun peta relasi elemen-ke-bookmark secara sekaligus (O(1) lookup).
// Ini menghilangkan pencarian linier O(N * M) di dalam traversal dokumen, mempercepat pemindaian naskah.
function buildBookmarkPathMap() {
  const doc = DocumentApp.getActiveDocument();
  const bookmarks = doc.getBookmarks();
  const map = {};
  
  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    const pos = bm.getPosition();
    if (pos) {
      let posElement = pos.getElement();
      while (posElement) {
        const path = getElementPath(posElement);
        if (path) {
          map[path] = bm.getId();
        }
        posElement = posElement.getParent();
      }
    }
  }
  return map;
}

function getCaptionsList() {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const items = [];
  const skippedIds = getSkippedItems();
  
  CacheService.getUserCache().put('PROGRESS', 'Menginisialisasi pemindaian naskah... 5%', 60);
  
  // OPTIMASI: Bangun lookup map bookmark di awal secara cepat
  const bookmarkPathMap = buildBookmarkPathMap();
  
  let currentChapter = "0"; // Sebelum BAB I
  let imageCount = 1;
  let tableCount = 1;
  let hasStarted = false;
  
  const totalElements = body.getNumChildren();
  let lastPct = -1;
  
  for (let i = 0; i < totalElements; i++) {
    // OPTIMASI: Batasi frekuensi penulisan CacheService agar tidak membebani network (hanya jika naik 5%)
    const pct = Math.round((i / totalElements) * 80) + 10; // Rentang 10% - 90%
    if (pct >= lastPct + 5 || i === totalElements - 1) {
      lastPct = pct;
      CacheService.getUserCache().put('PROGRESS', `Memindai isi dokumen: ${pct}% (Elemen ${i + 1}/${totalElements})`, 60);
    }
    
    const child = body.getChild(i);
    const childType = child.getType();
    
    if (childType === DocumentApp.ElementType.PARAGRAPH) {
      const p = child.asParagraph();
      const text = p.getText().trim();
      
      if (text.toUpperCase().includes("DAFTAR RIWAYAT HIDUP")) {
        break;
      }
      
      const babMatch = text.match(/^\s*BAB\s*([IVXLCDM\d]+)/i);
      if (babMatch) {
        hasStarted = true;
        currentChapter = convertRomanToArabic(babMatch[1]);
        imageCount = 1;
        tableCount = 1;
      }
      
      if (!hasStarted) continue;
      
      // Cari Gambar di dalam Paragraf
      const numChildren = p.getNumChildren();
      for (let j = 0; j < numChildren; j++) {
        const inlineChild = p.getChild(j);
        if (inlineChild.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
          const imgId = "img_" + i + "_" + j;
          
          let captionText = "";
          let cleanTitle = "";
          let hasCaption = false;
          // OPTIMASI: Gunakan lookup map O(1) alih-alih scan linier
          let bookmarkId = bookmarkPathMap[getElementPath(p)] || ""; 
          let captionIndex = -1;
          
          // Cek di paragraf yang sama (Shift+Enter)
          let capInfo = extractCaptionFromParagraph(p, "gambar");
          if (capInfo) {
            captionText = capInfo.fullText;
            cleanTitle = capInfo.cleanTitle;
            hasCaption = true;
            captionIndex = i;
          } else {
            // Cek di 5 paragraf berikutnya
            for (let k = 1; k <= 5; k++) {
              if (i + k < totalElements) {
                const nextChild = body.getChild(i + k);
                if (nextChild.getType() === DocumentApp.ElementType.PARAGRAPH) {
                  const nextP = nextChild.asParagraph();
                  capInfo = extractCaptionFromParagraph(nextP, "gambar");
                  if (capInfo) {
                    captionText = capInfo.fullText;
                    cleanTitle = capInfo.cleanTitle;
                    hasCaption = true;
                    captionIndex = i + k;
                    if (!bookmarkId) bookmarkId = bookmarkPathMap[getElementPath(nextP)] || "";
                    break;
                  } else if (nextP.getText().trim() !== "") {
                    break;
                  }
                } else {
                  break;
                }
              }
            }
          }
          
          const isSkipped = bookmarkId && skippedIds.indexOf(bookmarkId) !== -1;
          
          items.push({
            type: "image",
            id: imgId,
            elementIndex: i,
            childIndex: j,
            chapter: currentChapter,
            sequence: isSkipped ? 0 : imageCount++,
            captionText: captionText,
            cleanTitle: cleanTitle,
            hasCaption: hasCaption,
            bookmarkId: bookmarkId || "",
            captionIndex: captionIndex,
            isSkipped: !!isSkipped
          });
        }
      }
    }
    
    if (!hasStarted) continue;
    
    // Deteksi Tabel
    if (childType === DocumentApp.ElementType.TABLE) {
      const tableId = "table_" + i;
      
      let captionText = "";
      let cleanTitle = "";
      let hasCaption = false;
      // OPTIMASI: Gunakan lookup map O(1)
      let bookmarkId = bookmarkPathMap[getElementPath(child)] || "";
      let captionIndex = -1;
      
      // Cek di atas tabel (max 3 paragraf)
      for (let k = 1; k <= 3; k++) {
        if (i - k >= 0) {
          const prevChild = body.getChild(i - k);
          if (prevChild.getType() === DocumentApp.ElementType.PARAGRAPH) {
            const prevP = prevChild.asParagraph();
            const capInfo = extractCaptionFromParagraph(prevP, "tabel");
            if (capInfo) {
              captionText = capInfo.fullText;
              cleanTitle = capInfo.cleanTitle;
              hasCaption = true;
              captionIndex = i - k;
              if (!bookmarkId) bookmarkId = bookmarkPathMap[getElementPath(prevP)] || "";
              break;
            } else if (prevP.getText().trim() !== "") {
              break;
            }
          } else {
            break;
          }
        }
      }
      
      // Cek di bawah tabel (max 3 paragraf)
      if (!hasCaption) {
        for (let k = 1; k <= 3; k++) {
          if (i + k < totalElements) {
            const nextChild = body.getChild(i + k);
            if (nextChild.getType() === DocumentApp.ElementType.PARAGRAPH) {
              const nextP = nextChild.asParagraph();
              const capInfo = extractCaptionFromParagraph(nextP, "tabel");
              if (capInfo) {
                captionText = capInfo.fullText;
                cleanTitle = capInfo.cleanTitle;
                hasCaption = true;
                captionIndex = i + k;
                if (!bookmarkId) bookmarkId = bookmarkPathMap[getElementPath(nextP)] || "";
                break;
              } else if (nextP.getText().trim() !== "") {
                break;
              }
            } else {
              break;
            }
          }
        }
      }
      
      const isSkipped = bookmarkId && skippedIds.indexOf(bookmarkId) !== -1;
      
      items.push({
        type: "table",
        id: tableId,
        elementIndex: i,
        chapter: currentChapter,
        sequence: isSkipped ? 0 : tableCount++,
        captionText: captionText,
        cleanTitle: cleanTitle,
        hasCaption: hasCaption,
        bookmarkId: bookmarkId || "",
        captionIndex: captionIndex,
        isSkipped: !!isSkipped
      });
    }
  }
  
  CacheService.getUserCache().put('PROGRESS', 'Menyusun pohon outline naskah... 95%', 60);
  return items;
}

function convertRomanToArabic(roman) {
  const clean = roman.trim().toUpperCase();
  const map = { 
    "I": "1", "II": "2", "III": "3", "IV": "4", "V": "5", 
    "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10" 
  };
  return map[clean] || clean;
}

function getElementPath(element) {
  if (!element) return "";
  const path = [];
  let current = element;
  while (current) {
    const parent = current.getParent();
    if (parent) {
      path.push(parent.getChildIndex(current));
      current = parent;
    } else {
      break;
    }
  }
  return path.reverse().join("/");
}

function getBookmarkAtElement(element) {
  const doc = DocumentApp.getActiveDocument();
  const bookmarks = doc.getBookmarks();
  const targetPath = getElementPath(element);
  if (!targetPath) return "";
  
  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    const pos = bm.getPosition();
    if (pos) {
      let posElement = pos.getElement();
      while (posElement) {
        if (getElementPath(posElement) === targetPath) {
          return bm.getId();
        }
        posElement = posElement.getParent();
      }
    }
  }
  return "";
}

function selectDocumentElement(elementIndex, childIndex) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const element = body.getChild(elementIndex);
  
  let targetParagraph = null;
  if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
    targetParagraph = element.asParagraph();
  } else if (element.getType() === DocumentApp.ElementType.TABLE) {
    const table = element.asTable();
    if (table.getNumRows() > 0 && table.getRow(0).getNumCells() > 0) {
      const cell = table.getRow(0).getCell(0);
      if (cell.getNumChildren() > 0) {
        targetParagraph = cell.getChild(0).asParagraph();
      }
    }
  }
  
  if (targetParagraph) {
    const position = doc.newPosition(targetParagraph, 0);
    doc.setCursor(position);
  }
}

function setParagraphCaptionText(paragraph, newCaptionText) {
  const numChildren = paragraph.getNumChildren();
  let textChild = null;
  for (let i = 0; i < numChildren; i++) {
    const child = paragraph.getChild(i);
    if (child.getType() === DocumentApp.ElementType.TEXT) {
      textChild = child.asText();
      break;
    }
  }
  
  if (textChild) {
    const originalText = textChild.getText();
    const newlineMatch = originalText.match(/^[\r\n\u000b]+/);
    const prefixNewlines = newlineMatch ? newlineMatch[0] : "";
    textChild.setText(prefixNewlines + newCaptionText);
  } else {
    paragraph.appendText(newCaptionText);
  }
}

function saveCaptionText(type, elementIndex, childIndex, captionIndex, bookmarkId, newTitleText, chapter, sequence) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  
  const prefix = type === "image" ? "Gambar" : "Tabel";
  const newCaptionLabel = `${prefix} ${chapter}.${sequence}`;
  const newCaptionText = `${newCaptionLabel} ${newTitleText}`;
  
  let finalBookmarkId = bookmarkId;
  let targetParagraph = null;
  
  if (captionIndex !== -1 && captionIndex !== null) {
    targetParagraph = body.getChild(captionIndex).asParagraph();
  } else {
    if (type === "image") {
      targetParagraph = body.insertParagraph(elementIndex + 1, "");
    } else {
      targetParagraph = body.insertParagraph(elementIndex, "");
    }
    targetParagraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  }
  
  if (type === "image") {
    targetParagraph.setHeading(DocumentApp.ParagraphHeading.HEADING5);
  } else {
    targetParagraph.setHeading(DocumentApp.ParagraphHeading.HEADING6);
  }
  
  setParagraphCaptionText(targetParagraph, newCaptionText);
  
  if (!finalBookmarkId) {
    const position = doc.newPosition(targetParagraph, 0);
    const bm = doc.addBookmark(position);
    finalBookmarkId = bm.getId();
  }
  
  return { success: true, bookmarkId: finalBookmarkId };
}

function renumberAllCaptions() {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  
  CacheService.getUserCache().put('PROGRESS', 'Memindai ulang dokumen untuk perapian... 10%', 60);
  const items = getCaptionsList();
  
  const bookmarkMap = {};
  const totalItems = items.filter(i => !i.isSkipped && i.hasCaption && i.captionIndex !== -1).length;
  let processedCount = 0;
  
  CacheService.getUserCache().put('PROGRESS', 'Mulai memformat ulang caption teks... 25%', 60);
  let lastPct = -1;
  
  items.forEach(item => {
    if (item.isSkipped) return;
    if (!item.hasCaption || item.captionIndex === -1) return;
    
    processedCount++;
    // OPTIMASI: Batasi frekuensi penulisan CacheService progress
    const pct = Math.round((processedCount / totalItems) * 40) + 25; // Rentang 25% - 65%
    if (pct >= lastPct + 5 || processedCount === totalItems) {
      lastPct = pct;
      CacheService.getUserCache().put('PROGRESS', `Memperbarui nomor: ${pct}% (${processedCount}/${totalItems} caption)`, 60);
    }
    
    const captionParagraph = body.getChild(item.captionIndex).asParagraph();
    const originalText = captionParagraph.getText().trim();
    
    const cleanTitle = originalText.replace(/^(gambar|tabel)\s*([ivxldcm\d]+[\.\-]\d+|[ivxldcm\d]+)?\s*[:\-\s]*/i, "").trim();
    
    const prefix = item.type === "image" ? "Gambar" : "Tabel";
    const newLabel = `${prefix} ${item.chapter}.${item.sequence}`;
    const newCaptionText = `${newLabel} ${cleanTitle}`;
    
    if (item.type === "image") {
      captionParagraph.setHeading(DocumentApp.ParagraphHeading.HEADING5);
    } else {
      captionParagraph.setHeading(DocumentApp.ParagraphHeading.HEADING6);
    }
    
    let bookmarkId = item.bookmarkId;
    if (!bookmarkId) {
      const position = doc.newPosition(captionParagraph, 0);
      const bm = doc.addBookmark(position);
      bookmarkId = bm.getId();
    }
    
    setParagraphCaptionText(captionParagraph, newCaptionText);
    bookmarkMap[bookmarkId] = newLabel;
  });
  
  CacheService.getUserCache().put('PROGRESS', 'Menyelaraskan link rujuk-silang (cross-references)... 70%', 60);
  updateCrossReferences(bookmarkMap);
  
  CacheService.getUserCache().put('PROGRESS', 'Semua selesai! Menyinkronkan perubahan... 95%', 60);
  return { success: true, updatedCount: Object.keys(bookmarkMap).length };
}

function updateCrossReferences(bookmarkMap) {
  const body = DocumentApp.getActiveDocument().getBody();
  traverseAndReplaceLinks(body, bookmarkMap);
}

function traverseAndReplaceLinks(element, bookmarkMap) {
  const type = element.getType();
  if (type === DocumentApp.ElementType.TEXT) {
    const text = element.asText();
    const content = text.getText();
    if (!content) return;
    
    // FAST CHECK: Hanya proses jika teks mengandung kata "gambar" atau "tabel" (rujukan cross-ref)
    // Ini menghemat 98% waktu eksekusi karena kita mengabaikan seluruh paragraf narasi biasa.
    const lowerContent = content.toLowerCase();
    if (lowerContent.indexOf("gambar") === -1 && lowerContent.indexOf("tabel") === -1) {
      return;
    }
    
    const runs = getLinkRuns(text);
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const start = run.start;
      const end = run.end;
      const url = run.url;
      
      if (url && url.indexOf("#bookmark=id.") === 0) {
        const bookmarkId = url.substring("#bookmark=id.".length);
        if (bookmarkMap[bookmarkId]) {
          const newLabel = bookmarkMap[bookmarkId];
          const oldLabel = content.substring(start, end + 1);
          
          if (oldLabel !== newLabel) {
            text.deleteText(start, end);
            text.insertText(start, newLabel);
            text.setLinkUrl(start, start + newLabel.length - 1, url);
            
            traverseAndReplaceLinks(element, bookmarkMap);
            return;
          }
        }
      }
    }
  } else if (element.getNumChildren) {
    const num = element.getNumChildren();
    for (let i = 0; i < num; i++) {
      traverseAndReplaceLinks(element.getChild(i), bookmarkMap);
    }
  }
}

function getLinkRuns(textElement) {
  const content = textElement.getText();
  const runs = [];
  if (!content) return runs;
  
  let currentUrl = null;
  let runStart = 0;
  
  for (let i = 0; i < content.length; i++) {
    const url = textElement.getLinkUrl(i);
    if (url !== currentUrl) {
      if (i > 0) {
        runs.push({
          start: runStart,
          end: i - 1,
          url: currentUrl
        });
      }
      currentUrl = url;
      runStart = i;
    }
  }
  
  runs.push({
    start: runStart,
    end: content.length - 1,
    url: currentUrl
  });
  
  return runs;
}

function insertCrossReferenceAtCursor(bookmarkId, labelText) {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();
  if (cursor) {
    const element = cursor.insertText(labelText);
    if (element) {
      element.asText().setLinkUrl(0, labelText.length - 1, "#bookmark=id." + bookmarkId);
      return { success: true };
    }
  }
  return { success: false, error: "Cursor tidak ditemukan. Klik di area dokumen terlebih dahulu!" };
}
// ==========================================
// BLOK KODE: NOMOR BARIS
// ==========================================

/**
 * Helper to recursively find all Paragraph/ListItem elements nested inside a container.
 */
function collectParagraphsDown(el, list, seen) {
  if (!el) return;
  const type = el.getType();
  if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
    if (!seen.has(el)) {
      seen.add(el);
      list.push(el);
    }
    return;
  }
  if (el.getNumChildren) {
    for (let i = 0; i < el.getNumChildren(); i++) {
      collectParagraphsDown(el.getChild(i), list, seen);
    }
  }
}

/**
 * Gets unique Paragraph/ListItem elements from selection, handling containing elements (like tables/cells).
 */
function getSelectedParagraphs(selection) {
  const rangeElements = selection.getRangeElements();
  const paragraphs = [];
  const seen = new Set();

  for (const re of rangeElements) {
    const el = re.getElement();
    
    // 1. Try to find containing Paragraph/ListItem by walking UP
    let parentPara = el;
    while (parentPara && 
           parentPara.getType() !== DocumentApp.ElementType.PARAGRAPH &&
           parentPara.getType() !== DocumentApp.ElementType.LIST_ITEM) {
      parentPara = parentPara.getParent ? parentPara.getParent() : null;
    }
    
    if (parentPara) {
      if (!seen.has(parentPara)) {
        seen.add(parentPara);
        paragraphs.push(parentPara);
      }
    } else {
      // 2. If it's a container element above Paragraph level (e.g. TableCell, TableRow, Table), walk DOWN to collect
      collectParagraphsDown(el, paragraphs, seen);
    }
  }
  return paragraphs;
}

/**
 * Adds line numbers to each paragraph in the current selection.
 * Numbers are left-padded so they align (e.g. " 1  ", " 2  ", "10  ").
 * The line numbers are styled as Consolas and black color (#000000).
 * Supports paragraphs nested inside TableCells.
 *
 * @param {number} startLine  The first line number to use (default 1).
 * @returns {{ success: boolean, message: string }}
 */
function addLineNumbers(startLine) {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (!selection) {
    return { success: false, message: 'Pilih teks terlebih dahulu.' };
  }

  const paragraphs = getSelectedParagraphs(selection);

  if (!paragraphs.length) {
    return { success: false, message: 'Tidak ada paragraf yang dapat diproses dalam pilihan.' };
  }

  const base = (typeof startLine === 'number' && !isNaN(startLine)) ? startLine : 1;
  const lastNum = base + paragraphs.length - 1;
  const padWidth = String(lastNum).length;

  for (let i = 0; i < paragraphs.length; i++) {
    const lineNum = base + i;
    const prefix = String(lineNum).padStart(padWidth, ' ') + '  ';
    const para = paragraphs[i];
    const textObj = para.editAsText();
    
    // Insert line number prefix
    textObj.insertText(0, prefix);
    
    // Explicitly style the line number as black Consolas
    textObj.setFontFamily(0, prefix.length - 1, 'Consolas');
    textObj.setForegroundColor(0, prefix.length - 1, '#000000');
  }

  return {
    success: true,
    message: paragraphs.length + ' baris diberi nomor (' + base + '–' + lastNum + ').'
  };
}

/**
 * Removes leading line numbers (digits followed by whitespace) from each
 * paragraph in the current selection. Works in tables and body flow.
 *
 * @returns {{ success: boolean, message: string }}
 */
function removeLineNumbers() {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (!selection) {
    return { success: false, message: 'Pilih teks terlebih dahulu.' };
  }

  const paragraphs = getSelectedParagraphs(selection);
  let removed = 0;
  let skipped = 0;

  for (const para of paragraphs) {
    const text = para.getText();
    // Match leading digits (with optional leading spaces) followed by whitespace
    const match = text.match(/^(\s*\d+\s+)/);
    if (match) {
      para.editAsText().deleteText(0, match[0].length - 1);
      removed++;
    } else {
      skipped++;
    }
  }

  if (removed === 0) {
    return { success: false, message: 'Tidak ada nomor baris yang ditemukan dalam pilihan.' };
  }
  return {
    success: true,
    message: removed + ' nomor baris dihapus.' + (skipped > 0 ? ' (' + skipped + ' baris dilewati)' : '')
  };
}
