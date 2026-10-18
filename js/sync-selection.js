// =========================================================================
// ĐỒNG BỘ HIỆU ỨNG TÔ SÁNG ĐỐI CHIẾU THỜI GIAN THỰC (BẢN QT ↔ RAW)
// Tích hợp: Xử lý ngoại lệ Extension Dịch thuật & CSS Highlight API
// =========================================================================

let syncSelectionTimeout = null;

// Lấy thông tin vị trí ô đang tương tác
function getCellLocation(td) {
    if (!td) return null;
    const tr = td.closest('tr');
    if (!tr || !tr.parentElement || tr.parentElement.id !== 'table-body') return null;

    let colKey = td.dataset ? td.dataset.col : '';
    const allTds = Array.from(tr.children);

    if (!colKey) {
        const dataTds = allTds.filter(c => !c.classList.contains('batch-select-cell'));
        const idx = dataTds.indexOf(td);
        const COL_KEYS = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
        colKey = COL_KEYS[idx] || '';
    }

    const rowIndex = Array.from(tr.parentElement.children).indexOf(tr);
    return { tr, rowIndex, colKey, td };
}

// Xóa sạch vùng highlight ảo
function clearSyncHighlights() {
    // Xóa bằng API CSS hiện đại (Miễn nhiễm Extension)
    if (typeof CSS !== 'undefined' && CSS.highlights && CSS.highlights.has('sync-highlight')) {
        CSS.highlights.delete('sync-highlight');
    }

    // Fallback xóa thẻ span DOM
    const highlightedSpans = document.querySelectorAll('.sync-highlight');
    highlightedSpans.forEach(span => {
        const parent = span.parentNode;
        if (parent) {
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            span.remove();
            parent.normalize(); 
        }
    });
}

// Đếm số lần xuất hiện của chuỗi con trong chuỗi cha
function countOccurrences(mainStr, subStr) {
    if (subStr.length === 0) return 0;
    let n = 0, pos = 0;
    const step = subStr.length;
    while (true) {
        pos = mainStr.indexOf(subStr, pos);
        if (pos >= 0) {
            ++n;
            pos += step;
        } else break;
    }
    return n;
}

// Tìm vị trí của chuỗi xuất hiện lần thứ N
function indexOfNth(mainStr, subStr, nth) {
    let pos = -1;
    for (let i = 0; i <= nth; i++) {
        pos = mainStr.indexOf(subStr, pos + 1);
        if (pos === -1) return -1;
    }
    return pos;
}

// Lấy toàn bộ Text thuần túy (Bỏ qua rác HTML từ Extension chèn vào)
function getCleanTextContent(cell) {
    return (cell.textContent || cell.innerText || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
}

// Tô sáng chuỗi mục tiêu dựa vào chỉ số
function applyHighlight(cellElement, targetStr, occurrenceIndex) {
    if (!targetStr || !cellElement) return;

    const fullText = getCleanTextContent(cellElement);
    const startOffset = indexOfNth(fullText.toLowerCase(), targetStr.toLowerCase(), occurrenceIndex);
    
    if (startOffset === -1) return;
    const endOffset = startOffset + targetStr.length;

    const walker = document.createTreeWalker(cellElement, NodeFilter.SHOW_TEXT, null, false);
    let currentPos = 0;
    let startNode = null, startNodeOffset = 0;
    let endNode = null, endNodeOffset = 0;
    let node = walker.nextNode();

    while (node) {
        const nodeLen = node.textContent.length;
        const nextPos = currentPos + nodeLen;

        if (!startNode && startOffset >= currentPos && startOffset <= nextPos) {
            startNode = node;
            startNodeOffset = startOffset - currentPos;
        }
        if (endOffset >= currentPos && endOffset <= nextPos) {
            endNode = node;
            endNodeOffset = endOffset - currentPos;
            break;
        }
        currentPos = nextPos;
        node = walker.nextNode();
    }

    if (!startNode || !endNode) return;

    try {
        const range = document.createRange();
        range.setStart(startNode, startNodeOffset);
        range.setEnd(endNode, endNodeOffset);

        if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
            const hl = new Highlight(range);
            CSS.highlights.set('sync-highlight', hl);
            return;
        }

        const span = document.createElement('span');
        span.className = 'sync-highlight';
        range.surroundContents(span);
    } catch (err) {}
}

