// =========================================================================
// ĐỒNG BỘ HIỆU ỨNG TÔ SÁNG ĐỐI CHIẾU THỜI GIAN THỰC (BẢN QT ↔ RAW)
// =========================================================================

let syncSelectionTimeout = null;

// LẤY CHÍNH XÁC TÊN CỘT VÀ VỊ TRÍ HÀNG (CHỐNG LỖI THIẾU data-col)
function getCellLocation(td) {
    if (!td) return null;
    const tr = td.closest('tr');
    if (!tr || !tr.parentElement || tr.parentElement.id !== 'table-body') return null;

    let colKey = td.dataset ? td.dataset.col : '';
    const allTds = Array.from(tr.children);

    // Nếu thiếu data-col thì tự động dò theo thứ tự cột trong bảng
    if (!colKey) {
        const dataTds = allTds.filter(c => !c.classList.contains('batch-select-cell'));
        const idx = dataTds.indexOf(td);
        const COL_KEYS = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
        colKey = COL_KEYS[idx] || '';
    }

    const rowIndex = Array.from(tr.parentElement.children).indexOf(tr);
    return { tr, rowIndex, colKey, td };
}

// XÓA SẠCH MỌI VÙNG ĐANG ĐƯỢC TÔ SÁNG TRÊN TOÀN BẢNG
function clearSyncHighlights() {
    const highlightedSpans = document.querySelectorAll('.sync-highlight');
    highlightedSpans.forEach(span => {
        const parent = span.parentNode;
        if (parent) {
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            span.remove();
            parent.normalize(); // Nối liền các đoạn văn bản lại nguyên trạng
        }
    });
}

// TÍNH TOÁN VỊ TRÍ KÝ TỰ BÔI ĐEN TRONG Ô
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

