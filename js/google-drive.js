// =========================================================================
// GOOGLE DRIVE API V3 ENGINE - TÍCH HỢP CỬA SỔ XANH LÁ DỊU (SAGE MODAL)
// =========================================================================

const CLIENT_ID = '214662773459-nepa84k1u7uhp1j08p250f9v42q0mbk6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'CongCuEdit_Projects';

let tokenClient = null;
let accessToken = localStorage.getItem('gdrive_access_token') || null;
let tokenExpiresAt = Number(localStorage.getItem('gdrive_token_expires')) || 0;
let appFolderId = localStorage.getItem('gdrive_folder_id') || null;

function initGoogleDriveAuth() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: async (resp) => {
                    if (resp.error !== undefined) {
                        console.error("Lỗi xác thực Google:", resp);
                        alert("❌ Đăng nhập Google thất bại: " + resp.error);
                        return;
                    }
                    accessToken = resp.access_token;
                    tokenExpiresAt = Date.now() + (Number(resp.expires_in) * 1000);
                    localStorage.setItem('gdrive_access_token', accessToken);
                    localStorage.setItem('gdrive_token_expires', String(tokenExpiresAt));

                    showToast("🟢 Đã kết nối Google Drive thành công!", "var(--btn-success)");
                    updateGDriveModalUI();
                    await getOrCreateFolder();
                    if (typeof loadSavedProjects === 'function') loadSavedProjects();
                    closeGDriveModal();
                },
            });
        } catch (e) {
            console.error("Lỗi initTokenClient:", e);
        }
    }
}

function isGDriveConnected() {
    return accessToken && Date.now() < (tokenExpiresAt - 60000);
}

// BẬT CỬA SỔ ĐĂNG NHẬP GOOGLE
function triggerGooglePopup() {
    if (!tokenClient) initGoogleDriveAuth();
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: isGDriveConnected() ? '' : 'consent' });
    } else {
        alert("Thư viện Google đang tải, vui lòng bấm lại sau 2 giây!");
    }
}

// =========================================================================
// QUẢN LÝ MỞ / ĐÓNG CỬA SỔ XANH LÁ DỊU (MODAL)
// =========================================================================
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
    if (confirm("Bạn có chắc chắn muốn ngắt kết nối tài khoản Google Drive trên máy này?")) {
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

// CÁC HÀM XỬ LÝ DRIVE
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
    } catch (e) {
        return null;
    }
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
    } catch (e) {
        return null;
    }
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
        if (res.ok) {
            return await res.json();
        }
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
    } catch (e) {
        return false;
    }
}

// GẮN SỰ KIỆN NÚT BẤM TRONG CỬA SỔ XANH LÁ
window.addEventListener('load', () => {
    initGoogleDriveAuth();
    document.getElementById('btn-login-gdrive')?.addEventListener('click', triggerGooglePopup);
    document.getElementById('btn-close-gdrive-modal')?.addEventListener('click', closeGDriveModal);
    document.getElementById('btn-disconnect-gdrive')?.addEventListener('click', disconnectGDrive);
});