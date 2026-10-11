// =========================================================================
// GOOGLE DRIVE API V3 - ĐĂNG NHẬP VĨNH VIỄN (TỰ ĐỘNG GIA HẠN TOKEN)
// =========================================================================

const CLIENT_ID = '214662773459-nepa84k1u7uhp1j08p250f9v42q0mbk6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const FOLDER_PROJECTS = 'CongCuEdit_ChuongTruyen';  
const FOLDER_NAMEQT   = 'CongCuEdit_TuDienNameQT';  
const NAMEQT_PREFIX   = '[TỪ ĐIỂN NAME QT] - ';

let accessToken = localStorage.getItem('gdrive_access_token') || null;
let tokenExpiresAt = Number(localStorage.getItem('gdrive_token_expires')) || 0;

// =========================================================================
// 1. CƠ CHẾ ĐĂNG NHẬP VĨNH VIỄN VÀ TỰ ĐỘNG GIA HẠN
// =========================================================================
function isGDriveConnected() {
    // Chỉ cần có cờ này là giao diện luôn báo Đã Kết Nối, không bị văng sau 1 tiếng
    return localStorage.getItem('gdrive_auto_login') === 'true';
}

// Bắt tự động gia hạn token âm thầm
async function getValidToken() {
    if (!isGDriveConnected()) return null;

    // Nếu token còn hạn > 1 phút thì dùng luôn
    if (accessToken && Date.now() < (tokenExpiresAt - 60000)) {
        return accessToken;
    }

    // Hết hạn -> Xin cấp lại âm thầm không hiện cửa sổ
    return new Promise((resolve) => {
        if (typeof google === 'undefined' || !google.accounts) {
            resolve(null);
            return;
        }
        try {
            const tc = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (resp) => {
                    if (resp.error) {
                        console.warn("Gia hạn token bị chặn:", resp.error);
                        resolve(null); // Fallback offline
                    } else {
                        accessToken = resp.access_token;
                        tokenExpiresAt = Date.now() + (Number(resp.expires_in) * 1000);
                        localStorage.setItem('gdrive_access_token', accessToken);
                        localStorage.setItem('gdrive_token_expires', String(tokenExpiresAt));
                        localStorage.setItem('gdrive_auto_login', 'true');
                        resolve(accessToken);
                    }
                }
            });
            tc.requestAccessToken({ prompt: '' });
        } catch (e) {
            resolve(null);
        }
    });
}

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
            localStorage.setItem('gdrive_auto_login', 'true'); // Cắm cờ Vĩnh viễn

            history.replaceState(null, null, window.location.pathname + window.location.search);
            showToast("🟢 Đã kết nối Google Drive vĩnh viễn!", "var(--btn-success)");
            
            if (typeof loadSavedProjects === 'function') loadSavedProjects();
            if (typeof syncHistoryFromDrive === 'function') syncHistoryFromDrive();
        }
    }
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

function disconnectGDrive() {
    if (confirm("Bạn có chắc muốn ngắt kết nối tài khoản Google Drive?")) {
        accessToken = null;
        tokenExpiresAt = 0;
        localStorage.removeItem('gdrive_access_token');
        localStorage.removeItem('gdrive_token_expires');
        localStorage.removeItem('gdrive_auto_login'); // Gỡ cờ Vĩnh viễn
        showToast("Đã ngắt kết nối Google Drive!", "var(--btn-info)");
        if (typeof updateGDriveModalUI === 'function') updateGDriveModalUI();
        if (typeof calculateStorageMetrics === 'function') calculateStorageMetrics();
    }
}

// =========================================================================
// HÀM TIỆN ÍCH
// =========================================================================
function splitFileNameAndExt(fullName) {
    if (!fullName) return { baseName: 'Chua_dat_ten', ext: '' };
    const lastDot = fullName.lastIndexOf('.');
    if (lastDot > 0 && lastDot < fullName.length - 1) {
        return { baseName: fullName.substring(0, lastDot), ext: fullName.substring(lastDot) };
    }
    return { baseName: fullName, ext: '' };
}

function resolveDriveFileNameConflict(desiredFullName, existingNamesList) {
    const existingSet = new Set(existingNamesList.map(n => n.toLowerCase().trim()));
    if (!existingSet.has(desiredFullName.toLowerCase().trim())) return desiredFullName;

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

// =========================================================================
// QUẢN LÝ THƯ MỤC
// =========================================================================
async function getOrCreateFolder(folderName) {
    const token = await getValidToken();
    if (!token) return null;

    try {
        const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.files && data.files.length > 0) return data.files[0].id;
        }

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
        });

        if (createRes.ok) {
            const folderData = await createRes.json();
            return folderData.id;
        }
    } catch (e) {}
    return null;
}

async function gdriveFetchAllFileNames(folderId) {
    const token = await getValidToken();
    if (!token) return [];
    try {
        let q = `trashed=false`;
        if (folderId) q += ` and '${folderId}' in parents`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            return (data.files || []).map(f => f.name);
        }
    } catch (e) {}
    return [];
}

