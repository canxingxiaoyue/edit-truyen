// =========================================================================
// ĐỒNG BỘ HIỆU ỨNG TÔ SÁNG ĐỐI CHIẾU THỜI GIAN THỰC (BẢN QT ↔ RAW)
// TỐI ƯU HÓA TUYỆT ĐỐI CHO TỪ ĐIỂN TÙY CHỈNH SIÊU LỚN (Triệu từ)
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

// Xóa sạch vùng highlight cũ
function clearSyncHighlights() {
    if (typeof CSS !== 'undefined' && CSS.highlights && CSS.highlights.has('sync-highlight')) {
        CSS.highlights.delete('sync-highlight');
    }

    const highlightedSpans = document.querySelectorAll('.sync-highlight');
    highlightedSpans.forEach(span => {
        const parent = span.parentNode;
        if (parent) {
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            span.remove();
            parent.normalize(); 
        }
    });
}

// Tính toán vị trí ký tự đầu/cuối của vùng bôi đen
function getSelectionOffsetsWithin(element, range) {
    try {
        const preRange = range.cloneRange();
        preRange.selectNodeContents(element);
        preRange.setEnd(range.startContainer, range.startOffset);
        const start = preRange.toString().length;
        const end = start + range.toString().length;
        return { start, end };
    } catch (e) {
        return { start: -1, end: -1 };
    }
}

// Tạo thẻ bọc màu nền cho chuỗi tương ứng
function highlightTextRangeInCell(cellElement, startOffset, endOffset) {
    if (startOffset < 0 || endOffset <= startOffset || !cellElement) return;
    clearSyncHighlights();

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
        try {
            range.surroundContents(span);
        } catch (e) {
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
        }
    } catch (err) {}
}

// XỬ LÝ CHÍNH KHI NGƯỜI DÙNG BÔI ĐEN VĂN BẢN
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
        const containerNode = range.commonAncestorContainer;
        const sourceTd = containerNode.nodeType === Node.ELEMENT_NODE 
            ? containerNode.closest('td') 
            : containerNode.parentElement?.closest('td');

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

        const rawTd = tr.querySelector('td[data-col="raw"]');
        const qtTd = tr.querySelector('td[data-col="qt"]');
        if (!rawTd || !qtTd) return;

        const rawText = rawTd.textContent || '';
        const qtText = qtTd.textContent || '';
        if (!rawText || !qtText) return;

        // Lấy danh sách Token của hàng này (từ Name Engine)
        let tokens = (typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) ? rowTokensMap[rowIndex] : null;
        if ((!tokens || tokens.length === 0) && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
            const rawClean = rawText.replace(/<[^>]+>/g, '').normalize('NFC');
            tokens = nameQTEngine.process(rawClean).tokens;
            if (typeof rowTokensMap !== 'undefined') rowTokensMap[rowIndex] = tokens;
        }

        const isRawTarget = (colKey === 'qt'); // Đích tô sáng
        const sourceTdEl = isRawTarget ? qtTd : rawTd;
        const targetTdEl = isRawTarget ? rawTd : qtTd;

        const { start: selStart, end: selEnd } = getSelectionOffsetsWithin(sourceTdEl, range);
        if (selStart === -1 || selEnd === -1) return;

        let targetStart = -1;
        let targetEnd = -1;

        // =====================================================================
        // THUẬT TOÁN ĐỈNH CAO: CỘNG DỒN CON TRỎ THEO ĐỘ DÀI TOKEN CHUẨN XÁC 100%
        // =====================================================================
        if (tokens && tokens.length > 0) {
            let rCursor = 0; // Con trỏ chạy bên tiếng Trung
            let qCursor = 0; // Con trỏ chạy bên tiếng Việt (QT)

            for (const tok of tokens) {
                // Lấy chữ Trung và chữ Việt từ từ điển
                const rStr = tok.orig || tok.raw || tok.cn || '';
                // Lấy y nguyên chữ Việt (bao gồm cả khoảng trắng thừa do máy dịch tạo ra)
                const qStr = tok.text || tok.qt || tok.trans || tok.vi || '';

                // Xác định tọa độ của cục Token này
                const rStart = rCursor;
                const rEnd = rCursor + rStr.length;

                const qStart = qCursor;
                const qEnd = qCursor + qStr.length;

                // Nếu người dùng bôi đen Cột QT (isRawTarget = true)
                if (isRawTarget) {
                    // Kiểm tra vùng bôi đen có chạm vào tọa độ của cục Token này bên QT không
                    if (selStart < qEnd && selEnd > qStart) {
                        if (targetStart === -1) targetStart = rStart; // Mở điểm đầu bên Raw
                        targetEnd = rEnd; // Kéo giãn điểm cuối bên Raw
                    }
                } 
                // Nếu người dùng bôi đen Cột Raw
                else {
                    if (selStart < rEnd && selEnd > rStart) {
                        if (targetStart === -1) targetStart = qStart;
                        targetEnd = qEnd;
                    }
                }

                // Tịnh tiến con trỏ
                rCursor = rEnd;
                qCursor = qEnd;
            }
        }

        // TÔ SÁNG NẾU TÌM THẤY
        if (targetStart !== -1 && targetEnd > targetStart) {
            highlightTextRangeInCell(targetTdEl, targetStart, targetEnd);
        }

    }, 50);
}

// Bắt sự kiện
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