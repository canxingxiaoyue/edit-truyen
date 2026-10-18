// =========================================================================
// BỘ TRA CỨU HÁN VIỆT ĐA TẦNG & XỬ LÝ QUICK NAME CHUẨN XÁC 100%
// TỰ ĐỘNG ĐỒNG BỘ VỚI KHO TỪ ĐIỂN NAME QT VÀ FILE "Name tự sửa.txt"
// =========================================================================

// 1. BẢNG TRA CỨU HÁN VIỆT MỞ RỘNG (BAO GỒM ĐẦY ĐỦ CÁC HỌ, TÊN, THUẬT NGỮ PHỔ BIẾN)
const HAN_VIET_MAP = {
    // Họ và tên thường gặp trong tiểu thuyết Trung Quốc
    '许': 'hứa', '宵': 'tiêu', '峰': 'phong', '山': 'sơn', '林': 'lâm', '青': 'thanh', '阳': 'dương',
    '陈': 'trần', '李': 'lý', '张': 'trương', '刘': 'lưu', '杨': 'dương', '黄': 'hoàng', '赵': 'triệu',
    '吴': 'ngô', '周': 'chu', '徐': 'từ', '孙': 'tôn', '马': 'mã', '朱': 'chu', '胡': 'hồ', '郭': 'quách',
    '何': 'hà', '高': 'cao', '罗': 'la', '郑': 'trịnh', '梁': 'lương', '谢': 'tạ', '宋': 'tống', '唐': 'đường',
    '韩': 'hàn', '曹': 'tào', '叶': 'diệp', '沈': 'thẩm', '萧': 'tiêu', '苏': 'tô', '潘': 'phan', '陆': 'lục',
    '戴': 'đái', '夏': 'hạ', '姜': 'khương', '汪': 'uông', '范': 'phạm', '金': 'kim', '石': 'thạch', '廖': 'liêu',
    '贾': 'giả', '韦': 'vi', '方': 'phương', '白': 'bạch', '邹': 'trâu', '孟': 'mạnh', '熊': 'hùng', '秦': 'tần',
    '邱': 'khâu', '江': 'giang', '尹': 'doãn', '毛': 'mao', '段': 'đoạn', '雷': 'lôi', '贺': 'hạ', '龚': 'cung',
    '邵': 'thiệu', '史': 'sử', '武': 'vũ', '侯': 'hầu', '顾': 'cố', '常': 'thường', '万': 'vạn', '钱': 'tiền',
    '汤': 'thang', '严': 'nghiêm', '温': 'ôn', '陶': 'đào', '魏': 'ngụy', '薛': 'tiết', '宁': 'ninh', '卓': 'trác',
    '楚': 'sở', '欧': 'âu', '公': 'công', '司': 'tư', '诸': 'chư', '葛': 'cát', '皇': 'hoàng', '甫': 'phủ',
    '尉': 'uất', '迟': 'trì', '长': 'trường', '慕': 'mộ', '容': 'dung', '南': 'nam', '宫': 'cung', '独': 'độc',
    '孤': 'cô', '东': 'đông', '北': 'bắc', '西': 'tây',

    // Từ vựng, xưng hô, tu chân, huyền huyễn, kiếm hiệp
    '堂': 'đường', '区': 'khu', '面': 'diện', '对': 'đối', '你': 'nhị', '我': 'ngã', '他': 'tha', '她': 'tha',
    '是': 'thị', '不': 'bất', '有': 'hữu', '人': 'nhân', '大': 'đại', '小': 'tiểu', '好': 'hảo', '看': 'khán',
    '说': 'thuyết', '来': 'lai', '去': 'khứ', '生': 'sinh', '死': 'tử', '天': 'thiên', '地': 'địa', '道': 'đạo',
    '心': 'tâm', '爱': 'ái', '情': 'tình', '王': 'vương', '帝': 'đế', '主': 'chủ', '神': 'thần', '魔': 'ma',
    '剑': 'kiếm', '飞': 'phi', '龙': 'long', '凤': 'phụng', '风': 'phong', '云': 'vân', '水': 'thủy', '火': 'hỏa',
    '宗': 'tông', '门': 'môn', '派': 'phái', '师': 'sư', '尊': 'tôn', '徒': 'đồ', '弟': 'đệ', '兄': 'huynh',
    '哥': 'ca', '姐': 'tỷ', '妹': 'muội', '父': 'phụ', '母': 'mẫu', '克': 'khắc', '莱': 'lai', '恩': 'ân',
    '伦': 'luân', '纳': 'nạp', '德': 'đức', '愚': 'ngu', '者': 'giả', '黑': 'hắc', '桃': 'đào', '废': 'phế',
    '文': 'văn', '完': 'hoàn', '结': 'kết', '作': 'tác', '存': 'tồn', '在': 'tại', '荷': 'hà', '森': 'sâm',
    '亲': 'thân', '刀': 'đao', '枪': 'thương', '戟': 'kích', '弓': 'cung', '箭': 'tiễn', '鼎': 'đỉnh',
    '钟': 'chung', '塔': 'tháp', '印': 'ấn', '符': 'phù', '丹': 'đan', '药': 'dược', '阵': 'trận', '诀': 'quyết',
    '法': 'pháp', '术': 'thuật', '功': 'công', '仙': 'tiên', '妖': 'yêu', '鬼': 'quỷ', '怪': 'quái', '灵': 'linh',
    '圣': 'thánh', '皇': 'hoàng', '霸': 'bá', '君': 'quân', '老': 'lão', '少': 'thiếu', '玄': 'huyền', '紫': 'tử',
    '玉': 'ngọc', '真': 'chân', '虚': 'hư', '阴': 'âm', '阳': 'dương', '海': 'hải', '河': 'hà', '湖': 'hồ',
    '雪': 'tuyết', '霜': 'sương', '冰': 'băng', '光': 'quang', '明': 'minh', '暗': 'ám', '星': 'tinh', '月': 'nguyệt',
    '日': 'nhật', '夜': 'dạ', '晨': 'thần', '暮': 'mộ', '初': 'sơ', '终': 'chung', '始': 'thủy', '身': 'thân',
    '手': 'thủ', '足': 'túc', '眼': 'nhãn', '目': 'mục', '耳': 'nhĩ', '口': 'khẩu', '头': 'đầu', '骨': 'cốt',
    '血': 'huyết', '气': 'khí', '力': 'lực', '破': 'phá', '灭': 'diệt', '立': 'lập', '开': 'khai', '合': 'hợp',
    '进': 'tiến', '退': 'thoái', '动': 'động', '静': 'tĩnh', '通': 'thông', '变': 'biến', '化': 'hóa', '重': 'trùng'
};