// TÔ SÁNG ĐOẠN VĂN BẢN TƯƠNG ỨNG TRONG Ô BẰNG THẺ SPAN NỔI BẬT
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

        const span = document.createElement('span');
        span.className = 'sync-highlight';

        try {
            range.surroundContents(span);
        } catch (e) {
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
        }
    } catch (err) {
        console.warn("Lỗi tạo highlight:", err);
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

        const cellInfo = getCellLocation(sourceTd);
        if (!cellInfo) {
            clearSyncHighlights();
            return;
        }

        const { tr, rowIndex, colKey } = cellInfo;

        // Chỉ đối chiếu khi người dùng bôi đen ở cột Bản QT hoặc cột Raw
        if (colKey !== 'qt' && colKey !== 'raw') {
            clearSyncHighlights();
            return;
        }

        const rawTd = tr.querySelector('td[data-col="raw"]') || tr.children[1] || tr.children[0];
        const qtTd = tr.querySelector('td[data-col="qt"]') || tr.children[4];
        if (!rawTd || !qtTd) return;

        const rawText = rawTd.textContent || '';
        const qtText = qtTd.textContent || '';
        if (!rawText || !qtText) return;

        // Lấy danh sách Token của hàng (nếu chưa có thì gọi TrieEngine nạp tức thì)
        let tokens = (typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) ? rowTokensMap[rowIndex] : null;
        if ((!tokens || tokens.length === 0) && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
            const rawClean = rawText.replace(/<[^>]+>/g, '').normalize('NFC');
            const res = nameQTEngine.process(rawClean);
            tokens = res.tokens;
            if (typeof rowTokensMap !== 'undefined') rowTokensMap[rowIndex] = tokens;
        }

        // =====================================================================
        // TRƯỜNG HỢP 1: BÔI ĐEN Ở BẢN QT ➔ PHÁT SÁNG BÊN RAW
        // =====================================================================
        if (colKey === 'qt') {
            const { start: selStart, end: selEnd } = getSelectionOffsetsWithin(qtTd, range);
            if (selStart === -1 || selEnd === -1) return;

            let targetStart = -1;
            let targetEnd = -1;

            // 1. ÁNH XẠ QUA MẢNG TOKEN (ĐỘ CHÍNH XÁC CAO NHẤT)
            if (tokens && tokens.length > 0) {
                let qtSearchPos = 0;
                let rawSearchPos = 0;

                const mapped = tokens.map((tok, i) => {
                    const rawStr = tok.orig || tok.raw || tok.cn || '';
                    const transStr = (tok.text || tok.qt || tok.trans || tok.vi || '').trim();

                    // Vị trí trong QT
                    let qStart = -1;
                    if (transStr) {
                        qStart = qtText.toLowerCase().indexOf(transStr.toLowerCase(), qtSearchPos);
                        if (qStart === -1) qStart = qtText.toLowerCase().indexOf(transStr.toLowerCase());
                    }
                    let qEnd = qStart !== -1 ? qStart + transStr.length : -1;
                    if (qStart !== -1) qtSearchPos = qEnd;

                    // Vị trí trong Raw
                    let rStart = -1;
                    if (rawStr) {
                        rStart = rawText.indexOf(rawStr, rawSearchPos);
                        if (rStart === -1) rStart = rawText.indexOf(rawStr);
                    }
                    let rEnd = rStart !== -1 ? rStart + rawStr.length : -1;
                    if (rStart !== -1) rawSearchPos = rEnd;

                    return { index: i, rawStr, transStr, qStart, qEnd, rStart, rEnd };
                });

                // Tìm các token trùng khớp với vùng bôi đen
                const matched = mapped.filter(m => m.qStart !== -1 && m.qStart < selEnd && m.qEnd > selStart);

                if (matched.length > 0) {
                    targetStart = matched[0].rStart;
                    targetEnd = matched[matched.length - 1].rEnd;
                }
            }

            // 2. DỰ PHÒNG: NẾU TOKEN CHƯA KHỚP THÌ TRA CỨU BẢNG NHÂN VẬT & TỪ NGỮ
            if (targetStart === -1) {
                const cleanQuery = selectedText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '').trim();
                let matchedChinese = '';

                // Tra trong bảng Nhân vật
                if (typeof metadata !== 'undefined' && Array.isArray(metadata.characters)) {
                    for (const char of metadata.characters) {
                        if (char.c2 && char.c2.toLowerCase().trim() === cleanQuery && char.c1) {
                            matchedChinese = char.c1.trim();
                            break;
                        }
                    }
                }

                // Tra trong bảng Thống nhất từ ngữ
                if (!matchedChinese && typeof metadata !== 'undefined' && Array.isArray(metadata.terms)) {
                    for (const term of metadata.terms) {
                        if (term.c2 && term.c2.toLowerCase().trim() === cleanQuery && term.c1) {
                            matchedChinese = term.c1.trim();
                            break;
                        }
                    }
                }

                if (matchedChinese) {
                    // Chọn vị trí xuất hiện tương ứng theo tỷ lệ độ dài câu
                    const relRatio = selStart / Math.max(1, qtText.length);
                    let bestIdx = -1;
                    let minDiff = Infinity;
                    let sIdx = rawText.indexOf(matchedChinese);

                    while (sIdx !== -1) {
                        const diff = Math.abs((sIdx / Math.max(1, rawText.length)) - relRatio);
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestIdx = sIdx;
                        }
                        sIdx = rawText.indexOf(matchedChinese, sIdx + 1);
                    }

                    if (bestIdx !== -1) {
                        targetStart = bestIdx;
                        targetEnd = bestIdx + matchedChinese.length;
                    }
                }
            }

            // Thực hiện tô sáng nếu tìm thấy vị trí tương ứng
            if (targetStart !== -1 && targetEnd > targetStart) {
                highlightTextRangeInCell(rawTd, targetStart, targetEnd);
            }

        // =====================================================================
        // TRƯỜNG HỢP 2: BÔI ĐEN Ở RAW ➔ PHÁT SÁNG BÊN BẢN QT
        // =====================================================================
        } else if (colKey === 'raw') {
            const { start: selStart, end: selEnd } = getSelectionOffsetsWithin(rawTd, range);
            if (selStart === -1 || selEnd === -1) return;

            if (tokens && tokens.length > 0) {
                let rawSearchPos = 0;
                let qtSearchPos = 0;

                const mapped = tokens.map((tok, i) => {
                    const rawStr = tok.orig || tok.raw || tok.cn || '';
                    const transStr = (tok.text || tok.qt || tok.trans || tok.vi || '').trim();

                    let rStart = -1;
                    if (rawStr) {
                        rStart = rawText.indexOf(rawStr, rawSearchPos);
                        if (rStart === -1) rStart = rawText.indexOf(rawStr);
                    }
                    let rEnd = rStart !== -1 ? rStart + rawStr.length : -1;
                    if (rStart !== -1) rawSearchPos = rEnd;

                    let qStart = -1;
                    if (transStr) {
                        qStart = qtText.toLowerCase().indexOf(transStr.toLowerCase(), qtSearchPos);
                        if (qStart === -1) qStart = qtText.toLowerCase().indexOf(transStr.toLowerCase());
                    }
                    let qEnd = qStart !== -1 ? qStart + transStr.length : -1;
                    if (qStart !== -1) qtSearchPos = qEnd;

                    return { index: i, rawStr, transStr, rStart, rEnd, qStart, qEnd };
                });

                const matched = mapped.filter(m => m.rStart !== -1 && m.rStart < selEnd && m.rEnd > selStart);

                if (matched.length > 0) {
                    const qStart = matched[0].qStart;
                    const qEnd = matched[matched.length - 1].qEnd;
                    if (qStart !== -1 && qEnd > qStart) {
                        highlightTextRangeInCell(qtTd, qStart, qEnd);
                    }
                }
            }
        }
    }, 50);
}

// =========================================================================
// KHỞI CHẠY LẮNG NGHE SỰ KIỆN
// =========================================================================
function initSyncSelectionListeners() {
    document.addEventListener('selectionchange', handleSelectionChangeSync);

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#table-body')) {
            clearSyncHighlights();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearSyncHighlights();
        }
    });
}

window.clearSyncHighlights = clearSyncHighlights;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncSelectionListeners);
} else {
    initSyncSelectionListeners();
}