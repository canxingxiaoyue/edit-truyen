// =========================================================================
// ĐỒNG BỘ BÔI ĐEN REAL-TIME RAW ↔ QT (HIGHLIGHT ĐÔI)
// =========================================================================
let isSyncHighlighting = false;

function getTextNodeOffset(root, node, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let current = walker.nextNode();
    let total = 0;
    while (current) {
        if (current === node) return total + offset;
        total += current.textContent.length;
        current = walker.nextNode();
    }
    return null;
}

function getTextNodeAtOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let current = walker.nextNode();
    while (current) {
        if (offset <= current.textContent.length) {
            return { node: current, offset };
        }
        offset -= current.textContent.length;
        current = walker.nextNode();
    }
    return null;
}

function saveSelectionRelativeToCell(cell, selection) {
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!cell.contains(range.startContainer) || !cell.contains(range.endContainer)) return null;
    const start = getTextNodeOffset(cell, range.startContainer, range.startOffset);
    const end = getTextNodeOffset(cell, range.endContainer, range.endOffset);
    if (start === null || end === null) return null;
    return { start, end };
}

function restoreSelectionInCell(cell, saved) {
    if (!saved) return;
    const selection = window.getSelection();
    if (!selection) return;
    const startInfo = getTextNodeAtOffset(cell, saved.start);
    const endInfo = getTextNodeAtOffset(cell, saved.end);
    if (!startInfo || !endInfo) return;
    const range = document.createRange();
    range.setStart(startInfo.node, startInfo.offset);
    range.setEnd(endInfo.node, endInfo.offset);
    selection.removeAllRanges();
    selection.addRange(range);
}

function handleSelectionSync() {
    if (isSyncHighlighting || activeTab !== 'edit-tool') return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const anchorNode = selection.anchorNode;
    if (!anchorNode) return;

    const td = anchorNode.parentElement?.closest('td');
    if (!td) return;

    const tr = td.closest('tr');
    if (!tr) return;

    const tbody = document.getElementById('table-body');
    const rowIndex = Array.from(tbody.children).indexOf(tr);
    const colIndex = Array.from(tr.children).indexOf(td);

    if (colIndex !== 0 && colIndex !== 4) return;

    const tokens = rowTokensMap[rowIndex];
    if (!tokens || tokens.length === 0) return;

    const selectedText = selection.toString();
    if (!selectedText.trim()) return;

    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(td);
    preRange.setEnd(range.startContainer, range.startOffset);
    const selStart = preRange.toString().length;
    const selEnd = selStart + selectedText.length;

    isSyncHighlighting = true;

    const rawCell = tr.children[0];
    const qtCell = tr.children[4];
    const activeCell = colIndex === 0 ? rawCell : qtCell;
    const savedSelection = saveSelectionRelativeToCell(activeCell, window.getSelection());

    if (colIndex === 0) {
        const matchedTokens = tokens.filter(t => t.rawStart < selEnd && t.rawEnd > selStart);
        if (matchedTokens.length > 0) {
            const qtStart = matchedTokens[0].qtStart;
            const qtEnd = matchedTokens[matchedTokens.length - 1].qtEnd;
            const rawStart = matchedTokens[0].rawStart;
            const rawEnd = matchedTokens[matchedTokens.length - 1].rawEnd;

            clearSyncHighlights();
            applySyncHighlight(rawCell, rawStart, rawEnd);
            applySyncHighlight(qtCell, qtStart, qtEnd);
            restoreSelectionInCell(activeCell, savedSelection);
        }
    } else if (colIndex === 4) {
        const matchedTokens = tokens.filter(t => t.qtStart < selEnd && t.qtEnd > selStart);
        if (matchedTokens.length > 0) {
            const rawStart = matchedTokens[0].rawStart;
            const rawEnd = matchedTokens[matchedTokens.length - 1].rawEnd;
            const qtStart = matchedTokens[0].qtStart;
            const qtEnd = matchedTokens[matchedTokens.length - 1].qtEnd;

            clearSyncHighlights();
            applySyncHighlight(qtCell, qtStart, qtEnd);
            applySyncHighlight(rawCell, rawStart, rawEnd);
            restoreSelectionInCell(activeCell, savedSelection);
        }
    }

    isSyncHighlighting = false;
}

function clearSyncHighlights() {
    document.querySelectorAll('.sync-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        }
    });
}

function applySyncHighlight(cell, start, end) {
    if (!cell || start >= end) return;
    const fullText = cell.textContent;
    if (start < 0 || end > fullText.length) return;

    const before = fullText.slice(0, start);
    const match = fullText.slice(start, end);
    const after = fullText.slice(end);

    cell.innerHTML = `${escapeHTML(before)}<span class="sync-highlight">${escapeHTML(match)}</span>${escapeHTML(after)}`;
}

function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}