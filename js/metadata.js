// =========================================================================
// QUẢN LÝ THÔNG TIN TRUYỆN (MỤC 2) - TÌM KIẾM ĐỘC LẬP & TEXT TẠO BẢNG CHUYÊN SÂU
// =========================================================================

// KHỞI TẠO STATE AN TOÀN (CHỐNG CRASH BỞI LỖI "Unexpected token u in JSON")
let metadata;
try {
    const rawData = localStorage.getItem('storyMetadata');
    metadata = rawData ? JSON.parse(rawData) : null;
    if (!metadata || typeof metadata !== 'object') throw new Error("Data invalid");
} catch (e) {
    console.warn("Dữ liệu Thông tin truyện trống hoặc lỗi định dạng, khởi tạo mới.");
    metadata = {
        title: '',
        characters: [{ c1: '', c2: '', c3: '', c4: '', c5: '' }],
        pronouns: [{ c1: '', c2: '', c3: '', c4: '', c5: '' }],
        terms: [{ c1: '', c2: '' }]
    };
}

// CÁC BIẾN STATE
let activeInfoRows = { characters: -1, pronouns: -1, terms: -1 };
let metaUndoStack = [];
let metaRedoStack = [];
let metaTypingUndoTimeout = null;
let metaIsTyping = false;
let lastMetaHistoryTime = 0;

let searchCharsQuery = '';
let searchPronounsQuery = '';
let searchTermsQuery = '';
let metaSearchQuery = ''; 

// 1. TỰ ĐỘNG TIÊM CSS CHO THANH TÌM KIẾM TỪNG MỤC VÀ MODAL NHẬP VĂN XUÔI
(function injectMetadataStyles() {
    const STYLE_ID = 'metadata-custom-styles';
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }

    style.textContent = `
        /* Thanh tìm kiếm độc lập từng mục */
        .section-search-bar-wrap { padding: 8px 12px; background: var(--bg-card, #ffffff); border-bottom: 1px solid var(--border-color, #e2e8f0); position: sticky; top: 0; z-index: 5; }
        .section-search-inner { display: flex; align-items: center; gap: 8px; background: var(--bg-input, #f8fafc); border: 1px solid var(--border-color, #cbd5e1); border-radius: 8px; padding: 5px 10px; transition: all 0.15s ease; }
        .section-search-inner:focus-within { border-color: #3b82f6; background: #ffffff; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
        .section-search-icon { font-size: 13px; color: var(--text-muted, #64748b); user-select: none; }
        .section-search-input, #meta-search-input { flex: 1; border: none; background: transparent; outline: none; font-size: 13.5px; color: inherit; font-family: inherit !important; padding: 2px 0; }
        .section-search-input::placeholder, #meta-search-input::placeholder { font-family: inherit !important; color: var(--text-muted, #94a3b8); opacity: 0.85; }
        .btn-clear-section-search { background: none; border: none; color: var(--text-muted, #94a3b8); font-size: 16px; cursor: pointer; line-height: 1; padding: 0 4px; }
        .btn-clear-section-search:hover { color: #ef4444; }
        .meta-no-result { padding: 20px; text-align: center; font-size: 13px; font-family: inherit !important; color: var(--text-muted, #64748b); background: var(--bg-card, #ffffff); border-radius: 8px; margin: 8px; border: 1px dashed var(--border-color, #cbd5e1); }

        /* Nút Text tạo bảng */
        .btn-prose-import-trigger { background: linear-gradient(135deg, #0284c7, #0369a1) !important; color: #ffffff !important; font-weight: 600 !important; border: none !important; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25); }
        .btn-prose-import-trigger:hover { background: linear-gradient(135deg, #0369a1, #075985) !important; transform: translateY(-1px); }

        /* Chuyên biệt cho Text Tạo Bảng Modal */
        .prose-textarea-wrap { position: relative; }
        .prose-textarea { width: 100%; height: 210px; box-sizing: border-box; font-family: monospace; font-size: 13px; padding: 10px; border: 2px dashed var(--border-color, #cbd5e1); border-radius: 8px; resize: vertical; outline: none; background: var(--bg-input, #ffffff); color: inherit; transition: all 0.2s; }
        .prose-textarea:focus { border-color: #3b82f6; border-style: solid; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
        .prose-textarea.drag-over { border-color: #10b981; background: rgba(16, 185, 129, 0.05); }
        
        .btn-clear-textarea { position: absolute; top: 10px; right: 20px; background: rgba(0,0,0,0.4); color: #fff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: 0.2s; z-index: 10; }
        .btn-clear-textarea:hover { background: #ef4444; }
        
        .prose-preview-box { max-height: 250px; overflow-y: auto; background: var(--bg-tool-group, rgba(248, 250, 252, 0.9)); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 12px; font-size: 13px; }
        .preview-list { list-style: none; margin: 0 0 10px 10px; padding: 0; }
        .preview-list li { position: relative; padding-left: 12px; margin-bottom: 4px; color: var(--text-color); }
        .preview-list li::before { content: '•'; position: absolute; left: 0; color: #3b82f6; font-weight: bold; }
        .warning-item { cursor: pointer; color: #b45309; padding: 4px; border-radius: 4px; transition: 0.2s; display: block; }
        .warning-item:hover { background: rgba(245, 158, 11, 0.2); }
        .warning-item b { display: inline-block; width: 60px; }
    `;
})();

