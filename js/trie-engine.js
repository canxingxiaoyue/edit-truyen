// =========================================================================
// ULTRA-LIGHTWEIGHT NAME QT ENGINE - GIẢM RAM TỐI ĐA & TÍCH HỢP GOOGLE DRIVE
// HỖ TRỢ ĐỘ ƯU TIÊN TUYỆT ĐỐI CHO "Name tự sửa.txt"
// =========================================================================
const DB_NAME = 'NameQT_Store_DB_v3';
const FILES_STORE = 'files_store_v3';
const PRIORITY_CUSTOM_FILE = 'Name tự sửa.txt';

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
    } catch (e) {
        console.error('Lỗi lưu IndexedDB:', e);
    }
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
        this.isLoaded = false;
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

    // Gộp thông minh nội dung 2 file từ điển (khử trùng lặp khóa tiếng Trung)
    mergeNameEntries(contentA, contentB) {
        const entryMap = new Map();
        const parseLines = (text) => {
            if (!text) return;
            const lines = text.normalize('NFC').replace(/^\uFEFF/, '').split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.charCodeAt(0) === 35) continue;
                const eqIdx = line.indexOf('=');
                if (eqIdx > 0) {
                    const cn = line.slice(0, eqIdx).trim();
                    const vi = line.slice(eqIdx + 1).trim();
                    if (cn && vi) entryMap.set(cn, vi);
                }
            }
        };
        parseLines(contentA);
        parseLines(contentB); // Nội dung B sẽ cập nhật đè nội dung A nếu trùng
        const outLines = [];
        for (const [cn, vi] of entryMap.entries()) {
            outLines.push(`${cn}=${vi}`);
        }
        return outLines.join('\n');
    }

    // Đưa 'Name tự sửa.txt' lên đầu danh sách hiển thị
    sortFilesWithPriority() {
        const pName = PRIORITY_CUSTOM_FILE.toLowerCase();
        this.files.sort((a, b) => {
            const isA = (a.fileName || '').trim().toLowerCase() === pName;
            const isB = (b.fileName || '').trim().toLowerCase() === pName;
            if (isA && !isB) return -1;
            if (!isA && isB) return 1;
            return 0;
        });
    }

    // TÁI TẠO TỪ ĐIỂN VỚI QUY TẮC "Name tự sửa.txt" CÓ ĐỘ ƯU TIÊN CAO NHẤT
    rebuildCombinedDict() {
        this.dict.clear();
        let maxLen = 1;

        const pName = PRIORITY_CUSTOM_FILE.toLowerCase();
        const normalFiles = [];
        let priorityCustomFile = null;

        for (let f = 0; f < this.files.length; f++) {
            const file = this.files[f];
            if (!file || !file.content) continue;
            if ((file.fileName || '').trim().toLowerCase() === pName) {
                priorityCustomFile = file;
            } else {
                normalFiles.push(file);
            }
        }

        const loadEntriesFromFile = (file) => {
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
        };

        // BƯỚC 1: Nạp toàn bộ các file từ điển thông thường trước (VietPhrase, Names...)
        for (let f = 0; f < normalFiles.length; f++) {
            loadEntriesFromFile(normalFiles[f]);
        }

        // BƯỚC 2: Nạp 'Name tự sửa.txt' SAU CÙNG -> GHI ĐÈ LÊN MỌI FILE KHÁC (ƯU TIÊN TUYỆT ĐỐI)
        if (priorityCustomFile) {
            loadEntriesFromFile(priorityCustomFile);
        }

        this.maxDepth = Math.min(maxLen, 25);
        this.isLoaded = true;
    }

    // THÊM HOẶC CẬP NHẬT TỪ VÀO "Name tự sửa.txt"
    async addOrUpdateCustomName(rawWord, targetWord) {
        if (!rawWord || !targetWord) {
            throw new Error("Từ gốc và tên từ không được để trống!");
        }

        const cleanRaw = rawWord.trim();
        let cleanTarget = targetWord.trim();
        if (cleanTarget.includes('/')) cleanTarget = cleanTarget.split('/')[0].trim();
        if (cleanTarget.includes(',')) cleanTarget = cleanTarget.split(',')[0].trim();

        if (!this.isLoaded) {
            await this.loadFromStorage();
        }

        const pName = PRIORITY_CUSTOM_FILE.toLowerCase();
        let customFile = this.files.find(f => (f.fileName || '').trim().toLowerCase() === pName);
        let status = 'added'; // 'added' | 'updated' | 'unchanged'

        if (!customFile) {
            // Trường hợp file chưa tồn tại -> Tạo mới duy nhất một file
            const newId = 'file_custom_' + Date.now();
            const content = `${cleanRaw}=${cleanTarget}`;
            customFile = {
                id: newId,
                fileName: PRIORITY_CUSTOM_FILE,
                content: content,
                count: 1,
                updatedAt: Date.now()
            };
            this.files.unshift(customFile);
            await saveFileToIndexedDB(customFile);
            status = 'added';
        } else {
            // Trường hợp file đã tồn tại -> Kiểm tra và cập nhật
            const lines = (customFile.content || '').replace(/^\uFEFF/, '').split(/\r?\n/);
            let foundIndex = -1;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.charCodeAt(0) === 35) continue;
                const eqIdx = line.indexOf('=');
                if (eqIdx > 0) {
                    const cn = line.slice(0, eqIdx).trim();
                    if (cn === cleanRaw) {
                        foundIndex = i;
                        const existingVi = line.slice(eqIdx + 1).trim();
                        if (existingVi === cleanTarget) {
                            status = 'unchanged';
                        } else {
                            status = 'updated';
                        }
                        break;
                    }
                }
            }

            if (status === 'unchanged') {
                // Giá trị giống hệt -> Không cần ghi lại
            } else if (status === 'updated') {
                lines[foundIndex] = `${cleanRaw}=${cleanTarget}`;
                customFile.content = lines.join('\n');
                customFile.count = this.countEntries(customFile.content);
                customFile.updatedAt = Date.now();
                await saveFileToIndexedDB(customFile);
            } else {
                // Thêm mục mới vào file
                if (customFile.content.trim().length === 0) {
                    customFile.content = `${cleanRaw}=${cleanTarget}`;
                } else {
                    customFile.content = customFile.content.trimEnd() + `\n${cleanRaw}=${cleanTarget}`;
                }
                customFile.count = this.countEntries(customFile.content);
                customFile.updatedAt = Date.now();
                await saveFileToIndexedDB(customFile);
                status = 'added';
            }
        }

        // Đảm bảo file tự sửa nằm đầu danh sách
        this.sortFilesWithPriority();

        // Tái tạo từ điển để cập nhật độ ưu tiên
        this.rebuildCombinedDict();

        // Tự động đẩy file cập nhật lên Google Drive nếu đang kết nối
        if (typeof isGDriveConnected === 'function' && isGDriveConnected()) {
            if (typeof this.pushFileToGDrive === 'function') {
                this.pushFileToGDrive(customFile.id).catch(e => console.warn('Lỗi auto-sync Drive:', e));
            }
        }

        // Cập nhật modal Quản lý Name QT nếu đang mở
        if (typeof updateNameQTModalUI === 'function') {
            updateNameQTModalUI();
        }

        // Làm mới lại bảng dịch
        if (typeof refreshAllQT === 'function') {
            refreshAllQT(false);
        }

        return { status, file: customFile, raw: cleanRaw, target: cleanTarget };
    }

    // THÊM HOẶC CẬP NHẬT TỆP (CHỐNG TẠO FILE TRÙNG TÊN TỪ DRIVE HOẶC MÁY)
    async addOrUpdateFile(fileName, content, fileId = null) {
        const normName = (fileName || 'Name_QT.txt').trim();
        const normContent = (content || '').normalize('NFC');
        const count = this.countEntries(normContent);

        // Tìm kiếm xem file đã có theo ID hoặc theo TÊN FILE (không phân biệt hoa/thường)
        const existingIdx = this.files.findIndex(f => 
            (fileId && f.id === fileId) || 
            (f.fileName && f.fileName.trim().toLowerCase() === normName.toLowerCase())
        );

        let id = fileId;
        if (existingIdx >= 0) {
            id = this.files[existingIdx].id; // Giữ nguyên ID trong IndexedDB
        } else if (!id) {
            id = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        }

        let finalContent = normContent;
        // Nếu là 'Name tự sửa.txt' và cả 2 bên đều có dữ liệu -> Tự động gộp dòng (Merge)
        if (existingIdx >= 0 && normName.toLowerCase() === PRIORITY_CUSTOM_FILE.toLowerCase()) {
            finalContent = this.mergeNameEntries(this.files[existingIdx].content, normContent);
        }

        const fileObj = {
            id,
            fileName: normName,
            content: finalContent,
            count: this.countEntries(finalContent),
            updatedAt: Date.now()
        };

        if (existingIdx >= 0) {
            this.files[existingIdx] = fileObj;
        } else {
            this.files.push(fileObj);
        }

        await saveFileToIndexedDB(fileObj);
        this.sortFilesWithPriority();
        this.rebuildCombinedDict();
        return fileObj.count;
    }

    async removeFile(fileId) {
        const fileObj = this.files.find(f => f.id === fileId);
        this.files = this.files.filter(f => f.id !== fileId);
        await deleteFileFromIndexedDB(fileId);
        
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
        if (this.isLoaded && this.dict.size > 0 && !forceReload) {
            return;
        }

        const localFiles = await loadFilesFromIndexedDB();
        if (localFiles && localFiles.length > 0) {
            this.files = localFiles;
            this.sortFilesWithPriority();
            this.rebuildCombinedDict();
            if (typeof updateNameQTModalUI === 'function') updateNameQTModalUI();
        }
    }

    // =========================================================================
    // GOOGLE DRIVE INTEGRATION CHO NAME QT
    // =========================================================================

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

        this.sortFilesWithPriority();
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