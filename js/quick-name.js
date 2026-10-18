// =========================================================================
// BỘ TRA CỨU HÁN VIỆT CHUẨN & XỬ LÝ QUICK NAME (ƯU TIÊN TUYỆT ĐỐI CHO "Name tự sửa.txt")
// =========================================================================

// Bảng tra Hán Việt mở rộng chuẩn xác
const HAN_VIET_MAP = {
    '堂': 'đường', '区': 'khu', '面': 'diện', '对': 'đối', '你': 'nhị/nhi', '我': 'ngã', '他': 'tha', '她': 'tha',
    '是': 'thị', '不': 'bất', '有': 'hữu', '人': 'nhân', '大': 'đại', '小': 'tiểu',
    '好': 'hảo', '看': 'khán', '说': 'thuyết', '来': 'lai', '去': 'khứ', '生': 'sinh',
    '死': 'tử', '天': 'thiên', '地': 'địa', '道': 'đạo', '心': 'tâm', '爱': 'ái',
    '情': 'tình', '王': 'vương', '帝': 'đế', '主': 'chủ', '神': 'thần', '魔': 'ma',
    '剑': 'kiếm', '飞': 'phi', '龙': 'long', '凤': 'phụng', '风': 'phong', '云': 'vân',
    '水': 'thủy', '火': 'hỏa', '山': 'sơn', '林': 'lâm', '青': 'thanh', '阳': 'dương',
    '宗': 'tông', '门': 'môn', '派': 'phái', '师': 'sư', '尊': 'tôn', '徒': 'đồ',
    '弟': 'đệ', '兄': 'huynh', '哥': 'huynh', '姐': 'tỷ', '妹': 'muội', '父': 'phụ', '母': 'mẫu',
    '克': 'khắc', '莱': 'lai', '恩': 'ân', '伦': 'luân', '纳': 'nạp', '德': 'đức',
    '愚': 'ngu', '者': 'giả', '黑': 'hắc', '桃': 'đào', '废': 'phế', '文': 'văn',
    '完': 'hoàn', '结': 'kết', '作': 'tác', '存': 'tồn', '在': 'tại', '荷': 'hà', '森': 'sâm',
    '亲': 'thân'
};

const TARGET_PRIORITY_FILE = 'Name tự sửa.txt';

function getHanVietChar(char) {
    if (HAN_VIET_MAP[char]) {
        return HAN_VIET_MAP[char].split('/')[0].trim();
    }
    return char;
}

function getHanVietPhrase(cnText) {
    if (!cnText) return '';
    let result = [];
    for (let char of cnText) {
        result.push(getHanVietChar(char));
    }
    return result.join(' ');
}

function capWord(w) {
    if (!w) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function capitalizeWords(str) {
    if (!str) return '';
    return str.split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => capWord(w))
        .join(' ');
}

function lowercaseWords(str) {
    if (!str) return '';
    return str.toLowerCase();
}

function getCurrentVIWords(inputVI) {
    const text = (inputVI && inputVI.value.trim()) ? inputVI.value.trim() : (selectedHVWords ? selectedHVWords.join(' ') : '');
    return text.split(/\s+/).filter(w => w.length > 0);
}

let selectedCNText = '';
let selectedHVWords = [];
let selectedSourceIsQT = false;
let selectedRawTextFromQT = '';

// =========================================================================
// THUẬT TOÁN 8 NÚT VIẾT HOA / VIẾT THƯỜNG NHANH CHUẨN UNICODE
// =========================================================================
function applyCasingAction(inputVI, actionType) {
    if (!inputVI) return;
    const words = getCurrentVIWords(inputVI);
    if (words.length === 0) return;
    const len = words.length;

    switch (actionType) {
        // NHÓM 1: VIẾT THƯỜNG NHANH
        case 'low-last-1': // Thường 1 chữ cuối (ví dụ: Hứa Sơn Phong -> Hứa Sơn phong)
            words[len - 1] = words[len - 1].toLowerCase();
            inputVI.value = words.join(' ');
            break;

        case 'low-last-2': // Thường 2 chữ cuối (ví dụ: Trương Công Tử -> Trương công tử)
            if (len >= 1) words[len - 1] = words[len - 1].toLowerCase();
            if (len >= 2) words[len - 2] = words[len - 2].toLowerCase();
            inputVI.value = words.join(' ');
            break;

        case 'low-first-1': // Thường 1 chữ đầu (ví dụ: Tiểu Bạch -> tiểu Bạch)
            words[0] = words[0].toLowerCase();
            inputVI.value = words.join(' ');
            break;

        case 'low-all': // Viết thường tất cả
            inputVI.value = words.map(w => w.toLowerCase()).join(' ');
            break;

        // NHÓM 2: VIẾT HOA NHANH
        case 'cap-1': // Hoa 1 chữ đầu
            inputVI.value = words.map((w, idx) => idx === 0 ? capWord(w) : w.toLowerCase()).join(' ');
            break;

        case 'cap-2': // Hoa 2 chữ đầu
            inputVI.value = words.map((w, idx) => idx < 2 ? capWord(w) : w.toLowerCase()).join(' ');
            break;

        case 'cap-3': // Hoa 3 chữ đầu
            inputVI.value = words.map((w, idx) => idx < 3 ? capWord(w) : w.toLowerCase()).join(' ');
            break;

        case 'cap-all': // Viết hoa tất cả
            inputVI.value = inputVI.value.toUpperCase();
            break;
    }
    inputVI.focus();
}

