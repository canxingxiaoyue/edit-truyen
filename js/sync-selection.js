// =========================================================================
// ĐỒNG BỘ HIỆU ỨNG TÔ SÁNG ĐỐI CHIẾU THỜI GIAN THỰC (BẢN QT ↔ RAW)
// =========================================================================

let syncSelectionTimeout = null;

// HÀM TIỆN ÍCH LẤY DỮ LIỆU TỪ TOKEN ĐA DẠNG
function getTokenRawText(token) {
    if (!token) return '';
    if (typeof token === 'string') return token;
    return token.raw || token.orig || token.cn || token.chinese || token.src || token.source || token.word || '';
}

function getTokenTransText(token) {
    if (!token) return '';
    if (typeof token === 'string') return token;
    return token.qt || token.trans || token.vi || token.viet || token.text || token.target || token.meaning || '';
}

// XÓA SẠCH MỌI VÙNG ĐANG ĐƯỢC TÔ SÁNG TRÊN TOÀN BẢNG
function clearSyncHighlights() {
    // 1. Xóa CSS Custom Highlight API nếu trình duyệt hỗ trợ
    if (typeof CSS !== 'undefined' && CSS.highlights && CSS.highlights.has('sync-highlight')) {
        CSS.highlights.delete('sync-highlight');
    }

    // 2. Xóa các thẻ span highlight đã chèn trong DOM và làm liền mạch văn bản
    const highlightedSpans = document.querySelectorAll('.sync-highlight');
    highlightedSpans.forEach(span => {
        const parent = span.parentNode;
        if (parent) {
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            span.remove();
            parent.normalize(); // Nối liền các đoạn text node bị cắt
        }
    });
}

// LẤY CHỈ SỐ KÝ TỰ BẮT ĐẦU VÀ KẾT THÚC CỦA VÙNG BÔI ĐEN TRONG Ô
function getSelectionOffsetsWithinCell(cellElement, range) {
    let start = 0;
    let end = 0;
    try {
        const preRange = range.cloneRange();
        preRange.selectNodeContents(cellElement);
        preRange.setEnd(range.startContainer, range.startOffset);
        start = preRange.toString().length;
        end = start + range.toString().length;
    } catch (e) {
        start = -1;
        end = -1;
    }
    return { start, end };
}

// CĂN CHỈNH VỊ TRÍ TOKEN TRONG VĂN BẢN (DÙNG CON TRỎ TUẦN TỰ ĐỂ TRÁNH LẶP TỪ)
function alignTokensSequentially(tokens, fullText, isRawMode = false) {
    let searchCursor = 0;
    const lowerText = fullText.toLowerCase();

    return tokens.map((token, index) => {
        const targetStr = (isRawMode ? getTokenRawText(token) : getTokenTransText(token)).trim();
        if (!targetStr) {
            return { index, token, start: -1, end: -1, str: '' };
        }

        let idx = -1;
        if (isRawMode) {
            idx = fullText.indexOf(targetStr, searchCursor);
            if (idx === -1) idx = fullText.indexOf(targetStr);
        } else {
            idx = lowerText.indexOf(targetStr.toLowerCase(), searchCursor);
            if (idx === -1) idx = lowerText.indexOf(targetStr.toLowerCase());
        }

        const start = (idx !== -1) ? idx : searchCursor;
        const end = start + targetStr.length;
        if (idx !== -1) searchCursor = end;

        return {
            index,
            token,
            start,
            end,
            raw: getTokenRawText(token),
            trans: getTokenTransText(token)
        };
    });
}

