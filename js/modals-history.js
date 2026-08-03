// =========================================================================
// QUẢN LÝ LỊCH SỬ VÀ HỘP THOẠI MODAL QUẢN LÝ ĐA FILE NAME QT
// =========================================================================
let editingFileId = null;

// HÀM MỞ MODAL LỊCH SỬ DÙNG CHUNG TOÀN CỤC
function openHistoryModal(type) {
    const modal = document.getElementById('modal-history');
    if (!modal) return;
    
    renderHistoryList(type);
    modal.classList.add('show');
}

function renderHistoryList(type) {
    const historyListDiv = document.getElementById('history-list');
    const modalTitle = document.querySelector('#modal-history h3');
    const modalDesc = document.querySelector('#modal-history .modal-desc');
    if (!historyListDiv) return;
    
    let history = [];
    try {
        if (type === 'editor') {
            if (modalTitle) modalTitle.innerHTML = '🕒 Lịch sử sửa đổi (Dịch thuật)';
            if (modalDesc) modalDesc.innerHTML = 'Bản sao lưu tự động lưu định kỳ mỗi 15 giây khi có thay đổi. Giữ tất cả phiên bản lịch sử.';
            history = JSON.parse(localStorage.getItem('translationHistory')) || [];
        } else {
            if (modalTitle) modalTitle.innerHTML = '🕒 Lịch sử sửa đổi (Thông tin truyện)';
            if (modalDesc) modalDesc.innerHTML = 'Bản sao lưu tự động thông tin nhân vật, xưng hô, từ ngữ. Lưu tối đa 15 bản ghi thông tin.';
            history = JSON.parse(localStorage.getItem('metadataHistory')) || [];
        }
    } catch (e) { history = []; }

    if (!Array.isArray(history) || history.length === 0) {
        historyListDiv.innerHTML = '<p style="text-align:center; color:gray; padding: 20px 0; font-style:italic;">Chưa có lịch sử sửa đổi nào được lưu.</p>';
        return;
    }

    historyListDiv.innerHTML = '';
    for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i];
        if (!entry) continue;
        const date = new Date(entry.timestamp || Date.now());
        const timeStr = date.toLocaleTimeString('vi-VN') + ' - ' + date.toLocaleDateString('vi-VN');
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const info = document.createElement('div');
        info.innerHTML = `<strong>${timeStr}</strong> <span style="font-size:0.8rem; color:gray;">(${entry.rowCount || 0} dòng dữ liệu)</span>`;
        
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
        item.appendChild(info);
        item.appendChild(restoreBtn); 
        historyListDiv.appendChild(item);
    }
}

// RENDER DANH SÁCH FILE NAME QT TRONG MODAL
function renderNameQTFileList() {
    const listContainer = document.getElementById('nameqt-file-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const files = (typeof nameQTEngine !== 'undefined' && nameQTEngine.files) ? nameQTEngine.files : [];

    if (files.length === 0) {
        listContainer.innerHTML = '<p style="color:gray; font-size:0.85rem; font-style:italic; text-align:center; padding:10px;">Chưa có file Name QT nào được nạp.</p>';
        return;
    }

    files.forEach(file => {
        const item = document.createElement('div');
        item.className = `nameqt-file-item ${file.id === editingFileId ? 'editing' : ''}`;

        const dateStr = new Date(file.updatedAt || Date.now()).toLocaleDateString('vi-VN');

        item.innerHTML = `
            <div class="nameqt-file-info">
                <span class="nameqt-file-name">📄 ${escapeHTML(file.fileName || 'Name_QT.txt')}</span>
                <span class="nameqt-file-meta">${(file.count || 0).toLocaleString('vi-VN')} từ • Ngày cập nhật: ${dateStr}</span>
            </div>
            <div class="nameqt-file-actions">
                <button class="btn-tool btn-xs btn-edit-file" data-id="${file.id}" title="Chỉnh sửa file này">✏️ Sửa</button>
                <button class="btn-danger btn-xs btn-del-file" data-id="${file.id}" title="Xóa file này">🗑️ Xóa</button>
            </div>
        `;

        listContainer.appendChild(item);
    });

    // Sự kiện Nút Sửa file
    listContainer.querySelectorAll('.btn-edit-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            startEditingFile(id);
        });
    });

    // Sự kiện Nút Xóa file
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
    if (fileNameInput) {
        fileNameInput.value = file.fileName || '';
        fileNameInput.style.display = 'block';
    }
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
    if (fileNameInput) {
        fileNameInput.value = '';
        fileNameInput.style.display = 'none';
    }
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

// HÀM MỞ MODAL NAME QT TOÀN CỤC
function openNameQTModal() {
    cancelEditingFile();
    updateNameQTModalUI();
    const modal = document.getElementById('modal-nameqt');
    if (modal) {
        modal.classList.add('show');
    }
}

