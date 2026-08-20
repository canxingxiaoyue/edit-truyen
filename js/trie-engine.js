// =========================================================================
// INDEXEDDB & POSTGRESQL ENGINE - DỊCH NAME QT QUẢN LÝ ĐA FILE
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

class TrieNameQT {
    constructor() {
        this.dict = new Map();
        this.files = []; 
        this.root = { children: new Map() };
        this.maxDepth = 0;
    }

    countEntries(txtContent) {
        if (!txtContent) return 0;
        const lines = txtContent.normalize('NFC').replace(/^\uFEFF/, '').split(/\r?\n/);
        let count = 0;
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;
            if (line.indexOf('=') > 0) count++;
        }
        return count;
    }

    rebuildCombinedDict() {
        this.dict.clear();
        for (const file of this.files) {
            if (!file || !file.content) continue;
            const lines = file.content.normalize('NFC').replace(/^\uFEFF/, '').split(/\r?\n/);
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#')) continue;
                const eqIndex = line.indexOf('=');
                if (eqIndex > 0) {
                    const cn = line.slice(0, eqIndex).trim().normalize('NFC');
                    let vi = line.slice(eqIndex + 1).trim().normalize('NFC');
                    if (cn && vi) {
                        if (vi.includes('/')) vi = vi.split('/')[0].trim();
                        if (vi.includes(',')) vi = vi.split(',')[0].trim();
                        this.dict.set(cn, vi);
                    }
                }
            }
        }
        this.buildTrie();
    }

    // CHỈ LƯU VÀO MÁY (TỐC ĐỘ BÀN THỜ)
    async addOrUpdateFile(fileName, content, fileId = null) {
        const normContent = (content || '').normalize('NFC');
        const count = this.countEntries(normContent);
        const id = fileId || 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        
        const fileObj = { id, fileName: fileName || 'Name_QT.txt', content: normContent, count, updatedAt: Date.now() };

        const idx = this.files.findIndex(f => f.id === id);
        if (idx >= 0) this.files[idx] = fileObj;
        else this.files.push(fileObj);

        await saveFileToIndexedDB(fileObj);
        this.rebuildCombinedDict();
        return count;
    }

    async removeFile(fileId) {
        this.files = this.files.filter(f => f.id !== fileId);
        await deleteFileFromIndexedDB(fileId);
        
        // Xóa cả trên Cloud nếu có
        const userId = (typeof window.Clerk !== 'undefined' && window.Clerk.user) ? window.Clerk.user.id : null;
        if (userId) {
            try { await fetch(`/api/nameqt?id=${fileId}&user_id=${userId}`, { method: 'DELETE' }); } catch (e) {}
        }
        this.rebuildCombinedDict();
    }

    async clearStorage() {
        this.dict.clear();
        this.files = [];
        this.buildTrie();
        await clearFilesFromIndexedDB();
    }

    // CHỈ LOAD TỪ MÁY LÊN KHI MỞ TRÌNH DUYỆT
    async loadFromStorage() {
        const localFiles = await loadFilesFromIndexedDB();
        if (localFiles && localFiles.length > 0) {
            this.files = localFiles;
            this.rebuildCombinedDict();
            if (typeof updateNameQTModalUI === 'function') updateNameQTModalUI();
        }
    }

    // TÍNH NĂNG MỚI: ĐẨY 1 FILE LÊN CLOUD POSTGRES
    async pushToCloud(fileId) {
        const userId = (typeof window.Clerk !== 'undefined' && window.Clerk.user) ? window.Clerk.user.id : null;
        if (!userId) { showToast("⚠️ Bạn cần đăng nhập để lưu lên Cloud!", "var(--btn-warning)"); return false; }
        
        const fileObj = this.files.find(f => f.id === fileId);
        if (!fileObj) return false;

        showToast(`⏳ Đang đẩy file "${fileObj.fileName}" lên Cloud... Vui lòng đợi!`, "var(--btn-info)");
        
        try {
            const res = await fetch('/api/nameqt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...fileObj, userId })
            });
            if (res.ok) {
                showToast(`☁️ Đã lưu file "${fileObj.fileName}" lên Cloud thành công!`, "var(--btn-success)");
                return true;
            } else {
                showToast("⚠️ Máy chủ báo lỗi khi lưu!", "var(--btn-danger)");
                return false;
            }
        } catch (e) {
            showToast("⚠️ Mất mạng, không thể kết nối Cloud!", "var(--btn-danger)");
            return false;
        }
    }

    // TÍNH NĂNG MỚI: KÉO TẤT CẢ TỪ CLOUD VỀ MÁY
    async pullFromCloud() {
        const userId = (typeof window.Clerk !== 'undefined' && window.Clerk.user) ? window.Clerk.user.id : null;
        if (!userId) { showToast("⚠️ Bạn cần đăng nhập để tải từ Cloud!", "var(--btn-warning)"); return; }

        showToast("⏳ Đang tải toàn bộ Name QT từ Cloud về máy...", "var(--btn-info)");
        
        try {
            const res = await fetch(`/api/nameqt?userId=${userId}`);
            if (res.ok) {
                const result = await res.json();
                const cloudFiles = result.data || [];
                
                if (cloudFiles.length > 0) {
                    for (const cf of cloudFiles) {
                        const idx = this.files.findIndex(f => f.id === cf.id || f.fileName === cf.fileName);
                        if (idx >= 0) this.files[idx] = cf;
                        else this.files.push(cf);
                        await saveFileToIndexedDB(cf);
                    }
                    this.rebuildCombinedDict();
                    if (typeof updateNameQTModalUI === 'function') updateNameQTModalUI();
                    showToast(`✅ Đã nạp thành công ${cloudFiles.length} file từ Cloud về máy!`, "var(--btn-success)");
                } else {
                    showToast("⚠️ Cloud của bạn hiện đang trống!", "var(--btn-warning)");
                }
            }
        } catch (e) {
            showToast("⚠️ Không thể kết nối Cloud để tải về!", "var(--btn-danger)");
        }
    }

    buildTrie() {
        this.root = { children: new Map() };
        this.maxDepth = 0;
        for (let [cn, vi] of this.dict.entries()) {
            let curr = this.root;
            for (let char of cn) {
                if (!curr.children.has(char)) curr.children.set(char, { children: new Map() });
                curr = curr.children.get(char);
            }
            curr.val = vi;
            if (cn.length > this.maxDepth) this.maxDepth = cn.length;
        }
    }

    process(rawText) {
        if (!rawText) return { text: '', tokens: [] };
        const normRaw = rawText.normalize('NFC');
        let i = 0, n = normRaw.length;
        const rawTokens = [];
        while (i < n) {
            let longestMatchVal = null, longestMatchLen = 0;
            let curr = this.root;
            for (let j = i; j < Math.min(n, i + this.maxDepth); j++) {
                const char = normRaw[j];
                if (!curr.children.has(char)) break;
                curr = curr.children.get(char);
                if (curr.val !== undefined) { longestMatchVal = curr.val; longestMatchLen = j - i + 1; }
            }
            if (longestMatchVal !== null && longestMatchLen > 0) {
                rawTokens.push({ rawText: normRaw.slice(i, i + longestMatchLen), qtText: longestMatchVal, rawStart: i, rawEnd: i + longestMatchLen });
                i += longestMatchLen;
            } else {
                rawTokens.push({ rawText: normRaw[i], qtText: normRaw[i], rawStart: i, rawEnd: i + 1 });
                i += 1;
            }
        }
        let outText = '';
        const tokens = [];
        for (let idx = 0; idx < rawTokens.length; idx++) {
            const t = rawTokens[idx];
            if (idx > 0 && outText.length > 0 && this.isWordChar(outText[outText.length - 1]) && this.isWordChar(t.qtText[0])) outText += ' ';
            const qtStart = outText.length;
            outText += t.qtText;
            tokens.push({ rawStart: t.rawStart, rawEnd: t.rawEnd, qtStart, qtEnd: outText.length });
        }
        return { text: outText.normalize('NFC'), tokens };
    }

    isWordChar(ch) { return ch ? !(/[\[\]():;,.!?"'“”‘’—\-\s，。！？：；“”（）《》]/.test(ch)) : false; }
}

const nameQTEngine = new TrieNameQT();