// ================= CÁC HÀM TIỆN ÍCH & QUẢN LÝ DỮ LIỆU =================
function stripAccents(str) { return (str||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim(); }
function matchSearch(text, query) {
    if (!query) return true;
    if (!text) return false;
    const tLower = String(text).toLowerCase(); const qLower = query.toLowerCase().trim();
    if (tLower.includes(qLower)) return true;
    return stripAccents(tLower).includes(stripAccents(qLower));
}

function normalizeMetadata(imported) {
    if (!imported) return { title: '', characters: [], pronouns: [], terms: [] };
    return {
        title: imported.title || '',
        characters: (imported.characters || []).map(item => ({ c1: item.c1||item.cn||'', c2: item.c2||item.vi||'', c3: item.c3||item.called||'', c4: item.c4||item.desc||'', c5: item.c5||item.pronoun3||'' })),
        pronouns: (imported.pronouns || []).map(item => ({ c1: item.c1||item.a||'', c2: item.c2||item.b||'', c3: item.c3||item.ab||'', c4: item.c4||item.ba||'', c5: item.c5||item.note||'' })),
        terms: (imported.terms || []).map(item => ({ c1: item.c1||item.orig||'', c2: item.c2||item.changed||'' }))
    };
}

function saveMetadata() { localStorage.setItem('storyMetadata', JSON.stringify(metadata)); }
function updateUndoRedoButtonsState() {
    try {
        const u = document.getElementById('btn-meta-undo'), r = document.getElementById('btn-meta-redo');
        if (u) u.disabled = metaUndoStack.length === 0;
        if (r) r.disabled = metaRedoStack.length === 0;
    } catch(e){}
}
function saveMetaUndoState() {
    const s = JSON.stringify(metadata);
    if (metaUndoStack.length > 0 && metaUndoStack[metaUndoStack.length - 1] === s) return;
    metaUndoStack.push(s); if (metaUndoStack.length > 50) metaUndoStack.shift();
    metaRedoStack = []; updateUndoRedoButtonsState();
}
function handleMetaTypingInput() {
    if (!metaIsTyping) { saveMetaUndoState(); metaIsTyping = true; }
    clearTimeout(metaTypingUndoTimeout);
    metaTypingUndoTimeout = setTimeout(() => { saveMetaUndoState(); metaIsTyping = false; }, 1000);
}
let metaSaveTimeout;
function debounceMetaSave() {
    clearTimeout(metaSaveTimeout);
    metaSaveTimeout = setTimeout(() => {
        saveMetadata();
        if (Date.now() - lastMetaHistoryTime > 15000) { if(typeof pushToCloudHistory === 'function') pushToCloudHistory('meta', metadata); lastMetaHistoryTime = Date.now(); }
    }, 500);
}

function metaUndo() {
    if (metaUndoStack.length === 0) return;
    if (metaIsTyping) { clearTimeout(metaTypingUndoTimeout); saveMetaUndoState(); metaIsTyping = false; }
    const cur = JSON.stringify(metadata);
    let prev = metaUndoStack.pop();
    if (prev === cur && metaUndoStack.length > 0) { metaRedoStack.push(prev); prev = metaUndoStack.pop(); }
    metaRedoStack.push(cur);
    metadata = normalizeMetadata(JSON.parse(prev));
    renderMetadata(); saveMetadata(); updateUndoRedoButtonsState();
    if(typeof showToast === 'function') showToast('↩️ Đã hoàn tác', 'var(--btn-info)');
}
function metaRedo() {
    if (metaRedoStack.length === 0) return;
    metaUndoStack.push(JSON.stringify(metadata));
    metadata = normalizeMetadata(JSON.parse(metaRedoStack.pop()));
    renderMetadata(); saveMetadata(); updateUndoRedoButtonsState();
    if(typeof showToast === 'function') showToast('🔁 Đã làm lại', 'var(--btn-info)');
}

function selectInfoCard(el, section, originalIndex) {
    el.parentNode.querySelectorAll('.active-info-card').forEach(r => r.classList.remove('active-info-card'));
    el.classList.add('active-info-card');
    activeInfoRows[section] = originalIndex;
}

// ================= RENDER GIAO DIỆN & TÌM KIẾM ĐỘC LẬP TỪNG MỤC =================
function renderMetadata() {
    metadata = normalizeMetadata(metadata);
    const t = document.getElementById('story-title-input'); if (t) t.value = metadata.title || '';
    ensureSectionSearchBars(); ensureProseImportButton();
    renderCharacters(); renderPronouns(); renderTerms();
    updateUndoRedoButtonsState();
}

function ensureSectionSearchBars() {
    const setup = (id, wrapId, ph, queryVar, renderFn) => {
        const body = document.getElementById(id);
        if (body && !document.getElementById(wrapId)) {
            const w = document.createElement('div'); w.className = 'section-search-bar-wrap';
            w.innerHTML = `<div class="section-search-inner"><span class="section-search-icon">🔍</span><input type="text" id="${wrapId}" class="section-search-input" placeholder="${ph}" autocomplete="off"/><button type="button" id="clr-${wrapId}" class="btn-clear-section-search" style="display:none;" title="Xóa">&times;</button></div>`;
            body.parentNode.insertBefore(w, body);
            const input = w.querySelector(`#${wrapId}`), clr = w.querySelector(`#clr-${wrapId}`);
            input.addEventListener('input', (e) => {
                if (id==='body-characters') searchCharsQuery = e.target.value.trim();
                if (id==='body-pronouns') searchPronounsQuery = e.target.value.trim();
                if (id==='body-terms') searchTermsQuery = e.target.value.trim();
                clr.style.display = e.target.value ? 'inline-block' : 'none'; renderFn();
            });
            clr.addEventListener('click', () => {
                input.value=''; clr.style.display='none';
                if (id==='body-characters') searchCharsQuery = '';
                if (id==='body-pronouns') searchPronounsQuery = '';
                if (id==='body-terms') searchTermsQuery = '';
                renderFn(); input.focus();
            });
        }
    };
    setup('body-characters', 'search-chars-input', 'Tìm nhân vật...', 'searchCharsQuery', renderCharacters);
    setup('body-pronouns', 'search-pronouns-input', 'Tìm xưng hô...', 'searchPronounsQuery', renderPronouns);
    setup('body-terms', 'search-terms-input', 'Tìm từ ngữ...', 'searchTermsQuery', renderTerms);
}

function renderCharacters() {
    const c = document.getElementById('body-characters'); if (!c) return;
    c.innerHTML = ''; let match = 0;
    (metadata.characters||[]).forEach((char, idx) => {
        const q = searchCharsQuery || metaSearchQuery;
        if (q && !matchSearch(char.c1,q) && !matchSearch(char.c2,q) && !matchSearch(char.c3,q) && !matchSearch(char.c4,q) && !matchSearch(char.c5,q)) return;
        match++;
        const div = document.createElement('div'); div.className = `meta-card-block ${activeInfoRows.characters === idx ? 'active-info-card' : ''}`;
        div.onclick = () => selectInfoCard(div, 'characters', idx);
        div.innerHTML = `
            <div class="meta-card-header"><span>Nhân vật ${idx + 1}</span><button class="btn-card-del">🗑️</button></div>
            ${['Tên tiếng Trung:c1', 'Tên tiếng Việt:c2', 'Ngôi thứ 3 người khác gọi:c3', 'Miêu tả nhân vật:c4', 'Ngôi thứ ba:c5'].map(f => {
                const [l, k] = f.split(':'); return `<div class="meta-field-row"><span class="meta-field-label">${l}:</span><div class="meta-field-value" contenteditable="true" data-f="${k}">${char[k]}</div></div>`;
            }).join('')}
        `;
        div.querySelectorAll('.meta-field-value').forEach(el => el.addEventListener('input', e => { metadata.characters[idx][e.target.dataset.f] = e.target.innerHTML; handleMetaTypingInput(); debounceMetaSave(); }));
        div.querySelector('.btn-card-del').addEventListener('click', e => { e.stopPropagation(); deleteCharacterRow(idx); });
        c.appendChild(div);
    });
    if (match===0 && metadata.characters.length>0) c.innerHTML = '<div class="meta-no-result">🔍 Không tìm thấy nhân vật.</div>';
}

function renderPronouns() {
    const c = document.getElementById('body-pronouns'); if (!c) return;
    c.innerHTML = ''; let match = 0;
    (metadata.pronouns||[]).forEach((pro, idx) => {
        const q = searchPronounsQuery || metaSearchQuery;
        if (q && !matchSearch(pro.c1,q) && !matchSearch(pro.c2,q) && !matchSearch(pro.c3,q) && !matchSearch(pro.c4,q) && !matchSearch(pro.c5,q)) return;
        match++;
        const div = document.createElement('div'); div.className = `meta-card-block ${activeInfoRows.pronouns === idx ? 'active-info-card' : ''}`;
        div.onclick = () => selectInfoCard(div, 'pronouns', idx);
        div.innerHTML = `
            <div class="meta-card-header"><span>Cặp xưng hô ${idx + 1}</span><button class="btn-card-del">🗑️</button></div>
            ${['A:c1', 'B:c2', 'A-B:c3', 'B-A:c4', 'Ghi chú:c5'].map(f => {
                const [l, k] = f.split(':'); return `<div class="meta-field-row"><span class="meta-field-label">${l}:</span><div class="meta-field-value" contenteditable="true" data-f="${k}">${pro[k]}</div></div>`;
            }).join('')}
        `;
        div.querySelectorAll('.meta-field-value').forEach(el => el.addEventListener('input', e => { metadata.pronouns[idx][e.target.dataset.f] = e.target.innerHTML; handleMetaTypingInput(); debounceMetaSave(); }));
        div.querySelector('.btn-card-del').addEventListener('click', e => { e.stopPropagation(); deletePronounRow(idx); });
        c.appendChild(div);
    });
    if (match===0 && metadata.pronouns.length>0) c.innerHTML = '<div class="meta-no-result">🔍 Không tìm thấy cặp xưng hô.</div>';
}

function renderTerms() {
    const c = document.getElementById('body-terms'); if (!c) return;
    c.innerHTML = ''; let match = 0;
    (metadata.terms||[]).forEach((term, idx) => {
        const q = searchTermsQuery || metaSearchQuery;
        if (q && !matchSearch(term.c1,q) && !matchSearch(term.c2,q)) return;
        match++;
        const div = document.createElement('div'); div.className = `term-line-item ${activeInfoRows.terms === idx ? 'active-info-card' : ''}`;
        div.onclick = () => selectInfoCard(div, 'terms', idx);
        div.innerHTML = `
            <div class="term-part-cn" contenteditable="true" data-f="c1">${term.c1}</div><span class="term-equal-sign">=</span>
            <div class="term-part-vi" contenteditable="true" data-f="c2">${term.c2}</div><button class="btn-card-del">🗑️</button>
        `;
        div.querySelectorAll('[contenteditable]').forEach(el => el.addEventListener('input', e => { metadata.terms[idx][e.target.dataset.f] = e.target.innerHTML; handleMetaTypingInput(); debounceMetaSave(); }));
        div.querySelector('.btn-card-del').addEventListener('click', e => { e.stopPropagation(); deleteTermRow(idx); });
        c.appendChild(div);
    });
    if (match===0 && metadata.terms.length>0) c.innerHTML = '<div class="meta-no-result">🔍 Không tìm thấy từ ngữ.</div>';
}

function addCharacterRow() { saveMetaUndoState(); metadata.characters.push({c1:'',c2:'',c3:'',c4:'',c5:''}); activeInfoRows.characters = metadata.characters.length - 1; debounceMetaSave(); renderCharacters(); const c = document.getElementById('body-characters'); if(c) c.scrollTop = c.scrollHeight; }
function addPronounRow() { saveMetaUndoState(); metadata.pronouns.push({c1:'',c2:'',c3:'',c4:'',c5:''}); activeInfoRows.pronouns = metadata.pronouns.length - 1; debounceMetaSave(); renderPronouns(); const c = document.getElementById('body-pronouns'); if(c) c.scrollTop = c.scrollHeight; }
function addTermRow() { saveMetaUndoState(); metadata.terms.push({c1:'',c2:''}); activeInfoRows.terms = metadata.terms.length - 1; debounceMetaSave(); renderTerms(); const c = document.getElementById('body-terms'); if(c) c.scrollTop = c.scrollHeight; }

function deleteCharacterRow(targetIndex = null) {
    const idx = targetIndex !== null ? targetIndex : activeInfoRows.characters;
    if (idx >= 0 && idx < metadata.characters.length && confirm(`Xóa "${metadata.characters[idx].c2 || metadata.characters[idx].c1 || 'Nhân vật '+(idx+1)}"?`)) {
        saveMetaUndoState(); metadata.characters.splice(idx, 1);
        if (metadata.characters.length === 0) metadata.characters.push({c1:'',c2:'',c3:'',c4:'',c5:''});
        activeInfoRows.characters = -1; debounceMetaSave(); renderCharacters();
    }
}
function deletePronounRow(targetIndex = null) {
    const idx = targetIndex !== null ? targetIndex : activeInfoRows.pronouns;
    if (idx >= 0 && idx < metadata.pronouns.length && confirm(`Xóa "${metadata.pronouns[idx].c1 ? metadata.pronouns[idx].c1 + ' - ' + metadata.pronouns[idx].c2 : 'Cặp xưng hô '+(idx+1)}"?`)) {
        saveMetaUndoState(); metadata.pronouns.splice(idx, 1);
        if (metadata.pronouns.length === 0) metadata.pronouns.push({c1:'',c2:'',c3:'',c4:'',c5:''});
        activeInfoRows.pronouns = -1; debounceMetaSave(); renderPronouns();
    }
}
function deleteTermRow(targetIndex = null) {
    const idx = targetIndex !== null ? targetIndex : activeInfoRows.terms;
    if (idx >= 0 && idx < metadata.terms.length && confirm(`Xóa từ ngữ này?`)) {
        saveMetaUndoState(); metadata.terms.splice(idx, 1);
        if (metadata.terms.length === 0) metadata.terms.push({c1:'',c2:''});
        activeInfoRows.terms = -1; debounceMetaSave(); renderTerms();
    }
}

// ================= SAO CHÉP TEXT =================
function extractCleanText(val) { const t=document.createElement('div'); t.innerHTML=String(val||'').replace(/<br\s*[\/]?>/gi, ' ').replace(/<\/?[^>]+(>|$)/g, ''); return (t.textContent||t.innerText||'').trim(); }
async function copyTextSafely(text, msg) {
    if(!text) return;
    try {
        if(navigator.clipboard) await navigator.clipboard.writeText(text);
        else { const t = document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
        if(typeof showToast === 'function') showToast(msg, 'var(--btn-success)');
    } catch(e){}
}
function getFormattedAllMetadataText() {
    let ls = [`Tên truyện: ${metadata.title||'Chưa đặt tên'}\n\n1. Nhân vật trong truyện\n`];
    (metadata.characters||[]).forEach((c,i) => ls.push(`Nhân vật ${i+1}\nTên tiếng Trung: ${extractCleanText(c.c1)}\nTên tiếng Việt: ${extractCleanText(c.c2)}\nNgôi thứ 3 người khác gọi: ${extractCleanText(c.c3)}\nMiêu tả nhân vật: ${extractCleanText(c.c4)}\nNgôi thứ ba: ${extractCleanText(c.c5)}\n`));
    ls.push(`\n2. Xưng hô\n`);
    (metadata.pronouns||[]).forEach((p,i) => { ls.push(`Cặp xưng hô ${i+1}\nA: ${extractCleanText(p.c1)}\nB: ${extractCleanText(p.c2)}\nA-B: ${extractCleanText(p.c3)}\nB-A: ${extractCleanText(p.c4)}`); if(p.c5) ls.push(`Ghi chú: ${extractCleanText(p.c5)}`); ls.push(''); });
    ls.push(`3. Thống nhất từ ngữ\n`);
    (metadata.terms||[]).forEach(t => ls.push(`${extractCleanText(t.c1)} = ${extractCleanText(t.c2)}`));
    return ls.join('\n').trim();
}

// ================= TÍNH NĂNG 2: 📄 TEXT TẠO BẢNG (PARSER MẠNH MẼ) =================
function parseMetadataProse(text) {
    if (!text || !text.trim()) return { success: false, message: 'Nội dung đang trống!' };
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let title = '', chars = [], pros = [], terms = [], warns = [];
    let sec = 0, cChar = null, cPro = null;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], trm = raw.trim();
        if (!trm) continue;
        
        if (/^Tên truyện\s*:/i.test(trm)) { title = trm.slice(trm.indexOf(':') + 1).trim(); continue; }
        if (/^1\.\s*Nhân vật trong truyện/i.test(trm)) { sec = 1; cChar = null; continue; }
        if (/^2\.\s*Xưng hô/i.test(trm)) { sec = 2; cPro = null; continue; }
        if (/^3\.\s*Thống nhất từ ngữ/i.test(trm)) { sec = 3; continue; }

        if (sec === 1) {
            if (/^Nhân vật\s+\d+/i.test(trm)) { cChar = {c1:'',c2:'',c3:'',c4:'',c5:''}; chars.push(cChar); continue; }
            if (!cChar && /^Tên tiếng Trung\s*:/i.test(trm)) { cChar = {c1:'',c2:'',c3:'',c4:'',c5:''}; chars.push(cChar); }
            const col = raw.indexOf(':');
            if (col !== -1 && cChar) {
                const l = raw.slice(0, col).trim().toLowerCase(), v = raw.slice(col + 1).trim();
                if (l.includes('tiếng trung')) cChar.c1 = v; else if (l.includes('tiếng việt')) cChar.c2 = v;
                else if (l.includes('người khác gọi')) cChar.c3 = v; else if (l.includes('miêu tả')) cChar.c4 = v;
                else if (l.includes('ngôi thứ 3') || l.includes('ngôi thứ ba')) cChar.c5 = v;
                else warns.push({ line: i+1, msg: `Nhãn trường không xác định: "${trm}"` });
            } continue;
        }

        if (sec === 2) {
            if (/^Cặp xưng hô\s+\d+/i.test(trm)) { cPro = {c1:'',c2:'',c3:'',c4:'',c5:''}; pros.push(cPro); continue; }
            if (!cPro && /^A\s*:/i.test(trm)) { cPro = {c1:'',c2:'',c3:'',c4:'',c5:''}; pros.push(cPro); }
            const col = raw.indexOf(':');
            if (col !== -1 && cPro) {
                const l = raw.slice(0, col).trim().toUpperCase(), v = raw.slice(col + 1).trim();
                if (l === 'A') cPro.c1 = v; else if (l === 'B') cPro.c2 = v;
                else if (l === 'A-B' || l === 'A - B') cPro.c3 = v; else if (l === 'B-A' || l === 'B - A') cPro.c4 = v;
                else if (l.includes('GHI CHÚ') || l.includes('GHI CHU')) cPro.c5 = v;
                else warns.push({ line: i+1, msg: `Nhãn trường không xác định: "${trm}"` });
            } continue;
        }

        if (sec === 3) {
            const eq = trm.indexOf('=');
            if (eq > 0) { terms.push({ c1: trm.slice(0, eq).trim(), c2: trm.slice(eq + 1).trim() }); }
            else warns.push({ line: i+1, msg: `Thiếu dấu "=" phân tách Hán Việt: "${trm}"` });
            continue;
        }
        
        warns.push({ line: i+1, msg: `Dòng nằm ngoài các phân vùng mục 1, 2, 3: "${trm}"` });
    }

    if (!title && chars.length===0 && pros.length===0 && terms.length===0) return { success: false, message: 'Định dạng văn bản không khớp với chuẩn cấu trúc công cụ edit.' };
    return { success: true, data: { title, characters: chars, pronouns: pros, terms }, warnings };
}