const TARGET_PRIORITY_FILE = 'Name tự sửa.txt';

// 2. HÀM TRA CỨU HÁN VIỆT ĐA TẦNG (MULTI-TIER RESOLVER)
function getHanVietChar(char) {
    if (!char || !char.trim()) return '';

    // Tầng 1: Tra bảng HAN_VIET_MAP
    if (HAN_VIET_MAP[char]) {
        let val = HAN_VIET_MAP[char];
        if (val.includes('/')) val = val.split('/')[0].trim();
        if (val.includes(',')) val = val.split(',')[0].trim();
        return val.trim();
    }

    // Tầng 2: Tra cứu trong từ điển NameQT Engine (1.89M từ)
    if (typeof nameQTEngine !== 'undefined' && nameQTEngine.dict) {
        const dictVal = nameQTEngine.dict.get(char);
        if (dictVal) {
            let val = dictVal;
            if (val.includes('/')) val = val.split('/')[0].trim();
            if (val.includes(',')) val = val.split(',')[0].trim();
            // Đảm bảo kết quả là chữ Latin tiếng Việt, không phải chữ Hán chưa dịch
            if (!/[\u4e00-\u9fa5]/.test(val)) {
                return val.trim().toLowerCase();
            }
        }
    }

    // Tầng 3: Sử dụng hàm process của Trie Engine
    if (typeof nameQTEngine !== 'undefined' && typeof nameQTEngine.process === 'function') {
        const res = nameQTEngine.process(char);
        if (res && res.text && !/[\u4e00-\u9fa5]/.test(res.text)) {
            return res.text.trim().toLowerCase();
        }
    }

    // Tầng 4: Không tìm thấy âm Hán Việt -> Giữ nguyên ký tự gốc
    return char;
}

// Chuyển toàn bộ cụm chữ Hán sang Hán Việt chuẩn, viết hoa chữ cái đầu từng từ
function getHanVietPhrase(cnText) {
    if (!cnText) return '';
    const cleanText = cnText.trim();
    const result = [];

    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        if (/\s/.test(char)) continue; // Bỏ qua khoảng trắng thừa
        const hv = getHanVietChar(char);
        result.push(hv);
    }

    return result
        .filter(w => w.length > 0)
        .map(w => capWord(w))
        .join(' ');
}

