// =========================================================================
// QUẢN LÝ LỊCH SỬ DỊCH & NAME QT (CÁCH LY DỰ ÁN - TÍCH HỢP GOOGLE DRIVE & KIỂM TRA TRÙNG TÊN)
// =========================================================================
let editingFileId = null;

// HÀM BẢO VỆ CHỐNG LỖI KHI RENDER TÊN FILE
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function openHistoryModal(type) {
    const modal = document.getElementById('modal-history');
    if (!modal) return;
    renderHistoryList(type);
    modal.classList.add('show');
}

// 1. XÓA MỘT BẢN GHI THEO TIMESTAMP (CHỈ XÓA LỊCH SỬ, TUYỆT ĐỐI KHÔNG LƯU DỰ ÁN)
function deleteHistoryEntry(type, timestamp) {
    const storageKey = type === 'editor' ? 'translationHistory' : 'metadataHistory';
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(storageKey)) || [];
    } catch (e) { history = []; }
    
    if (confirm("🗑️ Bạn có chắc chắn muốn xóa bản sao lưu này không?")) {
        history = history.filter(item => item.timestamp !== timestamp);
        try {
            localStorage.setItem(storageKey, JSON.stringify(history));
        } catch (err) {
            console.error("Lỗi cập nhật localStorage:", err);
        }
        
        // CHỈ CẬP NHẬT LẠI GIAO DIỆN MODAL - KHÔNG KÍCH HOẠT LƯU DỰ ÁN
        renderHistoryList(type); 
        showToast("Đã xóa bản sao lưu!", "var(--btn-danger)");
    }
}

// 2. XÓA TOÀN BỘ LỊCH SỬ CỦA 1 NGÀY (CHỈ XÓA LỊCH SỬ, TUYỆT ĐỐI KHÔNG LƯU DỰ ÁN)
function deleteHistoryByDate(type, dateStr, entriesToDelete) {
    if (confirm(`🗑️ Bạn có muốn XÓA SẠCH toàn bộ lịch sử của ngày "${dateStr}" không?`)) {
        const storageKey = type === 'editor' ? 'translationHistory' : 'metadataHistory';
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(storageKey)) || [];
        } catch (e) { history = []; }
        
        const timestampsToDelete = new Set(entriesToDelete.map(e => e.timestamp));
        history = history.filter(entry => !timestampsToDelete.has(entry.timestamp));
        
        try {
            localStorage.setItem(storageKey, JSON.stringify(history));
        } catch (err) {
            console.error("Lỗi cập nhật localStorage:", err);
        }
        
        // CHỈ CẬP NHẬT LẠI GIAO DIỆN MODAL - KHÔNG KÍCH HOẠT LƯU DỰ ÁN
        renderHistoryList(type); 
        showToast(`🗑️ Đã xóa sạch lịch sử ngày ${dateStr}!`, "var(--btn-danger)");
    }
}

// 3. XÓA TẤT CẢ LỊCH SỬ (CHỈ LÀM RỖNG LỊCH SỬ, TUYỆT ĐỐI KHÔNG LƯU DỰ ÁN)
function deleteAllHistory(type) {
    if (confirm("⚠️ NGUY HIỂM: Xóa SẠCH TOÀN BỘ lịch sử hiện có? Hành động này không thể hoàn tác!")) {
        const storageKey = type === 'editor' ? 'translationHistory' : 'metadataHistory';
        try {
            localStorage.setItem(storageKey, "[]");
        } catch (err) {
            console.error("Lỗi cập nhật localStorage:", err);
        }
        
        // CHỈ CẬP NHẬT LẠI GIAO DIỆN MODAL - KHÔNG KÍCH HOẠT LƯU DỰ ÁN
        renderHistoryList(type); 
        showToast("🗑️ Đã dọn sạch toàn bộ lịch sử!", "var(--btn-danger)");
    }
}