// CHÈN NÚT "📄 Text tạo bảng" VÀ GÁN SỰ KIỆN MỞ MODAL BẰNG EVENT DELEGATION
function ensureProseImportButton() {
    let btn = document.getElementById('btn-import-prose-meta');
    if (btn) {
        btn.innerHTML = '📄 Text tạo bảng';
        btn.title = 'Tự động tạo bảng thông tin từ văn bản';
        btn.onclick = openProseImportModal; // Gán lại sự kiện click chắc chắn 100%
        return;
    }

    const copyAllBtn = document.getElementById('btn-copy-all-meta');
    if (!copyAllBtn) return;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-import-prose-meta';
    btn.className = `${copyAllBtn.className || ''} btn-prose-import-trigger`;
    btn.style.marginLeft = '8px';
    btn.innerHTML = '📄 Text tạo bảng';
    btn.title = 'Tự động tạo bảng thông tin từ văn bản';
    btn.onclick = openProseImportModal;

    copyAllBtn.parentNode.insertBefore(btn, copyAllBtn.nextSibling);
}
function scrollToTextareaLine(ta, line) {
    const lines = ta.value.split('\n'); let chars = 0;
    for (let i = 0; i < line - 1; i++) chars += lines[i].length + 1;
    ta.focus(); ta.setSelectionRange(chars, chars + lines[line - 1].length);
}

