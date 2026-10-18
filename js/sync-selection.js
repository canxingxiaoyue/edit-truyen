// =========================================================================
// ĐỒNG BỘ TÔ SÁNG HAI CHIỀU (RAW ↔ QT) - PHIÊN BẢN BỌC THÉP (BULLETPROOF)
// Khắc phục triệt để lỗi khi người dùng bôi đen kéo lố hoặc chọn nguyên ô
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

// Lấy tọa độ ký tự an toàn tuyệt đối (Bất chấp HTML bên trong hay chọn nguyên ô)
function getSafeTextOffset(cell, range) {
    try {
        const preRange = document.createRange();
        preRange.selectNodeContents(cell);
        preRange.setEnd(range.startContainer, range.startOffset);
        return preRange.toString().length;
    } catch (e) {
        return -1;
    }
}

// Tô màu an toàn (Tìm đúng Node chữ để tô, không làm vỡ HTML bảng)
function applyHighlightSafe(cell, startPos, endPos) {
    if (!cell || startPos < 0 || endPos <= startPos) return;
    clearSyncHighlights();

    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
    let currentPos = 0;
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;

    let node;
    while ((node = walker.nextNode())) {
        const len = node.nodeValue.length;
        if (!startNode && startPos >= currentPos && startPos < currentPos + len) {
            startNode = node;
            startOffset = startPos - currentPos;
        }
        if (endPos > currentPos && endPos <= currentPos + len) {
            endNode = node;
            endOffset = endPos - currentPos;
            break;
        }
        currentPos += len;
    }

    if (!startNode || !endNode) return;

    try {
        const hlRange = document.createRange();
        hlRange.setStart(startNode, startOffset);
        hlRange.setEnd(endNode, endOffset);

        if (typeof CSS !== 'undefined' && CSS.highlights) {
            CSS.highlights.set('sync-highlight', new Highlight(hlRange));
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

        const selectedText = selection.toString().trim();
        if (!selectedText) {
            clearSyncHighlights();
            return;
        }

        // [SỬA LỖI CHÍNH]: Dò tìm ô TD chứa chữ, xử lý cả trường hợp kéo chuột lố ra ngoài
        let focusNode = selection.focusNode;
        let anchorNode = selection.anchorNode;
        
        let targetNode = focusNode.nodeType === 3 ? focusNode.parentNode : focusNode;
        let sourceTd = targetNode.closest('td[data-col]');
        
        // Nếu focus trượt, thử lại với điểm bắt đầu (anchor)
        if (!sourceTd) {
            targetNode = anchorNode.nodeType === 3 ? anchorNode.parentNode : anchorNode;
            sourceTd = targetNode.closest('td[data-col]');
        }

        if (!sourceTd) {
            clearSyncHighlights();
            return;
        }

        const colKey = sourceTd.dataset.col;
        if (colKey !== 'qt' && colKey !== 'raw') {
            clearSyncHighlights();
            return;
        }

        const tr = sourceTd.closest('tr');
        const rawTd = tr.querySelector('td[data-col="raw"]');
        const qtTd = tr.querySelector('td[data-col="qt"]');
        if (!rawTd || !qtTd) return;

        const isRawSource = (colKey === 'raw');
        const targetTd = isRawSource ? qtTd : rawTd;
        
        // Lấy tọa độ bôi đen thuần túy
        const selStart = getSafeTextOffset(sourceTd, selection.getRangeAt(0));
        if (selStart === -1) return;
        const selEnd = selStart + selection.toString().length;

        // Xử lý nạp Token
        const rowIndex = Array.from(tr.parentElement.children).indexOf(tr);
        let tokens = (typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) ? rowTokensMap[rowIndex] : null;
        
        if (!tokens && typeof nameQTEngine !== 'undefined') {
            const rawClean = (rawTd.innerText || rawTd.textContent || '').replace(/<[^>]+>/g, '').normalize('NFC');
            tokens = nameQTEngine.process(rawClean).tokens;
            if (typeof rowTokensMap !== 'undefined') rowTokensMap[rowIndex] = tokens;
        }

        if (!tokens || tokens.length === 0) return;

        // TÍNH TOÁN ÁNH XẠ TOÁN HỌC CHUẨN XÁC
        let targetStart = -1;
        let targetEnd = -1;
        let rawCursor = 0;
        let qtCursor = 0;

        for (const tok of tokens) {
            const rLen = (tok.orig || tok.raw || tok.cn || '').length;
            const qLen = (tok.text || tok.qt || tok.vi || '').length;

            const rStart = rawCursor;
            const rEnd = rawCursor + rLen;
            const qStart = qtCursor;
            const qEnd = qtCursor + qLen;

            if (isRawSource) { // Quét RAW -> Phát sáng QT
                if (selStart < rEnd && selEnd > rStart) { // Có chạm vào vùng chọn
                    if (targetStart === -1) targetStart = qStart;
                    targetEnd = qEnd; 
                }
            } else { // Quét QT -> Phát sáng RAW
                if (selStart < qEnd && selEnd > qStart) {
                    if (targetStart === -1) targetStart = rStart;
                    targetEnd = rEnd; 
                }
            }

            rawCursor = rEnd;
            qtCursor = qEnd;
        }

        // Thực thi tô sáng
        if (targetStart !== -1 && targetEnd > targetStart) {
            applyHighlightSafe(targetTd, targetStart, targetEnd);
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