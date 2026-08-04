// =========================================================================
// LÕI ĐỒNG BỘ CLOUD THỜI GIAN THỰC (REAL-TIME CLOUD ENGINE - REQ 20-25)
// =========================================================================

// CẤU HÌNH THỰC TẾ DỰ ÁN EDIT-TRUYEN CỦA BẠN
const firebaseConfig = {
    apiKey: "AIzaSyAAFrjt0SQJzlx8CHpmAStu8IBDyNgUfgk",
    authDomain: "edit-truyen.firebaseapp.com",
    projectId: "edit-truyen",
    storageBucket: "edit-truyen.firebasestorage.app",
    messagingSenderId: "214662773459",
    appId: "1:214662773459:web:500bfa5494adaf59d87226",
    measurementId: "G-82GZLZY8N8"
};

// Khởi tạo Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

let db = null;
let cloudUnsubscribeChapter = null;
let autoSaveCloudTimeout = null;
let isApplyingRemoteChange = false;

// Cấu trúc trạng thái Cloud hiện tại
let activeCloudState = {
    projectId: 'default_project',
    projectTitle: 'Chương Truyện Mới',
    chapterId: 'chap_1',
    chapterTitle: 'Chương 1',
    lastSavedHash: ''
};

// 1. KÍCH HOẠT KHỞI TẠO CLOUD ENGINE
function initCloudSyncEngine() {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.warn("Firebase chưa được khởi tạo.");
        return;
    }

    try {
        db = firebase.firestore();
        
        // BẬT TỰ ĐỘNG LƯU ĐỆM OFFLINE (INDEXEDDB CACHE)
        db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
            if (err.code === 'failed-precondition') {
                console.warn('Persistence failed: Multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Browser does not support persistence');
            }
        });

        window.addEventListener('online', updateCloudStatusUI);
        window.addEventListener('offline', updateCloudStatusUI);

        console.log("🟢 Cloud Sync Engine đã sẵn sàng!");
    } catch (e) {
        console.error("Lỗi khởi tạo Cloud Firestore:", e);
    }
}

function getUserId() {
    if (typeof window.Clerk !== 'undefined' && window.Clerk.user) {
        return window.Clerk.user.id;
    }
    return 'guest_local_user';
}

function updateCloudStatusUI(status = 'synced') {
    const badge = document.getElementById('cloud-status-badge');
    const text = document.getElementById('cloud-status-text');
    if (!badge || !text) return;

    badge.className = 'cloud-status-badge';

    if (!navigator.onLine) {
        badge.classList.add('offline');
        text.innerText = '🔴 Offline (Lưu tạm)';
        badge.title = 'Đang ngoại tuyến. Dữ liệu sẽ tự đồng bộ khi có mạng.';
        return;
    }

    if (status === 'saving') {
        badge.classList.add('saving');
        text.innerText = '🟡 Đang lưu Cloud...';
    } else if (status === 'synced') {
        badge.classList.add('synced');
        text.innerText = '🟢 Cloud Synced';
        badge.title = 'Dữ liệu đã được bảo vệ trên Cloud.';
    } else if (status === 'error') {
        badge.classList.add('offline');
        text.innerText = '⚠️ Lỗi đồng bộ';
    }
}

// 2. TỰ ĐỘNG LƯU THỜI GIAN THỰC (AUTO-SAVE)
function triggerCloudAutoSave() {
    if (isApplyingRemoteChange) return;

    updateCloudStatusUI('saving');
    clearTimeout(autoSaveCloudTimeout);

    autoSaveCloudTimeout = setTimeout(async () => {
        await executeCloudSave();
    }, 1200);
}

async function executeCloudSave() {
    const userId = getUserId();
    if (!db || userId === 'guest_local_user') {
        updateCloudStatusUI('synced');
        return;
    }

    try {
        const payload = {
            chapterTitle: (typeof chapterTitle !== 'undefined' && chapterTitle) ? chapterTitle : 'Chương 1',
            data: data || [],
            manualQTState: manualQTState || {},
            metadata: (typeof metadata !== 'undefined') ? metadata : {},
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedByDevice: navigator.userAgent
        };

        const currentHash = JSON.stringify(payload.data) + JSON.stringify(payload.manualQTState);
        if (currentHash === activeCloudState.lastSavedHash) {
            updateCloudStatusUI('synced');
            return;
        }

        const chapRef = db.collection('users').doc(userId)
            .collection('projects').doc(activeCloudState.projectId)
            .collection('chapters').doc(activeCloudState.chapterId);

        await chapRef.set(payload, { merge: true });

        await db.collection('users').doc(userId)
            .collection('projects').doc(activeCloudState.projectId)
            .set({
                title: activeCloudState.projectTitle,
                lastChapterId: activeCloudState.chapterId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

        activeCloudState.lastSavedHash = currentHash;
        updateCloudStatusUI('synced');

        saveCloudVersionSnapshot(chapRef, payload);

    } catch (err) {
        console.error("Lỗi đẩy dữ liệu Cloud:", err);
        updateCloudStatusUI('error');
    }
}

// 3. TỰ ĐỘNG LẮNG NGHE ĐỒNG BỘ REAL-TIME TỪ THIẾT BỊ KHÁC
function subscribeToCloudChapter(projectId, chapterId) {
    const userId = getUserId();
    if (!db || userId === 'guest_local_user') return;

    if (cloudUnsubscribeChapter) cloudUnsubscribeChapter();

    activeCloudState.projectId = projectId;
    activeCloudState.chapterId = chapterId;

    const chapRef = db.collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('chapters').doc(chapterId);

    cloudUnsubscribeChapter = chapRef.onSnapshot((doc) => {
        if (!doc.exists) return;

        const cloudData = doc.data();
        if (!cloudData) return;

        const cloudHash = JSON.stringify(cloudData.data) + JSON.stringify(cloudData.manualQTState);
        
        if (cloudHash !== activeCloudState.lastSavedHash) {
            isApplyingRemoteChange = true;

            if (cloudData.data) data = cloudData.data;
            if (cloudData.manualQTState) manualQTState = cloudData.manualQTState;
            if (cloudData.chapterTitle && typeof chapterTitle !== 'undefined') {
                chapterTitle = cloudData.chapterTitle;
                const chapterInput = document.getElementById('chapter-title-input');
                if (chapterInput) chapterInput.value = chapterTitle;
            }

            activeCloudState.lastSavedHash = cloudHash;

            if (typeof renderTable === 'function') renderTable();

            showToast("⚡ Dữ liệu vừa được đồng bộ từ Cloud!", "var(--btn-info)");
            
            setTimeout(() => { isApplyingRemoteChange = false; }, 500);
        }
    }, (error) => {
        console.error("Lỗi Real-time Stream:", error);
    });
}

// 4. LƯU LỊCH SỬ PHIÊN BẢN
async function saveCloudVersionSnapshot(chapRef, payload) {
    try {
        const versionsRef = chapRef.collection('versions');
        const now = Date.now();
        const lastSnap = parseInt(localStorage.getItem('lastCloudSnapTime') || '0');
        
        if (now - lastSnap > 180000) { 
            await versionsRef.add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                rowCount: payload.data ? payload.data.length : 0,
                data: payload.data,
                manualQTState: payload.manualQTState
            });
            localStorage.setItem('lastCloudSnapTime', now.toString());
        }
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-close-cloud-versions')?.addEventListener('click', () => {
        document.getElementById('modal-cloud-versions')?.classList.remove('show');
    });
});