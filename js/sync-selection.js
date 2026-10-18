// =========================================================================
// ĐỒNG BỘ TÔ SÁNG HAI CHIỀU (RAW ↔ QT) BẰNG THUẬT TOÁN TỌA ĐỘ TOKEN
// Chính xác 100% - Không phụ thuộc vào khoảng trắng hay dấu câu
// =========================================================================

let syncSelectionTimeout = null;

function clearSyncHighlights() {
    if (typeof CSS !== 'undefined' && CSS.highlights && CSS.highlights.has('sync-highlight')) {
        CSS.highlights.delete('sync-highlight');
    }
    const highlightedMarks = document.querySelectorAll('mark.sync-highlight');
    highlightedMarks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            mark.remove();
            parent.normalize(); 
        }
    });
}

// Hàm lấy tọa độ chính xác của vùng bôi đen (Dựa trên Text Nodes)
function getSelectionCharacterOffsets(element, range) {
    let start = 0, end = 0;
    let charCount = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
        if (node === range.startContainer) start = charCount + range.startOffset;
        if (node === range.endContainer) end = charCount + range.endOffset;
        charCount += node.nodeValue.length;
    }
    return { start, end };
}

// Hàm tô sáng dựa trên tọa độ bắt đầu và kết thúc
function highlightByOffsets(cellElement, startOffset, endOffset) {
    if (startOffset < 0 || endOffset <= startOffset || !cellElement) return;
    
    const walker = document.createTreeWalker(cellElement, NodeFilter.SHOW_TEXT, null, false);
    let currentPos = 0;
    let startNode = null, startNodeOffset = 0;
    let endNode = null, endNodeOffset = 0;
    let node;

    while ((node = walker.nextNode())) {
        const nodeLen = node.nodeValue.length;
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
    }

    if (!startNode || !endNode) return;

    try {
        const hlRange = document.createRange();
        hlRange.setStart(startNode, startNodeOffset);
        hlRange.setEnd(endNode, endNodeOffset);

        if (typeof CSS !== 'undefined' && CSS.highlights) {
            const hl = new Highlight(hlRange);
            CSS.highlights.set('sync-highlight', hl);
        } else {
            const mark = document.createElement('mark');
            mark.className = 'sync-highlight';
            hlRange.surroundContents(mark);
        }
    } catch (e) {}
}

function handleSelectionChangeSync() {
    clearTimeout(syncSelectionTimeout);
    syncSelectionTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            clearSyncHighlights();
            return;
        }

        let containerNode = selection.anchorNode;
        if (containerNode.nodeType === Node.TEXT_NODE) containerNode = containerNode.parentNode;
        
        const sourceTd = containerNode.closest('td');
        if (!sourceTd) {
            clearSyncHighlights();
            return;
        }

        const tr = sourceTd.closest('tr');
        if (!tr || tr.parentElement.id !== 'table-body') {
            clearSyncHighlights();
            return;
        }

        // Lấy đúng tên cột (tự tìm nếu thiếu data-col)
        let colKey = sourceTd.dataset.col;
        if (!colKey) {
            const dataTds = Array.from(tr.children).filter(c => !c.classList.contains('batch-select-cell'));
            colKey = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'][dataTds.indexOf(sourceTd)];
        }

        if (colKey !== 'qt' && colKey !== 'raw') {
            clearSyncHighlights();
            return;
        }

        clearSyncHighlights();

        const rawTd = tr.querySelector('td[data-col="raw"]') || Array.from(tr.children).find(c => c.dataset?.col === 'raw') || tr.children[1];
        const qtTd = tr.querySelector('td[data-col="qt"]') || Array.from(tr.children).find(c => c.dataset?.col === 'qt') || tr.children[5];
        if (!rawTd || !qtTd) return;

        const rowIndex = Array.from(tr.parentElement.children).indexOf(tr);

        // Lấy mảng Token từ bộ từ điển
        let tokens = (typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) ? rowTokensMap[rowIndex] : null;
        if (!tokens && typeof nameQTEngine !== 'undefined') {
            const rawClean = (rawTd.textContent || '').replace(/<[^>]+>/g, '').normalize('NFC');
            tokens = nameQTEngine.process(rawClean).tokens;
            if (typeof rowTokensMap !== 'undefined') rowTokensMap[rowIndex] = tokens;
        }

        if (!tokens || tokens.length === 0) return;

        const isRawSource = (colKey === 'raw');
        const targetTd = isRawSource ? qtTd : rawTd;
        
        // 1. Tính toán tọa độ của vùng đang bôi đen
        const { start: selStart, end: selEnd } = getSelectionCharacterOffsets(sourceTd, selection.getRangeAt(0));
        if (selStart === -1) return;

        let targetStart = -1;
        let targetEnd = -1;

        let rawCursor = 0;
        let qtCursor = 0;

        // 2. Thuật toán quét và chiếu tọa độ Token
        for (const tok of tokens) {
            const rLen = (tok.orig || tok.raw || tok.cn || '').length;
            const qLen = (tok.text || tok.qt || tok.vi || '').length;

            const rStart = rawCursor;
            const rEnd = rawCursor + rLen;
            const qStart = qtCursor;
            const qEnd = qtCursor + qLen;

            // Nếu đang bôi đen bên RAW
            if (isRawSource) {
                // Kiểm tra vùng bôi đen có chạm vào tọa độ của Raw không
                if (selStart < rEnd && selEnd > rStart) {
                    if (targetStart === -1) targetStart = qStart;
                    targetEnd = qEnd; 
                }
            } 
            // Nếu đang bôi đen bên QT
            else {
                // Kiểm tra vùng bôi đen có chạm vào tọa độ của QT không
                if (selStart < qEnd && selEnd > qStart) {
                    if (targetStart === -1) targetStart = rStart;
                    targetEnd = rEnd; 
                }
            }

            rawCursor = rEnd;
            qtCursor = qEnd;
        }

        // 3. Thực thi tô sáng ở ô đích
        if (targetStart !== -1 && targetEnd > targetStart) {
            highlightByOffsets(targetTd, targetStart, targetEnd);
        }

    }, 40);
}

function initSyncSelectionListeners() {
    document.addEventListener('selectionchange', handleSelectionChangeSync);
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#table-body')) clearSyncHighlights();
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