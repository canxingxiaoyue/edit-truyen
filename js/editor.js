// =========================================================================
// QUẢN LÝ BẢNG DỊCH CHÍNH (MỤC 1) - KIẾN TRÚC ZERO-DOM CHO DESKTOP
// THỨ TỰ CỘT: 1. Raw -> 2. Pinyin -> 3. Bản QT -> 4. Bản ê đít -> 5. Bản bê ta -> 6. Chú thích
// TÍCH HỢP: HỆ THỐNG CHÚ THÍCH HAI CHIỀU TỰ ĐỘNG & COPY ĐA ĐỊNH DẠNG KÈM CHÚ THÍCH
// =========================================================================
let saveTimeout;
let countTimeout;

// 1. TRẠNG THÁI CHẾ ĐỘ CHỌN ĐỂ XÓA HÀNG LOẠT
let isBatchDeleteMode = false;
let selectedBatchRows = new Set(); 
let selectedBatchCols = new Set(); 

// Bộ nhớ tạm bảo vệ chú thích khi người dùng Cắt/Dán (Ctrl+X / Ctrl+V) di chuyển đoạn văn
let lastFootnoteSelection = null;
window._footnoteTrashCache = window._footnoteTrashCache || new Map();

// 2. CẤU HÌNH CỘT TRÊN MOBILE (CHUẨN HÓA THEO THỨ TỰ MỚI)
const COLUMN_META = {
    raw:         { label: 'RAW',         badgeClass: 'badge-raw' },
    pinyin:      { label: 'PINYIN',      badgeClass: 'badge-pinyin' },
    qt:          { label: 'BẢN QT',      badgeClass: 'badge-qt' },
    translation: { label: 'BẢN EDIT',    badgeClass: 'badge-edit' },
    edit:        { label: 'BẢN BETA',    badgeClass: 'badge-beta' },
    meaning:     { label: 'CHÚ THÍCH',   badgeClass: 'badge-meaning' }
};

let mobileColCollapsed = JSON.parse(localStorage.getItem('mobile_col_collapsed')) || {
    raw: false, pinyin: false, qt: false, translation: false, edit: false, meaning: true 
};

// 3. HÀM TIỆN ÍCH CƠ BẢN
function normalizeUnicodeText(text) {
    if (typeof text !== 'string') return text || '';
    try { return text.normalize('NFC'); } catch (e) { return text; }
}

function escapeFootnoteHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function ensureRowFootnoteStructure(row) {
    if (!row) return;
    if (!row.id) row.id = 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    if (!Array.isArray(row.footnotes)) row.footnotes = [];
}

// Ép lấy dữ liệu từ ô đang đặt con trỏ vào mảng data ngay lập tức
function syncActiveCellToData() {
    const activeEl = document.activeElement;
    if (!activeEl) return;

    const targetTd = activeEl.closest('td[data-col]');
    if (!targetTd) return;
    const tr = targetTd.closest('tr');
    if (!tr) return;

    const rowIndex = parseInt(tr.dataset.index, 10);
    const colName = targetTd.dataset.col;
    if (isNaN(rowIndex) || !colName || !data[rowIndex]) return;

    // Nếu đang gõ trong ô giải thích chú thích
    if (activeEl.classList.contains('fn-note-input')) {
        const fnId = activeEl.dataset.fnId;
        ensureRowFootnoteStructure(data[rowIndex]);
        const fn = data[rowIndex].footnotes.find(f => f.id === fnId);
        if (fn) fn.note = activeEl.value;
    }

    const contentEl = activeEl.closest('.cell-content') || targetTd.querySelector('.cell-content') || targetTd;
    let rawHtml = contentEl.innerHTML;
    let plainText = normalizeUnicodeText(contentEl.innerText);
    if (rawHtml === '<br>' || plainText.trim() === '') {
        if (!contentEl.querySelector('sup.fn-marker')) {
            rawHtml = '';
        }
    }
    data[rowIndex][colName] = rawHtml;
}

// Lưu đồng bộ lập tức xuống LocalStorage (Dùng khi F5, đóng tab hoặc bấm Lưu)
function flushSave() {
    clearTimeout(saveTimeout);
    syncActiveCellToData();

    try {
        localStorage.setItem('translationData', JSON.stringify(data));
        localStorage.setItem('manualQTState', JSON.stringify(manualQTState));
        if (typeof chapterTitle !== 'undefined' && chapterTitle) {
            localStorage.setItem('chapterTitle', chapterTitle);
        }

        // ĐỒNG BỘ 2 CHIỀU: Cập nhật ngay vào Dự án đang mở trong 'savedProjects'
        if (typeof currentProjectId !== 'undefined' && currentProjectId) {
            const rawProj = localStorage.getItem('savedProjects_v2') || localStorage.getItem('savedProjects');
            if (rawProj) {
                let projects = JSON.parse(rawProj);
                if (Array.isArray(projects)) {
                    const idx = projects.findIndex(p => p.id === currentProjectId);
                    if (idx >= 0) {
                        projects[idx].data = data;
                        projects[idx].rowCount = data.length;
                        projects[idx].title = chapterTitle || projects[idx].title;
                        projects[idx].updatedAt = Date.now();
                        localStorage.setItem('savedProjects_v2', JSON.stringify(projects));
                    }
                }
            }
        }
    } catch (e) {
        console.error("Lỗi flushSave:", e);
    }
}

function debounceSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        flushSave();
        const now = Date.now();
        if (now - lastHistoryTime > 15000) { 
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
            lastHistoryTime = now;
        }
    }, 400);

    clearTimeout(countTimeout);
    countTimeout = setTimeout(() => { updateWordCounts(); }, 300);
}

// =========================================================================
// HỆ THỐNG CHÚ THÍCH HAI CHIỀU TỰ ĐỘNG (FOOTNOTE ENGINE)
// =========================================================================
function captureFootnoteSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === 3 ? node.parentElement : node;
    const contentEl = el ? el.closest('#table-body .cell-content') : null;
    if (!contentEl) return;

    const targetTd = contentEl.closest('td[data-col]');
    const tr = targetTd ? targetTd.closest('tr') : null;
    if (!targetTd || !tr) return;

    lastFootnoteSelection = {
        contentEl,
        targetTd,
        rowIndex: parseInt(tr.dataset.index, 10),
        colName: targetTd.dataset.col,
        range: range.cloneRange()
    };
}