// 4. VẼ GIAO DIỆN LỊCH SỬ THEO TỪNG NGÀY (LƯU VĨNH VIỄN, KHÔNG GIỚI HẠN NHÂN TẠO)
function renderHistoryList(type) {
    const historyListDiv = document.getElementById('history-list');
    const modalTitle = document.querySelector('#modal-history h3');
    const modalDesc = document.querySelector('#modal-history .modal-desc');
    const modalActions = document.querySelector('#modal-history .modal-actions');
    if (!historyListDiv) return;
    
    let history = [];
    try {
        if (type === 'editor') {
            if (modalTitle) modalTitle.innerHTML = '🕒 Lịch sử sửa đổi (Dịch thuật)';
            if (modalDesc) modalDesc.innerHTML = 'Lịch sử được lưu trữ theo từng ngày vĩnh viễn đến khi bạn chủ động xóa.';
            history = JSON.parse(localStorage.getItem('translationHistory')) || [];
        } else {
            if (modalTitle) modalTitle.innerHTML = '🕒 Lịch sử sửa đổi (Thông tin truyện)';
            if (modalDesc) modalDesc.innerHTML = 'Bản sao lưu thông tin nhân vật, xưng hô, từ ngữ theo từng ngày.';
            history = JSON.parse(localStorage.getItem('metadataHistory')) || [];
        }
    } catch (e) { history = []; }

    // Quản lý nút Xóa Tất Cả
    if (modalActions) {
        const oldDelAllBtn = document.getElementById('btn-delete-all-history');
        if (oldDelAllBtn) oldDelAllBtn.remove();

        if (history.length > 0) {
            const btnDelAll = document.createElement('button');
            btnDelAll.id = 'btn-delete-all-history';
            btnDelAll.className = 'btn-danger';
            btnDelAll.innerHTML = '🗑️ Xóa tất cả lịch sử';
            btnDelAll.style.marginRight = 'auto';
            btnDelAll.onclick = () => deleteAllHistory(type);
            modalActions.insertBefore(btnDelAll, modalActions.firstChild);
        }
    }

    if (!Array.isArray(history) || history.length === 0) {
        historyListDiv.innerHTML = '<p style="text-align:center; color:gray; padding: 20px 0; font-style:italic;">Chưa có lịch sử sửa đổi nào được lưu.</p>';
        return;
    }

    // Sắp xếp mới nhất lên đầu để tiện tra cứu
    let processedHistory = [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // GOM NHÓM THEO TỪNG NGÀY CHUẨN XÁC
    const groups = {};
    const todayLocaleStr = new Date().toLocaleDateString('vi-VN');

    processedHistory.forEach(entry => {
        const ts = Number(entry.timestamp) || Date.now();
        const dateObj = new Date(ts);
        let dateStr = dateObj.toLocaleDateString('vi-VN');
        
        if (dateStr === todayLocaleStr) {
            dateStr = "Hôm nay (" + dateStr + ")";
        }

        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(entry);
    });

    historyListDiv.innerHTML = '';
    let isFirstGroup = true; 
    
    for (const [dateStr, entries] of Object.entries(groups)) {
        const detailsEl = document.createElement('details');
        detailsEl.className = 'history-date-group';
        if (isFirstGroup) { detailsEl.open = true; isFirstGroup = false; } 

        const summaryEl = document.createElement('summary');
        summaryEl.className = 'history-date-header';
        summaryEl.innerHTML = `📅 ${dateStr} <span style="font-size:0.8rem; font-weight:normal; color:gray; flex-grow:1;">(${entries.length} bản lưu)</span>`;
        
        // NÚT XÓA NGÀY NÀY
        const delDateBtn = document.createElement('button');
        delDateBtn.className = 'btn-danger';
        delDateBtn.innerHTML = '🗑️ Xóa ngày này';
        delDateBtn.style.padding = '3px 8px';
        delDateBtn.style.fontSize = '0.75rem';
        delDateBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteHistoryByDate(type, dateStr, entries);
        };
        summaryEl.appendChild(delDateBtn);
        detailsEl.appendChild(summaryEl);

        const itemsWrapper = document.createElement('div');
        itemsWrapper.className = 'history-items-wrapper';

        entries.forEach(entry => {
            const ts = Number(entry.timestamp) || Date.now();
            const date = new Date(ts);
            const timeStr = date.toLocaleTimeString('vi-VN');
            
            const item = document.createElement('div');
            item.className = 'history-item';
            
            const info = document.createElement('div');
            info.innerHTML = `<strong>Lúc ${timeStr}</strong> <span style="font-size:0.8rem; color:gray;">(${entry.rowCount || 0} dòng)</span>`;
            
            const actionDiv = document.createElement('div');
            actionDiv.className = 'history-actions';

            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'btn-add';
            restoreBtn.innerText = 'Khôi phục';
            restoreBtn.style.padding = '4px 8px';
            restoreBtn.onclick = () => {
                if (confirm(`Khôi phục lại phiên bản lúc ${timeStr}?`)) {
                    if (type === 'editor') {
                        if (typeof addEditorHistoryEntry === 'function') addEditorHistoryEntry();
                        data = JSON.parse(JSON.stringify(entry.data));
                        if (typeof renderTable === 'function') renderTable();
                        localStorage.setItem('translationData', JSON.stringify(data));
                        showToast('🕒 Khôi phục bản dịch thành công!', 'var(--btn-success)');
                    } else {
                        if (typeof addMetaHistoryEntry === 'function') addMetaHistoryEntry();
                        metadata = JSON.parse(JSON.stringify(entry.data));
                        if (typeof renderMetadata === 'function') renderMetadata();
                        if (typeof saveMetadata === 'function') saveMetadata();
                        showToast('🕒 Khôi phục thông tin truyện thành công!', 'var(--btn-success)');
                    }
                    const modal = document.getElementById('modal-history');
                    if (modal) modal.classList.remove('show');
                }
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete';
            delBtn.innerText = 'Xóa';
            delBtn.style.padding = '4px 8px';
            delBtn.onclick = () => deleteHistoryEntry(type, entry.timestamp);

            actionDiv.appendChild(restoreBtn);
            actionDiv.appendChild(delBtn);

            item.appendChild(info);
            item.appendChild(actionDiv); 
            itemsWrapper.appendChild(item);
        });

        detailsEl.appendChild(itemsWrapper);
        historyListDiv.appendChild(detailsEl);
    }
}

// =========================================================================
// RENDER DANH SÁCH FILE NAME QT (TÍCH HỢP ĐỒNG BỘ GOOGLE DRIVE)
// =========================================================================
function renderNameQTFileList() {
    const listContainer = document.getElementById('nameqt-file-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const files = (typeof nameQTEngine !== 'undefined' && nameQTEngine.files) ? nameQTEngine.files : [];

    // NÚT KÉO TẤT CẢ FILE NAME QT TỪ GOOGLE DRIVE VỀ MÁY
    const pullDriveDiv = document.createElement('div');
    pullDriveDiv.style.marginBottom = '12px';
    pullDriveDiv.style.textAlign = 'right';
    pullDriveDiv.innerHTML = `<button id="btn-pull-gdrive-nameqt" class="btn-tool" style="background:#059669; color:white; border-radius:8px; padding:6px 14px; font-weight:600; cursor:pointer; box-shadow:0 2px 6px rgba(5,150,105,0.3);">📥 Tải Name QT từ Google Drive về máy</button>`;
    listContainer.appendChild(pullDriveDiv);

    if (files.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style = 'color:gray; font-size:0.85rem; font-style:italic; text-align:center; padding:10px;';
        emptyMsg.innerHTML = 'Chưa có file Name QT nào trong bộ nhớ máy tính này.';
        listContainer.appendChild(emptyMsg);
    } else {
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = `nameqt-file-item ${file.id === editingFileId ? 'editing' : ''}`;
            
            let ts = file.updatedAt || Date.now();
            if (typeof ts === 'string' && /^\d+$/.test(ts)) ts = Number(ts);
            const dateStr = new Date(ts).toLocaleDateString('vi-VN');

            item.innerHTML = `
                <div class="nameqt-file-info">
                    <span class="nameqt-file-name">📄 ${escapeHTML(file.fileName || 'Name_QT.txt')}</span>
                    <span class="nameqt-file-meta">${(file.count || 0).toLocaleString('vi-VN')} từ • Sửa lần cuối: ${dateStr}</span>
                </div>
                <div class="nameqt-file-actions">
                    <button class="btn-tool btn-xs btn-push-gdrive-file" data-id="${file.id}" title="Lưu file này lên Google Drive" style="background:#059669; color:white;">☁️ Lên Drive</button>
                    <button class="btn-tool btn-xs btn-edit-file" data-id="${file.id}" title="Chỉnh sửa file này">✏️ Sửa</button>
                    <button class="btn-danger btn-xs btn-del-file" data-id="${file.id}" title="Xóa file này">🗑️ Xóa</button>
                </div>
            `;
            listContainer.appendChild(item);
        });
    }

    // Sự kiện nút Tải tất cả từ Google Drive
    document.getElementById('btn-pull-gdrive-nameqt')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (typeof nameQTEngine !== 'undefined' && nameQTEngine.pullAllFromGDrive) {
            await nameQTEngine.pullAllFromGDrive();
        }
    });

    // Sự kiện nút Đẩy từng file lên Google Drive
    listContainer.querySelectorAll('.btn-push-gdrive-file').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = e.currentTarget.getAttribute('data-id');
            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.pushFileToGDrive) {
                await nameQTEngine.pushFileToGDrive(id);
            }
        });
    });

    // Sự kiện Sửa file
    listContainer.querySelectorAll('.btn-edit-file').forEach(btn => {
        btn.addEventListener('click', (e) => startEditingFile(e.currentTarget.getAttribute('data-id')));
    });

    // Sự kiện Xóa file
    listContainer.querySelectorAll('.btn-del-file').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const file = nameQTEngine?.files?.find(f => f.id === id);
            if (file && confirm(`Bạn có chắc chắn muốn XÓA file Name "${file.fileName}"?`)) {
                await nameQTEngine.removeFile(id);
                if (editingFileId === id) cancelEditingFile();
                showToast(`🗑️ Đã xóa file "${file.fileName}"!`, 'var(--btn-danger)');
                updateNameQTModalUI();
                if (typeof refreshAllQT === 'function') refreshAllQT(false);
            }
        });
    });
}

