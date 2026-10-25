// =========================================================================
// QUẢN LÝ TÌM KIẾM VÀ THAY THẾ CHUẨN XÁC
// =========================================================================

// 1. MỞ VÀ ĐÓNG MODAL TÌM & THAY THẾ
function openReplaceModal() {
    const modalReplace = document.getElementById('modal-replace');
    if (!modalReplace) return;

    modalReplace.classList.add('show');

    // Tự động lấy chữ đang bôi đen trên bảng dịch đưa vào ô tìm kiếm
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    const findInput = document.getElementById('find-text');

    if (findInput) {
        if (selectedText && !selectedText.includes('\n') && selectedText.length < 60) {
            findInput.value = selectedText;
        }
        setTimeout(() => {
            findInput.focus();
            findInput.select();
        }, 100);
    }
}

function closeReplaceModal() {
    const modalReplace = document.getElementById('modal-replace');
    if (modalReplace) {
        modalReplace.classList.remove('show');
    }
}

// 2. TÔ SÁNG TẤT CẢ KẾT QUẢ
function runHighlightAll() {
    const findText = document.getElementById('find-text')?.value;
    const regex = buildFindRegex(
        findText,
        document.getElementById('opt-regex')?.checked,
        document.getElementById('opt-match-case')?.checked,
        document.getElementById('opt-whole-word')?.checked,
        document.getElementById('opt-ignore-punc')?.checked,
        document.getElementById('opt-ignore-space')?.checked
    );
    if (!regex) return;

    const targetIndices = document.getElementById('opt-search-selection')?.checked && typeof selectedRowIndices !== 'undefined' && selectedRowIndices.length > 0
        ? selectedRowIndices
        : (typeof data !== 'undefined' ? data.map((_, idx) => idx) : []);

    let highlightedCount = 0;
    const colTarget = document.getElementById('replace-column')?.value || 'all';

    if (typeof saveEditorUndoState === 'function') saveEditorUndoState();

    targetIndices.forEach(rowIndex => {
        const cols = colTarget === 'all' ? (typeof columns !== 'undefined' ? columns : ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit']) : [colTarget];
        cols.forEach(col => {
            const originalHTML = data[rowIndex][col] || '';
            const highlightedHTML = highlightInHTMLString(originalHTML, regex);
            if (highlightedHTML !== originalHTML) {
                data[rowIndex][col] = highlightedHTML; 
                highlightedCount++;
            }
        });
    });

    if (highlightedCount > 0) {
        if (typeof renderTable === 'function') renderTable();
        if (typeof debounceSave === 'function') debounceSave();
        if (typeof showToast === 'function') showToast(`🖌️ Đã tô sáng kết quả tìm thấy!`, 'var(--btn-info)');
    } else {
        if (typeof showToast === 'function') showToast(`❌ Không tìm thấy kết quả phù hợp!`, 'var(--btn-danger)');
    }
}

// 3. XÓA SẠCH SPAN TÔ SÁNG KHỎI DATA
function clearAllHighlights() {
    if (typeof saveEditorUndoState === 'function') saveEditorUndoState();
    let cleared = false;

    if (typeof data !== 'undefined' && Array.isArray(data)) {
        const cols = typeof columns !== 'undefined' ? columns : ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
        data.forEach((row, rowIndex) => {
            cols.forEach(col => {
                if (row[col] && row[col].includes('search-highlight')) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = row[col];
                    const spans = tempDiv.querySelectorAll('.search-highlight');
                    spans.forEach(span => {
                        const parent = span.parentNode;
                        while (span.firstChild) parent.insertBefore(span.firstChild, span);
                        parent.removeChild(span);
                    });
                    data[rowIndex][col] = tempDiv.innerHTML;
                    cleared = true;
                }
            });
        });
    }

    if (cleared) {
        if (typeof renderTable === 'function') renderTable();
        if (typeof debounceSave === 'function') debounceSave();
        if (typeof showToast === 'function') showToast(`🧹 Đã xóa nhãn tô sáng!`, 'var(--btn-secondary)');
    } else {
        if (typeof showToast === 'function') showToast(`⚠️ Không có chữ nào đang được tô sáng!`, 'var(--btn-warning)');
    }
}