// =========================================================================
// Ổ CHƯƠNG TRUYỆN
// =========================================================================
async function gdriveListProjects() {
    const token = await getValidToken();
    if (!token) return null;
    const folderId = await getOrCreateFolder(FOLDER_PROJECTS);

    try {
        let q = `trashed=false and mimeType='application/json'`;
        if (folderId) q += ` and '${folderId}' in parents`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            return (data.files || []).map(f => {
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
    } catch (e) {}
    return null;
}

async function gdriveSaveProject(projObj) {
    const token = await getValidToken();
    if (!token) return { success: false };
    const folderId = await getOrCreateFolder(FOLDER_PROJECTS);
    let existingFileNames = await gdriveFetchAllFileNames(folderId);

    const finalFileName = resolveDriveFileNameConflict(`${projObj.name}.json`, existingFileNames);
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
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        JSON.stringify(projObj) +
        `\r\n--${boundary}--`;

    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
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
    const token = await getValidToken();
    if (!token) return null;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) return await res.json();
    } catch (e) {}
    return null;
}

async function gdriveDeleteProject(fileId) {
    const token = await getValidToken();
    if (!token) return false;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok;
    } catch (e) { return false; }
}

// =========================================================================
// Ổ TỪ ĐIỂN NAME QT
// =========================================================================
async function gdriveSaveNameQTFile(fileObj) {
    const token = await getValidToken();
    if (!token) return { success: false };
    
    const folderId = await getOrCreateFolder(FOLDER_NAMEQT);
    let existingFileNames = await gdriveFetchAllFileNames(folderId);

    const { baseName, ext } = splitFileNameAndExt(fileObj.fileName || 'Name.txt');
    const safeExt = ext || '.txt';
    const desiredFullName = `${NAMEQT_PREFIX}${baseName}${safeExt}`;
    
    const finalFullName = resolveDriveFileNameConflict(desiredFullName, existingFileNames);
    const finalCleanFileName = finalFullName.replace(NAMEQT_PREFIX, '');

    const content = fileObj.content || '';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    const metadata = {
        name: finalFullName,
        mimeType: 'text/plain',
        appProperties: {
            type: 'nameqt',
            originalName: finalCleanFileName,
            count: String(fileObj.count || 0),
            updatedAt: String(fileObj.updatedAt || Date.now())
        }
    };
    if (folderId) metadata.parents = [folderId];

    const initRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
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

    if (uploadRes.ok) return { success: true, savedName: finalCleanFileName };
    return { success: false };
}

async function gdriveListNameQTFiles() {
    const token = await getValidToken();
    if (!token) return [];
    const folderId = await getOrCreateFolder(FOLDER_NAMEQT);

    try {
        let q = `trashed=false and appProperties has { key='type' and value='nameqt' }`;
        if (folderId) q += ` and '${folderId}' in parents`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            return data.files || [];
        }
    } catch (e) {}
    return [];
}

async function gdriveDownloadNameQTContent(fileId) {
    const token = await getValidToken();
    if (!token) return null;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) return await res.text();
    } catch (e) {}
    return null;
}

async function gdriveDeleteNameQTFile(fileName) {
    const token = await getValidToken();
    if (!token) return;
    const folderId = await getOrCreateFolder(FOLDER_NAMEQT);

    try {
        let q = `name='${NAMEQT_PREFIX}${fileName}' and trashed=false`;
        if (folderId) q += ` and '${folderId}' in parents`;
        const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.files && checkData.files.length > 0) {
                for (const f of checkData.files) {
                    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                }
            }
        }
    } catch(e) {}
}

// =========================================================================
// CLOUD HISTORY
// =========================================================================
async function gdriveSaveHistoryCloud(type, historyArray) {
    const token = await getValidToken();
    if (!token) return false;
    const folderId = await getOrCreateFolder(FOLDER_PROJECTS);
    if (!folderId) return false;

    const fileName = type === 'editor' ? '[LỊCH SỬ] - BanDich.json' : '[LỊCH SỬ] - ThongTin.json';
    const content = JSON.stringify(historyArray);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });

    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [folderId],
        appProperties: { type: 'cloud_history', historyType: type }
    };

    let existingId = null;
    try {
        const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
        const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const checkData = await checkRes.json();
        if (checkData.files && checkData.files.length > 0) existingId = checkData.files[0].id;
    } catch(e) {}

    const initUrl = existingId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=resumable`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`;
    const initMethod = existingId ? 'PATCH' : 'POST';

    const initRes = await fetch(initUrl, {
        method: initMethod,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'application/json',
            'X-Upload-Content-Length': String(blob.size)
        },
        body: JSON.stringify(metadata)
    });

    if (!initRes.ok) return false;
    const uploadUri = initRes.headers.get('Location');
    if (!uploadUri) return false;

    const uploadRes = await fetch(uploadUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: blob
    });

    return uploadRes.ok;
}

async function gdriveLoadHistoryCloud(type) {
    const token = await getValidToken();
    if (!token) return null;
    const folderId = await getOrCreateFolder(FOLDER_PROJECTS);
    if (!folderId) return null;

    try {
        const fileName = type === 'editor' ? '[LỊCH SỬ] - BanDich.json' : '[LỊCH SỬ] - ThongTin.json';
        const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.files && data.files.length > 0) {
            const fileId = data.files[0].id;
            const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (dlRes.ok) return await dlRes.json();
        }
    } catch (e) {}
    return null;
}

window.addEventListener('load', () => {
    checkUrlForOAuthToken();
    document.getElementById('btn-login-gdrive')?.addEventListener('click', triggerGoogleRedirectLogin);
    document.getElementById('btn-close-gdrive-modal')?.addEventListener('click', () => {
        document.getElementById('modal-gdrive-auth')?.classList.remove('show');
    });
    document.getElementById('btn-disconnect-gdrive')?.addEventListener('click', disconnectGDrive);
});