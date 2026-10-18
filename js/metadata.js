// =========================================================================
// QUẢN LÝ THÔNG TIN TRUYỆN (MỤC 2) - TÌM KIẾM ĐỘC LẬP TỪNG MỤC & NHẬP VĂN XUÔI TỰ ĐỘNG
// =========================================================================

// CÁC BIẾN TÌM KIẾM ĐỘC LẬP CHO TỪNG MỤC
let searchCharsQuery = '';
let searchPronounsQuery = '';
let searchTermsQuery = '';
let metaSearchQuery = ''; // Giữ lại dự phòng cho tìm kiếm tổng thể nếu có

// 1. TỰ ĐỘNG TIÊM CSS CHO THANH TÌM KIẾM TỪNG MỤC VÀ MODAL NHẬP VĂN XUÔI
(function injectMetadataStyles() {
    const STYLE_ID = 'metadata-custom-styles';
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        /* Thanh tìm kiếm độc lập từng mục */
        .section-search-bar-wrap {
            padding: 8px 12px;
            background: var(--bg-card, #ffffff);
            border-bottom: 1px solid var(--border-color, #e2e8f0);
            position: sticky;
            top: 0;
            z-index: 5;
        }
        .section-search-inner {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--bg-input, #f8fafc);
            border: 1px solid var(--border-color, #cbd5e1);
            border-radius: 8px;
            padding: 5px 10px;
            transition: all 0.15s ease;
        }
        .section-search-inner:focus-within {
            border-color: #3b82f6;
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        .section-search-icon {
            font-size: 13px;
            color: var(--text-muted, #64748b);
            user-select: none;
        }
        .section-search-input {
            flex: 1;
            border: none;
            background: transparent;
            outline: none;
            font-size: 13px;
            color: inherit;
            padding: 2px 0;
        }
        .btn-clear-section-search {
            background: none;
            border: none;
            color: var(--text-muted, #94a3b8);
            font-size: 16px;
            cursor: pointer;
            line-height: 1;
            padding: 0 4px;
        }
        .btn-clear-section-search:hover {
            color: #ef4444;
        }
        .meta-no-result {
            padding: 20px;
            text-align: center;
            font-size: 13px;
            color: var(--text-muted, #64748b);
            background: var(--bg-card, #ffffff);
            border-radius: 8px;
            margin: 8px;
            border: 1px dashed var(--border-color, #cbd5e1);
        }

        /* Nút nhập văn xuôi trên thanh công cụ */
        .btn-prose-import-trigger {
            background: linear-gradient(135deg, #0284c7, #0369a1) !important;
            color: #ffffff !important;
            font-weight: 600 !important;
            border: none !important;
            box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);
        }
        .btn-prose-import-trigger:hover {
            background: linear-gradient(135deg, #0369a1, #075985) !important;
            transform: translateY(-1px);
        }
    `;
    document.head.appendChild(style);
})();

// HÀM TIỆN ÍCH: BỎ DẤU TIẾNG VIỆT ĐỂ TÌM KIẾM LINH HOẠT
function stripAccents(str) {
    if (!str) return '';
    return str.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd').replace(/Đ/g, 'D')
              .toLowerCase().trim();
}

// HÀM KIỂM TRA TỪ KHÓA TÌM KIẾM (TIẾNG TRUNG + TIẾNG VIỆT CÓ/KHÔNG DẤU)
function matchSearch(text, query) {
    if (!query) return true;
    if (!text) return false;
    const tLower = String(text).toLowerCase();
    const qLower = query.toLowerCase().trim();
    if (tLower.includes(qLower)) return true;
    return stripAccents(tLower).includes(stripAccents(qLower));
}

// BẬT TẮT NÚT UNDO / REDO
function updateUndoRedoButtonsState() {
    try {
        const btnMetaUndo = document.getElementById('btn-meta-undo');
        const btnMetaRedo = document.getElementById('btn-meta-redo');
        if (btnMetaUndo) btnMetaUndo.disabled = (typeof metaUndoStack !== 'undefined') ? metaUndoStack.length === 0 : true;
        if (btnMetaRedo) btnMetaRedo.disabled = (typeof metaRedoStack !== 'undefined') ? metaRedoStack.length === 0 : true;

        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        if (btnUndo) btnUndo.disabled = (typeof editorUndoStack !== 'undefined') ? editorUndoStack.length === 0 : true;
        if (btnRedo) btnRedo.disabled = (typeof editorRedoStack !== 'undefined') ? editorRedoStack.length === 0 : true;
    } catch (e) {}
}

// CHUẨN HÓA DỮ LIỆU ĐẢM BẢO TƯƠNG THÍCH VỚI FILE JSON CŨ
function normalizeMetadata(imported) {
    if (!imported) return { title: '', characters: [], pronouns: [], terms: [] };
    
    const title = imported.title || '';

    const characters = (imported.characters || []).map(item => ({
        c1: item.c1 || item.cn || '',
        c2: item.c2 || item.vi || '',
        c3: item.c3 || item.called || '',
        c4: item.c4 || item.desc || '',
        c5: item.c5 || item.pronoun3 || ''
    }));

    const pronouns = (imported.pronouns || []).map(item => ({
        c1: item.c1 || item.a || '',
        c2: item.c2 || item.b || '',
        c3: item.c3 || item.ab || '',
        c4: item.c4 || item.ba || '',
        c5: item.c5 || item.note || ''
    }));

    const terms = (imported.terms || []).map(item => ({
        c1: item.c1 || item.orig || '',
        c2: item.c2 || item.changed || ''
    }));

    return { title, characters, pronouns, terms };
}

function saveMetadata() {
    localStorage.setItem('storyMetadata', JSON.stringify(metadata));
}

function renderMetadata() {
    if (metadata) {
        metadata = normalizeMetadata(metadata);
    }

    const titleInput = document.getElementById('story-title-input');
    if (titleInput) titleInput.value = metadata.title || '';
    
    ensureSectionSearchBars();
    ensureProseImportButton();

    renderCharacters();
    renderPronouns();
    renderTerms();
    updateUndoRedoButtonsState();
}

function saveMetaUndoState() {
    const currentStateStr = JSON.stringify(metadata);
    if (metaUndoStack.length > 0 && metaUndoStack[metaUndoStack.length - 1] === currentStateStr) {
        return;
    }
    metaUndoStack.push(currentStateStr);
    if (metaUndoStack.length > 50) metaUndoStack.shift();
    metaRedoStack = [];
    updateUndoRedoButtonsState();
}

function handleMetaTypingInput() {
    if (!metaIsTyping) {
        saveMetaUndoState();
        metaIsTyping = true;
    }
    clearTimeout(metaTypingUndoTimeout);
    metaTypingUndoTimeout = setTimeout(() => {
        saveMetaUndoState();
        metaIsTyping = false;
    }, 1000);
}

function metaUndo() {
    if (metaUndoStack.length === 0) return;
    if (metaIsTyping) {
        clearTimeout(metaTypingUndoTimeout);
        saveMetaUndoState();
        metaIsTyping = false;
    }
    const currentStateStr = JSON.stringify(metadata);
    let prevStateStr = metaUndoStack.pop();
    if (prevStateStr === currentStateStr && metaUndoStack.length > 0) {
        metaRedoStack.push(prevStateStr);
        prevStateStr = metaUndoStack.pop();
    }
    metaRedoStack.push(currentStateStr);
    metadata = normalizeMetadata(JSON.parse(prevStateStr));
    renderMetadata();
    saveMetadata();
    updateUndoRedoButtonsState();
    showToast('↩️ Đã hoàn tác thông tin (Undo)', 'var(--btn-info)');
}

function metaRedo() {
    if (metaRedoStack.length === 0) return;
    metaUndoStack.push(JSON.stringify(metadata));
    const nextState = normalizeMetadata(JSON.parse(metaRedoStack.pop()));
    metadata = nextState;
    renderMetadata();
    saveMetadata();
    updateUndoRedoButtonsState();
    showToast('🔁 Đã làm lại thông tin (Redo)', 'var(--btn-info)');
}

function addMetaHistoryEntry() {
    if (typeof pushToCloudHistory === 'function') {
        pushToCloudHistory('meta', metadata);
    }
}

let metaSaveTimeout;
function debounceMetaSave() {
    clearTimeout(metaSaveTimeout);
    metaSaveTimeout = setTimeout(() => {
        saveMetadata();
        const now = Date.now();
        if (now - lastMetaHistoryTime > 15000) {
            addMetaHistoryEntry();
            lastMetaHistoryTime = now;
        }
    }, 500);
}

function selectInfoCard(el, section, originalIndex) {
    el.parentNode.querySelectorAll('.active-info-card').forEach(r => r.classList.remove('active-info-card'));
    el.classList.add('active-info-card');
    activeInfoRows[section] = originalIndex;
}

// =========================================================================
// TÍNH NĂNG 1: TỰ ĐỘNG CHÈN THANH TÌM KIẾM RIÊNG TỪNG MỤC
// =========================================================================
function ensureSectionSearchBars() {
    // 1. Ô tìm kiếm Mục 1: Nhân vật
    const bodyChars = document.getElementById('body-characters');
    if (bodyChars && !document.getElementById('search-chars-input')) {
        const wrap = document.createElement('div');
        wrap.className = 'section-search-bar-wrap';
        wrap.innerHTML = `
            <div class="section-search-inner">
                <span class="section-search-icon">🔍</span>
                <input type="text" id="search-chars-input" class="section-search-input" placeholder="Tìm nhân vật (tên Trung, Việt, miêu tả, xưng hô...)..." autocomplete="off" />
                <button type="button" id="btn-clear-chars-search" class="btn-clear-section-search" style="display:none;" title="Xóa tìm kiếm">&times;</button>
            </div>
        `;
        bodyChars.parentNode.insertBefore(wrap, bodyChars);

        const inEl = wrap.querySelector('#search-chars-input');
        const clearBtn = wrap.querySelector('#btn-clear-chars-search');
        inEl.addEventListener('input', (e) => {
            searchCharsQuery = e.target.value.trim();
            clearBtn.style.display = searchCharsQuery ? 'inline-block' : 'none';
            renderCharacters();
        });
        clearBtn.addEventListener('click', () => {
            inEl.value = '';
            searchCharsQuery = '';
            clearBtn.style.display = 'none';
            renderCharacters();
            inEl.focus();
        });
    }

    // 2. Ô tìm kiếm Mục 2: Xưng hô
    const bodyPros = document.getElementById('body-pronouns');
    if (bodyPros && !document.getElementById('search-pronouns-input')) {
        const wrap = document.createElement('div');
        wrap.className = 'section-search-bar-wrap';
        wrap.innerHTML = `
            <div class="section-search-inner">
                <span class="section-search-icon">🔍</span>
                <input type="text" id="search-pronouns-input" class="section-search-input" placeholder="Tìm xưng hô (A, B, A-B, B-A, ghi chú...)..." autocomplete="off" />
                <button type="button" id="btn-clear-pros-search" class="btn-clear-section-search" style="display:none;" title="Xóa tìm kiếm">&times;</button>
            </div>
        `;
        bodyPros.parentNode.insertBefore(wrap, bodyPros);

        const inEl = wrap.querySelector('#search-pronouns-input');
        const clearBtn = wrap.querySelector('#btn-clear-pros-search');
        inEl.addEventListener('input', (e) => {
            searchPronounsQuery = e.target.value.trim();
            clearBtn.style.display = searchPronounsQuery ? 'inline-block' : 'none';
            renderPronouns();
        });
        clearBtn.addEventListener('click', () => {
            inEl.value = '';
            searchPronounsQuery = '';
            clearBtn.style.display = 'none';
            renderPronouns();
            inEl.focus();
        });
    }

    // 3. Ô tìm kiếm Mục 3: Thống nhất từ ngữ
    const bodyTerms = document.getElementById('body-terms');
    if (bodyTerms && !document.getElementById('search-terms-input')) {
        const wrap = document.createElement('div');
        wrap.className = 'section-search-bar-wrap';
        wrap.innerHTML = `
            <div class="section-search-inner">
                <span class="section-search-icon">🔍</span>
                <input type="text" id="search-terms-input" class="section-search-input" placeholder="Tìm từ ngữ (chữ Hán, bản dịch tiếng Việt)..." autocomplete="off" />
                <button type="button" id="btn-clear-terms-search" class="btn-clear-section-search" style="display:none;" title="Xóa tìm kiếm">&times;</button>
            </div>
        `;
        bodyTerms.parentNode.insertBefore(wrap, bodyTerms);

        const inEl = wrap.querySelector('#search-terms-input');
        const clearBtn = wrap.querySelector('#btn-clear-terms-search');
        inEl.addEventListener('input', (e) => {
            searchTermsQuery = e.target.value.trim();
            clearBtn.style.display = searchTermsQuery ? 'inline-block' : 'none';
            renderTerms();
        });
        clearBtn.addEventListener('click', () => {
            inEl.value = '';
            searchTermsQuery = '';
            clearBtn.style.display = 'none';
            renderTerms();
            inEl.focus();
        });
    }
}

// =========================================================================
// 1. RENDER NHÂN VẬT (DANH SÁCH KHỐI DỌC) - TÌM KIẾM ĐA TRƯỜNG & CHỐNG XÓA NHẦM
// =========================================================================
function renderCharacters() {
    const container = document.getElementById('body-characters');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.characters || [];
    let matchCount = 0;

    list.forEach((char, origIndex) => {
        // Lọc theo từ khóa tìm kiếm của riêng mục Nhân vật
        const query = searchCharsQuery || metaSearchQuery;
        const isMatch = !query || 
            matchSearch(char.c1, query) ||
            matchSearch(char.c2, query) ||
            matchSearch(char.c3, query) ||
            matchSearch(char.c4, query) ||
            matchSearch(char.c5, query);

        if (!isMatch) return;
        matchCount++;

        const card = document.createElement('div');
        card.className = `meta-card-block ${activeInfoRows.characters === origIndex ? 'active-info-card' : ''}`;
        card.dataset.index = origIndex;
        card.onclick = () => selectInfoCard(card, 'characters', origIndex);

        card.innerHTML = `
            <div class="meta-card-header">
                <span>Nhân vật ${origIndex + 1}</span>
                <button class="btn-card-del" title="Xóa nhân vật này">🗑️</button>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Tên tiếng Trung:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c1">${char.c1 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Tên tiếng Việt:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c2">${char.c2 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Ngôi thứ 3 người khác gọi:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c3">${char.c3 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Miêu tả nhân vật:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c4">${char.c4 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Ngôi thứ ba:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c5">${char.c5 || ''}</div>
            </div>
        `;

        card.querySelectorAll('.meta-field-value').forEach(fieldEl => {
            fieldEl.addEventListener('input', (e) => {
                const f = e.target.dataset.field;
                metadata.characters[origIndex][f] = e.target.innerHTML;
                handleMetaTypingInput();
                debounceMetaSave();
            });
        });

        // BẢO ĐẢM XÓA CHUẨN XÁC BẢN GHI NGUỒN THEO origIndex
        card.querySelector('.btn-card-del')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCharacterRow(origIndex);
        });

        container.appendChild(card);
    });

    if (matchCount === 0 && list.length > 0) {
        container.innerHTML = '<div class="meta-no-result">🔍 Không tìm thấy nhân vật phù hợp.</div>';
    } else if (list.length === 0) {
        container.innerHTML = '<div class="meta-no-result">Chưa có nhân vật nào. Bấm "+ Thêm nhân vật" để tạo mới.</div>';
    }
}

function addCharacterRow() {
    if (!metadata.characters) metadata.characters = [];
    metadata.characters.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
    activeInfoRows.characters = metadata.characters.length - 1;
    debounceMetaSave();
    renderCharacters();
    const container = document.getElementById('body-characters');
    if (container) container.scrollTop = container.scrollHeight;
}

function deleteCharacterRow(targetIndex = null) {
    const idx = (targetIndex !== null && typeof targetIndex === 'number') ? targetIndex : activeInfoRows.characters;
    if (idx >= 0 && metadata.characters && idx < metadata.characters.length) {
        const charName = metadata.characters[idx].c2 || metadata.characters[idx].c1 || `Nhân vật ${idx + 1}`;
        if (confirm(`Xóa "${charName}"?`)) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.characters.splice(idx, 1);
            if (metadata.characters.length === 0) {
                metadata.characters.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
            }
            activeInfoRows.characters = -1;
            debounceMetaSave();
            renderCharacters();
            showToast('🗑️ Đã xóa nhân vật!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một nhân vật trong danh sách để xóa!');
    }
}

// =========================================================================
// 2. RENDER XƯNG HÔ (DANH SÁCH KHỐI DỌC) - TÌM KIẾM ĐA TRƯỜNG & CHỐNG XÓA NHẦM
// =========================================================================
function renderPronouns() {
    const container = document.getElementById('body-pronouns');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.pronouns || [];
    let matchCount = 0;

    list.forEach((pro, origIndex) => {
        const query = searchPronounsQuery || metaSearchQuery;
        const isMatch = !query || 
            matchSearch(pro.c1, query) ||
            matchSearch(pro.c2, query) ||
            matchSearch(pro.c3, query) ||
            matchSearch(pro.c4, query) ||
            matchSearch(pro.c5, query);

        if (!isMatch) return;
        matchCount++;

        const card = document.createElement('div');
        card.className = `meta-card-block ${activeInfoRows.pronouns === origIndex ? 'active-info-card' : ''}`;
        card.dataset.index = origIndex;
        card.onclick = () => selectInfoCard(card, 'pronouns', origIndex);

        card.innerHTML = `
            <div class="meta-card-header">
                <span>Cặp xưng hô ${origIndex + 1}</span>
                <button class="btn-card-del" title="Xóa cặp xưng hô này">🗑️</button>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">A:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c1">${pro.c1 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">B:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c2">${pro.c2 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">A-B:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c3">${pro.c3 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">B-A:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c4">${pro.c4 || ''}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Ghi chú:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c5">${pro.c5 || ''}</div>
            </div>
        `;

        card.querySelectorAll('.meta-field-value').forEach(fieldEl => {
            fieldEl.addEventListener('input', (e) => {
                const f = e.target.dataset.field;
                metadata.pronouns[origIndex][f] = e.target.innerHTML;
                handleMetaTypingInput();
                debounceMetaSave();
            });
        });

        // BẢO ĐẢM XÓA CHUẨN XÁC BẢN GHI NGUỒN THEO origIndex
        card.querySelector('.btn-card-del')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePronounRow(origIndex);
        });

        container.appendChild(card);
    });

    if (matchCount === 0 && list.length > 0) {
        container.innerHTML = '<div class="meta-no-result">🔍 Không tìm thấy cặp xưng hô phù hợp.</div>';
    } else if (list.length === 0) {
        container.innerHTML = '<div class="meta-no-result">Chưa có xưng hô nào. Bấm "+ Thêm xưng hô" để tạo mới.</div>';
    }
}

function addPronounRow() {
    if (!metadata.pronouns) metadata.pronouns = [];
    metadata.pronouns.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
    activeInfoRows.pronouns = metadata.pronouns.length - 1;
    debounceMetaSave();
    renderPronouns();
    const container = document.getElementById('body-pronouns');
    if (container) container.scrollTop = container.scrollHeight;
}

function deletePronounRow(targetIndex = null) {
    const idx = (targetIndex !== null && typeof targetIndex === 'number') ? targetIndex : activeInfoRows.pronouns;
    if (idx >= 0 && metadata.pronouns && idx < metadata.pronouns.length) {
        const pairLabel = (metadata.pronouns[idx].c1 && metadata.pronouns[idx].c2) 
            ? `${metadata.pronouns[idx].c1} - ${metadata.pronouns[idx].c2}` 
            : `Cặp xưng hô ${idx + 1}`;
        if (confirm(`Xóa "${pairLabel}"?`)) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.pronouns.splice(idx, 1);
            if (metadata.pronouns.length === 0) {
                metadata.pronouns.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
            }
            activeInfoRows.pronouns = -1;
            debounceMetaSave();
            renderPronouns();
            showToast('🗑️ Đã xóa cặp xưng hô!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một cặp xưng hô trong danh sách để xóa!');
    }
}

// =========================================================================
// 3. RENDER THỐNG NHẤT TỪ NGỮ (Hán = Tên đổi) - TÌM KIẾM ĐA TRƯỜNG & CHỐNG XÓA NHẦM
// =========================================================================
function renderTerms() {
    const container = document.getElementById('body-terms');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.terms || [];
    let matchCount = 0;

    list.forEach((term, origIndex) => {
        const query = searchTermsQuery || metaSearchQuery;
        const isMatch = !query || 
            matchSearch(term.c1, query) ||
            matchSearch(term.c2, query);

        if (!isMatch) return;
        matchCount++;

        const item = document.createElement('div');
        item.className = `term-line-item ${activeInfoRows.terms === origIndex ? 'active-info-card' : ''}`;
        item.dataset.index = origIndex;
        item.onclick = () => selectInfoCard(item, 'terms', origIndex);

        item.innerHTML = `
            <div class="term-part-cn" contenteditable="true" data-field="c1" placeholder="Tiếng Hán">${term.c1 || ''}</div>
            <span class="term-equal-sign">=</span>
            <div class="term-part-vi" contenteditable="true" data-field="c2" placeholder="Tên đổi">${term.c2 || ''}</div>
            <button class="btn-card-del" title="Xóa từ ngữ này">🗑️</button>
        `;

        item.querySelectorAll('[contenteditable="true"]').forEach(partEl => {
            partEl.addEventListener('input', (e) => {
                const f = e.target.dataset.field;
                metadata.terms[origIndex][f] = e.target.innerHTML;
                handleMetaTypingInput();
                debounceMetaSave();
            });
        });

        // BẢO ĐẢM XÓA CHUẨN XÁC BẢN GHI NGUỒN THEO origIndex
        item.querySelector('.btn-card-del')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTermRow(origIndex);
        });

        container.appendChild(item);
    });

    if (matchCount === 0 && list.length > 0) {
        container.innerHTML = '<div class="meta-no-result">🔍 Không tìm thấy từ ngữ phù hợp.</div>';
    } else if (list.length === 0) {
        container.innerHTML = '<div class="meta-no-result">Chưa có từ ngữ nào. Bấm "+ Thêm từ ngữ" để tạo mới.</div>';
    }
}

function addTermRow() {
    if (!metadata.terms) metadata.terms = [];
    metadata.terms.push({ c1: '', c2: '' });
    activeInfoRows.terms = metadata.terms.length - 1;
    debounceMetaSave();
    renderTerms();
    const container = document.getElementById('body-terms');
    if (container) container.scrollTop = container.scrollHeight;
}

function deleteTermRow(targetIndex = null) {
    const idx = (targetIndex !== null && typeof targetIndex === 'number') ? targetIndex : activeInfoRows.terms;
    if (idx >= 0 && metadata.terms && idx < metadata.terms.length) {
        const termLabel = (metadata.terms[idx].c1 || metadata.terms[idx].c2) 
            ? `${metadata.terms[idx].c1} = ${metadata.terms[idx].c2}` 
            : `Dòng ${idx + 1}`;
        if (confirm(`Xóa từ ngữ "${termLabel}"?`)) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.terms.splice(idx, 1);
            if (metadata.terms.length === 0) {
                metadata.terms.push({ c1: '', c2: '' });
            }
            activeInfoRows.terms = -1;
            debounceMetaSave();
            renderTerms();
            showToast('🗑️ Đã xóa thuật ngữ!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một thuật ngữ trong danh sách để xóa!');
    }
}

// =========================================================================
// HÀM SAO CHÉP THÔNG TIN (CLIPBOARD API CÓ BẢO VỆ FALLBACK)
// =========================================================================
function extractCleanText(val) {
    if (!val) return '';
    const temp = document.createElement('div');
    temp.innerHTML = String(val).replace(/<br\s*[\/]?>/gi, ' ').replace(/<\/?[^>]+(>|$)/g, '');
    return (temp.textContent || temp.innerText || '').trim();
}

async function copyTextSafely(text, successMsg) {
    if (!text || !text.trim()) {
        showToast('⚠️ Không có dữ liệu để sao chép!', 'var(--btn-warning)');
        return;
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        showToast(successMsg, 'var(--btn-success)');
    } catch (err) {
        console.error('Lỗi copy:', err);
        showToast('❌ Trình duyệt từ chối quyền sao chép!', 'var(--btn-danger)');
    }
}

// 1. FORMAT MỤC NHÂN VẬT (SAO CHÉP TOÀN BỘ)
function getFormattedCharactersText() {
    const list = metadata.characters || [];
    let lines = ['1. Nhân vật trong truyện\n'];
    list.forEach((char, i) => {
        lines.push(`Nhân vật ${i + 1}`);
        lines.push(`Tên tiếng Trung: ${extractCleanText(char.c1)}`);
        lines.push(`Tên tiếng Việt: ${extractCleanText(char.c2)}`);
        lines.push(`Ngôi thứ 3 người khác gọi: ${extractCleanText(char.c3)}`);
        lines.push(`Miêu tả nhân vật: ${extractCleanText(char.c4)}`);
        lines.push(`Ngôi thứ ba: ${extractCleanText(char.c5)}\n`);
    });
    return lines.join('\n').trim();
}

// 2. FORMAT MỤC XƯNG HÔ (SAO CHÉP TOÀN BỘ)
function getFormattedPronounsText() {
    const list = metadata.pronouns || [];
    let lines = ['2. Xưng hô\n'];
    list.forEach((pro, i) => {
        lines.push(`Cặp xưng hô ${i + 1}`);
        lines.push(`A: ${extractCleanText(pro.c1)}`);
        lines.push(`B: ${extractCleanText(pro.c2)}`);
        lines.push(`A-B: ${extractCleanText(pro.c3)}`);
        lines.push(`B-A: ${extractCleanText(pro.c4)}`);
        if (pro.c5) lines.push(`Ghi chú: ${extractCleanText(pro.c5)}`);
        lines.push('');
    });
    return lines.join('\n').trim();
}

// 3. FORMAT MỤC THUẬT NGỮ (SAO CHÉP TOÀN BỘ THEO DẠNG Hán = Tên đổi)
function getFormattedTermsText() {
    const list = metadata.terms || [];
    let lines = ['3. Thống nhất từ ngữ\n'];
    list.forEach(term => {
        const cn = extractCleanText(term.c1);
        const vi = extractCleanText(term.c2);
        lines.push(`${cn} = ${vi}`);
    });
    return lines.join('\n').trim();
}

// 4. FORMAT TOÀN BỘ THÔNG TIN TRUYỆN
function getFormattedAllMetadataText() {
    const titleStr = metadata.title ? metadata.title.trim() : 'Chưa đặt tên';
    return [
        `Tên truyện: ${titleStr}`,
        '',
        getFormattedCharactersText(),
        '',
        getFormattedPronounsText(),
        '',
        getFormattedTermsText()
    ].join('\n');
}

// =========================================================================
// TÍNH NĂNG 2: THUẬT TOÁN PHÂN TÍCH VĂN XUÔI & TỰ ĐỘNG TẠO BẢNG
// =========================================================================
function parseMetadataProse(text) {
    if (!text || !text.trim()) {
        return { success: false, message: 'Nội dung dán vào đang trống!' };
    }

    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let title = '';
    const characters = [];
    const pronouns = [];
    const terms = [];
    const warnings = [];

    let currentSection = 0; // 0: Tiêu đề, 1: Nhân vật, 2: Xưng hô, 3: Thống nhất từ ngữ
    let currentChar = null;
    let currentPro = null;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (!trimmed) continue;

        // 1. Nhận diện Tên truyện
        if (/^Tên truyện\s*:/i.test(trimmed)) {
            const colonIdx = trimmed.indexOf(':');
            title = trimmed.slice(colonIdx + 1).trim();
            continue;
        }

        // 2. Nhận diện các tiêu đề mục lớn
        if (/^1\.\s*Nhân vật trong truyện/i.test(trimmed)) {
            currentSection = 1;
            currentChar = null;
            continue;
        }
        if (/^2\.\s*Xưng hô/i.test(trimmed)) {
            currentSection = 2;
            currentPro = null;
            continue;
        }
        if (/^3\.\s*Thống nhất từ ngữ/i.test(trimmed)) {
            currentSection = 3;
            continue;
        }

        // 3. Mục 1: Nhân vật trong truyện
        if (currentSection === 1) {
            if (/^Nhân vật\s+\d+/i.test(trimmed)) {
                currentChar = { c1: '', c2: '', c3: '', c4: '', c5: '' };
                characters.push(currentChar);
                continue;
            }

            if (!currentChar) {
                if (/^Tên tiếng Trung\s*:/i.test(trimmed)) {
                    currentChar = { c1: '', c2: '', c3: '', c4: '', c5: '' };
                    characters.push(currentChar);
                } else {
                    continue;
                }
            }

            const colonIdx = rawLine.indexOf(':');
            if (colonIdx !== -1) {
                const label = rawLine.slice(0, colonIdx).trim().toLowerCase();
                const val = rawLine.slice(colonIdx + 1).trim();

                if (label === 'tên tiếng trung' || label === 'tiếng trung') currentChar.c1 = val;
                else if (label === 'tên tiếng việt' || label === 'tiếng việt') currentChar.c2 = val;
                else if (label === 'ngôi thứ 3 người khác gọi' || label === 'người khác gọi') currentChar.c3 = val;
                else if (label === 'miêu tả nhân vật' || label === 'miêu tả') currentChar.c4 = val;
                else if (label === 'ngôi thứ ba' || label === 'ngôi thứ 3') currentChar.c5 = val;
                else {
                    warnings.push(`Dòng không rõ trường ở mục Nhân vật: "${trimmed}"`);
                }
            }
            continue;
        }

        // 4. Mục 2: Xưng hô
        if (currentSection === 2) {
            if (/^Cặp xưng hô\s+\d+/i.test(trimmed)) {
                currentPro = { c1: '', c2: '', c3: '', c4: '', c5: '' };
                pronouns.push(currentPro);
                continue;
            }

            if (!currentPro) {
                if (/^A\s*:/i.test(trimmed)) {
                    currentPro = { c1: '', c2: '', c3: '', c4: '', c5: '' };
                    pronouns.push(currentPro);
                } else {
                    continue;
                }
            }

            // CHỈ CẮT Ở DẤU HAI CHẤM ĐẦU TIÊN (BẢO VỆ DẤU HAI CHẤM TRONG NỘI DUNG)
            const colonIdx = rawLine.indexOf(':');
            if (colonIdx !== -1) {
                const label = rawLine.slice(0, colonIdx).trim().toUpperCase();
                const val = rawLine.slice(colonIdx + 1).trim();

                if (label === 'A') currentPro.c1 = val;
                else if (label === 'B') currentPro.c2 = val;
                else if (label === 'A-B' || label === 'A - B') currentPro.c3 = val;
                else if (label === 'B-A' || label === 'B - A') currentPro.c4 = val;
                else if (label === 'GHI CHÚ' || label === 'GHI CHU') currentPro.c5 = val;
                else {
                    warnings.push(`Dòng không rõ trường ở mục Xưng hô: "${trimmed}"`);
                }
            }
            continue;
        }

        // 5. Mục 3: Thống nhất từ ngữ (Dạng Hán = Việt)
        if (currentSection === 3) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                const cn = trimmed.slice(0, eqIdx).trim();
                const vi = trimmed.slice(eqIdx + 1).trim();
                if (cn || vi) {
                    terms.push({ c1: cn, c2: vi });
                }
            } else {
                warnings.push(`Dòng không có dấu "=" ở mục Từ ngữ: "${trimmed}"`);
            }
            continue;
        }

        warnings.push(`Dòng nằm ngoài các mục: "${trimmed}"`);
    }

    if (!title && characters.length === 0 && pronouns.length === 0 && terms.length === 0) {
        return {
            success: false,
            message: 'Không nhận diện được nội dung phù hợp với định dạng thông tin truyện!'
        };
    }

    return {
        success: true,
        data: {
            title,
            characters: characters.length > 0 ? characters : [{ c1: '', c2: '', c3: '', c4: '', c5: '' }],
            pronouns: pronouns.length > 0 ? pronouns : [{ c1: '', c2: '', c3: '', c4: '', c5: '' }],
            terms: terms.length > 0 ? terms : [{ c1: '', c2: '' }]
        },
        counts: {
            hasTitle: !!title,
            charactersCount: characters.length,
            pronounsCount: pronouns.length,
            termsCount: terms.length
        },
        warnings
    };
}

// TỰ ĐỘNG CHÈN NÚT "Nhập văn xuôi → Tạo bảng" TRÊN THANH CÔNG CỤ
function ensureProseImportButton() {
    if (document.getElementById('btn-import-prose-meta')) return;
    const copyAllBtn = document.getElementById('btn-copy-all-meta');
    if (!copyAllBtn) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-import-prose-meta';
    btn.className = `${copyAllBtn.className || ''} btn-prose-import-trigger`;
    btn.style.marginLeft = '8px';
    btn.innerHTML = '📋 Nhập văn xuôi → Tạo bảng';

    btn.onclick = () => openProseImportModal();

    copyAllBtn.parentNode.insertBefore(btn, copyAllBtn.nextSibling);
}

// MODAL QUY TRÌNH 2 BƯỚC: DÁN -> PHÂN TÍCH XEM TRƯỚC -> TẠO BẢNG
function openProseImportModal() {
    let modal = document.getElementById('modal-import-prose');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-import-prose';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" role="dialog" aria-modal="true" style="max-width: 680px; width: 92%; max-height: 90vh; display: flex; flex-direction: column; background: var(--bg-card, #ffffff); border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); overflow: hidden;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border-color, #e2e8f0); background: var(--bg-header, rgba(241, 245, 249, 0.5));">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                        <span>📋</span> Nhập văn xuôi → Tự động tạo bảng thông tin
                    </h3>
                    <button type="button" class="btn-close-prose-modal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted, #64748b); line-height: 1;">&times;</button>
                </div>
                <div class="modal-body" style="padding: 16px 18px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
                    <div style="font-size: 13px; color: var(--text-muted, #475569); line-height: 1.5;">
                        Dán nội dung văn bản (được copy từ nút <b>"Copy toàn bộ thông tin"</b> của dự án khác hoặc tệp ghi chú) vào khung dưới đây. Hệ thống sẽ tự động bóc tách thành các mục <b>Nhân vật</b>, <b>Xưng hô</b> và <b>Thống nhất từ ngữ</b>.
                    </div>
                    <textarea id="prose-import-textarea" style="width: 100%; height: 210px; box-sizing: border-box; font-family: monospace; font-size: 13px; padding: 10px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 8px; resize: vertical; outline: none; background: var(--bg-input, #ffffff); color: inherit;" placeholder="Dán văn bản vào đây...
Ví dụ:
Tên truyện: Át Bích 黑桃A

1. Nhân vật trong truyện
Nhân vật 1
Tên tiếng Trung: 许爻
Tên tiếng Việt: Hứa Hào
..."></textarea>

                    <div style="display: flex; justify-content: flex-end;">
                        <button type="button" id="btn-prose-preview" style="padding: 7px 16px; font-size: 13px; font-weight: 600; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s;">🔍 Phân tích / Xem trước</button>
                    </div>

                    <!-- Khu vực hiển thị bảng xem trước kết quả phân tích -->
                    <div id="prose-preview-result" style="display: none; background: var(--bg-tool-group, rgba(248, 250, 252, 0.9)); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 12px; font-size: 13px;">
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border-color, #e2e8f0); background: var(--bg-footer, rgba(248, 250, 252, 0.5));">
                    <button type="button" class="btn-cancel-prose" style="padding: 8px 16px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 6px; background: transparent; cursor: pointer; color: var(--text-muted, #64748b);">Hủy</button>
                    <button type="button" id="btn-prose-create" disabled style="padding: 8px 20px; font-size: 13px; font-weight: 600; border: none; border-radius: 6px; background: #10b981; color: #fff; cursor: not-allowed; opacity: 0.5; transition: all 0.15s;">✨ Tạo bảng</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const textarea = modal.querySelector('#prose-import-textarea');
        const previewBtn = modal.querySelector('#btn-prose-preview');
        const createBtn = modal.querySelector('#btn-prose-create');
        const previewResult = modal.querySelector('#prose-preview-result');
        const closeBtns = modal.querySelectorAll('.btn-close-prose-modal, .btn-cancel-prose');

        let lastParsedData = null;

        const doPreview = () => {
            const text = textarea.value.trim();
            if (!text) {
                if (typeof showToast === 'function') showToast('⚠️ Vui lòng dán văn bản vào khung trước khi phân tích!', 'var(--btn-warning)');
                return;
            }

            const res = parseMetadataProse(text);
            if (!res.success) {
                previewResult.style.display = 'block';
                previewResult.innerHTML = `<div style="color: #ef4444; font-weight: 600;">❌ ${res.message}</div>`;
                createBtn.disabled = true;
                createBtn.style.cursor = 'not-allowed';
                createBtn.style.opacity = '0.5';
                lastParsedData = null;
                return;
            }

            lastParsedData = res.data;
            const c = res.counts;

            let warnHtml = '';
            if (res.warnings && res.warnings.length > 0) {
                warnHtml = `
                    <div style="margin-top: 8px; color: #b45309; font-size: 12px; background: rgba(245, 158, 11, 0.1); padding: 8px; border-radius: 6px;">
                        <b>⚠️ Lưu ý (${res.warnings.length} dòng không khớp nhãn trường):</b>
                        <ul style="margin: 4px 0 0 16px; padding: 0;">
                            ${res.warnings.slice(0, 4).map(w => `<li>${w}</li>`).join('')}
                            ${res.warnings.length > 4 ? `<li>...và ${res.warnings.length - 4} dòng khác</li>` : ''}
                        </ul>
                    </div>
                `;
            }

            previewResult.style.display = 'block';
            previewResult.innerHTML = `
                <div style="color: #047857; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <span>✅</span> Phân tích thành công cấu trúc thông tin:
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 6px;">
                    <div style="background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                        <span style="color: #64748b; font-size: 11px;">TÊN TRUYỆN:</span><br/>
                        <b>${res.data.title || '(Chưa đặt tên)'}</b>
                    </div>
                    <div style="background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                        <span style="color: #64748b; font-size: 11px;">1. NHÂN VẬT:</span><br/>
                        <b>${c.charactersCount} mục</b>
                    </div>
                    <div style="background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                        <span style="color: #64748b; font-size: 11px;">2. XƯNG HÔ:</span><br/>
                        <b>${c.pronounsCount} cặp</b>
                    </div>
                    <div style="background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                        <span style="color: #64748b; font-size: 11px;">3. TỪ NGỮ:</span><br/>
                        <b>${c.termsCount} mục</b>
                    </div>
                </div>
                ${warnHtml}
            `;

            createBtn.disabled = false;
            createBtn.style.cursor = 'pointer';
            createBtn.style.opacity = '1';
        };

        previewBtn.onclick = doPreview;

        createBtn.onclick = () => {
            if (!lastParsedData) return;

            // Kiểm tra cảnh báo nếu đang có dữ liệu
            const hasExisting = (metadata.title && metadata.title.trim()) ||
                (metadata.characters && metadata.characters.some(c => c.c1 || c.c2)) ||
                (metadata.pronouns && metadata.pronouns.some(p => p.c1 || p.c2)) ||
                (metadata.terms && metadata.terms.some(t => t.c1 || t.c2));

            if (hasExisting) {
                if (!confirm("⚠️ Toàn bộ dữ liệu hiện tại trong tab 'Thông tin truyện' sẽ được thay thế bằng dữ liệu vừa phân tích.\n\nBạn có chắc chắn muốn tạo bảng không?")) {
                    return;
                }
            }

            saveMetaUndoState();
            metadata = normalizeMetadata(lastParsedData);
            activeInfoRows = { characters: -1, pronouns: -1, terms: -1 };

            saveMetadata();
            renderMetadata();
            addMetaHistoryEntry();

            modal.classList.remove('show');
            if (typeof showToast === 'function') {
                showToast(`✅ Đã tạo bảng thành công từ văn xuôi!`, 'var(--btn-success)');
            }
        };

        closeBtns.forEach(btn => {
            btn.onclick = () => modal.classList.remove('show');
        });

        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    }

    modal.classList.add('show');
    const ta = modal.querySelector('#prose-import-textarea');
    if (ta) {
        ta.focus();
    }
}

// =========================================================================
// KHỞI CHẠY SỰ KIỆN MỤC 2
// =========================================================================
function resetMetadata() {
    if (confirm("⚠️ Bạn có chắc chắn muốn XÓA TOÀN BỘ thông tin truyện (Tên truyện, Nhân vật, Xưng hô, Từ ngữ)?")) {
        saveMetaUndoState();
        if (typeof addMetaHistoryEntry === 'function') addMetaHistoryEntry();

        metadata = {
            title: '',
            characters: [{ c1: '', c2: '', c3: '', c4: '', c5: '' }],
            pronouns: [{ c1: '', c2: '', c3: '', c4: '', c5: '' }],
            terms: [{ c1: '', c2: '' }]
        };

        activeInfoRows = { characters: -1, pronouns: -1, terms: -1 };

        saveMetadata();
        renderMetadata();
        if (typeof showToast === 'function') showToast('🔄 Đã làm mới toàn bộ thông tin truyện!', 'var(--btn-warning)');
    }
}

function exportMetadata() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metadata, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);

    let safeTitle = metadata.title ? metadata.title.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') : "export";
    let fileName = "thong_tin_truyen_" + safeTitle + ".json";

    dlAnchor.setAttribute("download", fileName);
    dlAnchor.click();
    showToast(`💾 Đã xuất file [ ${fileName} ]!`, 'var(--btn-success)');
}

function handleMetadataImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            if (imported && (imported.characters || imported.pronouns || imported.terms)) {
                saveMetaUndoState();
                metadata = normalizeMetadata(imported);
                debounceMetaSave();
                renderMetadata();
                if (typeof addMetaHistoryEntry === 'function') addMetaHistoryEntry();
                showToast('📂 Nhập thông tin truyện thành công!', 'var(--btn-success)');
            } else {
                alert("Định dạng file không khớp!");
            }
        } catch (err) { alert("Lỗi đọc cấu hình: " + err); }
    };
    reader.readAsText(file);
    event.target.value = ''; 
}

function initMetadataEvents() {
    document.getElementById('story-title-input')?.addEventListener('input', (e) => {
        handleMetaTypingInput();
        metadata.title = e.target.value;
        debounceMetaSave();
    });

    // Thêm hàng
    document.getElementById('btn-add-char')?.addEventListener('click', () => { saveMetaUndoState(); addCharacterRow(); });
    document.getElementById('btn-delete-char')?.addEventListener('click', () => deleteCharacterRow());
    
    document.getElementById('btn-add-pro')?.addEventListener('click', () => { saveMetaUndoState(); addPronounRow(); });
    document.getElementById('btn-delete-pro')?.addEventListener('click', () => deletePronounRow());
    
    document.getElementById('btn-add-term')?.addEventListener('click', () => { saveMetaUndoState(); addTermRow(); });
    document.getElementById('btn-delete-term')?.addEventListener('click', () => deleteTermRow());

    // Xuất / Nhập JSON
    document.getElementById('btn-export-meta')?.addEventListener('click', exportMetadata);
    const metaFileIn = document.getElementById('metadata-file-input');
    document.getElementById('btn-import-meta')?.addEventListener('click', () => metaFileIn?.click());
    metaFileIn?.addEventListener('change', handleMetadataImport);

    // Undo / Redo / Reset
    document.getElementById('btn-meta-undo')?.addEventListener('click', metaUndo);
    document.getElementById('btn-meta-redo')?.addEventListener('click', metaRedo);
    document.getElementById('btn-reset-meta')?.addEventListener('click', (e) => { e.preventDefault(); resetMetadata(); });
    document.getElementById('btn-history-meta-show')?.addEventListener('click', () => {
        if (typeof openHistoryModal === 'function') openHistoryModal('meta');
    });

    // SỰ KIỆN TÌM KIẾM TỔNG THỂ (DỰ PHÒNG NẾU NGƯỜI DÙNG DÙNG Ô TÌM KIẾM CHUNG Ở ĐẦU TRANG)
    const searchInput = document.getElementById('meta-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-meta-search');

    searchInput?.addEventListener('input', (e) => {
        metaSearchQuery = e.target.value.trim();
        if (clearSearchBtn) clearSearchBtn.style.display = metaSearchQuery ? 'inline-block' : 'none';
        renderCharacters();
        renderPronouns();
        renderTerms();
    });

    clearSearchBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        metaSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderCharacters();
        renderPronouns();
        renderTerms();
        searchInput?.focus();
    });

    // SỰ KIỆN CÁC NÚT COPY
    document.getElementById('btn-copy-chars')?.addEventListener('click', () => {
        copyTextSafely(getFormattedCharactersText(), 'Đã sao chép mục Nhân vật trong truyện!');
    });

    document.getElementById('btn-copy-pros')?.addEventListener('click', () => {
        copyTextSafely(getFormattedPronounsText(), 'Đã sao chép mục Xưng hô!');
    });

    document.getElementById('btn-copy-terms')?.addEventListener('click', () => {
        copyTextSafely(getFormattedTermsText(), 'Đã sao chép mục Thống nhất từ ngữ!');
    });

    document.getElementById('btn-copy-all-meta')?.addEventListener('click', () => {
        copyTextSafely(getFormattedAllMetadataText(), 'Đã sao chép toàn bộ thông tin truyện!');
    });

    // ĐÓNG / MỞ TỪNG MỤC
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.section-collapse-toggle');
        if (toggleBtn) {
            const sectionBox = toggleBtn.closest('.story-section-box');
            if (sectionBox) {
                sectionBox.classList.toggle('collapsed');
            }
        }
    });
}