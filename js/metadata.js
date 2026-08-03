// =========================================================================
// QUẢN LÝ THÔNG TIN TRUYỆN (MỤC 2) - TƯƠNG THÍCH CHUẨN ĐỊNH DẠNG JSON
// =========================================================================

// Hàm chuẩn hóa dữ liệu thông minh (Đọc tốt cả khóa c1..c5 lẫn cn/vi)
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
    // Tự động chuẩn hóa dữ liệu nếu cần
    if (metadata) {
        metadata = normalizeMetadata(metadata);
    }

    const titleInput = document.getElementById('story-title-input');
    if (titleInput) titleInput.value = metadata.title || '';
    
    renderCharacters();
    renderPronouns();
    renderTerms();
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
    let history = JSON.parse(localStorage.getItem('metadataHistory')) || [];
    const currentMetaCopy = JSON.parse(JSON.stringify(metadata));
    if (history.length > 0) {
        if (JSON.stringify(history[history.length - 1].data) === JSON.stringify(currentMetaCopy)) return;
    }
    history.push({ 
        timestamp: Date.now(), 
        rowCount: (metadata.characters?.length || 0) + (metadata.pronouns?.length || 0) + (metadata.terms?.length || 0), 
        data: currentMetaCopy 
    });
    if (history.length > 15) history.shift();
    localStorage.setItem('metadataHistory', JSON.stringify(history));
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

function selectInfoRow(tr, section) {
    tr.parentNode.querySelectorAll('tr').forEach(r => r.classList.remove('active-info-row'));
    tr.classList.add('active-info-row');
    activeInfoRows[section] = parseInt(tr.dataset.index);
}

function initMetadataEvents() {
    document.getElementById('story-title-input')?.addEventListener('input', (e) => {
        handleMetaTypingInput();
        metadata.title = e.target.value;
        debounceMetaSave();
    });

    document.getElementById('btn-add-char')?.addEventListener('click', () => { saveMetaUndoState(); addCharacterRow(); });
    document.getElementById('btn-delete-char')?.addEventListener('click', deleteCharacterRow);
    
    document.getElementById('btn-add-pro')?.addEventListener('click', () => { saveMetaUndoState(); addPronounRow(); });
    document.getElementById('btn-delete-pro')?.addEventListener('click', deletePronounRow);
    
    document.getElementById('btn-add-term')?.addEventListener('click', () => { saveMetaUndoState(); addTermRow(); });
    document.getElementById('btn-delete-term')?.addEventListener('click', deleteTermRow);

    document.getElementById('btn-export-meta')?.addEventListener('click', exportMetadata);
    
    const metaFileIn = document.getElementById('metadata-file-input');
    document.getElementById('btn-import-meta')?.addEventListener('click', () => metaFileIn?.click());
    metaFileIn?.addEventListener('change', handleMetadataImport);

    document.getElementById('btn-meta-undo')?.addEventListener('click', metaUndo);
    document.getElementById('btn-meta-redo')?.addEventListener('click', metaRedo);
    
    document.getElementById('btn-history-meta-show')?.addEventListener('click', () => {
        if (typeof openHistoryModal === 'function') {
            openHistoryModal('meta');
        }
    });
}

function renderCharacters() {
    const tbodyChar = document.getElementById('body-characters');
    if (!tbodyChar) return;
    tbodyChar.innerHTML = '';
    (metadata.characters || []).forEach((char, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        const fields = ['c1', 'c2', 'c3', 'c4', 'c5'];
        fields.forEach(field => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerHTML = char[field] || '';
            td.addEventListener('input', (e) => {
                metadata.characters[index][field] = e.target.innerHTML;
                handleMetaTypingInput();
                debounceMetaSave();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'characters'));
            tr.appendChild(td);
        });
        tbodyChar.appendChild(tr);
    });
}

function addCharacterRow() {
    if (!metadata.characters) metadata.characters = [];
    metadata.characters.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
    debounceMetaSave();
    renderCharacters();
}

