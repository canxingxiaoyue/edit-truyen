// =========================================================================
// QUẢN LÝ BẢNG DỊCH CHÍNH (MỤC 1) - TÍCH HỢP CHẾ ĐỘ CHỌN & XÓA HÀNG LOẠT
// =========================================================================
let saveTimeout;
let countTimeout;

// TRẠNG THÁI CHẾ ĐỘ CHỌN ĐỂ XÓA HÀNG LOẠT
let isBatchDeleteMode = false;
let selectedBatchRows = new Set(); // Chứa các chỉ số hàng (0, 1, 2...)
let selectedBatchCols = new Set(); // Chứa tên các cột ('raw', 'pinyin', 'meaning'...)

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
    }, 800);

    clearTimeout(countTimeout);
    countTimeout = setTimeout(() => {
        updateWordCounts();
    }, 400);
}

// VẼ BẢNG DỊCH (TỰ ĐỘNG BẢO TOÀN data-col VÀ CỘT CHECKBOX)
function renderTable() {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
        data = [createEmptyRow()];
    }

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    data.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        
        // 1. Ô CHECKBOX ĐẦU HÀNG
        const selectTd = document.createElement('td');
        selectTd.className = 'batch-select-cell batch-toggle-el';
        selectTd.style.display = isBatchDeleteMode ? 'table-cell' : 'none';
        selectTd.contentEditable = false;
        
        const rowCb = document.createElement('input');
        rowCb.type = 'checkbox';
        rowCb.className = 'batch-row-checkbox';
        rowCb.dataset.row = rowIndex;
        rowCb.checked = selectedBatchRows.has(rowIndex);
        selectTd.appendChild(rowCb);
        tr.appendChild(selectTd);

        // 2. CÁC CỘT DỮ LIỆU CHÍNH (GẮN data-col ĐỂ CHỐNG LỆCH CỘT)
        columns.forEach(col => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.dataset.col = col;
            td.innerHTML = normalizeUnicodeText(row[col] || ''); 
            tr.appendChild(td);
        });

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
    
    // Tự động cập nhật Highlight và thống kê nếu đang bật chế độ chọn
    if (isBatchDeleteMode) {
        updateBatchHighlightsAndSummary();
    }

    if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
        data.forEach((row, idx) => {
            if (row.raw) {
                const rawVal = normalizeUnicodeText(row.raw.replace(/<[^>]+>/g, ''));
                const res = nameQTEngine.process(rawVal);
                rowTokensMap[idx] = res.tokens;
            }
        });
    }

    updateWordCounts();
}

function appendRowToDOM(rowObj, index) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    const tr = document.createElement('tr');

    const selectTd = document.createElement('td');
    selectTd.className = 'batch-select-cell batch-toggle-el';
    selectTd.style.display = isBatchDeleteMode ? 'table-cell' : 'none';
    selectTd.contentEditable = false;
    
    const rowCb = document.createElement('input');
    rowCb.type = 'checkbox';
    rowCb.className = 'batch-row-checkbox';
    rowCb.dataset.row = index;
    selectTd.appendChild(rowCb);
    tr.appendChild(selectTd);

    columns.forEach(col => {
        const td = document.createElement('td');
        td.contentEditable = true;
        td.dataset.col = col;
        td.innerHTML = normalizeUnicodeText(rowObj[col] || ''); 
        tr.appendChild(td);
    });
    tbody.appendChild(tr);
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
    
    // Xóa lựa chọn khi Undo để tránh lỗi chỉ số cũ
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
    const nextState = JSON.parse(editorRedoStack.pop());
    data = nextState;

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
            pushToCloudHistory('editor', data);
            return;
        }

        let history = JSON.parse(localStorage.getItem('translationHistory')) || [];
        const currentDataCopy = JSON.parse(JSON.stringify(data));

        if (history.length > 0 && JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentDataCopy)) {
            return;
        }

        history.push({ timestamp: Date.now(), rowCount: data.length, data: currentDataCopy });
        try { localStorage.setItem('translationHistory', JSON.stringify(history)); } catch (e) {}
    } catch (e) {
        console.error("Lỗi addEditorHistoryEntry:", e);
    }
}

// =========================================================================
// QUẢN LÝ CHẾ ĐỘ CHỌN VÀ XÓA HÀNG LOẠT (SELECTION & DELETION ENGINE)
// =========================================================================

