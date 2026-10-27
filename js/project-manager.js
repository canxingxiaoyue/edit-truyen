// =========================================================================
// QUẢN LÝ DỰ ÁN DỮ LIỆU - BẢO VỆ NỘI DUNG TUYỆT ĐỐI (LOCAL + CLOUD)
// ĐÃ SỬA TRIỆT ĐỂ: CHỐNG GHI ĐÈ BẢNG TRẮNG & TỰ ĐỘNG CỨU HỘ TỪ GOOGLE DRIVE
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

// 1. LƯU VÀ ĐỌC NỘI DUNG DỰ ÁN CỤC BỘ (CHỐNG TRÀN BỘ NHỚ LOCALSTORAGE)
function saveLocalProjectContent(id, fullProjObj) {
    if (!id || !fullProjObj) return;
    try {
        localStorage.setItem('proj_content_' + id, JSON.stringify(fullProjObj));
    } catch (e) {
        console.warn("[ProjectManager] LocalStorage đầy, tiến hành tối ưu dung lượng:", e);
        try {
            // Nếu đầy bộ nhớ, lược bỏ bớt lịch sử phụ để đảm bảo lưu trọn vẹn 100% văn bản dịch
            const cleanObj = { ...fullProjObj, history: null };
            localStorage.setItem('proj_content_' + id, JSON.stringify(cleanObj));
        } catch (err) {
            console.error("[ProjectManager] Không thể lưu nội dung dự án:", err);
        }
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

// 2. HÀM ĐỒNG BỘ NGẦM (ĐÃ KHÓA CHẶN NGUY CƠ GHI ĐÈ BẢNG TRẮNG)
function updateProjectContentSilently(id, title, currentData, currentMeta) {
    if (!id || !Array.isArray(currentData)) return;

    // PHÒNG THỦ 1: Tuyệt đối không ghi đè nếu bảng đang là bảng rỗng (0 từ)
    const hasRealContent = currentData.some(r => (r.raw || r.translation || r.qt || '').trim() !== '');
    if (!hasRealContent) return;

    const summary = localSavedProjectsCache.find(p => p.id === id);
    if (!summary) return;

    // PHÒNG THỦ 2: Nếu người dùng đã gõ tiêu đề chương mới khác tên dự án cũ -> ngắt kết nối ID ngay
    if (title && summary.name && title.trim().toLowerCase() !== summary.name.trim().toLowerCase()) {
        if (typeof currentProjectId !== 'undefined' && currentProjectId === id) {
            currentProjectId = null;
            localStorage.removeItem('currentProjectId');
        }
        return; 
    }

    let full = getLocalProjectContent(id);
    if (!full) {
        full = {
            id: id,
            name: summary.name,
            chapterTitle: title || summary.name,
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

// 3. HÀM TẢI TRỰC TIẾP TỪ GOOGLE DRIVE (API CHÍNH THỨC, KHÔNG PHỤ THUỘC TẬP TIN NGOÀI)
async function fetchProjectFromDriveDirectly(fileId) {
    if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.drive) return null;
    try {
        const res = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        if (res && res.body) {
            return typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
        }
        if (res && res.result) {
            return typeof res.result === 'string' ? JSON.parse(res.result) : res.result;
        }
    } catch (err) {
        console.warn("[ProjectManager] Lỗi fetch trực tiếp từ Drive:", err);
    }
    return null;
}

// 4. TẢI DANH SÁCH DỰ ÁN
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

    if (typeof isGDriveConnected === 'function' && isGDriveConnected() && typeof gdriveListProjects === 'function') {
        gdriveListProjects().then(driveProjects => {
            if (driveProjects && Array.isArray(driveProjects)) {
                const projectMap = new Map();
                localSavedProjectsCache.forEach(p => projectMap.set(p.id, p));

                driveProjects.forEach(dp => {
                    const localProj = projectMap.get(dp.id);
                    if (!localProj) {
                        projectMap.set(dp.id, toProjectSummary(dp));
                    } else {
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

// 5. LƯU DỰ ÁN
async function saveProjectToCloudAndLocal(projObj) {
    if (!projObj || !projObj.id) return { success: false };

    saveLocalProjectContent(projObj.id, projObj);

    const summaryObj = toProjectSummary(projObj);
    const existingIdx = localSavedProjectsCache.findIndex(p => p.id === projObj.id);
    if (existingIdx !== -1) {
        localSavedProjectsCache[existingIdx] = summaryObj;
    } else {
        localSavedProjectsCache.unshift(summaryObj);
    }

    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

    if (typeof currentProjectId !== 'undefined') {
        currentProjectId = projObj.id;
        localStorage.setItem('currentProjectId', currentProjectId);
    }

    if (typeof isGDriveConnected === 'function' && isGDriveConnected() && typeof gdriveSaveProject === 'function') {
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

// 6. XÓA DỰ ÁN
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

    if (typeof isGDriveConnected === 'function' && isGDriveConnected() && typeof gdriveDeleteProject === 'function') {
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

// 7. HIỂN THỊ DANH SÁCH DỰ ÁN RA BẢNG GIAO DIỆN
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

    listBody.querySelectorAll('.btn-open-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.currentTarget.getAttribute('data-id');
            await openProjectById(id);
        });
    });

    listBody.querySelectorAll('.btn-proj-more-menu').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.currentTarget.getAttribute('data-id');
            toggleProjectDropdownMenu(e.currentTarget, id);
        });
    });

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

// 8. CƠ CHẾ MENU BA CHẤM ĐỊNH VỊ NỔI
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

    // Bổ sung nút Phục hồi từ Drive nếu chưa có
    if (!menu.querySelector('[data-action="recover-drive"]')) {
        const recoverBtn = document.createElement('button');
        recoverBtn.type = 'button';
        recoverBtn.className = 'proj-menu-item';
        recoverBtn.dataset.action = 'recover-drive';
        recoverBtn.innerHTML = `<span class="proj-menu-icon">☁️</span> Phục hồi từ Drive`;
        menu.insertBefore(recoverBtn, menu.querySelector('.proj-menu-divider'));
    }

    menu.style.display = 'flex';
    menu.dataset.projId = projId;

    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 220;

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
// 9. CÁC NGHIỆP VỤ TRONG MENU BA CHẤM & MỞ DỰ ÁN
// =========================================================================

// A. MỞ DỰ ÁN (ĐÃ TÍCH HỢP TỰ ĐỘNG CỨU HỘ DỮ LIỆU TỪ CLOUD & BẢO TOÀN TÊN)
async function openProjectById(id) {
    const summary = localSavedProjectsCache.find(p => p.id === id);
    if (!summary) return;

    if (confirm(`Mở dự án "${summary.name}"? Dữ liệu hiện tại trên màn hình sẽ được chuyển sang dự án này.`)) {
        // 1. Chỉ lưu màn hình cũ nếu màn hình cũ thực sự có chữ (Chống lưu bảng trắng)
        if (typeof data !== 'undefined' && Array.isArray(data) && data.some(r => (r.raw || r.translation || r.qt || '').trim() !== '')) {
            if (typeof flushSave === 'function') flushSave();
        }

        showToast("⏳ Đang tải dữ liệu dự án...", "var(--btn-info)");
        
        // 2. Nạp nội dung từ máy
        let proj = getLocalProjectContent(id);

        // 3. Nạp và đối chiếu với Google Drive
        let remoteProj = null;
        if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
            try {
                if (typeof gdriveGetProjectContent === 'function') {
                    remoteProj = await gdriveGetProjectContent(id);
                } else {
                    remoteProj = await fetchProjectFromDriveDirectly(id);
                }
            } catch(e) {
                console.warn("[ProjectManager] Lỗi tải từ Drive:", e);
            }
        }

        // TỰ ĐỘNG CỨU HỘ: Nếu bản máy bị rỗng mà bản Drive có dữ liệu -> Ép lấy bản Drive ngay
        const localRowsCount = (proj && Array.isArray(proj.data)) ? proj.data.length : 0;
        const remoteRowsCount = (remoteProj && Array.isArray(remoteProj.data)) ? remoteProj.data.length : 0;

        if (remoteRowsCount > 0 && (localRowsCount === 0 || remoteRowsCount > localRowsCount)) {
            proj = remoteProj;
            saveLocalProjectContent(id, remoteProj);
            console.log(`[ProjectManager] Đã tự động cứu hộ ${remoteRowsCount} hàng từ Google Drive!`);
        }

        if (!proj || !proj.data) {
            proj = proj || summary;
        }

        let rawData = proj.data;
        if (typeof rawData === 'string') {
            try { rawData = JSON.parse(rawData); } catch (e) {}
        }
        
        // 4. Chuẩn hóa dữ liệu qua normalizeRowObject
        let normalizedList = [];
        if (Array.isArray(rawData) && rawData.length > 0) {
            normalizedList = rawData.map(r => typeof normalizeRowObject === 'function' ? normalizeRowObject(r) : r);
        } else {
            normalizedList = [typeof createEmptyRow === 'function' ? createEmptyRow() : { raw: '', pinyin: '', qt: '', translation: '', edit: '', meaning: '' }];
        }

        // 5. Cập nhật biến bộ nhớ
        data = normalizedList;
        window.data = normalizedList;

        // BẮT BUỘC LẤY ĐÚNG TÊN DỰ ÁN ĐƯỢC CHỌN (XÓA BỎ CHỮ KẸT "AB chương 43")
        const correctTitle = summary.name || proj.name || proj.chapterTitle || 'Chương 1';
        chapterTitle = correctTitle;
        window.chapterTitle = correctTitle;
        if (typeof currentChapterTitle !== 'undefined') window.currentChapterTitle = correctTitle;

        // Cập nhật DOM ô input tên chương ngay lập tức
        const chapterInput = document.getElementById('chapter-title-input');
        if (chapterInput) chapterInput.value = correctTitle;

        currentProjectId = id;
        window.currentProjectId = id;
        localStorage.setItem('currentProjectId', id);

        // Cập nhật Metadata
        if (proj.metadata) {
            let parsedMeta = proj.metadata;
            if (typeof parsedMeta === 'string') {
                try { parsedMeta = JSON.parse(parsedMeta); } catch (e) {}
            }
            metadata = (typeof normalizeMetadata === 'function') ? normalizeMetadata(parsedMeta) : parsedMeta;
            localStorage.setItem('storyMetadata', JSON.stringify(metadata));
            if (typeof renderMetadata === 'function') renderMetadata();
        }

        // Cập nhật cờ sửa tay QT
        manualQTState = new Array(data.length).fill(false);
        window.manualQTState = manualQTState;

        renderTable();
        if (typeof flushSave === 'function') flushSave();

        showToast(`📂 Đã mở "${correctTitle}" (${data.length} hàng) thành công!`, 'var(--btn-success)');
        document.getElementById('modal-my-data')?.classList.remove('show');
    }
}

// B. NÚT CỨU HỘ: PHỤC HỒI NGUYÊN BẢN TỪ GOOGLE DRIVE
async function handleRecoverFromDrive(projId) {
    const summary = localSavedProjectsCache.find(p => p.id === projId);
    if (!summary) return;

    if (!confirm(`☁️ Bạn có muốn tải lại NGUYÊN BẢN dự án "${summary.name}" từ Google Drive về máy không?`)) return;

    showToast(`⏳ Đang kéo dữ liệu từ Google Drive...`, "var(--btn-info)");
    let remoteProj = null;
    try {
        if (typeof gdriveGetProjectContent === 'function') {
            remoteProj = await gdriveGetProjectContent(projId);
        } else {
            remoteProj = await fetchProjectFromDriveDirectly(projId);
        }
    } catch (e) {
        console.error(e);
    }

    if (remoteProj && Array.isArray(remoteProj.data) && remoteProj.data.length > 0) {
        saveLocalProjectContent(projId, remoteProj);
        const idx = localSavedProjectsCache.findIndex(p => p.id === projId);
        if (idx !== -1) {
            localSavedProjectsCache[idx].rowCount = remoteProj.data.length;
            localSavedProjectsCache[idx].updatedAt = remoteProj.updatedAt || Date.now();
            try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch(e) {}
        }
        renderMyProjectsListUI();
        showToast(`✅ Đã phục hồi thành công ${remoteProj.data.length} hàng từ Drive! Hãy bấm "Mở".`, "var(--btn-success)");
    } else {
        showToast(`❌ Không tìm thấy bản lưu có dữ liệu trên Drive!`, "var(--btn-danger)");
    }
}

// C. ĐỔI TÊN DỰ ÁN
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
    proj.chapterTitle = newName;
    proj.updatedAt = Date.now();
    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch(e) {}

    let full = getLocalProjectContent(projId);
    if (full) {
        full.name = newName;
        full.chapterTitle = newName;
        full.updatedAt = proj.updatedAt;
        saveLocalProjectContent(projId, full);
    }

    renderMyProjectsListUI();
    showToast(`✏️ Đã đổi tên dự án thành công: "${newName}"`, "var(--btn-success)");
}

// D. SAO CHÉP DỰ ÁN
async function handleDuplicateProject(projId) {
    const summary = localSavedProjectsCache.find(p => p.id === projId);
    if (!summary) return;

    showToast(`⏳ Đang tạo bản sao cho "${summary.name}"...`, "var(--btn-info)");

    let fullData = getLocalProjectContent(projId) || summary;
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        const remoteData = await fetchProjectFromDriveDirectly(projId);
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

// E. THAY THẾ DỮ LIỆU
async function handleReplaceProjectData(projId) {
    const proj = localSavedProjectsCache.find(p => p.id === projId);
    if (!proj) return;

    const confirmMsg = `⚠️ Bạn sắp THAY THẾ DỮ LIỆU của dự án "${proj.name}".\n\n- Dữ liệu nguồn: Toàn bộ bảng dịch hiện tại trên màn hình.\n- Dữ liệu đích: Sẽ ghi đè thay thế toàn bộ nội dung của dự án "${proj.name}".\n\nBạn có chắc chắn muốn thực hiện không?`;
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

    saveLocalProjectContent(projId, updatedProjObj);

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        if (typeof gdriveUpdateProject === 'function') {
            await gdriveUpdateProject(projId, updatedProjObj);
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

// F. XÓA DỰ ÁN
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
// 10. QUẢN LÝ NHIỀU DỰ ÁN (CHỌN VÀ XÓA HÀNG LOẠT)
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
// 11. LƯU CHƯƠNG HIỆN TẠI THÀNH DỰ ÁN MỚI
// =========================================================================
async function saveCurrentAsProject() {
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
// 12. KHỞI TẠO LẮNG NGHE SỰ KIỆN GIAO DIỆN
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

    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'btn-open-gdrive-auth' || e.target.closest('#btn-open-gdrive-auth'))) {
            e.preventDefault();
            if (typeof triggerGoogleRedirectLogin === 'function') triggerGoogleRedirectLogin();
        }
    });

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
                    case 'recover-drive':
                        await handleRecoverFromDrive(projId);
                        break;
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

// XUẤT CÁC HÀM TOÀN CỤC
window.loadSavedProjects = loadSavedProjects;
window.openProjectById = openProjectById;
window.saveCurrentAsProject = saveCurrentAsProject;
window.saveProjectToCloudAndLocal = saveProjectToCloudAndLocal;
window.handleRecoverFromDrive = handleRecoverFromDrive;