// Hàm gộp dữ liệu: Bổ sung vs Thay thế toàn bộ
function mergeData(mode, newData) {
    if (mode === 'replace') {
        metadata.title = newData.title || metadata.title;
        metadata.characters = newData.characters.length ? newData.characters : [{ c1:'', c2:'', c3:'', c4:'', c5:'' }];
        metadata.pronouns = newData.pronouns.length ? newData.pronouns : [{ c1:'', c2:'', c3:'', c4:'', c5:'' }];
        metadata.terms = newData.terms.length ? newData.terms : [{ c1:'', c2:'' }];
    } else { // Append & Update
        if(newData.title) metadata.title = newData.title;
        
        newData.characters.forEach(nc => {
            if(!nc.c1 && !nc.c2) return;
            const ex = metadata.characters.find(c => c.c1 && nc.c1 && c.c1 === nc.c1);
            if (ex) Object.assign(ex, nc); else metadata.characters.push(nc);
        });
        
        newData.pronouns.forEach(np => {
            if(!np.c1 || !np.c2) return;
            const ex = metadata.pronouns.find(p => p.c1===np.c1 && p.c2===np.c2);
            if (ex) Object.assign(ex, np); else metadata.pronouns.push(np);
        });
        
        newData.terms.forEach(nt => {
            if(!nt.c1) return;
            const ex = metadata.terms.find(t => t.c1===nt.c1);
            if (ex) ex.c2 = nt.c2; else metadata.terms.push(nt);
        });
        
        // Dọn dẹp dòng rỗng đầu tiên nếu có dữ liệu thật được thêm vào
        if(metadata.characters.length>1 && !metadata.characters[0].c1 && !metadata.characters[0].c2) metadata.characters.shift();
        if(metadata.pronouns.length>1 && !metadata.pronouns[0].c1 && !metadata.pronouns[0].c2) metadata.pronouns.shift();
        if(metadata.terms.length>1 && !metadata.terms[0].c1 && !metadata.terms[0].c2) metadata.terms.shift();
    }
}

