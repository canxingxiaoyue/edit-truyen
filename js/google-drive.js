// =========================================================================
// GOOGLE DRIVE API V3 - PHÂN CHIA 2 THƯ MỤC RIÊNG (CHƯƠNG TRUYỆN & TỪ ĐIỂN)
// =========================================================================

const CLIENT_ID = '214662773459-nepa84k1u7uhp1j08p250f9v42q0mbk6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// 2 THƯ MỤC RIÊNG BIỆT TRÊN GOOGLE DRIVE
const FOLDER_PROJECTS = 'CongCuEdit_ChuongTruyen';  // Ổ lưu chương truyện
const FOLDER_NAMEQT   = 'CongCuEdit_TuDienNameQT';  // Ổ lưu file từ điển Name QT

let accessToken = localStorage.getItem('gdrive_access_token') || null;
let tokenExpiresAt = Number(localStorage.getItem('gdrive_token_expires')) || 0;

// HÀM TIỆN ÍCH: TÁCH TÊN VÀ ĐUÔI FILE
function splitFileNameAndExt(fullName) {
    if (!fullName) return { baseName: 'Chua_dat_ten', ext: '' };
    const lastDot = fullName.lastIndexOf('.');
    if (lastDot > 0 && lastDot < fullName.length - 1) {
        return {
            baseName: fullName.substring(0, lastDot),
            ext: fullName.substring(lastDot)
        };
    }
    return { baseName: fullName, ext: '' };
}

// TỰ ĐỘNG CẤP STT NẾU TRÙNG TÊN: Tên (1).ext, Tên (2).ext
function resolveDriveFileNameConflict(desiredFullName, existingNamesList) {
    const existingSet = new Set(existingNamesList.map(n => n.toLowerCase().trim()));
    if (!existingSet.has(desiredFullName.toLowerCase().trim())) {
        return desiredFullName;
    }

    const { baseName, ext } = splitFileNameAndExt(desiredFullName);
    const cleanedBase = baseName.replace(/\s*\(\d+\)$/, '');

    let stt = 1;
    let candidate = `${cleanedBase} (${stt})${ext}`;
    while (existingSet.has(candidate.toLowerCase().trim())) {
        stt++;
        candidate = `${cleanedBase} (${stt})${ext}`;
    }
    return candidate;
}

// BẮT TOKEN OAUTH TỪ URL HASH
function checkUrlForOAuthToken() {
    if (window.location.hash && window.location.hash.includes('access_token')) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        const expiresIn = params.get('expires_in') || 3599;

        if (token) {
            accessToken = token;
            tokenExpiresAt = Date.now() + (Number(expiresIn) * 1000);
            localStorage.setItem('gdrive_access_token', accessToken);
            localStorage.setItem('gdrive_token_expires', String(tokenExpiresAt));

            history.replaceState(null, null, window.location.pathname + window.location.search);

            showToast("🟢 Đã kết nối Google Drive thành công!", "var(--btn-success)");
            if (typeof loadSavedProjects === 'function') loadSavedProjects();
        }
    }
}

function isGDriveConnected() {
    return accessToken && Date.now() < (tokenExpiresAt - 60000);
}