function startEditingFile(fileId) {
    const file = nameQTEngine?.files?.find(f => f.id === fileId);
    if (!file) return;

    editingFileId = fileId;
    const textInput = document.getElementById('nameqt-text-input');
    const fileNameInput = document.getElementById('nameqt-filename-input');
    const cancelBtn = document.getElementById('btn-cancel-edit-file');
    const updateBtn = document.getElementById('btn-update-nameqt');

    if (textInput) textInput.value = file.content || '';
    if (fileNameInput) { fileNameInput.value = file.fileName || ''; fileNameInput.style.display = 'block'; }
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (updateBtn) updateBtn.innerHTML = '💾 Lưu sửa đổi File';

    renderNameQTFileList();
}

function cancelEditingFile() {
    editingFileId = null;
    const textInput = document.getElementById('nameqt-text-input');
    const fileNameInput = document.getElementById('nameqt-filename-input');
    const cancelBtn = document.getElementById('btn-cancel-edit-file');
    const updateBtn = document.getElementById('btn-update-nameqt');

    if (textInput) textInput.value = '';
    if (fileNameInput) { fileNameInput.value = ''; fileNameInput.style.display = 'none'; }
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (updateBtn) updateBtn.innerHTML = '✔️ Cập nhật Name QT';

    renderNameQTFileList();
}

