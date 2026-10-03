// =========================================================================
// GOOGLE DRIVE API V3 - QUY CHUẨN XỬ LÝ TRÙNG TÊN & KHÔNG GHI ĐÈ FILE
// =========================================================================

const CLIENT_ID = '214662773459-nepa84k1u7uhp1j08p250f9v42q0mbk6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'CongCuEdit_Projects';

let accessToken = localStorage.getItem('gdrive_access_token') || null;
let tokenExpiresAt = Number(localStorage.getItem('gdrive_token_expires')) || 0;
let appFolderId = localStorage.getItem('gdrive_folder_id') || null;

// =========================================================================
// HÀM TIỆN ÍCH: PHÂN TÍCH TÊN VÀ TỰ ĐỘNG CẤP STT TÊN (STT).EXT
// =========================================================================
function splitFileNameAndExt(fullName) {
    if (!fullName) return { baseName: 'Chua_dat_ten', ext: '' };
    const lastDot = fullName.lastIndexOf('.');
    if (lastDot > 0 && lastDot < fullName.length - 1) {
        return {
            baseName: fullName.substring(0, lastDot),
            ext: fullName.substring(lastDot) // Giữ nguyên phần mở rộng kể cả dấu chấm
        };
    }
    return {
        baseName: fullName,
        ext: ''
    };
}

// Tìm số thứ tự nhỏ nhất chưa tồn tại theo cú pháp Tên (STT).ext
function resolveDriveFileNameConflict(desiredFullName, existingNamesList) {
    const existingSet = new Set(existingNamesList.map(n => n.toLowerCase().trim()));
    if (!existingSet.has(desiredFullName.toLowerCase().trim())) {
        return desiredFullName;
    }

    const { baseName, ext } = splitFileNameAndExt(desiredFullName);
    // Chuẩn hóa baseName: nếu đã có đuôi dạng " (Số)" thì lấy phần gốc
    const cleanedBase = baseName.replace(/\s*\(\d+\)$/, '');

    let stt = 1;
    let candidate = `${cleanedBase} (${stt})${ext}`;
    while (existingSet.has(candidate.toLowerCase().trim())) {
        stt++;
        candidate = `${cleanedBase} (${stt})${ext}`;
    }
    return candidate;
}

// BẮT TOKEN OAUTH TỪ URL HASH (REDIRECT MODE)
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
            getOrCreateFolder();
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
        appFolderId = null;
        localStorage.removeItem('gdrive_access_token');
        localStorage.removeItem('gdrive_token_expires');
        localStorage.removeItem('gdrive_folder_id');
        showToast("Đã ngắt kết nối Google Drive!", "var(--btn-info)");
        updateGDriveModalUI();
        if (typeof calculateStorageMetrics === 'function') calculateStorageMetrics();
    }
}

async function getOrCreateFolder() {
    if (appFolderId) return appFolderId;
    if (!isGDriveConnected()) return null;

    try {
        const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        
        if (data.files && data.files.length > 0) {
            appFolderId = data.files[0].id;
        } else {
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: FOLDER_NAME,
                    mimeType: 'application/vnd.google-apps.folder'
                })
            });
            const folderData = await createRes.json();
            appFolderId = folderData.id;
        }

        if (appFolderId) localStorage.setItem('gdrive_folder_id', appFolderId);
        return appFolderId;
    } catch (e) { return null; }
}

// =========================================================================
// 1. TẢI TOÀN BỘ DANH SÁCH FILE HIỆN CÓ TRÊN GOOGLE DRIVE
// =========================================================================
async function gdriveFetchAllFileNames(folderId) {
    try {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error("Không thể đọc danh sách file từ Drive");
        const data = await res.json();
        return (data.files || []).map(f => f.name);
    } catch (e) {
        console.error("Lỗi quét tên file Google Drive:", e);
        throw e;
    }
}

async function gdriveListProjects() {
    if (!isGDriveConnected()) return null;
    const folderId = await getOrCreateFolder();
    if (!folderId) return null;

    try {
        const query = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/json'`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
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
    } catch (e) { return null; }
}

