// =========================================================================
// QUẢN LÝ DỰ ÁN DỮ LIỆU - BẢO VỆ NỘI DUNG TUYỆT ĐỐI (LOCAL + CLOUD)
// PHƯƠNG ÁN B: [ 📂 MỞ ] + MENU BA CHẤM ⋮ & CHẾ ĐỘ CHỌN NHIỀU
// =========================================================================

let localSavedProjectsCache = []; 
let isProjectBatchMode = false;
let selectedProjectIds = new Set();
let currentActiveMenuProjId = null;

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(val) {
    if (!val) return 'Mới tạo';
    let parsed = (typeof val === 'string' && /^\d+$/.test(val)) ? Number(val) : val;
    let d = new Date(parsed);
    return isNaN(d.getTime()) ? 'Mới tạo' : d.toLocaleString('vi-VN');
}

function toProjectSummary(proj) {
    return {
        id: proj.id,
        name: proj.name || proj.title || 'Dự án không tên',
        chapterTitle: proj.chapterTitle || '',
        storyTitle: proj.storyTitle || '',
        rowCount: proj.rowCount || (Array.isArray(proj.data) ? proj.data.length : 0),
        size: proj.size || (JSON.stringify(proj.data || '').length * 2),
        updatedAt: proj.updatedAt || Date.now()
    };
}

// LƯU TRỮ NỘI DUNG DỰ ÁN ĐẦY ĐỦ TRÊN LOCALSTORAGE (CHỐNG MẤT TEXT)
function saveLocalProjectContent(id, fullProjObj) {
    if (!id || !fullProjObj) return;
    try {
        localStorage.setItem('proj_content_' + id, JSON.stringify(fullProjObj));
    } catch (e) {
        console.warn("[ProjectManager] LocalStorage đầy khi lưu content dự án:", e);
    }
}

function getLocalProjectContent(id) {
    if (!id) return null;
    try {
        const raw = localStorage.getItem('proj_content_' + id);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.error("[ProjectManager] Lỗi đọc content dự án:", e);
    }
    return null;
}

function removeLocalProjectContent(id) {
    if (!id) return;
    try {
        localStorage.removeItem('proj_content_' + id);
    } catch (e) {}
}

// HÀM ĐỒNG BỘ NỘI DUNG NGẦM KHI NGƯỜI DÙNG ĐANG GÕ BẢNG DỊCH (GỌI TỪ EDITOR.JS)
function updateProjectContentSilently(id, title, currentData, currentMeta) {
    if (!id || !Array.isArray(currentData)) return;

    let full = getLocalProjectContent(id);
    const summary = localSavedProjectsCache.find(p => p.id === id);
    
    if (!full) {
        full = {
            id: id,
            name: summary ? summary.name : (title || 'Dự án'),
            chapterTitle: title || '',
            storyTitle: (currentMeta && currentMeta.title) ? currentMeta.title : '',
            createdAt: Date.now()
        };
    }

    full.chapterTitle = title || full.chapterTitle;
    full.data = currentData;
    full.metadata = currentMeta || full.metadata;
    full.rowCount = currentData.length;
    full.updatedAt = Date.now();
    full.size = JSON.stringify(currentData).length * 2;

    saveLocalProjectContent(id, full);

    const idx = localSavedProjectsCache.findIndex(p => p.id === id);
    if (idx !== -1) {
        localSavedProjectsCache[idx].chapterTitle = full.chapterTitle;
        localSavedProjectsCache[idx].rowCount = full.rowCount;
        localSavedProjectsCache[idx].size = full.size;
        localSavedProjectsCache[idx].updatedAt = full.updatedAt;
        try {
            localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
        } catch (e) {}
    }
}
window.updateProjectContentSilently = updateProjectContentSilently;

function getNextInputProjectName(desiredName, existingList) {
    const existingSet = new Set(existingList.map(n => n.toLowerCase().trim()));
    const cleanedBase = desiredName.replace(/\s*\(\d+\)$/, '').trim();
    let stt = 1;
    let candidate = `${cleanedBase} (${stt})`;
    while (existingSet.has(candidate.toLowerCase().trim())) {
        stt++;
        candidate = `${cleanedBase} (${stt})`;
    }
    return { candidate, stt, cleanedBase };
}

