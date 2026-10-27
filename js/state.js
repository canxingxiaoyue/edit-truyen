// =========================================================================
// KHAI BÁO BIẾN TOÀN CỤC VÀ TRẠNG THÁI HỆ THỐNG
// THỨ TỰ CỘT CHUẨN MỰC MỚI: Raw -> Pinyin -> Bản QT -> Bản ê đít -> Bản bê ta -> Chú thích
// =========================================================================

// Hàm lấy Pinyin an toàn - Không bao giờ làm sập phần mềm
function safePinyin(text) {
    try {
        if (typeof pinyinPro !== 'undefined' && pinyinPro.pinyin) {
            return pinyinPro.pinyin(text);
        }
    } catch (e) {}
    return '';
}

// 1. MẢNG CỘT CHUẨN MỰC MỚI (BẮT BUỘC CHÚ THÍCH 'meaning' Ở VỊ TRÍ CUỐI CÙNG)
const columns = ['raw', 'pinyin', 'qt', 'translation', 'edit', 'meaning'];
let activeTab = 'edit-tool'; 

let modalReplace;
let modalHistory;
let modalNameQT;

// HÀM CHUẨN HÓA DỮ LIỆU TỪNG HÀNG (MIGRATION AN TOÀN TUYỆT ĐỐI)
function normalizeRowObject(row) {
    if (!row) {
        return { raw: '', pinyin: '', qt: '', translation: '', edit: '', meaning: '' };
    }

    // Trường hợp 1: Dữ liệu cũ dạng mảng index [0: raw, 1: pinyin, 2: meaning, 3: translation, 4: qt, 5: edit]
    if (Array.isArray(row)) {
        return {
            raw: row[0] || '',
            pinyin: row[1] || '',
            qt: row[4] || '',
            translation: row[3] || '',
            edit: row[5] || '',
            meaning: row[2] || ''
        };
    }

    // Trường hợp 2: Dữ liệu dạng Object theo key (Bảo toàn 100% nội dung gốc)
    return {
        raw: row.raw || '',
        pinyin: row.pinyin || '',
        qt: row.qt || '',
        translation: row.translation || '',
        edit: row.edit || '',
        meaning: row.meaning || ''
    };
}

function createEmptyRow() {
    return { raw: '', pinyin: '', qt: '', translation: '', edit: '', meaning: '' };
}

// Dữ liệu và trạng thái Mục 1 (Biên dịch)
let chapterTitle = localStorage.getItem('chapterTitle') || 'Chương 1';
let currentProjectId = localStorage.getItem('currentProjectId') || null;

Object.defineProperty(window, 'currentChapterTitle', {
    get() { return chapterTitle; },
    set(val) { chapterTitle = val; }
});

let savedData = null;
try {
    savedData = JSON.parse(localStorage.getItem('translationData'));
} catch (e) {
    console.error("Lỗi đọc translationData từ LocalStorage:", e);
}

// Khởi tạo data với chuẩn hóa toàn diện
let data = (Array.isArray(savedData) && savedData.length > 0) 
    ? savedData.map(r => normalizeRowObject(r)) 
    : [createEmptyRow()];

let currentRowIndex = -1;
let selectedRowIndices = [];
let isDragSelecting = false;
let dragStartRowIdx = -1;
let lastHistoryTime = 0;

let editorUndoStack = [];
let editorRedoStack = [];
let editorTypingUndoTimeout = null;
let editorIsTyping = false;

// Trạng thái Name QT & Đồng bộ Bôi đen
let manualQTState = JSON.parse(localStorage.getItem('manualQTState')) || {};
let rowTokensMap = {}; 

// Dữ liệu và trạng thái Mục 2 (Thông tin truyện)
let metadata = JSON.parse(localStorage.getItem('storyMetadata')) || {
    title: '',
    characters: [{ cn: '', vi: '', called: '', desc: '', pronoun3: '' }],
    pronouns: [{ a: '', b: '', ab: '', ba: '', note: '' }],
    terms: [{ orig: '', changed: '' }]
};
let activeInfoRows = { characters: -1, pronouns: -1, terms: -1 };

let metaUndoStack = [];
let metaRedoStack = [];
let metaTypingUndoTimeout = null;
let metaIsTyping = false;
let lastMetaHistoryTime = 0;

