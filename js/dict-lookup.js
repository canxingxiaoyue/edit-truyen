// =========================================================================
// KHUNG TRA TỪ ĐIỂN NHANH ĐA NGUỒN (NAME QT, VIETPHRASE, LẠC VIỆT...)
// CHỈ TỰ TRA TRÊN CỘT RAW VÀ BẢN QT KHI CÓ MỤC TỪ HỢP LỆ
// KHÔNG CHẶN COPY CÂU DÀI - HIỆU NĂNG O(1) - ĐỒNG BỘ THEME 100%
// =========================================================================

(function () {
    let dictPanelEl = null;
    let queryInputEl = null;
    let resultsContainerEl = null;
    let lookupDebounce = null;
    let currentQuery = '';
    let isPinned = localStorage.getItem('dict_lookup_pinned') !== 'false';
    let isCollapsed = localStorage.getItem('dict_lookup_collapsed') === 'true';

    // 1. TỰ ĐỘNG TIÊM CSS GIAO DIỆN KHUNG TRA TỪ ĐIỂN
    (function injectStyles() {
        const STYLE_ID = 'dict-lookup-custom-styles';
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .dict-lookup-panel {
                position: fixed;
                top: 75px;
                right: 20px;
                width: 360px;
                max-width: calc(100vw - 40px);
                max-height: 540px;
                background: var(--header-bg, #ffffff);
                color: var(--text-color, #1e293b);
                border: 1px solid var(--border-color, #cbd5e1);
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
                display: flex;
                flex-direction: column;
                z-index: 1000;
                overflow: hidden;
                font-family: inherit;
                transition: height 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
            }
            .dict-lookup-panel.collapsed {
                height: 44px !important;
                max-height: 44px !important;
            }
            .dict-lookup-panel.collapsed .dict-lookup-body {
                display: none !important;
            }

            .dict-lookup-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: var(--th-bg, rgba(241, 245, 249, 0.8));
                border-bottom: 1px solid var(--border-color, #cbd5e1);
                user-select: none;
                cursor: grab;
            }
            .dict-lookup-title {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 0.9rem;
                font-weight: 700;
                margin: 0;
                color: var(--text-color, #0f172a);
            }
            .dict-header-actions {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .btn-dict-ctrl {
                background: transparent;
                border: none;
                color: var(--text-color, #64748b);
                font-size: 13px;
                padding: 4px 6px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.15s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .btn-dict-ctrl:hover {
                background: var(--row-hover, rgba(0, 0, 0, 0.08));
                color: var(--btn-primary, #2563eb);
            }
            .btn-dict-ctrl.active {
                color: #2563eb;
                background: rgba(37, 99, 235, 0.12);
            }

            .dict-lookup-body {
                display: flex;
                flex-direction: column;
                flex: 1;
                overflow: hidden;
                padding: 10px;
                gap: 10px;
            }

            .dict-input-wrap {
                display: flex;
                align-items: center;
                gap: 6px;
                background: var(--bg-color, #f8fafc);
                border: 1px solid var(--border-color, #cbd5e1);
                border-radius: 8px;
                padding: 4px 8px;
                transition: border-color 0.15s;
            }
            .dict-input-wrap:focus-within {
                border-color: var(--btn-primary, #3b82f6);
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
            }
            .dict-search-input {
                flex: 1;
                border: none;
                background: transparent;
                outline: none;
                font-size: 13.5px;
                color: inherit;
                font-family: inherit;
                padding: 3px 0;
            }
            .btn-dict-action {
                background: none;
                border: none;
                color: var(--text-muted, #94a3b8);
                font-size: 13px;
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 4px;
                line-height: 1;
            }
            .btn-dict-action:hover {
                color: var(--text-color, #0f172a);
            }

            .dict-word-summary {
                display: flex;
                align-items: baseline;
                gap: 8px;
                padding: 4px 6px;
                border-bottom: 1px dashed var(--border-color, #e2e8f0);
            }
            .dict-word-text {
                font-size: 1.25rem;
                font-weight: 800;
                color: var(--btn-primary, #2563eb);
            }
            .dict-word-pinyin {
                font-size: 0.85rem;
                color: var(--text-muted, #64748b);
                font-style: italic;
            }

            .dict-results-scroll {
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding-right: 4px;
            }
            .dict-results-scroll::-webkit-scrollbar { width: 6px; }
            .dict-results-scroll::-webkit-scrollbar-thumb {
                background: var(--border-color, #cbd5e1);
                border-radius: 4px;
            }

            .dict-entry-card {
                background: var(--bg-color, #f8fafc);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 8px;
                padding: 8px 10px;
                transition: transform 0.12s, border-color 0.15s;
            }
            .dict-entry-card:hover { border-color: var(--btn-primary, #3b82f6); }
            .dict-entry-card.is-priority {
                border-color: #f59e0b;
                background: rgba(245, 158, 11, 0.05);
            }

            .dict-entry-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
                background: rgba(59, 130, 246, 0.12);
                color: var(--btn-primary, #2563eb);
                margin-bottom: 6px;
            }
            .dict-entry-card.is-priority .dict-entry-badge {
                background: rgba(245, 158, 11, 0.15);
                color: #d97706;
            }

            .dict-entry-content {
                font-size: 13.5px;
                line-height: 1.6;
                color: var(--text-color, #1e293b);
                white-space: pre-wrap;
                word-break: break-word;
                cursor: pointer;
            }
            .dict-entry-content:hover { color: var(--btn-primary, #2563eb); }
            .dict-copy-hint {
                font-size: 10px;
                color: var(--text-muted, #94a3b8);
                margin-top: 6px;
                text-align: right;
            }

            .btn-dict-toggle-trigger {
                background: linear-gradient(135deg, #475569, #334155) !important;
                color: #ffffff !important;
                border: none !important;
            }
            .btn-dict-toggle-trigger:hover {
                background: linear-gradient(135deg, #334155, #1e293b) !important;
                transform: translateY(-1px);
            }
        `;
        document.head.appendChild(style);
    })();

    // 2. LẬP CHỈ MỤC O(1) CHO TỪNG TỆP TỪ ĐIỂN
    function getFileEntryMap(file) {
        if (!file || !file.content) return null;
        if (file._entryMap && file._entryMapVersion === file.updatedAt) {
            return file._entryMap;
        }

        const map = new Map();
        const lines = file.content.replace(/^\uFEFF/, '').split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.charCodeAt(0) === 35) continue;
            const eqIdx = line.indexOf('=');
            if (eqIdx > 0) {
                const k = line.slice(0, eqIdx).trim();
                const v = line.slice(eqIdx + 1).trim();
                if (k && v && !map.has(k)) {
                    map.set(k, v);
                }
            }
        }

        file._entryMap = map;
        file._entryMapVersion = file.updatedAt || Date.now();
        return map;
    }

    // 3. THUẬT TOÁN TRA CỨU ĐA TỪ ĐIỂN THEO THỨ TỰ ƯU TIÊN
    function queryAllDictionaries(word) {
        if (!word || !word.trim()) return [];
        const cleanWord = word.trim();
        const results = [];

        if (typeof nameQTEngine === 'undefined' || !nameQTEngine.files || nameQTEngine.files.length === 0) {
            return [{
                type: 'empty',
                message: 'Chưa có từ điển nào được nạp. Hãy bấm "Tải Name QT" để nạp từ máy hoặc Google Drive.'
            }];
        }

        const sortedFiles = [...nameQTEngine.files].sort((a, b) => {
            const pA = typeof getDictionaryPriority === 'function' ? getDictionaryPriority(a.fileName) : 0;
            const pB = typeof getDictionaryPriority === 'function' ? getDictionaryPriority(b.fileName) : 0;
            return pB - pA;
        });

        const isChinese = /[\u4e00-\u9fa5]/.test(cleanWord);

        for (const file of sortedFiles) {
            const entryMap = getFileEntryMap(file);
            if (!entryMap) continue;

            // A. Khớp chính xác mục từ
            if (entryMap.has(cleanWord)) {
                results.push({
                    fileName: file.fileName,
                    keyword: cleanWord,
                    value: entryMap.get(cleanWord),
                    isPriority: (file.fileName || '').toLowerCase().includes('tự sửa')
                });
                continue;
            }

            // B. Tra cứu ngược nghĩa tiếng Việt (chỉ chạy với từ ngắn < 20 ký tự)
            if (!isChinese && cleanWord.length <= 20) {
                const lowerWord = cleanWord.toLowerCase();
                let foundReverse = false;
                for (const [k, v] of entryMap.entries()) {
                    if (v.toLowerCase() === lowerWord || v.toLowerCase().split(/[,/]/).map(s=>s.trim()).includes(lowerWord)) {
                        results.push({
                            fileName: file.fileName,
                            keyword: k,
                            value: v,
                            isPriority: (file.fileName || '').toLowerCase().includes('tự sửa')
                        });
                        foundReverse = true;
                        break;
                    }
                }
                if (foundReverse) continue;
            }
        }

        return results;
    }

    // 4. ĐỊNH DẠNG VĂN BẢN NGHĨA
    function formatDefinitionText(val, fileName) {
        if (!val) return '';
        let text = val.trim();

        text = text.replace(/\\r\\n/g, '\n')
                   .replace(/\\n/g, '\n')
                   .replace(/\\r/g, '\n')
                   .replace(/\\t/g, '\t');

        const fn = (fileName || '').toLowerCase();

        if (fn.includes('lacviet')) {
            const rawLines = text.split('\n');
            const formattedLines = [];

            for (let i = 0; i < rawLines.length; i++) {
                let line = rawLines[i].replace(/\t/g, '').trim();
                if (!line) continue;

                if (/^[0-9]+[\.\)]\s*/.test(line)) {
                    formattedLines.push('    ' + line);
                } else if (line.startsWith('◆') || line.startsWith('✚') || line.startsWith('+') || line.includes('Hán Việt:')) {
                    if (line.startsWith('+[')) {
                        line = '✚' + line.slice(1);
                    }
                    formattedLines.push(line);
                } else {
                    formattedLines.push('    ' + line);
                }
            }
            return formattedLines.join('\n');
        }

        if (fn.includes('vietphrase') && text.includes('/')) {
            const parts = text.split('/').map(s => s.trim()).filter(Boolean);
            if (parts.length > 1) {
                return parts.map((s, i) => `${i + 1}. ${s}`).join('\n');
            }
        }

        return text;
    }

    // 5. HIỂN THỊ KẾT QUẢ RA GIAO DIỆN KHUNG
    function displayLookupResults(query) {
        currentQuery = query || '';
        if (queryInputEl && queryInputEl.value !== currentQuery) {
            queryInputEl.value = currentQuery;
        }

        if (!resultsContainerEl) return;

        if (!currentQuery) {
            resultsContainerEl.innerHTML = `
                <div style="text-align: center; color: var(--text-muted, #64748b); padding: 30px 10px; font-size: 13px;">
                    <span>👆</span> Bôi đen từ ở cột Raw / Bản QT để tra cứu tức thì,<br>hoặc nhập từ khóa vào ô trên.
                </div>
            `;
            const summaryEl = dictPanelEl.querySelector('#dict-word-summary');
            if (summaryEl) summaryEl.style.display = 'none';
            return;
        }

        const summaryEl = dictPanelEl.querySelector('#dict-word-summary');
        const wordTextEl = dictPanelEl.querySelector('#dict-word-text');
        const pinyinTextEl = dictPanelEl.querySelector('#dict-word-pinyin');

        if (summaryEl && wordTextEl && pinyinTextEl) {
            summaryEl.style.display = 'flex';
            wordTextEl.textContent = currentQuery;
            if (typeof safePinyin === 'function' && /[\u4e00-\u9fa5]/.test(currentQuery)) {
                pinyinTextEl.textContent = `[ ${safePinyin(currentQuery)} ]`;
            } else {
                pinyinTextEl.textContent = '';
            }
        }

        const entries = queryAllDictionaries(currentQuery);

        if (entries.length === 0) {
            resultsContainerEl.innerHTML = `
                <div style="text-align: center; color: var(--text-muted, #64748b); padding: 25px 10px; font-size: 13px;">
                    <div>❌ Không tìm thấy mục từ "<b>${escapeHtml(currentQuery)}</b>"</div>
                    <div style="margin-top: 8px; font-size: 11px;">Bạn có thể bôi đen và nhấn <b>➕ Thêm từ</b> để thêm vào từ điển.</div>
                </div>
            `;
            return;
        }

        if (entries[0].type === 'empty') {
            resultsContainerEl.innerHTML = `<div style="color: #b45309; padding: 15px; font-size: 12px;">⚠️ ${entries[0].message}</div>`;
            return;
        }

        let html = '';
        entries.forEach((entry) => {
            const formattedVal = formatDefinitionText(entry.value, entry.fileName);
            html += `
                <div class="dict-entry-card ${entry.isPriority ? 'is-priority' : ''}" data-val="${escapeHtml(formattedVal)}">
                    <div class="dict-entry-badge">
                        <span>${entry.isPriority ? '⭐' : '📖'}</span>
                        <span>${escapeHtml(entry.fileName)}</span>
                        ${entry.keyword !== currentQuery ? `<span style="opacity:0.8;">(${escapeHtml(entry.keyword)})</span>` : ''}
                    </div>
                    <div class="dict-entry-content" title="Nhấn để sao chép nghĩa">${escapeHtml(formattedVal)}</div>
                    <div class="dict-copy-hint">📋 Click nghĩa để copy</div>
                </div>
            `;
        });

        resultsContainerEl.innerHTML = html;

        resultsContainerEl.querySelectorAll('.dict-entry-card').forEach((card) => {
            card.addEventListener('click', () => {
                const valToCopy = card.dataset.val || '';
                if (valToCopy && navigator.clipboard) {
                    navigator.clipboard.writeText(valToCopy);
                    if (typeof showToast === 'function') {
                        showToast(`📋 Đã copy nghĩa vào clipboard!`, 'var(--btn-success)');
                    }
                }
            });
        });
    }

    // 6. KHỞI TẠO KHUNG TRA TỪ ĐIỂN
    function createDictLookupPanel() {
        if (document.getElementById('dict-lookup-panel')) return;

        dictPanelEl = document.createElement('div');
        dictPanelEl.id = 'dict-lookup-panel';
        dictPanelEl.className = `dict-lookup-panel ${isCollapsed ? 'collapsed' : ''}`;

        dictPanelEl.innerHTML = `
            <div class="dict-lookup-header">
                <h4 class="dict-lookup-title">
                    <span>📖</span> Tra từ điển
                </h4>
                <div class="dict-header-actions">
                    <button type="button" class="btn-dict-ctrl ${isPinned ? 'active' : ''}" id="btn-dict-pin" title="${isPinned ? 'Bỏ ghim' : 'Ghim vị trí'}">📌</button>
                    <button type="button" class="btn-dict-ctrl" id="btn-dict-collapse" title="${isCollapsed ? 'Mở rộng' : 'Thu gọn'}">${isCollapsed ? '➕' : '➖'}</button>
                    <button type="button" class="btn-dict-ctrl" id="btn-dict-close" title="Ẩn khung">&times;</button>
                </div>
            </div>
            <div class="dict-lookup-body">
                <div class="dict-input-wrap">
                    <span style="font-size: 13px; color: gray;">🔍</span>
                    <input type="text" id="dict-query-input" class="dict-search-input" placeholder="Nhập chữ Hán hoặc nghĩa Việt..." autocomplete="off">
                    <button type="button" class="btn-dict-action" id="btn-dict-copy-word" title="Sao chép từ khóa">📋</button>
                    <button type="button" class="btn-dict-action" id="btn-dict-clear" title="Xóa từ khóa">&times;</button>
                </div>
                <div class="dict-word-summary" id="dict-word-summary" style="display: none;">
                    <span class="dict-word-text" id="dict-word-text"></span>
                    <span class="dict-word-pinyin" id="dict-word-pinyin"></span>
                </div>
                <div class="dict-results-scroll" id="dict-results-container"></div>
            </div>
        `;

        document.body.appendChild(dictPanelEl);

        queryInputEl = dictPanelEl.querySelector('#dict-query-input');
        resultsContainerEl = dictPanelEl.querySelector('#dict-results-container');

        queryInputEl.addEventListener('input', (e) => {
            clearTimeout(lookupDebounce);
            lookupDebounce = setTimeout(() => {
                displayLookupResults(e.target.value);
            }, 180);
        });

        dictPanelEl.querySelector('#btn-dict-clear').addEventListener('click', () => {
            if (queryInputEl) queryInputEl.value = '';
            displayLookupResults('');
            queryInputEl?.focus();
        });

        dictPanelEl.querySelector('#btn-dict-copy-word').addEventListener('click', () => {
            if (currentQuery && navigator.clipboard) {
                navigator.clipboard.writeText(currentQuery);
                if (typeof showToast === 'function') showToast(`📋 Đã copy từ khóa: "${currentQuery}"`, 'var(--btn-info)');
            }
        });

        const pinBtn = dictPanelEl.querySelector('#btn-dict-pin');
        pinBtn.addEventListener('click', () => {
            isPinned = !isPinned;
            pinBtn.classList.toggle('active', isPinned);
            localStorage.setItem('dict_lookup_pinned', String(isPinned));
        });

        const collapseBtn = dictPanelEl.querySelector('#btn-dict-collapse');
        collapseBtn.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            dictPanelEl.classList.toggle('collapsed', isCollapsed);
            collapseBtn.textContent = isCollapsed ? '➕' : '➖';
            localStorage.setItem('dict_lookup_collapsed', String(isCollapsed));
        });

        dictPanelEl.querySelector('#btn-dict-close').addEventListener('click', () => {
            dictPanelEl.style.display = 'none';
        });

        displayLookupResults('');
    }

    // 7. BẮT SỰ KIỆN BÔI ĐEN VĂN BẢN VỚI QUY TẮC NGHIÊM NGẶT
    function handleSelectionChangeForDictionary() {
        clearTimeout(lookupDebounce);
        lookupDebounce = setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

            const selectedText = selection.toString().trim();
            if (!selectedText) return;

            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const node = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;

            // Bỏ qua nếu người dùng bôi đen bên trong khung từ điển
            if (dictPanelEl && dictPanelEl.contains(node)) return;

            // QUY TẮC 1: CHỈ ÁP DỤNG TRÊN CỘT RAW VÀ BẢN QT
            const targetCell = node ? node.closest('td[data-col]') : null;
            if (!targetCell) return;

            const colName = targetCell.dataset.col;
            if (colName !== 'raw' && colName !== 'qt') return;

            // QUY TẮC 2: KHÔNG KÍCH HOẠT KHI CHỌN CẢ ĐOẠN HOẶC CÂU DÀI ĐỂ COPY
            // Nếu chứa ký tự xuống dòng hoặc có dấu câu kết thúc câu -> Bỏ qua
            if (selectedText.includes('\n') || /[。！？!?\r\t]/.test(selectedText)) {
                return;
            }

            // QUY TẮC 3: XÁC MINH CÓ MỤC TỪ HỢP LỆ MỚI MỞ KHUNG
            const validEntries = queryAllDictionaries(selectedText);
            if (!validEntries || validEntries.length === 0 || validEntries[0].type === 'empty') {
                // Không có mục từ trong từ điển (như Chapter4) -> Tuyệt đối không tự mở khung!
                return;
            }

            // HỢP LỆ: Tự động cập nhật kết quả vào khung hiện có
            if (!dictPanelEl) createDictLookupPanel();

            if (dictPanelEl.style.display === 'none') {
                dictPanelEl.style.display = 'flex';
            }
            if (dictPanelEl.classList.contains('collapsed')) {
                dictPanelEl.classList.remove('collapsed');
                const cBtn = dictPanelEl.querySelector('#btn-dict-collapse');
                if (cBtn) cBtn.textContent = '➖';
            }

            displayLookupResults(selectedText);
        }, 180);
    }

    // 8. NÚT BẬT/TẮT TRÊN THANH CÔNG CỤ
    function ensureToolbarButton() {
        if (document.getElementById('btn-toggle-dict-panel')) return;
        const targetAnchor = document.getElementById('btn-refresh-qt') || document.getElementById('btn-open-nameqt-modal');
        if (!targetAnchor || !targetAnchor.parentNode) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-toggle-dict-panel';
        btn.className = 'btn-tool btn-dict-toggle-trigger';
        btn.innerHTML = '📖 Tra từ điển';
        btn.title = 'Bật / Tắt khung tra từ điển nhanh';

        btn.addEventListener('click', () => {
            if (!dictPanelEl) createDictLookupPanel();
            if (dictPanelEl.style.display === 'none') {
                dictPanelEl.style.display = 'flex';
                dictPanelEl.classList.remove('collapsed');
                if (currentQuery) displayLookupResults(currentQuery);
            } else {
                dictPanelEl.style.display = 'none';
            }
        });

        targetAnchor.parentNode.insertBefore(btn, targetAnchor.nextSibling);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 9. KHỞI CHẠY HỆ THỐNG
    function initDictionaryLookupModule() {
        createDictLookupPanel();
        ensureToolbarButton();
        document.addEventListener('selectionchange', handleSelectionChangeForDictionary);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDictionaryLookupModule);
    } else {
        initDictionaryLookupModule();
    }

    window.lookupWordInDictionary = function (word) {
        if (!dictPanelEl) createDictLookupPanel();
        dictPanelEl.style.display = 'flex';
        displayLookupResults(word);
    };
})();