function initQuickNameEvents() {
    let quickBtn = document.getElementById('quick-name-btn');
    if (!quickBtn) {
        quickBtn = document.createElement('button');
        quickBtn.id = 'quick-name-btn';
        quickBtn.className = 'quick-name-btn';
        quickBtn.style.display = 'none';
        document.body.appendChild(quickBtn);
    }
    quickBtn.innerHTML = '➕ Thêm từ';

    // BẢO VỆ VÙNG CHỌN: Không làm mất vùng bôi đen khi click nút nổi
    quickBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    const modalAddName = document.getElementById('modal-add-name');
    const inputCN = document.getElementById('name-input-cn');
    const inputHV = document.getElementById('name-input-hv');
    const inputVI = document.getElementById('name-input-vi');

    // 1. BẮT SỰ KIỆN BÔI ĐEN CHỮ TRÊN BẢNG
    document.addEventListener('mouseup', (e) => {
        if (e.target.closest('.modal-overlay') || e.target.closest('#quick-name-btn')) return;

        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const selectedStr = selection.toString().trim();
            if (!selectedStr) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const range = selection.getRangeAt(0);
            const anchorNode = range.commonAncestorContainer;
            const td = (anchorNode.nodeType === Node.ELEMENT_NODE) ? anchorNode.closest('td') : anchorNode.parentElement?.closest('td');
            if (!td) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const tr = td.closest('tr');
            const tbody = document.getElementById('table-body');
            if (!tr || !tbody || !tbody.contains(tr)) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const rowIndex = Array.from(tbody.children).indexOf(tr);

            // Xác định chính xác cột Raw hay QT (hỗ trợ cả data-col lẫn vị trí cột)
            let colKey = td.dataset ? td.dataset.col : '';
            if (!colKey) {
                const dataTds = Array.from(tr.children).filter(c => !c.classList.contains('batch-select-cell'));
                const cIdx = dataTds.indexOf(td);
                const COL_KEYS = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
                colKey = COL_KEYS[cIdx] || '';
            }

            if (colKey !== 'raw' && colKey !== 'qt') {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            let cnText = '';
            selectedSourceIsQT = (colKey === 'qt');
            selectedRawTextFromQT = '';

            if (colKey === 'raw') {
                cnText = selectedStr;
            } else if (colKey === 'qt') {
                // Khi người dùng bôi đen cột QT: Tìm chữ Hán tương ứng ở cột Raw
                const rawTd = tr.querySelector('td[data-col="raw"]') || tr.children[1] || tr.children[0];
                const rawVal = rawTd ? (rawTd.textContent || '').trim().replace(/<[^>]+>/g, '') : '';
                
                // 1. Dò từ reverse dictionary nếu có
                if (typeof getReverseDict === 'function') {
                    const revDict = getReverseDict();
                    const candidates = revDict.get(selectedStr.toLowerCase());
                    if (candidates && candidates.length > 0) {
                        for (const c of candidates) {
                            if (rawVal.includes(c)) {
                                cnText = c;
                                break;
                            }
                        }
                        if (!cnText) cnText = candidates[0];
                    }
                }

                // 2. Dò theo rowTokensMap
                if (!cnText && typeof rowTokensMap !== 'undefined' && rowTokensMap[rowIndex]) {
                    const tokens = rowTokensMap[rowIndex];
                    const qtStart = td.textContent.indexOf(selectedStr);
                    if (qtStart >= 0) {
                        const qtEnd = qtStart + selectedStr.length;
                        const matched = tokens.filter(t => t.qtStart < qtEnd && t.qtEnd > qtStart);
                        if (matched.length > 0) {
                            cnText = rawVal.slice(matched[0].rawStart, matched[matched.length - 1].rawEnd);
                        }
                    }
                }

                // 3. Fallback chữ Hán
                if (!cnText) cnText = rawVal;
                selectedRawTextFromQT = selectedStr;
            }

            if (cnText) {
                selectedCNText = cnText;

                // Tọa độ thông minh: Hiển thị ngay trên vùng bôi đen, chống tràn màn hình
                const rect = range.getBoundingClientRect();
                const btnW = quickBtn.offsetWidth || 100;
                const btnH = quickBtn.offsetHeight || 30;

                let top = rect.top - btnH - 8;
                let left = rect.left + rect.width / 2 - btnW / 2;

                if (top < 10) top = rect.bottom + 8;
                left = Math.max(10, Math.min(left, window.innerWidth - btnW - 10));

                quickBtn.style.top = `${top}px`;
                quickBtn.style.left = `${left}px`;
                quickBtn.style.display = 'block';
            }
        }, 30);
    });

    // 2. BẤM NÚT NỔI -> MỞ MODAL THÊM NAME
    quickBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedCNText) return;
        quickBtn.style.display = 'none';

        const hvPhrase = getHanVietPhrase(selectedCNText);
        selectedHVWords = hvPhrase.split(' ').filter(w => w.length > 0);

        if (inputCN) inputCN.value = selectedCNText;
        if (inputHV) inputHV.value = hvPhrase;

        let defaultNameVI = '';

        if (selectedSourceIsQT && selectedRawTextFromQT) {
            // Nếu bôi đen từ cột QT: Giữ nguyên vẹn văn bản tiếng Việt người dùng đã chọn
            defaultNameVI = selectedRawTextFromQT;
        } else {
            // Nếu bôi đen từ cột Raw: Tra từ điển hiện có hoặc dùng Hán Việt viết hoa
            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.dict && nameQTEngine.dict.has(selectedCNText)) {
                defaultNameVI = nameQTEngine.dict.get(selectedCNText);
            } else if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                const qtRes = nameQTEngine.process(selectedCNText);
                if (qtRes && qtRes.text && !/[一-龥]/.test(qtRes.text)) {
                    defaultNameVI = qtRes.text;
                }
            }
            if (!defaultNameVI) {
                defaultNameVI = capitalizeWords(hvPhrase);
            }
        }

        if (inputVI) inputVI.value = defaultNameVI;
        if (modalAddName) modalAddName.classList.add('show');

        // Tự động focus vào ô nhập tên
        setTimeout(() => {
            if (inputVI) {
                inputVI.focus();
                inputVI.select();
            }
        }, 50);
    });

    // =========================================================================
    // 3. GẮN SỰ KIỆN CHO 2 NHÓM NÚT TRỢ GIÚP (VIẾT HOA VÀ VIẾT THƯỜNG NHANH)
    // =========================================================================
    const bindBtn = (idOrKeywords, actionType) => {
        // Gắn theo ID
        const el = document.getElementById(idOrKeywords);
        if (el) {
            el.onclick = (e) => {
                e.preventDefault();
                applyCasingAction(inputVI, actionType);
            };
            return;
        }

        // Dò theo từ khóa nhãn text nếu ID trong HTML có sự khác biệt
        if (modalAddName) {
            modalAddName.querySelectorAll('button').forEach(btn => {
                const t = (btn.textContent || '').trim().toLowerCase();
                if (t === idOrKeywords.toLowerCase()) {
                    btn.onclick = (e) => {
                        e.preventDefault();
                        applyCasingAction(inputVI, actionType);
                    };
                }
            });
        }
    };

    // Nhóm Viết hoa nhanh
    bindBtn('btn-helper-cap-1', 'cap-1');
    bindBtn('Hoa 1 chữ đầu', 'cap-1');

    bindBtn('btn-helper-cap-2', 'cap-2');
    bindBtn('Hoa 2 chữ đầu', 'cap-2');

    bindBtn('btn-helper-cap-3', 'cap-3');
    bindBtn('Hoa 3 chữ đầu', 'cap-3');

    bindBtn('btn-helper-cap-all', 'cap-all');
    bindBtn('Viết hoa tất cả', 'cap-all');

    // Nhóm Viết thường nhanh
    bindBtn('btn-helper-low-1', 'low-last-1');
    bindBtn('Thường 1 chữ cuối', 'low-last-1');

    bindBtn('btn-helper-low-2', 'low-last-2');
    bindBtn('Thường 2 chữ cuối', 'low-last-2');

    bindBtn('btn-helper-low-3', 'low-first-1');
    bindBtn('Thường 1 chữ đầu', 'low-first-1');

    bindBtn('btn-helper-low-all', 'low-all');
    bindBtn('Viết thường tất cả', 'low-all');

    // =========================================================================
    // 4. BẤM NÚT LƯU TỪ - LƯU TRỰC TIẾP VÀO "Name tự sửa.txt" (RULE 1, 2, 3, 4, 5)
    // =========================================================================
    document.getElementById('btn-save-quick-name')?.addEventListener('click', async () => {
        const cn = inputCN?.value.trim();
        let vi = inputVI?.value.trim();

        if (!cn || !vi) {
            if (typeof showToast === 'function') {
                showToast('⚠️ Vui lòng nhập đầy đủ tiếng Trung và Name tiếng Việt!', 'var(--btn-warning)');
            }
            return;
        }

        // TẬN DỤNG HÀM NGHIỆP VỤ CỐT LÕI TỪ FastNameQTEngine
        if (typeof nameQTEngine !== 'undefined' && typeof nameQTEngine.addOrUpdateCustomName === 'function') {
            try {
                const res = await nameQTEngine.addOrUpdateCustomName(cn, vi);
                
                if (res.status === 'unchanged') {
                    if (typeof showToast === 'function') {
                        showToast(`ℹ️ Từ "${cn} = ${vi}" đã tồn tại trong "${TARGET_PRIORITY_FILE}"!`, 'var(--btn-info)');
                    }
                } else if (res.status === 'updated') {
                    if (typeof showToast === 'function') {
                        showToast(`✅ Đã cập nhật nghĩa trong "${TARGET_PRIORITY_FILE}": "${cn}" = "${vi}"`, 'var(--btn-success)');
                    }
                } else {
                    if (typeof showToast === 'function') {
                        showToast(`✅ Đã thêm mới vào "${TARGET_PRIORITY_FILE}": "${cn}" = "${vi}"`, 'var(--btn-success)');
                    }
                }

                if (modalAddName) modalAddName.classList.remove('show');
                return;
            } catch (err) {
                console.error("Lỗi addOrUpdateCustomName:", err);
            }
        }

        // FALLBACK TRỰC TIẾP NẾU ENGINE CHƯA SẴN SÀNG HÀM addOrUpdateCustomName
        let targetFile = nameQTEngine?.files?.find(f => (f.fileName || '').trim().toLowerCase() === TARGET_PRIORITY_FILE.toLowerCase());
        let existingContent = targetFile ? targetFile.content : '';

        let lines = existingContent ? existingContent.replace(/^\uFEFF/, '').split(/\r?\n/) : [];
        let found = false;
        let isSame = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#') || !line.includes('=')) continue;
            const eqIdx = line.indexOf('=');
            const existingCn = line.slice(0, eqIdx).trim();
            if (existingCn === cn) {
                const existingVi = line.slice(eqIdx + 1).trim();
                if (existingVi === vi) {
                    isSame = true;
                } else {
                    lines[i] = `${cn}=${vi}`;
                }
                found = true;
                break;
            }
        }

        if (!found) {
            if (lines.length === 1 && lines[0] === '') lines[0] = `${cn}=${vi}`;
            else lines.push(`${cn}=${vi}`);
        }

        if (!isSame) {
            const newContent = lines.filter(l => l.trim() !== '').join('\n') + '\n';
            const fileId = targetFile ? targetFile.id : null;

            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.addOrUpdateFile) {
                await nameQTEngine.addOrUpdateFile(TARGET_PRIORITY_FILE, newContent, fileId);
            }
            if (typeof showToast === 'function') {
                showToast(`✅ Đã lưu "${cn}" = "${vi}" vào ${TARGET_PRIORITY_FILE}!`, 'var(--btn-success)');
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(`ℹ️ Từ "${cn} = ${vi}" đã tồn tại trong ${TARGET_PRIORITY_FILE}!`, 'var(--btn-info)');
            }
        }

        // Tái tạo từ điển đảm bảo ưu tiên & Làm mới bảng dịch
        if (typeof nameQTEngine !== 'undefined' && nameQTEngine.rebuildCombinedDict) {
            nameQTEngine.rebuildCombinedDict();
        }
        if (typeof refreshAllQT === 'function') refreshAllQT(false);
        if (typeof updateNameQTModalUI === 'function') updateNameQTModalUI();

        if (modalAddName) modalAddName.classList.remove('show');
    });

    // 5. ĐÓNG MODAL
    document.getElementById('btn-close-addname-modal')?.addEventListener('click', () => {
        if (modalAddName) modalAddName.classList.remove('show');
    });

    // Đóng khi click ra ngoài backdrop
    if (modalAddName) {
        modalAddName.addEventListener('mousedown', (e) => {
            if (e.target === modalAddName) modalAddName.classList.remove('show');
        });
    }

    // Đóng khi nhấn Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalAddName?.classList.contains('show')) {
            modalAddName.classList.remove('show');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    try { 
        initQuickNameEvents(); 
    } catch (e) { 
        console.error("Lỗi khởi tạo Quick Name:", e); 
    }
});