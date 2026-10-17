// =========================================================================
// QUẢN LÝ THÔNG TIN TRUYỆN (MỤC 2) - GIAO DIỆN DỌC, TÌM KIẾM & COPY ĐA NĂNG
// =========================================================================

let metaSearchQuery = '';

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
// 1. RENDER NHÂN VẬT (DANH SÁCH KHỐI DỌC)
// =========================================================================
function renderCharacters() {
    const container = document.getElementById('body-characters');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.characters || [];
    let matchCount = 0;

    list.forEach((char, origIndex) => {
        const isMatch = !metaSearchQuery || 
            matchSearch(char.c1, metaSearchQuery) ||
            matchSearch(char.c2, metaSearchQuery) ||
            matchSearch(char.c3, metaSearchQuery) ||
            matchSearch(char.c4, metaSearchQuery) ||
            matchSearch(char.c5, metaSearchQuery);

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

        card.querySelector('.btn-card-del')?.addEventListener('click', (e) => {
            e.stopPropagation();
            activeInfoRows.characters = origIndex;
            deleteCharacterRow();
        });

        container.appendChild(card);
    });

    if (matchCount === 0 && list.length > 0) {
        container.innerHTML = '<div class="meta-no-result">Không tìm thấy thông tin phù hợp.</div>';
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
    // Cuộn tới mục mới thêm
    const container = document.getElementById('body-characters');
    if (container) container.scrollTop = container.scrollHeight;
}

function deleteCharacterRow() {
    const idx = activeInfoRows.characters;
    if (idx >= 0 && metadata.characters && idx < metadata.characters.length) {
        if (confirm(`Xóa Nhân vật ${idx + 1}?`)) {
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
// 2. RENDER XƯNG HÔ (DANH SÁCH KHỐI DỌC)
// =========================================================================
function renderPronouns() {
    const container = document.getElementById('body-pronouns');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.pronouns || [];
    let matchCount = 0;

    list.forEach((pro, origIndex) => {
        const isMatch = !metaSearchQuery || 
            matchSearch(pro.c1, metaSearchQuery) ||
            matchSearch(pro.c2, metaSearchQuery) ||
            matchSearch(pro.c3, metaSearchQuery) ||
            matchSearch(pro.c4, metaSearchQuery) ||
            matchSearch(pro.c5, metaSearchQuery);

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
            ${pro.c5 ? `
            <div class="meta-field-row">
                <span class="meta-field-label">Ghi chú:</span>
                <div class="meta-field-value" contenteditable="true" data-field="c5">${pro.c5 || ''}</div>
            </div>` : ''}
        `;

        card.querySelectorAll('.meta-field-value').forEach(fieldEl => {
            fieldEl.addEventListener('input', (e) => {
                const f = e.target.dataset.field;
                metadata.pronouns[origIndex][f] = e.target.innerHTML;
                handleMetaTypingInput();
                debounceMetaSave();
            });
        });

        card.querySelector('.btn-card-del')?.addEventListener('click', (e) => {
            e.stopPropagation();
            activeInfoRows.pronouns = origIndex;
            deletePronounRow();
        });

        container.appendChild(card);
    });

    if (matchCount === 0 && list.length > 0) {
        container.innerHTML = '<div class="meta-no-result">Không tìm thấy thông tin phù hợp.</div>';
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

function deletePronounRow() {
    const idx = activeInfoRows.pronouns;
    if (idx >= 0 && metadata.pronouns && idx < metadata.pronouns.length) {
        if (confirm(`Xóa Cặp xưng hô ${idx + 1}?`)) {
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
// 3. RENDER THỐNG NHẤT TỪ NGỮ (DẠNG DÒNG: Hán = Tên đổi)
// =========================================================================
function renderTerms() {
    const container = document.getElementById('body-terms');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.terms || [];
    let matchCount = 0;

    list.forEach((term, origIndex) => {
        const isMatch = !metaSearchQuery || 
            matchSearch(term.c1, metaSearchQuery) ||
            matchSearch(term.c2, metaSearchQuery);

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

        item.querySelector('.btn-card-del')?.addEventListener('click', (e) => {
            e.stopPropagation();
            activeInfoRows.terms = origIndex;
            deleteTermRow();
        });

        container.appendChild(item);
    });

    if (matchCount === 0 && list.length > 0) {
        container.innerHTML = '<div class="meta-no-result">Không tìm thấy thông tin phù hợp.</div>';
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

function deleteTermRow() {
    const idx = activeInfoRows.terms;
    if (idx >= 0 && metadata.terms && idx < metadata.terms.length) {
        if (confirm("Xóa dòng thuật ngữ đang chọn?")) {
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
    document.getElementById('btn-delete-char')?.addEventListener('click', deleteCharacterRow);
    
    document.getElementById('btn-add-pro')?.addEventListener('click', () => { saveMetaUndoState(); addPronounRow(); });
    document.getElementById('btn-delete-pro')?.addEventListener('click', deletePronounRow);
    
    document.getElementById('btn-add-term')?.addEventListener('click', () => { saveMetaUndoState(); addTermRow(); });
    document.getElementById('btn-delete-term')?.addEventListener('click', deleteTermRow);

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

    // SỰ KIỆN TÌM KIẾM THỜI GIAN THỰC
    const searchInput = document.getElementById('meta-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-meta-search');

    searchInput?.addEventListener('input', (e) => {
        metaSearchQuery = e.target.value;
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

    // =========================================================================
    // SỰ KIỆN CLICK ĐỂ ĐÓNG/MỞ TỪNG MỤC (SỬ DỤNG EVENT DELEGATION CHỐNG LỖI 100%)
    // =========================================================================
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