function getNextFootnoteNumber() {
    let maxNum = 0;
    if (Array.isArray(data)) {
        data.forEach(row => {
            if (row && Array.isArray(row.footnotes)) {
                row.footnotes.forEach(fn => {
                    const n = parseInt(fn.num, 10);
                    if (!isNaN(n) && n > maxNum) maxNum = n;
                });
            }
        });
    }
    document.querySelectorAll('#table-body sup.fn-marker').forEach(sup => {
        const n = parseInt(sup.dataset.fnNum || (sup.textContent || '').replace(/\D/g, ''), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    return maxNum + 1;
}

function autoResizeFootnoteInput(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function buildCellFootnotesHTML(rowObj, col) {
    const allFn = (rowObj && Array.isArray(rowObj.footnotes)) ? rowObj.footnotes : [];
    const cellFn = allFn.filter(fn => (fn.col || 'translation') === col);
    if (cellFn.length === 0) return '';

    const isCollapsed = !!(rowObj._fnCollapsed && rowObj._fnCollapsed[col]);
    const itemsHtml = cellFn.map(fn => {
        const safeId = escapeFootnoteHtml(fn.id);
        const safeTarget = escapeFootnoteHtml(fn.targetText || '');
        const safeNote = escapeFootnoteHtml(fn.note || '');
        const titleAttr = safeTarget
            ? `title="Nhấn để quay lại từ được chú thích: ${safeTarget}"`
            : `title="Nhấn để quay lại vị trí [${fn.num}] trong văn bản"`;
        return `<div class="fn-item" data-fn-id="${safeId}"><button type="button" class="fn-item-badge" data-fn-id="${safeId}" ${titleAttr}>[${fn.num}]</button><span class="fn-item-sep">|</span><textarea class="fn-note-input" rows="1" data-fn-id="${safeId}" placeholder="Nhập nội dung chú giải tại đây...">${safeNote}</textarea><button type="button" class="btn-fn-delete" data-fn-id="${safeId}" title="Xóa chú thích [${fn.num}]">✕</button></div>`;
    }).join('');

    return `<div class="cell-footnotes-area ${isCollapsed ? 'fn-collapsed' : ''}" data-fn-col="${col}" contenteditable="false"><div class="fn-area-header" title="Thu gọn / Mở rộng khu vực chú thích"><span class="fn-area-title"><i class="fn-collapse-icon">${isCollapsed ? '▶' : '▼'}</i> CHÚ THÍCH (${cellFn.length})</span></div><div class="fn-area-list">${itemsHtml}</div></div>`;
}

function renderCellFootnotes(targetTd, rowIndex, colName) {
    if (!targetTd || !data[rowIndex]) return;
    const oldArea = targetTd.querySelector('.cell-footnotes-area');
    if (oldArea) oldArea.remove();

    const html = buildCellFootnotesHTML(data[rowIndex], colName);
    if (html) {
        targetTd.insertAdjacentHTML('beforeend', html);
        targetTd.querySelectorAll('.fn-note-input').forEach(autoResizeFootnoteInput);
    }
}

// Đồng bộ hai chiều khi xóa / cắt / dán trực tiếp ký hiệu [n] trong văn bản chính
function reconcileCellFootnotes(targetTd, rowIndex, colName, contentEl) {
    if (!data[rowIndex] || !contentEl) return;
    ensureRowFootnoteStructure(data[rowIndex]);

    const markers = Array.from(contentEl.querySelectorAll('sup.fn-marker'));
    const presentIds = new Set();
    let changed = false;

    markers.forEach(marker => {
        let fnId = marker.dataset.fnId;
        let fnNum = parseInt(marker.dataset.fnNum || (marker.textContent || '').replace(/\D/g, ''), 10);

        if (fnId && presentIds.has(fnId)) {
            const origFn = data[rowIndex].footnotes.find(f => f.id === fnId) || window._footnoteTrashCache.get(fnId);
            fnNum = getNextFootnoteNumber();
            fnId = 'fn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            marker.dataset.fnId = fnId;
            marker.dataset.fnNum = String(fnNum);
            marker.textContent = `[${fnNum}]`;
            data[rowIndex].footnotes.push({
                id: fnId,
                num: fnNum,
                rowId: data[rowIndex].id,
                col: colName,
                targetText: origFn ? origFn.targetText : '',
                note: origFn ? origFn.note : '',
                createdAt: Date.now()
            });
            changed = true;
        }

        if (!fnId) {
            fnId = 'fn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            marker.dataset.fnId = fnId;
        }
        presentIds.add(fnId);

        let existing = data[rowIndex].footnotes.find(f => f.id === fnId);
        if (!existing) {
            let recovered = window._footnoteTrashCache.get(fnId);
            if (!recovered) {
                for (let r = 0; r < data.length; r++) {
                    if (r === rowIndex || !Array.isArray(data[r].footnotes)) continue;
                    const idx = data[r].footnotes.findIndex(f => f.id === fnId);
                    if (idx >= 0) {
                        recovered = data[r].footnotes.splice(idx, 1)[0];
                        const oldRowTr = document.querySelector(`#table-body tr[data-index="${r}"]`);
                        const oldTd = oldRowTr ? oldRowTr.querySelector(`td[data-col="${recovered.col || colName}"]`) : null;
                        if (oldTd) renderCellFootnotes(oldTd, r, recovered.col || colName);
                        break;
                    }
                }
            }

            if (recovered) {
                recovered.rowId = data[rowIndex].id;
                recovered.col = colName;
                data[rowIndex].footnotes.push(recovered);
                window._footnoteTrashCache.delete(fnId);
            } else {
                const safeNum = !isNaN(fnNum) && fnNum > 0 ? fnNum : getNextFootnoteNumber();
                marker.dataset.fnNum = String(safeNum);
                marker.textContent = `[${safeNum}]`;
                data[rowIndex].footnotes.push({
                    id: fnId,
                    num: safeNum,
                    rowId: data[rowIndex].id,
                    col: colName,
                    targetText: '',
                    note: '',
                    createdAt: Date.now()
                });
            }
            changed = true;
        } else if (existing.col !== colName) {
            existing.col = colName;
            existing.rowId = data[rowIndex].id;
            changed = true;
        }
    });

    const kept = [];
    data[rowIndex].footnotes.forEach(fn => {
        if ((fn.col || 'translation') === colName && !presentIds.has(fn.id)) {
            window._footnoteTrashCache.set(fn.id, { ...fn });
            changed = true;
        } else {
            kept.push(fn);
        }
    });
    if (kept.length !== data[rowIndex].footnotes.length) {
        data[rowIndex].footnotes = kept;
    }

    if (changed) {
        data[rowIndex][colName] = contentEl.innerHTML;
        renderCellFootnotes(targetTd, rowIndex, colName);
    }
}

function addFootnoteAtCursor() {
    let targetInfo = null;
    const sel = window.getSelection();

    if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const node = range.commonAncestorContainer;
        const el = node.nodeType === 3 ? node.parentElement : node;
        const contentEl = el ? el.closest('#table-body .cell-content') : null;
        if (contentEl) {
            const targetTd = contentEl.closest('td[data-col]');
            const tr = targetTd ? targetTd.closest('tr') : null;
            if (targetTd && tr) {
                targetInfo = {
                    contentEl,
                    targetTd,
                    rowIndex: parseInt(tr.dataset.index, 10),
                    colName: targetTd.dataset.col,
                    range: range.cloneRange()
                };
            }
        }
    }

    if (!targetInfo && lastFootnoteSelection && document.contains(lastFootnoteSelection.contentEl)) {
        targetInfo = lastFootnoteSelection;
    }

    if (!targetInfo || isNaN(targetInfo.rowIndex) || !data[targetInfo.rowIndex]) {
        if (typeof showToast === 'function') {
            showToast('⚠️ Hãy đặt con trỏ hoặc chọn từ trong ô văn bản cần chú thích!', 'var(--btn-warning)');
        }
        return;
    }

    const { contentEl, targetTd, rowIndex, colName } = targetInfo;
    let range = targetInfo.range;

    const startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    const existingSup = startEl ? startEl.closest('sup.fn-marker') : null;
    if (existingSup) {
        range.setStartAfter(existingSup);
        range.collapse(true);
    }

    let targetText = '';
    if (!range.collapsed) {
        targetText = range.toString().trim();
        range.collapse(false);
    } else if (range.startContainer.nodeType === 3) {
        const beforeText = range.startContainer.textContent.slice(0, range.startOffset).trim();
        const wordMatch = beforeText.match(/([^\s]+)$/);
        if (wordMatch) targetText = wordMatch[1];
    }

    saveEditorUndoState();
    ensureRowFootnoteStructure(data[rowIndex]);

    const nextNum = getNextFootnoteNumber();
    const fnId = 'fn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

    const sup = document.createElement('sup');
    sup.className = 'fn-marker';
    sup.dataset.fnId = fnId;
    sup.dataset.fnNum = String(nextNum);
    sup.setAttribute('contenteditable', 'false');
    sup.title = `Nhấn để đi tới chú thích [${nextNum}]`;
    sup.textContent = `[${nextNum}]`;

    range.insertNode(sup);
    range.setStartAfter(sup);
    range.collapse(true);

    if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
    }

    data[rowIndex][colName] = contentEl.innerHTML;
    if (!data[rowIndex]._fnCollapsed) data[rowIndex]._fnCollapsed = {};
    data[rowIndex]._fnCollapsed[colName] = false;

    data[rowIndex].footnotes.push({
        id: fnId,
        num: nextNum,
        rowId: data[rowIndex].id,
        col: colName,
        targetText: targetText,
        note: '',
        createdAt: Date.now()
    });

    renderCellFootnotes(targetTd, rowIndex, colName);
    debounceSave();

    const newInput = targetTd.querySelector(`.fn-note-input[data-fn-id="${fnId}"]`);
    const newItem = targetTd.querySelector(`.fn-item[data-fn-id="${fnId}"]`);
    if (newItem) {
        newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        newItem.classList.add('fn-flash');
        setTimeout(() => newItem.classList.remove('fn-flash'), 1200);
    }
    if (newInput) {
        newInput.focus();
    }
}

function jumpToFootnoteItem(targetTd, rowIndex, colName, fnId) {
    if (!targetTd || !data[rowIndex]) return;
    if (data[rowIndex]._fnCollapsed && data[rowIndex]._fnCollapsed[colName]) {
        data[rowIndex]._fnCollapsed[colName] = false;
        const area = targetTd.querySelector('.cell-footnotes-area');
        if (area) {
            area.classList.remove('fn-collapsed');
            const icon = area.querySelector('.fn-collapse-icon');
            if (icon) icon.textContent = '▼';
        }
    }

    const item = targetTd.querySelector(`.fn-item[data-fn-id="${fnId}"]`);
    const input = targetTd.querySelector(`.fn-note-input[data-fn-id="${fnId}"]`);
    if (item) {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        item.classList.add('fn-flash');
        setTimeout(() => item.classList.remove('fn-flash'), 1200);
    }
    if (input) {
        input.focus();
    }
}

function jumpToFootnoteMarker(targetTd, colName, fnId) {
    if (!targetTd) return;
    if (targetTd.classList.contains('col-collapsed')) {
        toggleColumnCollapse(colName);
        return;
    }

    const contentEl = targetTd.querySelector('.cell-content');
    if (!contentEl) return;
    const marker = contentEl.querySelector(`sup.fn-marker[data-fn-id="${fnId}"]`);
    if (!marker) {
        if (typeof showToast === 'function') {
            showToast('⚠️ Không tìm thấy ký hiệu chú thích tương ứng trong văn bản!', 'var(--btn-warning)');
        }
        return;
    }

    marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    marker.classList.add('fn-marker-flash');
    setTimeout(() => marker.classList.remove('fn-marker-flash'), 1300);

    contentEl.focus();
    const range = document.createRange();
    range.setStartBefore(marker);
    range.collapse(true);
    const sel = window.getSelection();
    if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
    }
    captureFootnoteSelection();
}

function deleteFootnoteById(targetTd, rowIndex, colName, fnId) {
    if (!targetTd || !data[rowIndex]) return;
    ensureRowFootnoteStructure(data[rowIndex]);

    const fn = data[rowIndex].footnotes.find(f => f.id === fnId);
    const numLabel = fn ? `[${fn.num}]` : '';

    if (!confirm(`🗑️ Xóa chú thích ${numLabel} và ký hiệu tương ứng trong văn bản?`)) return;

    saveEditorUndoState();

    const contentEl = targetTd.querySelector('.cell-content');
    if (contentEl) {
        contentEl.querySelectorAll(`sup.fn-marker[data-fn-id="${fnId}"]`).forEach(sup => sup.remove());
        data[rowIndex][colName] = contentEl.innerHTML;
    }

    if (fn) window._footnoteTrashCache.set(fnId, { ...fn });
    data[rowIndex].footnotes = data[rowIndex].footnotes.filter(f => f.id !== fnId);

    renderCellFootnotes(targetTd, rowIndex, colName);
    debounceSave();
    if (typeof showToast === 'function') {
        showToast(`🗑️ Đã xóa chú thích ${numLabel}!`, 'var(--btn-info)');
    }
}

// =========================================================================
// HỆ THỐNG RENDER ĐỘNG (THỨ TỰ CỘT THỐNG NHẤT 100% TRÊN MỌI THIẾT BỊ)
// =========================================================================
let currentIsMobile = window.innerWidth <= 768;

window.addEventListener('resize', () => {
    const newIsMobile = window.innerWidth <= 768;
    if (newIsMobile !== currentIsMobile) {
        currentIsMobile = newIsMobile;
        renderTable(); 
    }
});

function generateRowHTML(rowObj, rowIndex, isMobile) {
    ensureRowFootnoteStructure(rowObj);
    let html = '';
    
    html += `<td class="batch-select-cell batch-toggle-el" style="display: ${isBatchDeleteMode ? 'table-cell' : 'none'};" contenteditable="false">
                <input type="checkbox" class="batch-row-checkbox" data-row="${rowIndex}" ${selectedBatchRows.has(rowIndex) ? 'checked' : ''}>
             </td>`;
             
    if (isMobile) {
        html += `<td class="mobile-row-meta" contenteditable="false">
                    <div class="mobile-row-bar">
                        <span class="mobile-row-number">📖 Dòng ${rowIndex + 1}</span>
                        <div class="mobile-row-actions">
                            <button type="button" class="btn-m-row-add" title="Thêm dòng mới bên dưới">➕ Dòng</button>
                            <button type="button" class="btn-m-row-del" title="Xóa dòng này">🗑️ Xóa</button>
                        </div>
                    </div>
                 </td>`;
    }

    columns.forEach(col => {
        const isColCollapsed = !!mobileColCollapsed[col];
        const collapsedClass = (isMobile && isColCollapsed) ? 'col-collapsed' : '';
        const meta = COLUMN_META[col] || { label: col.toUpperCase(), badgeClass: 'badge-default' };
        const contentHtml = normalizeUnicodeText(rowObj[col] || '');
        const footnotesHtml = buildCellFootnotesHTML(rowObj, col);
        
        html += `<td data-col="${col}" class="${collapsedClass}">`;
        
        if (isMobile) {
            html += `
                <div class="cell-header" contenteditable="false" style="user-select: none; -webkit-user-select: none;">
                    <span class="cell-label ${meta.badgeClass}">${meta.label}</span>
                    <div class="cell-header-actions">
                        <button type="button" class="btn-cell-copy" title="Sao chép khối này">📋</button>
                        <button type="button" class="btn-cell-collapse" title="Thu gọn / Mở rộng">${isColCollapsed ? '▶' : '▼'}</button>
                    </div>
                </div>`;
        }
        
        html += `<div class="cell-content" contenteditable="true" spellcheck="false" translate="no" data-gramm="false">${contentHtml}</div>${footnotesHtml}</td>`;
    });
    
    return html;
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    if (!data || !Array.isArray(data) || data.length === 0) data = [createEmptyRow()];

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    data.forEach((row, rowIndex) => {
        ensureRowFootnoteStructure(row);
        if (!row._sanitized) {
            columns.forEach(col => {
                if (typeof row[col] === 'string') {
                    row[col] = row[col].replace(/^(?:<br\s*\/?>|\s|&nbsp;|<div><br><\/div>|<p><br><\/p>)+/i, '')
                                       .replace(/(?:<br\s*\/?>|\s|&nbsp;|<div><br><\/div>|<p><br><\/p>)+$/i, '');
                }
            });
            row._sanitized = true;
        }

        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        if (selectedBatchRows.has(rowIndex)) tr.classList.add('batch-row-selected');
        if (currentRowIndex === rowIndex) tr.classList.add('active-row');
        
        tr.innerHTML = generateRowHTML(row, rowIndex, currentIsMobile);
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
    tbody.querySelectorAll('.fn-note-input').forEach(autoResizeFootnoteInput);
    
    const titleInput = document.getElementById('chapter-title-input');
    if (titleInput && typeof chapterTitle !== 'undefined' && titleInput.value !== chapterTitle) {
        titleInput.value = chapterTitle || '';
    }

    if (isBatchDeleteMode) updateBatchHighlightsAndSummary();

    if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
        data.forEach((row, idx) => {
            if (row.raw) rowTokensMap[idx] = nameQTEngine.process(normalizeUnicodeText(row.raw.replace(/<[^>]+>/g, ''))).tokens;
        });
    }

    updateWordCounts();
}

function appendRowToDOM(rowObj, index) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.dataset.index = index;
    tr.innerHTML = generateRowHTML(rowObj, index, currentIsMobile);
    tbody.appendChild(tr);
    tr.querySelectorAll('.fn-note-input').forEach(autoResizeFootnoteInput);
}

// =========================================================================
// QUẢN LÝ GIAO DIỆN & BỘ NHỚ UNDO/REDO
// =========================================================================
function setMobileViewMode(mode) {
    if (mode === 'edit-only') {
        mobileColCollapsed = { raw: true, pinyin: true, qt: true, translation: false, edit: true, meaning: true };
        if (typeof showToast === 'function') showToast('👁️ Chế độ: Chỉ xem Bản edit', 'var(--btn-info)');
    } else if (mode === 'expand-all') {
        mobileColCollapsed = { raw: false, pinyin: false, qt: false, translation: false, edit: false, meaning: false };
        if (typeof showToast === 'function') showToast('🔽 Đã mở rộng toàn bộ các khối', 'var(--btn-success)');
    } else if (mode === 'collapse-all') {
        mobileColCollapsed = { raw: true, pinyin: true, qt: true, translation: true, edit: true, meaning: true };
        if (typeof showToast === 'function') showToast('🔼 Đã thu gọn toàn bộ các khối', 'var(--btn-secondary)');
    }
    localStorage.setItem('mobile_col_collapsed', JSON.stringify(mobileColCollapsed));
    renderTable();
}

function toggleColumnCollapse(colKey) {
    mobileColCollapsed[colKey] = !mobileColCollapsed[colKey];
    localStorage.setItem('mobile_col_collapsed', JSON.stringify(mobileColCollapsed));
    renderTable();
}

function saveEditorUndoState() {
    syncActiveCellToData();
    const currentStateStr = JSON.stringify(data);
    if (editorUndoStack.length > 0 && editorUndoStack[editorUndoStack.length - 1] === currentStateStr) return;
    editorUndoStack.push(currentStateStr);
    if (editorUndoStack.length > 30) editorUndoStack.shift(); 
    editorRedoStack = []; 
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();
}

function handleEditorTypingInput() {
    if (!editorIsTyping) {
        saveEditorUndoState();
        editorIsTyping = true;
    }
    clearTimeout(editorTypingUndoTimeout);
    editorTypingUndoTimeout = setTimeout(() => {
        saveEditorUndoState();
        editorIsTyping = false;
    }, 1000);
}

function editorUndo() {
    if (editorUndoStack.length === 0) return;
    syncActiveCellToData();
    if (editorIsTyping) {
        clearTimeout(editorTypingUndoTimeout);
        saveEditorUndoState();
        editorIsTyping = false;
    }
    const currentStateStr = JSON.stringify(data);
    let prevStateStr = editorUndoStack.pop();
    if (prevStateStr === currentStateStr && editorUndoStack.length > 0) {
        editorRedoStack.push(prevStateStr);
        prevStateStr = editorUndoStack.pop();
    }
    editorRedoStack.push(currentStateStr);
    data = JSON.parse(prevStateStr);
    
    selectedBatchRows.clear();
    selectedBatchCols.clear();
    renderTable();
    debounceSave();
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();
    showToast('↩️ Đã hoàn tác dịch thuật (Undo)', 'var(--btn-info)');
}

function editorRedo() {
    if (editorRedoStack.length === 0) return;
    syncActiveCellToData();
    editorUndoStack.push(JSON.stringify(data));
    data = JSON.parse(editorRedoStack.pop());
    
    selectedBatchRows.clear();
    selectedBatchCols.clear();
    renderTable();
    debounceSave();
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();
    showToast('🔁 Đã làm lại dịch thuật (Redo)', 'var(--btn-info)');
}

function addEditorHistoryEntry() {
    try {
        if (typeof pushToCloudHistory === 'function') {
            pushToCloudHistory('editor', data); return;
        }
        let history = JSON.parse(localStorage.getItem('translationHistory')) || [];
        const currentDataCopy = JSON.parse(JSON.stringify(data));
        if (history.length > 0 && JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentDataCopy)) return;
        
        history.push({ timestamp: Date.now(), rowCount: data.length, data: currentDataCopy });
        if (history.length > 30) history.shift();
        localStorage.setItem('translationHistory', JSON.stringify(history)); 
    } catch (e) { }
}