// 1. TẢI DANH SÁCH DỰ ÁN (HỢP NHẤT AN TOÀN, KHÔNG XÓA DỮ LIỆU CỤC BỘ)
function loadSavedProjects() {
    try {
        let localData = JSON.parse(localStorage.getItem('mySavedProjects'));
        if (!Array.isArray(localData)) localData = [];
        localSavedProjectsCache = localData.map(toProjectSummary);
    } catch (e) {
        localSavedProjectsCache = [];
    }
    
    renderMyProjectsListUI();
    calculateStorageMetrics();

    // Hợp nhất (Merge) từ Google Drive: Giữ lại toàn bộ dự án máy, cập nhật thêm từ Cloud
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        gdriveListProjects().then(driveProjects => {
            if (driveProjects && Array.isArray(driveProjects)) {
                const projectMap = new Map();
                
                // 1. Nạp toàn bộ dự án ở máy vào Map
                localSavedProjectsCache.forEach(p => projectMap.set(p.id, p));

                // 2. Gộp dự án từ Drive vào Map
                driveProjects.forEach(dp => {
                    const localProj = projectMap.get(dp.id);
                    if (!localProj) {
                        projectMap.set(dp.id, toProjectSummary(dp));
                    } else {
                        // Nếu bản Drive mới hơn bản máy thì cập nhật thông tin
                        if ((dp.updatedAt || 0) > (localProj.updatedAt || 0)) {
                            projectMap.set(dp.id, toProjectSummary(dp));
                        }
                    }
                });

                localSavedProjectsCache = Array.from(projectMap.values());
                try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch(e) {}
                renderMyProjectsListUI();
                calculateStorageMetrics();
            }
        }).catch(err => console.warn("[ProjectManager] Tải ngầm Drive:", err));
    }
}

// 2. LƯU DỰ ÁN (LƯU CẢ NỘI DUNG VÀ BẢN TÓM TẮT)
async function saveProjectToCloudAndLocal(projObj) {
    if (!projObj || !projObj.id) return { success: false };

    // 1. Lưu nội dung đầy đủ xuống máy
    saveLocalProjectContent(projObj.id, projObj);

    // 2. Lưu bản tóm tắt vào danh sách
    const summaryObj = toProjectSummary(projObj);
    const existingIdx = localSavedProjectsCache.findIndex(p => p.id === projObj.id);
    if (existingIdx !== -1) {
        localSavedProjectsCache[existingIdx] = summaryObj;
    } else {
        localSavedProjectsCache.unshift(summaryObj);
    }

    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

    // Ghi nhớ dự án đang mở
    if (typeof currentProjectId !== 'undefined') {
        currentProjectId = projObj.id;
        localStorage.setItem('currentProjectId', currentProjectId);
    }

    // 3. Đồng bộ lên Google Drive nếu có kết nối
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        showToast(`⏳ Đang lưu "${projObj.name}" vào Google Drive...`, 'var(--btn-info)');
        try {
            const result = await gdriveSaveProject(projObj);
            if (result && result.success) {
                const actualName = result.savedName || projObj.name;
                projObj.name = actualName;
                summaryObj.name = actualName;
                if (result.fileId && result.fileId !== projObj.id) {
                    removeLocalProjectContent(projObj.id);
                    projObj.id = result.fileId;
                    summaryObj.id = result.fileId;
                    saveLocalProjectContent(projObj.id, projObj);
                    if (typeof currentProjectId !== 'undefined') {
                        currentProjectId = projObj.id;
                        localStorage.setItem('currentProjectId', currentProjectId);
                    }
                }

                try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}
                renderMyProjectsListUI();
                calculateStorageMetrics();
                showToast(`💾 Đã lưu dự án "${actualName}" lên Google Drive!`, 'var(--btn-success)');
                return { success: true, project: summaryObj };
            }
        } catch (err) {
            console.error("[ProjectManager] Lỗi upload Drive:", err);
        }
        showToast("⚠️ Đã lưu an toàn vào máy (Chưa đồng bộ được Drive)!", "var(--btn-warning)");
    } else {
        showToast(`💾 Đã lưu dự án "${projObj.name}" vào máy!`, 'var(--btn-success)');
    }

    renderMyProjectsListUI();
    calculateStorageMetrics();
    return { success: true, project: summaryObj };
}

// 3. XÓA DỰ ÁN (XÓA CẢ NỘI DUNG VÀ TÓM TẮT)
async function deleteProjectFromCloudAndLocal(projId) {
    removeLocalProjectContent(projId);
    localSavedProjectsCache = localSavedProjectsCache.filter(p => p.id !== projId);
    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

    if (typeof currentProjectId !== 'undefined' && currentProjectId === projId) {
        currentProjectId = null;
        localStorage.removeItem('currentProjectId');
    }

    renderMyProjectsListUI();
    calculateStorageMetrics();

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        try { return await gdriveDeleteProject(projId); } catch(e) {}
    }
    return true;
}

