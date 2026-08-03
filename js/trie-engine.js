// =========================================================================
// INDEXEDDB STORAGE & THUẬT TOÁN TRIE DỊCH NAME QT QUẢN LÝ ĐA FILE (NFC)
// =========================================================================
const DB_NAME = 'NameQT_Store_DB_v3';
const FILES_STORE = 'files_store_v3';

function openNameQTDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(FILES_STORE)) {
                db.createObjectStore(FILES_STORE, { keyPath: 'id' });
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
            const store = tx.objectStore(FILES_STORE);
            store.put(fileObj);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { console.error("Lỗi lưu file vào IndexedDB:", e); }
}

async function loadFilesFromIndexedDB() {
    try {
        const db = await openNameQTDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILES_STORE, 'readonly');
            const store = tx.objectStore(FILES_STORE);
            const request = store.getAll();
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
            const store = tx.objectStore(FILES_STORE);
            store.delete(fileId);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { console.error("Lỗi xóa file IndexedDB:", e); }
}

async function clearFilesFromIndexedDB() {
    try {
        const db = await openNameQTDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FILES_STORE, 'readwrite');
            const store = tx.objectStore(FILES_STORE);
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { console.error("Lỗi xóa IndexedDB:", e); }
}

class TrieNameQT {
    constructor() {
        this.dict = new Map();
        this.files = []; // Danh sách các file NameQT
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
        if (idx >= 0) {
            this.files[idx] = fileObj;
        } else {
            this.files.push(fileObj);
        }

        try {
            await saveFileToIndexedDB(fileObj);
        } catch (e) { console.warn("Lưu bộ nhớ tạm:", e); }

        this.rebuildCombinedDict();
        return count;
    }

    async removeFile(fileId) {
        this.files = this.files.filter(f => f.id !== fileId);
        try {
            await deleteFileFromIndexedDB(fileId);
        } catch (e) {}
        this.rebuildCombinedDict();
    }

    async clearStorage() {
        this.dict.clear();
        this.files = [];
        this.buildTrie();
        try {
            await clearFilesFromIndexedDB();
        } catch (e) {}
    }

    async loadFromStorage() {
        const files = await loadFilesFromIndexedDB();
        if (files && files.length > 0) {
            this.files = files;
            this.rebuildCombinedDict();
        }
    }

    buildTrie() {
        this.root = { children: new Map() };
        this.maxDepth = 0;

        for (let [cn, vi] of this.dict.entries()) {
            let curr = this.root;
            for (let char of cn) {
                if (!curr.children.has(char)) {
                    curr.children.set(char, { children: new Map() });
                }
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
                if (curr.val !== undefined) {
                    longestMatchVal = curr.val;
                    longestMatchLen = j - i + 1;
                }
            }

            if (longestMatchVal !== null && longestMatchLen > 0) {
                const cnSub = normRaw.slice(i, i + longestMatchLen);
                rawTokens.push({ rawText: cnSub, qtText: longestMatchVal, rawStart: i, rawEnd: i + longestMatchLen });
                i += longestMatchLen;
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
            if (idx > 0 && outText.length > 0) {
                const lastChar = outText[outText.length - 1];
                const nextChar = t.qtText[0];
                if (this.isWordChar(lastChar) && this.isWordChar(nextChar)) {
                    outText += ' ';
                }
            }
            const qtStart = outText.length;
            outText += t.qtText;
            tokens.push({ rawStart: t.rawStart, rawEnd: t.rawEnd, qtStart, qtEnd: outText.length });
        }

        return { text: outText.normalize('NFC'), tokens };
    }

    isWordChar(ch) {
        if (!ch) return false;
        if (/[\[\]():;,.!?"'“”‘’—\-\s，。！？：；“”（）《》]/.test(ch)) return false;
        return true;
    }
}

const nameQTEngine = new TrieNameQT();