// =========================================================================
// QUẢN LÝ CHẾ ĐỘ CHỌN VÀ XÓA HÀNG LOẠT
// =========================================================================
function toggleBatchDeleteMode(forceState = null) {
    isBatchDeleteMode = (forceState !== null) ? forceState : !isBatchDeleteMode;
    const toggleBtn = document.getElementById('btn-toggle-batch');
    const actionBar = document.getElementById('batch-action-bar');
    
    if (toggleBtn) {
        if (isBatchDeleteMode) toggleBtn.classList.add('active');
        else toggleBtn.classList.remove('active');
    }
    if (actionBar) actionBar.style.display = isBatchDeleteMode ? 'flex' : 'none';

    document.querySelectorAll('.batch-toggle-el').forEach(el => {
        el.style.display = isBatchDeleteMode ? (el.tagName === 'TH' || el.tagName === 'TD' ? 'table-cell' : 'flex') : 'none';
    });

    if (!isBatchDeleteMode) deselectAllBatch();
    else updateBatchHighlightsAndSummary();
}

function deselectAllBatch() {
    selectedBatchRows.clear();
    selectedBatchCols.clear();
    const masterCb = document.getElementById('batch-check-all-rows');
    if (masterCb) masterCb.checked = false;
    document.querySelectorAll('.batch-col-checkbox, .batch-row-checkbox').forEach(cb => cb.checked = false);
    updateBatchHighlightsAndSummary();
}