function calculateStorageMetrics() {
    const summaryEl = document.getElementById('storage-summary-info');
    if (summaryEl) {
        const isDrive = (typeof isGDriveConnected === 'function' && isGDriveConnected());
        const count = localSavedProjectsCache.length;

        if (isDrive) {
            summaryEl.innerHTML = `☁️ Trạng thái: <strong><span style="color:#059669;">🟢 Đã kết nối Google Drive (15 GB)</span></strong> • Tổng dự án: <strong>${count}</strong> • <button id="btn-open-gdrive-auth" type="button" class="btn-xs btn-tool" style="cursor:pointer; margin-left:6px;">🌿 Quản lý Drive</button>`;
        } else {
            summaryEl.innerHTML = `☁️ Trạng thái: <strong><span style="color:#d97706;">🟡 Lưu ở máy tính</span></strong> • Tổng dự án: <strong>${count}</strong> • <button id="btn-open-gdrive-auth" type="button" class="btn-xs btn-sage-gdrive-login" style="margin-left:8px; cursor:pointer; font-weight:600;">🌿 Kết nối Google Drive</button>`;
        }
    }
}

// 4. HIỂN THỊ DANH SÁCH DỰ ÁN RA BẢNG GIAO DIỆN
function renderMyProjectsListUI() {
    closeProjectDropdownMenu();
    const listBody = document.getElementById('my-projects-list-body');
    if (!listBody) return;

    let projects = [...localSavedProjectsCache];
    const searchVal = document.getElementById('project-search-input')?.value.toLowerCase().trim() || '';
    const sortVal = document.getElementById('project-sort-select')?.value || 'updated-desc';

    if (searchVal) {
        projects = projects.filter(p => (p.name || '').toLowerCase().includes(searchVal) || (p.storyTitle && p.storyTitle.toLowerCase().includes(searchVal)));
    }

    projects.sort((a, b) => {
        if (sortVal === 'updated-desc') return (b.updatedAt || 0) - (a.updatedAt || 0);
        if (sortVal === 'updated-asc') return (a.updatedAt || 0) - (b.updatedAt || 0);
        if (sortVal === 'name-asc') return (a.name || '').localeCompare(b.name || '');
        if (sortVal === 'size-desc') return (b.size || 0) - (a.size || 0);
        return 0;
    });

    listBody.innerHTML = '';
    const colSpanTotal = isProjectBatchMode ? 6 : 5;

    if (projects.length === 0) {
        listBody.innerHTML = `<tr><td colspan="${colSpanTotal}" style="text-align:center; color:gray; padding:24px; font-style:italic;">Không tìm thấy dự án nào phù hợp.</td></tr>`;
        return;
    }

    projects.forEach((proj) => {
        const tr = document.createElement('tr');
        const dateStr = formatDate(proj.updatedAt);
        const sizeKB = ((proj.size || 0) / 1024).toFixed(1);
        const isChecked = selectedProjectIds.has(proj.id);
        const isCurrentOpen = (typeof currentProjectId !== 'undefined' && currentProjectId === proj.id);

        if (isCurrentOpen) tr.classList.add('active-row');

        tr.innerHTML = `
            ${isProjectBatchMode ? `
            <td class="proj-batch-td" style="text-align:center; width:38px;">
                <input type="checkbox" class="check-project-item" data-id="${proj.id}" ${isChecked ? 'checked' : ''}>
            </td>` : ''}
            <td>
                <strong>📄 ${escapeHTML(proj.name)}</strong>
                ${isCurrentOpen ? '<span style="font-size:0.75rem; background:var(--btn-success); color:white; padding:2px 6px; border-radius:4px; margin-left:6px;">Đang mở</span>' : ''}
                ${proj.storyTitle ? `<br><small style="color:gray;">📚 ${escapeHTML(proj.storyTitle)}</small>` : ''}
            </td>
            <td style="text-align:center;">${(proj.rowCount || 0).toLocaleString('vi-VN')} hàng</td>
            <td style="text-align:center; font-size:0.85rem;">${dateStr}</td>
            <td style="text-align:center;">${sizeKB} KB</td>
            <td style="text-align:right;">
                <div class="proj-actions-cell">
                    <button type="button" class="btn-proj-main-open btn-open-proj" data-id="${proj.id}" title="Mở dự án này ra màn hình">
                        <span>📂</span> Mở
                    </button>
                    <button type="button" class="btn-proj-more-menu" data-id="${proj.id}" title="Thao tác khác" aria-label="Thao tác khác">
                        ⋮
                    </button>
                </div>
            </td>
        `;
        listBody.appendChild(tr);
    });

    // Gắn sự kiện nút Mở
    listBody.querySelectorAll('.btn-open-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.currentTarget.getAttribute('data-id');
            await openProjectById(id);
        });
    });

    // Gắn sự kiện nút menu ba chấm ⋮
    listBody.querySelectorAll('.btn-proj-more-menu').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.currentTarget.getAttribute('data-id');
            toggleProjectDropdownMenu(e.currentTarget, id);
        });
    });

    // Checkbox chọn nhiều
    if (isProjectBatchMode) {
        listBody.querySelectorAll('.check-project-item').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                if (e.target.checked) selectedProjectIds.add(id);
                else selectedProjectIds.delete(id);
                updateProjectBatchUI();
            });
        });
    }

    updateProjectBatchUI();
}