// =========================================================================
// 2. LƯU DỰ ÁN LÊN GOOGLE DRIVE (TỰ ĐỘNG ĐỔI TÊN STT, TUYỆT ĐỐI KHÔNG GHI ĐÈ)
// =========================================================================
async function gdriveSaveProject(projObj) {
    if (!isGDriveConnected()) {
        alert("⚠️ Không thể kiểm tra trực tiếp Google Drive do chưa có quyền truy cập hoặc phiên đăng nhập đã hết hạn!");
        openGDriveModal();
        return { success: false };
    }
    const folderId = await getOrCreateFolder();
    if (!folderId) {
        alert("⚠️ Không thể truy cập thư mục Google Drive để kiểm tra tên file!");
        return { success: false };
    }

    // 1. Quét danh sách file thực tế trên Google Drive
    let existingFileNames = [];
    try {
        existingFileNames = await gdriveFetchAllFileNames(folderId);
    } catch (err) {
        alert("⚠️ Không thể kiểm tra danh sách file trên Google Drive! Hệ thống không giả định tên chưa tồn tại để tránh rủi ro dữ liệu.");
        return { success: false };
    }

    // 2. Tự động kiểm tra và giải quyết trùng tên theo cú pháp Tên (STT).json
    const originalFileName = `${projObj.name}.json`;
    const finalFileName = resolveDriveFileNameConflict(originalFileName, existingFileNames);
    const finalProjectName = finalFileName.replace(/\.json$/i, '');

    // Cập nhật tên thực tế sau khi đổi vào project object
    projObj.name = finalProjectName;

    const metadata = {
        name: finalFileName,
        mimeType: 'application/json',
        parents: [folderId],
        appProperties: {
            name: finalProjectName,
            chapterTitle: projObj.chapterTitle || '',
            storyTitle: projObj.storyTitle || '',
            rowCount: String(projObj.rowCount || 0),
            size: String(projObj.size || 0),
            updatedAt: String(projObj.updatedAt || Date.now())
        }
    };

    // 3. TẠO FILE MỚI HOÀN TOÀN (POST) - TUYỆT ĐỐI KHÔNG DÙNG PATCH ĐỂ TRÁNH GHI ĐÈ
    const boundary = '-------GDriveProjectUploadBoundary';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(projObj) +
        closeDelim;

    const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const res = await fetch(url, {
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
    }
    return { success: false };
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
// 3. LƯU FILE NAME QT LÊN GOOGLE DRIVE (TỰ ĐỘNG ĐỔI TÊN STT, KHÔNG GHI ĐÈ)
// =========================================================================
async function gdriveSaveNameQTFile(fileObj) {
    if (!isGDriveConnected()) {
        alert("⚠️ Không thể kiểm tra trực tiếp Google Drive do chưa có quyền truy cập!");
        openGDriveModal();
        return { success: false };
    }
    const folderId = await getOrCreateFolder();
    if (!folderId) {
        alert("⚠️ Không thể truy cập thư mục Google Drive để kiểm tra tên file!");
        return { success: false };
    }

    let existingFileNames = [];
    try {
        existingFileNames = await gdriveFetchAllFileNames(folderId);
    } catch (err) {
        alert("⚠️ Không thể kiểm tra danh sách file trên Google Drive! Hệ thống không giả định tên chưa tồn tại.");
        return { success: false };
    }

    const { baseName, ext } = splitFileNameAndExt(fileObj.fileName || 'Name.txt');
    const safeExt = ext || '.txt';
    const desiredFullName = `[NameQT]_${baseName}${safeExt}`;
    
    // Tự động cấp số thứ tự nếu trùng file Name QT trên Drive
    const finalFullName = resolveDriveFileNameConflict(desiredFullName, existingFileNames);
    const finalCleanFileName = finalFullName.replace(/^\[NameQT\]_/, '');

    const content = fileObj.content || '';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    const metadata = {
        name: finalFullName,
        mimeType: 'text/plain',
        parents: [folderId],
        appProperties: {
            type: 'nameqt',
            originalName: finalCleanFileName,
            count: String(fileObj.count || 0),
            updatedAt: String(fileObj.updatedAt || Date.now())
        }
    };

    // Luôn tạo file mới qua Resumable Upload (hỗ trợ file nặng lên đến 100MB)
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
        return { success: true, savedName: finalCleanFileName };
    }
    return { success: false };
}

async function gdriveListNameQTFiles() {
    if (!isGDriveConnected()) return [];
    const folderId = await getOrCreateFolder();
    if (!folderId) return [];

    try {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and appProperties has { key='type' and value='nameqt' }`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        return data.files || [];
    } catch (e) { return []; }
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

async function gdriveDeleteNameQTFile(originalName) {
    if (!isGDriveConnected()) return;
    const folderId = await getOrCreateFolder();
    if (!folderId) return;

    try {
        const fileName = `[NameQT]_${originalName}`;
        const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
        const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const checkData = await checkRes.json();
        if (checkData.files && checkData.files.length > 0) {
            for (const f of checkData.files) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
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