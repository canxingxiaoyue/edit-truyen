// =========================================================================
// QUẢN LÝ BẢNG DỊCH CHÍNH (MỤC 1) - KIẾN TRÚC ZERO-DOM CHO DESKTOP
// TỐI ƯU BỘ NHỚ RAM - BẢO VỆ CHỐNG EXTENSION - AUTO SANITIZE DATA
// =========================================================================
let saveTimeout;
let countTimeout;

// 1. TRẠNG THÁI CHẾ ĐỘ CHỌN ĐỂ XÓA HÀNG LOẠT
let isBatchDeleteMode = false;
let selectedBatchRows = new Set(); 
let selectedBatchCols = new Set(); 

// 2. CẤU HÌNH CỘT TRÊN MOBILE
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

function debounceSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        localStorage.setItem('translationData', JSON.stringify(data));
        localStorage.setItem('manualQTState', JSON.stringify(manualQTState));
        const now = Date.now();
        if (now - lastHistoryTime > 15000) { 
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
            lastHistoryTime = now;
        }
    }, 500);

    clearTimeout(countTimeout);
    countTimeout = setTimeout(() => { updateWordCounts(); }, 300);
}

// =========================================================================
// HỆ THỐNG RENDER ĐỘNG (LOẠI BỎ HOÀN TOÀN CELL-HEADER TRÊN DESKTOP)
// =========================================================================
let currentIsMobile = window.innerWidth <= 768;

// Lắng nghe thay đổi kích thước màn hình để tự động Render lại cho Mobile/Desktop
window.addEventListener('resize', () => {
    const newIsMobile = window.innerWidth <= 768;
    if (newIsMobile !== currentIsMobile) {
        currentIsMobile = newIsMobile;
        renderTable(); 
    }
});

