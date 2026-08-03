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
let chapterTitle = localStorage.getItem('chapterTitle') || '';
let savedData = null;
try {
    savedData = JSON.parse(localStorage.getItem('translationData'));
} catch (e) {}

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

// Bộ màu sắc giao diện
const themes = {
    light: { bg: '#f8fafc', text: '#334155', active: '#cbd5e1', hover: 'rgba(0,0,0,0.03)' },
    sepia: { bg: '#f5eedc', text: '#4a3622', active: '#d6c5a3', hover: '#ebdcb9' },
    sage:  { bg: '#e3ede3', text: '#1e301e', active: '#b8ccb8', hover: '#d1dfd1' },
    dreamy:{ bg: '#faf0f5', text: '#522d42', active: '#e8c1db', hover: '#f3d9ea' },
    dark:  { bg: '#1e293b', text: '#cbd5e1', active: '#334155', hover: '#24304a' },
    night: { bg: '#0d1b2a', text: '#e0e1dd', active: '#1b2d42', hover: '#12253b' },
    oled:  { bg: '#000000', text: '#e2e8f0', active: '#2d2d30', hover: '#161618' }
};

function showToast(message, bgColor = '#10b981') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.style.backgroundColor = bgColor;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}