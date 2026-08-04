// =========================================================================
// QUẢN LÝ BẢNG DỊCH CHÍNH (MỤC 1) - TỐI ƯU HÓA HIỆU SUẤT & ĐỘ NHẠY 100%
// =========================================================================
let saveTimeout;

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
        
        // --- TÍCH HỢP ĐẾM TỪ ---
        updateWordCounts(); 

    }, 500);
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    // Tự động tạo 1 hàng trống nếu data bị rỗng
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
    
    data.forEach((row, idx) => {
        if (row.raw) {
            const rawVal = normalizeUnicodeText(row.raw.replace(/<[^>]+>/g, ''));
            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                const res = nameQTEngine.process(rawVal);
                rowTokensMap[idx] = res.tokens;
            }
        }
    });

    // --- TÍCH HỢP ĐẾM TỪ ---
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
    if (editorUndoStack.length > 0 && editorUndoStack[editorUndoStack.length - 1] === currentStateStr) {
        return; 
    }
    editorUndoStack.push(currentStateStr);
    if (editorUndoStack.length > 50) editorUndoStack.shift(); 
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
    showToast('↩️ Đã hoàn tác dịch thuật', 'var(--btn-info)');
}

function editorRedo() {
    if (editorRedoStack.length === 0) return;
    editorUndoStack.push(JSON.stringify(data));
    const nextState = JSON.parse(editorRedoStack.pop());
    data = nextState;
    renderTable();
    debounceSave();
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();
    showToast('🔁 Đã làm lại dịch thuật', 'var(--btn-info)');
}

function addEditorHistoryEntry() {
    let history = JSON.parse(localStorage.getItem('translationHistory')) || [];
    const currentDataCopy = JSON.parse(JSON.stringify(data));
    if (history.length > 0 && JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentDataCopy)) {
        return;
    }
    history.push({ timestamp: Date.now(), rowCount: data.length, data: currentDataCopy });
    if (history.length > 15) history.shift();
    localStorage.setItem('translationHistory', JSON.stringify(history));
}