function triggerGoogleRedirectLogin() {
    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=token&` +
        `scope=${encodeURIComponent(SCOPES)}&` +
        `include_granted_scopes=true&` +
        `prompt=consent`;

    window.location.href = authUrl;
}

function openGDriveModal() {
    const modal = document.getElementById('modal-gdrive-auth');
    if (!modal) return;
    updateGDriveModalUI();
    modal.classList.add('show');
}

function closeGDriveModal() {
    document.getElementById('modal-gdrive-auth')?.classList.remove('show');
}

function updateGDriveModalUI() {
    const statusBox = document.getElementById('gdrive-status-box');
    const loginBtn = document.getElementById('btn-login-gdrive');
    const logoutBtn = document.getElementById('btn-disconnect-gdrive');
    const connected = isGDriveConnected();

    if (connected) {
        if (statusBox) statusBox.innerHTML = `Trạng thái: <strong><span style="color:#059669;">🟢 Đã kết nối Google Drive (15 GB Miễn phí)</span></strong>`;
        if (loginBtn) loginBtn.innerHTML = '🌿 Đổi tài khoản khác';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
        if (statusBox) statusBox.innerHTML = `Trạng thái: <strong><span style="color:#d97706;">🟡 Chưa kết nối Google Drive</span></strong>`;
        if (loginBtn) loginBtn.innerHTML = '🌿 Đăng nhập Google Drive';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

function disconnectGDrive() {
    if (confirm("Bạn có chắc muốn ngắt kết nối tài khoản Google Drive?")) {
        accessToken = null;
        tokenExpiresAt = 0;
        localStorage.removeItem('gdrive_access_token');
        localStorage.removeItem('gdrive_token_expires');
        showToast("Đã ngắt kết nối Google Drive!", "var(--btn-info)");
        updateGDriveModalUI();
        if (typeof calculateStorageMetrics === 'function') calculateStorageMetrics();
    }
}

// =========================================================================
// HÀM TÌM HOẶC TẠO THƯ MỤC THEO TÊN TRÊN DRIVE
// =========================================================================
async function getOrCreateFolder(folderName) {
    if (!isGDriveConnected()) return null;

    try {
        const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.files && data.files.length > 0) {
                return data.files[0].id;
            }
        }

        // Tạo thư mục nếu chưa tồn tại
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });

        if (createRes.ok) {
            const folderData = await createRes.json();
            return folderData.id;
        }
    } catch (e) {
        console.error("Lỗi getOrCreateFolder:", e);
    }
    return null;
}

// LẤY DANH SÁCH TÊN FILE TRONG 1 THƯ MỤC CỤ THỂ
async function gdriveFetchAllFileNames(folderId) {
    try {
        let q = `trashed=false`;
        if (folderId) q += ` and '${folderId}' in parents`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            return (data.files || []).map(f => f.name);
        }
    } catch (e) {}
    return [];
}

// =========================================================================
// 1. QUẢN LÝ Ổ CHƯƠNG TRUYỆN (CongCuEdit_ChuongTruyen)
// =========================================================================

async function gdriveListProjects() {
    if (!isGDriveConnected()) return null;
    const folderId = await getOrCreateFolder(FOLDER_PROJECTS);

    try {
        let q = `trashed=false and mimeType='application/json'`;
        if (folderId) q += ` and '${folderId}' in parents`;
        
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            const files = data.files || [];

            return files.map(f => {
                const props = f.appProperties || {};
                return {
                    id: f.id,
                    name: (props.name || f.name.replace('.json', '')),
                    chapterTitle: props.chapterTitle || '',
                    storyTitle: props.storyTitle || '',
                    rowCount: Number(props.rowCount) || 0,
                    size: Number(props.size) || 0,
                    updatedAt: Number(props.updatedAt) || new Date(f.modifiedTime).getTime()
                };
            });
        }
    } catch (e) {
        console.error("Lỗi list dự án:", e);
    }
    return null;
}

async function gdriveSaveProject(projObj) {
    if (!isGDriveConnected()) {
        openGDriveModal();
        return { success: false };
    }

    const folderId = await getOrCreateFolder(FOLDER_PROJECTS);
    let existingFileNames = await gdriveFetchAllFileNames(folderId);

    const originalFileName = `${projObj.name}.json`;
    const finalFileName = resolveDriveFileNameConflict(originalFileName, existingFileNames);
    const finalProjectName = finalFileName.replace(/\.json$/i, '');

    projObj.name = finalProjectName;

    const metadata = {
        name: finalFileName,
        mimeType: 'application/json',
        appProperties: {
            name: finalProjectName,
            chapterTitle: projObj.chapterTitle || '',
            storyTitle: projObj.storyTitle || '',
            rowCount: String(projObj.rowCount || 0),
            size: String(projObj.size || 0),
            updatedAt: String(projObj.updatedAt || Date.now())
        }
    };

    if (folderId) metadata.parents = [folderId];

    const boundary = '-------GDriveBoundary' + Date.now();
    const multipartRequestBody =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        JSON.stringify(projObj) +
        `\r\n--${boundary}--`;

    const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    let res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
    });

    if (res.ok) {
        const savedData = await res.json();
        return { success: true, savedName: finalProjectName, fileId: savedData.id };
    } else {
        const errText = await res.text();
        console.error("🔴 Lỗi lưu chương truyện lên Drive:", errText);
        return { success: false };
    }
}

async function gdriveGetProjectContent(fileId) {
    if (!isGDriveConnected()) return null;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) return await res.json();
    } catch (e) {}
    return null;
}

async function gdriveDeleteProject(fileId) {
    if (!isGDriveConnected()) return false;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        return res.ok;
    } catch (e) { return false; }
}

// =========================================================================
// 2. QUẢN LÝ Ổ TỪ ĐIỂN NAME QT (CongCuEdit_TuDienNameQT)
// =========================================================================

async function gdriveSaveNameQTFile(fileObj) {
    if (!isGDriveConnected()) {
        openGDriveModal();
        return { success: false };
    }
    
    // Lưu thẳng vào thư mục riêng CongCuEdit_TuDienNameQT
    const folderId = await getOrCreateFolder(FOLDER_NAMEQT);
    let existingFileNames = await gdriveFetchAllFileNames(folderId);

    const { baseName, ext } = splitFileNameAndExt(fileObj.fileName || 'Name.txt');
    const safeExt = ext || '.txt';
    const desiredFullName = `${baseName}${safeExt}`;
    
    // Tự động kiểm tra trùng tên trong ổ từ điển: VietPhrase (1).txt
    const finalFullName = resolveDriveFileNameConflict(desiredFullName, existingFileNames);

    const content = fileObj.content || '';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    const metadata = {
        name: finalFullName,
        mimeType: 'text/plain',
        appProperties: {
            type: 'nameqt',
            originalName: finalFullName,
            count: String(fileObj.count || 0),
            updatedAt: String(fileObj.updatedAt || Date.now())
        }
    };
    if (folderId) metadata.parents = [folderId];

    const initUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`;

    const initRes = await fetch(initUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'text/plain',
            'X-Upload-Content-Length': String(blob.size)
        },
        body: JSON.stringify(metadata)
    });

    if (!initRes.ok) return { success: false };
    const uploadUri = initRes.headers.get('Location');
    if (!uploadUri) return { success: false };

    const uploadRes = await fetch(uploadUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: blob
    });

    if (uploadRes.ok) {
        return { success: true, savedName: finalFullName };
    }
    return { success: false };
}