function updateBatchHighlightsAndSummary() {
    const rowCount = selectedBatchRows.size;
    const colCount = selectedBatchCols.size;
    const totalDataRows = data.length;
    const summaryEl = document.getElementById('batch-count-summary');
    const deleteBtn = document.getElementById('btn-batch-confirm-delete');

    let summaryText = 'Đã chọn: 0 hàng, 0 cột (0 ô)';
    let canDelete = false;

    if (rowCount > 0 && colCount > 0) {
        summaryText = `Đã chọn: ${rowCount} hàng, ${colCount} cột (${rowCount * colCount} ô giao nhau)`;
        canDelete = true;
    } else if (rowCount > 0 && colCount === 0) {
        summaryText = `Đã chọn: ${rowCount} hàng (toàn bộ cột)`;
        canDelete = true;
    } else if (rowCount === 0 && colCount > 0) {
        summaryText = `Đã chọn: ${colCount} cột (toàn bộ hàng)`;
        canDelete = true;
    }

    if (summaryEl) summaryEl.innerText = summaryText;
    if (deleteBtn) deleteBtn.disabled = !canDelete;

    const masterCb = document.getElementById('batch-check-all-rows');
    if (masterCb) {
        masterCb.checked = (rowCount === totalDataRows && totalDataRows > 0);
        masterCb.indeterminate = (rowCount > 0 && rowCount < totalDataRows);
    }

    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    Array.from(tbody.children).forEach((tr, rIdx) => {
        const isRowSelected = selectedBatchRows.has(rIdx);
        if (isRowSelected) tr.classList.add('batch-row-selected');
        else tr.classList.remove('batch-row-selected');

        Array.from(tr.querySelectorAll('td[data-col]')).forEach(td => {
            const isColSelected = selectedBatchCols.has(td.dataset.col);
            td.classList.remove('batch-col-selected', 'batch-intersection-selected');
            if (isRowSelected && isColSelected) td.classList.add('batch-intersection-selected');
            else if (isColSelected) td.classList.add('batch-col-selected');
        });
    });
}

function executeBatchDelete() {
    const rowCount = selectedBatchRows.size;
    const colCount = selectedBatchCols.size;
    if (rowCount === 0 && colCount === 0) return;
    if (!confirm("Bạn có chắc chắn muốn xóa phần dữ liệu đã chọn?")) return;

    saveEditorUndoState();
    if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

    if (rowCount > 0 && colCount > 0) {
        selectedBatchRows.forEach(rIdx => {
            if (data[rIdx]) {
                selectedBatchCols.forEach(c => {
                    data[rIdx][c] = '';
                    if (Array.isArray(data[rIdx].footnotes)) {
                        data[rIdx].footnotes = data[rIdx].footnotes.filter(fn => (fn.col || 'translation') !== c);
                    }
                });
            }
            if (selectedBatchCols.has('raw')) rowTokensMap[rIdx] = [];
        });
        showToast(`🗑️ Đã xóa nội dung ${rowCount * colCount} ô!`, 'var(--btn-success)');
    } else if (rowCount > 0 && colCount === 0) {
        const sortedRowIndices = Array.from(selectedBatchRows).sort((a, b) => b - a);
        sortedRowIndices.forEach(rIdx => data.splice(rIdx, 1));
        if (data.length === 0) data = [createEmptyRow()];
        showToast(`🗑️ Đã xóa ${rowCount} hàng!`, 'var(--btn-success)');
    } else if (rowCount === 0 && colCount > 0) {
        data.forEach((row, rIdx) => {
            selectedBatchCols.forEach(c => {
                row[c] = '';
                if (Array.isArray(row.footnotes)) {
                    row.footnotes = row.footnotes.filter(fn => (fn.col || 'translation') !== c);
                }
            });
            if (selectedBatchCols.has('raw')) rowTokensMap[rIdx] = [];
        });
        showToast(`🗑️ Đã xóa sạch ${colCount} cột!`, 'var(--btn-success)');
    }

    deselectAllBatch();
    renderTable();
    debounceSave();
}