// SỰ KIỆN VÀ TÍNH NĂNG BIÊN DỊCH CHÍNH
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

    // SỬA LỖI DÁN (PASTE) PHẢI ẤN 2 LẦN: ÉP CẬP NHẬT THẲNG VÀO BỘ NHỚ LÕI
    tbody.addEventListener('paste', (e) => {
        e.preventDefault(); // Ngăn trình duyệt tự ý dán làm kẹt con trỏ
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
        
        const targetCell = e.target.closest('td');
        if (!targetCell) return;
        
        const clipboardText = normalizeUnicodeText((e.originalEvent || e).clipboardData.getData('text/plain'));
        if (!clipboardText) return;

        const cleanText = clipboardText.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').normalize('NFC');
        let lines = cleanText.split(/\r\n|\r|\n|\u2028|\u2029/).map(line => line.trim()).filter(line => line !== '');
        if (lines.length === 0) return;

        saveEditorUndoState();
        if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

        const tr = targetCell.closest('tr');
        let startRowIndex = Array.from(tbody.children).indexOf(tr);
        const colIndex = Array.from(tr.children).indexOf(targetCell);

        // Ghi thẳng dữ liệu vào mảng Data (Không thao tác DOM thủ công nữa)
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
        
        // Ép vẽ lại toàn bộ bảng cực mượt (giải quyết bệnh phải ấn 2 lần)
        renderTable();
        debounceSave();
    });

    // NHẬP LIỆU GÕ TAY REAL-TIME
    tbody.addEventListener('input', (e) => {
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
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
                tr.children[1].innerText = data[rowIndex]['pinyin'];
            }

            if (!manualQTState[rowIndex] && typeof nameQTEngine !== 'undefined') {
                const result = nameQTEngine.process(plainText);
                data[rowIndex]['qt'] = result.text.normalize('NFC');
                tr.children[4].innerText = result.text.normalize('NFC');
                rowTokensMap[rowIndex] = result.tokens;
            }
        }

        if (colIndex === 4) {
            manualQTState[rowIndex] = true;
        }

        debounceSave();
    });

    tbody.addEventListener('focusin', (e) => {
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
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

    tbody.addEventListener('mousedown', (e) => {
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
        const tr = e.target.closest('tr');
        if (!tr) return;
        if (e.ctrlKey && e.shiftKey) {
            e.preventDefault(); 
            document.body.classList.add('selecting-rows'); 
            isDragSelecting = true;
            dragStartRowIdx = Array.from(tbody.children).indexOf(tr);
            tbody.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
            tr.classList.add('active-row');
            selectedRowIndices = [dragStartRowIdx];
            currentRowIndex = dragStartRowIdx;
        }
    });

    tbody.addEventListener('mouseover', (e) => {
        if (!isDragSelecting) return;
        const tr = e.target.closest('tr');
        if (!tr) return;
        const currentIdx = Array.from(tbody.children).indexOf(tr);
        if (currentIdx === -1) return;

        tbody.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
        const min = Math.min(dragStartRowIdx, currentIdx);
        const max = Math.max(dragStartRowIdx, currentIdx);
        selectedRowIndices = [];
        for (let i = min; i <= max; i++) {
            if (tbody.children[i]) {
                tbody.children[i].classList.add('active-row');
                selectedRowIndices.push(i);
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragSelecting) {
            isDragSelecting = false;
            dragStartRowIdx = -1;
            document.body.classList.remove('selecting-rows'); 
        }
    });

    document.getElementById('btn-add')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
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
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
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
                showToast(`🗑️ Đã xóa thành công ${count} hàng!`, 'var(--btn-danger)');
            }
        } else {
            alert("Vui lòng chọn hàng cần xóa!");
        }
    });

    // SỬA LỖI NÚT LÀM MỚI (RESET) PHẢI ẤN 2 LẦN
    document.getElementById('btn-reset')?.addEventListener('click', (e) => {
        e.preventDefault(); // Chặn sự kiện mặc định để tránh mất tiêu điểm
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
        
        if (confirm("⚠️ Xóa TOÀN BỘ dữ liệu trên bảng?")) {
            saveEditorUndoState();
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
            
            // Xóa sạch sẽ toàn bộ biến hệ thống
            data = [createEmptyRow()];
            currentRowIndex = -1;
            selectedRowIndices = [];
            manualQTState = {};
            rowTokensMap = {};
            
            // Ép giao diện vẽ lại ngay lập tức
            renderTable();
            localStorage.setItem('translationData', JSON.stringify(data));
            localStorage.setItem('manualQTState', JSON.stringify(manualQTState));
            showToast('🔄 Đã làm mới toàn bộ bảng!', 'var(--btn-warning)');
        }
    });

    // COPY TỪNG CỘT
    document.querySelectorAll('.col-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const colKey = btn.getAttribute('data-col');
            const format = btn.getAttribute('data-format');
            
            const tempDiv = document.createElement('div');
            let hasContent = false;
            let htmlArray = [];
            let plainArray = [];

            data.forEach((row, index) => {
                tempDiv.innerHTML = row[colKey] || '';
                const plainText = normalizeUnicodeText(tempDiv.innerText.trim());
                if (plainText !== "") hasContent = true;

                if (format === 'story') {
                    const isPrevEmpty = index === 0 || (function(){
                        const pDiv = document.createElement('div');
                        pDiv.innerHTML = data[index - 1][colKey] || '';
                        return pDiv.innerText.trim() === "";
                    })();
                    if (plainText === "" && isPrevEmpty) return;
                }

                if (format === 'story') {
                    htmlArray.push(`<div style="margin-bottom: 1.2em;">${row[colKey] || ''}</div>`);
                    plainArray.push(plainText);
                } else {
                    htmlArray.push(`<div>${row[colKey] || ''}</div>`);
                    plainArray.push(plainText);
                }
            });

            if (!hasContent) {
                showToast('⚠️ Cột này đang trống!', 'var(--btn-warning)');
                return;
            }

            const sepPlain = format === 'story' ? '\r\n\r\n' : '\n';
            const plainTextFull = normalizeUnicodeText(plainArray.join(sepPlain));
            const htmlTextFull = normalizeUnicodeText(htmlArray.join(''));

            try {
                if (navigator.clipboard && window.ClipboardItem) {
                    const htmlBlob = new Blob([htmlTextFull], { type: 'text/html' });
                    const plainBlob = new Blob([plainTextFull], { type: 'text/plain' });
                    const clipboardItem = new ClipboardItem({
                        'text/html': htmlBlob,
                        'text/plain': plainBlob
                    });
                    await navigator.clipboard.write([clipboardItem]);
                } else {
                    await navigator.clipboard.writeText(plainTextFull);
                }
                showToast(`✅ Đã copy cột ${colKey.toUpperCase()}!`, 'var(--btn-success)');
            } catch (err) {
                navigator.clipboard.writeText(plainTextFull).then(() => {
                    showToast(`✅ Đã copy cột ${colKey.toUpperCase()}!`, 'var(--btn-success)');
                }).catch(() => {
                    showToast('❌ Không thể truy cập Clipboard!', 'var(--btn-danger)');
                });
            }
        });
    });

    // COPY TRỌN BỘ BẢN BÊ TA
    document.getElementById('btn-copy')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const tempDiv = document.createElement('div');
        let hasContent = false;
        let htmlArray = [];
        let plainArray = [];

        data.forEach((row, index) => {
            tempDiv.innerHTML = row.edit || '';
            const plainText = normalizeUnicodeText(tempDiv.innerText.trim());
            if (plainText !== "") hasContent = true;

            const isPrevEmpty = index === 0 || (function(){
                const pDiv = document.createElement('div');
                pDiv.innerHTML = data[index - 1].edit || '';
                return pDiv.innerText.trim() === "";
            })();
            if (plainText === "" && isPrevEmpty) return;

            htmlArray.push(`<div style="margin-bottom: 1.2em;">${row.edit || ''}</div>`);
            plainArray.push(plainText);
        });

        if (!hasContent) {
            showToast('⚠️ Cột Bản bê ta đang trống!', 'var(--btn-warning)');
            return;
        }

        const plainTextFull = normalizeUnicodeText(plainArray.join('\r\n\r\n'));
        const htmlTextFull = normalizeUnicodeText(htmlArray.join(''));

        try {
            if (navigator.clipboard && window.ClipboardItem) {
                const htmlBlob = new Blob([htmlTextFull], { type: 'text/html' });
                const plainBlob = new Blob([plainTextFull], { type: 'text/plain' });
                const clipboardItem = new ClipboardItem({
                    'text/html': htmlBlob,
                    'text/plain': plainBlob
                });
                await navigator.clipboard.write([clipboardItem]);
            } else {
                await navigator.clipboard.writeText(plainTextFull);
            }
            showToast('✅ Đã sao chép chương Bản bê ta!', 'var(--btn-success)');
        } catch (err) {
            navigator.clipboard.writeText(plainTextFull).then(() => {
                showToast('✅ Đã sao chép chương Bản bê ta!', 'var(--btn-success)');
            }).catch(() => {
                showToast('❌ Không thể truy cập Clipboard!', 'var(--btn-danger)');
            });
        }
    });

    // TẢI FILE JSON TRUYỆN
    document.getElementById('btn-export')?.addEventListener('click', (e) => {
        e.preventDefault();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        let safeTitle = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') : "chuong_truyen";
        let fileName = safeTitle + "_" + new Date().getTime() + ".json";
        dlAnchor.setAttribute("download", fileName);
        dlAnchor.click();
        showToast(`💾 Đã tải file [ ${fileName} ] xuống máy!`, 'var(--btn-success)');
    });

    const fileInput = document.getElementById('file-input');
    document.getElementById('btn-import')?.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput?.click();
    });
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const importedData = JSON.parse(evt.target.result);
                if (Array.isArray(importedData)) {
                    saveEditorUndoState();
                    if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
                    data = importedData.map(row => {
                        if (typeof row.qt === 'undefined') row.qt = '';
                        return row;
                    });
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
        if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
        if (confirm("🔄 Bạn có muốn làm mới lại toàn bộ cột QT theo từ điển Name mới không? (Nội dung sửa tay sẽ được cập nhật lại)")) {
            refreshAllQT(true);
            showToast('🔄 Đã làm mới toàn bộ cột QT!', 'var(--btn-info)');
        }
    });

    // Lịch sử dịch
    document.getElementById('btn-history-show')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof openHistoryModal === 'function') {
            openHistoryModal('editor');
        }
    });

    // Đồng bộ bôi đen Real-time
    if (typeof handleSelectionSync === 'function') {
        document.addEventListener('mouseup', handleSelectionSync);
        document.addEventListener('keyup', handleSelectionSync);
    }

    // Các nút định dạng Ribbon Word
    document.getElementById('btn-undo')?.addEventListener('click', editorUndo);
    document.getElementById('btn-redo')?.addEventListener('click', editorRedo);
    document.getElementById('btn-bold')?.addEventListener('click', () => execFormat('bold'));
    document.getElementById('btn-italic')?.addEventListener('click', () => execFormat('italic'));
    document.getElementById('btn-underline')?.addEventListener('click', () => execFormat('underline'));
    document.getElementById('ribbon-forecolor')?.addEventListener('input', (e) => execFormat('foreColor', e.target.value));
    document.getElementById('ribbon-hilitecolor')?.addEventListener('input', (e) => execFormat('hiliteColor', e.target.value));
    document.getElementById('btn-align-left')?.addEventListener('click', () => execFormat('justifyLeft'));
    document.getElementById('btn-align-center')?.addEventListener('click', () => execFormat('justifyCenter'));
    document.getElementById('btn-align-right')?.addEventListener('click', () => execFormat('justifyRight'));
    
    document.getElementById('btn-clear-format')?.addEventListener('click', () => execFormat('removeFormat'));
    document.getElementById('btn-clear-highlight')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof clearAllHighlights === 'function') {
            clearAllHighlights(); 
        } else {
            renderTable(); 
            showToast(`🧹 Đã xóa nhãn tô sáng!`, 'var(--btn-secondary)');
        }
    });

    document.getElementById('ribbon-case')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;
        saveEditorUndoState();
        if (val === 'sentence') applySelectionTransform(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
        else if (val === 'lowercase') applySelectionTransform(s => s.toLowerCase());
        else if (val === 'uppercase') applySelectionTransform(s => s.toUpperCase());
        else if (val === 'capitalize') applySelectionTransform(s => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '));
        else if (val === 'toggle') applySelectionTransform(s => s.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(''));
        else if (val === 'half') applySelectionTransform(toHalfWidth);
        else if (val === 'full') applySelectionTransform(toFullWidth);
        e.target.value = ""; 
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'z') {
                e.preventDefault();
                if (activeTab === 'edit-tool') { editorUndo(); } else if (typeof metaUndo === 'function') { metaUndo(); }
            } else if (key === 'y') {
                e.preventDefault();
                if (activeTab === 'edit-tool') { editorRedo(); } else if (typeof metaRedo === 'function') { metaRedo(); }
            } else if (key === 'b' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('bold');
            } else if (key === 'i' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('italic');
            } else if (key === 'u' && activeTab === 'edit-tool') {
                e.preventDefault(); execFormat('underline');
            }
        }
    });

    document.getElementById('btn-replace-show')?.addEventListener('click', (e) => {
        e.preventDefault();
        const modalReplace = document.getElementById('modal-replace');
        if (modalReplace) {
            modalReplace.classList.add('show');
            document.getElementById('find-text')?.focus();
        }
    });
    
    document.getElementById('btn-highlight-all')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof runHighlightAll === 'function') runHighlightAll();
    });
    
    document.getElementById('btn-replace-next')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof runReplaceNext === 'function') runReplaceNext();
    });
    
    document.getElementById('btn-replace-all')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof runReplaceAll === 'function') runReplaceAll();
    });
}