// XỬ LÝ SỰ KIỆN BÔI ĐEN CHÍNH
function handleSelectionChangeSync() {
    clearTimeout(syncSelectionTimeout);
    syncSelectionTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            clearSyncHighlights();
            return;
        }

        const selectedText = selection.toString().trim();
        if (!selectedText) {
            clearSyncHighlights();
            return;
        }

        const range = selection.getRangeAt(0);
        let containerNode = range.commonAncestorContainer;
        if (containerNode.nodeType === Node.TEXT_NODE) containerNode = containerNode.parentElement;
        const sourceTd = containerNode.closest('td');

        const cellInfo = getCellLocation(sourceTd);
        if (!cellInfo) {
            clearSyncHighlights();
            return;
        }

        const { tr, rowIndex, colKey } = cellInfo;
        if (colKey !== 'qt' && colKey !== 'raw') {
            clearSyncHighlights();
            return;
        }

        clearSyncHighlights(); // Xóa highlight cũ

        const rawTd = tr.querySelector('td[data-col="raw"]') || tr.children[1];
        const qtTd = tr.querySelector('td[data-col="qt"]') || tr.children[5];
        if (!rawTd || !qtTd) return;

        const isRawTarget = (colKey === 'qt'); // Nếu bôi đen QT thì muốn tô sáng Raw
        const targetTdEl = isRawTarget ? rawTd : qtTd;

        // Tính toán xem đoạn text được bôi đen xuất hiện lần thứ mấy trong ô hiện tại
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(sourceTd);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const textBeforeSelection = preSelectionRange.toString();
        const occurrenceIndex = countOccurrences(textBeforeSelection.toLowerCase(), selectedText.toLowerCase());

        // Lấy danh sách Token của hàng này
        let tokens = (typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) ? rowTokensMap[rowIndex] : null;
        if ((!tokens || tokens.length === 0) && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
            const rawClean = getCleanTextContent(rawTd);
            tokens = nameQTEngine.process(rawClean).tokens;
            if (typeof rowTokensMap !== 'undefined') rowTokensMap[rowIndex] = tokens;
        }

        let targetWord = "";

        // TẦNG 1: Dò tìm trong Token của máy dịch
        if (tokens) {
            for (let tok of tokens) {
                let cnStr = (tok.orig || tok.raw || tok.cn || '').trim();
                let viStr = (tok.text || tok.qt || tok.trans || tok.vi || '').trim();
                
                if (isRawTarget) { // Tìm từ Việt sang Trung
                    if (viStr && (viStr.toLowerCase().includes(selectedText.toLowerCase()) || selectedText.toLowerCase().includes(viStr.toLowerCase()))) {
                        targetWord = cnStr;
                        break;
                    }
                } else { // Tìm từ Trung sang Việt
                    if (cnStr && (cnStr.includes(selectedText) || selectedText.includes(cnStr))) {
                        targetWord = viStr;
                        break;
                    }
                }
            }
        }

        // TẦNG 2: Dò tìm trong Metadata (Nhân vật, Xưng hô, Từ ngữ) nếu Token trượt
        if (!targetWord && isRawTarget && typeof metadata !== 'undefined') {
            const cleanQuery = selectedText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '').trim();
            if (metadata.characters) {
                const f = metadata.characters.find(c => c.c2 && c.c2.toLowerCase().trim() === cleanQuery);
                if (f) targetWord = f.c1.trim();
            }
            if (!targetWord && metadata.terms) {
                const f = metadata.terms.find(t => t.c2 && t.c2.toLowerCase().trim() === cleanQuery);
                if (f) targetWord = f.c1.trim();
            }
        }

        // THỰC THI TÔ SÁNG
        if (targetWord) {
            applyHighlight(targetTdEl, targetWord, occurrenceIndex);
        }

    }, 50); // Timeout nhẹ để tránh spam khi kéo chuột
}

// Bắt sự kiện
function initSyncSelectionListeners() {
    document.addEventListener('selectionchange', handleSelectionChangeSync);
    
    // Khóa sự kiện mouseup để xóa highlight khi nhấp ra ngoài (ko can thiệp Extension)
    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            clearSyncHighlights();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') clearSyncHighlights();
    });
}

window.clearSyncHighlights = clearSyncHighlights;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncSelectionListeners);
} else {
    initSyncSelectionListeners();
}