// =========================================================================
// BỘ TRA CỨU HÁN VIỆT CHUẨN & XỬ LÝ QUICK NAME KHÔNG BỊ DÍNH PINYIN
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

function getHanVietChar(char) {
    if (HAN_VIET_MAP[char]) {
        return HAN_VIET_MAP[char].split('/')[0].trim();
    }

    if (typeof pinyinPro !== 'undefined') {
        const py = pinyinPro.pinyin(char, { toneType: 'none', type: 'array' });
        if (py && py.length > 0 && typeof py[0] === 'string') {
            return py[0];
        }
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

function capitalizeWords(str) {
    if (!str) return '';
    return str.split(' ')
        .filter(w => w.length > 0)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function lowercaseWords(str) {
    if (!str) return '';
    return str.toLowerCase();
}

let selectedCNText = '';
let selectedHVWords = [];

function initQuickNameEvents() {
    let quickBtn = document.getElementById('quick-name-btn');
    if (!quickBtn) {
        quickBtn = document.createElement('button');
        quickBtn.id = 'quick-name-btn';
        quickBtn.className = 'quick-name-btn';
        quickBtn.innerHTML = '➕ Thêm Name mới';
        quickBtn.style.display = 'none';
        document.body.appendChild(quickBtn);
    }

    const modalAddName = document.getElementById('modal-add-name');
    const inputCN = document.getElementById('name-input-cn');
    const inputHV = document.getElementById('name-input-hv');
    const inputVI = document.getElementById('name-input-vi');

    // 1. BẮT SỰ KIỆN BÔI ĐEN CHỮ TRÊN BẢNG
    document.addEventListener('mouseup', (e) => {
        if (e.target.closest('.modal-overlay') || e.target.closest('#quick-name-btn')) return;

        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const selectedStr = selection.toString().trim();
            if (!selectedStr) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const anchorNode = selection.anchorNode;
            const td = anchorNode?.parentElement?.closest('td');
            if (!td) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const tr = td.closest('tr');
            const tbody = document.getElementById('table-body');
            if (!tr || !tbody) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            const rowIndex = Array.from(tbody.children).indexOf(tr);
            const colIndex = Array.from(tr.children).indexOf(td);

            if (colIndex !== 0 && colIndex !== 4) {
                if (quickBtn) quickBtn.style.display = 'none';
                return;
            }

            let cnText = '';
            if (colIndex === 0) {
                cnText = selectedStr;
            } else if (colIndex === 4) {
                const rawVal = data[rowIndex]?.raw?.replace(/<[^>]+>/g, '') || '';
                const tokens = rowTokensMap[rowIndex];
                if (tokens && tokens.length > 0) {
                    const qtStart = td.innerText.indexOf(selectedStr);
                    if (qtStart >= 0) {
                        const qtEnd = qtStart + selectedStr.length;
                        const matched = tokens.filter(t => t.qtStart < qtEnd && t.qtEnd > qtStart);
                        if (matched.length > 0) {
                            cnText = rawVal.slice(matched[0].rawStart, matched[matched.length - 1].rawEnd);
                        }
                    }
                }
                if (!cnText) cnText = rawVal;
            }

            if (cnText) {
                selectedCNText = cnText;
                quickBtn.style.top = `${e.clientY + 12}px`;
                quickBtn.style.left = `${e.clientX + 12}px`;
                quickBtn.style.display = 'block';
            }
        }, 20);
    });

    // 2. BẤM NÚT NỔI -> MỞ MODAL THÊM NAME
    quickBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedCNText) return;
        quickBtn.style.display = 'none';

        // Lấy danh sách từ Hán Việt chuẩn
        const hvPhrase = getHanVietPhrase(selectedCNText);
        selectedHVWords = hvPhrase.split(' ').filter(w => w.length > 0);

        if (inputCN) inputCN.value = selectedCNText;
        if (inputHV) inputHV.value = hvPhrase;

        // Ưu tiên lấy bản QT/VietPhrase đang dịch làm gợi ý, nếu chưa có thì lấy Hán Việt Viết Hoa
        let defaultNameVI = '';
        if (typeof nameQTEngine !== 'undefined' && nameQTEngine.dict && nameQTEngine.dict.has(selectedCNText)) {
            defaultNameVI = nameQTEngine.dict.get(selectedCNText);
        } else if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
            const qtRes = nameQTEngine.process(selectedCNText);
            if (qtRes && qtRes.text) {
                defaultNameVI = qtRes.text;
            }
        }
        
        if (!defaultNameVI) {
            defaultNameVI = capitalizeWords(hvPhrase);
        }

        if (inputVI) inputVI.value = defaultNameVI;

        if (modalAddName) modalAddName.classList.add('show');
    });

    // 3. CÁC NÚT TRỢ GIÚP CHỌN TỪ (VIẾT HOA)
    document.getElementById('btn-helper-cap-1')?.addEventListener('click', () => {
        if (selectedHVWords.length > 0 && inputVI) {
            const result = selectedHVWords.map((word, index) => index === 0 ? capitalizeWords(word) : word).join(' ');
            inputVI.value = result;
        }
    });

    document.getElementById('btn-helper-cap-2')?.addEventListener('click', () => {
        if (selectedHVWords.length > 0 && inputVI) {
            const result = selectedHVWords.map((word, index) => index < 2 ? capitalizeWords(word) : word).join(' ');
            inputVI.value = result;
        }
    });

    document.getElementById('btn-helper-cap-3')?.addEventListener('click', () => {
        if (selectedHVWords.length > 0 && inputVI) {
            const result = selectedHVWords.map((word, index) => index < 3 ? capitalizeWords(word) : word).join(' ');
            inputVI.value = result;
        }
    });

    document.getElementById('btn-helper-cap-all')?.addEventListener('click', () => {
        if (inputVI) inputVI.value = capitalizeWords(selectedHVWords.join(' '));
    });

    // CÁC NÚT TRỢ GIÚP CHỌN TỪ (VIẾT THƯỜNG)
    document.getElementById('btn-helper-low-1')?.addEventListener('click', () => {
        if (selectedHVWords.length > 0 && inputVI) {
            const result = selectedHVWords.map((word, index) => index === 0 ? lowercaseWords(word) : word).join(' ');
            inputVI.value = result;
        }
    });

    document.getElementById('btn-helper-low-2')?.addEventListener('click', () => {
        if (selectedHVWords.length > 0 && inputVI) {
            const result = selectedHVWords.map((word, index) => index < 2 ? lowercaseWords(word) : word).join(' ');
            inputVI.value = result;
        }
    });

    document.getElementById('btn-helper-low-3')?.addEventListener('click', () => {
        if (selectedHVWords.length > 0 && inputVI) {
            const result = selectedHVWords.map((word, index) => index < 3 ? lowercaseWords(word) : word).join(' ');
            inputVI.value = result;
        }
    });

    document.getElementById('btn-helper-low-all')?.addEventListener('click', () => {
        if (inputVI) inputVI.value = lowercaseWords(selectedHVWords.join(' '));
    });

    // 4. BẤM NÚT LƯU NAME & THAY THẾ TOÀN BỘ
    document.getElementById('btn-save-quick-name')?.addEventListener('click', async () => {
        const cn = inputCN?.value.trim();
        const vi = inputVI?.value.trim();

        if (!cn || !vi) {
            showToast('⚠️ Vui lòng nhập Name tiếng Việt!', 'var(--btn-warning)');
            return;
        }

        const TARGET_FILENAME = "Name_da_thay.txt";

        let targetFile = nameQTEngine.files.find(f => f.fileName === TARGET_FILENAME);
        let existingContent = targetFile ? targetFile.content : '';

        let newContent = existingContent;
        if (newContent && !newContent.endsWith('\n')) newContent += '\n';
        newContent += `${cn}=${vi}`;

        const fileId = targetFile ? targetFile.id : null;
        await nameQTEngine.addOrUpdateFile(TARGET_FILENAME, newContent, fileId);

        refreshAllQT(true);

        showToast(`✅ Đã thay Name "${cn}" -> "${vi}" & lưu vào file ${TARGET_FILENAME}!`, 'var(--btn-success)');

        if (modalAddName) modalAddName.classList.remove('show');
    });

    document.getElementById('btn-close-addname-modal')?.addEventListener('click', () => {
        if (modalAddName) modalAddName.classList.remove('show');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    try { initQuickNameEvents(); } catch (e) { console.error("Lỗi Quick Name:", e); }
});