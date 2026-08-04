// =========================================================================
// KHỞI CHẠY HỆ THỐNG AN TOÀN - CHỐNG NGHẼN BẢNG VÀ NÚT BẤM
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Gán các phím Hộp thoại Modal
    try {
        modalReplace = document.getElementById('modal-replace');
        modalHistory = document.getElementById('modal-history');
        modalNameQT = document.getElementById('modal-nameqt');
    } catch (e) { console.error("Lỗi Modal:", e); }

    // 2. Khởi chạy độc lập từng tính năng (Lỗi 1 cái không làm ảnh hưởng cái khác)
    try { initSettings(); } catch (e) { console.error("Lỗi initSettings:", e); }
    try { initTabEvents(); } catch (e) { console.error("Lỗi initTabEvents:", e); }
    try { initEditorEvents(); } catch (e) { console.error("Lỗi initEditorEvents:", e); }
    try { initMetadataEvents(); } catch (e) { console.error("Lỗi initMetadataEvents:", e); }
    try { initNameQTModalEvents(); } catch (e) { console.error("Lỗi initNameQTModalEvents:", e); }
    try { initProjectManagerEvents(); } catch (e) { console.error("Lỗi initProjectManagerEvents:", e); }
    
    // 3. Luôn luôn vẽ Bảng dịch và Bảng thông tin ra màn hình
    try { renderTable(); } catch (e) { console.error("Lỗi renderTable:", e); }
    try { renderMetadata(); } catch (e) { console.error("Lỗi renderMetadata:", e); }
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();

    // 4. Nạp từ điển Name QT từ IndexedDB
    if (typeof nameQTEngine !== 'undefined' && nameQTEngine.loadFromStorage) {
        nameQTEngine.loadFromStorage().then(() => {
            refreshAllQT(false);
            const statusText = document.getElementById('nameqt-status');
            if (statusText) {
                statusText.innerHTML = `Hiện có: <strong style="color:var(--btn-primary); font-size:1.1rem;">${nameQTEngine.dict.size}</strong> từ trong từ điển Name QT.`;
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
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    applyTheme(savedTheme);

    themeSelector?.addEventListener('change', (e) => applyTheme(e.target.value));
}

function applyTheme(themeKey) {
    const selected = themes[themeKey] || themes.light;
    document.documentElement.style.setProperty('--bg-color', selected.bg);
    document.documentElement.style.setProperty('--text-color', selected.text);
    document.documentElement.style.setProperty('--row-active', selected.active);
    document.documentElement.style.setProperty('--row-hover', selected.hover);
    document.documentElement.style.setProperty('--selection-bg', selected.active);
    
    if (['dark', 'night', 'oled'].includes(themeKey)) {
        document.body.setAttribute('data-theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
    }
    
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = themeKey;
    localStorage.setItem('appTheme', themeKey);
}

function initTabEvents() {
    document.getElementById('tab-edit')?.addEventListener('click', () => switchTab('edit-tool'));
    document.getElementById('tab-story')?.addEventListener('click', () => switchTab('story-info'));
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section-content').forEach(section => section.classList.remove('active'));
    
    if (tabId === 'edit-tool') {
        activeTab = 'edit-tool';
        document.getElementById('tab-edit')?.classList.add('active');
        document.getElementById('edit-tool-section')?.classList.add('active');
        document.getElementById('edit-tool-toolbars').style.display = 'block';
    } else {
        activeTab = 'story-info';
        document.getElementById('tab-story')?.classList.add('active');
        document.getElementById('story-info-section')?.classList.add('active');
        document.getElementById('edit-tool-toolbars').style.display = 'none';
        renderMetadata();
    }
    if (typeof updateUndoRedoButtonsState === 'function') updateUndoRedoButtonsState();
}