async function gdriveListNameQTFiles() {
    if (!isGDriveConnected()) return [];
    const folderId = await getOrCreateFolder(FOLDER_NAMEQT);

    try {
        let q = `trashed=false`;
        if (folderId) q += ` and '${folderId}' in parents`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            return data.files || [];
        }
    } catch (e) {}
    return [];
}

async function gdriveDownloadNameQTContent(fileId) {
    if (!isGDriveConnected()) return null;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) return await res.text();
    } catch (e) {}
    return null;
}

async function gdriveDeleteNameQTFile(fileName) {
    if (!isGDriveConnected()) return;
    const folderId = await getOrCreateFolder(FOLDER_NAMEQT);

    try {
        let q = `name='${fileName}' and trashed=false`;
        if (folderId) q += ` and '${folderId}' in parents`;
        const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.files && checkData.files.length > 0) {
                for (const f of checkData.files) {
                    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                }
            }
        }
    } catch(e) {}
}

window.addEventListener('load', () => {
    checkUrlForOAuthToken();
    document.getElementById('btn-login-gdrive')?.addEventListener('click', triggerGoogleRedirectLogin);
    document.getElementById('btn-close-gdrive-modal')?.addEventListener('click', closeGDriveModal);
    document.getElementById('btn-disconnect-gdrive')?.addEventListener('click', disconnectGDrive);
});