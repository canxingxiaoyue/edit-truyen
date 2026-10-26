// =========================================================================
// KHỞI CHẠY HỆ THỐNG AN TOÀN & ĐIỀU HƯỚNG ỨNG DỤNG (CHỐNG MẤT DỮ LIỆU)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Gán các biến Hộp thoại Modal toàn cục
    try {
        window.modalReplace = document.getElementById('modal-replace');
        window.modalHistory = document.getElementById('modal-history');
        window.modalNameQT = document.getElementById('modal-nameqt');
    } catch (e) { console.error("Lỗi gán biến Modal:", e); }

    // 2. KHÔI PHỤC PHIÊN LÀM VIỆC GẦN NHẤT TỪ BỘ NHỚ (BẮT BUỘC TRƯỚC KHI VẼ BẢNG)
    try {
        if (typeof restoreActiveStateFromStorage === 'function') {
            restoreActiveStateFromStorage();
        }
    } catch (e) {
        console.error("Lỗi restoreActiveStateFromStorage:", e);
    }

    // 3. Khởi chạy độc lập từng phân hệ chức năng
    try { initSettings(); } catch (e) { console.error("Lỗi initSettings:", e); }
    try { initTabEvents(); } catch (e) { console.error("Lỗi initTabEvents:", e); }
    try { initEditorEvents(); } catch (e) { console.error("Lỗi initEditorEvents:", e); }
    try { initMetadataEvents(); } catch (e) { console.error("Lỗi initMetadataEvents:", e); }
    
    // Khởi chạy các sự kiện Modal quan trọng
    try { if (typeof initNameQTModalEvents === 'function') initNameQTModalEvents(); } catch (e) { console.error("Lỗi initNameQTModalEvents:", e); }
    try { if (typeof initHistoryModalEvents === 'function') initHistoryModalEvents(); } catch (e) { console.error("Lỗi initHistoryModalEvents:", e); }
    try { if (typeof initProjectManagerEvents === 'function') initProjectManagerEvents(); } catch (e) { console.error("Lỗi initProjectManagerEvents:", e); }

    // 4. LUÔN LUÔN VẼ BẢNG DỊCH VÀ METADATA VỚI DỮ LIỆU ĐÃ ĐƯỢC KHÔI PHỤC
    try { if (typeof renderTable === 'function') renderTable(); } catch (e) { console.error("Lỗi renderTable:", e); }
    try { if (typeof renderMetadata === 'function') renderMetadata(); } catch (e) { console.error("Lỗi renderMetadata:", e); }
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();

    // Đồng bộ lại tiêu đề chương vào ô nhập trên thanh công cụ
    const chapterInput = document.getElementById('chapter-title-input');
    if (chapterInput && typeof chapterTitle !== 'undefined' && chapterTitle) {
        chapterInput.value = chapterTitle;
    }

    // 5. Nạp từ điển Name QT từ IndexedDB (TUYỆT ĐỐI KHÔNG TỰ ĐỘNG DỊCH ĐÈ QT KHI MỞ TRANG)
    if (typeof nameQTEngine !== 'undefined' && nameQTEngine.loadFromStorage) {
        nameQTEngine.loadFromStorage().then(() => {
            const statusText = document.getElementById('nameqt-status');
            if (statusText) {
                statusText.innerHTML = `Hiện có: <strong style="color:var(--btn-primary); font-size:1.1rem;">${nameQTEngine.dict.size.toLocaleString('vi-VN')}</strong> từ trong từ điển Name QT.`;
            }
        }).catch(e => console.error("Lỗi nạp từ điển Name QT:", e));
    }
});