function updateNameQTModalUI() {
    const statusText = document.getElementById('nameqt-status');
    const dictSize = typeof nameQTEngine !== 'undefined' && nameQTEngine.dict ? nameQTEngine.dict.size : 0;
    const fileCount = typeof nameQTEngine !== 'undefined' && nameQTEngine.files ? nameQTEngine.files.length : 0;

    if (statusText) {
        statusText.innerHTML = `Hiện có: <strong style="color:var(--btn-primary); font-size:1.1rem;">${dictSize.toLocaleString('vi-VN')}</strong> từ (từ ${fileCount} file) trong từ điển.`;
    }
    renderNameQTFileList();
}

function openNameQTModal() {
    cancelEditingFile();
    updateNameQTModalUI();
    const modal = document.getElementById('modal-nameqt');
    if (modal) modal.classList.add('show');
}

// =========================================================================
// SỰ KIỆN CẬP NHẬT NAME QT - XỬ LÝ TRÙNG TÊN ĐẦU VÀO THEO RULE 3 & 4
// =========================================================================
function initNameQTModalEvents() {
    document.getElementById('btn-open-nameqt-modal')?.addEventListener('click', (e) => { e.preventDefault(); openNameQTModal(); });
    document.getElementById('btn-close-nameqt-modal')?.addEventListener('click', () => document.getElementById('modal-nameqt')?.classList.remove('show'));
    document.getElementById('btn-cancel-edit-file')?.addEventListener('click', cancelEditingFile);

    document.getElementById('btn-update-nameqt')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('nameqt-file-input');
        const file = fileInput?.files[0];
        const rawText = document.getElementById('nameqt-text-input')?.value.trim() || '';
        let customFileName = document.getElementById('nameqt-filename-input')?.value.trim();

        if (!file && !rawText) { 
            showToast('⚠️ Vui lòng chọn file .txt hoặc dán nội dung Name!', 'var(--btn-warning)'); 
            return; 
        }

        let nameToUse = customFileName || (file ? file.name : (editingFileId ? 'File_chinh_sua.txt' : 'Name_tu_bo_sung.txt'));
        
        // KIỂM TRA TRÙNG TÊN FILE NAME QT TRONG DỮ LIỆU ĐẦU VÀO THEO RULE 1, 3, 4
        if (typeof nameQTEngine !== 'undefined' && nameQTEngine.files) {
            const existingFiles = nameQTEngine.files.filter(f => f.id !== editingFileId);
            const existingFileNames = existingFiles.map(f => f.fileName);

            const isDuplicate = existingFileNames.some(n => n.toLowerCase().trim() === nameToUse.toLowerCase().trim());
            if (isDuplicate) {
                // Tách phần tên gốc và phần mở rộng để bảo toàn .txt
                let base = nameToUse;
                let ext = '';
                const lastDot = nameToUse.lastIndexOf('.');
                if (lastDot > 0 && lastDot < nameToUse.length - 1) {
                    base = nameToUse.substring(0, lastDot);
                    ext = nameToUse.substring(lastDot);
                }
                const cleanedBase = base.replace(/\s*\(\d+\)$/, '').trim();
                let stt = 1;
                let candidateTitle = `${cleanedBase} (${stt})`;
                let candidateFileName = `${candidateTitle}${ext}`;

                // Tìm số thứ tự nhỏ nhất chưa được sử dụng
                while (existingFileNames.some(n => n.toLowerCase().trim() === candidateFileName.toLowerCase().trim())) {
                    stt++;
                    candidateTitle = `${cleanedBase} (${stt})`;
                    candidateFileName = `${candidateTitle}${ext}`;
                }

                // Cú pháp thông báo bắt buộc theo Rule 3:
                // Báo lặp rồi! Tên "[Tên gốc]" đã tồn tại. Bạn có muốn thay Name bằng "[Tên gốc] (STT)" không?
                const confirmMsg = `Báo lặp rồi! Tên "${base}" đã tồn tại. Bạn có muốn thay Name bằng "${candidateTitle}" không?`;
                const userAgreed = confirm(confirmMsg);

                if (userAgreed) {
                    // Người dùng đồng ý: đổi sang tên đề xuất có STT và giữ nguyên phần mở rộng
                    nameToUse = candidateFileName;
                } else {
                    // Người dùng từ chối: giữ nguyên dữ liệu gốc, không tự ý đổi tên, ghi đè hoặc xóa
                    showToast(`⚠️ Đã hủy thao tác để giữ nguyên dữ liệu gốc!`, 'var(--btn-warning)');
                    return; 
                }
            }
        }

        let updatedCount = 0;

        if (file) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                if (typeof nameQTEngine !== 'undefined') {
                    updatedCount = await nameQTEngine.addOrUpdateFile(nameToUse, e.target.result, editingFileId);
                }
                finishUpdate();
            };
            reader.readAsText(file, 'UTF-8');
        } else {
            const fileIdToUse = editingFileId;
            if (typeof nameQTEngine !== 'undefined') {
                updatedCount = await nameQTEngine.addOrUpdateFile(nameToUse, rawText, fileIdToUse);
            }
            finishUpdate();
        }

        function finishUpdate() {
            showToast(`✅ Đã lưu thành công ${updatedCount.toLocaleString('vi-VN')} từ vào file "${nameToUse}"!`, 'var(--btn-success)');
            cancelEditingFile(); 
            updateNameQTModalUI();
            if (typeof refreshAllQT === 'function') refreshAllQT(false);
            document.getElementById('modal-nameqt')?.classList.remove('show');
        }
    });

    document.getElementById('btn-reset-nameqt')?.addEventListener('click', async () => {
        if (confirm("⚠️ Bạn có chắc chắn muốn XÓA TOÀN BỘ tất cả các file Name QT khỏi bộ nhớ không?")) {
            if (typeof nameQTEngine !== 'undefined') await nameQTEngine.clearStorage();
            showToast('🗑️ Đã xóa sạch toàn bộ từ điển Name QT!', 'var(--btn-danger)');
            cancelEditingFile(); updateNameQTModalUI();
            if (typeof refreshAllQT === 'function') refreshAllQT(true);
            document.getElementById('modal-nameqt')?.classList.remove('show');
        }
    });
}

document.addEventListener('click', (e) => {
    if (e.target && (e.target.id === 'btn-open-nameqt-modal' || e.target.closest('#btn-open-nameqt-modal'))) {
        e.preventDefault();
        openNameQTModal();
    }
});

window.addEventListener('click', (e) => {
    const modalReplace = document.getElementById('modal-replace');
    const modalHistory = document.getElementById('modal-history');
    const modalNameQT = document.getElementById('modal-nameqt');

    if (e.target === modalReplace) modalReplace.classList.remove('show');
    if (e.target === modalHistory) modalHistory.classList.remove('show');
    if (e.target === modalNameQT) modalNameQT.classList.remove('show');
    
    if (e.target.id === 'btn-close-history' || e.target.closest('#btn-close-history')) {
        if (modalHistory) modalHistory.classList.remove('show');
    }
    if (e.target.id === 'btn-close-modal' || e.target.closest('#btn-close-modal')) {
        if (modalReplace) modalReplace.classList.remove('show');
    }
    if (e.target.id === 'btn-close-nameqt-modal' || e.target.closest('#btn-close-nameqt-modal')) {
        if (modalNameQT) modalNameQT.classList.remove('show');
    }
});