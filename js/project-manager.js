// =========================================================================
// QUẢN LÝ DỰ ÁN DỮ LIỆU - PHƯƠNG ÁN B (NÚT MỞ + MENU BA CHẤM ⋮ & CHỌN NHIỀU)
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
        name: proj.name,
        chapterTitle: proj.chapterTitle || '',
        storyTitle: proj.storyTitle || '',
        rowCount: proj.rowCount || 0,
        size: proj.size || 0,
        updatedAt: proj.updatedAt || Date.now()
    };
}

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

// 1. TẢI DANH SÁCH DỰ ÁN
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

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        gdriveListProjects().then(driveProjects => {
            if (driveProjects && Array.isArray(driveProjects)) {
                localSavedProjectsCache = driveProjects;
                try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch(e) {}
                renderMyProjectsListUI();
                calculateStorageMetrics();
            }
        }).catch(err => console.warn("Tải ngầm Drive:", err));
    }
}

// 2. LƯU THÀNH DỰ ÁN MỚI
async function saveProjectToCloudAndLocal(projObj) {
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        showToast(`⏳ Đang lưu "${projObj.name}" vào Google Drive...`, 'var(--btn-info)');
        const result = await gdriveSaveProject(projObj);
        
        if (result && result.success) {
            const actualName = result.savedName || projObj.name;
            projObj.name = actualName;
            
            const summaryObj = toProjectSummary(projObj);
            summaryObj.id = result.fileId || projObj.id;
            localSavedProjectsCache.unshift(summaryObj);

            try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

            renderMyProjectsListUI();
            calculateStorageMetrics();
            showToast(`💾 Đã lưu dự án "${actualName}" lên Google Drive!`, 'var(--btn-success)');
            return { success: true, project: summaryObj };
        } else {
            showToast("❌ Không thể đồng bộ lên Google Drive. Dữ liệu vẫn được giữ nguyên tại vị trí lưu trữ hiện có.", "var(--btn-warning)");
            return { success: false };
        }
    }

    const summaryObj = toProjectSummary(projObj);
    localSavedProjectsCache.unshift(summaryObj);

    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

    renderMyProjectsListUI();
    calculateStorageMetrics();
    showToast(`💾 Đã lưu tạm dự án "${projObj.name}" vào máy!`, 'var(--btn-info)');
    return { success: true, project: summaryObj };
}

// 3. XÓA DỰ ÁN (ĐƠN LẺ)
async function deleteProjectFromCloudAndLocal(projId) {
    localSavedProjectsCache = localSavedProjectsCache.filter(p => p.id !== projId);
    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

    renderMyProjectsListUI();
    calculateStorageMetrics();

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        return await gdriveDeleteProject(projId);
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
            summaryEl.innerHTML = `☁️ Trạng thái: <strong><span style="color:#d97706;">🟡 Lưu tạm ở máy</span></strong> • <button id="btn-open-gdrive-auth" type="button" class="btn-xs btn-sage-gdrive-login" style="margin-left:8px; cursor:pointer; font-weight:600;">🌿 Kết nối Google Drive</button>`;
        }
    }
}