function capWord(w) {
    if (!w) return '';
    // Nếu vẫn là chữ Hán do chưa có trong từ điển thì giữ nguyên
    if (/[\u4e00-\u9fa5]/.test(w)) return w;
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
// THUẬT TOÁN 8 NÚT VIẾT HOA / VIẾT THƯỜNG (CHỈ ÁP DỤNG LÊN Ô NAME MỚI)
// =========================================================================
function applyCasingAction(inputVI, actionType) {
    if (!inputVI) return;
    const words = getCurrentVIWords(inputVI);
    if (words.length === 0) return;
    const len = words.length;

    switch (actionType) {
        // NHÓM 1: VIẾT THƯỜNG NHANH
        case 'low-last-1': // Thường 1 từ cuối (ví dụ: Hứa Sơn Phong -> Hứa Sơn phong)
            words[len - 1] = words[len - 1].toLowerCase();
            inputVI.value = words.join(' ');
            break;

        case 'low-last-2': // Thường 2 từ cuối (ví dụ: Trương Công Tử -> Trương công tử)
            if (len >= 1) words[len - 1] = words[len - 1].toLowerCase();
            if (len >= 2) words[len - 2] = words[len - 2].toLowerCase();
            inputVI.value = words.join(' ');
            break;

        case 'low-first-1': // Thường 1 từ đầu (ví dụ: Tiểu Bạch -> tiểu Bạch)
            words[0] = words[0].toLowerCase();
            inputVI.value = words.join(' ');
            break;

        case 'low-all': // Viết thường tất cả
            inputVI.value = words.map(w => w.toLowerCase()).join(' ');
            break;

        // NHÓM 2: VIẾT HOA NHANH
        case 'cap-1': // Hoa 1 từ đầu
            inputVI.value = words.map((w, idx) => idx === 0 ? capWord(w) : w.toLowerCase()).join(' ');
            break;

        case 'cap-2': // Hoa 2 từ đầu
            inputVI.value = words.map((w, idx) => idx < 2 ? capWord(w) : w.toLowerCase()).join(' ');
            break;

        case 'cap-3': // Hoa 3 từ đầu
            inputVI.value = words.map((w, idx) => idx < 3 ? capWord(w) : w.toLowerCase()).join(' ');
            break;

        case 'cap-all': // Viết hoa tất cả
            inputVI.value = words.map(w => w.toUpperCase()).join(' ');
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
    const saveBtn = document.getElementById('btn-save-quick-name');

    // Cập nhật nhãn nút lưu chính xác
    if (saveBtn) {
        saveBtn.innerHTML = `<span>✔</span> Thay Name & Lưu file ${TARGET_PRIORITY_FILE}`;
    }

    // 1. TỰ ĐỘNG CẬP NHẬT Ô HÁN VIỆT VÀ GỢI Ý NAME KHI NGƯỜI DÙNG TỰ GÕ Ô CHINESE
    if (inputCN) {
        inputCN.addEventListener('input', () => {
            const cnVal = inputCN.value.trim();
            if (!cnVal) {
                if (inputHV) inputHV.value = '';
                return;
            }

            // Tạo Hán Việt chuẩn xác
            const newHV = getHanVietPhrase(cnVal);
            if (inputHV) inputHV.value = newHV;
            selectedHVWords = newHV.split(/\s+/).filter(w => w.length > 0);

            // Gợi ý Name mới nếu có trong từ điển NameQT
            let suggestedVI = '';
            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.dict && nameQTEngine.dict.has(cnVal)) {
                suggestedVI = nameQTEngine.dict.get(cnVal);
            } else if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                const res = nameQTEngine.process(cnVal);
                if (res && res.text && !/[\u4e00-\u9fa5]/.test(res.text)) {
                    suggestedVI = res.text;
                }
            }
            if (!suggestedVI) suggestedVI = newHV;
            if (inputVI) inputVI.value = suggestedVI;
        });
    }

    // 2. BẮT SỰ KIỆN BÔI ĐEN VĂN BẢN TRÊN BẢNG SOẠN THẢO
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

            // Xác định chính xác cột Raw hay QT
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
                // Bôi đen ở cột QT: Dò tìm chữ Hán tương ứng ở cột Raw
                const rawTd = tr.querySelector('td[data-col="raw"]') || tr.children[1] || tr.children[0];
                const rawVal = rawTd ? (rawTd.textContent || '').trim().replace(/<[^>]+>/g, '') : '';
                
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

                if (!cnText) cnText = rawVal;
                selectedRawTextFromQT = selectedStr;
            }

            if (cnText) {
                selectedCNText = cnText;

                // Tọa độ hiển thị nút nổi
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

    // 3. MỞ MODAL THÊM NAME VÀ ĐIỀN DỮ LIỆU ĐÃ CHUẨN HÓA
    quickBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedCNText) return;
        quickBtn.style.display = 'none';

        // Tạo chuỗi Hán Việt chuẩn, viết hoa
        const hvPhrase = getHanVietPhrase(selectedCNText);
        selectedHVWords = hvPhrase.split(/\s+/).filter(w => w.length > 0);

        if (inputCN) inputCN.value = selectedCNText;
        if (inputHV) inputHV.value = hvPhrase;

        let defaultNameVI = '';

        if (selectedSourceIsQT && selectedRawTextFromQT) {
            // Nếu bôi đen từ QT: Giữ nguyên văn bản tiếng Việt người dùng chọn
            defaultNameVI = selectedRawTextFromQT;
        } else {
            // Nếu bôi đen từ Raw: Lấy bản dịch NameQT hoặc âm Hán Việt
            if (typeof nameQTEngine !== 'undefined' && nameQTEngine.dict && nameQTEngine.dict.has(selectedCNText)) {
                defaultNameVI = nameQTEngine.dict.get(selectedCNText);
            } else if (typeof nameQTEngine !== 'undefined' && nameQTEngine.process) {
                const qtRes = nameQTEngine.process(selectedCNText);
                if (qtRes && qtRes.text && !/[\u4e00-\u9fa5]/.test(qtRes.text)) {
                    defaultNameVI = qtRes.text;
                }
            }
            if (!defaultNameVI) {
                defaultNameVI = hvPhrase;
            }
        }

        if (inputVI) inputVI.value = defaultNameVI;
        if (modalAddName) modalAddName.classList.add('show');

        setTimeout(() => {
            if (inputVI) {
                inputVI.focus();
                inputVI.select();
            }
        }, 50);
    });

    // =========================================================================
    // 4. BẮT SỰ KIỆN 8 NÚT TRỢ GIÚP VIẾT HOA / VIẾT THƯỜNG (CHỈ ÁP DỤNG Ô INPUT-VI)
    // =========================================================================
    const bindBtn = (idOrKeywords, actionType) => {
        const el = document.getElementById(idOrKeywords);
        if (el) {
            el.onclick = (e) => {
                e.preventDefault();
                applyCasingAction(inputVI, actionType);
            };
            return;
        }

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

    // Nhóm 1: Viết hoa nhanh
    bindBtn('btn-helper-cap-1', 'cap-1');
    bindBtn('Hoa 1 chữ đầu', 'cap-1');

    bindBtn('btn-helper-cap-2', 'cap-2');
    bindBtn('Hoa 2 chữ đầu', 'cap-2');

    bindBtn('btn-helper-cap-3', 'cap-3');
    bindBtn('Hoa 3 chữ đầu', 'cap-3');

    bindBtn('btn-helper-cap-all', 'cap-all');
    bindBtn('Viết hoa tất cả', 'cap-all');

    // Nhóm 2: Viết thường nhanh
    bindBtn('btn-helper-low-1', 'low-last-1');
    bindBtn('Thường 1 chữ cuối', 'low-last-1');

    bindBtn('btn-helper-low-2', 'low-last-2');
    bindBtn('Thường 2 chữ cuối', 'low-last-2');

    bindBtn('btn-helper-low-3', 'low-first-1');
    bindBtn('Thường 1 chữ đầu', 'low-first-1');

    bindBtn('btn-helper-low-all', 'low-all');
    bindBtn('Viết thường tất cả', 'low-all');

    // =========================================================================
    // 5. BẤM NÚT LƯU TỪ - LƯU TRỰC TIẾP VÀO "Name tự sửa.txt"
    // =========================================================================
    saveBtn?.addEventListener('click', async () => {
        const cn = inputCN?.value.trim();
        let vi = inputVI?.value.trim();

        if (!cn || !vi) {
            if (typeof showToast === 'function') {
                showToast('⚠️ Vui lòng nhập đầy đủ tiếng Trung và Name tiếng Việt!', 'var(--btn-warning)');
            }
            return;
        }

        // ƯU TIÊN: Gọi hàm nghiệp vụ cốt lõi từ nameQTEngine
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

        // FALLBACK: Trực tiếp lưu vào file "Name tự sửa.txt"
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

        if (typeof nameQTEngine !== 'undefined' && nameQTEngine.rebuildCombinedDict) {
            nameQTEngine.rebuildCombinedDict();
        }
        if (typeof refreshAllQT === 'function') refreshAllQT(false);
        if (typeof updateNameQTModalUI === 'function') updateNameQTModalUI();

        if (modalAddName) modalAddName.classList.remove('show');
    });

    // 6. ĐÓNG MODAL
    document.getElementById('btn-close-addname-modal')?.addEventListener('click', () => {
        if (modalAddName) modalAddName.classList.remove('show');
    });

    if (modalAddName) {
        modalAddName.addEventListener('mousedown', (e) => {
            if (e.target === modalAddName) modalAddName.classList.remove('show');
        });
    }

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