// 5. CƠ CHẾ MENU BA CHẤM ĐỊNH VỊ NỔI
function toggleProjectDropdownMenu(buttonEl, projId) {
    if (currentActiveMenuProjId === projId) {
        closeProjectDropdownMenu();
        return;
    }

    currentActiveMenuProjId = projId;
    const menu = document.getElementById('project-dropdown-menu');
    if (!menu) return;

    document.querySelectorAll('.btn-proj-more-menu.active').forEach(b => b.classList.remove('active'));
    buttonEl.classList.add('active');

    menu.style.display = 'flex';
    menu.dataset.projId = projId;

    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 180;

    let top = rect.bottom + 4;
    let left = rect.right - menuWidth;

    if (top + menuHeight > window.innerHeight - 12) {
        top = rect.top - menuHeight - 4;
    }
    if (left < 10) left = 10;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

function closeProjectDropdownMenu() {
    const menu = document.getElementById('project-dropdown-menu');
    if (menu) menu.style.display = 'none';
    document.querySelectorAll('.btn-proj-more-menu.active').forEach(b => b.classList.remove('active'));
    currentActiveMenuProjId = null;
}

// =========================================================================
// 6. CÁC NGHIỆP VỤ TRONG MENU BA CHẤM
// =========================================================================

// A. MỞ DỰ ÁN (KHÔI PHỤC NGUYÊN VẸN NỘI DUNG MỚI NHẤT)
async function openProjectById(id) {
    const summary = localSavedProjectsCache.find(p => p.id === id);
    if (!summary) return;

    if (confirm(`Mở dự án "${summary.name}"? Dữ liệu hiện tại trên màn hình sẽ được chuyển sang dự án này.`)) {
        // 1. Ép lưu bản đang gõ dở trên màn hình trước khi chuyển dự án
        if (typeof flushSave === 'function') flushSave();

        showToast("⏳ Đang tải dự án...", "var(--btn-info)");
        
        // 2. Nạp nội dung từ bộ nhớ máy
        let proj = getLocalProjectContent(id);

        // 3. Nếu có kết nối Google Drive, tải bản Drive để đối chiếu
        if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
            try {
                const remoteProj = await gdriveGetProjectContent(id);
                if (remoteProj && remoteProj.data) {
                    // Nếu bản Drive mới hơn bản máy thì lấy bản Drive và lưu đè vào máy
                    if (!proj || !proj.updatedAt || (remoteProj.updatedAt || 0) >= (proj.updatedAt || 0)) {
                        proj = remoteProj;
                        saveLocalProjectContent(id, remoteProj);
                    }
                }
            } catch(e) {
                console.warn("[ProjectManager] Lỗi tải nội dung từ Drive, dùng bản máy:", e);
            }
        }

        if (!proj || !proj.data) {
            // Dự phòng cuối: nếu không tìm thấy content, dùng summary
            proj = proj || summary;
        }

        let rawData = proj.data;
        if (typeof rawData === 'string') {
            try { rawData = JSON.parse(rawData); } catch (e) {}
        }
        
        // Cập nhật dữ liệu bảng
        data = (Array.isArray(rawData) && rawData.length > 0) ? rawData : [createEmptyRow()];

        // Cập nhật tiêu đề chương
        const newTitle = proj.chapterTitle || proj.name || 'Chương 1';
        if (typeof chapterTitle !== 'undefined') chapterTitle = newTitle;
        const chapterInput = document.getElementById('chapter-title-input');
        if (chapterInput) chapterInput.value = newTitle;

        // Cập nhật ID dự án đang mở
        if (typeof currentProjectId !== 'undefined') {
            currentProjectId = id;
            localStorage.setItem('currentProjectId', id);
        }

        // Cập nhật Metadata (Thông tin truyện)
        if (proj.metadata) {
            let parsedMeta = proj.metadata;
            if (typeof parsedMeta === 'string') {
                try { parsedMeta = JSON.parse(parsedMeta); } catch (e) {}
            }
            metadata = (typeof normalizeMetadata === 'function') ? normalizeMetadata(parsedMeta) : parsedMeta;
            localStorage.setItem('storyMetadata', JSON.stringify(metadata));
            if (typeof renderMetadata === 'function') renderMetadata();
        }

        // Cập nhật Lịch sử
        if (proj.history) {
            let parsedHist = proj.history;
            if (typeof parsedHist === 'string') {
                try { parsedHist = JSON.parse(parsedHist); } catch (e) {}
            }
            if (typeof window.appCloudHistory !== 'undefined') {
                window.appCloudHistory.editor = parsedHist.translation || [];
                window.appCloudHistory.meta = parsedHist.metadata || [];
            }
            if (parsedHist.translation) localStorage.setItem('translationHistory', JSON.stringify(parsedHist.translation));
            if (parsedHist.metadata) localStorage.setItem('metadataHistory', JSON.stringify(parsedHist.metadata));
            if (typeof forceSyncHistoryToCloud === 'function') forceSyncHistoryToCloud();
        }

        renderTable();
        if (typeof flushSave === 'function') flushSave();

        showToast(`📂 Đã mở dự án "${summary.name}" thành công!`, 'var(--btn-success)');
        document.getElementById('modal-my-data')?.classList.remove('show');
    }
}