// TÔ SÁNG ĐOẠN VĂN BẢN TRONG Ô BẰNG DOM RANGE MÀ KHÔNG LÀM MẤT VÙNG CHỌN
function applyHighlightToCell(cellElement, startOffset, endOffset) {
    if (startOffset < 0 || endOffset <= startOffset || !cellElement) return;

    // Tìm đúng TextNode chứa vị trí bắt đầu và kết thúc
    const walker = document.createTreeWalker(cellElement, NodeFilter.SHOW_TEXT, null, false);
    let currentNode = walker.nextNode();
    let currentPos = 0;

    let startNode = null;
    let startNodeOffset = 0;
    let endNode = null;
    let endNodeOffset = 0;

    while (currentNode) {
        const nodeLength = currentNode.textContent.length;
        const nextPos = currentPos + nodeLength;

        if (!startNode && startOffset >= currentPos && startOffset <= nextPos) {
            startNode = currentNode;
            startNodeOffset = startOffset - currentPos;
        }

        if (endOffset >= currentPos && endOffset <= nextPos) {
            endNode = currentNode;
            endNodeOffset = endOffset - currentPos;
            break;
        }

        currentPos = nextPos;
        currentNode = walker.nextNode();
    }

    if (!startNode || !endNode) return;

    try {
        const highlightRange = document.createRange();
        highlightRange.setStart(startNode, startNodeOffset);
        highlightRange.setEnd(endNode, endNodeOffset);

        // Ưu tiên sử dụng CSS Custom Highlight API hiện đại (Không chạm vào DOM)
        if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
            const hl = new Highlight(highlightRange);
            CSS.highlights.set('sync-highlight', hl);
            return;
        }

        // Phương án dự phòng cho trình duyệt cũ: Bọc an toàn bằng thẻ span
        const span = document.createElement('span');
        span.className = 'sync-highlight';
        try {
            highlightRange.surroundContents(span);
        } catch (e) {
            const fragment = highlightRange.extractContents();
            span.appendChild(fragment);
            highlightRange.insertNode(span);
        }
    } catch (e) {
        console.warn("Lỗi tạo vùng sáng:", e);
    }
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

        if (!sourceTd) {
            clearSyncHighlights();
            return;
        }

        const tr = sourceTd.closest('tr');
        if (!tr || !tr.parentElement || tr.parentElement.id !== 'table-body') {
            clearSyncHighlights();
            return;
        }

        const col = sourceTd.dataset.col;
        const rowIndex = Array.from(tr.parentElement.children).indexOf(tr);

        // Chỉ xử lý khi bôi đen tại cột Bản QT hoặc cột Raw
        if (rowIndex < 0 || (col !== 'qt' && col !== 'raw')) {
            clearSyncHighlights();
            return;
        }

        // Xóa highlight cũ trước khi tính toán highlight mới
        clearSyncHighlights();

        const rawTd = tr.querySelector('td[data-col="raw"]');
        const qtTd = tr.querySelector('td[data-col="qt"]');
        if (!rawTd || !qtTd) return;

        const rawText = rawTd.textContent || '';
        const qtText = qtTd.textContent || '';
        if (!rawText || !qtText) return;

        // Lấy danh sách Token của hàng này (hoặc tạo tức thì nếu chưa có)
        let tokens = (typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) ? rowTokensMap[rowIndex] : null;
        if ((!tokens || tokens.length === 0) && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
            const rawClean = rawText.replace(/<[^>]+>/g, '').normalize('NFC');
            const res = nameQTEngine.process(rawClean);
            tokens = res.tokens;
            if (typeof rowTokensMap !== 'undefined') rowTokensMap[rowIndex] = tokens;
        }

        // =====================================================================
        // TRƯỜNG HỢP 1: BÔI ĐEN CỘT BẢN QT ➔ TÔ SÁNG TIẾNG TRUNG TƯƠNG ỨNG TRONG RAW
        // =====================================================================
        if (col === 'qt') {
            const { start: selStart, end: selEnd } = getSelectionOffsetsWithinCell(qtTd, range);
            if (selStart === -1 || selEnd === -1) return;

            if (tokens && tokens.length > 0) {
                const alignedQT = alignTokensSequentially(tokens, qtText, false);
                const alignedRaw = alignTokensSequentially(tokens, rawText, true);

                // Tìm các token nằm trong vùng đang bôi đen
                const overlappingTokens = alignedQT.filter(t => t.start < selEnd && t.end > selStart && t.start !== -1);

                if (overlappingTokens.length > 0) {
                    const firstIdx = overlappingTokens[0].index;
                    const lastIdx = overlappingTokens[overlappingTokens.length - 1].index;

                    const targetRawStart = alignedRaw[firstIdx]?.start;
                    const targetRawEnd = alignedRaw[lastIdx]?.end;

                    if (typeof targetRawStart === 'number' && typeof targetRawEnd === 'number' && targetRawEnd > targetRawStart) {
                        applyHighlightToCell(rawTd, targetRawStart, targetRawEnd);
                        return;
                    }
                }
            }

            // TẦNG 2 DỰ PHÒNG: Tra cứu bảng Nhân vật & Thuật ngữ nếu token chưa khớp
            const queryClean = selectedText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '').trim();
            let matchedChinese = '';

            // Tra cứu trong Nhân vật
            if (typeof metadata !== 'undefined' && Array.isArray(metadata.characters)) {
                for (const char of metadata.characters) {
                    if (char.c2 && char.c2.toLowerCase().trim() === queryClean && char.c1) {
                        matchedChinese = char.c1.trim();
                        break;
                    }
                }
            }

            // Tra cứu trong Thống nhất từ ngữ
            if (!matchedChinese && typeof metadata !== 'undefined' && Array.isArray(metadata.terms)) {
                for (const term of metadata.terms) {
                    if (term.c2 && term.c2.toLowerCase().trim() === queryClean && term.c1) {
                        matchedChinese = term.c1.trim();
                        break;
                    }
                }
            }

            if (matchedChinese) {
                // Xác định vị trí xuất hiện gần nhất tương ứng theo tỷ lệ vị trí câu
                const relRatio = selStart / Math.max(1, qtText.length);
                let bestIdx = -1;
                let minDiff = Infinity;
                let searchIdx = rawText.indexOf(matchedChinese);

                while (searchIdx !== -1) {
                    const diff = Math.abs((searchIdx / Math.max(1, rawText.length)) - relRatio);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestIdx = searchIdx;
                    }
                    searchIdx = rawText.indexOf(matchedChinese, searchIdx + 1);
                }

                if (bestIdx !== -1) {
                    applyHighlightToCell(rawTd, bestIdx, bestIdx + matchedChinese.length);
                }
            }

        // =====================================================================
        // TRƯỜNG HỢP 2: BÔI ĐEN TIẾNG TRUNG TRONG RAW ➔ TÔ SÁNG TỪ TƯƠNG ỨNG TRONG QT
        // =====================================================================
        } else if (col === 'raw') {
            const { start: selStart, end: selEnd } = getSelectionOffsetsWithinCell(rawTd, range);
            if (selStart === -1 || selEnd === -1) return;

            if (tokens && tokens.length > 0) {
                const alignedRaw = alignTokensSequentially(tokens, rawText, true);
                const alignedQT = alignTokensSequentially(tokens, qtText, false);

                const overlappingTokens = alignedRaw.filter(t => t.start < selEnd && t.end > selStart && t.start !== -1);

                if (overlappingTokens.length > 0) {
                    const firstIdx = overlappingTokens[0].index;
                    const lastIdx = overlappingTokens[overlappingTokens.length - 1].index;

                    const targetQtStart = alignedQT[firstIdx]?.start;
                    const targetQtEnd = alignedQT[lastIdx]?.end;

                    if (typeof targetQtStart === 'number' && typeof targetQtEnd === 'number' && targetQtEnd > targetQtStart) {
                        applyHighlightToCell(qtTd, targetQtStart, targetQtEnd);
                    }
                }
            }
        }
    }, 60);
}

// =========================================================================
// KHỞI CHẠY LẮNG NGHE SỰ KIỆN
// =========================================================================
function initSyncSelectionListeners() {
    // 1. Lắng nghe thay đổi vùng chọn thời gian thực
    document.addEventListener('selectionchange', handleSelectionChangeSync);

    // 2. Tự động xóa highlight khi click ra ngoài bảng hoặc làm mới dữ liệu
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#table-body')) {
            clearSyncHighlights();
        }
    });

    // 3. Tự động xóa khi bấm phím Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearSyncHighlights();
        }
    });
}

// Xuất hàm toàn cục để các file khác có thể gọi làm sạch highlight
window.clearSyncHighlights = clearSyncHighlights;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncSelectionListeners);
} else {
    initSyncSelectionListeners();
}