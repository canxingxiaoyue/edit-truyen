// =========================================================================
// QUẢN LÝ DỰ ÁN DỮ LIỆU - LIÊN KẾT CỬA SỔ XANH LÁ GOOGLE DRIVE
// =========================================================================

let localSavedProjectsCache = []; 

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

// 1. TẢI DANH SÁCH DỰ ÁN (ƯU TIÊN GOOGLE DRIVE)
async function loadSavedProjects() {
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        const driveProjects = await gdriveListProjects();
        if (driveProjects) {
            localSavedProjectsCache = driveProjects;
            renderMyProjectsListUI();
            calculateStorageMetrics();
            return;
        }
    }

    try {
        let localData = JSON.parse(localStorage.getItem('mySavedProjects')) || [];
        localSavedProjectsCache = localData.map(toProjectSummary);
    } catch (e) {
        localSavedProjectsCache = [];
    }

    renderMyProjectsListUI();
    calculateStorageMetrics();
}

// 2. LƯU DỰ ÁN (LƯU LÊN GOOGLE DRIVE)
async function saveProjectToCloudAndLocal(projObj) {
    const summaryObj = toProjectSummary(projObj);

    const idx = localSavedProjectsCache.findIndex(p => p.id === projObj.id || p.name === projObj.name);
    if (idx >= 0) localSavedProjectsCache[idx] = summaryObj;
    else localSavedProjectsCache.unshift(summaryObj);

    try {
        localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
    } catch (e) {}

    renderMyProjectsListUI();
    calculateStorageMetrics();

    // NẾU ĐÃ KẾT NỐI DRIVE
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        showToast(`⏳ Đang lưu "${projObj.name}" vào Google Drive...`, 'var(--btn-info)');
        const ok = await gdriveSaveProject(projObj);
        if (ok) {
            showToast(`💾 Đã lưu dự án "${projObj.name}" lên Google Drive!`, 'var(--btn-success)');
            loadSavedProjects();
        } else {
            showToast("⚠️ Không thể lưu lên Google Drive!", "var(--btn-warning)");
        }
        return;
    }

    // NẾU CHƯA KẾT NỐI -> MỞ CỬA SỔ XANH LÁ HƯỚNG DẪN ĐĂNG NHẬP
    showToast(`💾 Đã lưu tạm vào máy! Hãy kết nối Google Drive để lưu vĩnh viễn 15GB.`, 'var(--btn-info)');
    if (typeof openGDriveModal === 'function') openGDriveModal();
}

// 3. XÓA DỰ ÁN
async function deleteProjectFromCloudAndLocal(projId) {
    localSavedProjectsCache = localSavedProjectsCache.filter(p => p.id !== projId);
    try {
        localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
    } catch (e) {}

    renderMyProjectsListUI();
    calculateStorageMetrics();

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        await gdriveDeleteProject(projId);
    }
}

// HIỂN THỊ NÚT MỞ CỬA SỔ XANH LÁ GOOGLE DRIVE
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

