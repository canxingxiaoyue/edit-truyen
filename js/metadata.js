// =========================================================================
// QUẢN LÝ MỤC 2: THÔNG TIN TRUYỆN (METADATA MANAGER)
// HỖ TRỢ ĐẦY ĐỦ: LƯU/MỞ FILE JSON, TÌM KIẾM, HOÀN TÁC VÀ GẬP MỞ
// =========================================================================

let metaSaveTimeout = null;

// 1. LƯU DỮ LIỆU METADATA XUỐNG LOCALSTORAGE
function saveMetadataImmediately() {
    syncActiveMetaInput();

    const titleInput = document.getElementById('story-title-input');
    if (titleInput) {
        metadata.title = titleInput.value.trim();
    }

    try {
        localStorage.setItem('storyMetadata', JSON.stringify(metadata));

        // Nếu đang mở một dự án cụ thể, đồng bộ luôn metadata vào dự án đó
        if (typeof currentProjectId !== 'undefined' && currentProjectId) {
            const rawProj = localStorage.getItem('savedProjects_v2') || localStorage.getItem('savedProjects');
            if (rawProj) {
                let projects = JSON.parse(rawProj);
                if (Array.isArray(projects)) {
                    const idx = projects.findIndex(p => p.id === currentProjectId);
                    if (idx >= 0) {
                        projects[idx].metadata = metadata;
                        projects[idx].storyTitle = metadata.title || projects[idx].storyTitle;
                        projects[idx].updatedAt = Date.now();
                        localStorage.setItem('savedProjects_v2', JSON.stringify(projects));
                    }
                }
            }
        }
    } catch (e) {
        console.error("Lỗi lưu storyMetadata:", e);
    }
}

function debounceSaveMetadata() {
    clearTimeout(metaSaveTimeout);
    metaSaveTimeout = setTimeout(() => {
        saveMetadataImmediately();
    }, 400);
}

// Ép đồng bộ ô đang gõ dở vào biến metadata
function syncActiveMetaInput() {
    const activeEl = document.activeElement;
    if (!activeEl) return;

    const block = activeEl.closest('.meta-card-block') || activeEl.closest('.term-line-item');
    if (!block) return;

    const type = block.dataset.type;
    const index = parseInt(block.dataset.index, 10);
    const field = activeEl.dataset.field;

    if (type && !isNaN(index) && field && metadata[type] && metadata[type][index]) {
        metadata[type][index][field] = activeEl.innerText.trim();
    }
}