// =========================================================================
// HÀM PARSE BẢNG ĐA NĂNG THÔNG MINH
// =========================================================================
function parseClipboardToSmartMatrix(clipboard) {
    const htmlData = clipboard.getData('text/html') || '';
    const textData = clipboard.getData('text/plain') || '';

    if (htmlData && /<\s*(table|tr|td|th)\b/i.test(htmlData)) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlData, 'text/html');
            const trElements = doc.querySelectorAll('tr');

            if (trElements.length > 0) {
                const matrix = [];
                trElements.forEach(tr => {
                    const cells = tr.querySelectorAll('td, th');
                    if (cells.length === 0) return;

                    const rowValues = [];
                    cells.forEach(cell => {
                        const clone = cell.cloneNode(true);
                        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                        clone.querySelectorAll('p, div').forEach(block => block.prepend('\n'));
                        let text = clone.textContent || clone.innerText || '';
                        rowValues.push(text.replace(/&nbsp;/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim());
                    });

                    const firstCell = (rowValues[0] || '').toLowerCase().trim();
                    const isHeader = firstCell.includes('raw') || firstCell.includes('pinyin') || firstCell === 'tiếng trung';
                    if (!isHeader && rowValues.some(v => v !== '')) matrix.push(rowValues);
                });
                if (matrix.length > 0 && matrix.some(r => r.length >= 2)) return matrix;
            }
        } catch (err) {}
    }

    if (textData && textData.includes('\t')) {
        const clean = textData.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').normalize('NFC');
        const lines = clean.split(/\r\n|\r|\n/);
        let maxTabs = 0;
        lines.forEach(l => { const count = (l.match(/\t/g) || []).length; if (count > maxTabs) maxTabs = count; });

        if (maxTabs > 0) {
            const matrix = [];
            let currentRow = null;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const tabCount = (line.match(/\t/g) || []).length;
                if (tabCount > 0 || currentRow === null) {
                    const tokens = line.split('\t').map(c => c.trim());
                    if (!currentRow || currentRow.length >= maxTabs + 1) {
                        if (currentRow && currentRow.some(c => c !== '')) matrix.push(currentRow);
                        currentRow = tokens;
                    } else {
                        const lastIdx = currentRow.length - 1;
                        currentRow[lastIdx] = (currentRow[lastIdx] ? currentRow[lastIdx] + '\n' : '') + tokens[0];
                        for (let k = 1; k < tokens.length; k++) currentRow.push(tokens[k]);
                    }
                } else {
                    if (currentRow && currentRow.length > 0) {
                        const lastIdx = currentRow.length - 1;
                        currentRow[lastIdx] = (currentRow[lastIdx] ? currentRow[lastIdx] + '\n' : '') + line.trim();
                    }
                }
            }
            if (currentRow && currentRow.some(c => c !== '')) matrix.push(currentRow);
            if (matrix.length > 0) {
                const f = (matrix[0][0] || '').toLowerCase().trim();
                if (f.includes('raw') || f.includes('pinyin')) matrix.shift();
            }
            if (matrix.length > 0) return matrix;
        }
    }
    return [];
}