// =========================================================================
// 4. HIỂN THỊ DANH SÁCH DỰ ÁN (BỐ CỤC PHƯƠNG ÁN B: [ 📂 MỞ ] [ ⋮ ])
// =========================================================================
function renderMyProjectsListUI() {
    closeProjectDropdownMenu();
    const listBody = document.getElementById('my-projects-list-body');
    if (!listBody) return;

    let projects = [...localSavedProjectsCache];
    const searchVal = document.getElementById('project-search-input')?.value.toLowerCase().trim() || '';
    const sortVal = document.getElementById('project-sort-select')?.value || 'updated-desc';

    if (searchVal) {
        projects = projects.filter(p => p.name.toLowerCase().includes(searchVal) || (p.storyTitle && p.storyTitle.toLowerCase().includes(searchVal)));
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

        tr.innerHTML = `
            ${isProjectBatchMode ? `
            <td class="proj-batch-td" style="text-align:center; width:38px;">
                <input type="checkbox" class="check-project-item" data-id="${proj.id}" ${isChecked ? 'checked' : ''}>
            </td>` : ''}
            <td><strong>📄 ${escapeHTML(proj.name)}</strong>${proj.storyTitle ? `<br><small style="color:gray;">📚 ${escapeHTML(proj.storyTitle)}</small>` : ''}</td>
            <td style="text-align:center;">${proj.rowCount || 0} hàng</td>
            <td style="text-align:center; font-size:0.85rem;">${dateStr}</td>
            <td style="text-align:center;">${sizeKB} KB</td>
            <td style="text-align:center;">
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

    // 1. GẮN SỰ KIỆN MỞ DỰ ÁN
    listBody.querySelectorAll('.btn-open-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.currentTarget.getAttribute('data-id');
            await openProjectById(id);
        });
    });

    // 2. GẮN SỰ KIỆN NÚT ⋮ (MỞ DROPDOWN MENU NỔI)
    listBody.querySelectorAll('.btn-proj-more-menu').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.currentTarget.getAttribute('data-id');
            toggleProjectDropdownMenu(e.currentTarget, id);
        });
    });

    // 3. GẮN SỰ KIỆN CHECKBOX CHỌN TỪNG DỰ ÁN (CHẾ ĐỘ CHỌN NHIỀU)
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

// =========================================================================
// 5. CƠ CHẾ MENU BA CHẤM ĐỊNH VỊ NỔI (CHỐNG CẮT BỞI CUỘN BẢNG)
// =========================================================================
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
        top = rect.top - menuHeight - 4; // Lật ngược lên trên nếu gần đáy
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
// 6. CÁC NGHIỆP VỤ CỤ THỂ TRONG MENU BA CHẤM
// =========================================================================

// A. MỞ DỰ ÁN
async function openProjectById(id) {
    const summary = localSavedProjectsCache.find(p => p.id === id);
    if (!summary) return;

    if (confirm(`Mở dự án "${summary.name}"? Dữ liệu hiện tại trên màn hình sẽ được thay thế.`)) {
        showToast("⏳ Đang tải dự án...", "var(--btn-info)");
        let proj = summary;

        if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
            const fullProj = await gdriveGetProjectContent(id);
            if (fullProj) proj = fullProj;
        }

        let rawData = proj.data;
        if (typeof rawData === 'string') {
            try { rawData = JSON.parse(rawData); } catch (e) {}
        }
        data = (Array.isArray(rawData) && rawData.length > 0) ? rawData : [createEmptyRow()];

        if (proj.chapterTitle && typeof chapterTitle !== 'undefined') {
            chapterTitle = proj.chapterTitle;
            const chapterInput = document.getElementById('chapter-title-input');
            if (chapterInput) chapterInput.value = chapterTitle;
        }
        
        renderTable();
        debounceSave();

        if (proj.metadata) {
            let parsedMeta = proj.metadata;
            if (typeof parsedMeta === 'string') {
                try { parsedMeta = JSON.parse(parsedMeta); } catch (e) {}
            }
            metadata = (typeof normalizeMetadata === 'function') ? normalizeMetadata(parsedMeta) : parsedMeta;
            localStorage.setItem('storyMetadata', JSON.stringify(metadata));
            if (typeof renderMetadata === 'function') renderMetadata();
        }

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

        showToast(`📂 Đã mở dự án "${proj.name}"!`, 'var(--btn-success)');
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
                showToast("❌ Không thể đồng bộ lên Google Drive. Tên dự án vẫn được giữ nguyên.", "var(--btn-danger)");
                return;
            }
        }
    }

    proj.name = newName;
    try {
        localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
    } catch(e) {}

    renderMyProjectsListUI();
    showToast(`✏️ Đã đổi tên dự án thành công: "${newName}"`, "var(--btn-success)");
}

// C. SAO CHÉP DỰ ÁN
async function handleDuplicateProject(projId) {
    const summary = localSavedProjectsCache.find(p => p.id === projId);
    if (!summary) return;

    showToast(`⏳ Đang tạo bản sao cho "${summary.name}"...`, "var(--btn-info)");

    let fullData = summary;
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

// D. THAY THẾ DỮ LIỆU
async function handleReplaceProjectData(projId) {
    const proj = localSavedProjectsCache.find(p => p.id === projId);
    if (!proj) return;

    const confirmMsg = `⚠️ Bạn sắp THAY THẾ DỮ LIỆU của dự án "${proj.name}".\n\n- Dữ liệu nguồn: Toàn bộ bảng dịch hiện tại trên màn hình.\n- Dữ liệu đích: Sẽ ghi đè thay thế toàn bộ nội dung của dự án "${proj.name}".\n- Các dự án khác: Được giữ nguyên hoàn toàn.\n\nBạn có chắc chắn muốn thực hiện không?`;
    if (!confirm(confirmMsg)) return;

    showToast(`⏳ Đang thay thế dữ liệu dự án "${proj.name}"...`, "var(--btn-info)");

    if (typeof forceSyncHistoryToCloud === 'function') {
        await forceSyncHistoryToCloud();
    }

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

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        if (typeof gdriveUpdateProject === 'function') {
            const res = await gdriveUpdateProject(projId, updatedProjObj);
            if (!res || !res.success) {
                showToast("❌ Không thể đồng bộ lên Google Drive. Dữ liệu vẫn được giữ nguyên tại vị trí lưu trữ hiện có.", "var(--btn-danger)");
                return;
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
// 7. QUẢN LÝ NHIỀU DỰ ÁN (CHẾ ĐỘ CHỌN & XÓA HÀNG LOẠT)
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

// XUẤT HÀM TOÀN CỤC CHO ONCLICK GỌI TRỰC TIẾP TỪ HTML
window.toggleProjectBatchMode = toggleProjectBatchMode;
window.deselectAllProjectBatch = deselectAllProjectBatch;
window.executeProjectBatchDelete = executeProjectBatchDelete;

// =========================================================================
// 8. LƯU CHƯƠNG HIỆN TẠI THÀNH BẢN MỚI
// =========================================================================
async function saveCurrentAsProject() {
    const titleVal = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim() : 'Chương_Mới';
    const storyTitleVal = (typeof metadata !== 'undefined' && metadata.title) ? metadata.title.trim() : '';

    let namePrompt = prompt("Nhập tên lưu cho Dự án / Chương này:", titleVal);
    if (!namePrompt || !namePrompt.trim()) return;
    namePrompt = namePrompt.trim();

    const existingNames = localSavedProjectsCache.map(p => p.name);
    const isDuplicate = existingNames.some(n => n.toLowerCase().trim() === namePrompt.toLowerCase().trim());

    if (isDuplicate) {
        const { candidate } = getNextInputProjectName(namePrompt, existingNames);
        const userAgreed = confirm(`Báo lặp rồi! Tên "${namePrompt}" đã tồn tại. Bạn muốn lưu thành "${candidate}" chứ?`);
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
        id: newProjectId, name: namePrompt, chapterTitle: titleVal, storyTitle: storyTitleVal,
        rowCount: data.length, size: dataStr.length * 2, data: JSON.parse(dataStr),
        metadata: (typeof metadata !== 'undefined') ? JSON.parse(JSON.stringify(metadata)) : {},
        history: { translation: transHist, metadata: metaHist }, updatedAt: Date.now()
    };

    await saveProjectToCloudAndLocal(projObj);
}

// =========================================================================
// 9. KHỞI CHẠY LẮNG NGHE SỰ KIỆN GIAO DIỆN
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

    // KẾT NỐI DRIVE
    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'btn-open-gdrive-auth' || e.target.closest('#btn-open-gdrive-auth'))) {
            e.preventDefault();
            if (typeof triggerGoogleRedirectLogin === 'function') triggerGoogleRedirectLogin();
        }
    });

    // MASTER CHECKBOX CHỌN TẤT CẢ DỰ ÁN
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

    // SỰ KIỆN CLICK VÀO CÁC MỤC TRONG MENU BA CHẤM ⋮
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

    // ĐÓNG MENU KHI CLICK RA NGOÀI HOẶC NHẤN ESC HOẶC CUỘN BẢNG
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#project-dropdown-menu') && !e.target.closest('.btn-proj-more-menu')) {
            closeProjectDropdownMenu();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeProjectDropdownMenu();
        }
    });

    document.querySelector('.projects-scroll-box')?.addEventListener('scroll', () => {
        closeProjectDropdownMenu();
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
    try { initProjectManagerEvents(); } catch (e) { console.error("Lỗi Project Manager:", e); }
});