// 1. BẬT / TẮT CHẾ ĐỘ
function toggleBatchDeleteMode(forceState = null) {
    isBatchDeleteMode = (forceState !== null) ? forceState : !isBatchDeleteMode;

    const toggleBtn = document.getElementById('btn-toggle-batch');
    const actionBar = document.getElementById('batch-action-bar');
    
    if (toggleBtn) {
        if (isBatchDeleteMode) toggleBtn.classList.add('active');
        else toggleBtn.classList.remove('active');
    }

    if (actionBar) {
        actionBar.style.display = isBatchDeleteMode ? 'flex' : 'none';
    }

    // Ẩn / Hiện tất cả phần tử checkbox (ở thead và tbody)
    document.querySelectorAll('.batch-toggle-el').forEach(el => {
        if (el.tagName === 'TH' || el.tagName === 'TD') {
            el.style.display = isBatchDeleteMode ? 'table-cell' : 'none';
        } else {
            el.style.display = isBatchDeleteMode ? 'flex' : 'none';
        }
    });

    if (!isBatchDeleteMode) {
        deselectAllBatch();
    } else {
        updateBatchHighlightsAndSummary();
    }
}

// 2. BỎ CHỌN TOÀN BỘ
function deselectAllBatch() {
    selectedBatchRows.clear();
    selectedBatchCols.clear();

    const masterCb = document.getElementById('batch-check-all-rows');
    if (masterCb) masterCb.checked = false;

    document.querySelectorAll('.batch-col-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.batch-row-checkbox').forEach(cb => cb.checked = false);

    updateBatchHighlightsAndSummary();
}