// =========================================================================
// THIẾT LẬP TOÀN BỘ SỰ KIỆN BIÊN DỊCH VÀ ỦY QUYỀN
// =========================================================================
function initEditorEvents() {
    if (window._editorEventsBound) return;
    window._editorEventsBound = true;

    const chapterInput = document.getElementById('chapter-title-input');
    if (chapterInput) {
        if (typeof chapterTitle !== 'undefined') chapterInput.value = chapterTitle;
        chapterInput.addEventListener('input', (e) => {
            chapterTitle = e.target.value;
            localStorage.setItem('chapterTitle', chapterTitle);
            debounceSave();
        });
    }

    document.addEventListener('selectionchange', captureFootnoteSelection);

    const btnAddFootnote = document.getElementById('btn-add-footnote');
    if (btnAddFootnote) {
        btnAddFootnote.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        btnAddFootnote.addEventListener('click', (e) => {
            e.preventDefault();
            addFootnoteAtCursor();
        });
    }

    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    tbody.addEventListener('mouseup', captureFootnoteSelection);
    tbody.addEventListener('keyup', captureFootnoteSelection);

    // 1. SỰ KIỆN CHỌN CHECKBOX
    document.getElementById('btn-toggle-batch')?.addEventListener('click', () => toggleBatchDeleteMode());
    document.getElementById('btn-batch-deselect')?.addEventListener('click', () => deselectAllBatch());
    document.getElementById('btn-batch-cancel')?.addEventListener('click', () => toggleBatchDeleteMode(false));
    document.getElementById('btn-batch-confirm-delete')?.addEventListener('click', () => executeBatchDelete());

    document.getElementById('batch-check-all-rows')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        if (isChecked) { for (let i = 0; i < data.length; i++) selectedBatchRows.add(i); } 
        else { selectedBatchRows.clear(); }
        document.querySelectorAll('.batch-row-checkbox').forEach(cb => cb.checked = isChecked);
        updateBatchHighlightsAndSummary();
    });

    // 2. SỰ KIỆN DÁN THÔNG MINH
    tbody.addEventListener('paste', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('fn-note-input')) return;

        const targetCell = e.target.closest('td[data-col]');
        if (!targetCell) return;
        const clipboard = (e.originalEvent || e).clipboardData;
        if (!clipboard) return;

        const textData = clipboard.getData('text/plain') || '';
        const htmlData = clipboard.getData('text/html') || '';
        const tableMatrix = parseClipboardToSmartMatrix(clipboard);
        const tr = targetCell.closest('tr');
        let startRowIndex = parseInt(tr.dataset.index, 10);
        const colIndex = columns.indexOf(targetCell.dataset.col);

        if (htmlData && /fn-marker/i.test(htmlData)) {
            setTimeout(() => {
                const contentEl = targetCell.querySelector('.cell-content');
                if (contentEl) {
                    data[startRowIndex][targetCell.dataset.col] = contentEl.innerHTML;
                    reconcileCellFootnotes(targetCell, startRowIndex, targetCell.dataset.col, contentEl);
                    debounceSave();
                }
            }, 0);
            return;
        }

        // A. Dán văn bản chia đoạn
        if (tableMatrix.length === 0 && /[\r\n]/.test(textData)) {
            e.preventDefault();
            if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
            saveEditorUndoState();
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

            const paragraphs = textData.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').normalize('NFC').split(/\r\n|\r|\n/).map(p => p.trim()).filter(p => p !== '');
            if (paragraphs.length === 0) return;

            for (let i = 0; i < paragraphs.length; i++) {
                const rIdx = startRowIndex + i;
                while (rIdx >= data.length) data.push(createEmptyRow());
                data[rIdx][columns[colIndex]] = normalizeUnicodeText(paragraphs[i]);

                if (columns[colIndex] === 'raw') {
                    if (typeof safePinyin === 'function') data[rIdx]['pinyin'] = safePinyin(paragraphs[i]);
                    if (!manualQTState[rIdx] && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                        const res = nameQTEngine.process(paragraphs[i]);
                        data[rIdx]['qt'] = res.text.normalize('NFC');
                        rowTokensMap[rIdx] = res.tokens;
                    }
                }
            }
            renderTable(); debounceSave(); showToast(`📋 Đã chia và dán ${paragraphs.length} đoạn!`, 'var(--btn-success)');
            return;
        }

        // B. Dán Ma trận Bảng
        if (tableMatrix.length > 0) {
            e.preventDefault();
            if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
            saveEditorUndoState();
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

            for (let i = 0; i < tableMatrix.length; i++) {
                const cells = tableMatrix[i];
                const rIdx = startRowIndex + i;
                while (rIdx >= data.length) data.push(createEmptyRow());

                let rawUpdated = false, pinyinUpdated = false;
                for (let j = 0; j < cells.length; j++) {
                    const cIdx = colIndex + j;
                    if (cIdx >= columns.length) break;
                    let rawVal = cells[j];
                    const colName = columns[cIdx];
                    
                    data[rIdx][colName] = normalizeUnicodeText(rawVal).replace(/\n/g, '<br>');
                    if (colName === 'raw') rawUpdated = true;
                    if (colName === 'pinyin' && rawVal.trim() !== '') pinyinUpdated = true;
                }

                if (rawUpdated) {
                    const rawClean = (data[rIdx]['raw'] || '').replace(/<[^>]+>/g, '').trim().normalize('NFC');
                    if (!pinyinUpdated && typeof safePinyin === 'function') data[rIdx]['pinyin'] = safePinyin(rawClean);
                    if (!manualQTState[rIdx] && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                        const result = nameQTEngine.process(rawClean);
                        data[rIdx]['qt'] = result.text.normalize('NFC');
                        rowTokensMap[rIdx] = result.tokens;
                    }
                }
            }
            renderTable(); debounceSave(); showToast(`📋 Đã dán ${tableMatrix.length} hàng khớp bảng!`, 'var(--btn-success)');
            return;
        }

        // C. Dán câu / đoạn đơn lẻ
        if (!textData.includes('\n') && !textData.includes('\t')) {
            e.preventDefault();
            const contentEl = e.target.closest('.cell-content') || targetCell.querySelector('.cell-content') || targetCell;
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(textData.trim());
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            contentEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // 3. NHẬP LIỆU GÕ TAY REAL-TIME
    tbody.addEventListener('input', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('fn-note-input')) {
            const noteEl = e.target;
            const targetTd = noteEl.closest('td[data-col]');
            const tr = targetTd ? targetTd.closest('tr') : null;
            if (!targetTd || !tr) return;

            const rowIndex = parseInt(tr.dataset.index, 10);
            const fnId = noteEl.dataset.fnId;
            if (!isNaN(rowIndex) && data[rowIndex] && Array.isArray(data[rowIndex].footnotes)) {
                handleEditorTypingInput();
                const fn = data[rowIndex].footnotes.find(f => f.id === fnId);
                if (fn) {
                    fn.note = noteEl.value;
                }
                autoResizeFootnoteInput(noteEl);
                debounceSave();
            }
            return;
        }

        const targetTd = e.target.closest('td[data-col]');
        if (!targetTd) return;
        const contentEl = e.target.closest('.cell-content') || targetTd.querySelector('.cell-content');
        if (!contentEl) return;

        const tr = targetTd.closest('tr');
        const rowIndex = parseInt(tr.dataset.index, 10);
        const colName = targetTd.dataset.col;

        handleEditorTypingInput();

        let rawHtml = contentEl.innerHTML;
        let plainText = normalizeUnicodeText(contentEl.innerText);
        if ((rawHtml === '<br>' || plainText.trim() === '') && !contentEl.querySelector('sup.fn-marker')) {
            contentEl.innerHTML = ''; 
            rawHtml = ''; 
            plainText = '';
        }
        
        data[rowIndex][colName] = rawHtml;
        reconcileCellFootnotes(targetTd, rowIndex, colName, contentEl);

        if (colName === 'raw') {
            if (typeof safePinyin === 'function') {
                const pinyinVal = safePinyin(plainText);
                data[rowIndex]['pinyin'] = pinyinVal;
                const pinyinTd = tr.querySelector('td[data-col="pinyin"] .cell-content') || tr.querySelector('td[data-col="pinyin"]');
                if (pinyinTd) pinyinTd.innerText = pinyinVal;
            }

            if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                const res = nameQTEngine.process(plainText);
                const qtVal = res.text.normalize('NFC');
                data[rowIndex]['qt'] = qtVal;
                const qtTd = tr.querySelector('td[data-col="qt"] .cell-content') || tr.querySelector('td[data-col="qt"]');
                if (qtTd) qtTd.innerText = qtVal;
                rowTokensMap[rowIndex] = res.tokens;
            }
        }
        
        if (colName === 'qt') manualQTState[rowIndex] = true;
        
        debounceSave();
    });

    // 4. BẮT SỰ KIỆN CLICK (LIÊN KẾT HAI CHIỀU CHÚ THÍCH, COPY KÈM CHÚ THÍCH & MOBILE)
    tbody.addEventListener('click', (e) => {
        const fnMarker = e.target.closest('sup.fn-marker');
        if (fnMarker) {
            e.preventDefault();
            e.stopPropagation();
            const td = fnMarker.closest('td[data-col]');
            const tr = td ? td.closest('tr') : null;
            if (td && tr) {
                jumpToFootnoteItem(td, parseInt(tr.dataset.index, 10), td.dataset.col, fnMarker.dataset.fnId);
            }
            return;
        }

        const fnBadge = e.target.closest('.fn-item-badge');
        if (fnBadge) {
            e.preventDefault();
            e.stopPropagation();
            const td = fnBadge.closest('td[data-col]');
            if (td) {
                jumpToFootnoteMarker(td, td.dataset.col, fnBadge.dataset.fnId);
            }
            return;
        }

        const fnHeader = e.target.closest('.fn-area-header');
        if (fnHeader) {
            e.preventDefault();
            e.stopPropagation();
            const area = fnHeader.closest('.cell-footnotes-area');
            const td = fnHeader.closest('td[data-col]');
            const tr = td ? td.closest('tr') : null;
            if (area && td && tr) {
                const rIdx = parseInt(tr.dataset.index, 10);
                const colName = td.dataset.col;
                const willCollapse = !area.classList.contains('fn-collapsed');
                area.classList.toggle('fn-collapsed', willCollapse);
                const icon = area.querySelector('.fn-collapse-icon');
                if (icon) icon.textContent = willCollapse ? '▶' : '▼';
                if (data[rIdx]) {
                    if (!data[rIdx]._fnCollapsed) data[rIdx]._fnCollapsed = {};
                    data[rIdx]._fnCollapsed[colName] = willCollapse;
                }
            }
            return;
        }

        const fnDelBtn = e.target.closest('.btn-fn-delete');
        if (fnDelBtn) {
            e.preventDefault();
            e.stopPropagation();
            const td = fnDelBtn.closest('td[data-col]');
            const tr = td ? td.closest('tr') : null;
            if (td && tr) {
                deleteFootnoteById(td, parseInt(tr.dataset.index, 10), td.dataset.col, fnDelBtn.dataset.fnId);
            }
            return;
        }

        const collapseTrigger = e.target.closest('.btn-cell-collapse') || e.target.closest('.cell-label');
        if (collapseTrigger) {
            e.preventDefault(); e.stopPropagation();
            const td = collapseTrigger.closest('td[data-col]');
            if (td) {
                toggleColumnCollapse(td.dataset.col);
            }
            return;
        }

        // Nút Copy từng ô trên Mobile (tổng hợp cả văn bản chính + chú thích từ data)
        const copyBtn = e.target.closest('.btn-cell-copy');
        if (copyBtn) {
            e.preventDefault(); e.stopPropagation();
            syncActiveCellToData();
            const td = copyBtn.closest('td[data-col]');
            const tr = td ? td.closest('tr') : null;
            const rIdx = tr ? parseInt(tr.dataset.index, 10) : -1;
            const colName = td ? td.dataset.col : '';

            if (!isNaN(rIdx) && rIdx >= 0 && colName && data[rIdx]) {
                const extracted = extractCellCopyPayload(data[rIdx], colName);
                if (extracted.plain !== '') {
                    copyAdvancedToClipboardV2([extracted.plain], [extracted.html], `📋 Đã copy nội dung!`);
                } else {
                    if (typeof showToast === 'function') showToast(`⚠️ Ô này đang trống!`, 'var(--btn-warning)');
                }
            }
            return;
        }

        const addRowBtn = e.target.closest('.btn-m-row-add');
        if (addRowBtn) {
            e.preventDefault();
            const tr = addRowBtn.closest('tr');
            insertRowAt(tr ? parseInt(tr.dataset.index, 10) + 1 : data.length);
            return;
        }

        const delRowBtn = e.target.closest('.btn-m-row-del');
        if (delRowBtn) {
            e.preventDefault();
            const tr = delRowBtn.closest('tr');
            if (tr && confirm(`Xóa Dòng này?`)) deleteSingleRow(parseInt(tr.dataset.index, 10));
            return;
        }
        
        if (e.target.classList.contains('batch-row-checkbox')) {
            const rIdx = parseInt(e.target.dataset.row, 10);
            if (e.target.checked) selectedBatchRows.add(rIdx); else selectedBatchRows.delete(rIdx);
            updateBatchHighlightsAndSummary();
        }
    });

    // 5. TRẠNG THÁI FOCUS
    tbody.addEventListener('focusin', (e) => {
        if (editorIsTyping) {
            clearTimeout(editorTypingUndoTimeout);
            saveEditorUndoState();
            editorIsTyping = false;
        }
        const tr = e.target.closest('tr');
        if (tr) {
            tbody.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
            tr.classList.add('active-row');
            currentRowIndex = parseInt(tr.dataset.index, 10);
            selectedRowIndices = [currentRowIndex];
        }
        const contentEl = e.target.closest('.cell-content');
        if (contentEl) {
            captureFootnoteSelection();
            if (window.innerWidth <= 768) {
                setTimeout(() => { contentEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
            }
        }
    });

    // CÁC NÚT THANH CÔNG CỤ TRÊN CÙNG
    document.getElementById('btn-add')?.addEventListener('click', (e) => { 
        e.preventDefault(); 
        insertRowAt(data.length); 
        const c = document.getElementById('table-container'); 
        if(c) c.scrollTop = c.scrollHeight; 
    });
    
    document.getElementById('btn-delete')?.addEventListener('click', (e) => { 
        e.preventDefault(); 
        if (currentRowIndex >= 0) deleteSingleRow(currentRowIndex); 
    });

    document.getElementById('btn-reset')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm("⚠️ Xóa TOÀN BỘ dữ liệu trên bảng? Bản hiện tại sẽ được lưu vào Lịch sử trước khi xóa.")) {
            flushSave();
            if (typeof pushToCloudHistory === 'function') pushToCloudHistory('editor', data);

            saveEditorUndoState();
            data = [createEmptyRow()];
            currentRowIndex = -1; selectedRowIndices = []; manualQTState = {}; rowTokensMap = {};
            selectedBatchRows.clear(); selectedBatchCols.clear();
            
            if (typeof currentProjectId !== 'undefined') {
                currentProjectId = null;
                localStorage.removeItem('currentProjectId');
            }

            renderTable(); 
            flushSave();
            showToast('🔄 Đã làm mới toàn bộ bảng!', 'var(--btn-warning)');
        }
    });

    // MOBILE VIEW CONTROLS
    document.getElementById('btn-m-view-editonly')?.addEventListener('click', () => setMobileViewMode('edit-only'));
    document.getElementById('btn-m-view-expandall')?.addEventListener('click', () => setMobileViewMode('expand-all'));
    document.getElementById('btn-m-view-collapseall')?.addEventListener('click', () => setMobileViewMode('collapse-all'));

    // FORMAT RIBBON
    document.getElementById('btn-undo')?.addEventListener('click', () => { if (activeTab === 'edit-tool') editorUndo(); else if (typeof metaUndo === 'function') metaUndo(); });
    document.getElementById('btn-redo')?.addEventListener('click', () => { if (activeTab === 'edit-tool') editorRedo(); else if (typeof metaRedo === 'function') metaRedo(); });
    document.getElementById('btn-bold')?.addEventListener('click', () => execFormat('bold'));
    document.getElementById('btn-italic')?.addEventListener('click', () => execFormat('italic'));
    document.getElementById('btn-underline')?.addEventListener('click', () => execFormat('underline'));
    document.getElementById('ribbon-forecolor')?.addEventListener('input', (e) => execFormat('foreColor', e.target.value));
    document.getElementById('ribbon-hilitecolor')?.addEventListener('input', (e) => execFormat('hiliteColor', e.target.value));
    document.getElementById('btn-align-left')?.addEventListener('click', () => execFormat('justifyLeft'));
    document.getElementById('btn-align-center')?.addEventListener('click', () => execFormat('justifyCenter'));
    document.getElementById('btn-align-right')?.addEventListener('click', () => execFormat('justifyRight'));
    document.getElementById('btn-clear-format')?.addEventListener('click', () => execFormat('removeFormat'));

    // BÀN PHÍM TẮT
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) { e.preventDefault(); if (activeTab === 'edit-tool') editorUndo(); else if (typeof metaUndo === 'function') metaUndo(); } 
            else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); if (activeTab === 'edit-tool') editorRedo(); else if (typeof metaRedo === 'function') metaRedo(); } 
            else if (key === 'b' && activeTab === 'edit-tool') { e.preventDefault(); execFormat('bold'); } 
            else if (key === 'i' && activeTab === 'edit-tool') { e.preventDefault(); execFormat('italic'); } 
            else if (key === 'u' && activeTab === 'edit-tool') { e.preventDefault(); execFormat('underline'); }
        }
    });

    // EXPORT JSON ĐẦY ĐỦ CẢ METADATA VÀ DATA
    document.getElementById('btn-export')?.addEventListener('click', (e) => {
        e.preventDefault();
        flushSave();

        const exportPayload = {
            app: "công cụ edit",
            version: "3.0",
            exportedAt: new Date().toISOString(),
            id: (typeof currentProjectId !== 'undefined' && currentProjectId) ? currentProjectId : ('proj_' + Date.now()),
            title: (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle : 'Chương 1',
            columns: columns,
            data: data,
            metadata: (typeof metadata !== 'undefined') ? metadata : null
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        let safeTitle = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') : "chuong_truyen";
        dlAnchor.setAttribute("download", `${safeTitle}.json`);
        dlAnchor.click();
        showToast(`💾 Đã xuất file "${safeTitle}.json" đầy đủ!`, 'var(--btn-success)');
    });

    // IMPORT JSON ĐA ĐỊNH DẠNG (BẢO TOÀN DỮ LIỆU CŨ VÀ CHÚ THÍCH)
    const fileInput = document.getElementById('file-input');
    document.getElementById('btn-import')?.addEventListener('click', (e) => { e.preventDefault(); fileInput?.click(); });
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                let rawList = null;
                let loadedTitle = file.name.replace(/\.[^/.]+$/, "");
                let loadedMeta = null;

                if (Array.isArray(parsed)) {
                    rawList = parsed;
                } else if (parsed && Array.isArray(parsed.data)) {
                    rawList = parsed.data;
                    if (parsed.title) loadedTitle = parsed.title;
                    if (parsed.metadata) loadedMeta = parsed.metadata;
                }

                if (!rawList || rawList.length === 0) {
                    alert("⚠️ File JSON không chứa dữ liệu hàng hợp lệ!");
                    return;
                }

                flushSave();
                if (typeof pushToCloudHistory === 'function') pushToCloudHistory('editor', data);

                saveEditorUndoState();
                
                data = rawList.map(row => {
                    if (typeof normalizeRowObject === 'function') {
                        return normalizeRowObject(row);
                    }
                    return {
                        id: row.id || ('row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                        raw: row.raw || '',
                        pinyin: row.pinyin || '',
                        qt: row.qt || '',
                        translation: row.translation || '',
                        edit: row.edit || '',
                        meaning: row.meaning || '',
                        footnotes: Array.isArray(row.footnotes) ? row.footnotes : []
                    };
                });

                chapterTitle = loadedTitle;
                if (typeof currentProjectId !== 'undefined') {
                    currentProjectId = null;
                    localStorage.removeItem('currentProjectId');
                }
                if (loadedMeta && typeof metadata !== 'undefined') {
                    metadata = loadedMeta;
                    if (typeof renderMetadata === 'function') renderMetadata();
                }

                renderTable();
                flushSave();
                showToast(`📂 Nạp file thành công (${data.length} hàng)!`, 'var(--btn-success)');
            } catch (err) { alert("Lỗi đọc file: " + err); }
        };
        reader.readAsText(file);
        fileInput.value = ''; 
    });

    document.getElementById('btn-refresh-qt')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm("🔄 Làm mới lại toàn bộ cột QT theo từ điển Name mới?")) {
            refreshAllQT(true);
            showToast('🔄 Đã làm mới toàn bộ cột QT!', 'var(--btn-info)');
        }
    });

    // SAO CHÉP TỪNG CỘT TỪ HEAD (GIỮ ĐỊNH DẠNG + TỔNG HỢP CHÚ THÍCH TỪ DATA)
    document.querySelectorAll('.col-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const colKey = btn.getAttribute('data-col');
            if (!colKey) return;

            syncActiveCellToData();

            const plainBlocks = [];
            const htmlBlocks = [];
            let copiedFootnotesCount = 0;

            data.forEach((row) => {
                const extracted = extractCellCopyPayload(row, colKey);
                if (extracted.plain !== '') {
                    plainBlocks.push(extracted.plain);
                    htmlBlocks.push(extracted.html);
                    copiedFootnotesCount += extracted.footnoteCount;
                }
            });

            if (plainBlocks.length === 0) {
                if (typeof showToast === 'function') showToast(`⚠️ Cột ${colKey.toUpperCase()} đang trống!`, 'var(--btn-warning)');
                return;
            }

            const msg = copiedFootnotesCount > 0
                ? `✅ Đã copy cột ${colKey.toUpperCase()} (kèm ${copiedFootnotesCount} chú thích)!`
                : `✅ Đã copy cột ${colKey.toUpperCase()}!`;
            await copyAdvancedToClipboardV2(plainBlocks, htmlBlocks, msg);
        });
    });

    // ÉP LƯU TỨC THÌ KHI TẮT TAB HOẶC RỜI TRANG
    window.addEventListener('beforeunload', () => flushSave());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushSave();
        }
    });
}