// KHỞI TẠO MODAL VÀ LUỒNG SỰ KIỆN AUTO-PARSE
function openProseImportModal() {
    let modal = document.getElementById('modal-import-prose');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-import-prose'; modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="width: 780px; max-width: 95%; max-height: 92vh; display: flex; flex-direction: column; background: var(--bg-card, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); background: var(--header-bg); display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin:0; font-size:16px;">📄 Text tạo bảng thông tin</h3>
                    <button class="btn-close-prose-modal" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--text-muted);">&times;</button>
                </div>
                <div style="padding: 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display:flex; justify-content: space-between; align-items:flex-end;">
                        <span style="font-size:13px; color:gray;">Hỗ trợ dán (Ctrl+V) hoặc kéo thả file (.txt, .md)</span>
                        <div style="display:flex; gap:15px; font-size:13px; font-weight:600; color:var(--text-color);">
                            <label style="cursor:pointer;"><input type="radio" name="importMode" value="append" checked> Nhập bổ sung (Cập nhật mục trùng)</label>
                            <label style="cursor:pointer;"><input type="radio" name="importMode" value="replace"> Thay thế toàn bộ</label>
                        </div>
                    </div>
                    <div class="prose-textarea-wrap">
                        <textarea id="prose-import-textarea" class="prose-textarea" placeholder="Dán văn bản có cấu trúc chuẩn vào đây..."></textarea>
                        <button id="btn-clear-textarea" class="btn-clear-textarea" title="Xóa trắng ô nhập liệu">🗑 Xóa text</button>
                    </div>
                    <div style="display:flex; justify-content: flex-end;">
                        <button id="btn-prose-preview" style="padding: 6px 16px; background:#2563eb; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer; transition:0.15s;">🔄 Phân tích lại</button>
                    </div>
                    <div id="prose-preview-result" class="prose-preview-box" style="display:none;"></div>
                </div>
                <div style="padding: 12px 18px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; background: var(--th-bg);">
                    <button class="btn-close-prose-modal" style="padding: 8px 16px; font-weight:600; border: 1px solid #cbd5e1; border-radius: 6px; background: transparent; color: var(--text-color); cursor: pointer;">Hủy</button>
                    <button id="btn-prose-create" disabled style="padding: 8px 20px; font-weight: 600; border: none; border-radius: 6px; background: #10b981; color: #fff; cursor: not-allowed; opacity: 0.5;">✨ Tạo bảng</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const ta = modal.querySelector('#prose-import-textarea');
        const prvBtn = modal.querySelector('#btn-prose-preview');
        const createBtn = modal.querySelector('#btn-prose-create');
        const resBox = modal.querySelector('#prose-preview-result');
        const clrBtn = modal.querySelector('#btn-clear-textarea');

        let lastData = null; 
        let debounce = null;

        // Hàm vẽ bảng Preview
        const renderPreview = () => {
            const text = ta.value.trim();
            if (!text) { 
                resBox.style.display='none'; 
                createBtn.disabled=true; createBtn.style.opacity='0.5'; createBtn.style.cursor='not-allowed'; 
                lastData=null; 
                return; 
            }
            
            const res = parseMetadataProse(text);
            resBox.style.display = 'block';
            
            if (!res.success) {
                resBox.innerHTML = `<div style="color:#ef4444; font-weight:bold; padding: 10px;">❌ ${res.message}</div>`;
                createBtn.disabled=true; createBtn.style.opacity='0.5'; createBtn.style.cursor='not-allowed'; 
                lastData=null; 
                return;
            }

            lastData = res.data;
            const d = res.data;
            const w = res.warnings;
            
            let html = `<div style="color:#059669; font-weight:bold; margin-bottom:12px; font-size: 14px;">✅ Thống kê dữ liệu phân tích:</div>`;
            html += `<ul class="preview-list">`;
            html += `<li><b>Tên truyện:</b> <span style="color:var(--btn-primary);">${d.title ? `✓ ${d.title}` : '<i style="color:gray;">Chưa thiết lập</i>'}</span></li>`;
            
            if (d.characters.length) {
                html += `<li><b>Nhân vật (${d.characters.length}):</b><ul style="color:gray; font-size:12px; margin-top:2px;">`;
                d.characters.slice(0, 3).forEach(c => html += `<li>• ${c.c1 || c.c2 || 'Chưa rõ'}</li>`);
                if(d.characters.length > 3) html += `<li>... và ${d.characters.length - 3} nhân vật khác</li>`;
                html += `</ul></li>`;
            }
            if (d.pronouns.length) {
                html += `<li><b>Xưng hô (${d.pronouns.length}):</b><ul style="color:gray; font-size:12px; margin-top:2px;">`;
                d.pronouns.slice(0, 3).forEach(p => html += `<li>• ${p.c1} ↔ ${p.c2}</li>`);
                if(d.pronouns.length > 3) html += `<li>... và ${d.pronouns.length - 3} xưng hô khác</li>`;
                html += `</ul></li>`;
            }
            if (d.terms.length) {
                html += `<li><b>Từ ngữ (${d.terms.length}):</b><ul style="color:gray; font-size:12px; margin-top:2px;">`;
                d.terms.slice(0, 3).forEach(t => html += `<li>• ${t.c1} → ${t.c2}</li>`);
                if(d.terms.length > 3) html += `<li>... và ${d.terms.length - 3} từ ngữ khác</li>`;
                html += `</ul></li>`;
            }
            html += `</ul>`;

            if (w.length > 0) {
                html += `<div style="margin-top:12px; border-top:1px dashed #cbd5e1; padding-top:10px;">
                            <b style="color: #b45309;">⚠️ Bỏ qua (${w.length} dòng không hợp lệ):</b> 
                            <span style="font-size:11px; color:gray;">(Click vào để cuộn tới vị trí lỗi)</span>
                            <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px;">`;
                w.forEach(warn => {
                    html += `<a class="warning-item" data-line="${warn.line}"><b>Dòng ${warn.line}:</b> ${warn.msg}</a>`;
                });
                html += `</div></div>`;
            }

            resBox.innerHTML = html;
            resBox.querySelectorAll('.warning-item').forEach(el => {
                el.onclick = () => scrollToTextareaLine(ta, parseInt(el.dataset.line));
            });

            createBtn.disabled=false; createBtn.style.opacity='1'; createBtn.style.cursor='pointer';
        };

        // AUTO-PARSE KHI DÁN HOẶC GÕ CHỮ (DEBOUNCE 300MS)
        ta.addEventListener('input', () => { 
            clearTimeout(debounce); 
            debounce = setTimeout(renderPreview, 300); 
        });
        
        prvBtn.onclick = renderPreview;
        
        clrBtn.onclick = () => { 
            ta.value = ''; 
            renderPreview(); 
            ta.focus(); 
        };

        // HỖ TRỢ KÉO THẢ FILE (.txt, .md) VÀO Ô TEXTAREA
        ta.addEventListener('dragover', e => { e.preventDefault(); ta.classList.add('drag-over'); });
        ta.addEventListener('dragleave', () => ta.classList.remove('drag-over'));
        ta.addEventListener('drop', e => {
            e.preventDefault(); 
            ta.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && (file.name.endsWith('.txt') || file.name.endsWith('.md'))) {
                const reader = new FileReader();
                reader.onload = ev => { 
                    ta.value = ev.target.result; 
                    renderPreview(); 
                };
                reader.readAsText(file);
            } else {
                if (typeof showToast === 'function') showToast('⚠️ Chỉ hỗ trợ kéo thả file .txt hoặc .md', 'var(--btn-warning)');
            }
        });

        // XỬ LÝ LƯU VÀO BẢNG
        createBtn.onclick = () => {
            if (!lastData) return;
            const mode = modal.querySelector('input[name="importMode"]:checked').value;
            if (mode === 'replace' && !confirm("⚠️ Chế độ THAY THẾ TOÀN BỘ:\nDữ liệu cũ trong tab này sẽ BỊ XÓA HOÀN TOÀN và ghi đè bằng dữ liệu vừa phân tích.\n\nBạn có chắc chắn tiếp tục?")) return;
            
            saveMetaUndoState();
            mergeData(mode, lastData);
            saveMetadata(); 
            renderMetadata(); 
            addMetaHistoryEntry();
            
            modal.classList.remove('show');
            if(typeof showToast === 'function') showToast(`✅ Đã nạp thành công (Chế độ: ${mode === 'replace' ? 'Thay thế' : 'Bổ sung'})`, 'var(--btn-success)');
        };

        // SỰ KIỆN ĐÓNG MODAL
        modal.querySelectorAll('.btn-close-prose-modal').forEach(b => b.onclick = () => modal.classList.remove('show'));
    }

    const m = document.getElementById('modal-import-prose');
    m.classList.add('show');
    m.querySelector('#prose-import-textarea').focus();
}