// B. ĐỔI TÊN DỰ ÁN
async function handleRenameProject(projId) {
    const proj = localSavedProjectsCache.find(p => p.id === projId);
    if (!proj) return;

    let newName = prompt("Nhập tên mới cho dự án:", proj.name);
    if (newName === null) return;
    newName = newName.trim();

    if (!newName) {
        showToast("⚠️ Tên dự án không được để trống!", "var(--btn-warning)");
        return;
    }
    if (newName === proj.name) return;

    const existingNames = localSavedProjectsCache.filter(p => p.id !== projId).map(p => p.name);
    if (existingNames.some(n => n.toLowerCase().trim() === newName.toLowerCase().trim())) {
        const { candidate } = getNextInputProjectName(newName, existingNames);
        if (confirm(`Tên "${newName}" đã tồn tại. Bạn có muốn đổi thành "${candidate}" không?`)) {
            newName = candidate;
        } else {
            return;
        }
    }

    showToast(`⏳ Đang đổi tên dự án thành "${newName}"...`, "var(--btn-info)");

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        if (typeof gdriveRenameProject === 'function') {
            const res = await gdriveRenameProject(projId, newName);
            if (!res || !res.success) {
                showToast("❌ Không thể đồng bộ lên Google Drive. Tên dự án vẫn được giữ nguyên ở máy.", "var(--btn-danger)");
                return;
            }
        }
    }

    proj.name = newName;
    proj.updatedAt = Date.now();
    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch(e) {}

    // Cập nhật cả nội dung chi tiết
    let full = getLocalProjectContent(projId);
    if (full) {
        full.name = newName;
        full.updatedAt = proj.updatedAt;
        saveLocalProjectContent(projId, full);
    }

    renderMyProjectsListUI();
    showToast(`✏️ Đã đổi tên dự án thành công: "${newName}"`, "var(--btn-success)");
}

// C. SAO CHÉP DỰ ÁN
async function handleDuplicateProject(projId) {
    const summary = localSavedProjectsCache.find(p => p.id === projId);
    if (!summary) return;

    showToast(`⏳ Đang tạo bản sao cho "${summary.name}"...`, "var(--btn-info)");

    let fullData = getLocalProjectContent(projId) || summary;
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        const remoteData = await gdriveGetProjectContent(projId);
        if (remoteData) fullData = remoteData;
    }

    const existingNames = localSavedProjectsCache.map(p => p.name);
    let baseCopyName = `${summary.name} (Bản sao)`;
    let candidateName = baseCopyName;
    let stt = 2;
    while (existingNames.some(n => n.toLowerCase().trim() === candidateName.toLowerCase().trim())) {
        candidateName = `${summary.name} (Bản sao ${stt})`;
        stt++;
    }

    const newProjId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const newProjObj = {
        ...JSON.parse(JSON.stringify(fullData)),
        id: newProjId,
        name: candidateName,
        updatedAt: Date.now()
    };

    const res = await saveProjectToCloudAndLocal(newProjObj);
    if (res && res.success) {
        showToast(`📄 Đã tạo bản sao dự án: "${candidateName}"!`, "var(--btn-success)");
    }
}

