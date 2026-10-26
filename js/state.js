// =========================================================================
// KHAI BÁO BIẾN TOÀN CỤC VÀ TRẠNG THÁI HỆ THỐNG (CHỐNG SẬP BỞI PINYIN)
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

const columns = ['raw', 'pinyin', 'meaning', 'translation', 'qt', 'edit'];
let activeTab = 'edit-tool'; 

let modalReplace;
let modalHistory;
let modalNameQT;

function createEmptyRow() {
    return { raw: '', pinyin: '', meaning: '', translation: '', qt: '', edit: '' };
}

// Dữ liệu và trạng thái Mục 1 (Biên dịch) - BẢO VỆ CHỐNG RỖNG MẢNG
let chapterTitle = localStorage.getItem('chapterTitle') || 'Chương 1';
let currentProjectId = localStorage.getItem('currentProjectId') || null;

// Cầu nối đảm bảo tương thích 100% dù file khác gọi chapterTitle hay currentChapterTitle
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

let data = (Array.isArray(savedData) && savedData.length > 0) ? savedData : [createEmptyRow()];

let currentRowIndex = -1;
let selectedRowIndices = [];
let isDragSelecting = false;
let dragStartRowIdx = -1;
let lastHistoryTime = 0;

let editorUndoStack = [];
let editorRedoStack = [];
let editorTypingUndoTimeout = null;
let editorIsTyping = false;

// Trạng thái Name QT & Đồng bộ Bôi đen (Lưu vào máy để chống ghi đè khi F5)
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

// Bộ màu sắc giao diện (Giữ nguyên vẹn toàn bộ 11 theme)
const themes = {
    // Sáng & Pastel
    light:   { bg: '#f8fafc', text: '#334155', active: '#cbd5e1', hover: 'rgba(0,0,0,0.03)' },
    sepia:   { bg: '#f5eedc', text: '#4a3622', active: '#d6c5a3', hover: '#ebdcb9' },
    sage:    { bg: '#e3ede3', text: '#1e301e', active: '#b8ccb8', hover: '#d1dfd1' },
    dreamy:  { bg: '#faf0f5', text: '#522d42', active: '#e8c1db', hover: '#f3d9ea' },
    peach:   { bg: '#fdf4ed', text: '#523628', active: '#f8d2be', hover: '#faeade' }, // 🍑 Mơ đào hoàng hôn
    mint:    { bg: '#eef7f6', text: '#1f4844', active: '#c7eae6', hover: '#e1f3f1' }, // 🧊 Băng ngọc tuyết
    coral:   { bg: '#fdf1f3', text: '#542834', active: '#f6cbd3', hover: '#fae3e7' }, // 🍓 Hồng trà san hô
    aqua: { 
        bg: '#EBF8FA', 
        gradient: 'linear-gradient(180deg, #C6E6E8 0%, #8ED6DD 50%, #51C4D3 100%)',
        text: '#234B55',
        active: 'rgba(182, 238, 245, 0.55)', 
        hover: 'rgba(255, 255, 255, 0.94)',
        border: '#B2DCE0',
        textMuted: '#527982'
    }, // 🌊 Mây Lam Ngọc

    // Tối & Dịu mắt
    dark:    { bg: '#1e293b', text: '#cbd5e1', active: '#334155', hover: '#24304a' },
    night:   { bg: '#0d1b2a', text: '#e0e1dd', active: '#1b2d42', hover: '#12253b' },
    oled:    { bg: '#000000', text: '#e2e8f0', active: '#2d2d30', hover: '#161618' }
};

// =========================================================================
// HÀM LƯU & KHÔI PHỤC PHIÊN LÀM VIỆC AN TOÀN (CHỐNG MẤT DỮ LIỆU)
// =========================================================================

// Lưu toàn bộ trạng thái hiện tại xuống LocalStorage
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

// Khôi phục lại phiên làm việc gần nhất từ LocalStorage
function restoreActiveStateFromStorage() {
    try {
        const rawData = localStorage.getItem('translationData');
        if (rawData) {
            const parsed = JSON.parse(rawData);
            if (Array.isArray(parsed) && parsed.length > 0) {
                data = parsed;
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