// 4. THAY THẾ TỪNG VỊ TRÍ TIẾP THEO (REPLACE NEXT)
function runReplaceNext() {
    const findText = document.getElementById('find-text')?.value;
    const replaceText = document.getElementById('replace-text')?.value || '';
    const regex = buildFindRegex(
        findText,
        document.getElementById('opt-regex')?.checked,
        document.getElementById('opt-match-case')?.checked,
        document.getElementById('opt-whole-word')?.checked,
        document.getElementById('opt-ignore-punc')?.checked,
        document.getElementById('opt-ignore-space')?.checked
    );
    if (!regex) return;

    const targetIndices = document.getElementById('opt-search-selection')?.checked && typeof selectedRowIndices !== 'undefined' && selectedRowIndices.length > 0
        ? selectedRowIndices
        : (typeof data !== 'undefined' ? data.map((_, idx) => idx) : []);

    let replaced = false;
    const casePreserve = document.getElementById('opt-case-preserve')?.checked;
    const replaceFn = (match) => {
        replaced = true;
        return casePreserve ? preserveCase(match, replaceText) : replaceText;
    };

    const colTarget = document.getElementById('replace-column')?.value || 'all';
    const colsList = typeof columns !== 'undefined' ? columns : ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];

    for (let rowIndex of targetIndices) {
        const cols = colTarget === 'all' ? colsList : [colTarget];
        for (let col of cols) {
            const originalHTML = data[rowIndex][col] || '';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = originalHTML;
            if (regex.test(tempDiv.textContent)) {
                let limit = 1;
                const limitedReplaceFn = (match) => {
                    if (limit > 0) { limit--; return replaceFn(match); }
                    return match;
                };
                const newHTML = replaceInHTMLString(originalHTML, regex, limitedReplaceFn);
                if (replaced) {
                    if (typeof saveEditorUndoState === 'function') saveEditorUndoState();
                    if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
                    
                    data[rowIndex][col] = newHTML;
                    
                    // Định vị an toàn ô bảng bằng selector data-col (chống lệch cột checkbox)
                    const cellElement = document.querySelector(`#table-body tr:nth-child(${rowIndex + 1}) td[data-col="${col}"]`);
                    if (cellElement) {
                        cellElement.innerHTML = newHTML;
                        cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    if (typeof debounceSave === 'function') debounceSave();
                    if (typeof showToast === 'function') showToast(`✔️ Đã thay thế thành công 1 vị trí!`, 'var(--btn-success)');
                    return;
                }
            }
        }
    }
    if (typeof showToast === 'function') showToast(`❌ Không tìm thấy kết quả nào khác!`, 'var(--btn-danger)');
}

// 5. THAY THẾ TOÀN BỘ (REPLACE ALL)
function runReplaceAll() {
    const findText = document.getElementById('find-text')?.value;
    const replaceText = document.getElementById('replace-text')?.value || '';
    const regex = buildFindRegex(
        findText,
        document.getElementById('opt-regex')?.checked,
        document.getElementById('opt-match-case')?.checked,
        document.getElementById('opt-whole-word')?.checked,
        document.getElementById('opt-ignore-punc')?.checked,
        document.getElementById('opt-ignore-space')?.checked
    );
    if (!regex) return;

    if (typeof saveEditorUndoState === 'function') saveEditorUndoState();
    if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();

    let replacedCount = 0;
    const casePreserve = document.getElementById('opt-case-preserve')?.checked;
    const replaceFn = (match) => {
        replacedCount++;
        return casePreserve ? preserveCase(match, replaceText) : replaceText;
    };

    const targetIndices = document.getElementById('opt-search-selection')?.checked && typeof selectedRowIndices !== 'undefined' && selectedRowIndices.length > 0
        ? selectedRowIndices
        : (typeof data !== 'undefined' ? data.map((_, idx) => idx) : []);
    
    const colTarget = document.getElementById('replace-column')?.value || 'all';
    const colsList = typeof columns !== 'undefined' ? columns : ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];

    targetIndices.forEach(rowIndex => {
        const cols = colTarget === 'all' ? colsList : [colTarget];
        cols.forEach(col => {
            const originalHTML = data[rowIndex][col] || '';
            const newHTML = replaceInHTMLString(originalHTML, regex, replaceFn);
            if (newHTML !== originalHTML) {
                data[rowIndex][col] = newHTML;
            }
        });
    });

    if (replacedCount > 0) {
        if (typeof renderTable === 'function') renderTable();
        if (typeof debounceSave === 'function') debounceSave();
        if (typeof showToast === 'function') showToast(`✔️ Đã thay thế toàn bộ ${replacedCount} vị trí!`, 'var(--btn-success)');
    } else {
        if (typeof showToast === 'function') showToast(`❌ Không tìm thấy kết quả nào để thay thế!`, 'var(--btn-danger)');
    }

    closeReplaceModal();
}