// Bộ màu sắc giao diện hệ thống
const themes = {
    light:   { bg: '#f8fafc', text: '#334155', active: '#cbd5e1', hover: 'rgba(0,0,0,0.03)', focusBorder: '#2563eb', focusBg: '#ffffff' },
    sepia:   { bg: '#f5eedc', text: '#4a3622', active: '#d6c5a3', hover: '#ebdcb9',         focusBorder: '#965b2a', focusBg: '#fffdf9' },
    sage:    { bg: '#e3ede3', text: '#1e301e', active: '#b8ccb8', hover: '#d1dfd1',         focusBorder: '#2d6a4f', focusBg: '#f7faf7' },
    dreamy:  { bg: '#faf0f5', text: '#522d42', active: '#e8c1db', hover: '#f3d9ea',         focusBorder: '#862876', focusBg: '#fffaff' },
    peach:   { bg: '#fdf4ed', text: '#523628', active: '#f8d2be', hover: '#faeade',         focusBorder: '#c25e1a', focusBg: '#fffcf9' },
    coral:   { bg: '#fdf1f3', text: '#542834', active: '#f6cbd3', hover: '#fae3e7',         focusBorder: '#c0264b', focusBg: '#fffbfa' },
    aqua: { 
        bg: '#EBF8FA', 
        gradient: 'linear-gradient(180deg, #C6E6E8 0%, #8ED6DD 50%, #51C4D3 100%)',
        text: '#234B55',
        active: 'rgba(182, 238, 245, 0.55)', 
        hover: 'rgba(255, 255, 255, 0.94)',
        border: '#B2DCE0',
        textMuted: '#527982',
        focusBorder: '#1a92a6',
        focusBg: '#ffffff'
    },
    dark:    { bg: '#1e293b', text: '#cbd5e1', active: '#24344d', hover: '#24304a', focusBorder: '#38bdf8', focusBg: '#1e293b' },
    night:   { bg: '#0d1b2a', text: '#e0e1dd', active: '#1b2d42', hover: '#12253b', focusBorder: '#38bdf8', focusBg: '#0d1b2a' },
    oled:    { bg: '#000000', text: '#e2e8f0', active: '#2d2d30', hover: '#161618', focusBorder: '#38bdf8', focusBg: '#000000' }
};

// =========================================================================
// LƯU & KHÔI PHỤC DỮ LIỆU AN TOÀN
// =========================================================================
function saveActiveStateToStorage() {
    try {
        localStorage.setItem('translationData', JSON.stringify(data));
        localStorage.setItem('chapterTitle', chapterTitle);
        localStorage.setItem('storyMetadata', JSON.stringify(metadata));
        localStorage.setItem('manualQTState', JSON.stringify(manualQTState));
        if (currentProjectId) {
            localStorage.setItem('currentProjectId', currentProjectId);
        } else {
            localStorage.removeItem('currentProjectId');
        }

        // Tự động đồng bộ vào bản ghi trong 'savedProjects' nếu đang mở 1 dự án
        if (currentProjectId) {
            const rawProjects = localStorage.getItem('savedProjects_v2') || localStorage.getItem('savedProjects');
            if (rawProjects) {
                let projects = JSON.parse(rawProjects);
                if (Array.isArray(projects)) {
                    const idx = projects.findIndex(p => p.id === currentProjectId);
                    if (idx >= 0) {
                        projects[idx].title = chapterTitle;
                        projects[idx].chapterTitle = chapterTitle;
                        projects[idx].data = data;
                        projects[idx].rowCount = data.length;
                        projects[idx].metadata = metadata;
                        projects[idx].updatedAt = Date.now();
                        localStorage.setItem('savedProjects_v2', JSON.stringify(projects));
                    }
                }
            }
        }
    } catch (e) {
        console.error("Lỗi saveActiveStateToStorage:", e);
    }
}

function restoreActiveStateFromStorage() {
    try {
        const rawData = localStorage.getItem('translationData');
        if (rawData) {
            const parsed = JSON.parse(rawData);
            if (Array.isArray(parsed) && parsed.length > 0) {
                data = parsed.map(r => normalizeRowObject(r));
            }
        }
        chapterTitle = localStorage.getItem('chapterTitle') || chapterTitle || 'Chương 1';
        currentProjectId = localStorage.getItem('currentProjectId') || currentProjectId;

        const rawMeta = localStorage.getItem('storyMetadata');
        if (rawMeta) {
            metadata = JSON.parse(rawMeta);
        }

        const rawManual = localStorage.getItem('manualQTState');
        if (rawManual) {
            manualQTState = JSON.parse(rawManual);
        }
    } catch (e) {
        console.error("Lỗi restoreActiveStateFromStorage:", e);
    }
}

function showToast(message, bgColor = '#10b981') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.style.backgroundColor = bgColor;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}