// D. THAY THẾ DỮ LIỆU CỦA DỰ ÁN BẰNG MÀN HÌNH HIỆN TẠI
async function handleReplaceProjectData(projId) {
    const proj = localSavedProjectsCache.find(p => p.id === projId);
    if (!proj) return;

    const confirmMsg = `⚠️ Bạn sắp THAY THẾ DỮ LIỆU của dự án "${proj.name}".\n\n- Dữ liệu nguồn: Toàn bộ bảng dịch hiện tại trên màn hình.\n- Dữ liệu đích: Sẽ ghi đè thay thế toàn bộ nội dung của dự án "${proj.name}".\n- Các dự án khác: Được giữ nguyên hoàn toàn.\n\nBạn có chắc chắn muốn thực hiện không?`;
    if (!confirm(confirmMsg)) return;

    showToast(`⏳ Đang thay thế dữ liệu dự án "${proj.name}"...`, "var(--btn-info)");

    if (typeof syncActiveCellToData === 'function') syncActiveCellToData();
    if (typeof forceSyncHistoryToCloud === 'function') await forceSyncHistoryToCloud();

    const titleVal = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim() : proj.name;
    const storyTitleVal = (typeof metadata !== 'undefined' && metadata.title) ? metadata.title.trim() : '';
    const dataStr = JSON.stringify(data);

    let transHist = []; let metaHist = [];
    if (typeof window.appCloudHistory !== 'undefined') {
        transHist = window.appCloudHistory.editor || [];
        metaHist = window.appCloudHistory.meta || [];
    } else {
        transHist = JSON.parse(localStorage.getItem('translationHistory') || "[]");
        metaHist = JSON.parse(localStorage.getItem('metadataHistory') || "[]");
    }

    const updatedProjObj = {
        id: projId,
        name: proj.name,
        chapterTitle: titleVal,
        storyTitle: storyTitleVal,
        rowCount: data.length,
        size: dataStr.length * 2,
        data: JSON.parse(dataStr),
        metadata: (typeof metadata !== 'undefined') ? JSON.parse(JSON.stringify(metadata)) : {},
        history: { translation: transHist, metadata: metaHist },
        updatedAt: Date.now()
    };

    // Lưu ngay nội dung đầy đủ xuống máy tính
    saveLocalProjectContent(projId, updatedProjObj);

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        if (typeof gdriveUpdateProject === 'function') {
            const res = await gdriveUpdateProject(projId, updatedProjObj);
            if (!res || !res.success) {
                showToast("⚠️ Đã lưu vào máy tính (Lỗi đồng bộ Google Drive)!", "var(--btn-warning)");
            }
        }
    }

    const idx = localSavedProjectsCache.findIndex(p => p.id === projId);
    if (idx !== -1) {
        localSavedProjectsCache[idx] = toProjectSummary(updatedProjObj);
        try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}
    }

    renderMyProjectsListUI();
    calculateStorageMetrics();
    showToast(`🔄 Đã thay thế dữ liệu dự án "${proj.name}" thành công!`, "var(--btn-success)");
}

// E. XÓA DỰ ÁN ĐƠN LẺ
async function handleDeleteSingleProject(projId) {
    const proj = localSavedProjectsCache.find(p => p.id === projId);
    if (!proj) return;

    if (confirm(`⚠️ Bạn có chắc chắn muốn XÓA DỰ ÁN "${proj.name}"?\n\n(Thao tác này sẽ xóa vĩnh viễn và không thể khôi phục).`)) {
        showToast(`⏳ Đang xóa dự án "${proj.name}"...`, "var(--btn-info)");
        const ok = await deleteProjectFromCloudAndLocal(projId);
        if (ok) {
            showToast(`🗑️ Đã xóa dự án "${proj.name}" thành công!`, "var(--btn-danger)");
        } else {
            showToast("❌ Không thể xóa dự án trên Google Drive.", "var(--btn-danger)");
        }
    }
}