function refreshAllQT(forceOverwrite = false) {
    data.forEach((row, idx) => {
        if (row.raw && (forceOverwrite || !manualQTState[idx])) {
            const rawVal = row.raw.replace(/<[^>]+>/g, '').normalize('NFC');
            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                const res = nameQTEngine.process(rawVal);
                data[idx]['qt'] = res.text.normalize('NFC');
                rowTokensMap[idx] = res.tokens;
            }
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

function applySelectionTransform(transformFn) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const transformedText = transformFn(range.toString());
    range.deleteContents();
    range.insertNode(document.createTextNode(transformedText));
    const activeCell = document.activeElement;
    if (activeCell && activeCell.closest('td')) {
        activeCell.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function toHalfWidth(str) {
    return str.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, ' ');
}

function toFullWidth(str) {
    return str.replace(/[\u0021-\u007E]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, '\u3000');
}

// =========================================================================
// HÀM ĐẾM SỐ TỪ VÀ KÝ TỰ REAL-TIME (CODE MỚI THÊM)
// =========================================================================
function updateWordCounts() {
    // Khởi tạo bộ đếm cho 6 cột
    let counts = {
        raw: { w: 0, c: 0 },
        pinyin: { w: 0, c: 0 },
        meaning: { w: 0, c: 0 },
        translation: { w: 0, c: 0 },
        qt: { w: 0, c: 0 },
        edit: { w: 0, c: 0 }
    };

    // Duyệt qua toàn bộ dữ liệu trong mảng data
    data.forEach(row => {
        columns.forEach(col => {
            if (row[col]) {
                // Lọc bỏ thẻ HTML (như <b>, <span>, <div>) để đếm text thật
                const plainText = row[col].replace(/<[^>]+>/g, '').trim();
                if (plainText) {
                    counts[col].c += plainText.length; // Đếm số ký tự

                    // Thuật toán đếm từ
                    if (col === 'raw' || col === 'qt') {
                        // Tiếng Trung: Đếm từng chữ Hán + các từ Latin (nếu có)
                        const cjk = plainText.match(/[\u4e00-\u9fa5]/g);
                        const latin = plainText.match(/[a-zA-Z0-9À-ỹ]+/g);
                        counts[col].w += (cjk ? cjk.length : 0) + (latin ? latin.length : 0);
                    } else {
                        // Tiếng Việt / Pinyin: Đếm theo cụm từ cách nhau bởi khoảng trắng
                        counts[col].w += plainText.split(/\s+/).filter(word => word.length > 0).length;
                    }
                }
            }
        });
    });

    // Cập nhật số liệu lên giao diện HTML
    columns.forEach(col => {
        const el = document.getElementById(`count-${col}`);
        if (el) {
            el.innerText = `${counts[col].w.toLocaleString('vi-VN')} từ`;
            el.title = `${counts[col].w.toLocaleString('vi-VN')} từ • ${counts[col].c.toLocaleString('vi-VN')} ký tự`;
        }
    });
}