// ================= RENDER TOÀN BỘ SỰ KIỆN KHỞI TẠO =================
function resetMetadata() {
    if (confirm("⚠️ Bạn có chắc chắn muốn XÓA TOÀN BỘ thông tin truyện?")) {
        saveMetaUndoState();
        if (typeof addMetaHistoryEntry === 'function') addMetaHistoryEntry();
        metadata = { title: '', characters: [{ c1: '', c2: '', c3: '', c4: '', c5: '' }], pronouns: [{ c1: '', c2: '', c3: '', c4: '', c5: '' }], terms: [{ c1: '', c2: '' }] };
        activeInfoRows = { characters: -1, pronouns: -1, terms: -1 };
        saveMetadata(); renderMetadata();
        if (typeof showToast === 'function') showToast('🔄 Đã làm mới toàn bộ thông tin truyện!', 'var(--btn-warning)');
    }
}

function exportMetadata() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metadata, null, 2));
    const dlAnchor = document.createElement('a'); dlAnchor.setAttribute("href", dataStr);
    let safeTitle = metadata.title ? metadata.title.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') : "export";
    let fileName = "thong_tin_truyen_" + safeTitle + ".json";
    dlAnchor.setAttribute("download", fileName); dlAnchor.click();
    if(typeof showToast === 'function') showToast(`💾 Đã xuất file [ ${fileName} ]!`, 'var(--btn-success)');
}