// Hàm tạo mã HTML cho 1 dòng (Dùng chung để đồng bộ giữa renderTable và appendRow)
function generateRowHTML(rowObj, rowIndex, isMobile) {
    let html = '';
    
    // Ô Checkbox chọn hàng
    html += `<td class="batch-select-cell batch-toggle-el" style="display: ${isBatchDeleteMode ? 'table-cell' : 'none'};" contenteditable="false">
                <input type="checkbox" class="batch-row-checkbox" data-row="${rowIndex}" ${selectedBatchRows.has(rowIndex) ? 'checked' : ''}>
             </td>`;
             
    // Thanh công cụ Hàng (Chỉ xuất hiện trên Mobile)
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

    // Các cột dữ liệu
    columns.forEach(col => {
        const isColCollapsed = !!mobileColCollapsed[col];
        const collapsedClass = (isMobile && isColCollapsed) ? 'col-collapsed' : '';
        const meta = COLUMN_META[col] || { label: col.toUpperCase(), badgeClass: 'badge-default' };
        const contentHtml = normalizeUnicodeText(rowObj[col] || '');
        
        html += `<td data-col="${col}" class="${collapsedClass}">`;
        
        // CỰC KỲ QUAN TRỌNG: Chỉ render Header nếu trên Mobile. Lột sạch rác trên Desktop.
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
        
        // KHÓA MÕM EXTENSION (Google Translate, Grammarly) bằng translate="no" data-gramm="false"
        html += `<div class="cell-content" contenteditable="true" spellcheck="false" translate="no" data-gramm="false">${contentHtml}</div>
             </td>`;
    });
    
    return html;
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    if (!data || !Array.isArray(data) || data.length === 0) data = [createEmptyRow()];

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    // Tự động Sanitize (hút rác) toàn bộ dữ liệu 1 lần trước khi render
    data.forEach((row, rowIndex) => {
        if (!row._sanitized) {
            columns.forEach(col => {
                if (typeof row[col] === 'string') {
                    // Xóa sạch mọi thẻ rỗng, <br>, khoảng trắng dư thừa ở đầu và cuối do copy/paste
                    row[col] = row[col].replace(/^(?:<br\s*\/?>|\s|&nbsp;|<div><br><\/div>|<p><br><\/p>)+/i, '')
                                       .replace(/(?:<br\s*\/?>|\s|&nbsp;|<div><br><\/div>|<p><br><\/p>)+$/i, '');
                }
            });
            row._sanitized = true; // Đánh dấu đã lọc để không quét lại lần sau
        }

        const tr = document.createElement('tr');
        tr.dataset.index = rowIndex;
        if (selectedBatchRows.has(rowIndex)) tr.classList.add('batch-row-selected');
        if (currentRowIndex === rowIndex) tr.classList.add('active-row');
        
        tr.innerHTML = generateRowHTML(row, rowIndex, currentIsMobile);
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
    
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
    renderTable(); // Gọi renderTable sẽ tự đồng bộ thẻ trên mobile
}

function toggleColumnCollapse(colKey) {
    mobileColCollapsed[colKey] = !mobileColCollapsed[colKey];
    localStorage.setItem('mobile_col_collapsed', JSON.stringify(mobileColCollapsed));
    renderTable();
}

function saveEditorUndoState() {
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
            if (data[rIdx]) selectedBatchCols.forEach(c => data[rIdx][c] = '');
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
            selectedBatchCols.forEach(c => row[c] = '');
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
// THIẾT LẬP TOÀN BỘ SỰ KIỆN BIÊN DỊCH VÀ ỦY QUYỀN (CHỐNG TRÙNG LẶP EVENT)
// =========================================================================
function initEditorEvents() {
    if (window._editorEventsBound) return; // Ngăn ngừa chạy nhiều lần làm rò rỉ RAM
    window._editorEventsBound = true;

    const chapterInput = document.getElementById('chapter-title-input');
    if (chapterInput) {
        if (typeof chapterTitle !== 'undefined') chapterInput.value = chapterTitle;
        chapterInput.addEventListener('input', (e) => {
            chapterTitle = e.target.value;
            localStorage.setItem('chapterTitle', chapterTitle);
        });
    }

    const tbody = document.getElementById('table-body');
    if (!tbody) return;

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

    // 2. SỰ KIỆN DÁN THÔNG MINH (XỬ LÝ DỮ LIỆU ĐẦU VÀO)
    tbody.addEventListener('paste', (e) => {
        const targetCell = e.target.closest('td[data-col]');
        if (!targetCell) return;
        const clipboard = (e.originalEvent || e).clipboardData;
        if (!clipboard) return;

        const textData = clipboard.getData('text/plain') || '';
        const tableMatrix = parseClipboardToSmartMatrix(clipboard);
        const tr = targetCell.closest('tr');
        let startRowIndex = parseInt(tr.dataset.index, 10);
        const colIndex = columns.indexOf(targetCell.dataset.col);

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

                if (colIndex === 0) {
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
                    if (cIdx >= 6) break;
                    let rawVal = cells[j];
                    data[rIdx][columns[cIdx]] = normalizeUnicodeText(rawVal).replace(/\n/g, '<br>');
                    if (cIdx === 0) rawUpdated = true;
                    if (cIdx === 1 && rawVal.trim() !== '') pinyinUpdated = true;
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

        // C. Dán câu đơn lẻ
        if (!textData.includes('\n') && !textData.includes('\t')) {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            const textNode = document.createTextNode(textData.trim());
            selection.getRangeAt(0).insertNode(textNode);
            selection.getRangeAt(0).setStartAfter(textNode);
            targetCell.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // 3. NHẬP LIỆU GÕ TAY REAL-TIME
    tbody.addEventListener('input', (e) => {
        const contentEl = e.target.closest('.cell-content');
        if (!contentEl) return;
        const targetTd = contentEl.closest('td[data-col]');
        if (!targetTd) return;

        const tr = targetTd.closest('tr');
        const rowIndex = parseInt(tr.dataset.index, 10);
        const colName = targetTd.dataset.col;

        handleEditorTypingInput();

        // Máy dọn rác tức thì: Xóa sạch các thẻ <br> tàng hình do phím Delete/Backspace sinh ra
        let rawHtml = contentEl.innerHTML;
        let plainText = normalizeUnicodeText(contentEl.innerText);
        if (rawHtml === '<br>' || plainText.trim() === '') {
            contentEl.innerHTML = ''; 
            rawHtml = ''; 
            plainText = '';
        }
        
        data[rowIndex][colName] = rawHtml;

        // Auto QT & Pinyin
        if (colName === 'raw') {
            if (typeof safePinyin === 'function') {
                const pinyinVal = safePinyin(plainText);
                data[rowIndex]['pinyin'] = pinyinVal;
                const pinyinTd = tr.querySelector('td[data-col="pinyin"] .cell-content');
                if (pinyinTd) pinyinTd.innerText = pinyinVal;
            }

            if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                const res = nameQTEngine.process(plainText);
                const qtVal = res.text.normalize('NFC');
                data[rowIndex]['qt'] = qtVal;
                const qtTd = tr.querySelector('td[data-col="qt"] .cell-content');
                if (qtTd) qtTd.innerText = qtVal;
                rowTokensMap[rowIndex] = res.tokens;
            }
        }
        if (colName === 'qt') manualQTState[rowIndex] = true;
        debounceSave();
    });

    // 4. BẮT SỰ KIỆN CLICK (DELEGATION)
    tbody.addEventListener('click', (e) => {
        const collapseTrigger = e.target.closest('.btn-cell-collapse') || e.target.closest('.cell-label');
        if (collapseTrigger) {
            e.preventDefault(); e.stopPropagation();
            const td = collapseTrigger.closest('td[data-col]');
            if (td) {
                toggleColumnCollapse(td.dataset.col);
            }
            return;
        }

        const copyBtn = e.target.closest('.btn-cell-copy');
        if (copyBtn) {
            e.preventDefault(); e.stopPropagation();
            const td = copyBtn.closest('td[data-col]');
            const contentEl = td ? td.querySelector('.cell-content') : null;
            const textToCopy = contentEl ? contentEl.innerText.trim() : '';
            if (textToCopy && navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy);
                if (typeof showToast === 'function') showToast(`📋 Đã copy nội dung!`, 'var(--btn-success)');
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
        
        // Cập nhật Highlight cho Checkbox (Ủy quyền thay vì change)
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
        if (contentEl && window.innerWidth <= 768) {
            setTimeout(() => { contentEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
        }
    });

    // CÁC NÚT THANH CÔNG CỤ TRÊN CÙNG
    document.getElementById('btn-add')?.addEventListener('click', (e) => { e.preventDefault(); insertRowAt(data.length); const c = document.getElementById('table-container'); if(c) c.scrollTop = c.scrollHeight; });
    document.getElementById('btn-delete')?.addEventListener('click', (e) => { e.preventDefault(); if (currentRowIndex >= 0) deleteSingleRow(currentRowIndex); });
    document.getElementById('btn-reset')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm("⚠️ Xóa TOÀN BỘ dữ liệu trên bảng?")) {
            saveEditorUndoState();
            data = [createEmptyRow()];
            currentRowIndex = -1; selectedRowIndices = []; manualQTState = {}; rowTokensMap = {};
            selectedBatchRows.clear(); selectedBatchCols.clear();
            renderTable(); debounceSave();
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

    // EXPORT / IMPORT
    document.getElementById('btn-export')?.addEventListener('click', (e) => {
        e.preventDefault();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        let safeTitle = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') : "chuong_truyen";
        dlAnchor.setAttribute("download", `${safeTitle}_${Date.now()}.json`);
        dlAnchor.click();
        showToast(`💾 Đã tải file xuống máy!`, 'var(--btn-success)');
    });

    const fileInput = document.getElementById('file-input');
    document.getElementById('btn-import')?.addEventListener('click', (e) => { e.preventDefault(); fileInput?.click(); });
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const importedData = JSON.parse(evt.target.result);
                if (Array.isArray(importedData)) {
                    saveEditorUndoState();
                    data = importedData.map(row => ({ ...row, qt: row.qt || '' }));
                    renderTable();
                    debounceSave();
                    showToast('📂 Mở file thành công!', 'var(--btn-success)');
                }
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

    // SAO CHÉP TỪNG CỘT
    document.querySelectorAll('.col-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const colKey = btn.getAttribute('data-col');
            if (!colKey) return;
            const textBlocks = [];
            data.forEach((row) => {
                const text = extractCellContent(row[colKey]);
                if (text !== '') textBlocks.push(text);
            });
            if (textBlocks.length === 0) { showToast(`⚠️ Cột ${colKey.toUpperCase()} đang trống!`, 'var(--btn-warning)'); return; }
            await copyAdvancedToClipboard(textBlocks, `✅ Đã copy cột ${colKey.toUpperCase()}!`);
        });
    });
}

// =========================================================================
// HÀM BỔ TRỢ
// =========================================================================
function insertRowAt(index) {
    saveEditorUndoState();
    data.splice(index, 0, createEmptyRow());
    renderTable(); // Gọi lại hàm render để duy trì Auto Sanitize
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

function extractCellContent(html) {
    if (!html) return '';
    let str = String(html);
    str = str.replace(/<br\s*[\/]?>/gi, '\n').replace(/<\/div>\s*<div>/gi, '\n').replace(/<div[^>]*>/gi, '\n').replace(/<\/div>/gi, '').replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '').replace(/&nbsp;/gi, ' ');
    const temp = document.createElement('div');
    temp.innerHTML = str;
    let plain = temp.textContent || temp.innerText || '';
    return plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

async function copyAdvancedToClipboard(textBlocks, successMsg) {
    if (!textBlocks || textBlocks.length === 0) return;
    const plainText = textBlocks.join('\r\n\r\n');
    const htmlText = textBlocks.map(block => {
        return `<p>${block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
    }).join('<p><br></p>');

    try {
        if (navigator.clipboard && window.ClipboardItem) {
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            const htmlBlob = new Blob([htmlText], { type: 'text/html' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textBlob, 'text/html': htmlBlob })]);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(plainText);
        }
        showToast(successMsg, 'var(--btn-success)');
    } catch (err) { showToast('❌ Không thể truy cập bộ nhớ tạm!', 'var(--btn-danger)'); }
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
    const activeCell = document.activeElement;
    if (activeCell && activeCell.closest('td')) activeCell.dispatchEvent(new Event('input', { bubbles: true }));
}

function updateWordCounts() {
    let counts = { raw: { w: 0, c: 0 }, pinyin: { w: 0, c: 0 }, meaning: { w: 0, c: 0 }, translation: { w: 0, c: 0 }, qt: { w: 0, c: 0 }, edit: { w: 0, c: 0 } };
    for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < columns.length; j++) {
            const col = columns[j];
            const val = data[i][col];
            if (!val) continue;
            const text = val.replace(/<[^>]+>/g, '').trim();
            if (!text) continue;
            counts[col].c += text.length;
            counts[col].w += (j === 0 || j === 4) ? text.length : text.split(/\s+/).length;
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
// MỞ RỘNG TOÀN CỤC CHO CÁC MODULE KHÁC GỌI
// =========================================================================
window.renderTable = renderTable;
window.initEditorEvents = initEditorEvents;
window.setMobileViewMode = setMobileViewMode;
window.toggleColumnCollapse = toggleColumnCollapse;
window.refreshAllQT = refreshAllQT;
window.toggleBatchDeleteMode = toggleBatchDeleteMode;