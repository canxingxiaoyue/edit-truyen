// =========================================================================
// QUẢN LÝ VIẾT TẮT & SAO LƯU GOOGLE DRIVE
// =========================================================================

(function() {
    let shortcuts = [];
    let isAutoReplaceEnabled = localStorage.getItem('shortcuts_enabled') !== 'false';
    let isComposing = false; // Xử lý IME tiếng Việt / Trung

    // 1. TẢI DỮ LIỆU CỤC BỘ
    function loadLocalShortcuts() {
        try {
            const data = localStorage.getItem('storyShortcuts');
            if (data) {
                shortcuts = JSON.parse(data);
            }
        } catch (e) {
            console.error("Lỗi parse viết tắt cục bộ:", e);
            shortcuts = [];
        }
    }

    function saveLocalShortcuts() {
        localStorage.setItem('storyShortcuts', JSON.stringify(shortcuts));
    }

    // 2. GIAO DIỆN HỘP THOẠI MODAL
    function createShortcutsModal() {
        if (document.getElementById('modal-shortcuts')) return;

        const modal = document.createElement('div');
        modal.id = 'modal-shortcuts';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content shortcut-modal-box">
                <h3>⚡ Quản lý Viết tắt</h3>
                
                <div class="shortcut-header-actions">
                    <label class="shortcut-toggle-wrap">
                        <label class="switch-toggle">
                            <input type="checkbox" id="toggle-shortcut-enable" ${isAutoReplaceEnabled ? 'checked' : ''}>
                            <span class="slider-toggle"></span>
                        </label>
                        Bật tự động thay thế khi gõ (Space / Enter)
                    </label>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-file btn-sm" id="btn-sync-shortcuts-gdrive" title="Đồng bộ Viết tắt với Google Drive">☁️ Đồng bộ Drive</button>
                    </div>
                </div>

                <div class="shortcut-add-form">
                    <input type="text" id="shortcut-key-input" placeholder="Từ viết tắt (VD: dc)">
                    <input type="text" id="shortcut-val-input" placeholder="Nội dung thay thế (VD: được)">
                    <button class="btn-add" id="btn-add-shortcut">➕ Thêm</button>
                </div>

                <div class="modal-group">
                    <input type="text" id="shortcut-search-input" placeholder="🔍 Tìm kiếm viết tắt..." style="margin-bottom:10px;">
                    <div class="shortcut-list-container" id="shortcut-list-body">
                        <!-- Danh sách render ở đây -->
                    </div>
                </div>

                <div class="modal-actions">
                    <span id="shortcut-sync-status" style="margin-right:auto; font-size:12px; color:gray; align-self:center;"></span>
                    <button class="btn-file" id="btn-close-shortcuts-modal">Đóng</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Gán sự kiện UI
        const btnClose = modal.querySelector('#btn-close-shortcuts-modal');
        btnClose.onclick = () => modal.classList.remove('show');

        const toggleBtn = modal.querySelector('#toggle-shortcut-enable');
        toggleBtn.onchange = (e) => {
            isAutoReplaceEnabled = e.target.checked;
            localStorage.setItem('shortcuts_enabled', String(isAutoReplaceEnabled));
        };

        const keyInput = modal.querySelector('#shortcut-key-input');
        const valInput = modal.querySelector('#shortcut-val-input');
        const btnAdd = modal.querySelector('#btn-add-shortcut');

        btnAdd.onclick = () => {
            const key = keyInput.value.trim();
            const val = valInput.value.trim();
            if (!key || !val) {
                if (typeof showToast === 'function') showToast("Vui lòng nhập đủ viết tắt và nội dung!", "#f59e0b");
                return;
            }
            // Kiểm tra trùng
            const existingIdx = shortcuts.findIndex(s => s.shortcut === key);
            if (existingIdx >= 0) {
                if (!confirm(`Viết tắt "${key}" đã tồn tại. Bạn có muốn ghi đè?`)) return;
                shortcuts[existingIdx].replacement = val;
                shortcuts[existingIdx].updatedAt = Date.now();
            } else {
                shortcuts.push({
                    id: 'sc_' + Date.now() + Math.floor(Math.random()*1000),
                    shortcut: key,
                    replacement: val,
                    updatedAt: Date.now()
                });
            }
            saveLocalShortcuts();
            renderShortcutList();
            keyInput.value = ''; valInput.value = '';
            keyInput.focus();
        };

        const searchInput = modal.querySelector('#shortcut-search-input');
        searchInput.oninput = (e) => renderShortcutList(e.target.value);

        const btnSync = modal.querySelector('#btn-sync-shortcuts-gdrive');
        btnSync.onclick = syncShortcutsWithDrive;
    }

    function renderShortcutList(query = '') {
        const listBody = document.getElementById('shortcut-list-body');
        if (!listBody) return;

        let filtered = shortcuts;
        if (query) {
            const q = query.toLowerCase();
            filtered = shortcuts.filter(s => s.shortcut.toLowerCase().includes(q) || s.replacement.toLowerCase().includes(q));
        }

        // Sắp xếp mới nhất lên đầu
        filtered.sort((a, b) => b.updatedAt - a.updatedAt);

        if (filtered.length === 0) {
            listBody.innerHTML = `<div style="padding:20px; text-align:center; color:gray;">Chưa có viết tắt nào.</div>`;
            return;
        }

        listBody.innerHTML = filtered.map(s => `
            <div class="shortcut-item">
                <div style="display:flex; align-items:center; flex:1;">
                    <span class="shortcut-key">${escapeHtml(s.shortcut)}</span>
                    <span class="shortcut-arrow">➔</span>
                    <span class="shortcut-val">${escapeHtml(s.replacement)}</span>
                </div>
                <button class="btn-delete btn-sm" onclick="window.deleteShortcut('${s.id}')">🗑️ Xóa</button>
            </div>
        `).join('');
    }

    window.deleteShortcut = function(id) {
        if (!confirm("Xóa viết tắt này?")) return;
        shortcuts = shortcuts.filter(s => s.id !== id);
        saveLocalShortcuts();
        renderShortcutList();
    };

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 3. THUẬT TOÁN THAY THẾ KHI GÕ (RANGE API CAO CẤP)
    function handleAutoReplace(e) {
        if (!isAutoReplaceEnabled || isComposing) return;

        // Chỉ bắt phím Space hoặc Enter
        if (e.key !== ' ' && e.key !== 'Enter') return;

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        if (!range.collapsed) return; // Không thay thế nếu đang bôi đen

        // Chỉ hoạt động trong các ô cho phép chỉnh sửa của bảng
        const targetNode = range.startContainer;
        const targetCell = targetNode.nodeType === 3 ? targetNode.parentNode.closest('td[data-col]') : targetNode.closest('td[data-col]');
        
        if (!targetCell) return;
        const validCols = ['translation', 'edit', 'meaning', 'raw', 'qt'];
        if (!validCols.includes(targetCell.dataset.col)) return;

        // Chỉ thao tác trên TextNode
        if (targetNode.nodeType !== 3) return;

        const offset = range.startOffset;
        const textBeforeCaret = targetNode.textContent.slice(0, offset);

        // Lấy TỪ CUỐI CÙNG sát ranh giới con trỏ (phân cách bởi dấu cách hoặc ký tự xuống dòng)
        // Regex: Cắt từ khoảng trắng cuối cùng hoặc đầu dòng đến sát con trỏ
        const match = textBeforeCaret.match(/(?:^|[\s\xA0\n])([^\s\xA0\n]+)$/);
        if (!match) return;

        const wordTyped = match[1];

        // Tra cứu viết tắt (Khớp chính xác 100%)
        const shortcutRule = shortcuts.find(s => s.shortcut === wordTyped);
        if (!shortcutRule) return;

        // Nếu khớp, CHẶN sự kiện gõ Space/Enter mặc định để tự xử lý
        e.preventDefault();

        // 1. Xóa từ viết tắt đi
        range.setStart(targetNode, offset - wordTyped.length);
        range.deleteContents();

        // 2. Chèn từ mới + Phím vừa gõ (Space hoặc Xuống dòng)
        const textToInsert = shortcutRule.replacement + (e.key === ' ' ? ' ' : '\n');
        const newNode = document.createTextNode(textToInsert);
        range.insertNode(newNode);

        // 3. Di chuyển con trỏ ra sau chữ vừa chèn
        range.setStartAfter(newNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        // 4. Kích hoạt sự kiện input để hệ thống (editor.js) lưu lại lịch sử thay đổi
        targetCell.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 4. SAO LƯU VÀ ĐỒNG BỘ GOOGLE DRIVE
    async function syncShortcutsWithDrive() {
        const statusEl = document.getElementById('shortcut-sync-status');
        
        // Kiểm tra xem gapi đã load và đăng nhập chưa
        if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.drive) {
            statusEl.innerHTML = `<span style="color:#ef4444;">Vui lòng kết nối Google Drive ở tab Trang chủ trước.</span>`;
            if (typeof showToast === 'function') showToast("Vui lòng kết nối Google Drive trước!", "#ef4444");
            return;
        }

        const fileName = 'edit-truyen-shortcuts.json';
        statusEl.innerHTML = `<span style="color:#f59e0b;">Đang đồng bộ... ⏳</span>`;

        try {
            // A. TÌM FILE TRÊN DRIVE
            const searchResponse = await gapi.client.drive.files.list({
                q: `name='${fileName}' and trashed=false`,
                fields: 'files(id, modifiedTime)',
                spaces: 'drive'
            });

            const files = searchResponse.result.files;
            
            if (files && files.length > 0) {
                // TỆP ĐÃ TỒN TẠI -> TẢI VỀ MERGE (GỘP)
                const fileId = files[0].id;
                const getResponse = await gapi.client.drive.files.get({
                    fileId: fileId,
                    alt: 'media'
                });
                
                let remoteData = [];
                if (getResponse.body) {
                    try { remoteData = JSON.parse(getResponse.body); } catch(e){}
                }

                // MERGE: Ưu tiên dữ liệu mới hơn dựa vào updatedAt
                const mergedMap = new Map();
                
                // Nạp local vào map
                shortcuts.forEach(s => mergedMap.set(s.id, s));
                
                // Duyệt remote, nếu trùng ID mà remote mới hơn thì đè, chưa có thì thêm
                let changesCount = 0;
                remoteData.forEach(remoteItem => {
                    const localItem = mergedMap.get(remoteItem.id);
                    if (!localItem || (remoteItem.updatedAt > localItem.updatedAt)) {
                        mergedMap.set(remoteItem.id, remoteItem);
                        changesCount++;
                    }
                });

                shortcuts = Array.from(mergedMap.values());
                saveLocalShortcuts();
                renderShortcutList();

                // LƯU BẢN ĐÃ GỘP NGƯỢC LÊN DRIVE
                const boundary = '-------314159265358979323846';
                const delimiter = "\r\n--" + boundary + "\r\n";
                const close_delim = "\r\n--" + boundary + "--";
                
                const metadata = { 'mimeType': 'application/json' };
                const fileContent = JSON.stringify(shortcuts);
                const multipartRequestBody =
                    delimiter +
                    'Content-Type: application/json\r\n\r\n' +
                    JSON.stringify(metadata) +
                    delimiter +
                    'Content-Type: application/json\r\n\r\n' +
                    fileContent +
                    close_delim;

                await gapi.client.request({
                    'path': `/upload/drive/v3/files/${fileId}`,
                    'method': 'PATCH',
                    'params': {'uploadType': 'multipart'},
                    'headers': { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                    'body': multipartRequestBody
                });

                statusEl.innerHTML = `<span style="color:#10b981;">Đồng bộ thành công! Đã nạp ${changesCount} mục mới từ Drive.</span>`;
                if (typeof showToast === 'function') showToast(`✅ Đồng bộ Viết tắt thành công!`, "#10b981");

            } else {
                // TỆP CHƯA TỒN TẠI -> TẠO MỚI TRÊN DRIVE
                const boundary = '-------314159265358979323846';
                const delimiter = "\r\n--" + boundary + "\r\n";
                const close_delim = "\r\n--" + boundary + "--";

                const metadata = {
                    'name': fileName,
                    'mimeType': 'application/json',
                    'description': 'File lưu cấu hình viết tắt của công cụ edit truyện'
                };
                // Nếu có thư mục CongCuEdit_Projects, lưu vào đó. Nếu không, lưu ngoài root
                const folderId = localStorage.getItem('gdriveFolderId');
                if (folderId) metadata.parents = [folderId];

                const fileContent = JSON.stringify(shortcuts);
                const multipartRequestBody =
                    delimiter +
                    'Content-Type: application/json\r\n\r\n' +
                    JSON.stringify(metadata) +
                    delimiter +
                    'Content-Type: application/json\r\n\r\n' +
                    fileContent +
                    close_delim;

                await gapi.client.request({
                    'path': '/upload/drive/v3/files',
                    'method': 'POST',
                    'params': {'uploadType': 'multipart'},
                    'headers': { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                    'body': multipartRequestBody
                });

                statusEl.innerHTML = `<span style="color:#10b981;">Đã tạo tệp sao lưu mới trên Google Drive!</span>`;
                if (typeof showToast === 'function') showToast(`✅ Đã tạo tệp Viết tắt trên Drive!`, "#10b981");
            }
        } catch (error) {
            console.error("Lỗi đồng bộ viết tắt:", error);
            statusEl.innerHTML = `<span style="color:#ef4444;">Lỗi đồng bộ. Hãy kiểm tra kết nối mạng.</span>`;
        }
    }

    // 5. KHỞI CHẠY HỆ THỐNG
    document.addEventListener('DOMContentLoaded', () => {
        loadLocalShortcuts();

        // Gắn sự kiện nút mở Modal
        const btnOpen = document.getElementById('btn-shortcuts-manager');
        if (btnOpen) {
            btnOpen.addEventListener('click', () => {
                createShortcutsModal();
                const modal = document.getElementById('modal-shortcuts');
                modal.classList.add('show');
                renderShortcutList();
                document.getElementById('shortcut-sync-status').innerHTML = '';
            });
        }

        // Lắng nghe phím gõ để Auto-Replace
        document.addEventListener('keydown', handleAutoReplace);
        
        // Quản lý trạng thái bộ gõ IME (Không replace khi đang gõ Telex/Pinyin chưa chốt từ)
        document.addEventListener('compositionstart', () => isComposing = true);
        document.addEventListener('compositionend', () => isComposing = false);
    });

})();