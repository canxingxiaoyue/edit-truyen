// =========================================================================
// ĐỒNG BỘ HIỆU ỨNG TÔ SÁNG ĐỐI CHIẾU (CHỐNG LỖI EXTENSION DỊCH THUẬT)
// Tối ưu hóa cực nhẹ, miễn nhiễm với sự can thiệp làm méo DOM của trình duyệt
// =========================================================================

let syncSelectionTimeout = null;

// Xóa sạch mọi hiệu ứng tô sáng cũ trên bảng
function clearSyncHighlights() {
    // Xóa bằng CSS API hiện đại
    if (typeof CSS !== 'undefined' && CSS.highlights && CSS.highlights.has('sync-highlight')) {
        CSS.highlights.delete('sync-highlight');
    }

    // Fallback: Xóa thẻ <mark> trong DOM
    const highlightedMarks = document.querySelectorAll('mark.sync-highlight');
    highlightedMarks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            mark.remove();
            parent.normalize(); // Liền mạch lại văn bản gốc
        }
    });
}

// Hàm tô sáng chữ tương ứng một cách an toàn nhất
function applyHighlight(tdElement, textToHighlight) {
    if (!tdElement || !textToHighlight) return;
    
    // Xóa cái cũ trước khi tạo cái mới
    clearSyncHighlights();

    const cleanTarget = textToHighlight.trim();
    if (!cleanTarget) return;

    // Quét tìm chữ trong ô đích
    const walker = document.createTreeWalker(tdElement, NodeFilter.SHOW_TEXT, null, false);
    let node;
    
    while ((node = walker.nextNode())) {
        const nodeText = node.nodeValue;
        const idx = nodeText.toLowerCase().indexOf(cleanTarget.toLowerCase());
        
        if (idx !== -1) {
            try {
                const range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + cleanTarget.length);

                // Ưu tiên dùng CSS Highlight API (Không can thiệp DOM)
                if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
                    const hl = new Highlight(range);
                    CSS.highlights.set('sync-highlight', hl);
                } else {
                    // Dùng thẻ <mark> chuẩn chỉnh thay vì <span> để chống lỗi hiển thị
                    const mark = document.createElement('mark');
                    mark.className = 'sync-highlight';
                    range.surroundContents(mark);
                }
                return; // Tô sáng thành công cụm đầu tiên thì dừng
            } catch (err) {
                // Bỏ qua lỗi nếu DOM bị khóa
            }
        }
    }
}

// XỬ LÝ CHÍNH KHI NGƯỜI DÙNG BÔI ĐEN VĂN BẢN (TRÁNH LỖI HTML)
function handleSelectionChangeSync() {
    clearTimeout(syncSelectionTimeout);
    syncSelectionTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            clearSyncHighlights();
            return;
        }

        // Lấy đúng văn bản thuần túy, bỏ qua HTML rác do Extension chèn vào
        const selectedText = selection.toString().trim();
        if (!selectedText) {
            clearSyncHighlights();
            return;
        }

        let containerNode = selection.anchorNode;
        if (!containerNode) return;
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

        // Tự động tìm cột mà không cần dựa dẫm vào data-col
        let colKey = sourceTd.dataset.col;
        if (!colKey) {
            const dataTds = Array.from(tr.children).filter(c => !c.classList.contains('batch-select-cell'));
            const idx = dataTds.indexOf(sourceTd);
            const COL_KEYS = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
            colKey = COL_KEYS[idx] || '';
        }

        // Nếu không bôi đen đúng 2 cột này thì thoát
        if (colKey !== 'qt' && colKey !== 'raw') {
            clearSyncHighlights();
            return;
        }

        // Tìm 2 ô Raw và QT trong hàng
        const rawTd = tr.querySelector('td[data-col="raw"]') || Array.from(tr.children).find(td => td.dataset.col === 'raw') || tr.children[1];
        const qtTd = tr.querySelector('td[data-col="qt"]') || Array.from(tr.children).find(td => td.dataset.col === 'qt') || tr.children[5];
        if (!rawTd || !qtTd) return;

        const rowIndex = Array.from(tr.parentElement.children).indexOf(tr);

        // Lấy Token của câu (Nạp nhanh nếu chưa có)
        let tokens = (typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) ? rowTokensMap[rowIndex] : null;
        if ((!tokens || tokens.length === 0) && typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
            const rawClean = (rawTd.textContent || '').replace(/<[^>]+>/g, '').normalize('NFC');
            tokens = nameQTEngine.process(rawClean).tokens;
            if (typeof rowTokensMap !== 'undefined') rowTokensMap[rowIndex] = tokens;
        }

        let targetWord = "";

        // =====================================================================
        // TRƯỜNG HỢP 1: BÔI ĐEN TIẾNG TRUNG BÊN RAW ➔ PHÁT SÁNG TIẾNG VIỆT
        // =====================================================================
        if (colKey === 'raw') {
            if (tokens) {
                for (let tok of tokens) {
                    let cn = tok.orig || tok.raw || tok.cn || '';
                    if (cn && (cn.includes(selectedText) || selectedText.includes(cn))) {
                        targetWord = (tok.text || tok.qt || tok.vi || '').trim();
                        break;
                    }
                }
            }
            if (targetWord) applyHighlight(qtTd, targetWord);
        } 
        
        // =====================================================================
        // TRƯỜNG HỢP 2: BÔI ĐEN TIẾNG VIỆT BÊN BẢN QT ➔ PHÁT SÁNG TIẾNG TRUNG
        // =====================================================================
        else if (colKey === 'qt') {
            const selLower = selectedText.toLowerCase();

            // Tầng 1: Dò Token
            if (tokens) {
                for (let tok of tokens) {
                    let vi = (tok.text || tok.qt || tok.vi || '').trim().toLowerCase();
                    if (vi && (vi.includes(selLower) || selLower.includes(vi))) {
                        targetWord = (tok.orig || tok.raw || tok.cn || '').trim();
                        break;
                    }
                }
            }

            // Tầng 2: Dò Metadata (Nếu Token chưa khớp)
            if (!targetWord && typeof metadata !== 'undefined') {
                const cleanQuery = selLower.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '').trim();
                
                if (metadata.characters) {
                    const found = metadata.characters.find(c => c.c2 && c.c2.toLowerCase().trim() === cleanQuery);
                    if (found) targetWord = found.c1.trim();
                }
                
                if (!targetWord && metadata.terms) {
                    const found = metadata.terms.find(t => t.c2 && t.c2.toLowerCase().trim() === cleanQuery);
                    if (found) targetWord = found.c1.trim();
                }
            }

            if (targetWord) applyHighlight(rawTd, targetWord);
        }

    }, 50); // Timeout 50ms chống spam và chờ Extension chèn mã xong
}

// =========================================================================
// KHỞI CHẠY LẮNG NGHE SỰ KIỆN
// =========================================================================
function initSyncSelectionListeners() {
    document.addEventListener('selectionchange', handleSelectionChangeSync);

    // Xóa sáng khi bấm chuột ra ngoài vùng bảng
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#table-body')) {
            clearSyncHighlights();
        }
    });

    // Xóa sáng khi gõ phím Esc
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') clearSyncHighlights();
    });
}

// Gắn hàm toàn cục
window.clearSyncHighlights = clearSyncHighlights;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncSelectionListeners);
} else {
    initSyncSelectionListeners();
}