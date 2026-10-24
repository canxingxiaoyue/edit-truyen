// =========================================================================
// QUẢN LÝ VIẾT TẮT & SAO LƯU GOOGLE DRIVE (GIAO DIỆN TỐI GIẢN, DỄ THƯƠNG)
// =========================================================================

(function () {
    let shortcuts = [];
    let isAutoReplaceEnabled = localStorage.getItem('shortcuts_enabled') !== 'false';
    let isComposing = false; // Bảo vệ IME Unikey / Pinyin
    let editingId = null;   // Trạng thái đang chỉnh sửa

    // 1. NẠP DỮ LIỆU CỤC BỘ
    function loadLocalShortcuts() {
        try {
            const data = localStorage.getItem('storyShortcuts');
            shortcuts = data ? JSON.parse(data) : [];
            if (!Array.isArray(shortcuts)) shortcuts = [];
        } catch (e) {
            console.error("Lỗi đọc dữ liệu viết tắt:", e);
            shortcuts = [];
        }
    }

    function saveLocalShortcuts() {
        localStorage.setItem('storyShortcuts', JSON.stringify(shortcuts));
    }

    // 2. RENDER DANH SÁCH THẺ VIẾT TẮT DỄ THƯƠNG
    function renderShortcutList(query = '') {
        const listBody = document.getElementById('shortcut-list-body');
        if (!listBody) return;

        let filtered = shortcuts;
        if (query) {
            const q = query.toLowerCase().trim();
            filtered = shortcuts.filter(s => 
                (s.shortcut || '').toLowerCase().includes(q) || 
                (s.replacement || '').toLowerCase().includes(q)
            );
        }

        filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (filtered.length === 0) {
            listBody.innerHTML = `
                <div class="shortcut-empty-box">
                    <span class="shortcut-empty-icon">🌱✨</span>
                    <div class="shortcut-empty-title">Chưa có phím tắt nào cả~</div>
                    <p class="shortcut-empty-desc">Thử thêm <code>dc</code> ➔ <code>được</code> hoặc <code>k</code> ➔ <code>không</code> để gõ truyện siêu tốc nhé!</p>
                </div>
            `;
            return;
        }

        listBody.innerHTML = filtered.map(s => `
            <div class="shortcut-card-item">
                <div class="shortcut-card-left">
                    <span class="shortcut-badge-pill">${escapeHtml(s.shortcut)}</span>
                    <span class="shortcut-arrow-icon">➔</span>
                    <span class="shortcut-val-text" title="${escapeHtml(s.replacement)}">${escapeHtml(s.replacement)}</span>
                </div>
                <div class="shortcut-card-actions">
                    <button type="button" class="btn-icon-cute" title="Copy nội dung" onclick="window.copyShortcutVal('${s.id}')">📋</button>
                    <button type="button" class="btn-icon-cute" title="Sửa phím tắt" onclick="window.editShortcut('${s.id}')">✏️</button>
                    <button type="button" class="btn-icon-cute danger" title="Xóa" onclick="window.deleteShortcut('${s.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // 3. THAO TÁC CRUD TRỰC TIẾP
    window.editShortcut = function (id) {
        const item = shortcuts.find(s => s.id === id);
        if (!item) return;

        const keyInput = document.getElementById('shortcut-key-input');
        const valInput = document.getElementById('shortcut-val-input');
        const btnAdd = document.getElementById('btn-add-shortcut');

        if (keyInput && valInput && btnAdd) {
            keyInput.value = item.shortcut;
            valInput.value = item.replacement;
            editingId = id;
            btnAdd.textContent = '💾 Cập nhật';
            btnAdd.classList.add('btn-primary');
            keyInput.focus();
        }
    };

    window.deleteShortcut = function (id) {
        const item = shortcuts.find(s => s.id === id);
        if (!item) return;
        if (!confirm(`Bạn có chắc muốn xóa phím tắt "${item.shortcut}"?`)) return;

        shortcuts = shortcuts.filter(s => s.id !== id);
        saveLocalShortcuts();
        renderShortcutList();
        if (typeof showToast === 'function') showToast(`🗑️ Đã xóa phím tắt "${item.shortcut}"`, 'var(--btn-info)');
    };

    window.copyShortcutVal = function (id) {
        const item = shortcuts.find(s => s.id === id);
        if (item && item.replacement && navigator.clipboard) {
            navigator.clipboard.writeText(item.replacement);
            if (typeof showToast === 'function') showToast(`📋 Đã copy: "${item.replacement}"`, 'var(--btn-success)');
        }
    };

    function resetFormState() {
        editingId = null;
        const keyInput = document.getElementById('shortcut-key-input');
        const valInput = document.getElementById('shortcut-val-input');
        const btnAdd = document.getElementById('btn-add-shortcut');
        if (keyInput) keyInput.value = '';
        if (valInput) valInput.value = '';
        if (btnAdd) {
            btnAdd.textContent = '➕ Thêm';
            btnAdd.classList.remove('btn-primary');
        }
    }

    // 4. XUẤT VÀ NHẬP JSON
    function exportShortcutsJSON() {
        if (shortcuts.length === 0) {
            if (typeof showToast === 'function') showToast('Danh sách viết tắt đang trống!', 'var(--btn-warning)');
            return;
        }
        const exportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            shortcuts: shortcuts
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edit-truyen-shortcuts-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof showToast === 'function') showToast('💾 Đã xuất file JSON thành công!', 'var(--btn-success)');
    }

    function importShortcutsJSON(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const parsed = JSON.parse(e.target.result);
                const items = Array.isArray(parsed) ? parsed : (parsed.shortcuts || []);
                if (!Array.isArray(items) || items.length === 0) {
                    throw new Error("File không chứa danh sách viết tắt hợp lệ!");
                }

                let addedCount = 0;
                items.forEach(item => {
                    if (item.shortcut && item.replacement) {
                        const existingIdx = shortcuts.findIndex(s => s.shortcut.toLowerCase() === item.shortcut.toLowerCase());
                        if (existingIdx >= 0) {
                            shortcuts[existingIdx].replacement = item.replacement;
                            shortcuts[existingIdx].updatedAt = Date.now();
                        } else {
                            shortcuts.push({
                                id: item.id || ('sc_' + Date.now() + Math.random().toString(36).substr(2, 4)),
                                shortcut: item.shortcut.trim(),
                                replacement: item.replacement.trim(),
                                updatedAt: item.updatedAt || Date.now()
                            });
                            addedCount++;
                        }
                    }
                });

                saveLocalShortcuts();
                renderShortcutList();
                if (typeof showToast === 'function') showToast(`📂 Đã nạp thành công ${items.length} phím tắt!`, 'var(--btn-success)');
            } catch (err) {
                console.error(err);
                if (typeof showToast === 'function') showToast('❌ File JSON không đúng định dạng!', 'var(--btn-danger)');
            }
        };
        reader.readAsText(file);
    }

    // 5. SAO LƯU & ĐỒNG BỘ GOOGLE DRIVE
    async function syncShortcutsWithDrive() {
        const statusEl = document.getElementById('shortcut-sync-status');
        if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.drive) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">⚠️ Vui lòng kết nối Google Drive trước.</span>`;
            if (typeof showToast === 'function') showToast("Vui lòng kết nối Google Drive trước!", 'var(--btn-warning)');
            return;
        }

        const fileName = 'edit-truyen-shortcuts.json';
        if (statusEl) statusEl.innerHTML = `<span style="color:#f59e0b;">Đang đồng bộ Google Drive... ⏳</span>`;

        try {
            const searchResponse = await gapi.client.drive.files.list({
                q: `name='${fileName}' and trashed=false`,
                fields: 'files(id, modifiedTime)',
                spaces: 'drive'
            });

            const files = searchResponse.result.files;

            if (files && files.length > 0) {
                // TỆP ĐÃ CÓ: TẢI VỀ & MERGE THÔNG MINH
                const fileId = files[0].id;
                const getResponse = await gapi.client.drive.files.get({
                    fileId: fileId,
                    alt: 'media'
                });

                let remoteShortcuts = [];
                if (getResponse.body) {
                    try {
                        const parsed = JSON.parse(getResponse.body);
                        remoteShortcuts = Array.isArray(parsed) ? parsed : (parsed.shortcuts || []);
                    } catch (e) {}
                }

                const mergedMap = new Map();
                shortcuts.forEach(s => mergedMap.set(s.id || s.shortcut, s));

                let mergedCount = 0;
                remoteShortcuts.forEach(remoteItem => {
                    const key = remoteItem.id || remoteItem.shortcut;
                    const localItem = mergedMap.get(key);
                    if (!localItem || (remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
                        mergedMap.set(key, remoteItem);
                        mergedCount++;
                    }
                });

                shortcuts = Array.from(mergedMap.values());
                saveLocalShortcuts();
                renderShortcutList();

                // LƯU BẢN ĐÃ GỘP LÊN DRIVE
                const boundary = '-------314159265358979323846';
                const delimiter = "\r\n--" + boundary + "\r\n";
                const close_delim = "\r\n--" + boundary + "--";
                const metadata = { 'mimeType': 'application/json' };
                const fileContent = JSON.stringify({ version: 1, shortcuts }, null, 2);

                const multipartRequestBody =
                    delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
                    delimiter + 'Content-Type: application/json\r\n\r\n' + fileContent + close_delim;

                await gapi.client.request({
                    'path': `/upload/drive/v3/files/${fileId}`,
                    'method': 'PATCH',
                    'params': { 'uploadType': 'multipart' },
                    'headers': { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                    'body': multipartRequestBody
                });

                if (statusEl) statusEl.innerHTML = `<span style="color:#10b981;">✓ Đồng bộ hoàn tất! (Gộp ${mergedCount} mục mới)</span>`;
                if (typeof showToast === 'function') showToast(`☁️ Đã đồng bộ ${shortcuts.length} viết tắt lên Drive!`, 'var(--btn-success)');
            } else {
                // TẠO TỆP MỚI TRÊN DRIVE
                const boundary = '-------314159265358979323846';
                const delimiter = "\r\n--" + boundary + "\r\n";
                const close_delim = "\r\n--" + boundary + "--";
                const metadata = {
                    'name': fileName,
                    'mimeType': 'application/json',
                    'description': 'Danh sách phím tắt tự động của công cụ edit truyện'
                };
                const folderId = localStorage.getItem('gdriveFolderId');
                if (folderId) metadata.parents = [folderId];

                const fileContent = JSON.stringify({ version: 1, shortcuts }, null, 2);
                const multipartRequestBody =
                    delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
                    delimiter + 'Content-Type: application/json\r\n\r\n' + fileContent + close_delim;

                await gapi.client.request({
                    'path': '/upload/drive/v3/files',
                    'method': 'POST',
                    'params': { 'uploadType': 'multipart' },
                    'headers': { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                    'body': multipartRequestBody
                });

                if (statusEl) statusEl.innerHTML = `<span style="color:#10b981;">✓ Đã sao lưu bản đầu tiên lên Google Drive!</span>`;
                if (typeof showToast === 'function') showToast(`☁️ Đã tạo tệp sao lưu viết tắt trên Drive!`, 'var(--btn-success)');
            }
        } catch (error) {
            console.error("Lỗi đồng bộ viết tắt:", error);
            if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">❌ Lỗi mạng hoặc hết phiên đăng nhập.</span>`;
        }
    }

    // 6. THUẬT TOÁN THAY THẾ TỰ ĐỘNG BẢO VỆ CON TRỎ (RANGE API)
    function handleAutoReplace(e) {
        if (!isAutoReplaceEnabled || isComposing) return;
        if (e.key !== ' ' && e.key !== 'Enter') return;

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return;

        const targetNode = range.startContainer;
        const targetCell = targetNode.nodeType === 3 ? targetNode.parentNode.closest('td[data-col]') : targetNode.closest('td[data-col]');

        if (!targetCell) return;
        const validCols = ['translation', 'edit', 'meaning', 'raw', 'qt'];
        if (!validCols.includes(targetCell.dataset.col)) return;
        if (targetNode.nodeType !== 3) return;

        const offset = range.startOffset;
        const textBeforeCaret = targetNode.textContent.slice(0, offset);

        const match = textBeforeCaret.match(/(?:^|[\s\xA0\n])([^\s\xA0\n]+)$/);
        if (!match) return;

        const wordTyped = match[1];
        const shortcutRule = shortcuts.find(s => s.shortcut === wordTyped);
        if (!shortcutRule) return;

        e.preventDefault();

        range.setStart(targetNode, offset - wordTyped.length);
        range.deleteContents();

        const textToInsert = shortcutRule.replacement + (e.key === ' ' ? ' ' : '\n');
        const newNode = document.createTextNode(textToInsert);
        range.insertNode(newNode);

        range.setStartAfter(newNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        targetCell.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 7. KHỞI CHẠY VÀ GÁN SỰ KIỆN GIAO DIỆN
    document.addEventListener('DOMContentLoaded', () => {
        loadLocalShortcuts();

        // Nút mở Modal
        const btnOpen = document.getElementById('btn-shortcuts-manager');
        const modal = document.getElementById('modal-shortcuts');

        if (btnOpen && modal) {
            btnOpen.addEventListener('click', () => {
                modal.classList.add('show');
                resetFormState();
                renderShortcutList();
                const statusEl = document.getElementById('shortcut-sync-status');
                if (statusEl) statusEl.innerHTML = '';
            });

            // Nút đóng modal
            const btnClose = document.getElementById('btn-close-shortcuts-modal');
            if (btnClose) btnClose.onclick = () => modal.classList.remove('show');

            // Nút Thêm / Lưu sửa
            const btnAdd = document.getElementById('btn-add-shortcut');
            const keyInput = document.getElementById('shortcut-key-input');
            const valInput = document.getElementById('shortcut-val-input');

            if (btnAdd && keyInput && valInput) {
                btnAdd.onclick = () => {
                    const key = keyInput.value.trim();
                    const val = valInput.value.trim();
                    if (!key || !val) {
                        if (typeof showToast === 'function') showToast('Vui lòng nhập đủ từ viết tắt và nội dung!', 'var(--btn-warning)');
                        return;
                    }

                    if (editingId) {
                        const item = shortcuts.find(s => s.id === editingId);
                        if (item) {
                            item.shortcut = key;
                            item.replacement = val;
                            item.updatedAt = Date.now();
                        }
                        if (typeof showToast === 'function') showToast(`✓ Đã cập nhật phím tắt "${key}"`, 'var(--btn-success)');
                    } else {
                        const existingIdx = shortcuts.findIndex(s => s.shortcut.toLowerCase() === key.toLowerCase());
                        if (existingIdx >= 0) {
                            if (!confirm(`Phím tắt "${key}" đã tồn tại. Bạn có muốn ghi đè?`)) return;
                            shortcuts[existingIdx].replacement = val;
                            shortcuts[existingIdx].updatedAt = Date.now();
                        } else {
                            shortcuts.push({
                                id: 'sc_' + Date.now() + Math.random().toString(36).substr(2, 4),
                                shortcut: key,
                                replacement: val,
                                updatedAt: Date.now()
                            });
                        }
                        if (typeof showToast === 'function') showToast(`✓ Đã thêm phím tắt "${key}"`, 'var(--btn-success)');
                    }

                    saveLocalShortcuts();
                    renderShortcutList();
                    resetFormState();
                    keyInput.focus();
                };
            }

            // Tìm kiếm
            const searchInput = document.getElementById('shortcut-search-input');
            if (searchInput) {
                searchInput.oninput = (e) => renderShortcutList(e.target.value);
            }

            // Bật/tắt gõ tắt
            const toggleEnable = document.getElementById('toggle-shortcut-enable');
            if (toggleEnable) {
                toggleEnable.checked = isAutoReplaceEnabled;
                toggleEnable.onchange = (e) => {
                    isAutoReplaceEnabled = e.target.checked;
                    localStorage.setItem('shortcuts_enabled', String(isAutoReplaceEnabled));
                };
            }

            // Xuất JSON
            const btnExport = document.getElementById('btn-export-shortcuts');
            if (btnExport) btnExport.onclick = exportShortcutsJSON;

            // Nhập JSON
            const btnImport = document.getElementById('btn-import-shortcuts-btn');
            const fileInput = document.getElementById('input-import-shortcuts-file');
            if (btnImport && fileInput) {
                btnImport.onclick = () => fileInput.click();
                fileInput.onchange = (e) => {
                    if (e.target.files && e.target.files[0]) {
                        importShortcutsJSON(e.target.files[0]);
                        fileInput.value = '';
                    }
                };
            }

            // Đồng bộ Drive
            const btnSync = document.getElementById('btn-sync-shortcuts-gdrive');
            if (btnSync) btnSync.onclick = syncShortcutsWithDrive;
        }

        // Lắng nghe phím gõ để Auto-Replace
        document.addEventListener('keydown', handleAutoReplace);
        document.addEventListener('compositionstart', () => isComposing = true);
        document.addEventListener('compositionend', () => isComposing = false);
    });
})();