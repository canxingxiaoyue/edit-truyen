// =========================================================================
// GOOGLE DRIVE API V3 - CHẾ ĐỘ CHUYỂN TRANG (REDIRECT MODE - 0% BỊ CHẶN)
// =========================================================================

const CLIENT_ID = '214662773459-nepa84k1u7uhp1j08p250f9v42q0mbk6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'CongCuEdit_Projects';

let accessToken = localStorage.getItem('gdrive_access_token') || null;
let tokenExpiresAt = Number(localStorage.getItem('gdrive_token_expires')) || 0;
let appFolderId = localStorage.getItem('gdrive_folder_id') || null;

// TỰ ĐỘNG BẮT TOKEN KHI GOOGLE CHUYỂN HƯỚNG VỀ LẠI WEB
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

            // Xóa đoạn hash loằng ngoằng trên thanh URL cho sạch
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

// CHUYỂN TRANG THẲNG SANG GOOGLE (KHÔNG DÙNG POPUP - 100% THÀNH CÔNG)
function triggerGoogleRedirectLogin() {
    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=token&` +
        `scope=${encodeURIComponent(SCOPES)}&` +
        `include_granted_scopes=true&` +
        `prompt=consent`;

    // Chuyển hướng trực tiếp trang web
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

async function gdriveListProjects() {
    if (!isGDriveConnected()) return null;
    const folderId = await getOrCreateFolder();
    if (!folderId) return null;

    try {
        const query = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/json'`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc`, {
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

async function gdriveSaveProject(projObj) {
    if (!isGDriveConnected()) {
        openGDriveModal();
        return false;
    }
    const folderId = await getOrCreateFolder();
    if (!folderId) return false;

    const fileName = `${projObj.name}.json`;
    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [folderId],
        appProperties: {
            name: projObj.name,
            chapterTitle: projObj.chapterTitle || '',
            storyTitle: projObj.storyTitle || '',
            rowCount: String(projObj.rowCount || 0),
            size: String(projObj.size || 0),
            updatedAt: String(projObj.updatedAt || Date.now())
        }
    };

    let existingFileId = null;
    try {
        const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
        const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const checkData = await checkRes.json();
        if (checkData.files && checkData.files.length > 0) {
            existingFileId = checkData.files[0].id;
        }
    } catch (e) {}

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

    const url = existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const res = await fetch(url, {
        method: existingFileId ? 'PATCH' : 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
    });

    return res.ok;
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

// LẮNG NGHE SỰ KIỆN
window.addEventListener('load', () => {
    checkUrlForOAuthToken();
    document.getElementById('btn-login-gdrive')?.addEventListener('click', triggerGoogleRedirectLogin);
    document.getElementById('btn-close-gdrive-modal')?.addEventListener('click', closeGDriveModal);
    document.getElementById('btn-disconnect-gdrive')?.addEventListener('click', disconnectGDrive);
});
// =========================================================================
// XỬ LÝ NAME QT TRÊN GOOGLE DRIVE (HỖ TRỢ FILE NẶNG TỚI 100MB)
// =========================================================================

// 1. LƯU FILE NAME QT LÊN GOOGLE DRIVE (DÙNG CHUẨN RESUMABLE CHO FILE LỚN)
async function gdriveSaveNameQTFile(fileObj) {
    if (!isGDriveConnected()) {
        openGDriveModal();
        return false;
    }
    const folderId = await getOrCreateFolder();
    if (!folderId) return false;

    const fileName = `[NameQT]_${fileObj.fileName || 'Name.txt'}`;
    const content = fileObj.content || '';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    const metadata = {
        name: fileName,
        mimeType: 'text/plain',
        parents: [folderId],
        appProperties: {
            type: 'nameqt',
            originalName: fileObj.fileName || 'Name.txt',
            count: String(fileObj.count || 0),
            updatedAt: String(fileObj.updatedAt || Date.now())
        }
    };

    // Kiểm tra xem file đã có trên Drive chưa để cập nhật đè
    let existingId = null;
    try {
        const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
        const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const checkData = await checkRes.json();
        if (checkData.files && checkData.files.length > 0) existingId = checkData.files[0].id;
    } catch(e) {}

    // Khởi tạo phiên tải lên Resumable (cho phép tải file 30MB-50MB an toàn tuyệt đối)
    const initUrl = existingId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=resumable`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`;
    const initMethod = existingId ? 'PATCH' : 'POST';

    const initRes = await fetch(initUrl, {
        method: initMethod,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'text/plain',
            'X-Upload-Content-Length': String(blob.size)
        },
        body: JSON.stringify(metadata)
    });

    if (!initRes.ok) return false;
    const uploadUri = initRes.headers.get('Location');
    if (!uploadUri) return false;

    // Đẩy toàn bộ nội dung file lên Google Drive
    const uploadRes = await fetch(uploadUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: blob
    });

    return uploadRes.ok;
}

// 2. LẤY DANH SÁCH FILE NAME QT ĐANG CÓ TRÊN DRIVE
async function gdriveListNameQTFiles() {
    if (!isGDriveConnected()) return [];
    const folderId = await getOrCreateFolder();
    if (!folderId) return [];

    try {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and appProperties has { key='type' and value='nameqt' }`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        return data.files || [];
    } catch (e) { return []; }
}

// 3. TẢI NỘI DUNG FILE NAME QT TỪ DRIVE VỀ MÁY
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

// 4. XÓA FILE NAME QT TRÊN DRIVE
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
            await fetch(`https://www.googleapis.com/drive/v3/files/${checkData.files[0].id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
        }
    } catch(e) {}
}