// 3. CẬP NHẬT HIGHLIGHT VÀ SỐ LƯỢNG THỐNG KÊ (RULE IV)
function updateBatchHighlightsAndSummary() {
    const rowCount = selectedBatchRows.size;
    const colCount = selectedBatchCols.size;
    const totalDataRows = data.length;

    // Cập nhật text tóm tắt & trạng thái nút xóa
    const summaryEl = document.getElementById('batch-count-summary');
    const deleteBtn = document.getElementById('btn-batch-confirm-delete');

    let summaryText = 'Đã chọn: 0 hàng, 0 cột (0 ô)';
    let canDelete = false;

    if (rowCount > 0 && colCount > 0) {
        const intersectionCount = rowCount * colCount;
        summaryText = `Đã chọn: ${rowCount} hàng, ${colCount} cột (${intersectionCount} ô giao nhau)`;
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

    // Cập nhật trạng thái Master Checkbox ở thead
    const masterCb = document.getElementById('batch-check-all-rows');
    if (masterCb) {
        masterCb.checked = (rowCount === totalDataRows && totalDataRows > 0);
        masterCb.indeterminate = (rowCount > 0 && rowCount < totalDataRows);
    }

    // Cập nhật class CSS Highlight từng hàng, từng cột và từng ô
    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    Array.from(tbody.children).forEach((tr, rIdx) => {
        const isRowSelected = selectedBatchRows.has(rIdx);
        
        if (isRowSelected) tr.classList.add('batch-row-selected');
        else tr.classList.remove('batch-row-selected');

        // Quét các ô dữ liệu trong hàng
        Array.from(tr.querySelectorAll('td[data-col]')).forEach(td => {
            const cName = td.dataset.col;
            const isColSelected = selectedBatchCols.has(cName);
            const isIntersection = isRowSelected && isColSelected;

            td.classList.remove('batch-col-selected', 'batch-intersection-selected');

            if (isIntersection) {
                td.classList.add('batch-intersection-selected'); // Ưu tiên cao nhất
            } else if (isColSelected) {
                td.classList.add('batch-col-selected');
            }
        });
    });
}

// 4. THỰC HIỆN XÓA HÀNG LOẠT (RULE III, V, VI, VII)
function executeBatchDelete() {
    const rowCount = selectedBatchRows.size;
    const colCount = selectedBatchCols.size;

    if (rowCount === 0 && colCount === 0) return;

    let confirmMsg = '';

    // RULE V: HỘP THOẠI XÁC NHẬN MÔ TẢ CHÍNH XÁC
    if (rowCount > 0 && colCount > 0) {
        // TRƯỜNG HỢP 3: CHỌN ĐỒNG THỜI HÀNG VÀ CỘT -> ƯU TIÊN XÓA Ô GIAO NHAU
        confirmMsg = `Bạn sắp xóa nội dung của ${rowCount * colCount} ô tại giao điểm giữa ${rowCount} hàng và ${colCount} cột.`;
    } else if (rowCount > 0 && colCount === 0) {
        // TRƯỜNG HỢP 2: CHỈ CHỌN HÀNG -> XÓA HÀNG TRÊN TOÀN BỘ CỘT
        confirmMsg = `Bạn sắp xóa ${rowCount} hàng trên toàn bộ các cột.`;
    } else if (rowCount === 0 && colCount > 0) {
        // TRƯỜNG HỢP 1: CHỈ CHỌN CỘT -> XÓA NỘI DUNG CÁC CỘT ĐÃ CHỌN
        confirmMsg = `Bạn sắp xóa nội dung của ${colCount} cột. Cấu trúc bảng sẽ được giữ nguyên.`;
    }

    if (!confirm(confirmMsg)) {
        return; // Người dùng nhấn Hủy: Dữ liệu giữ nguyên hoàn toàn
    }

    // LƯU TRẠNG THÁI UNDO ĐƠN NHẤT (RULE VI)
    saveEditorUndoState();
    if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

    if (rowCount > 0 && colCount > 0) {
        // === XỬ LÝ TRƯỜNG HỢP 3: XÓA Ô TẠI GIAO ĐIỂM ===
        selectedBatchRows.forEach(rIdx => {
            if (data[rIdx]) {
                selectedBatchCols.forEach(cName => {
                    data[rIdx][cName] = '';
                });
                // Nếu xóa ô Raw, làm mới token của hàng đó
                if (selectedBatchCols.has('raw')) {
                    rowTokensMap[rIdx] = [];
                }
            }
        });
        showToast(`🗑️ Đã xóa nội dung ${rowCount * colCount} ô giao nhau!`, 'var(--btn-success)');

    } else if (rowCount > 0 && colCount === 0) {
        // === XỬ LÝ TRƯỜNG HỢP 2: XÓA HÀNG HOÀN TOÀN (TỪ DƯỚI LÊN ĐỂ CHỐNG LỆCH INDEX) ===
        const sortedRowIndices = Array.from(selectedBatchRows).sort((a, b) => b - a);
        sortedRowIndices.forEach(rIdx => {
            if (rIdx >= 0 && rIdx < data.length) {
                data.splice(rIdx, 1);
            }
        });

        if (data.length === 0) {
            data = [createEmptyRow()];
        }
        showToast(`🗑️ Đã xóa ${rowCount} hàng trên toàn bộ bảng!`, 'var(--btn-success)');

    } else if (rowCount === 0 && colCount > 0) {
        // === XỬ LÝ TRƯỜNG HỢP 1: XÓA NỘI DUNG TOÀN CỘT ===
        data.forEach((row, rIdx) => {
            selectedBatchCols.forEach(cName => {
                row[cName] = '';
            });
            if (selectedBatchCols.has('raw')) {
                rowTokensMap[rIdx] = [];
            }
        });
        showToast(`🗑️ Đã xóa sạch nội dung của ${colCount} cột!`, 'var(--btn-success)');
    }

    // Tự động bỏ chọn & vẽ lại bảng
    deselectAllBatch();
    renderTable();
    debounceSave();
}

// =========================================================================
// HÀM PARSE BẢNG ĐA NĂNG THÔNG MINH (TABLE MATRIX PARSER)
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
                        text = text.replace(/&nbsp;/g, ' ')
                                   .replace(/\r\n/g, '\n')
                                   .replace(/\r/g, '\n')
                                   .trim();
                        rowValues.push(text);
                    });

                    const firstCell = (rowValues[0] || '').toLowerCase().trim();
                    const isHeader = firstCell.includes('raw') || 
                                     firstCell.includes('giản thể') || 
                                     firstCell.includes('pinyin') || 
                                     firstCell === 'tiếng trung';

                    if (!isHeader && rowValues.some(v => v !== '')) {
                        matrix.push(rowValues);
                    }
                });

                if (matrix.length > 0 && matrix.some(r => r.length >= 2)) {
                    return matrix;
                }
            }
        } catch (err) {
            console.warn("Lỗi parse HTML:", err);
        }
    }

    if (textData && textData.includes('\t')) {
        const clean = textData.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').normalize('NFC');
        const lines = clean.split(/\r\n|\r|\n/);

        let maxTabs = 0;
        lines.forEach(l => {
            const count = (l.match(/\t/g) || []).length;
            if (count > maxTabs) maxTabs = count;
        });

        if (maxTabs > 0) {
            const matrix = [];
            let currentRow = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const tabCount = (line.match(/\t/g) || []).length;

                if (tabCount > 0 || currentRow === null) {
                    const tokens = line.split('\t').map(c => c.trim());

                    if (!currentRow || currentRow.length >= maxTabs + 1) {
                        if (currentRow && currentRow.some(c => c !== '')) {
                            matrix.push(currentRow);
                        }
                        currentRow = tokens;
                    } else {
                        const lastIdx = currentRow.length - 1;
                        currentRow[lastIdx] = (currentRow[lastIdx] ? currentRow[lastIdx] + '\n' : '') + tokens[0];
                        for (let k = 1; k < tokens.length; k++) {
                            currentRow.push(tokens[k]);
                        }
                    }
                } else {
                    if (currentRow && currentRow.length > 0) {
                        const lastIdx = currentRow.length - 1;
                        currentRow[lastIdx] = (currentRow[lastIdx] ? currentRow[lastIdx] + '\n' : '') + line.trim();
                    }
                }
            }

            if (currentRow && currentRow.some(c => c !== '')) {
                matrix.push(currentRow);
            }

            if (matrix.length > 0) {
                const f = (matrix[0][0] || '').toLowerCase().trim();
                if (f.includes('raw') || f.includes('giản thể') || f.includes('pinyin')) {
                    matrix.shift();
                }
            }

            if (matrix.length > 0) return matrix;
        }
    }

    return [];
}