// =========================================================================
// 7. QUẢN LÝ NHIỀU DỰ ÁN (CHỌN VÀ XÓA HÀNG LOẠT)
// =========================================================================
function toggleProjectBatchMode(forceState = null) {
    isProjectBatchMode = (forceState !== null) ? forceState : !isProjectBatchMode;
    selectedProjectIds.clear();

    const batchBtn = document.getElementById('btn-toggle-project-batch');
    const batchBar = document.getElementById('project-batch-bar');
    const batchTh = document.querySelector('.proj-batch-th');

    if (batchBtn) {
        if (isProjectBatchMode) {
            batchBtn.classList.add('active');
            batchBtn.innerHTML = '✕ Đang chọn';
        } else {
            batchBtn.classList.remove('active');
            batchBtn.innerHTML = '☑️ Chọn nhiều';
        }
    }

    if (batchBar) batchBar.style.display = isProjectBatchMode ? 'flex' : 'none';
    if (batchTh) batchTh.style.display = isProjectBatchMode ? 'table-cell' : 'none';

    renderMyProjectsListUI();
}

function deselectAllProjectBatch() {
    selectedProjectIds.clear();
    document.querySelectorAll('.check-project-item').forEach(cb => cb.checked = false);
    updateProjectBatchUI();
}

function updateProjectBatchUI() {
    const count = selectedProjectIds.size;
    const summaryEl = document.getElementById('project-batch-summary');
    const deleteBtn = document.getElementById('btn-project-batch-delete');
    const checkAll = document.getElementById('check-all-projects');

    if (summaryEl) summaryEl.innerText = `Đã chọn: ${count} dự án`;
    if (deleteBtn) deleteBtn.disabled = (count === 0);

    const totalRendered = document.querySelectorAll('.check-project-item').length;
    if (checkAll) {
        checkAll.checked = (count === totalRendered && totalRendered > 0);
        checkAll.indeterminate = (count > 0 && count < totalRendered);
    }
}

async function executeProjectBatchDelete() {
    const count = selectedProjectIds.size;
    if (count === 0) return;

    const selectedProjects = localSavedProjectsCache.filter(p => selectedProjectIds.has(p.id));
    const projectNames = selectedProjects.map(p => p.name);

    let listPreview = projectNames.slice(0, 5).map(n => `- ${n}`).join('\n');
    if (projectNames.length > 5) {
        listPreview += `\n... và ${projectNames.length - 5} dự án khác.`;
    }

    const confirmMsg = `⚠️ Bạn sắp XÓA ${count} DỰ ÁN sau:\n${listPreview}\n\nThao tác này không thể khôi phục! Bạn có chắc chắn muốn xóa?`;
    if (!confirm(confirmMsg)) return;

    showToast(`⏳ Đang xóa ${count} dự án...`, "var(--btn-info)");

    let successCount = 0;
    let failCount = 0;

    for (const id of Array.from(selectedProjectIds)) {
        const ok = await deleteProjectFromCloudAndLocal(id);
        if (ok) successCount++;
        else failCount++;
    }

    selectedProjectIds.clear();
    toggleProjectBatchMode(false);

    if (failCount === 0) {
        showToast(`🗑️ Đã xóa ${successCount} dự án thành công!`, "var(--btn-danger)");
    } else {
        showToast(`⚠️ Đã xóa ${successCount}/${count} dự án. ${failCount} dự án chưa xóa được.`, "var(--btn-warning)");
    }
}

window.toggleProjectBatchMode = toggleProjectBatchMode;
window.deselectAllProjectBatch = deselectAllProjectBatch;
window.executeProjectBatchDelete = executeProjectBatchDelete;

