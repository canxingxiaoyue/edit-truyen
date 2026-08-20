// =========================================================================
// QUẢN LÝ LỊCH SỬ DỊCH & HỘP THOẠI MODAL NAME QT
// =========================================================================
let editingFileId = null;

function openHistoryModal(type) {
    const modal = document.getElementById('modal-history');
    if (!modal) return;
    renderHistoryList(type);
    modal.classList.add('show');
}

// 1. XÓA MỘT BẢN GHI CỤ THỂ
function deleteHistoryEntry(type, originalIndex) {
    const storageKey = type === 'editor' ? 'translationHistory' : 'metadataHistory';
    let history = JSON.parse(localStorage.getItem(storageKey)) || [];
    
    if (confirm("🗑️ Bạn có chắc chắn muốn xóa bản sao lưu này không?")) {
        history.splice(originalIndex, 1); 
        localStorage.setItem(storageKey, JSON.stringify(history));
        
        if (typeof saveCurrentAsProject === 'function' && document.getElementById('chapter-title-input')?.value) {
            saveCurrentAsProject(true); 
        }
        
        renderHistoryList(type); 
        showToast("Đã xóa bản sao lưu lịch sử!", "var(--btn-danger)");
    }
}

// 2. XÓA TOÀN BỘ LỊCH SỬ CỦA 1 NGÀY
function deleteHistoryByDate(type, dateStr, entriesToDelete) {
    if (confirm(`🗑️ Bạn có muốn XÓA SẠCH toàn bộ lịch sử của ngày "${dateStr}" không?`)) {
        const storageKey = type === 'editor' ? 'translationHistory' : 'metadataHistory';
        let history = JSON.parse(localStorage.getItem(storageKey)) || [];
        
        // Lấy ra danh sách các mốc thời gian cần xóa
        const timestampsToDelete = entriesToDelete.map(e => e.timestamp);
        
        // Lọc bỏ những bản ghi nằm trong danh sách cần xóa
        history = history.filter(entry => !timestampsToDelete.includes(entry.timestamp));
        
        localStorage.setItem(storageKey, JSON.stringify(history));
        
        if (typeof saveCurrentAsProject === 'function' && document.getElementById('chapter-title-input')?.value) {
            saveCurrentAsProject(true); 
        }
        
        renderHistoryList(type); 
        showToast(`🗑️ Đã xóa sạch lịch sử ngày ${dateStr}!`, "var(--btn-danger)");
    }
}

// 3. XÓA TẤT CẢ LỊCH SỬ
function deleteAllHistory(type) {
    if (confirm("⚠️ NGUY HIỂM: Xóa SẠCH TOÀN BỘ lịch sử hiện có? Hành động này không thể hoàn tác!")) {
        const storageKey = type === 'editor' ? 'translationHistory' : 'metadataHistory';
        localStorage.setItem(storageKey, "[]");
        
        if (typeof saveCurrentAsProject === 'function' && document.getElementById('chapter-title-input')?.value) {
            saveCurrentAsProject(true); 
        }
        
        renderHistoryList(type); 
        showToast("🗑️ Đã dọn sạch toàn bộ lịch sử!", "var(--btn-danger)");
    }
}

