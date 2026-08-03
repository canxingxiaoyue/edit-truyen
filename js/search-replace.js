// =========================================================================
// QUẢN LÝ TÌM KIẾM VÀ THAY THẾ CHUẨN XÁC
// =========================================================================
function runHighlightAll() {
    const findText = document.getElementById('find-text')?.value;
    const regex = buildFindRegex(
        findText, 
        document.getElementById('opt-regex')?.checked,
        document.getElementById('opt-match-case')?.checked,
        document.getElementById('opt-whole-word')?.checked,
        document.getElementById('opt-ignore-punc')?.checked,
        document.getElementById('opt-ignore-space')?.checked
    );
    if (!regex) return;
    renderTable(); 
    
    const targetIndices = document.getElementById('opt-search-selection')?.checked && selectedRowIndices.length > 0 
        ? selectedRowIndices 
        : data.map((_, idx) => idx);
        
    let highlightedCount = 0;
    const colTarget = document.getElementById('replace-column')?.value;
    
    targetIndices.forEach(rowIndex => {
        const cols = colTarget === 'all' ? columns : [colTarget];
        cols.forEach(col => {
            const originalHTML = data[rowIndex][col] || '';
            const highlightedHTML = highlightInHTMLString(originalHTML, regex);
            if (highlightedHTML !== originalHTML) {
                const cellElement = document.getElementById('table-body')?.children[rowIndex]?.children[columns.indexOf(col)];
                if (cellElement) {
                    cellElement.innerHTML = highlightedHTML;
                    highlightedCount++;
                }
            }
        });
    });
    if (highlightedCount > 0) {
        showToast(`🖌️ Đã tô sáng các kết quả tìm thấy!`, 'var(--btn-info)');
    } else {
        showToast(`❌ Không tìm thấy kết quả phù hợp!`, 'var(--btn-danger)');
    }
}

function runReplaceNext() {
    const findText = document.getElementById('find-text')?.value;
    const replaceText = document.getElementById('replace-text')?.value;
    const regex = buildFindRegex(
        findText, 
        document.getElementById('opt-regex')?.checked,
        document.getElementById('opt-match-case')?.checked,
        document.getElementById('opt-whole-word')?.checked,
        document.getElementById('opt-ignore-punc')?.checked,
        document.getElementById('opt-ignore-space')?.checked
    );
    if (!regex) return;
    
    const targetIndices = document.getElementById('opt-search-selection')?.checked && selectedRowIndices.length > 0 
        ? selectedRowIndices 
        : data.map((_, idx) => idx);
        
    let replaced = false;
    const casePreserve = document.getElementById('opt-case-preserve')?.checked;
    const replaceFn = (match) => {
        replaced = true;
        return casePreserve ? preserveCase(match, replaceText) : replaceText;
    };
    
    const colTarget = document.getElementById('replace-column')?.value;
    
    for (let rowIndex of targetIndices) {
        const cols = colTarget === 'all' ? columns : [colTarget];
        for (let col of cols) {
            const originalHTML = data[rowIndex][col] || '';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = originalHTML;
            if (regex.test(tempDiv.textContent)) {
                let limit = 1;
                const limitedReplaceFn = (match) => {
                    if (limit > 0) { limit--; return replaceFn(match); }
                    return match;
                };
                const newHTML = replaceInHTMLString(originalHTML, regex, limitedReplaceFn);
                if (replaced) {
                    saveEditorUndoState();
                    addEditorHistoryEntry();
                    data[rowIndex][col] = newHTML;
                    const cellElement = document.getElementById('table-body')?.children[rowIndex]?.children[columns.indexOf(col)];
                    if (cellElement) cellElement.innerHTML = newHTML;
                    debounceSave();
                    showToast(`✔️ Đã thay thế thành công 1 vị trí!`, 'var(--btn-success)');
                    return; 
                }
            }
        }
    }
    showToast(`❌ Không tìm thấy kết quả nào khác!`, 'var(--btn-danger)');
}