// SỰ KIỆN BIÊN DỊCH CHÍNH
function initEditorEvents() {
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

    // =========================================================================
    // SỰ KIỆN CHỌN CHECKBOX (HÀNG VÀ CỘT)
    // =========================================================================
    
    // 1. Nút Bật/Tắt chế độ chọn để xóa
    document.getElementById('btn-toggle-batch')?.addEventListener('click', () => {
        toggleBatchDeleteMode();
    });

    // 2. Nút Bỏ chọn
    document.getElementById('btn-batch-deselect')?.addEventListener('click', () => {
        deselectAllBatch();
    });

    // 3. Nút Hủy chọn (Thoát chế độ)
    document.getElementById('btn-batch-cancel')?.addEventListener('click', () => {
        toggleBatchDeleteMode(false);
    });

    // 4. Nút Xác nhận Xóa
    document.getElementById('btn-batch-confirm-delete')?.addEventListener('click', () => {
        executeBatchDelete();
    });

    // 5. Chọn / Bỏ chọn toàn bộ hàng (Master Checkbox)
    document.getElementById('batch-check-all-rows')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        if (isChecked) {
            for (let i = 0; i < data.length; i++) selectedBatchRows.add(i);
        } else {
            selectedBatchRows.clear();
        }
        document.querySelectorAll('.batch-row-checkbox').forEach(cb => cb.checked = isChecked);
        updateBatchHighlightsAndSummary();
    });

    // 6. Chọn / Bỏ chọn theo cột
    document.querySelectorAll('.batch-col-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const col = e.target.dataset.col;
            if (!col) return;
            if (e.target.checked) selectedBatchCols.add(col);
            else selectedBatchCols.delete(col);
            updateBatchHighlightsAndSummary();
        });
    });

    // 7. Chọn / Bỏ chọn theo hàng (Lắng nghe tại tbody)
    tbody.addEventListener('change', (e) => {
        if (e.target && e.target.classList.contains('batch-row-checkbox')) {
            const rIdx = parseInt(e.target.dataset.row);
            if (isNaN(rIdx)) return;
            if (e.target.checked) selectedBatchRows.add(rIdx);
            else selectedBatchRows.delete(rIdx);
            updateBatchHighlightsAndSummary();
        }
    });

    // =========================================================================
    // DÁN THÔNG MINH (CHỐNG LỆCH HÀNG & GOM DÒNG CHUẨN XÁC)
    // =========================================================================
    tbody.addEventListener('paste', (e) => {
        const targetCell = e.target.closest('td[data-col]');
        if (!targetCell) return;

        const clipboard = (e.originalEvent || e).clipboardData;
        if (!clipboard) return;

        const textData = clipboard.getData('text/plain') || '';
        const tableMatrix = parseClipboardToSmartMatrix(clipboard);

        const tr = targetCell.closest('tr');
        let startRowIndex = Array.from(tbody.children).indexOf(tr);
        const colName = targetCell.dataset.col;
        const colIndex = columns.indexOf(colName);

        // Trường hợp 1: Dán chương truyện nhiều đoạn vào 1 cột
        if (tableMatrix.length === 0 && /[\r\n]/.test(textData)) {
            e.preventDefault();
            if (typeof clearSyncHighlights === 'function') clearSyncHighlights();

            saveEditorUndoState();
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

            const cleanText = textData.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').normalize('NFC');
            const rawParagraphs = cleanText.split(/\r\n|\r|\n/);
            const paragraphs = rawParagraphs.map(p => p.trim()).filter(p => p !== '');

            if (paragraphs.length === 0) return;

            for (let i = 0; i < paragraphs.length; i++) {
                const rowIndex = startRowIndex + i;

                while (rowIndex >= data.length) {
                    data.push(createEmptyRow());
                }

                const paraText = normalizeUnicodeText(paragraphs[i]);
                data[rowIndex][columns[colIndex]] = paraText;

                if (colIndex === 0) {
                    if (typeof safePinyin === 'function') {
                        data[rowIndex]['pinyin'] = safePinyin(paraText);
                    }
                    if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                        const result = nameQTEngine.process(paraText);
                        data[rowIndex]['qt'] = result.text.normalize('NFC');
                        rowTokensMap[rowIndex] = result.tokens;
                    }
                }
            }

            renderTable();
            debounceSave();
            showToast(`📋 Đã chia và dán thành công ${paragraphs.length} đoạn thành từng hàng!`, 'var(--btn-success)');
            return;
        }

        // Trường hợp 2: Dán bảng nhiều cột
        if (tableMatrix.length > 0) {
            e.preventDefault();
            if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
            
            saveEditorUndoState();
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

            for (let i = 0; i < tableMatrix.length; i++) {
                const cells = tableMatrix[i];
                const rowIndex = startRowIndex + i;

                while (rowIndex >= data.length) {
                    data.push(createEmptyRow());
                }

                let rawUpdated = false;
                let pinyinUpdated = false;

                for (let j = 0; j < cells.length; j++) {
                    const targetColIdx = colIndex + j;
                    if (targetColIdx >= 6) break;

                    let rawVal = cells[j];
                    const displayHtml = normalizeUnicodeText(rawVal).replace(/\n/g, '<br>');
                    data[rowIndex][columns[targetColIdx]] = displayHtml;

                    if (targetColIdx === 0) rawUpdated = true;
                    if (targetColIdx === 1 && rawVal.trim() !== '') pinyinUpdated = true;
                }

                if (rawUpdated) {
                    const rawClean = (data[rowIndex]['raw'] || '').replace(/<[^>]+>/g, '').trim().normalize('NFC');
                    if (!pinyinUpdated && typeof safePinyin === 'function') {
                        data[rowIndex]['pinyin'] = safePinyin(rawClean);
                    }
                    if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                        const result = nameQTEngine.process(rawClean);
                        data[rowIndex]['qt'] = result.text.normalize('NFC');
                        rowTokensMap[rowIndex] = result.tokens;
                    }
                }
            }

            renderTable();
            debounceSave();
            showToast(`📋 Đã dán thành công ${tableMatrix.length} hàng khớp chuẩn bảng!`, 'var(--btn-success)');
            return;
        }

        // Trường hợp 3: Dán 1 câu đơn lẻ
        if (!textData.includes('\n') && !textData.includes('\t')) {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            const cleanSingle = textData.trim();
            const textNode = document.createTextNode(cleanSingle);
            selection.getRangeAt(0).insertNode(textNode);
            selection.getRangeAt(0).setStartAfter(textNode);
            selection.getRangeAt(0).setEndAfter(textNode);
            targetCell.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // NHẬP LIỆU GÕ TAY REAL-TIME (DÙNG data-col CHỐNG LỆCH CỘT KHI CÓ CHECKBOX)
    tbody.addEventListener('input', (e) => {
        const targetCell = e.target.closest('td[data-col]');
        if (!targetCell) return;
        const tr = targetCell.closest('tr');
        const rowIndex = Array.from(tbody.children).indexOf(tr);
        const colName = targetCell.dataset.col;
        const colIndex = columns.indexOf(colName);

        handleEditorTypingInput();
        const plainText = normalizeUnicodeText(targetCell.innerText);
        data[rowIndex][colName] = targetCell.innerHTML;

        if (colIndex === 0) {
            if (typeof safePinyin === 'function') {
                data[rowIndex]['pinyin'] = safePinyin(plainText);
                const pinyinTd = tr.querySelector('td[data-col="pinyin"]');
                if (pinyinTd) pinyinTd.innerText = data[rowIndex]['pinyin'];
            }

            if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined') {
                const result = nameQTEngine.process(plainText);
                data[rowIndex]['qt'] = result.text.normalize('NFC');
                const qtTd = tr.querySelector('td[data-col="qt"]');
                if (qtTd) qtTd.innerText = result.text.normalize('NFC');
                rowTokensMap[rowIndex] = result.tokens;
            }
        }

        if (colIndex === 4) manualQTState[rowIndex] = true;

        debounceSave();
    });

    tbody.addEventListener('focusin', (e) => {
        if (editorIsTyping) {
            clearTimeout(editorTypingUndoTimeout);
            saveEditorUndoState();
            editorIsTyping = false;
        }
        if (isDragSelecting) return; 
        const tr = e.target.closest('tr');
        if (tr) {
            tbody.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
            tr.classList.add('active-row');
            currentRowIndex = Array.from(tbody.children).indexOf(tr);
            selectedRowIndices = [currentRowIndex]; 
        }
    });

    // THÊM HÀNG ĐƠN LẺ
    document.getElementById('btn-add')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveEditorUndoState();
        const newRow = createEmptyRow();
        data.push(newRow);
        appendRowToDOM(newRow, data.length - 1);
        debounceSave();
        const container = document.getElementById('table-container');
        if (container) container.scrollTop = container.scrollHeight;
    });

    // XÓA HÀNG ĐANG CHỌN (CHẾ ĐỘ THÔNG THƯỜNG)
    document.getElementById('btn-delete')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (selectedRowIndices.length > 0) {
            const count = selectedRowIndices.length;
            if (confirm(`Bạn có chắc chắn muốn xóa ${count} hàng được chọn không?`)) {
                saveEditorUndoState();
                if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
                const sortedIndices = [...selectedRowIndices].sort((a, b) => b - a);
                sortedIndices.forEach(idx => {
                    if (tbody.children[idx]) {
                        tbody.children[idx].remove();
                        data.splice(idx, 1);
                    }
                });
                if (data.length === 0) {
                    data = [createEmptyRow()];
                    renderTable();
                }
                currentRowIndex = -1;
                selectedRowIndices = [];
                debounceSave();
                showToast(`🗑️ Đã xóa ${count} hàng!`, 'var(--btn-danger)');
            }
        }
    });

    // LÀM MỚI BẢNG
    document.getElementById('btn-reset')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm("⚠️ Xóa TOÀN BỘ dữ liệu trên bảng?")) {
            saveEditorUndoState();
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
            data = [createEmptyRow()];
            currentRowIndex = -1;
            selectedRowIndices = [];
            manualQTState = {};
            rowTokensMap = {};
            
            tbody.innerHTML = '';
            setTimeout(() => {
                renderTable();
                localStorage.setItem('translationData', JSON.stringify(data));
                localStorage.setItem('manualQTState', JSON.stringify(manualQTState));
                showToast('🔄 Đã làm mới toàn bộ bảng!', 'var(--btn-warning)');
            }, 0);
        }
    });

    // TRÍCH XUẤT NỘI DUNG Ô
    function extractCellContent(html) {
        if (!html) return '';
        let str = String(html);
        str = str.replace(/<br\s*[\/]?>/gi, '\n')
                 .replace(/<\/div>\s*<div>/gi, '\n')
                 .replace(/<div[^>]*>/gi, '\n')
                 .replace(/<\/div>/gi, '')
                 .replace(/<p[^>]*>/gi, '\n')
                 .replace(/<\/p>/gi, '')
                 .replace(/&nbsp;/gi, ' ');
        const temp = document.createElement('div');
        temp.innerHTML = str;
        let plain = temp.textContent || temp.innerText || '';
        return plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    }

    // SAO CHÉP KÉP
    async function copyAdvancedToClipboard(textBlocks, successMsg) {
        if (!textBlocks || textBlocks.length === 0) {
            showToast('⚠️ Cột này đang trống!', 'var(--btn-warning)');
            return;
        }

        const plainText = textBlocks.join('\r\n\r\n');
        const htmlText = textBlocks.map(block => {
            const safeHtml = block.replace(/&/g, '&amp;')
                                  .replace(/</g, '&lt;')
                                  .replace(/>/g, '&gt;')
                                  .replace(/\n/g, '<br>');
            return `<p>${safeHtml}</p>`;
        }).join('<p><br></p>');

        try {
            if (navigator.clipboard && window.ClipboardItem) {
                const textBlob = new Blob([plainText], { type: 'text/plain' });
                const htmlBlob = new Blob([htmlText], { type: 'text/html' });
                const clipboardItem = new ClipboardItem({ 'text/plain': textBlob, 'text/html': htmlBlob });
                await navigator.clipboard.write([clipboardItem]);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(plainText);
            }
            showToast(successMsg, 'var(--btn-success)');
        } catch (err) {
            showToast('❌ Không thể truy cập bộ nhớ tạm!', 'var(--btn-danger)');
        }
    }

    // COPY TỪNG CỘT
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

            if (textBlocks.length === 0) {
                showToast(`⚠️ Cột ${colKey.toUpperCase()} đang trống!`, 'var(--btn-warning)');
                return;
            }

            await copyAdvancedToClipboard(textBlocks, `✅ Đã copy cột ${colKey.toUpperCase()}!`);
        });
    });

    // COPY BẢN BÊ TA
    document.getElementById('btn-copy')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const textBlocks = [];
        data.forEach(row => {
            const text = extractCellContent(row.edit);
            if (text !== '') textBlocks.push(text);
        });

        if (textBlocks.length === 0) {
            showToast('⚠️ Cột Bản bê ta đang trống!', 'var(--btn-warning)');
            return;
        }

        await copyAdvancedToClipboard(textBlocks, '✅ Đã sao chép chương Bản bê ta!');
    });

    // NÚT RIBBON
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

    // PHÍM TẮT
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (activeTab === 'edit-tool') editorUndo(); else if (typeof metaUndo === 'function') metaUndo();
            } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                if (activeTab === 'edit-tool') editorRedo(); else if (typeof metaRedo === 'function') metaRedo();
            } else if (key === 'b' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('bold');
            } else if (key === 'i' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('italic');
            } else if (key === 'u' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('underline');
            }
        }
    });

    // XUẤT / NHẬP FILE
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

    document.getElementById('btn-history-show')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof openHistoryModal === 'function') openHistoryModal('editor');
    });

    document.getElementById('btn-replace-show')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('modal-replace')?.classList.add('show');
        document.getElementById('find-text')?.focus();
    });

    document.getElementById('btn-highlight-all')?.addEventListener('click', () => { if (typeof runHighlightAll === 'function') runHighlightAll(); });
    document.getElementById('btn-replace-next')?.addEventListener('click', () => { if (typeof runReplaceNext === 'function') runReplaceNext(); });
    document.getElementById('btn-replace-all')?.addEventListener('click', () => { if (typeof runReplaceAll === 'function') runReplaceAll(); });
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
    renderTable();
    debounceSave();
}

function execFormat(command, value = null) {
    saveEditorUndoState();
    document.execCommand(command, false, value);
    const activeCell = document.activeElement;
    if (activeCell && activeCell.closest('td')) {
        activeCell.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function updateWordCounts() {
    let counts = { raw: { w: 0, c: 0 }, pinyin: { w: 0, c: 0 }, meaning: { w: 0, c: 0 }, translation: { w: 0, c: 0 }, qt: { w: 0, c: 0 }, edit: { w: 0, c: 0 } };

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        for (let j = 0; j < columns.length; j++) {
            const col = columns[j];
            const val = row[col];
            if (!val) continue;

            const text = val.replace(/<[^>]+>/g, '').trim();
            if (!text) continue;

            counts[col].c += text.length;

            if (j === 0 || j === 4) { 
                counts[col].w += text.length;
            } else { 
                counts[col].w += text.split(/\s+/).length;
            }
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