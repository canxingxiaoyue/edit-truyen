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

// =========================================================================
// QUẢN LÝ LỊCH SỬ DỊCH: KHÔNG GIỚI HẠN BẢN GHI / NGÀY - GIỮ NGUYÊN VĨNH VIỄN
// =========================================================================
function addEditorHistoryEntry() {
    try {
        let history = JSON.parse(localStorage.getItem('translationHistory')) || [];
        const currentDataCopy = JSON.parse(JSON.stringify(data));

        // Tránh tạo bản ghi trùng lặp liên tiếp nếu dữ liệu chưa có thay đổi
        if (history.length > 0 && JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentDataCopy)) {
            return;
        }

        // Tạo record mới độc lập, không ghi đè record cũ, không giới hạn số lượng hay số ngày
        history.push({ 
            timestamp: Date.now(), 
            rowCount: data.length, 
            data: currentDataCopy 
        });

        // Không dùng shift(), slice(), splice(), prune() - Dữ liệu giữ vĩnh viễn cho đến khi chủ động xóa
        try {
            localStorage.setItem('translationHistory', JSON.stringify(history));
        } catch (storageErr) {
            if (storageErr.name === 'QuotaExceededError' || storageErr.code === 22 || storageErr.code === 1014) {
                console.warn("⚠️ Bộ nhớ trình duyệt (localStorage) đã đầy dung lượng vật lý!");
                if (typeof showToast === 'function') {
                    showToast("⚠️ Dung lượng lưu trữ của trình duyệt đã đầy, hãy chủ động xóa bớt lịch sử cũ!", "var(--btn-warning)");
                }
            } else {
                console.error("Lỗi khi lưu lịch sử dịch vào localStorage:", storageErr);
            }
        }
    } catch (e) {
        console.error("Lỗi addEditorHistoryEntry:", e);
    }
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
    // DÁN BẢNG THÔNG MINH (SMART TABLE PASTE - CHỐNG LỆCH HÀNG & GIỮ XUỐNG DÒNG Ô)
    // =========================================================================
    tbody.addEventListener('paste', (e) => {
        const targetCell = e.target.closest('td');
        if (!targetCell) return;

        const clipboard = (e.originalEvent || e).clipboardData;
        if (!clipboard) return;

        const htmlData = clipboard.getData('text/html');
        const textData = clipboard.getData('text/plain') || '';

        let tableMatrix = [];

        // 1. ƯU TIÊN PHÂN TÍCH BẢNG HTML (KHI COPY TỪ BẢNG CHATGPT, WEB, WORD, GOOGLE DOCS)
        if (htmlData && (htmlData.includes('<tr') || htmlData.includes('<td') || htmlData.includes('<table'))) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlData, 'text/html');
                const trElements = doc.querySelectorAll('tr');

                if (trElements.length > 0) {
                    trElements.forEach(tr => {
                        const cellNodes = tr.querySelectorAll('td, th');
                        const rowCells = [];

                        cellNodes.forEach(cell => {
                            // Chuyển các thẻ ngắt dòng bên trong ô thành \n thực tế
                            let inner = cell.innerHTML
                                .replace(/<br\s*[\/]?>/gi, '\n')
                                .replace(/<\/div>\s*<div>/gi, '\n')
                                .replace(/<div[^>]*>/gi, '\n')
                                .replace(/<\/div>/gi, '')
                                .replace(/<p[^>]*>/gi, '\n')
                                .replace(/<\/p>/gi, '')
                                .replace(/&nbsp;/gi, ' ');

                            const temp = document.createElement('div');
                            temp.innerHTML = inner;
                            let val = (temp.textContent || temp.innerText || '').trim();
                            val = val.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                            rowCells.push(val);
                        });

                        // Tự động bỏ qua dòng tiêu đề nếu người dùng copy cả header
                        const firstCell = (rowCells[0] || '').toLowerCase();
                        const isHeader = firstCell.includes('raw') || firstCell.includes('giản thể') || firstCell === 'tiếng trung';

                        if (!isHeader && rowCells.length > 0 && rowCells.some(c => c !== '')) {
                            tableMatrix.push(rowCells);
                        }
                    });
                }
            } catch (err) {
                console.warn("Lỗi parse bảng HTML:", err);
            }
        }

        // 2. NẾU KHÔNG CÓ BẢNG HTML -> PHÂN TÍCH VĂN BẢN PLAIN TEXT (HỖ TRỢ NGOẶC KÉP EXCEL/TSV)
        if (tableMatrix.length === 0 && textData) {
            const clean = textData.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '').normalize('NFC');
            const rows = [];
            let currentRow = [];
            let currentCell = '';
            let insideQuotes = false;

            for (let i = 0; i < clean.length; i++) {
                const char = clean[i];
                const nextChar = clean[i + 1];

                if (char === '"') {
                    if (insideQuotes && nextChar === '"') {
                        currentCell += '"';
                        i++;
                    } else {
                        insideQuotes = !insideQuotes;
                    }
                } else if (char === '\t' && !insideQuotes) {
                    currentRow.push(currentCell.trim());
                    currentCell = '';
                } else if ((char === '\r' || char === '\n') && !insideQuotes) {
                    if (char === '\r' && nextChar === '\n') i++;
                    currentRow.push(currentCell.trim());
                    if (currentRow.some(c => c !== '')) {
                        rows.push(currentRow);
                    }
                    currentRow = [];
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
            if (currentCell || currentRow.length > 0) {
                currentRow.push(currentCell.trim());
                if (currentRow.some(c => c !== '')) {
                    rows.push(currentRow);
                }
            }

            // Bỏ qua dòng tiêu đề nếu có
            if (rows.length > 0) {
                const f = (rows[0][0] || '').toLowerCase();
                if (f.includes('raw') || f.includes('giản thể') || f === 'tiếng trung') {
                    rows.shift();
                }
            }
            tableMatrix = rows;
        }

        // 3. NẾU CHỈ LÀ DÁN 1 Ô VĂN BẢN ĐƠN LẺ
        if (tableMatrix.length <= 1 && (!tableMatrix[0] || tableMatrix[0].length <= 1) && !textData.includes('\t')) {
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
            return;
        }

        // 4. ÁP DỤNG MA TRẬN BẢNG VÀO CÁC CỘT CHUẨN XÁC
        if (tableMatrix.length > 0) {
            e.preventDefault();
            if (typeof clearSyncHighlights === 'function') clearSyncHighlights();
            
            saveEditorUndoState();
            if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

            const tr = targetCell.closest('tr');
            let startRowIndex = Array.from(tbody.children).indexOf(tr);
            const colIndex = Array.from(tr.children).indexOf(targetCell);

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
                    // Chuyển ký tự xuống dòng \n thành thẻ <br> để ô hiển thị đúng nhiều dòng
                    const displayHtml = normalizeUnicodeText(rawVal).replace(/\n/g, '<br>');
                    data[rowIndex][columns[targetColIdx]] = displayHtml;

                    if (targetColIdx === 0) rawUpdated = true;
                    if (targetColIdx === 1 && rawVal.trim() !== '') pinyinUpdated = true;
                }

                // Tự động phiên âm Pinyin và QT nếu cột Raw có dữ liệu mới
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
            showToast(`📋 Đã dán thành công ${tableMatrix.length} hàng khớp chuẩn nội dung!`, 'var(--btn-success)');
        }
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

    // =========================================================================
    // HÀM TRÍCH XUẤT NỘI DUNG Ô (GIỮ NGUYÊN XUỐNG DÒNG BÊN TRONG Ô)
    // =========================================================================
    function extractCellContent(html) {
        if (!html) return '';
        let str = String(html);

        str = str
            .replace(/<br\s*[\/]?>/gi, '\n')
            .replace(/<\/div>\s*<div>/gi, '\n')
            .replace(/<div[^>]*>/gi, '\n')
            .replace(/<\/div>/gi, '')
            .replace(/<p[^>]*>/gi, '\n')
            .replace(/<\/p>/gi, '')
            .replace(/&nbsp;/gi, ' ');

        const temp = document.createElement('div');
        temp.innerHTML = str;
        let plain = temp.textContent || temp.innerText || '';

        plain = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        return plain.trim();
    }

    // =========================================================================
    // HÀM SAO CHÉP KÉP (XUẤT ĐỒNG THỜI HTML VÀ PLAIN TEXT CHO WATTPAD & WORD)
    // =========================================================================
    async function copyAdvancedToClipboard(textBlocks, successMsg) {
        if (!textBlocks || textBlocks.length === 0) {
            showToast('⚠️ Cột này đang trống!', 'var(--btn-warning)');
            return;
        }

        const plainText = textBlocks.join('\r\n\r\n');

        const htmlText = textBlocks.map(block => {
            const safeHtml = block
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            return `<p>${safeHtml}</p>`;
        }).join('<p><br></p>');

        try {
            if (navigator.clipboard && window.ClipboardItem) {
                const textBlob = new Blob([plainText], { type: 'text/plain' });
                const htmlBlob = new Blob([htmlText], { type: 'text/html' });
                const clipboardItem = new ClipboardItem({
                    'text/plain': textBlob,
                    'text/html': htmlBlob
                });
                await navigator.clipboard.write([clipboardItem]);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(plainText);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = plainText;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            showToast(successMsg, 'var(--btn-success)');
        } catch (err) {
            try {
                await navigator.clipboard.writeText(plainText);
                showToast(successMsg, 'var(--btn-success)');
            } catch (e) {
                console.error('Lỗi sao chép:', err);
                showToast('❌ Không thể truy cập bộ nhớ tạm!', 'var(--btn-danger)');
            }
        }
    }

    // =========================================================================
    // COPY TOÀN BỘ CỘT (CÓ DÒNG TRẮNG CÁCH BIỆT TRÊN WATTPAD)
    // =========================================================================
    document.querySelectorAll('.col-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const colKey = btn.getAttribute('data-col');
            if (!colKey) return;

            const textBlocks = [];
            data.forEach((row) => {
                const text = extractCellContent(row[colKey]);
                if (text !== '') {
                    textBlocks.push(text);
                }
            });

            if (textBlocks.length === 0) {
                showToast(`⚠️ Cột ${colKey.toUpperCase()} đang trống!`, 'var(--btn-warning)');
                return;
            }

            await copyAdvancedToClipboard(textBlocks, `✅ Đã copy cột ${colKey.toUpperCase()}!`);
        });
    });

    // =========================================================================
    // COPY TRỌN BỘ BẢN BÊ TA (CÓ DÒNG TRẮNG CÁCH BIỆT TRÊN WATTPAD)
    // =========================================================================
    document.getElementById('btn-copy')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const textBlocks = [];

        data.forEach(row => {
            const text = extractCellContent(row.edit);
            if (text !== '') {
                textBlocks.push(text);
            }
        });

        if (textBlocks.length === 0) {
            showToast('⚠️ Cột Bản bê ta đang trống!', 'var(--btn-warning)');
            return;
        }

        await copyAdvancedToClipboard(textBlocks, '✅ Đã sao chép chương Bản bê ta!');
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

    // Khôi phục phím tắt bàn phím toàn diện (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z,...)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (activeTab === 'edit-tool') {
                    editorUndo();
                } else if (typeof metaUndo === 'function') {
                    metaUndo();
                }
            } 
            else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                if (activeTab === 'edit-tool') {
                    editorRedo();
                } else if (typeof metaRedo === 'function') {
                    metaRedo();
                }
            } 
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

// THUẬT TOÁN ĐẾM TỪ SIÊU TỐC
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