function deleteCharacterRow() {
    const idx = activeInfoRows.characters;
    if (idx >= 0 && metadata.characters && idx < metadata.characters.length) {
        if (confirm("Xóa dòng nhân vật đang chọn?")) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.characters.splice(idx, 1);
            if (metadata.characters.length === 0) {
                metadata.characters.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
            }
            activeInfoRows.characters = -1;
            debounceMetaSave();
            renderCharacters();
            showToast('🗑️ Đã xóa dòng nhân vật!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một dòng trong bảng Nhân vật để xóa!');
    }
}

function renderPronouns() {
    const tbodyPro = document.getElementById('body-pronouns');
    if (!tbodyPro) return;
    tbodyPro.innerHTML = '';
    (metadata.pronouns || []).forEach((pro, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        const fields = ['c1', 'c2', 'c3', 'c4', 'c5'];
        fields.forEach(field => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerHTML = pro[field] || '';
            td.addEventListener('input', (e) => {
                metadata.pronouns[index][field] = e.target.innerHTML;
                handleMetaTypingInput();
                debounceMetaSave();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'pronouns'));
            tr.appendChild(td);
        });
        tbodyPro.appendChild(tr);
    });
}

function addPronounRow() {
    if (!metadata.pronouns) metadata.pronouns = [];
    metadata.pronouns.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
    debounceMetaSave();
    renderPronouns();
}

function deletePronounRow() {
    const idx = activeInfoRows.pronouns;
    if (idx >= 0 && metadata.pronouns && idx < metadata.pronouns.length) {
        if (confirm("Xóa dòng xưng hô đang chọn?")) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.pronouns.splice(idx, 1);
            if (metadata.pronouns.length === 0) {
                metadata.pronouns.push({ c1: '', c2: '', c3: '', c4: '', c5: '' });
            }
            activeInfoRows.pronouns = -1;
            debounceMetaSave();
            renderPronouns();
            showToast('🗑️ Đã xóa dòng xưng hô!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một dòng trong bảng Xưng hô để xóa!');
    }
}

function renderTerms() {
    const tbodyTerm = document.getElementById('body-terms');
    if (!tbodyTerm) return;
    tbodyTerm.innerHTML = '';
    (metadata.terms || []).forEach((term, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        const fields = ['c1', 'c2'];
        fields.forEach(field => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.innerHTML = term[field] || '';
            td.addEventListener('input', (e) => {
                metadata.terms[index][field] = e.target.innerHTML;
                handleMetaTypingInput();
                debounceMetaSave();
            });
            td.addEventListener('focus', () => selectInfoRow(tr, 'terms'));
            tr.appendChild(td);
        });
        tbodyTerm.appendChild(tr);
    });
}

function addTermRow() {
    if (!metadata.terms) metadata.terms = [];
    metadata.terms.push({ c1: '', c2: '' });
    debounceMetaSave();
    renderTerms();
}

function deleteTermRow() {
    const idx = activeInfoRows.terms;
    if (idx >= 0 && metadata.terms && idx < metadata.terms.length) {
        if (confirm("Xóa dòng từ ngữ đang chọn?")) {
            saveMetaUndoState();
            addMetaHistoryEntry();
            metadata.terms.splice(idx, 1);
            if (metadata.terms.length === 0) {
                metadata.terms.push({ c1: '', c2: '' });
            }
            activeInfoRows.terms = -1;
            debounceMetaSave();
            renderTerms();
            showToast('🗑️ Đã xóa dòng từ ngữ!', 'var(--btn-danger)');
        }
    } else {
        alert('Vui lòng click chọn một dòng trong bảng Thống nhất từ ngữ để xóa!');
    }
}

function exportMetadata() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metadata, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "thong_tin_truyen_" + (metadata.title ? metadata.title.replace(/\s+/g, '_') : "export") + ".json");
    dlAnchor.click();
    showToast('💾 Đã xuất file thông tin truyện!', 'var(--btn-success)');
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
                addMetaHistoryEntry();
                
                // Chuẩn hóa dữ liệu tương thích c1, c2, c3...
                metadata = normalizeMetadata(imported);
                
                debounceMetaSave();
                renderMetadata();
                showToast('📂 Nhập thông tin truyện thành công!', 'var(--btn-success)');
            } else {
                alert("Định dạng file không khớp!");
            }
        } catch (err) { alert("Lỗi đọc cấu hình: " + err); }
    };
    reader.readAsText(file);
    event.target.value = ''; 
}