// 2. XUẤT FILE THÔNG TIN (.JSON) VỀ MÁY
function exportMetadataJSON() {
    syncActiveMetaInput();

    const titleInput = document.getElementById('story-title-input');
    const storyTitle = (titleInput?.value.trim()) || metadata.title || 'Thong_Tin_Truyen';

    const exportPayload = {
        app: "công cụ edit",
        type: "story-metadata",
        version: "2.0",
        exportedAt: new Date().toISOString(),
        title: storyTitle,
        metadata: {
            title: storyTitle,
            characters: Array.isArray(metadata.characters) ? metadata.characters : [],
            pronouns: Array.isArray(metadata.pronouns) ? metadata.pronouns : [],
            terms: Array.isArray(metadata.terms) ? metadata.terms : []
        }
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (storyTitle || 'Thong_Tin_Truyen').replace(/[\/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
    a.download = `${safeTitle}_thong_tin.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') {
        showToast(`💾 Đã xuất file "${a.download}" thành công!`, 'var(--btn-success)');
    }
}

// 3. MỞ VÀ NẠP FILE THÔNG TIN (.JSON) TỪ MÁY
function triggerImportMetadata() {
    let fileInput = document.getElementById('metadata-file-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'metadata-file-input';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }
    fileInput.value = ''; // Reset để chọn lại file cũ vẫn ăn sự kiện change
    fileInput.click();
}

function handleMetadataFileImport(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const rawContent = e.target.result;
            const parsed = JSON.parse(rawContent);

            let newMeta = null;
            let newTitle = '';

            // Hỗ trợ đa dạng cấu trúc tệp JSON (File metadata độc lập hoặc File dự án đầy đủ)
            if (parsed.metadata && typeof parsed.metadata === 'object') {
                newMeta = parsed.metadata;
                newTitle = parsed.title || parsed.metadata.title || '';
            } else if (parsed.characters || parsed.pronouns || parsed.terms) {
                newMeta = parsed;
                newTitle = parsed.title || '';
            } else if (Array.isArray(parsed)) {
                newMeta = { characters: parsed, pronouns: [], terms: [] };
            }

            if (!newMeta) {
                throw new Error("Tệp JSON không chứa dữ liệu thông tin truyện hợp lệ!");
            }

            if (typeof pushToCloudHistory === 'function') {
                pushToCloudHistory('meta', metadata);
            }

            metadata = {
                title: newTitle || newMeta.title || '',
                characters: Array.isArray(newMeta.characters) ? newMeta.characters : [],
                pronouns: Array.isArray(newMeta.pronouns) ? newMeta.pronouns : [],
                terms: Array.isArray(newMeta.terms) ? newMeta.terms : []
            };

            // Đảm bảo không bị rỗng mảng
            if (metadata.characters.length === 0) metadata.characters.push({ cn: '', vi: '', called: '', desc: '', pronoun3: '' });
            if (metadata.pronouns.length === 0) metadata.pronouns.push({ a: '', b: '', ab: '', ba: '', note: '' });
            if (metadata.terms.length === 0) metadata.terms.push({ orig: '', changed: '' });

            saveMetadataImmediately();

            const titleInput = document.getElementById('story-title-input');
            if (titleInput) titleInput.value = metadata.title || '';

            renderMetadata();

            if (typeof showToast === 'function') {
                showToast(`📂 Đã nạp thành công thông tin truyện từ "${file.name}"!`, 'var(--btn-success)');
            }
        } catch (err) {
            console.error("Lỗi nạp metadata JSON:", err);
            alert("❌ Lỗi đọc file JSON: " + err.message);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

// 4. HIỂN THỊ TOÀN BỘ GIAO DIỆN MỤC 2
function renderMetadata(filterText = '') {
    renderCharacters(filterText);
    renderPronouns(filterText);
    renderTerms(filterText);

    const titleInput = document.getElementById('story-title-input');
    if (titleInput && typeof metadata !== 'undefined' && metadata.title) {
        if (titleInput.value !== metadata.title) {
            titleInput.value = metadata.title;
        }
    }
}

// A. BẢNG NHÂN VẬT
function renderCharacters(filterText = '') {
    const container = document.getElementById('body-characters');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.characters || [];
    const query = filterText.toLowerCase().trim();

    list.forEach((char, idx) => {
        const match = !query || 
            (char.cn || '').toLowerCase().includes(query) ||
            (char.vi || '').toLowerCase().includes(query) ||
            (char.called || '').toLowerCase().includes(query) ||
            (char.desc || '').toLowerCase().includes(query);

        if (!match) return;

        const card = document.createElement('div');
        card.className = `meta-card-block ${activeInfoRows.characters === idx ? 'active-info-card' : ''}`;
        card.dataset.type = 'characters';
        card.dataset.index = idx;

        card.innerHTML = `
            <div class="meta-card-header">
                <span>👤 Nhân vật ${idx + 1}</span>
                <button type="button" class="btn-card-del" onclick="deleteMetaItem('characters', ${idx})" title="Xóa nhân vật này">🗑️</button>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Tên tiếng Trung:</span>
                <div class="meta-field-value" contenteditable="true" data-field="cn">${escapeHTML(char.cn || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Tên tiếng Việt:</span>
                <div class="meta-field-value" contenteditable="true" data-field="vi">${escapeHTML(char.vi || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Cách gọi khác / Tên thân mật:</span>
                <div class="meta-field-value" contenteditable="true" data-field="called">${escapeHTML(char.called || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Giới tính, thân phận, đặc điểm:</span>
                <div class="meta-field-value" contenteditable="true" data-field="desc">${escapeHTML(char.desc || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Xưng hô ngôi 3 (hắn/gã/y/cô):</span>
                <div class="meta-field-value" contenteditable="true" data-field="pronoun3">${escapeHTML(char.pronoun3 || '')}</div>
            </div>
        `;

        card.addEventListener('click', () => {
            activeInfoRows.characters = idx;
            document.querySelectorAll('#body-characters .meta-card-block').forEach(c => c.classList.remove('active-info-card'));
            card.classList.add('active-info-card');
        });

        card.querySelectorAll('.meta-field-value').forEach(el => {
            el.addEventListener('input', (e) => {
                const f = e.target.dataset.field;
                char[f] = e.target.innerText.trim();
                debounceSaveMetadata();
            });
        });

        container.appendChild(card);
    });
}

// B. BẢNG XƯNG HÔ
function renderPronouns(filterText = '') {
    const container = document.getElementById('body-pronouns');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.pronouns || [];
    const query = filterText.toLowerCase().trim();

    list.forEach((pro, idx) => {
        const match = !query ||
            (pro.a || '').toLowerCase().includes(query) ||
            (pro.b || '').toLowerCase().includes(query) ||
            (pro.ab || '').toLowerCase().includes(query) ||
            (pro.ba || '').toLowerCase().includes(query) ||
            (pro.note || '').toLowerCase().includes(query);

        if (!match) return;

        const card = document.createElement('div');
        card.className = `meta-card-block ${activeInfoRows.pronouns === idx ? 'active-info-card' : ''}`;
        card.dataset.type = 'pronouns';
        card.dataset.index = idx;

        card.innerHTML = `
            <div class="meta-card-header">
                <span>👥 Cặp xưng hô ${idx + 1}</span>
                <button type="button" class="btn-card-del" onclick="deleteMetaItem('pronouns', ${idx})" title="Xóa cặp xưng hô này">🗑️</button>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Nhân vật A:</span>
                <div class="meta-field-value" contenteditable="true" data-field="a">${escapeHTML(pro.a || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Nhân vật B:</span>
                <div class="meta-field-value" contenteditable="true" data-field="b">${escapeHTML(pro.b || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">A gọi B là:</span>
                <div class="meta-field-value" contenteditable="true" data-field="ab">${escapeHTML(pro.ab || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">B gọi A là:</span>
                <div class="meta-field-value" contenteditable="true" data-field="ba">${escapeHTML(pro.ba || '')}</div>
            </div>
            <div class="meta-field-row">
                <span class="meta-field-label">Quan hệ / Hoàn cảnh:</span>
                <div class="meta-field-value" contenteditable="true" data-field="note">${escapeHTML(pro.note || '')}</div>
            </div>
        `;

        card.addEventListener('click', () => {
            activeInfoRows.pronouns = idx;
            document.querySelectorAll('#body-pronouns .meta-card-block').forEach(c => c.classList.remove('active-info-card'));
            card.classList.add('active-info-card');
        });

        card.querySelectorAll('.meta-field-value').forEach(el => {
            el.addEventListener('input', (e) => {
                const f = e.target.dataset.field;
                pro[f] = e.target.innerText.trim();
                debounceSaveMetadata();
            });
        });

        container.appendChild(card);
    });
}

// C. BẢNG THỐNG NHẤT TỪ NGỮ
function renderTerms(filterText = '') {
    const container = document.getElementById('body-terms');
    if (!container) return;
    container.innerHTML = '';

    const list = metadata.terms || [];
    const query = filterText.toLowerCase().trim();

    list.forEach((term, idx) => {
        const match = !query ||
            (term.orig || '').toLowerCase().includes(query) ||
            (term.changed || '').toLowerCase().includes(query);

        if (!match) return;

        const row = document.createElement('div');
        row.className = `term-line-item ${activeInfoRows.terms === idx ? 'active-info-card' : ''}`;
        row.dataset.type = 'terms';
        row.dataset.index = idx;

        row.innerHTML = `
            <div class="term-part-cn" contenteditable="true" data-field="orig" placeholder="Từ gốc tiếng Trung...">${escapeHTML(term.orig || '')}</div>
            <span class="term-equal-sign">=</span>
            <div class="term-part-vi" contenteditable="true" data-field="changed" placeholder="Thống nhất đổi thành...">${escapeHTML(term.changed || '')}</div>
            <button type="button" class="btn-card-del" onclick="deleteMetaItem('terms', ${idx})" title="Xóa từ ngữ này">🗑️</button>
        `;

        row.addEventListener('click', () => {
            activeInfoRows.terms = idx;
            document.querySelectorAll('#body-terms .term-line-item').forEach(r => r.classList.remove('active-info-card'));
            row.classList.add('active-info-card');
        });

        row.querySelectorAll('[contenteditable="true"]').forEach(el => {
            el.addEventListener('input', (e) => {
                const f = e.target.dataset.field;
                term[f] = e.target.innerText.trim();
                debounceSaveMetadata();
            });
        });

        container.appendChild(row);
    });
}

// 5. THÊM VÀ XÓA MỤC
function addMetaItem(type) {
    if (!metadata[type]) metadata[type] = [];

    if (type === 'characters') {
        metadata.characters.unshift({ cn: '', vi: '', called: '', desc: '', pronoun3: '' });
        activeInfoRows.characters = 0;
    } else if (type === 'pronouns') {
        metadata.pronouns.unshift({ a: '', b: '', ab: '', ba: '', note: '' });
        activeInfoRows.pronouns = 0;
    } else if (type === 'terms') {
        metadata.terms.unshift({ orig: '', changed: '' });
        activeInfoRows.terms = 0;
    }

    renderMetadata();
    debounceSaveMetadata();
}

function deleteMetaItem(type, idx) {
    if (confirm("🗑️ Bạn có chắc muốn xóa mục này?")) {
        metadata[type].splice(idx, 1);
        if (metadata[type].length === 0) {
            addMetaItem(type);
        } else {
            renderMetadata();
            debounceSaveMetadata();
        }
        if (typeof showToast === 'function') showToast("🗑️ Đã xóa mục thành công!", "var(--btn-danger)");
    }
}

// 6. SAO CHÉP DỮ LIỆU TỪNG MỤC HOẶC TOÀN BỘ
function copyMetaSection(type) {
    let text = '';
    if (type === 'characters') {
        text = (metadata.characters || []).map(c => `【${c.cn || ''}】${c.vi || ''}\n- Tên khác: ${c.called || ''}\n- Thân phận: ${c.desc || ''}\n- Ngôi 3: ${c.pronoun3 || ''}`).join('\n\n');
    } else if (type === 'pronouns') {
        text = (metadata.pronouns || []).map(p => `【${p.a || ''} - ${p.b || ''}】\n- A gọi B: ${p.ab || ''}\n- B gọi A: ${p.ba || ''}\n- Quan hệ: ${p.note || ''}`).join('\n\n');
    } else if (type === 'terms') {
        text = (metadata.terms || []).map(t => `${t.orig || ''}=${t.changed || ''}`).join('\n');
    }

    if (!text.trim()) {
        if (typeof showToast === 'function') showToast("⚠️ Mục này hiện chưa có nội dung!", "var(--btn-warning)");
        return;
    }

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast("📋 Đã sao chép nội dung mục!", "var(--btn-success)");
        });
    }
}

function copyAllMetadata() {
    const t = metadata.title ? `TÊN TRUYỆN: ${metadata.title}\n====================\n\n` : '';
    const chars = "1. NHÂN VẬT TRONG TRUYỆN:\n" + (metadata.characters || []).map(c => `【${c.cn || ''}】${c.vi || ''} (${c.called || ''}) - ${c.desc || ''}`).join('\n');
    const pros = "\n\n2. CÁCH XƯNG HÔ:\n" + (metadata.pronouns || []).map(p => `【${p.a || ''} ↔ ${p.b || ''}】: A gọi B (${p.ab || ''}) | B gọi A (${p.ba || ''})`).join('\n');
    const terms = "\n\n3. THỐNG NHẤT TỪ NGỮ:\n" + (metadata.terms || []).map(t => `${t.orig || ''}=${t.changed || ''}`).join('\n');

    const full = t + chars + pros + terms;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(full).then(() => {
            if (typeof showToast === 'function') showToast("📋 Đã sao chép toàn bộ thông tin truyện!", "var(--btn-success)");
        });
    }
}

// 7. KHỞI TẠO VÀ GÁN SỰ KIỆN CHO TAB 2
function initMetadataEvents() {
    // A. SỰ KIỆN LƯU & MỞ FILE JSON (ĐÃ KÍCH HOẠT CHUẨN XÁC)
    document.getElementById('btn-export-meta')?.addEventListener('click', (e) => {
        e.preventDefault();
        exportMetadataJSON();
    });

    document.getElementById('btn-import-meta')?.addEventListener('click', (e) => {
        e.preventDefault();
        triggerImportMetadata();
    });

    document.getElementById('metadata-file-input')?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleMetadataFileImport(e.target.files[0]);
        }
    });

    // B. TIÊU ĐỀ TRUYỆN
    document.getElementById('story-title-input')?.addEventListener('input', (e) => {
        metadata.title = e.target.value;
        debounceSaveMetadata();
    });

    // C. CÁC NÚT THÊM & COPY
    document.getElementById('btn-add-char')?.addEventListener('click', () => addMetaItem('characters'));
    document.getElementById('btn-add-pro')?.addEventListener('click', () => addMetaItem('pronouns'));
    document.getElementById('btn-add-term')?.addEventListener('click', () => addMetaItem('terms'));

    document.getElementById('btn-copy-chars')?.addEventListener('click', () => copyMetaSection('characters'));
    document.getElementById('btn-copy-pros')?.addEventListener('click', () => copyMetaSection('pronouns'));
    document.getElementById('btn-copy-terms')?.addEventListener('click', () => copyMetaSection('terms'));
    document.getElementById('btn-copy-all-meta')?.addEventListener('click', copyAllMetadata);

    // D. LÀM MỚI METADATA
    document.getElementById('btn-reset-meta')?.addEventListener('click', () => {
        if (confirm("⚠️ Bạn có chắc muốn LÀM MỚI toàn bộ thông tin truyện? Bản cũ sẽ được lưu vào Lịch sử.")) {
            if (typeof pushToCloudHistory === 'function') pushToCloudHistory('meta', metadata);

            metadata = {
                title: '',
                characters: [{ cn: '', vi: '', called: '', desc: '', pronoun3: '' }],
                pronouns: [{ a: '', b: '', ab: '', ba: '', note: '' }],
                terms: [{ orig: '', changed: '' }]
            };
            const titleInput = document.getElementById('story-title-input');
            if (titleInput) titleInput.value = '';

            renderMetadata();
            saveMetadataImmediately();
            if (typeof showToast === 'function') showToast("🔄 Đã làm mới thông tin truyện!", "var(--btn-warning)");
        }
    });

    // E. TÌM KIẾM THỜI GIAN THỰC
    const searchInput = document.getElementById('meta-search-input');
    const clearBtn = document.getElementById('btn-clear-meta-search');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            renderMetadata(val);
            if (clearBtn) clearBtn.style.display = val ? 'inline-block' : 'none';
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            renderMetadata('');
            clearBtn.style.display = 'none';
            searchInput?.focus();
        });
    }

    // F. GẬP / MỞ CÁC BOX THÔNG TIN
    document.querySelectorAll('.section-collapse-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            const box = e.currentTarget.closest('.story-section-box');
            if (box) {
                box.classList.toggle('collapsed');
            }
        });
    });
}

// BỘ BẮT SỰ KIỆN DỰ PHÒNG TOÀN CỤC (FAIL-SAFE) ĐẢM BẢO NÚT BẤM LUÔN CHẠY
document.addEventListener('click', (e) => {
    // Nút Lưu thông tin (.JSON)
    if (e.target && (e.target.id === 'btn-export-meta' || e.target.closest('#btn-export-meta'))) {
        e.preventDefault();
        exportMetadataJSON();
        return;
    }

    // Nút Mở file thông tin
    if (e.target && (e.target.id === 'btn-import-meta' || e.target.closest('#btn-import-meta'))) {
        e.preventDefault();
        triggerImportMetadata();
        return;
    }
});

// XUẤT CÁC HÀM RA WINDOW
window.renderMetadata = renderMetadata;
window.initMetadataEvents = initMetadataEvents;
window.exportMetadataJSON = exportMetadataJSON;
window.triggerImportMetadata = triggerImportMetadata;
window.addMetaItem = addMetaItem;
window.deleteMetaItem = deleteMetaItem;

// TỰ ĐỘNG KHỞI CHẠY AN TOÀN
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try { initMetadataEvents(); } catch (e) {}
    });
} else {
    try { initMetadataEvents(); } catch (e) {}
}