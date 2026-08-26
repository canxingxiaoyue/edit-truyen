// =========================================================================
// QUẢN LÝ DỰ ÁN DỮ LIỆU - ĐỒNG BỘ POSTGRESQL & TỰ ĐỘNG GIẢI NÉN MẢNG DỮ LIỆU
// =========================================================================

const API_URL = '/api/projects'; 
let localSavedProjectsCache = []; 
let projectSyncInterval = null;   

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

function getUserIdForProject() {
    if (typeof window.Clerk !== 'undefined') {
        if (window.Clerk.user && window.Clerk.user.id) return window.Clerk.user.id;
        if (window.Clerk.session && window.Clerk.session.user && window.Clerk.session.user.id) return window.Clerk.session.user.id;
        if (window.Clerk.client && window.Clerk.client.sessions && window.Clerk.client.sessions.length > 0) {
            const active = window.Clerk.client.sessions.find(s => s.status === 'active') || window.Clerk.client.sessions[0];
            if (active && active.user && active.user.id) return active.user.id;
        }
    }
    return 'guest_local_user';
}

// 1. TẢI DANH SÁCH DỰ ÁN
async function loadSavedProjects(isSilent = false) {
    const userId = getUserIdForProject();
    let localData = [];
    try { localData = JSON.parse(localStorage.getItem('mySavedProjects')) || []; } catch (e) {}

    if (userId === 'guest_local_user') {
        localSavedProjectsCache = localData;
        renderMyProjectsListUI();
        calculateStorageMetrics();
        return;
    }

    try {
        const response = await fetch(`${API_URL}?userId=${userId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const result = await response.json();
            const dbProjects = result.data || result.projects || result || []; 

            localSavedProjectsCache = Array.isArray(dbProjects) ? dbProjects : [dbProjects];
            localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
            renderMyProjectsListUI();
            calculateStorageMetrics();
        }
    } catch (err) {
        if (!isSilent) console.error("Lỗi kết nối API:", err);
        localSavedProjectsCache = localData;
        renderMyProjectsListUI();
        calculateStorageMetrics();
    }
}

function startProjectAutoSync() {
    stopProjectAutoSync();
    loadSavedProjects(false);
    calculateStorageMetrics();
    projectSyncInterval = setInterval(() => {
        const modal = document.getElementById('modal-my-data');
        if (modal && modal.classList.contains('show')) {
            loadSavedProjects(true);
        } else {
            stopProjectAutoSync();
        }
    }, 5000); 
}

function stopProjectAutoSync() {
    if (projectSyncInterval) {
        clearInterval(projectSyncInterval);
        projectSyncInterval = null;
    }
}

// 2. LƯU DỰ ÁN LÊN POSTGRESQL
async function saveProjectToCloudAndLocal(projObj) {
    const userId = getUserIdForProject();

    const idx = localSavedProjectsCache.findIndex(p => p.id === projObj.id || p.name === projObj.name);
    if (idx >= 0) localSavedProjectsCache[idx] = projObj;
    else localSavedProjectsCache.unshift(projObj);
    localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
    renderMyProjectsListUI();
    calculateStorageMetrics();

    if (userId !== 'guest_local_user') {
        try {
            const payload = { ...projObj, userId: userId }; 
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                showToast(`💾 Đã lưu dự án "${projObj.name}" lên Database!`, 'var(--btn-success)');
                loadSavedProjects(true);
            } else {
                showToast("⚠️ Server báo lỗi khi lưu!", "var(--btn-warning)");
            }
        } catch (err) {
            showToast("⚠️ Mất kết nối Server, đã lưu tạm vào máy!", "var(--btn-warning)");
        }
    } else {
        showToast(`💾 Đã lưu tạm dự án "${projObj.name}" vào máy!`, 'var(--btn-success)');
    }
}

// 3. XÓA DỰ ÁN
async function deleteProjectFromCloudAndLocal(projId) {
    const userId = getUserIdForProject();
    localSavedProjectsCache = localSavedProjectsCache.filter(p => p.id !== projId);
    localStorage.setItem('mySavedProjects', JSON.stringify(localSavedProjectsCache));
    renderMyProjectsListUI();
    calculateStorageMetrics();

    if (userId !== 'guest_local_user') {
        try {
            await fetch(`${API_URL}?id=${projId}&user_id=${userId}`, { method: 'DELETE' });
        } catch (err) { console.error("Lỗi xóa dự án:", err); }
    }
}

function calculateStorageMetrics() {
    const summaryEl = document.getElementById('storage-summary-info');
    if (summaryEl) {
        const userId = getUserIdForProject();
        const isCloud = (userId !== 'guest_local_user');
        summaryEl.innerHTML = `☁️ Trạng thái: <strong>${isCloud ? '🟢 Đã kết nối PostgreSQL Server' : '🟡 Lưu cục bộ (Cần đăng nhập)'}</strong> • Tổng dự án đã lưu: <strong>${localSavedProjectsCache.length}</strong>`;
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
                <button class="btn-tool btn-xs btn-dup-proj" data-id="${proj.id}" title="Nhân bản">📋 Nhân bản</button>
                <button class="btn-danger btn-xs btn-del-proj" data-id="${proj.id}" title="Xóa">🗑️ Xóa</button>
            </td>
        `;
        listBody.appendChild(tr);
    });

    // MỞ DỰ ÁN (ĐÃ FIX LỖI MỞ BỊ TRẮNG BẢNG)
    listBody.querySelectorAll('.btn-open-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const summary = localSavedProjectsCache.find(p => p.id === id);
            if (!summary) return;

            if (confirm(`Mở dự án "${summary.name}"? Dữ liệu hiện tại trên màn hình sẽ được thay thế.`)) {
                showToast("⏳ Đang tải nội dung dự án...", "var(--btn-info)");
                
                let proj = summary;
                const userId = getUserIdForProject();
                
                // Kéo chi tiết từ Server
                if (userId !== 'guest_local_user') {
                    try {
                        const res = await fetch(`${API_URL}?userId=${userId}&id=${id}`);
                        if (res.ok) {
                            const result = await res.json();
                            let fetched = result.data || result;
                            if (Array.isArray(fetched)) {
                                fetched = fetched.find(p => p.id === id) || fetched[0];
                            }
                            if (fetched) proj = fetched;
                        }
                    } catch(err) { console.error("Lỗi tải chi tiết:", err); }
                }

                // 1. PHỤC HỒI BẢNG DỊCH (Tự động bóc tách JSON hoặc Mảng)
                let rawData = proj.data;
                if (typeof rawData === 'string') {
                    try { rawData = JSON.parse(rawData); } catch(e) {}
                }
                
                if (Array.isArray(rawData) && rawData.length > 0) {
                    data = rawData;
                } else if (proj.rawContent && Array.isArray(proj.rawContent)) {
                    // Tương thích ngược nếu lưu dạng cột rời
                    data = proj.rawContent.map((r, i) => ({
                        raw: r || '',
                        pinyin: proj.pinyin?.[i] || '',
                        meaning: proj.meaning?.[i] || '',
                        translation: proj.betaContent?.[i] || '',
                        qt: proj.qtContent?.[i] || '',
                        edit: proj.editContent?.[i] || ''
                    }));
                } else {
                    data = [createEmptyRow()];
                }

                if (proj.chapterTitle && typeof chapterTitle !== 'undefined') {
                    chapterTitle = proj.chapterTitle;
                    const chapterInput = document.getElementById('chapter-title-input');
                    if (chapterInput) chapterInput.value = chapterTitle;
                }
                
                renderTable();
                debounceSave();

                // 2. PHỤC HỒI THÔNG TIN TRUYỆN
                if (proj.metadata) {
                    let parsedMeta = proj.metadata;
                    if (typeof parsedMeta === 'string') {
                        try { parsedMeta = JSON.parse(parsedMeta); } catch(e) {}
                    }
                    metadata = (typeof normalizeMetadata === 'function') ? normalizeMetadata(parsedMeta) : parsedMeta;
                    localStorage.setItem('storyMetadata', JSON.stringify(metadata));
                    if (typeof renderMetadata === 'function') renderMetadata();
                }

                // 3. PHỤC HỒI LỊCH SỬ
                if (proj.history) {
                    let parsedHist = proj.history;
                    if (typeof parsedHist === 'string') {
                        try { parsedHist = JSON.parse(parsedHist); } catch(e) {}
                    }
                    if (parsedHist.translation) localStorage.setItem('translationHistory', JSON.stringify(parsedHist.translation));
                    if (parsedHist.metadata) localStorage.setItem('metadataHistory', JSON.stringify(parsedHist.metadata));
                }

                showToast(`📂 Đã mở dự án "${proj.name}" thành công!`, 'var(--btn-success)');
                stopProjectAutoSync();
                document.getElementById('modal-my-data')?.classList.remove('show');
            }
        });
    });

    listBody.querySelectorAll('.btn-dup-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const proj = localSavedProjectsCache.find(p => p.id === id);
            if (proj) {
                const newProj = JSON.parse(JSON.stringify(proj));
                newProj.id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                newProj.name = proj.name + ' (Bản sao)';
                newProj.updatedAt = Date.now();
                await saveProjectToCloudAndLocal(newProj);
            }
        });
    });

    listBody.querySelectorAll('.btn-del-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const proj = localSavedProjectsCache.find(p => p.id === id);
            if (proj && confirm(`Xóa vĩnh viễn dự án "${proj.name}" khỏi CSDL PostgreSQL?`)) {
                await deleteProjectFromCloudAndLocal(id);
                showToast(`🗑️ Đã xóa dự án "${proj.name}"!`, 'var(--btn-danger)');
            }
        });
    });
}