function handleMetadataImport(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            if (imported && (imported.characters || imported.pronouns || imported.terms)) {
                saveMetaUndoState(); metadata = normalizeMetadata(imported);
                debounceMetaSave(); renderMetadata();
                if (typeof addMetaHistoryEntry === 'function') addMetaHistoryEntry();
                showToast('📂 Nhập thông tin truyện thành công!', 'var(--btn-success)');
            } else alert("Định dạng file không khớp!");
        } catch (err) { alert("Lỗi đọc cấu hình JSON!"); }
    };
    reader.readAsText(file); event.target.value = ''; 
}

function initMetadataEvents() {
    document.getElementById('story-title-input')?.addEventListener('input', (e) => { handleMetaTypingInput(); metadata.title = e.target.value; debounceMetaSave(); });
    
    document.getElementById('btn-add-char')?.addEventListener('click', () => addRow('characters'));
    document.getElementById('btn-add-pro')?.addEventListener('click', () => addRow('pronouns'));
    document.getElementById('btn-add-term')?.addEventListener('click', () => addRow('terms'));

    document.getElementById('btn-meta-undo')?.addEventListener('click', metaUndo);
    document.getElementById('btn-meta-redo')?.addEventListener('click', metaRedo);
    document.getElementById('btn-reset-meta')?.addEventListener('click', resetMetadata);

    document.getElementById('btn-export-meta')?.addEventListener('click', exportMetadata);
    document.getElementById('btn-import-meta')?.addEventListener('click', () => document.getElementById('metadata-file-input')?.click());
    document.getElementById('metadata-file-input')?.addEventListener('change', handleMetadataImport);

    document.getElementById('btn-copy-chars')?.addEventListener('click', () => copyTextSafely(getFormattedCharactersText(), 'Đã sao chép danh sách nhân vật!'));
    document.getElementById('btn-copy-pros')?.addEventListener('click', () => copyTextSafely(getFormattedPronounsText(), 'Đã sao chép danh sách xưng hô!'));
    document.getElementById('btn-copy-terms')?.addEventListener('click', () => copyTextSafely(getFormattedTermsText(), 'Đã sao chép thống nhất từ ngữ!'));
    document.getElementById('btn-copy-all-meta')?.addEventListener('click', () => copyTextSafely(getFormattedAllMetadataText(), 'Đã copy toàn bộ thông tin!'));

    document.getElementById('btn-history-meta-show')?.addEventListener('click', () => { if (typeof openHistoryModal === 'function') openHistoryModal('meta'); });

    const searchInput = document.getElementById('meta-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-meta-search');
    searchInput?.addEventListener('input', (e) => {
        metaSearchQuery = e.target.value.trim();
        if (clearSearchBtn) clearSearchBtn.style.display = metaSearchQuery ? 'inline-block' : 'none';
        renderCharacters(); renderPronouns(); renderTerms();
    });
    clearSearchBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        metaSearchQuery = ''; clearSearchBtn.style.display = 'none';
        renderCharacters(); renderPronouns(); renderTerms(); searchInput?.focus();
    });

    document.addEventListener('click', e => {
        const toggle = e.target.closest('.section-collapse-toggle');
        if(toggle){ const box = toggle.closest('.story-section-box'); if(box) box.classList.toggle('collapsed'); }
    });
}