// =========================================================================
// HÀM BỔ TRỢ & CƠ CHẾ SAO CHÉP NÂNG CẤP (CLIPBOARD V2 KÈM CHÚ THÍCH)
// =========================================================================
function insertRowAt(index) {
    saveEditorUndoState();
    data.splice(index, 0, createEmptyRow());
    renderTable();
    debounceSave();
    if (typeof showToast === 'function') showToast(`➕ Đã thêm Dòng ${index + 1}`, 'var(--btn-primary)');
}

function deleteSingleRow(index) {
    saveEditorUndoState();
    data.splice(index, 1);
    if (data.length === 0) data = [createEmptyRow()];
    renderTable();
    debounceSave();
    if (typeof showToast === 'function') showToast('🗑️ Đã xóa dòng!', 'var(--btn-danger)');
}

function extractBothCellContents(rawHtml) {
    if (!rawHtml) return { plain: '', html: '' };

    const temp = document.createElement('div');
    temp.innerHTML = rawHtml;

    const highlights = temp.querySelectorAll('.search-highlight, .sync-highlight');
    highlights.forEach(hl => {
        const parent = hl.parentNode;
        while (hl.firstChild) parent.insertBefore(hl.firstChild, hl);
        parent.removeChild(hl);
    });

    // Chuẩn hóa ký hiệu chú thích sup.fn-marker sang thẻ <sup> sạch cho HTML Clipboard
    temp.querySelectorAll('sup.fn-marker').forEach(sup => {
        sup.removeAttribute('contenteditable');
        sup.removeAttribute('class');
        sup.removeAttribute('title');
        sup.removeAttribute('data-fn-id');
        sup.removeAttribute('data-fn-num');
        sup.setAttribute('style', 'font-size: 70%; vertical-align: super; line-height: 0;');
    });

    let cleanedHtml = temp.innerHTML.trim();

    let strForPlain = String(cleanedHtml).replace(/<br\s*[\/]?>/gi, '\n')
                                     .replace(/<\/div>\s*<div>/gi, '\n')
                                     .replace(/<div[^>]*>/gi, '\n')
                                     .replace(/<\/div>/gi, '')
                                     .replace(/<p[^>]*>/gi, '\n')
                                     .replace(/<\/p>/gi, '')
                                     .replace(/&nbsp;/gi, ' ');
    const tempPlain = document.createElement('div');
    tempPlain.innerHTML = strForPlain;
    let plain = tempPlain.textContent || tempPlain.innerText || '';
    plain = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    return { plain: plain, html: cleanedHtml };
}