// LƯU THÀNH BẢN MỚI
async function saveCurrentAsProject(isSilent = false) {
    const titleVal = (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle.trim() : 'Chương_Mới';
    const storyTitleVal = (typeof metadata !== 'undefined' && metadata.title) ? metadata.title.trim() : '';

    let namePrompt = titleVal;
    if (!isSilent) {
        namePrompt = prompt("Nhập tên lưu cho Dự án / Chương này lên Server (Sẽ tạo bản mới):", titleVal);
        if (!namePrompt) return;
    }

    const dataStr = JSON.stringify(data);
    const newProjectId = (isSilent && localSavedProjectsCache.length > 0) 
                         ? localSavedProjectsCache[0].id 
                         : 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

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
        startProjectAutoSync();
        document.getElementById('modal-my-data')?.classList.add('show');
    });

    document.getElementById('btn-close-my-data')?.addEventListener('click', () => {
        stopProjectAutoSync();
        document.getElementById('modal-my-data')?.classList.remove('show');
    });

    document.getElementById('btn-save-current-as-project')?.addEventListener('click', () => saveCurrentAsProject(false));
    document.getElementById('project-search-input')?.addEventListener('input', renderMyProjectsListUI);
    document.getElementById('project-sort-select')?.addEventListener('change', renderMyProjectsListUI);

    window.addEventListener('storage', (e) => {
        if (e.key === 'mySavedProjects') {
            try {
                localSavedProjectsCache = JSON.parse(e.newValue) || [];
                renderMyProjectsListUI();
                calculateStorageMetrics();
            } catch(err) {}
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    try { initProjectManagerEvents(); } catch (e) { console.error("Lỗi Project Manager:", e); }
});