// 4. VẼ GIAO DIỆN LỊCH SỬ
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
            if (modalDesc) modalDesc.innerHTML = 'Các bản sao lưu được nhóm theo ngày. Bạn có thể khôi phục hoặc xóa từng bản.';
            history = JSON.parse(localStorage.getItem('translationHistory')) || [];
        } else {
            if (modalTitle) modalTitle.innerHTML = '🕒 Lịch sử sửa đổi (Thông tin truyện)';
            if (modalDesc) modalDesc.innerHTML = 'Các bản sao lưu thông tin nhân vật, xưng hô, từ ngữ.';
            history = JSON.parse(localStorage.getItem('metadataHistory')) || [];
        }
    } catch (e) { history = []; }

    // Xử lý chèn/Xóa nút "Xóa tất cả" ở dưới cùng
    if (modalActions) {
        const oldDelAllBtn = document.getElementById('btn-delete-all-history');
        if (oldDelAllBtn) oldDelAllBtn.remove();

        if (history.length > 0) {
            const btnDelAll = document.createElement('button');
            btnDelAll.id = 'btn-delete-all-history';
            btnDelAll.className = 'btn-danger';
            btnDelAll.innerHTML = '🗑️ Xóa tất cả';
            btnDelAll.style.marginRight = 'auto'; // Đẩy nút Đóng sang góc phải
            btnDelAll.onclick = () => deleteAllHistory(type);
            modalActions.insertBefore(btnDelAll, modalActions.firstChild);
        }
    }

    if (!Array.isArray(history) || history.length === 0) {
        historyListDiv.innerHTML = '<p style="text-align:center; color:gray; padding: 20px 0; font-style:italic;">Chưa có lịch sử sửa đổi nào được lưu.</p>';
        return;
    }

    let processedHistory = history.map((item, idx) => ({ ...item, originalIndex: idx }));
    processedHistory.sort((a, b) => b.timestamp - a.timestamp);

    // GOM NHÓM THEO NGÀY
    const groups = {};
    processedHistory.forEach(entry => {
        const dateObj = new Date(entry.timestamp);
        let dateStr = dateObj.toLocaleDateString('vi-VN');
        
        if (dateStr === new Date().toLocaleDateString('vi-VN')) {
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
        
        // Thiết kế thanh tiêu đề ngày: Tên ngày ở trái, Số bản lưu ở giữa, Nút Xóa Ngày ở phải
        summaryEl.innerHTML = `📅 ${dateStr} <span style="font-size:0.8rem; font-weight:normal; color:gray; flex-grow:1;">(${entries.length} bản lưu)</span>`;
        
        // NÚT XÓA NGÀY NAY
        const delDateBtn = document.createElement('button');
        delDateBtn.className = 'btn-danger';
        delDateBtn.innerHTML = '🗑️ Xóa ngày này';
        delDateBtn.style.padding = '3px 8px';
        delDateBtn.style.fontSize = '0.75rem';
        delDateBtn.onclick = (e) => {
            e.preventDefault(); // Không gập/mở nhóm khi bấm nút
            e.stopPropagation();
            deleteHistoryByDate(type, dateStr, entries);
        };
        summaryEl.appendChild(delDateBtn);

        detailsEl.appendChild(summaryEl);

        const itemsWrapper = document.createElement('div');
        itemsWrapper.className = 'history-items-wrapper';

        entries.forEach(entry => {
            const date = new Date(entry.timestamp);
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
            delBtn.onclick = () => deleteHistoryEntry(type, entry.originalIndex);

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

/// =========================================================================
// RENDER DANH SÁCH FILE NAME QT TRONG MODAL
// =========================================================================
function renderNameQTFileList() {
    const listContainer = document.getElementById('nameqt-file-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const files = (typeof nameQTEngine !== 'undefined' && nameQTEngine.files) ? nameQTEngine.files : [];
    
    // NÚT KÉO TOÀN BỘ TỪ CLOUD VỀ MÁY
    const pullCloudDiv = document.createElement('div');
    pullCloudDiv.style.marginBottom = '12px';
    pullCloudDiv.style.textAlign = 'right';
    pullCloudDiv.innerHTML = `<button id="btn-pull-cloud-name" class="btn-tool" style="background:var(--btn-info); color:white; border-radius:6px; padding:6px 12px; font-weight:bold;">📥 Tải toàn bộ Name QT từ Cloud về máy</button>`;
    listContainer.appendChild(pullCloudDiv);

    if (files.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style = 'color:gray; font-size:0.85rem; font-style:italic; text-align:center; padding:10px;';
        emptyMsg.innerHTML = 'Chưa có file Name QT nào ở máy này.';
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
                    <button class="btn-tool btn-xs btn-push-cloud" data-id="${file.id}" title="Lưu file này lên Cloud">☁️ Đẩy lên Cloud</button>
                    <button class="btn-tool btn-xs btn-edit-file" data-id="${file.id}" title="Sửa file">✏️ Sửa</button>
                    <button class="btn-danger btn-xs btn-del-file" data-id="${file.id}" title="Xóa file">🗑️ Xóa</button>
                </div>
            `;
            listContainer.appendChild(item);
        });
    }

    // Sự kiện tải từ Cloud
    document.getElementById('btn-pull-cloud-name')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await nameQTEngine.pullFromCloud();
    });

    // Sự kiện Đẩy lên Cloud
    listContainer.querySelectorAll('.btn-push-cloud').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = e.currentTarget.getAttribute('data-id');
            await nameQTEngine.pushToCloud(id);
        });
    });

    // Sự kiện Sửa
    listContainer.querySelectorAll('.btn-edit-file').forEach(btn => {
        btn.addEventListener('click', (e) => startEditingFile(e.currentTarget.getAttribute('data-id')));
    });

    // Sự kiện Xóa
    listContainer.querySelectorAll('.btn-del-file').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const file = nameQTEngine?.files?.find(f => f.id === id);
            if (file && confirm(`Bạn có chắc chắn muốn XÓA file Name "${file.fileName}" khỏi máy tính và Cloud?`)) {
                await nameQTEngine.removeFile(id);
                if (editingFileId === id) cancelEditingFile();
                showToast(`🗑️ Đã xóa file "${file.fileName}"!`, 'var(--btn-danger)');
                updateNameQTModalUI();
                if (typeof refreshAllQT === 'function') refreshAllQT(false);
            }
        });
    });
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

function initNameQTModalEvents() {
    document.getElementById('btn-open-nameqt-modal')?.addEventListener('click', (e) => { e.preventDefault(); openNameQTModal(); });
    document.getElementById('btn-close-nameqt-modal')?.addEventListener('click', () => document.getElementById('modal-nameqt')?.classList.remove('show'));
    document.getElementById('btn-cancel-edit-file')?.addEventListener('click', cancelEditingFile);

    document.getElementById('btn-update-nameqt')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('nameqt-file-input');
        const file = fileInput?.files[0];
        const rawText = document.getElementById('nameqt-text-input')?.value.trim() || '';
        const customFileName = document.getElementById('nameqt-filename-input')?.value.trim();

        if (!file && !rawText) { showToast('⚠️ Vui lòng chọn file .txt hoặc dán nội dung Name!', 'var(--btn-warning)'); return; }

        let updatedCount = 0;

        if (file) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                if (typeof nameQTEngine !== 'undefined') updatedCount = await nameQTEngine.addOrUpdateFile(customFileName || file.name, e.target.result, editingFileId);
                finishUpdate();
            };
            reader.readAsText(file, 'UTF-8');
        } else {
            const nameToUse = customFileName || (editingFileId ? 'File_chinh_sua.txt' : 'Name_tu_bo_sung.txt');
            const fileIdToUse = editingFileId || nameQTEngine?.files?.find(f => f.fileName === nameToUse)?.id;
            if (typeof nameQTEngine !== 'undefined') updatedCount = await nameQTEngine.addOrUpdateFile(nameToUse, rawText, fileIdToUse);
            finishUpdate();
        }

        function finishUpdate() {
            showToast(`✅ Đã lưu thành công ${updatedCount.toLocaleString('vi-VN')} từ!`, 'var(--btn-success)');
            cancelEditingFile(); updateNameQTModalUI();
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