// Tổng hợp nội dung văn bản chính + chú thích liên kết từ cùng đối tượng rowObj (KHÔNG đọc từ ô input trên UI)
function extractCellCopyPayload(rowObj, colKey) {
    if (!rowObj) return { plain: '', html: '', footnoteCount: 0 };
    const rawHtml = rowObj[colKey] || '';
    const base = extractBothCellContents(rawHtml);

    const allRowFootnotes = Array.isArray(rowObj.footnotes) ? rowObj.footnotes : [];
    const colFootnotes = allRowFootnotes.filter(fn => (fn.col || 'translation') === colKey);

    // Xác định thứ tự xuất hiện thực tế của các ký hiệu [n] trong văn bản chính của ô
    const temp = document.createElement('div');
    temp.innerHTML = rawHtml;
    const markers = Array.from(temp.querySelectorAll('sup.fn-marker'));

    const orderedFootnotes = [];
    const seenIds = new Set();

    markers.forEach(marker => {
        const fnId = marker.dataset.fnId;
        const fnNum = parseInt(marker.dataset.fnNum || (marker.textContent || '').replace(/\D/g, ''), 10);

        let matched = null;
        if (fnId) {
            matched = colFootnotes.find(f => f.id === fnId);
        }
        if (!matched && !isNaN(fnNum)) {
            matched = colFootnotes.find(f => Number(f.num) === fnNum && !seenIds.has(f.id));
        }

        if (matched && !seenIds.has(matched.id)) {
            seenIds.add(matched.id);
            const trimmedNote = normalizeUnicodeText(String(matched.note || '')).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
            if (trimmedNote !== '') {
                orderedFootnotes.push({
                    num: matched.num || fnNum,
                    note: trimmedNote
                });
            }
        }
    });

    if (base.plain === '' && orderedFootnotes.length === 0) {
        return { plain: '', html: '', footnoteCount: 0 };
    }

    // Tạo Plain Text: Đoạn văn chính + 1 dòng trống + danh sách [n] Nội dung
    let combinedPlain = base.plain;
    if (orderedFootnotes.length > 0) {
        const plainNotes = orderedFootnotes
            .map(fn => `[${fn.num}] ${fn.note.replace(/\n/g, '\r\n')}`)
            .join('\r\n');
        combinedPlain = combinedPlain !== ''
            ? `${combinedPlain}\r\n\r\n${plainNotes}`
            : plainNotes;
    }

    // Tạo HTML Rich Text: Giữ nguyên định dạng gốc + sup + chú thích bên dưới đoạn văn
    let combinedHtml = '';
    if (orderedFootnotes.length > 0) {
        const mainBlockHtml = base.html !== ''
            ? `<div style="margin-bottom: 8px; font-family: inherit; font-size: 11pt;">${base.html}</div>`
            : '';
        const notesHtml = orderedFootnotes.map(fn => {
            const safeNoteHtml = escapeFootnoteHtml(fn.note).replace(/\n/g, '<br>');
            return `<div style="margin-bottom: 3px; font-family: inherit; font-size: 10.5pt;"><span style="font-weight: 700;">[${fn.num}]</span> ${safeNoteHtml}</div>`;
        }).join('\n');
        combinedHtml = `<div style="margin-bottom: 14px;">${mainBlockHtml}<div style="margin-bottom: 4px;">${notesHtml}</div></div>`;
    } else {
        combinedHtml = `<div style="margin-bottom: 14px; font-family: inherit; font-size: 11pt;">${base.html}</div>`;
    }

    return {
        plain: combinedPlain,
        html: combinedHtml,
        footnoteCount: orderedFootnotes.length
    };
}

async function copyAdvancedToClipboardV2(plainBlocks, htmlBlocks, successMsg) {
    if (!plainBlocks || plainBlocks.length === 0) return;
    const plainText = plainBlocks.join('\r\n\r\n');
    
    const htmlText = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body>
            ${htmlBlocks.join('\n')}
        </body>
        </html>
    `.trim();

    try {
        if (navigator.clipboard && window.ClipboardItem) {
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            const htmlBlob = new Blob([htmlText], { type: 'text/html' });
            await navigator.clipboard.write([
                new ClipboardItem({ 
                    'text/plain': textBlob, 
                    'text/html': htmlBlob 
                })
            ]);
            if (typeof showToast === 'function') showToast(successMsg, 'var(--btn-success)');
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(plainText);
            if (typeof showToast === 'function') showToast(successMsg, 'var(--btn-success)');
        } else {
            fallbackCopyText(plainText);
        }
    } catch (err) { 
        console.warn("Lỗi Clipboard API, dùng cơ chế fallback copy dự phòng:", err);
        fallbackCopyText(plainText); 
    }
}

function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        if (typeof showToast === 'function') showToast(`📋 Đã copy (Plain Text)!`, 'var(--btn-success)');
    } catch (e) {
        alert("Trình duyệt chặn sao chép tự động!");
    }
    document.body.removeChild(ta);
}

function refreshAllQT(forceOverwrite = false) {
    if (typeof nameQTEngine === 'undefined' || !nameQTEngine.process) return;
    data.forEach((row, idx) => {
        if (row.raw && (forceOverwrite || !manualQTState[idx])) {
            const rawVal = row.raw.replace(/<[^>]+>/g, '').normalize('NFC');
            const res = nameQTEngine.process(rawVal);
            data[idx]['qt'] = res.text.normalize('NFC');
            rowTokensMap[idx] = res.tokens;
            if (forceOverwrite) manualQTState[idx] = false;
        }
    });
    renderTable(); debounceSave();
}

function execFormat(command, value = null) {
    saveEditorUndoState();
    document.execCommand(command, false, value);
    const activeEl = document.activeElement;
    const targetTd = activeEl ? activeEl.closest('td[data-col]') : null;
    const contentEl = activeEl ? (activeEl.closest('.cell-content') || (targetTd ? targetTd.querySelector('.cell-content') : null)) : null;
    if (contentEl) contentEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function updateWordCounts() {
    let counts = { 
        raw: { w: 0, c: 0 }, 
        pinyin: { w: 0, c: 0 }, 
        qt: { w: 0, c: 0 }, 
        translation: { w: 0, c: 0 }, 
        edit: { w: 0, c: 0 }, 
        meaning: { w: 0, c: 0 } 
    };

    for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < columns.length; j++) {
            const col = columns[j];
            const val = data[i][col];
            if (!val) continue;
            const cleanVal = String(val).replace(/<sup[^>]*class="[^"]*fn-marker[^"]*"[^>]*>.*?<\/sup>/gi, '');
            const text = cleanVal.replace(/<[^>]+>/g, '').trim();
            if (!text) continue;

            counts[col].c += text.length;
            counts[col].w += (col === 'raw') ? text.length : text.split(/\s+/).filter(Boolean).length;
        }
    }

    for (let j = 0; j < columns.length; j++) {
        const col = columns[j];
        const el = document.getElementById(`count-${col}`);
        if (el) {
            el.innerText = `${counts[col].w.toLocaleString('vi-VN')} từ`;
            el.title = `${counts[col].w.toLocaleString('vi-VN')} từ • ${counts[col].c.toLocaleString('vi-VN')} ký tự`;
        }
    }
}

// =========================================================================
// MỞ RỘNG TOÀN CỤC
// =========================================================================
window.renderTable = renderTable;
window.initEditorEvents = initEditorEvents;
window.setMobileViewMode = setMobileViewMode;
window.toggleColumnCollapse = toggleColumnCollapse;
window.refreshAllQT = refreshAllQT;
window.toggleBatchDeleteMode = toggleBatchDeleteMode;
window.flushSave = flushSave;
window.syncActiveCellToData = syncActiveCellToData;
window.updateWordCounts = updateWordCounts;
window.editorUndo = editorUndo;
window.editorRedo = editorRedo;
window.addFootnoteAtCursor = addFootnoteAtCursor;