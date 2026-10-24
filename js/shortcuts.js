// =========================================================================
// QUẢN LÝ VIẾT TẮT & TỰ ĐỘNG THAY THẾ KHI GÕ (TÍCH HỢP TỆP VietTat.json)
// =========================================================================

(function () {
    const STORAGE_KEY = 'storyShortcuts';
    const ENABLED_KEY = 'shortcuts_enabled';

    let shortcuts = [];
    let isAutoReplaceEnabled = localStorage.getItem(ENABLED_KEY) !== 'false';
    let isComposing = false; // Bảo vệ IME Unikey / EVKey / Pinyin
    let editingId = null;

    // 1. QUẢN LÝ DỮ LIỆU CỤC BỘ
    function loadLocalShortcuts() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            shortcuts = data ? JSON.parse(data) : [];
            if (!Array.isArray(shortcuts)) shortcuts = [];
        } catch (e) {
            console.error("Lỗi đọc dữ liệu viết tắt:", e);
            shortcuts = [];
        }
    }

    function saveLocalShortcuts() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
    }

    // 2. RENDER DANH SÁCH VIẾT TẮT
    function renderShortcutList(query = '') {
        const listBody = document.getElementById('shortcut-list-body');
        const countSummary = document.getElementById('shortcut-count-summary');
        if (!listBody) return;

        let filtered = shortcuts;
        const q = (query || '').toLowerCase().trim();
        if (q) {
            filtered = shortcuts.filter(s => 
                (s.shortcut || '').toLowerCase().includes(q) || 
                (s.replacement || '').toLowerCase().includes(q)
            );
        }

        filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (countSummary) {
            countSummary.textContent = q 
                ? `Tìm thấy: ${filtered.length} / ${shortcuts.length} viết tắt`
                : `Tổng số: ${shortcuts.length} viết tắt`;
        }

        // Trạng thái 1: Chưa có dữ liệu
        if (shortcuts.length === 0) {
            listBody.innerHTML = `
                <div class="shortcut-empty-compact">
                    <span class="empty-icon">🌱✨</span>
                    <div class="empty-title">Chưa có phím tắt nào cả~</div>
                    <div class="empty-hint">Thêm các cặp từ thường dùng như <code>dc</code> ➔ <code>được</code> để gõ truyện siêu tốc nhé!</div>
                </div>
            `;
            listBody.classList.add('is-empty');
            return;
        }

        // Trạng thái 2: Có dữ liệu nhưng tìm kiếm không khớp
        if (filtered.length === 0 && q) {
            listBody.innerHTML = `
                <div class="shortcut-empty-compact">
                    <span class="empty-icon">🔍</span>
                    <div class="empty-title">Không tìm thấy viết tắt phù hợp</div>
                    <div class="empty-hint">Không có mục nào chứa từ khóa "<b>${escapeHtml(q)}</b>"</div>
                </div>
            `;
            listBody.classList.add('is-empty');
            return;
        }

        listBody.classList.remove('is-empty');
        listBody.innerHTML = filtered.map(s => `
            <div class="shortcut-item-row" data-id="${s.id}">
                <div class="shortcut-item-main">
                    <span class="shortcut-pill">${escapeHtml(s.shortcut)}</span>
                    <span class="shortcut-arrow">➔</span>
                    <span class="shortcut-replacement" title="${escapeHtml(s.replacement)}">${escapeHtml(s.replacement)}</span>
                </div>
                <div class="shortcut-item-actions">
                    <button type="button" class="btn-action-icon" title="Sao chép nội dung" onclick="window.copyShortcutText('${s.id}')">📋</button>
                    <button type="button" class="btn-action-icon" title="Sửa viết tắt" onclick="window.editShortcutItem('${s.id}')">✏️</button>
                    <button type="button" class="btn-action-icon danger" title="Xóa viết tắt" onclick="window.deleteShortcutItem('${s.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // 3. THAO TÁC CRUD TRỰC TIẾP
    window.editShortcutItem = function (id) {
        const item = shortcuts.find(s => s.id === id);
        if (!item) return;

        const keyInput = document.getElementById('shortcut-key-input');
        const valInput = document.getElementById('shortcut-val-input');
        const btnAdd = document.getElementById('btn-add-shortcut');
        const btnCancel = document.getElementById('btn-cancel-edit-shortcut');

        if (keyInput && valInput && btnAdd) {
            keyInput.value = item.shortcut;
            valInput.value = item.replacement;
            editingId = id;
            btnAdd.textContent = '💾 Cập nhật';
            btnAdd.classList.add('btn-primary');
            if (btnCancel) btnCancel.style.display = 'inline-flex';
            keyInput.focus();
        }
    };

    window.deleteShortcutItem = function (id) {
        const item = shortcuts.find(s => s.id === id);
        if (!item) return;
        if (!confirm(`Bạn có chắc muốn xóa viết tắt "${item.shortcut}"?`)) return;

        shortcuts = shortcuts.filter(s => s.id !== id);
        saveLocalShortcuts();
        if (editingId === id) resetForm();
        renderShortcutList(document.getElementById('shortcut-search-input')?.value || '');
        if (typeof showToast === 'function') showToast(`🗑️ Đã xóa phím tắt "${item.shortcut}"`, 'var(--btn-info)');
    };

    window.copyShortcutText = function (id) {
        const item = shortcuts.find(s => s.id === id);
        if (item && item.replacement && navigator.clipboard) {
            navigator.clipboard.writeText(item.replacement);
            if (typeof showToast === 'function') showToast(`📋 Đã copy: "${item.replacement}"`, 'var(--btn-success)');
        }
    };

    function resetForm() {
        editingId = null;
        const keyInput = document.getElementById('shortcut-key-input');
        const valInput = document.getElementById('shortcut-val-input');
        const btnAdd = document.getElementById('btn-add-shortcut');
        const btnCancel = document.getElementById('btn-cancel-edit-shortcut');

        if (keyInput) keyInput.value = '';
        if (valInput) valInput.value = '';
        if (btnAdd) {
            btnAdd.textContent = '➕ Thêm';
            btnAdd.classList.remove('btn-primary');
        }
        if (btnCancel) btnCancel.style.display = 'none';
    }

    // 4. XUẤT VÀ NHẬP FILE JSON
    function exportShortcutsJSON() {
        if (shortcuts.length === 0) {
            if (typeof showToast === 'function') showToast('Danh sách viết tắt đang trống!', 'var(--btn-warning)');
            return;
        }
        const exportData = {
            schemaVersion: 1,
            fileName: 'VietTat.json',
            exportedAt: new Date().toISOString(),
            shortcuts: shortcuts
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'VietTat.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof showToast === 'function') showToast(`💾 Đã xuất file VietTat.json thành công!`, 'var(--btn-success)');
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

                let updatedCount = 0;
                items.forEach(item => {
                    const k = (item.shortcut || '').trim();
                    const v = (item.replacement || '').trim();
                    if (k && v) {
                        const existingIdx = shortcuts.findIndex(s => s.shortcut.toLowerCase() === k.toLowerCase());
                        if (existingIdx >= 0) {
                            shortcuts[existingIdx].replacement = v;
                            shortcuts[existingIdx].updatedAt = Date.now();
                        } else {
                            shortcuts.push({
                                id: item.id || ('sc_' + Date.now() + Math.random().toString(36).substr(2, 4)),
                                shortcut: k,
                                replacement: v,
                                updatedAt: item.updatedAt || Date.now()
                            });
                        }
                        updatedCount++;
                    }
                });

                saveLocalShortcuts();
                renderShortcutList();
                if (typeof showToast === 'function') showToast(`📂 Đã nạp thành công ${updatedCount} viết tắt!`, 'var(--btn-success)');
            } catch (err) {
                console.error(err);
                if (typeof showToast === 'function') showToast('❌ File JSON không đúng định dạng viết tắt!', 'var(--btn-danger)');
            }
        };
        reader.readAsText(file);
    }

    // 5. ĐỒNG BỘ VÀ TẢI TỪ GOOGLE DRIVE (TẬN DỤNG CƠ CHẾ js/google-drive.js)
    async function syncShortcutsWithDrive() {
        const statusEl = document.getElementById('shortcut-sync-status');
        if (typeof isGDriveConnected !== 'function' || !isGDriveConnected()) {
            if (statusEl) statusEl.innerHTML = `<span class="status-error">⚠️ Chưa kết nối Google Drive.</span>`;
            if (typeof showToast === 'function') showToast("Vui lòng kết nối Google Drive ở Trang chủ trước!", 'var(--btn-warning)');
            return;
        }

        if (statusEl) statusEl.innerHTML = `<span class="status-syncing">Đang đồng bộ VietTat.json... ⏳</span>`;

        try {
            // A. Đọc file VietTat.json từ Drive về trước để gộp 2 chiều (tránh mất dữ liệu)
            const loadRes = await gdriveLoadShortcuts();
            if (!loadRes.success) {
                throw new Error(loadRes.reason || 'load_failed');
            }

            const remoteShortcuts = loadRes.data || [];

            // B. Gộp dữ liệu thông minh theo updatedAt
            const mergedMap = new Map();
            shortcuts.forEach(s => mergedMap.set(s.id || s.shortcut.toLowerCase(), s));

            let mergedCount = 0;
            remoteShortcuts.forEach(remoteItem => {
                const key = remoteItem.id || (remoteItem.shortcut || '').toLowerCase();
                if (!key) return;
                const localItem = mergedMap.get(key);
                if (!localItem || (remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
                    mergedMap.set(key, remoteItem);
                    mergedCount++;
                }
            });

            shortcuts = Array.from(mergedMap.values());
            saveLocalShortcuts();
            renderShortcutList(document.getElementById('shortcut-search-input')?.value || '');

            // C. Ghi đè danh sách mới nhất lên file VietTat.json duy nhất
            const saveRes = await gdriveSaveShortcuts(shortcuts);
            if (!saveRes.success) {
                throw new Error(saveRes.reason || 'save_failed');
            }

            const now = new Date().toLocaleTimeString('vi-VN');
            if (statusEl) statusEl.innerHTML = `<span class="status-success">✓ Đã đồng bộ VietTat.json (${now})</span>`;
            if (typeof showToast === 'function') showToast(`☁️ Đã đồng bộ ${shortcuts.length} viết tắt lên VietTat.json!`, 'var(--btn-success)');
        } catch (error) {
            console.error("Lỗi đồng bộ viết tắt:", error);
            if (statusEl) statusEl.innerHTML = `<span class="status-error">❌ Lỗi đồng bộ Google Drive.</span>`;
            if (typeof showToast === 'function') showToast("Lỗi đồng bộ Google Drive!", 'var(--btn-danger)');
        }
    }

    async function pullShortcutsFromDrive() {
        const statusEl = document.getElementById('shortcut-sync-status');
        if (typeof isGDriveConnected !== 'function' || !isGDriveConnected()) {
            if (typeof showToast === 'function') showToast("Vui lòng kết nối Google Drive trước!", 'var(--btn-warning)');
            return;
        }

        if (!confirm("Bạn có chắc muốn tải dữ liệu từ tệp VietTat.json trên Google Drive về để khôi phục danh sách viết tắt?")) {
            return;
        }

        if (statusEl) statusEl.innerHTML = `<span class="status-syncing">Đang tải từ VietTat.json... ⏳</span>`;

        try {
            const loadRes = await gdriveLoadShortcuts();
            if (!loadRes.success) {
                throw new Error(loadRes.reason || 'load_failed');
            }

            if (loadRes.notFound || !loadRes.data || loadRes.data.length === 0) {
                if (statusEl) statusEl.innerHTML = `<span class="status-warning">Chưa có tệp VietTat.json nào trên Drive.</span>`;
                if (typeof showToast === 'function') showToast("Chưa có tệp VietTat.json trên Google Drive!", 'var(--btn-warning)');
                return;
            }

            shortcuts = loadRes.data;
            saveLocalShortcuts();
            renderShortcutList();
            resetForm();

            const now = new Date().toLocaleTimeString('vi-VN');
            if (statusEl) statusEl.innerHTML = `<span class="status-success">✓ Đã khôi phục ${shortcuts.length} viết tắt (${now})</span>`;
            if (typeof showToast === 'function') showToast(`📥 Đã khôi phục ${shortcuts.length} viết tắt từ VietTat.json!`, 'var(--btn-success)');
        } catch (error) {
            console.error("Lỗi tải viết tắt từ Drive:", error);
            if (statusEl) statusEl.innerHTML = `<span class="status-error">❌ Lỗi tải dữ liệu từ Google Drive.</span>`;
            if (typeof showToast === 'function') showToast("Lỗi khi tải từ Google Drive!", 'var(--btn-danger)');
        }
    }

    // 6. THUẬT TOÁN TỰ ĐỘNG THAY THẾ KHI GÕ (RANGE API CAO CẤP)
    function handleAutoReplace(e) {
        if (!isAutoReplaceEnabled || isComposing) return;
        if (e.key !== ' ' && e.key !== 'Enter') return;

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return;

        const targetNode = range.startContainer;
        const targetCell = targetNode.nodeType === 3 
            ? targetNode.parentNode.closest('td[data-col]') 
            : targetNode.closest('td[data-col]');

        if (!targetCell) return;

        // Chỉ thay thế trong các cột soạn thảo văn bản
        const validCols = ['translation', 'edit', 'meaning', 'raw', 'qt'];
        if (!validCols.includes(targetCell.dataset.col)) return;
        if (targetNode.nodeType !== 3) return;

        const offset = range.startOffset;
        const textBeforeCaret = targetNode.textContent.slice(0, offset);

        // Lấy từ cuối cùng sát trước con trỏ (tách biệt bởi khoảng trắng / ngắt dòng)
        const match = textBeforeCaret.match(/(?:^|[\s\xA0\n])([^\s\xA0\n]+)$/);
        if (!match) return;

        const wordTyped = match[1];
        const rule = shortcuts.find(s => s.shortcut === wordTyped);
        if (!rule) return;

        // Chặn phím Space/Enter mặc định để tự thay thế chuẩn xác
        e.preventDefault();

        // Xóa từ viết tắt
        range.setStart(targetNode, offset - wordTyped.length);
        range.deleteContents();

        // Chèn nội dung thay thế + ký tự Space/Enter vừa gõ
        const textToInsert = rule.replacement + (e.key === ' ' ? ' ' : '\n');
        const newNode = document.createTextNode(textToInsert);
        range.insertNode(newNode);

        // Đặt con trỏ ngay sau nội dung vừa chèn
        range.setStartAfter(newNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        // Kích hoạt sự kiện input để lưu dữ liệu bảng & Undo/Redo
        targetCell.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 7. KHỞI CHẠY VÀ GÁN SỰ KIỆN GIAO DIỆN
    document.addEventListener('DOMContentLoaded', () => {
        loadLocalShortcuts();

        const btnOpen = document.getElementById('btn-shortcuts-manager');
        const modal = document.getElementById('modal-shortcuts');

        if (btnOpen && modal) {
            btnOpen.addEventListener('click', () => {
                modal.classList.add('show');
                resetForm();
                renderShortcutList();
                const statusEl = document.getElementById('shortcut-sync-status');
                if (statusEl) statusEl.innerHTML = '';
            });

            // Các nút đóng modal
            modal.querySelectorAll('.btn-close-modal-trigger').forEach(btn => {
                btn.onclick = () => modal.classList.remove('show');
            });

            // Nút Thêm / Cập nhật
            const btnAdd = document.getElementById('btn-add-shortcut');
            const btnCancel = document.getElementById('btn-cancel-edit-shortcut');
            const keyInput = document.getElementById('shortcut-key-input');
            const valInput = document.getElementById('shortcut-val-input');

            if (btnAdd && keyInput && valInput) {
                btnAdd.onclick = () => {
                    const key = keyInput.value.trim();
                    const val = valInput.value.trim();
                    if (!key || !val) {
                        if (typeof showToast === 'function') showToast('Vui lòng nhập cả từ viết tắt và nội dung thay thế!', 'var(--btn-warning)');
                        return;
                    }

                    if (editingId) {
                        const item = shortcuts.find(s => s.id === editingId);
                        if (item) {
                            item.shortcut = key;
                            item.replacement = val;
                            item.updatedAt = Date.now();
                        }
                        if (typeof showToast === 'function') showToast(`✓ Đã cập nhật viết tắt "${key}"`, 'var(--btn-success)');
                    } else {
                        const existingIdx = shortcuts.findIndex(s => s.shortcut.toLowerCase() === key.toLowerCase());
                        if (existingIdx >= 0) {
                            if (!confirm(`Viết tắt "${key}" đã tồn tại. Bạn có muốn ghi đè nội dung mới?`)) return;
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
                        if (typeof showToast === 'function') showToast(`✓ Đã thêm viết tắt "${key}"`, 'var(--btn-success)');
                    }

                    saveLocalShortcuts();
                    resetForm();
                    renderShortcutList(document.getElementById('shortcut-search-input')?.value || '');
                    keyInput.focus();
                };
            }

            if (btnCancel) {
                btnCancel.onclick = resetForm;
            }

            // Tìm kiếm trực tiếp
            const searchInput = document.getElementById('shortcut-search-input');
            if (searchInput) {
                searchInput.oninput = (e) => renderShortcutList(e.target.value);
            }

            // Công tắc Bật / Tắt gõ tắt
            const toggleEnable = document.getElementById('toggle-shortcut-enable');
            if (toggleEnable) {
                toggleEnable.checked = isAutoReplaceEnabled;
                toggleEnable.onchange = (e) => {
                    isAutoReplaceEnabled = e.target.checked;
                    localStorage.setItem(ENABLED_KEY, String(isAutoReplaceEnabled));
                    if (typeof showToast === 'function') {
                        showToast(isAutoReplaceEnabled ? "⚡ Đã bật tự động thay thế viết tắt" : "⏸️ Đã tắt tự động thay thế viết tắt", "var(--btn-info)");
                    }
                };
            }

            // Đồng bộ Drive (Upload & Merge)
            const btnSync = document.getElementById('btn-sync-shortcuts-gdrive');
            if (btnSync) btnSync.onclick = syncShortcutsWithDrive;

            // Tải từ Drive (Restore)
            const btnPull = document.getElementById('btn-pull-shortcuts-gdrive');
            if (btnPull) btnPull.onclick = pullShortcutsFromDrive;

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
        }

        // Lắng nghe sự kiện bàn phím
        document.addEventListener('keydown', handleAutoReplace);
        document.addEventListener('compositionstart', () => isComposing = true);
        document.addEventListener('compositionend', () => isComposing = false);
    });
})();