// =========================================================================
// ULTRA-LIGHTWEIGHT NAME QT ENGINE - GIẢM RAM TỐI ĐA & TÍCH HỢP GOOGLE DRIVE
// =========================================================================
const DB_NAME = 'NameQT_Store_DB_v3';
const FILES_STORE = 'files_store_v3';

function openNameQTDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains(FILES_STORE)) {
                e.target.result.createObjectStore(FILES_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveFileToIndexedDB(fileObj) {
    try {
        const db = await openNameQTDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILES_STORE, 'readwrite');
            tx.objectStore(FILES_STORE).put(fileObj);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) {}
}

async function loadFilesFromIndexedDB() {
    try {
        const db = await openNameQTDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILES_STORE, 'readonly');
            const request = tx.objectStore(FILES_STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { return []; }
}

async function deleteFileFromIndexedDB(fileId) {
    try {
        const db = await openNameQTDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILES_STORE, 'readwrite');
            tx.objectStore(FILES_STORE).delete(fileId);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) {}
}

async function clearFilesFromIndexedDB() {
    try {
        const db = await openNameQTDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILES_STORE, 'readwrite');
            tx.objectStore(FILES_STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) {}
}

class FastNameQTEngine {
    constructor() {
        this.dict = new Map();
        this.files = []; 
        this.maxDepth = 15;
        this.isLoaded = false; // CỜ CHỐNG NẠP LẶP LẠI KHI CHUYỂN TAB
    }

    countEntries(txtContent) {
        if (!txtContent) return 0;
        const lines = txtContent.normalize('NFC').replace(/^\uFEFF/, '').split(/\r?\n/);
        let count = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.charCodeAt(0) === 35) continue;
            if (line.indexOf('=') > 0) count++;
        }
        return count;
    }

    rebuildCombinedDict() {
        this.dict.clear();
        let maxLen = 1;

        for (let f = 0; f < this.files.length; f++) {
            const file = this.files[f];
            if (!file || !file.content) continue;

            const lines = file.content.replace(/^\uFEFF/, '').split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.charCodeAt(0) === 35) continue;

                const eqIndex = line.indexOf('=');
                if (eqIndex > 0) {
                    const cn = line.slice(0, eqIndex).trim();
                    let vi = line.slice(eqIndex + 1).trim();
                    if (cn && vi) {
                        if (vi.includes('/')) vi = vi.split('/')[0].trim();
                        if (vi.includes(',')) vi = vi.split(',')[0].trim();
                        this.dict.set(cn, vi);
                        if (cn.length > maxLen) maxLen = cn.length;
                    }
                }
            }
        }
        this.maxDepth = Math.min(maxLen, 25);
        this.isLoaded = true;
    }

    async addOrUpdateFile(fileName, content, fileId = null) {
        const normContent = (content || '').normalize('NFC');
        const count = this.countEntries(normContent);
        const id = fileId || 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        
        const fileObj = {
            id,
            fileName: fileName || 'Name_QT.txt',
            content: normContent,
            count,
            updatedAt: Date.now()
        };

        const idx = this.files.findIndex(f => f.id === id);
        if (idx >= 0) this.files[idx] = fileObj;
        else this.files.push(fileObj);

        await saveFileToIndexedDB(fileObj);
        this.rebuildCombinedDict();
        return count;
    }

    async removeFile(fileId) {
        const fileObj = this.files.find(f => f.id === fileId);
        this.files = this.files.filter(f => f.id !== fileId);
        await deleteFileFromIndexedDB(fileId);
        
        // Kích hoạt xóa trên Google Drive nếu đang kết nối
        if (fileObj && typeof isGDriveConnected === 'function' && isGDriveConnected()) {
            if (typeof gdriveDeleteNameQTFile === 'function') {
                await gdriveDeleteNameQTFile(fileObj.fileName);
            }
        }
        
        this.rebuildCombinedDict();
    }

    async clearStorage() {
        this.dict.clear();
        this.files = [];
        this.isLoaded = false;
        await clearFilesFromIndexedDB();
    }

    async loadFromStorage(forceReload = false) {
        // NẾU ĐÃ NẠP VÀO RAM RỒI -> BỎ QUA NGAY LẬP TỨC (0ms, KHÔNG BỊ LAG KHI CHUYỂN TAB)
        if (this.isLoaded && this.dict.size > 0 && !forceReload) {
            return;
        }

        const localFiles = await loadFilesFromIndexedDB();
        if (localFiles && localFiles.length > 0) {
            this.files = localFiles;
            this.rebuildCombinedDict();
            if (typeof updateNameQTModalUI === 'function') updateNameQTModalUI();
        }
    }

    // =========================================================================
    // GOOGLE DRIVE INTEGRATION CHO NAME QT
    // =========================================================================

    // 1. ĐẨY 1 FILE TỪ MÁY LÊN GOOGLE DRIVE
    async pushFileToGDrive(fileId) {
        const fileObj = this.files.find(f => f.id === fileId);
        if (!fileObj) return;

        if (typeof showToast === 'function') showToast(`⏳ Đang lưu file "${fileObj.fileName}" lên Google Drive...`, 'var(--btn-info)');
        
        if (typeof gdriveSaveNameQTFile === 'function') {
            const ok = await gdriveSaveNameQTFile(fileObj);
            if (ok) {
                if (typeof showToast === 'function') showToast(`☁️ Đã lưu file "${fileObj.fileName}" lên Google Drive!`, 'var(--btn-success)');
            } else {
                if (typeof showToast === 'function') showToast(`⚠️ Không thể lưu file lên Google Drive!`, 'var(--btn-warning)');
            }
        }
    }

    // 2. KÉO TOÀN BỘ FILE NAME QT TỪ DRIVE VỀ MÁY
    async pullAllFromGDrive() {
        if (typeof isGDriveConnected !== 'function' || !isGDriveConnected()) {
            if (typeof openGDriveModal === 'function') openGDriveModal();
            return;
        }

        if (typeof showToast === 'function') showToast("⏳ Đang tải toàn bộ Name QT từ Google Drive về máy...", "var(--btn-info)");
        
        if (typeof gdriveListNameQTFiles !== 'function') return;
        const cloudFiles = await gdriveListNameQTFiles();

        if (!cloudFiles || cloudFiles.length === 0) {
            if (typeof showToast === 'function') showToast("⚠️ Thư mục Google Drive chưa có file Name QT nào!", "var(--btn-warning)");
            return;
        }

        let importedCount = 0;
        for (const cf of cloudFiles) {
            if (typeof gdriveDownloadNameQTContent === 'function') {
                const content = await gdriveDownloadNameQTContent(cf.id);
                if (content) {
                    const origName = cf.appProperties?.originalName || cf.name.replace('[NameQT]_', '');
                    await this.addOrUpdateFile(origName, content);
                    importedCount++;
                }
            }
        }

        this.rebuildCombinedDict();
        if (typeof updateNameQTModalUI === 'function') updateNameQTModalUI();
        if (typeof refreshAllQT === 'function') refreshAllQT(false);
        if (typeof showToast === 'function') showToast(`✅ Đã nạp thành công ${importedCount} file Name QT từ Drive về máy!`, "var(--btn-success)");
    }

    // =========================================================================
    // THUẬT TOÁN XỬ LÝ DỊCH THUẬT CỐT LÕI
    // =========================================================================

    process(rawText) {
        if (!rawText) return { text: '', tokens: [] };
        const normRaw = rawText.normalize('NFC');
        const n = normRaw.length;
        let i = 0;
        const rawTokens = [];
        const maxL = this.maxDepth;

        while (i < n) {
            let matchVal = null;
            let matchLen = 0;

            const limit = Math.min(n - i, maxL);
            for (let len = limit; len >= 1; len--) {
                const sub = normRaw.substr(i, len);
                const val = this.dict.get(sub);
                if (val !== undefined) {
                    matchVal = val;
                    matchLen = len;
                    break;
                }
            }

            if (matchVal !== null && matchLen > 0) {
                const cnSub = normRaw.substr(i, matchLen);
                rawTokens.push({ rawText: cnSub, qtText: matchVal, rawStart: i, rawEnd: i + matchLen });
                i += matchLen;
            } else {
                const char = normRaw[i];
                rawTokens.push({ rawText: char, qtText: char, rawStart: i, rawEnd: i + 1 });
                i += 1;
            }
        }

        let outText = '';
        const tokens = [];
        for (let idx = 0; idx < rawTokens.length; idx++) {
            const t = rawTokens[idx];
            if (idx > 0 && outText.length > 0 && this.isWordChar(outText[outText.length - 1]) && this.isWordChar(t.qtText[0])) {
                outText += ' ';
            }
            const qtStart = outText.length;
            outText += t.qtText;
            tokens.push({ rawStart: t.rawStart, rawEnd: t.rawEnd, qtStart, qtEnd: outText.length });
        }
        return { text: outText.normalize('NFC'), tokens };
    }

    isWordChar(ch) {
        if (!ch) return false;
        return !(/[\[\]():;,.!?"'“”‘’—\-\s，。！？：；“”（）《》]/.test(ch));
    }
}

const nameQTEngine = new FastNameQTEngine();