function initNameQTModalEvents() {
    const modalNameQT = document.getElementById('modal-nameqt');
    const btnOpenModal = document.getElementById('btn-open-nameqt-modal');
    const btnCloseModal = document.getElementById('btn-close-nameqt-modal');
    const btnUpdate = document.getElementById('btn-update-nameqt');
    const btnReset = document.getElementById('btn-reset-nameqt');
    const btnCancelEdit = document.getElementById('btn-cancel-edit-file');
    const fileInput = document.getElementById('nameqt-file-input');
    const textInput = document.getElementById('nameqt-text-input');
    const fileNameInput = document.getElementById('nameqt-filename-input');

    btnOpenModal?.addEventListener('click', (e) => {
        e.preventDefault();
        openNameQTModal();
    });

    btnCloseModal?.addEventListener('click', () => {
        if (modalNameQT) modalNameQT.classList.remove('show');
    });

    btnCancelEdit?.addEventListener('click', () => {
        cancelEditingFile();
    });

    // BẤM NÚT CẬP NHẬT / LƯU SỬA FILE
    btnUpdate?.addEventListener('click', async () => {
        const file = fileInput?.files[0];
        const rawText = textInput?.value.trim() || '';
        const customFileName = fileNameInput?.value.trim();

        if (!file && !rawText) {
            showToast('⚠️ Vui lòng chọn file .txt hoặc dán nội dung Name!', 'var(--btn-warning)');
            return;
        }

        let updatedCount = 0;

        if (file) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                const fileContent = e.target.result;
                const nameToUse = customFileName || file.name;
                if (typeof nameQTEngine !== 'undefined') {
                    updatedCount = await nameQTEngine.addOrUpdateFile(nameToUse, fileContent, editingFileId);
                }
                finishUpdate();
            };
            reader.readAsText(file, 'UTF-8');
        } else {
            const defaultNameFile = 'Name_tu_bo_sung.txt';
            const nameToUse = customFileName || (editingFileId ? 'File_chinh_sua.txt' : defaultNameFile);
            const existingFile = nameQTEngine?.files?.find(f => f.fileName === nameToUse);
            const fileIdToUse = editingFileId || (existingFile ? existingFile.id : null);
            if (typeof nameQTEngine !== 'undefined') {
                updatedCount = await nameQTEngine.addOrUpdateFile(nameToUse, rawText, fileIdToUse);
            }
            finishUpdate();
        }

        function finishUpdate() {
            showToast(`✅ Đã lưu thành công ${updatedCount.toLocaleString('vi-VN')} từ!`, 'var(--btn-success)');
            cancelEditingFile();
            updateNameQTModalUI();
            if (typeof refreshAllQT === 'function') refreshAllQT(false);
            if (modalNameQT) modalNameQT.classList.remove('show');
        }
    });

    // BẤM NÚT RESET / XÓA HẾT TỪ ĐIỂN
    btnReset?.addEventListener('click', async () => {
        if (confirm("⚠️ Bạn có chắc chắn muốn XÓA TOÀN BỘ tất cả các file Name QT khỏi bộ nhớ không?")) {
            if (typeof nameQTEngine !== 'undefined') {
                await nameQTEngine.clearStorage();
            }
            showToast('🗑️ Đã xóa sạch toàn bộ từ điển Name QT!', 'var(--btn-danger)');
            cancelEditingFile();
            updateNameQTModalUI();
            if (typeof refreshAllQT === 'function') refreshAllQT(true);
            if (modalNameQT) modalNameQT.classList.remove('show');
        }
    });
}

// BẮT SỰ KIỆN CLICK MỞ TẢI NAME QT BẰNG EVENT DELEGATION (BẢO VỆ MỞ MODAL 100%)
document.addEventListener('click', (e) => {
    if (e.target && (e.target.id === 'btn-open-nameqt-modal' || e.target.closest('#btn-open-nameqt-modal'))) {
        e.preventDefault();
        openNameQTModal();
    }
});

// ĐÓNG MODAL KHI CLICK NGOÀI VÙNG CHỈ ĐỊNH
window.addEventListener('click', (e) => {
    const modalReplace = document.getElementById('modal-replace');
    const modalHistory = document.getElementById('modal-history');
    const modalNameQT = document.getElementById('modal-nameqt');

    if (e.target === modalReplace) {
        modalReplace.classList.remove('show');
        if (typeof renderTable === 'function') renderTable();
    }
    if (e.target === modalHistory) {
        modalHistory.classList.remove('show');
    }
    if (e.target === modalNameQT) {
        modalNameQT.classList.remove('show');
    }
    if (e.target.id === 'btn-close-history' || e.target.closest('#btn-close-history')) {
        if (modalHistory) modalHistory.classList.remove('show');
    }
    if (e.target.id === 'btn-close-modal' || e.target.closest('#btn-close-modal')) {
        if (modalReplace) {
            modalReplace.classList.remove('show');
            if (typeof renderTable === 'function') renderTable();
        }
    }
    if (e.target.id === 'btn-close-nameqt-modal' || e.target.closest('#btn-close-nameqt-modal')) {
        if (modalNameQT) modalNameQT.classList.remove('show');
    }
});