// 6. XÂY DỰNG REGEX TÌM KIẾM
function buildFindRegex(findText, useRegex, matchCase, wholeWord, ignorePunc, ignoreSpace) {
    if (!findText) return null;
    let pattern = findText;
    if (!useRegex) {
        pattern = findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        if (ignorePunc) pattern = pattern.split('').map(c => c + '[\\p{P}]*').join('');
        if (ignoreSpace) pattern = pattern.split('').map(c => c + '[\\s]*').join('');
    }
    if (wholeWord) pattern = `(?<!\\p{L})${pattern}(?!\\p{L})`;
    let flags = 'g';
    if (!matchCase) flags += 'i';
    flags += 'u';
    try { 
        return new RegExp(pattern, flags); 
    } catch (e) { 
        if (typeof showToast === 'function') {
            showToast("Lỗi Regex: " + e.message, "var(--btn-danger)");
        } else {
            alert("Lỗi Regex: " + e.message);
        }
        return null; 
    }
}

function preserveCase(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original === original.toLowerCase()) return replacement.toLowerCase();
    if (original[0] === original[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement;
}

function findAndReplaceInElement(element, regex, replaceFn) {
    const textNodes = [];
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    while (walk.nextNode()) textNodes.push(walk.currentNode);
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const node = textNodes[i];
        const oldText = node.nodeValue;
        const newText = oldText.replace(regex, replaceFn);
        if (newText !== oldText) node.nodeValue = newText;
    }
}

function replaceInHTMLString(htmlString, regex, replaceFn) {
    const div = document.createElement('div');
    div.innerHTML = htmlString;
    findAndReplaceInElement(div, regex, replaceFn);
    return div.innerHTML;
}

function highlightInHTMLString(htmlString, regex) {
    const div = document.createElement('div');
    div.innerHTML = htmlString;
    const textNodes = [];
    const walk = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
    while (walk.nextNode()) textNodes.push(walk.currentNode);

    for (let i = textNodes.length - 1; i >= 0; i--) {
        const node = textNodes[i];
        const text = node.nodeValue;
        if (regex.test(text)) {
            const tempSpan = document.createElement('span');
            const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            tempSpan.innerHTML = escaped.replace(regex, (match) => {
                return `<span class="search-highlight" style="background-color: #fde047; color: #000000; font-weight: bold; border-radius:2px;">${match}</span>`;
            });
            const parent = node.parentNode;
            while (tempSpan.firstChild) {
                parent.insertBefore(tempSpan.firstChild, node);
            }
            parent.removeChild(node);
        }
    }
    return div.innerHTML;
}

// =========================================================================
// 7. KHỞI TẠO VÀ GÁN SỰ KIỆN TẤT CẢ NÚT BẤM (ĐÃ BỔ SUNG ĐẦY ĐỦ)
// =========================================================================
function initSearchReplace() {
    // Nút mở modal trên toolbar
    const btnShow = document.getElementById('btn-replace-show');
    if (btnShow) {
        btnShow.onclick = (e) => {
            e.preventDefault();
            openReplaceModal();
        };
    }

    // Nút Hủy đóng modal
    const btnClose = document.getElementById('btn-close-modal');
    if (btnClose) {
        btnClose.onclick = (e) => {
            e.preventDefault();
            closeReplaceModal();
        };
    }

    // Đóng khi nhấp chuột ra ngoài khung modal
    const modalReplace = document.getElementById('modal-replace');
    if (modalReplace) {
        modalReplace.onclick = (e) => {
            if (e.target === modalReplace) {
                closeReplaceModal();
            }
        };
    }

    // Các nút thực thi thao tác
    const btnNext = document.getElementById('btn-replace-next');
    if (btnNext) btnNext.onclick = (e) => { e.preventDefault(); runReplaceNext(); };

    const btnAll = document.getElementById('btn-replace-all');
    if (btnAll) btnAll.onclick = (e) => { e.preventDefault(); runReplaceAll(); };

    const btnHl = document.getElementById('btn-highlight-all');
    if (btnHl) btnHl.onclick = (e) => { e.preventDefault(); runHighlightAll(); };

    const btnClearHl = document.getElementById('btn-clear-highlight');
    if (btnClearHl) btnClearHl.onclick = (e) => { e.preventDefault(); clearAllHighlights(); };

    // Phím tắt Ctrl+F mở nhanh modal, Escape để đóng
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag !== 'input' && activeTag !== 'textarea') {
                e.preventDefault();
                openReplaceModal();
            }
        } else if (e.key === 'Escape') {
            closeReplaceModal();
        }
    });
}

// Xuất các hàm ra toàn cục để app.js và HTML gọi được
window.initSearchReplace = initSearchReplace;
window.openReplaceModal = openReplaceModal;
window.closeReplaceModal = closeReplaceModal;
window.runReplaceNext = runReplaceNext;
window.runReplaceAll = runReplaceAll;
window.runHighlightAll = runHighlightAll;
window.clearAllHighlights = clearAllHighlights;

// Tự động khởi chạy an toàn khi trang sẵn sàng
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchReplace);
} else {
    initSearchReplace();
}