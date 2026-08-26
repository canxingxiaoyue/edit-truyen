// =========================================================================
// QUẢN LÝ BẢNG DỊCH CHÍNH (MỤC 1) - TỐI ƯU SIÊU TỐC & ĐẦY ĐỦ PHÍM TẮT
// =========================================================================
let saveTimeout;
let countTimeout;

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
        columns.forEach(col => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerHTML = normalizeUnicodeText(row[col] || ''); 
            tr.appendChild(td);
        });
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    
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
    columns.forEach(col => {
        const td = document.createElement('td');
        td.contentEditable = true;
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
    renderTable();
    debounceSave();
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();
    showToast('🔁 Đã làm lại dịch thuật (Redo)', 'var(--btn-info)');
}

function addEditorHistoryEntry() {
    let history = JSON.parse(localStorage.getItem('translationHistory')) || [];
    const currentDataCopy = JSON.parse(JSON.stringify(data));
    if (history.length > 0 && JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentDataCopy)) return;
    history.push({ timestamp: Date.now(), rowCount: data.length, data: currentDataCopy });
    if (history.length > 15) history.shift();
    localStorage.setItem('translationHistory', JSON.stringify(history));
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

    // DÁN (PASTE) THÔNG MINH
    tbody.addEventListener('paste', (e) => {
        const targetCell = e.target.closest('td');
        if (!targetCell) return;

        const clipboardText = (e.originalEvent || e).clipboardData.getData('text/plain');
        if (!clipboardText) return;

        const cleanText = clipboardText.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').normalize('NFC');
        let lines = cleanText.split(/\r\n|\r|\n|\u2028|\u2029/).map(line => line.trim()).filter(line => line !== '');

        if (lines.length <= 1 && !cleanText.includes('\t')) {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            const textNode = document.createTextNode(cleanText);
            selection.getRangeAt(0).insertNode(textNode);
            selection.getRangeAt(0).setStartAfter(textNode);
            selection.getRangeAt(0).setEndAfter(textNode);
            targetCell.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        e.preventDefault();
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
        
        saveEditorUndoState();
        if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

        const tr = targetCell.closest('tr');
        let startRowIndex = Array.from(tbody.children).indexOf(tr);
        const colIndex = Array.from(tr.children).indexOf(targetCell);

        for (let i = 0; i < lines.length; i++) {
            const textLine = lines[i];
            const rowIndex = startRowIndex + i;
            const cells = textLine.split('\t');

            while (rowIndex >= data.length) {
                data.push(createEmptyRow());
            }

            let rawUpdated = false;
            let pinyinUpdated = false;

            for (let j = 0; j < cells.length; j++) {
                const targetColIdx = colIndex + j;
                if (targetColIdx >= 6) break; 
                const cellValue = normalizeUnicodeText(cells[j].trim());
                data[rowIndex][columns[targetColIdx]] = cellValue;
                
                if (targetColIdx === 0) rawUpdated = true;
                if (targetColIdx === 1 && cellValue !== '') pinyinUpdated = true;
            }

            if (rawUpdated) {
                const rawVal = data[rowIndex]['raw'].replace(/<[^>]+>/g, '').normalize('NFC');
                if (!pinyinUpdated && typeof safePinyin === 'function') {
                    data[rowIndex]['pinyin'] = safePinyin(rawVal);
                }
                if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined') {
                    const result = nameQTEngine.process(rawVal);
                    data[rowIndex]['qt'] = result.text.normalize('NFC');
                    rowTokensMap[rowIndex] = result.tokens;
                }
            }
        }
        
        renderTable();
        debounceSave();
    });

    // NHẬP LIỆU GÕ TAY REAL-TIME
    tbody.addEventListener('input', (e) => {
        const targetCell = e.target.closest('td');
        if (!targetCell) return;
        const tr = targetCell.closest('tr');
        const rowIndex = Array.from(tbody.children).indexOf(tr);
        const colIndex = Array.from(tr.children).indexOf(targetCell);

        handleEditorTypingInput();
        const plainText = normalizeUnicodeText(targetCell.innerText);
        data[rowIndex][columns[colIndex]] = targetCell.innerHTML;

        if (colIndex === 0) {
            if (typeof safePinyin === 'function') {
                data[rowIndex]['pinyin'] = safePinyin(plainText);
                if (tr.children[1]) tr.children[1].innerText = data[rowIndex]['pinyin'];
            }

            if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined') {
                const result = nameQTEngine.process(plainText);
                data[rowIndex]['qt'] = result.text.normalize('NFC');
                if (tr.children[4]) tr.children[4].innerText = result.text.normalize('NFC');
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
                    const newRow = createEmptyRow();
                    data.push(newRow);
                    appendRowToDOM(newRow, 0);
                }
                currentRowIndex = -1;
                selectedRowIndices = [];
                debounceSave();
                showToast(`🗑️ Đã xóa ${count} hàng!`, 'var(--btn-danger)');
            }
        }
    });

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

    // Copy Cột
    document.querySelectorAll('.col-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const colKey = btn.getAttribute('data-col');
            const format = btn.getAttribute('data-format');
            let plainArray = [];

            data.forEach((row) => {
                const plainText = (row[colKey] || '').replace(/<[^>]+>/g, '').trim();
                if (plainText) plainArray.push(plainText);
            });

            if (plainArray.length === 0) {
                showToast('⚠️ Cột này đang trống!', 'var(--btn-warning)');
                return;
            }

            const sepPlain = format === 'story' ? '\r\n\r\n' : '\n';
            try {
                await navigator.clipboard.writeText(plainArray.join(sepPlain));
                showToast(`✅ Đã copy cột ${colKey.toUpperCase()}!`, 'var(--btn-success)');
            } catch (err) {
                showToast('❌ Không thể truy cập Clipboard!', 'var(--btn-danger)');
            }
        });
    });

    // Copy Bản bê ta
    document.getElementById('btn-copy')?.addEventListener('click', async (e) => {
        e.preventDefault();
        let plainArray = [];
        data.forEach(row => {
            const plainText = (row.edit || '').replace(/<[^>]+>/g, '').trim();
            if (plainText) plainArray.push(plainText);
        });

        if (plainArray.length === 0) {
            showToast('⚠️ Cột Bản bê ta đang trống!', 'var(--btn-warning)');
            return;
        }

        try {
            await navigator.clipboard.writeText(plainArray.join('\r\n\r\n'));
            showToast('✅ Đã sao chép chương Bản bê ta!', 'var(--btn-success)');
        } catch (err) {
            showToast('❌ Không thể copy!', 'var(--btn-danger)');
        }
    });

    // Các nút bấm Ribbon
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

    // =========================================================================
    // KHÔI PHỤC PHÍM TẮT BÀN PHÍM TOÀN DIỆN (CTRL+Z, CTRL+Y, CTRL+SHIFT+Z,...)
    // =========================================================================
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            
            // Phím tắt Hoàn tác: Ctrl + Z
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (activeTab === 'edit-tool') {
                    editorUndo();
                } else if (typeof metaUndo === 'function') {
                    metaUndo();
                }
            } 
            // Phím tắt Làm lại: Ctrl + Y HOẶC Ctrl + Shift + Z
            else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                if (activeTab === 'edit-tool') {
                    editorRedo();
                } else if (typeof metaRedo === 'function') {
                    metaRedo();
                }
            } 
            // Phím tắt Định dạng
            else if (key === 'b' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('bold');
            } else if (key === 'i' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('italic');
            } else if (key === 'u' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('underline');
            }
        }
    });

    // Xuất/Nhập file
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