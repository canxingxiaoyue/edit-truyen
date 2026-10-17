// =========================================================================
// QUẢN LÝ DỰ ÁN DỮ LIỆU - TẢI TỨC THÌ & NÚT THAO TÁC TỐI GIẢN, THANH LỊCH
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

// 1. TẢI DANH SÁCH DỰ ÁN (TẢI TỨC THÌ 0 GIÂY - KHÔNG BAO GIỜ ĐỨNG BẢNG)
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
        } else {
            showToast("⚠️ Không thể lưu lên Google Drive! Dữ liệu được bảo toàn.", "var(--btn-warning)");
        }
        return;
    }

    const summaryObj = toProjectSummary(projObj);
    localSavedProjectsCache.unshift(summaryObj);

    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

    renderMyProjectsListUI();
    calculateStorageMetrics();
    showToast(`💾 Đã lưu tạm dự án "${projObj.name}" vào máy!`, 'var(--btn-info)');
}

// 3. XÓA DỰ ÁN
async function deleteProjectFromCloudAndLocal(projId) {
    localSavedProjectsCache = localSavedProjectsCache.filter(p => p.id !== projId);
    try { localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache)); } catch (e) {}

    renderMyProjectsListUI();
    calculateStorageMetrics();

    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        gdriveDeleteProject(projId);
    }
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

// 4. HIỂN THỊ DANH SÁCH DỰ ÁN (BỘ NÚT BẤM TỐI GIẢN, THANH LỊCH)
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
                <div class="proj-actions-cell">
                    <button class="btn-proj-action action-open btn-open-proj" data-id="${proj.id}" title="Mở dự án này ra màn hình">Mở</button>
                    <button class="btn-proj-action action-replace btn-replace-proj" data-id="${proj.id}" title="Ghi đè chương hiện tại vào dự án này">Thay thế</button>
                    <button class="btn-proj-action action-delete btn-del-proj" data-id="${proj.id}" title="Xóa dự án này">Xóa</button>
                </div>
            </td>
        `;
        listBody.appendChild(tr);
    });

    // SỰ KIỆN MỞ DỰ ÁN
    listBody.querySelectorAll('.btn-open-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const summary = localSavedProjectsCache.find(p => p.id === id);
            if (!summary) return;

            if (confirm(`Mở dự án "${summary.name}"? Dữ liệu hiện tại sẽ bị thay thế.`)) {
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
                    document.getElementById('chapter-title-input').value = chapterTitle;
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
        });
    });

    // 🟢 SỰ KIỆN NÚT THAY THẾ CHƯƠNG (GHI ĐÈ DỰ ÁN)
    listBody.querySelectorAll('.btn-replace-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            await replaceProjectWithCurrent(id);
        });
    });

    // SỰ KIỆN XÓA DỰ ÁN
    listBody.querySelectorAll('.btn-del-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const proj = localSavedProjectsCache.find(p => p.id === id);
            if (proj && confirm(`Xóa vĩnh viễn dự án "${proj.name}"?`)) {
                await deleteProjectFromCloudAndLocal(id);
                showToast(`🗑️ Đã xóa dự án "${proj.name}"!`, 'var(--btn-danger)');
            }
        });
    });
}

// 🟢 HÀM THỰC HIỆN GHI ĐÈ / THAY THẾ DỰ ÁN BẰNG CHƯƠNG ĐANG MỞ
async function replaceProjectWithCurrent(projId) {
    const proj = localSavedProjectsCache.find(p => p.id === projId);
    if (!proj) return;

    if (!confirm(`⚠️ Bạn có chắc chắn muốn THAY THẾ toàn bộ nội dung của dự án "${proj.name}" bằng chương đang mở trên màn hình không?\n\n(Dữ liệu của dự án này sẽ được ghi đè bằng bản dịch hiện tại).`)) {
        return;
    }

    showToast(`⏳ Đang thay thế dự án "${proj.name}"...`, 'var(--btn-info)');

    if (typeof forceSyncHistoryToCloud === 'function') {
        await forceSyncHistoryToCloud();
    }

    const titleVal = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim() : proj.name;
    const storyTitleVal = (typeof metadata !== 'undefined' && metadata.title) ? metadata.title.trim() : '';
    const dataStr = JSON.stringify(data);

    let transHist = [];
    let metaHist = [];
    if (typeof window.appCloudHistory !== 'undefined') {
        transHist = window.appCloudHistory.editor || [];
        metaHist = window.appCloudHistory.meta || [];
    } else {
        transHist = JSON.parse(localStorage.getItem('translationHistory') || "[]");
        metaHist = JSON.parse(localStorage.getItem('metadataHistory') || "[]");
    }

    const updatedProjObj = {
        id: projId,
        name: proj.name, // Giữ nguyên tên dự án cũ
        chapterTitle: titleVal,
        storyTitle: storyTitleVal,
        rowCount: data.length,
        size: dataStr.length * 2,
        data: JSON.parse(dataStr),
        metadata: (typeof metadata !== 'undefined') ? JSON.parse(JSON.stringify(metadata)) : {},
        history: { translation: transHist, metadata: metaHist },
        updatedAt: Date.now()
    };

    // Nếu đã kết nối Drive -> Gọi hàm cập nhật đè trên Drive
    if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
        if (typeof gdriveUpdateProject === 'function') {
            const res = await gdriveUpdateProject(projId, updatedProjObj);
            if (!res || !res.success) {
                showToast(`❌ Không thể cập nhật dự án trên Google Drive!`, 'var(--btn-danger)');
                return;
            }
        }
    }

    // Cập nhật bộ nhớ đệm máy tính
    const idx = localSavedProjectsCache.findIndex(p => p.id === projId);
    if (idx !== -1) {
        localSavedProjectsCache[idx] = toProjectSummary(updatedProjObj);
        try {
            localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
        } catch (e) {}
    }

    renderMyProjectsListUI();
    calculateStorageMetrics();
    showToast(`🔄 Đã thay thế và cập nhật dự án "${proj.name}" thành công!`, 'var(--btn-success)');
}

// 5. LƯU THÀNH BẢN MỚI
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

    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'btn-open-gdrive-auth' || e.target.closest('#btn-open-gdrive-auth'))) {
            e.preventDefault();
            if (typeof triggerGoogleRedirectLogin === 'function') triggerGoogleRedirectLogin();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    try { initProjectManagerEvents(); } catch (e) { console.error("Lỗi Project Manager:", e); }
});