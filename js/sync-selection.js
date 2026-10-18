// =========================================================================
// ĐỒNG BỘ HIỆU ỨNG TÔ SÁNG ĐỐI CHIẾU THỜI GIAN THỰC HAI CHIỀU (RAW ↔ QT)
// THUẬT TOÁN ANCHOR-BASED ALIGNMENT - AN TOÀN CHO CONTENTEDITABLE & UNDO/REDO
// =========================================================================

let syncSelectionTimeout = null;
let cachedReverseDict = null;
let lastDictSize = 0;

// 1. TỰ ĐỘNG TIÊM CSS CHO HIGHLIGHT (ĐẢM BẢO KHÔNG BỊ TRONG SUỐT VÔ HÌNH)
(function ensureHighlightStyle() {
    const STYLE_ID = 'sync-selection-highlight-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            ::highlight(sync-highlight) {
                background-color: rgba(255, 212, 59, 0.45);
                color: inherit;
                text-decoration: underline wavy rgba(230, 119, 0, 0.65);
            }
            .sync-highlight-fallback {
                background-color: rgba(255, 212, 59, 0.45) !important;
                color: inherit !important;
                border-radius: 2px;
            }
        `;
        document.head.appendChild(style);
    }
})();

// 2. BẢNG ĐỐI CHIẾU DẤU CÂU (TRUNG - VIỆT)
const PUNCT_MAP = [
    { cn: '，', vi: ',' },
    { cn: '。', vi: '.' },
    { cn: '！', vi: '!' },
    { cn: '？', vi: '?' },
    { cn: '：', vi: ':' },
    { cn: '；', vi: ';' },
    { cn: '“', vi: '“' },
    { cn: '”', vi: '”' },
    { cn: '‘', vi: '‘' },
    { cn: '’', vi: '’' },
    { cn: '（', vi: '(' },
    { cn: '）', vi: ')' },
    { cn: '【', vi: '[' },
    { cn: '】', vi: ']' },
    { cn: '《', vi: '«' },
    { cn: '》', vi: '»' },
    { cn: '、', vi: ',' },
    { cn: '……', vi: '...' },
    { cn: '—', vi: '-' },
    { cn: ',', vi: ',' },
    { cn: '.', vi: '.' },
    { cn: '!', vi: '!' },
    { cn: '?', vi: '?' },
    { cn: ':', vi: ':' },
    { cn: ';', vi: ';' },
    { cn: '"', vi: '"' }
];

// 3. TẠO TỪ ĐIỂN ĐẢO NGƯỢC (VIỆT -> TRUNG) TỪ NAMEQT ENGINE
function getReverseDict() {
    if (typeof nameQTEngine === 'undefined' || !nameQTEngine.dict) return new Map();
    if (cachedReverseDict && nameQTEngine.dict.size === lastDictSize) {
        return cachedReverseDict;
    }

    cachedReverseDict = new Map();
    lastDictSize = nameQTEngine.dict.size;

    for (const [cn, vi] of nameQTEngine.dict.entries()) {
        if (!cn || !vi) continue;
        const viNorm = vi.trim().toLowerCase();
        if (!cachedReverseDict.has(viNorm)) {
            cachedReverseDict.set(viNorm, []);
        }
        cachedReverseDict.get(viNorm).push(cn.trim());
    }
    return cachedReverseDict;
}

// 4. LẤY Ô TD THEO KEY (CÓ DỰ PHÒNG KHI KHÔNG CÓ DATA-COL)
function getCellByColKey(tr, colKey) {
    if (!tr) return null;
    let td = tr.querySelector(`td[data-col="${colKey}"]`);
    if (td) return td;

    const allTds = Array.from(tr.children);
    const dataTds = allTds.filter(c => !c.classList.contains('batch-select-cell'));
    const COL_KEYS = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
    const idx = COL_KEYS.indexOf(colKey);
    return idx >= 0 ? dataTds[idx] : null;
}

// 5. XÁC ĐỊNH Ô ĐANG ĐƯỢC CHỌN
function getCellLocation(td) {
    if (!td) return null;
    const tr = td.closest('tr');
    if (!tr || !tr.parentElement || tr.parentElement.id !== 'table-body') return null;

    let colKey = td.dataset ? td.dataset.col : '';
    if (!colKey) {
        const allTds = Array.from(tr.children);
        const dataTds = allTds.filter(c => !c.classList.contains('batch-select-cell'));
        const idx = dataTds.indexOf(td);
        const COL_KEYS = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
        colKey = COL_KEYS[idx] || '';
    }

    const rowIndex = Array.from(tr.parentElement.children).indexOf(tr);
    return { tr, rowIndex, colKey, td };
}

// 6. XÓA HIGHLIGHT AN TOÀN
function clearSyncHighlights() {
    if (typeof CSS !== 'undefined' && CSS.highlights && CSS.highlights.has('sync-highlight')) {
        CSS.highlights.delete('sync-highlight');
    }

    const highlightedSpans = document.querySelectorAll('.sync-highlight-fallback');
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

// 7. TÍNH CHỈ SỐ KÝ TỰ (CHARACTER OFFSET) CHÍNH XÁC THEO TEXT NODES
function getTextOffset(root, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while ((node = walker.nextNode())) {
        if (node === targetNode) {
            return offset + targetOffset;
        }
        offset += node.textContent.length;
    }

    // Trường hợp selection nằm ở chính element container
    if (targetNode === root || root.contains(targetNode)) {
        return Math.min(offset, targetOffset);
    }
    return offset;
}

function getSelectionOffsetsWithin(element, range) {
    try {
        const start = getTextOffset(element, range.startContainer, range.startOffset);
        const end = getTextOffset(element, range.endContainer, range.endOffset);
        return { start, end };
    } catch (e) {
        return { start: -1, end: -1 };
    }
}

// 8. TÔ SÁNG BẰNG CSS HIGHLIGHT API HOẶC FALLBACK
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

        // Ưu tiên CSS Custom Highlight API: KHÔNG ĐỤNG VÀO CẤU TRÚC DOM
        if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
            const hl = new Highlight(range);
            CSS.highlights.set('sync-highlight', hl);
            return;
        }

        // Fallback cho trình duyệt chưa hỗ trợ CSS Highlights
        const span = document.createElement('span');
        span.className = 'sync-highlight-fallback';
        try {
            range.surroundContents(span);
        } catch (e) {
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
        }
    } catch (err) {}
}

// 9. THUẬT TOÁN XÂY DỰNG DANH SÁCH ĐIỂM NEO (ANCHORS) GIỮA RAW VÀ QT
function buildRowAnchors(rawText, qtText) {
    const anchors = [];
    if (!rawText || !qtText) return anchors;

    // A. Điểm neo từ Từ điển (NameQT Engine)
    if (typeof nameQTEngine !== 'undefined' && nameQTEngine.dict && nameQTEngine.dict.size > 0) {
        const dict = nameQTEngine.dict;
        const maxL = nameQTEngine.maxDepth || 20;
        const n = rawText.length;
        let i = 0;

        while (i < n) {
            let matchedVi = null;
            let matchedLen = 0;
            const limit = Math.min(n - i, maxL);

            for (let len = limit; len >= 1; len--) {
                const sub = rawText.substr(i, len);
                const val = dict.get(sub);
                if (val !== undefined) {
                    matchedVi = val;
                    matchedLen = len;
                    break;
                }
            }

            if (matchedVi && matchedLen > 0) {
                const cnStr = rawText.substr(i, matchedLen);
                // Tìm kiếm vị trí tương ứng trong văn bản QT
                const viNorm = matchedVi.toLowerCase();
                const qtLower = qtText.toLowerCase();

                let qIdx = -1;
                let searchFrom = 0;
                let bestIdx = -1;
                let minDiff = Infinity;
                const rawRatio = i / Math.max(1, n);

                while ((qIdx = qtLower.indexOf(viNorm, searchFrom)) !== -1) {
                    const currentRatio = qIdx / Math.max(1, qtText.length);
                    const diff = Math.abs(currentRatio - rawRatio);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestIdx = qIdx;
                    }
                    searchFrom = qIdx + 1;
                }

                if (bestIdx !== -1) {
                    anchors.push({
                        rStart: i,
                        rEnd: i + matchedLen,
                        qStart: bestIdx,
                        qEnd: bestIdx + matchedVi.length,
                        type: 'dict'
                    });
                }
                i += matchedLen;
            } else {
                i++;
            }
        }
    }

    // B. Điểm neo từ Dấu câu (Punctuation Anchors)
    for (const pair of PUNCT_MAP) {
        let rPos = 0;
        while ((rPos = rawText.indexOf(pair.cn, rPos)) !== -1) {
            const rawRatio = rPos / Math.max(1, rawText.length);
            // Tìm dấu câu tương ứng ở bên QT gần tỷ lệ vị trí nhất
            let qPos = 0;
            let bestQ = -1;
            let minDiff = Infinity;

            while ((qPos = qtText.indexOf(pair.vi, qPos)) !== -1) {
                const qRatio = qPos / Math.max(1, qtText.length);
                const diff = Math.abs(qRatio - rawRatio);
                if (diff < minDiff && diff < 0.25) { // Trong phạm vi 25% độ dài văn bản
                    minDiff = diff;
                    bestQ = qPos;
                }
                qPos += pair.vi.length;
            }

            if (bestQ !== -1) {
                anchors.push({
                    rStart: rPos,
                    rEnd: rPos + pair.cn.length,
                    qStart: bestQ,
                    qEnd: bestQ + pair.vi.length,
                    type: 'punct'
                });
            }
            rPos += pair.cn.length;
        }
    }

    // Sắp xếp các điểm neo theo thứ tự xuất hiện ở Raw
    anchors.sort((a, b) => a.rStart - b.rStart || a.qStart - b.qStart);
    return anchors;
}

// 10. TÍNH TOÁN ÁNH XẠ VÙNG CHỌN QUA ĐIỂM NEO (ALIGNMENT RESOLVER)
function resolveTargetRange(isFromRawToQT, selStart, selEnd, anchors, sourceText, targetText) {
    if (selStart >= selEnd || !anchors || anchors.length === 0) return null;

    // Xác định chiều tìm kiếm
    const sStartKey = isFromRawToQT ? 'rStart' : 'qStart';
    const sEndKey = isFromRawToQT ? 'rEnd' : 'qEnd';
    const tStartKey = isFromRawToQT ? 'qStart' : 'rStart';
    const tEndKey = isFromRawToQT ? 'qEnd' : 'rEnd';

    // 1. Kiểm tra nếu vùng bôi đen khớp hoặc giao thoa với các Anchor đã có
    const overlappingAnchors = anchors.filter(a => selStart < a[sEndKey] && selEnd > a[sStartKey]);

    if (overlappingAnchors.length > 0) {
        const first = overlappingAnchors[0];
        const last = overlappingAnchors[overlappingAnchors.length - 1];
        return {
            start: first[tStartKey],
            end: last[tEndKey]
        };
    }

    // 2. Nếu nằm trong khoảng giữa 2 Anchor (Ví dụ: cụm từ không có trong từ điển nằm giữa 2 dấu câu)
    let prevAnchor = null;
    let nextAnchor = null;

    for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        if (a[sEndKey] <= selStart) {
            prevAnchor = a;
        }
        if (a[sStartKey] >= selEnd && !nextAnchor) {
            nextAnchor = a;
            break;
        }
    }

    if (prevAnchor && nextAnchor) {
        // Thu hẹp chính xác trong khoảng trống tương ứng ở cột đối diện
        const tGapStart = prevAnchor[tEndKey];
        const tGapEnd = nextAnchor[tStartKey];

        if (tGapEnd > tGapStart) {
            const sGapStart = prevAnchor[sEndKey];
            const sGapEnd = nextAnchor[sStartKey];
            const sGapLen = sGapEnd - sGapStart;

            if (sGapLen > 0) {
                // Tỷ lệ nội suy trong khoảng hẹp
                const startRatio = (selStart - sGapStart) / sGapLen;
                const endRatio = (selEnd - sGapStart) / sGapLen;
                const tGapLen = tGapEnd - tGapStart;

                let calculatedStart = Math.round(tGapStart + startRatio * tGapLen);
                let calculatedEnd = Math.round(tGapStart + endRatio * tGapLen);

                // Căn lề theo ranh giới từ (nếu là tiếng Việt)
                if (isFromRawToQT) {
                    while (calculatedStart > tGapStart && targetText[calculatedStart - 1] !== ' ') calculatedStart--;
                    while (calculatedEnd < tGapEnd && targetText[calculatedEnd] !== ' ' && targetText[calculatedEnd] !== targetText[tGapEnd]) calculatedEnd++;
                }

                return {
                    start: Math.max(tGapStart, calculatedStart),
                    end: Math.min(tGapEnd, Math.max(calculatedStart + 1, calculatedEnd))
                };
            }
        }
    }

    return null;
}

// 11. XỬ LÝ CHÍNH SỰ KIỆN SELECTION
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

        const { tr, colKey } = cellInfo;
        if (colKey !== 'qt' && colKey !== 'raw') {
            clearSyncHighlights();
            return;
        }

        const rawTd = getCellByColKey(tr, 'raw');
        const qtTd = getCellByColKey(tr, 'qt');
        if (!rawTd || !qtTd) return;

        const rawText = (rawTd.textContent || '').normalize('NFC');
        const qtText = (qtTd.textContent || '').normalize('NFC');
        if (!rawText || !qtText) return;

        const isRawToQT = (colKey === 'raw');
        const sourceTdEl = isRawToQT ? rawTd : qtTd;
        const targetTdEl = isRawToQT ? qtTd : rawTd;
        const sourceText = isRawToQT ? rawText : qtText;
        const targetText = isRawToQT ? qtText : rawText;

        const { start: selStart, end: selEnd } = getSelectionOffsetsWithin(sourceTdEl, range);
        if (selStart === -1 || selEnd === -1 || selStart >= selEnd) {
            clearSyncHighlights();
            return;
        }

        // Bước A: Tra cứu trực tiếp từ điển hai chiều nếu người dùng chọn cụm từ/tên riêng
        let directMatchTarget = null;
        const trimmedSel = selectedText.trim();

        if (isRawToQT) {
            // Chiều Raw -> QT: Tra trực tiếp Map NameQT
            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.dict) {
                const viVal = nameQTEngine.dict.get(trimmedSel);
                if (viVal) {
                    const viNorm = viVal.toLowerCase();
                    const qtLower = qtText.toLowerCase();
                    const rawRatio = selStart / Math.max(1, rawText.length);
                    let qIdx = -1, searchFrom = 0, bestIdx = -1, minDiff = Infinity;

                    while ((qIdx = qtLower.indexOf(viNorm, searchFrom)) !== -1) {
                        const diff = Math.abs((qIdx / Math.max(1, qtText.length)) - rawRatio);
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestIdx = qIdx;
                        }
                        searchFrom = qIdx + 1;
                    }
                    if (bestIdx !== -1) {
                        directMatchTarget = { start: bestIdx, end: bestIdx + viVal.length };
                    }
                }
            }
        } else {
            // Chiều QT -> Raw: Tra Reverse Dict
            const revDict = getReverseDict();
            const cnCandidates = revDict.get(trimmedSel.toLowerCase());
            if (cnCandidates && cnCandidates.length > 0) {
                const qtRatio = selStart / Math.max(1, qtText.length);
                let bestMatch = null;
                let minDiff = Infinity;

                for (const cnStr of cnCandidates) {
                    let rIdx = -1, searchFrom = 0;
                    while ((rIdx = rawText.indexOf(cnStr, searchFrom)) !== -1) {
                        const diff = Math.abs((rIdx / Math.max(1, rawText.length)) - qtRatio);
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestMatch = { start: rIdx, end: rIdx + cnStr.length };
                        }
                        searchFrom = rIdx + 1;
                    }
                }
                if (bestMatch) {
                    directMatchTarget = bestMatch;
                }
            }
        }

        if (directMatchTarget) {
            highlightTextRangeInCell(targetTdEl, directMatchTarget.start, directMatchTarget.end);
            return;
        }

        // Bước B: Nếu không khớp từ điển đơn lẻ, chạy thuật toán Anchor-Based Alignment
        const anchors = buildRowAnchors(rawText, qtText);
        const resolved = resolveTargetRange(isRawToQT, selStart, selEnd, anchors, sourceText, targetText);

        if (resolved && resolved.start !== -1 && resolved.end > resolved.start) {
            highlightTextRangeInCell(targetTdEl, resolved.start, resolved.end);
        } else {
            clearSyncHighlights();
        }
    }, 40);
}

// 12. KHỞI TẠO CÁC BỘ LẮNG NGHE SỰ KIỆN
function initSyncSelectionListeners() {
    document.addEventListener('selectionchange', handleSelectionChangeSync);
    
    // Tự động xóa highlight khi click ra ngoài vùng bảng
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#table-body')) {
            clearSyncHighlights();
        }
    });

    // Xóa khi nhấn phím ESC
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