function renderMyProjectsListUI() {
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

    if (projects.length === 0) {
        listBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:gray; padding:20px; font-style:italic;">Chưa có dự án nào. Bấm "Lưu chương hiện tại thành dự án" để tạo dự án mới!</td></tr>';
        return;
    }

    projects.forEach((proj) => {
        const tr = document.createElement('tr');
        const dateStr = formatDate(proj.updatedAt);
        const sizeKB = ((proj.size || 0) / 1024).toFixed(1);

        tr.innerHTML = `
            <td><strong>📄 ${escapeHTML(proj.name)}</strong>${proj.storyTitle ? `<br><small style="color:gray;">📚 ${escapeHTML(proj.storyTitle)}</small>` : ''}</td>
            <td style="text-align:center;">${proj.rowCount || 0} hàng</td>
            <td style="text-align:center; font-size:0.85rem;">${dateStr}</td>
            <td style="text-align:center;">${sizeKB} KB</td>
            <td style="text-align:center;">
                <button class="btn-add btn-xs btn-open-proj" data-id="${proj.id}" title="Mở dự án này">📂 Mở</button>
                <button class="btn-danger btn-xs btn-del-proj" data-id="${proj.id}" title="Xóa">🗑️ Xóa</button>
            </td>
        `;
        listBody.appendChild(tr);
    });

    // MỞ DỰ ÁN
    listBody.querySelectorAll('.btn-open-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const summary = localSavedProjectsCache.find(p => p.id === id);
            if (!summary) return;

            if (confirm(`Mở dự án "${summary.name}"? Dữ liệu hiện tại trên màn hình sẽ được thay thế.`)) {
                showToast("⏳ Đang tải dự án từ Google Drive...", "var(--btn-info)");
                
                let proj = summary;

                if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
                    const fullProj = await gdriveGetProjectContent(id);
                    if (fullProj) proj = fullProj;
                }

                let rawData = proj.data;
                if (typeof rawData === 'string') {
                    try { rawData = JSON.parse(rawData); } catch(e) {}
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
                        try { parsedMeta = JSON.parse(parsedMeta); } catch(e) {}
                    }
                    metadata = (typeof normalizeMetadata === 'function') ? normalizeMetadata(parsedMeta) : parsedMeta;
                    localStorage.setItem('storyMetadata', JSON.stringify(metadata));
                    if (typeof renderMetadata === 'function') renderMetadata();
                }

                if (proj.history) {
                    let parsedHist = proj.history;
                    if (typeof parsedHist === 'string') {
                        try { parsedHist = JSON.parse(parsedHist); } catch(e) {}
                    }
                    if (parsedHist.translation) localStorage.setItem('translationHistory', JSON.stringify(parsedHist.translation));
                    if (parsedHist.metadata) localStorage.setItem('metadataHistory', JSON.stringify(parsedHist.metadata));
                }

                showToast(`📂 Đã mở dự án "${proj.name}" từ Google Drive!`, 'var(--btn-success)');
                document.getElementById('modal-my-data')?.classList.remove('show');
            }
        });
    });

    // XÓA
    listBody.querySelectorAll('.btn-del-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const proj = localSavedProjectsCache.find(p => p.id === id);
            if (proj && confirm(`Xóa vĩnh viễn dự án "${proj.name}" khỏi Google Drive?`)) {
                await deleteProjectFromCloudAndLocal(id);
                showToast(`🗑️ Đã xóa dự án "${proj.name}"!`, 'var(--btn-danger)');
            }
        });
    });
}

// 4. LƯU THÀNH BẢN MỚI
async function saveCurrentAsProject() {
    const titleVal = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim() : 'Chương_Mới';
    const storyTitleVal = (typeof metadata !== 'undefined' && metadata.title) ? metadata.title.trim() : '';

    const namePrompt = prompt("Nhập tên lưu cho Dự án / Chương này:", titleVal);
    if (!namePrompt) return;

    const dataStr = JSON.stringify(data);
    const newProjectId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const transHist = JSON.parse(localStorage.getItem('translationHistory') || "[]");
    const metaHist = JSON.parse(localStorage.getItem('metadataHistory') || "[]");

    const projObj = {
        id: newProjectId,
        name: namePrompt.trim(),
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

function initProjectManagerEvents() {
    document.getElementById('nav-my-projects')?.addEventListener('click', () => {
        loadSavedProjects();
        document.getElementById('modal-my-data')?.classList.add('show');
    });

    document.getElementById('btn-close-my-data')?.addEventListener('click', () => {
        document.getElementById('modal-my-data')?.classList.remove('show');
    });

    document.getElementById('btn-save-current-as-project')?.addEventListener('click', saveCurrentAsProject);
    document.getElementById('project-search-input')?.addEventListener('input', renderMyProjectsListUI);
    document.getElementById('project-sort-select')?.addEventListener('change', renderMyProjectsListUI);

    // MỞ CỬA SỔ XANH LÁ GOOGLE DRIVE
    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'btn-open-gdrive-auth' || e.target.closest('#btn-open-gdrive-auth'))) {
            e.preventDefault();
            if (typeof openGDriveModal === 'function') openGDriveModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    try { initProjectManagerEvents(); } catch (e) { console.error("Lỗi Project Manager:", e); }
});