function runReplaceAll() {
    const findText = document.getElementById('find-text')?.value;
    const replaceText = document.getElementById('replace-text')?.value;
    const regex = buildFindRegex(
        findText, 
        document.getElementById('opt-regex')?.checked,
        document.getElementById('opt-match-case')?.checked,
        document.getElementById('opt-whole-word')?.checked,
        document.getElementById('opt-ignore-punc')?.checked,
        document.getElementById('opt-ignore-space')?.checked
    );
    if (!regex) return;
    
    saveEditorUndoState();
    addEditorHistoryEntry();
    
    let replacedCount = 0;
    const casePreserve = document.getElementById('opt-case-preserve')?.checked;
    const replaceFn = (match) => {
        replacedCount++;
        return casePreserve ? preserveCase(match, replaceText) : replaceText;
    };
    
    const targetIndices = document.getElementById('opt-search-selection')?.checked && selectedRowIndices.length > 0 
        ? selectedRowIndices 
        : data.map((_, idx) => idx);
    const colTarget = document.getElementById('replace-column')?.value;
    
    targetIndices.forEach(rowIndex => {
        const cols = colTarget === 'all' ? columns : [colTarget];
        cols.forEach(col => {
            const originalHTML = data[rowIndex][col] || '';
            const newHTML = replaceInHTMLString(originalHTML, regex, replaceFn);
            if (newHTML !== originalHTML) {
                data[rowIndex][col] = newHTML;
            }
        });
    });
    
    if (replacedCount > 0) {
        renderTable();
        debounceSave();
        showToast(`✔️ Đã thay thế toàn bộ ${replacedCount} vị trí!`, 'var(--btn-success)');
    } else {
        showToast(`❌ Không tìm thấy kết quả nào để thay thế!`, 'var(--btn-danger)');
    }
    if (modalReplace) modalReplace.classList.remove('show');
}

function buildFindRegex(findText, useRegex, matchCase, wholeWord, ignorePunc, ignoreSpace) {
    if (!findText) return null;
    let pattern = findText;
    if (!useRegex) {
        pattern = findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        if (ignorePunc) pattern = pattern.split('').map(c => c + '[\\p{P}]*').join('');
        if (ignoreSpace) pattern = pattern.split('').map(c => c + '[\\s]*').join('');
    }
    if (wholeWord) pattern = `(?<!\\p{L})${pattern}(?!\\p{L})`;
    let flags = 'g';
    if (!matchCase) flags += 'i';
    flags += 'u'; 
    try { return new RegExp(pattern, flags); } catch (e) { alert("Lỗi Regex: " + e.message); return null; }
}

function preserveCase(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original === original.toLowerCase()) return replacement.toLowerCase();
    if (original[0] === original[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement;
}

function findAndReplaceInElement(element, regex, replaceFn) {
    const textNodes = [];
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    while (walk.nextNode()) textNodes.push(walk.currentNode);
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const node = textNodes[i];
        const oldText = node.nodeValue;
        const newText = oldText.replace(regex, replaceFn);
        if (newText !== oldText) node.nodeValue = newText;
    }
}

function replaceInHTMLString(htmlString, regex, replaceFn) {
    const div = document.createElement('div');
    div.innerHTML = htmlString;
    findAndReplaceInElement(div, regex, replaceFn);
    return div.innerHTML;
}

function highlightInHTMLString(htmlString, regex) {
    const div = document.createElement('div');
    div.innerHTML = htmlString;
    const textNodes = [];
    const walk = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
    while (walk.nextNode()) textNodes.push(walk.currentNode);
    
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const node = textNodes[i];
        const text = node.nodeValue;
        if (regex.test(text)) {
            const tempSpan = document.createElement('span');
            const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            tempSpan.innerHTML = escaped.replace(regex, (match) => {
                return `<span class="search-highlight" style="background-color: #fde047; color: #000000; font-weight: bold; border-radius:2px;">${match}</span>`;
            });
            const parent = node.parentNode;
            while (tempSpan.firstChild) {
                parent.insertBefore(tempSpan.firstChild, node);
            }
            parent.removeChild(node);
        }
    }
    return div.innerHTML;
}