// =========================================================================
// 8. LƯU CHƯƠNG HIỆN TẠI THÀNH DỰ ÁN MỚI
// =========================================================================
async function saveCurrentAsProject() {
    // 1. Ép lấy từ ô đang gõ và ép flush bộ nhớ
    if (typeof syncActiveCellToData === 'function') syncActiveCellToData();
    if (typeof flushSave === 'function') flushSave();

    const titleVal = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim() : 'Chương_Mới';
    const storyTitleVal = (typeof metadata !== 'undefined' && metadata.title) ? metadata.title.trim() : '';

    let namePrompt = prompt("Nhập tên lưu cho Dự án / Chương này:", titleVal);
    if (!namePrompt || !namePrompt.trim()) return;
    namePrompt = namePrompt.trim();

    const existingNames = localSavedProjectsCache.map(p => p.name);
    const isDuplicate = existingNames.some(n => n.toLowerCase().trim() === namePrompt.toLowerCase().trim());

    if (isDuplicate) {
        const { candidate } = getNextInputProjectName(namePrompt, existingNames);
        const userAgreed = confirm(`Tên "${namePrompt}" đã tồn tại. Bạn có muốn lưu với tên "${candidate}" không?`);
        if (userAgreed) namePrompt = candidate;
        else return;
    }

    if (typeof forceSyncHistoryToCloud === 'function') await forceSyncHistoryToCloud();

    const dataStr = JSON.stringify(data);
    const newProjectId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    let transHist = []; let metaHist = [];
    if (typeof window.appCloudHistory !== 'undefined') {
        transHist = window.appCloudHistory.editor || [];
        metaHist = window.appCloudHistory.meta || [];
    } else {
        transHist = JSON.parse(localStorage.getItem('translationHistory') || "[]");
        metaHist = JSON.parse(localStorage.getItem('metadataHistory') || "[]");
    }

    const projObj = {
        id: newProjectId, 
        name: namePrompt, 
        chapterTitle: titleVal, 
        storyTitle: storyTitleVal,
        rowCount: data.length, 
        size: dataStr.length * 2, 
        data: JSON.parse(dataStr),
        metadata: (typeof metadata !== 'undefined') ? JSON.parse(JSON.stringify(metadata)) : {},
        history: { translation: transHist, metadata: metaHist }, 
        updatedAt: Date.now()
    };

    await saveProjectToCloudAndLocal(projObj);
}

// =========================================================================
// 9. KHỞI TẠO LẮNG NGHE SỰ KIỆN GIAO DIỆN
// =========================================================================
function initProjectManagerEvents() {
    document.getElementById('nav-my-projects')?.addEventListener('click', () => {
        loadSavedProjects();
        document.getElementById('modal-my-data')?.classList.add('show');
    });

    document.getElementById('btn-close-my-data')?.addEventListener('click', () => {
        document.getElementById('modal-my-data')?.classList.remove('show');
        closeProjectDropdownMenu();
        toggleProjectBatchMode(false);
    });

    document.getElementById('btn-save-current-as-project')?.addEventListener('click', saveCurrentAsProject);
    document.getElementById('project-search-input')?.addEventListener('input', renderMyProjectsListUI);
    document.getElementById('project-sort-select')?.addEventListener('change', renderMyProjectsListUI);

    // Nút kết nối Google Drive
    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'btn-open-gdrive-auth' || e.target.closest('#btn-open-gdrive-auth'))) {
            e.preventDefault();
            if (typeof triggerGoogleRedirectLogin === 'function') triggerGoogleRedirectLogin();
        }
    });

    // Checkbox chọn tất cả
    document.getElementById('check-all-projects')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        selectedProjectIds.clear();
        document.querySelectorAll('.check-project-item').forEach(cb => {
            cb.checked = isChecked;
            const id = cb.getAttribute('data-id');
            if (isChecked && id) selectedProjectIds.add(id);
        });
        updateProjectBatchUI();
    });

    // Sự kiện menu ba chấm ⋮
    const menuEl = document.getElementById('project-dropdown-menu');
    menuEl?.querySelectorAll('.proj-menu-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = e.currentTarget.dataset.action;
            const projId = menuEl.dataset.projId;
            closeProjectDropdownMenu();

            if (!projId) return;

            setTimeout(async () => {
                switch (action) {
                    case 'rename':
                        await handleRenameProject(projId);
                        break;
                    case 'duplicate':
                        await handleDuplicateProject(projId);
                        break;
                    case 'replace':
                        await handleReplaceProjectData(projId);
                        break;
                    case 'delete':
                        await handleDeleteSingleProject(projId);
                        break;
                }
            }, 60);
        });
    });

    // Đóng dropdown menu khi click ra ngoài hoặc cuộn
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#project-dropdown-menu') && !e.target.closest('.btn-proj-more-menu')) {
            closeProjectDropdownMenu();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeProjectDropdownMenu();
    });

    document.querySelector('.projects-scroll-box')?.addEventListener('scroll', () => {
        closeProjectDropdownMenu();
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
    try { initProjectManagerEvents(); } catch (e) { console.error("Lỗi Project Manager:", e); }
});

// XUẤT CÁC HÀM QUAN TRỌNG RA TOÀN CỤC
window.loadSavedProjects = loadSavedProjects;
window.openProjectById = openProjectById;
window.saveCurrentAsProject = saveCurrentAsProject;
window.saveProjectToCloudAndLocal = saveProjectToCloudAndLocal;