function initSettings() {
    let currentFontSize = parseInt(localStorage.getItem('appFontSize')) || 16;
    document.body.style.fontSize = currentFontSize + 'px';

    const fontSelector = document.getElementById('font-family');
    const savedFont = localStorage.getItem('appFontFamily') || "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    document.body.style.fontFamily = savedFont;
    if (fontSelector) fontSelector.value = savedFont;

    fontSelector?.addEventListener('change', (e) => {
        document.body.style.fontFamily = e.target.value;
        localStorage.setItem('appFontFamily', e.target.value);
    });

    document.getElementById('btn-font-up')?.addEventListener('click', () => {
        if (currentFontSize < 30) {
            currentFontSize += 2;
            document.body.style.fontSize = currentFontSize + 'px';
            localStorage.setItem('appFontSize', currentFontSize);
        }
    });

    document.getElementById('btn-font-down')?.addEventListener('click', () => {
        if (currentFontSize > 12) {
            currentFontSize -= 2;
            document.body.style.fontSize = currentFontSize + 'px';
            localStorage.setItem('appFontSize', currentFontSize);
        }
    });

    const themeSelector = document.getElementById('theme-select');
    
    // PHÒNG THỦ CHỦ ĐỘNG: Nếu máy đang lưu 'mint' (đã xóa) hoặc theme không tồn tại -> chuyển ngay về 'aqua'
    let savedTheme = localStorage.getItem('appTheme') || 'aqua';
    if (savedTheme === 'mint' || (typeof themes !== 'undefined' && !themes[savedTheme])) {
        savedTheme = 'aqua';
        localStorage.setItem('appTheme', 'aqua');
    }
    applyTheme(savedTheme);

    themeSelector?.addEventListener('change', (e) => applyTheme(e.target.value));
}

function applyTheme(themeKey) {
    if (typeof themes === 'undefined') return;
    const selected = themes[themeKey] || themes.light;

    // 1. Quản lý trạng thái theme trên thẻ body
    if (['dark', 'night', 'oled'].includes(themeKey)) {
        document.body.setAttribute('data-theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
    }
    document.body.setAttribute('data-current-theme', themeKey);

    // 2. Xử lý nền Gradient chuyển màu mềm mại
    if (selected.gradient) {
        document.documentElement.style.setProperty('--bg-color', selected.bg);
        document.documentElement.style.setProperty('--bg-gradient', selected.gradient);
        document.body.style.background = selected.gradient;
        document.body.style.backgroundAttachment = 'fixed';
    } else {
        document.documentElement.style.setProperty('--bg-color', selected.bg);
        document.documentElement.style.removeProperty('--bg-gradient');
        document.body.style.background = '';
        document.body.style.backgroundColor = selected.bg;
        document.body.style.backgroundAttachment = '';
    }

    // 3. Cập nhật các biến CSS màu sắc cơ bản
    document.documentElement.style.setProperty('--text-color', selected.text);

    if (selected.border) {
        document.documentElement.style.setProperty('--border-color', selected.border);
    } else {
        document.documentElement.style.removeProperty('--border-color');
    }

    if (selected.headerBg) {
        document.documentElement.style.setProperty('--header-bg', selected.headerBg);
    } else {
        document.documentElement.style.removeProperty('--header-bg');
    }

    // 4. ĐỒNG BỘ 2 TẦNG: Cập nhật màu viền Focus theo Theme
    if (selected.focusBorder) {
        document.documentElement.style.setProperty('--cell-focus-border', selected.focusBorder);
    } else {
        document.documentElement.style.removeProperty('--cell-focus-border');
    }
    if (selected.focusBg) {
        document.documentElement.style.setProperty('--cell-focus-bg', selected.focusBg);
    } else {
        document.documentElement.style.removeProperty('--cell-focus-bg');
    }

    // 5. Lưu lựa chọn theme vào LocalStorage
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = themeKey;
    localStorage.setItem('appTheme', themeKey);
}

function initTabEvents() {
    document.getElementById('tab-edit')?.addEventListener('click', () => switchTab('edit-tool'));
    document.getElementById('tab-story')?.addEventListener('click', () => switchTab('story-info'));
}

function switchTab(tabId) {
    // ÉP LƯU TỨC THÌ Ô ĐANG GÕ DỞ TRƯỚC KHI CHUYỂN TAB
    if (typeof syncActiveCellToData === 'function') syncActiveCellToData();
    if (typeof flushSave === 'function') flushSave();

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section-content').forEach(section => section.classList.remove('active'));
    
    if (tabId === 'edit-tool') {
        if (typeof activeTab !== 'undefined') window.activeTab = 'edit-tool';
        document.getElementById('tab-edit')?.classList.add('active');
        document.getElementById('edit-tool-section')?.classList.add('active');
        const toolbars = document.getElementById('edit-tool-toolbars');
        if (toolbars) toolbars.style.display = 'block';
        if (typeof renderTable === 'function') renderTable();
    } else {
        if (typeof activeTab !== 'undefined') window.activeTab = 'story-info';
        document.getElementById('tab-story')?.classList.add('active');
        document.getElementById('story-info-section')?.classList.add('active');
        const toolbars = document.getElementById('edit-tool-toolbars');
        if (toolbars) toolbars.style.display = 'none';
        
        if (typeof renderMetadata === 'function') renderMetadata();
    }
    
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();
}