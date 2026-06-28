// ============================================================
// ui.js – ส่วนติดต่อผู้ใช้ทั้งหมด (แก้ไขบั๊กเพิ่ม Edge)
// ============================================================

import { state } from './state.js';
import { PHYSICS_CONFIG } from './config.js';
import {
    loadAllFromDB,
    saveNodeToDB,
    saveEdgeToDB,
    deleteEdgeFromDB,
    updateEdgeInDB,
    deleteNodeFromDB,
    resetDatabaseToDefault,
    eraseEntireDatabase,
    openDatabase
} from './db.js';
import {
    filterGraphScope,
    computeNodeWeights,
    syncUIStats
} from './physics.js';

// DOM references
const canvas = document.getElementById('graph-canvas');
const inspector = document.getElementById('inspector');
const settingsPanel = document.getElementById('settings-panel');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');
const linkDialog = document.getElementById('link-dialog');

// ----- Toast -----
export function showToast(msg) {
    toastText.innerText = msg;
    toast.classList.remove('translate-y-12', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.add('translate-y-12', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3500);
}

// ----- ฟังก์ชันลบ Edge (พร้อม try-catch) -----
export async function deleteEdge(edge) {
    try {
        const { id, from, to } = edge;
        await deleteEdgeFromDB(id);
        const index = state.edges.findIndex(e => e.id === id);
        if (index !== -1) state.edges.splice(index, 1);
        computeNodeWeights();
        syncUIStats();
        filterGraphScope();
        if (state.activeNodeId) {
            const node = state.nodes.get(state.activeNodeId);
            if (node) updateInspectorPanel(node);
        }
        showToast(`Removed connection between "${state.nodes.get(from)?.word}" and "${state.nodes.get(to)?.word}"`);
    } catch (err) {
        console.error('deleteEdge error:', err);
        showToast('Error deleting link. Please try again.');
    }
}

// ----- จัดการลิงก์ (เพิ่มหรืออัปเดต) พร้อม try-catch -----
async function applyPendingLink(type) {
    if (!state.pendingLink) {
        showToast('No pending link to apply.');
        return;
    }
    try {
        const { fromId, toId } = state.pendingLink;
        const fromWord = state.nodes.get(fromId)?.word || fromId;
        const toWord = state.nodes.get(toId)?.word || toId;

        const existingEdge = state.edges.find(e =>
            (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
        );

        if (existingEdge) {
            const oldType = existingEdge.type;
            existingEdge.type = type;
            await updateEdgeInDB(existingEdge.id, type);
            showToast(`Updated link type from "${oldType}" to "${type}" (${fromWord} ↔ ${toWord})`);
        } else {
            const edge = { from: fromId, to: toId, type };
            const id = await saveEdgeToDB(edge);
            state.edges.push({ ...edge, id });
            showToast(`Linked: ${fromWord} ↔ ${toWord} (${type})`);
        }

        computeNodeWeights();
        syncUIStats();
        filterGraphScope();
        if (state.activeNodeId) {
            const node = state.nodes.get(state.activeNodeId);
            if (node) updateInspectorPanel(node);
        }
    } catch (err) {
        console.error('applyPendingLink error:', err);
        showToast('Error saving link. Check console for details.');
    } finally {
        closeLinkBuilderDialog();
    }
}

// ----- เปิด Link Dialog (ปรับตามสถานะ) แก้ไขบั๊ก null -----
export function openLinkBuilderDialog(fromNode, toNode) {
    if (!fromNode || !toNode || fromNode.id === toNode.id) {
        showToast('Cannot link a node to itself.');
        return;
    }

    state.pendingLink = { fromId: fromNode.id, toId: toNode.id };

    const existingEdge = state.edges.find(e =>
        (e.from === fromNode.id && e.to === toNode.id) ||
        (e.from === toNode.id && e.to === fromNode.id)
    );
    state.pendingLink.existingEdge = existingEdge;

    const title = document.querySelector('#link-dialog h4');
    const desc = document.querySelector('#link-dialog p');

    if (existingEdge) {
        title.innerText = 'Update Semantic Link';
        desc.innerHTML = `Existing link: <strong>${existingEdge.type}</strong>. Select new type to update, or remove the link. between <strong id="link-source">${fromNode.word}</strong> and <strong id="link-target">${toNode.word}</strong>`;
    } else {
        title.innerText = 'Create Semantic Link';
        desc.innerHTML = `Select the matching relationship connection category between <strong id="link-source">${fromNode.word}</strong> and <strong id="link-target">${toNode.word}</strong>:`;
    }

    const cancelBtn = document.getElementById('link-opt-cancel');
    if (existingEdge) {
        cancelBtn.innerText = 'Remove Link';
        cancelBtn.onclick = () => {
            deleteEdge(existingEdge);
            closeLinkBuilderDialog();
        };
    } else {
        cancelBtn.innerText = 'Cancel Link';
        cancelBtn.onclick = closeLinkBuilderDialog;
    }

    linkDialog.classList.remove('hidden');
}

function closeLinkBuilderDialog() {
    linkDialog.classList.add('hidden');
    state.pendingLink = null;
}

// ----- Inspector Panel -----
export function updateInspectorPanel(node) {
    document.getElementById('inspector-title').innerText = node.word;
    document.getElementById('inspector-pronunciation').innerText = node.pronunciation || `/${node.word}/`;
    document.getElementById('inspector-pos').innerText = `${node.pos}.`;

    const defContainer = document.getElementById('inspector-definitions');
    defContainer.innerHTML = '';
    if (node.definitions) {
        Object.entries(node.definitions).forEach(([lang, text]) => {
            const p = document.createElement('p');
            p.className = 'text-zinc-200 text-sm leading-relaxed bg-zinc-900/40 p-3.5 border border-zinc-900 rounded-2xl font-serif italic';
            const langLabel = lang === 'en' ? '🇬🇧 EN' : (lang === 'th' ? '🇹🇭 TH' : lang.toUpperCase());
            p.innerHTML = `<span class="text-[10px] font-mono text-zinc-500 mr-2">${langLabel}</span> ${text}`;
            defContainer.appendChild(p);
        });
    } else {
        defContainer.innerHTML = `<p class="text-zinc-500 italic">No definition available.</p>`;
    }

    const list = document.getElementById('inspector-examples');
    list.innerHTML = '';
    if (node.examples && node.examples.length > 0) {
        node.examples.forEach(ex => {
            const li = document.createElement('li');
            li.innerText = ex;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = `<span class="text-zinc-650 italic">No usage examples recorded.</span>`;
    }

    const synCon = document.getElementById('inspector-synonyms');
    const antCon = document.getElementById('inspector-antonyms');
    const relCon = document.getElementById('inspector-relations');
    synCon.innerHTML = antCon.innerHTML = relCon.innerHTML = '';

    let synC = 0, antC = 0, relC = 0;

    state.edges.forEach(e => {
        if (e.from === node.id || e.to === node.id) {
            const targetId = e.from === node.id ? e.to : e.from;
            const target = state.nodes.get(targetId);
            if (!target) return;

            const container = document.createElement('div');
            container.className = 'flex items-center gap-1';

            const badge = document.createElement('button');
            badge.className = "px-2.5 py-1 text-[10px] rounded-lg border font-semibold font-mono active:scale-95 transition-transform shrink-0";
            badge.innerText = target.word;
            badge.onclick = () => selectAndFocusNode(targetId, true);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'text-zinc-500 hover:text-red-400 text-[10px] font-mono transition-colors';
            deleteBtn.innerText = '×';
            deleteBtn.onclick = (ev) => {
                ev.stopPropagation();
                deleteEdge(e);
            };

            container.appendChild(badge);
            container.appendChild(deleteBtn);

            if (e.type === 'synonym') {
                badge.className += " border-emerald-950 bg-emerald-950/20 text-emerald-400";
                synCon.appendChild(container);
                synC++;
            } else if (e.type === 'antonym') {
                badge.className += " border-rose-950 bg-rose-950/20 text-rose-400";
                antCon.appendChild(container);
                antC++;
            } else {
                badge.className += " border-zinc-800 bg-zinc-900 text-zinc-300";
                relCon.appendChild(container);
                relC++;
            }
        }
    });

    if (!synC) synCon.innerHTML = `<span class="text-[10px] text-zinc-650">None</span>`;
    if (!antC) antCon.innerHTML = `<span class="text-[10px] text-zinc-650">None</span>`;
    if (!relC) relCon.innerHTML = `<span class="text-[10px] text-zinc-650">None</span>`;

    inspector.classList.remove('hidden', 'translate-y-full', 'md:translate-x-full');
    inspector.classList.add('translate-y-0', 'md:translate-x-0');
    closeSettings();
}

// ----- เลือกและโฟกัสโหนด -----
export function selectAndFocusNode(id, recenterCameraView = false) {
    if (!state.nodes.has(id)) return;
    state.activeNodeId = id;
    const node = state.nodes.get(id);

    if (recenterCameraView) {
        state.camera.targetZoom = 1.1;
        const dpr = window.devicePixelRatio || 1;
        state.camera.x = canvas.width / (2 * dpr) - (node.x * state.camera.targetZoom);
        state.camera.y = canvas.height / (2 * dpr) - (node.y * state.camera.targetZoom);
    }

    filterGraphScope();
    updateInspectorPanel(node);
}

export function closeInspector() {
    inspector.classList.add('hidden');
    state.activeNodeId = null;
    filterGraphScope();
}

export function loadInspector() {
    inspector.classList.remove('hidden');
    state.activeNodeId = null;
    filterGraphScope();
}

// ----- Settings -----
export function openSettings() {
    settingsPanel.classList.remove('translate-y-full');
    settingsPanel.classList.add('translate-y-0');
    settingsPanel.classList.remove('md:opacity-0', 'md:pointer-events-none');
    settingsPanel.classList.add('md:opacity-100', 'md:pointer-events-auto');
    loadInspector();
}

export function closeSettings() {
    settingsPanel.classList.add('translate-y-full');
    settingsPanel.classList.remove('translate-y-0');
    settingsPanel.classList.add('md:opacity-0', 'md:pointer-events-none');
    settingsPanel.classList.remove('md:opacity-100', 'md:pointer-events-auto');
}

export function initializeSettingsSliders() {
    const sliders = {
        repulsion: { el: 'slider-repulsion', valEl: 'val-repulsion', suffix: '', convert: (v) => parseInt(v) },
        spring: { el: 'slider-spring', valEl: 'val-spring', suffix: 'px', convert: (v) => parseInt(v) },
        springK: { el: 'slider-springK', valEl: 'val-springK', suffix: '', convert: (v) => parseFloat(v) },
        gravity: { el: 'slider-gravity', valEl: 'val-gravity', suffix: '', convert: (v) => parseFloat(v) },
        friction: { el: 'slider-friction', valEl: 'val-friction', suffix: '%', convert: (v) => parseInt(v) / 100, display: (v) => `${v}%` },
        nodeRadius: { el: 'slider-nodeRadius', valEl: 'val-nodeRadius', suffix: '', convert: (v) => parseInt(v) }
    };

    document.getElementById('slider-repulsion').value = PHYSICS_CONFIG.repulsion;
    document.getElementById('slider-spring').value = PHYSICS_CONFIG.spring;
    document.getElementById('slider-springK').value = PHYSICS_CONFIG.springK;
    document.getElementById('slider-gravity').value = PHYSICS_CONFIG.gravity;
    document.getElementById('slider-friction').value = Math.round(PHYSICS_CONFIG.friction * 100);
    document.getElementById('slider-nodeRadius').value = PHYSICS_CONFIG.baseNodeRadius;

    Object.keys(sliders).forEach(key => {
        const item = sliders[key];
        const inputEl = document.getElementById(item.el);
        const textEl = document.getElementById(item.valEl);
        const update = () => {
            const rawVal = inputEl.value;
            const processedVal = item.convert(rawVal);
            if (key === 'nodeRadius') {
                PHYSICS_CONFIG.baseNodeRadius = processedVal;
            } else {
                PHYSICS_CONFIG[key] = processedVal;
            }
            textEl.innerText = item.display ? item.display(rawVal) : `${rawVal}${item.suffix}`;
        };
        inputEl.oninput = update;
        update();
    });

    document.getElementById('btn-danger-reset-setting').onclick = () => {
        PHYSICS_CONFIG.repulsion = 7500;
        PHYSICS_CONFIG.spring = 130;
        PHYSICS_CONFIG.springK = 0.07;
        PHYSICS_CONFIG.gravity = 0.009;
        PHYSICS_CONFIG.friction = 0.82;
        PHYSICS_CONFIG.baseNodeRadius = 22;
        initializeSettingsSliders();
        showToast('Engine constants restored to factory settings.');
    };

    document.getElementById('btn-danger-wipe').onclick = () => {
        const confirmWipe = document.createElement('div');
        confirmWipe.className = "fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4";
        confirmWipe.innerHTML = `
      <div class="bg-zinc-950 border border-red-900/60 p-6 rounded-[24px] max-w-sm w-full space-y-4">
        <h4 class="text-sm font-bold uppercase tracking-widest text-red-500 flex items-center gap-2">
          <i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i>
          <span>Danger Operation!</span>
        </h4>
        <p class="text-xs text-zinc-400 leading-relaxed">
          This will completely wipe out every custom node, word and connection inside your IndexedDB database. <strong>This cannot be undone.</strong>
        </p>
        <div class="flex justify-end gap-2.5">
          <button id="cancel-wipe" class="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-350">Cancel</button>
          <button id="confirm-wipe" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-xs text-white font-bold">Wipe Everything</button>
        </div>
      </div>
    `;
        document.body.appendChild(confirmWipe);
        lucide.createIcons();
        confirmWipe.querySelector('#cancel-wipe').onclick = () => confirmWipe.remove();
        confirmWipe.querySelector('#confirm-wipe').onclick = async () => {
            confirmWipe.remove();
            await eraseEntireDatabase();
            state.nodes.clear();
            state.edges = [];
            computeNodeWeights();
            syncUIStats();
            loadInspector();
            closeSettings();
            filterGraphScope();
            showToast('Database wiped.');
        };
    };
}

// ----- Gestures (Mouse + Touch) -----
export function initGestures() {
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: x - rect.left, y: y - rect.top };
    }
    function getVirtualCoords(pos) {
        return {
            x: (pos.x - state.camera.x) / state.camera.zoom,
            y: (pos.y - state.camera.y) / state.camera.zoom
        };
    }
    function checkNodeUnderPointer(pos) {
        const coords = getVirtualCoords(pos);
        for (let i = state.visibleNodes.length - 1; i >= 0; i--) {
            const n = state.visibleNodes[i];
            const rad = PHYSICS_CONFIG.baseNodeRadius + Math.min(n.weight * 2.5, 18);
            const dx = coords.x - n.x;
            const dy = coords.y - n.y;
            if (dx * dx + dy * dy <= rad * rad) return n;
        }
        return null;
    }

    const onPress = (e) => {
        const pos = getPointerPos(e);
        const hit = checkNodeUnderPointer(pos);
        const isLinkingActive = state.isShiftPressed || state.isDrawLinkMode;
        if (hit) {
            if (isLinkingActive) {
                state.linkStartNode = hit;
                state.linkDragCoords = getVirtualCoords(pos);
                state.linkHoverTargetNode = null;
            } else {
                state.dragNode = hit;
                hit.vx = hit.vy = 0;
            }
        } else {
            state.isPanning = true;
            state.panStart.x = pos.x - state.camera.x;
            state.panStart.y = pos.y - state.camera.y;
        }
    };

    const onDrag = (e) => {
        const pos = getPointerPos(e);
        const hovered = checkNodeUnderPointer(pos);
        state.hoverNode = hovered;
        if (state.linkStartNode) {
            state.linkDragCoords = getVirtualCoords(pos);
            state.linkHoverTargetNode = (hovered && hovered !== state.linkStartNode) ? hovered : null;
        } else if (state.dragNode) {
            const v = getVirtualCoords(pos);
            state.dragNode.x = v.x;
            state.dragNode.y = v.y;
        } else if (state.isPanning) {
            state.camera.x = pos.x - state.panStart.x;
            state.camera.y = pos.y - state.panStart.y;
        }
    };

    const onRelease = (e) => {
        // ถ้ากำลังลาก link และยังไม่มีเป้าหมาย ให้เช็ค ณ ตำแหน่งปล่อยอีกครั้ง
        if (state.linkStartNode && !state.linkHoverTargetNode) {
            const pos = e.changedTouches ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY } : { x: e.clientX, y: e.clientY };
            const rect = canvas.getBoundingClientRect();
            const localPos = { x: pos.x - rect.left, y: pos.y - rect.top };
            const hoveredNow = checkNodeUnderPointer(localPos);
            if (hoveredNow && hoveredNow !== state.linkStartNode) {
                state.linkHoverTargetNode = hoveredNow;
            }
        }

        if (state.linkStartNode) {
            if (state.linkHoverTargetNode && state.linkHoverTargetNode !== state.linkStartNode) {
                openLinkBuilderDialog(state.linkStartNode, state.linkHoverTargetNode);
            }
            state.linkStartNode = null;
            state.linkHoverTargetNode = null;
        }
        if (state.dragNode) {
            saveNodeToDB(state.dragNode);
            state.dragNode = null;
        }
        state.isPanning = false;
    };

    canvas.addEventListener('mousedown', onPress);
    canvas.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', onRelease);
    canvas.addEventListener('touchstart', (e) => {
        state.isTouch = true;
        onPress(e);
    }, { passive: true });
    canvas.addEventListener('touchmove', onDrag, { passive: true });
    window.addEventListener('touchend', onRelease);

    canvas.addEventListener('click', (e) => {
        const pos = getPointerPos(e);
        const hit = checkNodeUnderPointer(pos);
        if (hit && !state.linkStartNode) selectAndFocusNode(hit.id);
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const mouse = getPointerPos(e);
        const preZoom = getVirtualCoords(mouse);
        const zoomStep = 1.08;
        if (e.deltaY < 0) state.camera.targetZoom = Math.min(state.camera.targetZoom * zoomStep, 3.5);
        else state.camera.targetZoom = Math.max(state.camera.targetZoom / zoomStep, 0.2);
        state.camera.x = mouse.x - preZoom.x * state.camera.targetZoom;
        state.camera.y = mouse.y - preZoom.y * state.camera.targetZoom;
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') state.isShiftPressed = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') state.isShiftPressed = false;
    });
}

// ----- Fuzzy Search -----
export function fuzzySearch(term, wrapperId, overlayId) {
    const clean = term.trim().toLowerCase();
    const wrap = document.getElementById(wrapperId);
    const clearBtn = document.getElementById(wrapperId === 'desktop-suggestions' ? 'desktop-search-clear' : 'mobile-search-clear');
    if (!clean) {
        wrap.innerHTML = '';
        wrap.classList.add('hidden');
        if (clearBtn) clearBtn.classList.add('hidden');
        return;
    }
    if (clearBtn) clearBtn.classList.remove('hidden');

    const matches = [];
    state.nodes.forEach(n => {
        let score = 0;
        if (n.word.startsWith(clean)) score = 3;
        else if (n.word.includes(clean)) score = 2;
        if (n.definitions) {
            for (const text of Object.values(n.definitions)) {
                if (text.toLowerCase().includes(clean)) {
                    if (score < 1) score = 1;
                    break;
                }
            }
        }
        if (n.definition && n.definition.toLowerCase().includes(clean)) {
            if (score < 1) score = 1;
        }
        if (score > 0) matches.push({ n, score });
    });

    matches.sort((a, b) => b.score - a.score);
    wrap.innerHTML = '';
    wrap.classList.remove('hidden');

    if (matches.length > 0) {
        matches.slice(0, 10).forEach(({ n }) => {
            const div = document.createElement('div');
            div.className = "px-4 py-3 hover:bg-zinc-900 border-b border-zinc-900/60 flex justify-between items-center cursor-pointer active:scale-[0.99] transition-transform";
            div.innerHTML = `
        <div>
          <span class="text-sm font-semibold text-white">${n.word}</span>
          <span class="text-[10px] font-mono text-zinc-500 italic">(${n.pos}.)</span>
        </div>
        <span class="text-xs text-zinc-400 truncate max-w-[160px]">${n.definitions?.en || n.definition || ''}</span>
      `;
            div.onclick = () => {
                selectAndFocusNode(n.id, true);
                wrap.classList.add('hidden');
                if (overlayId) {
                    document.getElementById(overlayId).classList.add('translate-y-full');
                    document.querySelectorAll('nav button').forEach(b => {
                        b.classList.remove('text-violet-400');
                        b.classList.add('text-zinc-500');
                    });
                    document.getElementById('m-tab-graph').classList.add('text-violet-400');
                }
            };
            wrap.appendChild(div);
        });
    } else {
        wrap.innerHTML = `<div class="p-4 text-xs text-zinc-500 italic">No semantic connections matched.</div>`;
    }
}

// ----- เพิ่มโหนด -----
export async function submitAddNodeForm(word, pos, definitions, rel, relType) {
    if (!word || !definitions || Object.keys(definitions).length === 0) return;
    const id = word.toLowerCase().trim();

    let node = state.nodes.get(id);
    if (!node) {
        node = {
            id,
            word,
            pos,
            definitions,
            examples: [],
            pronunciation: `/${id}/`,
            x: Math.random() * 150 - 75,
            y: Math.random() * 150 - 75,
            vx: 0,
            vy: 0,
            weight: 0
        };
        state.nodes.set(id, node);
        await saveNodeToDB(node);
    }

    if (rel) {
        const targetId = rel.toLowerCase().trim();
        let target = state.nodes.get(targetId);
        if (!target) {
            target = {
                id: targetId,
                word: rel,
                pos: 'noun',
                definitions: { en: `Auto-generated link connection reference with ${word}` },
                examples: [],
                pronunciation: `/${targetId}/`,
                x: node.x + (Math.random() * 40 - 20),
                y: node.y + (Math.random() * 40 - 20),
                vx: 0,
                vy: 0,
                weight: 0
            };
            state.nodes.set(targetId, target);
            await saveNodeToDB(target);
        }
        const linkExists = state.edges.some(e =>
            (e.from === id && e.to === targetId) || (e.from === targetId && e.to === id)
        );
        if (!linkExists) {
            const edge = { from: id, to: targetId, type: relType };
            const edgeId = await saveEdgeToDB(edge);
            state.edges.push({ ...edge, id: edgeId });
        }
    }

    computeNodeWeights();
    syncUIStats();
    selectAndFocusNode(id, true);
    showToast(`Added node: ${word}`);
}

// ============================================================
// HOOK EVENTS
// ============================================================
export function hookEvents() {
    // 1. Draw mode toggle
    const drawModeBtn = document.getElementById('btn-draw-mode');
    const drawModeInd = document.getElementById('draw-mode-indicator');
    const drawModeLbl = document.getElementById('draw-mode-label');
    drawModeBtn.onclick = () => {
        state.isDrawLinkMode = !state.isDrawLinkMode;
        if (state.isDrawLinkMode) {
            drawModeInd.className = "w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse";
            drawModeLbl.innerText = "Link Mode";
            drawModeBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-violet-500 bg-violet-950/40 text-violet-300 transition-all flex items-center gap-1";
            showToast('Link drawing gesture enabled. Drag from node to node.');
        } else {
            drawModeInd.className = "w-1.5 h-1.5 rounded-full bg-zinc-500";
            drawModeLbl.innerText = "Normal";
            drawModeBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 transition-all flex items-center gap-1";
        }
    };

    // 2. Link dialog buttons
    document.getElementById('link-opt-synonym').onclick = () => applyPendingLink('synonym');
    document.getElementById('link-opt-antonym').onclick = () => applyPendingLink('antonym');
    document.getElementById('link-opt-hypernym').onclick = () => applyPendingLink('hypernym');
    document.getElementById('link-opt-related').onclick = () => applyPendingLink('related');

    // 3. Settings
    document.getElementById('btn-desktop-settings').onclick = openSettings;
    document.getElementById('m-btn-settings-open').onclick = openSettings;
    document.getElementById('settings-close').onclick = closeSettings;

    // 4. Inspector close
    document.getElementById('inspector-close').onclick = closeInspector;

    // 5. Desktop search
    const dSearch = document.getElementById('desktop-search');
    dSearch.addEventListener('input', (e) => fuzzySearch(e.target.value, 'desktop-suggestions', null));
    document.getElementById('desktop-search-clear').onclick = () => {
        dSearch.value = '';
        fuzzySearch('', 'desktop-suggestions', null);
    };

    // 6. Desktop add form
    document.getElementById('desktop-add-form').onsubmit = async (e) => {
        e.preventDefault();
        const word = document.getElementById('d-new-word').value;
        const pos = document.getElementById('d-new-pos').value;
        const defEn = document.getElementById('d-new-def-en').value;
        const defTh = document.getElementById('d-new-def-th').value;
        const definitions = {};
        if (defEn) definitions.en = defEn;
        if (defTh) definitions.th = defTh;
        const rel = document.getElementById('d-new-rel').value;
        const relType = document.getElementById('d-new-rel-type').value;
        await submitAddNodeForm(word, pos, definitions, rel, relType);
        e.target.reset();
    };

    // 7. Desktop filters
    document.getElementById('desktop-filters').addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT') {
            state.filters[e.target.getAttribute('data-edge-type')] = e.target.checked;
            filterGraphScope();
        }
    });

    // 8. Desktop scope
    const dScopeGlobal = document.getElementById('d-scope-global');
    const dScopeLocal = document.getElementById('d-scope-local');
    dScopeGlobal.onclick = () => {
        state.scope = 'global';
        dScopeGlobal.className = "py-1 text-xs rounded text-center transition-colors bg-zinc-850 text-violet-400 font-medium";
        dScopeLocal.className = "py-1 text-xs rounded text-center transition-colors text-zinc-400 font-medium";
        filterGraphScope();
    };
    dScopeLocal.onclick = () => {
        state.scope = 'local';
        dScopeLocal.className = "py-1 text-xs rounded text-center transition-colors bg-zinc-850 text-violet-400 font-medium";
        dScopeGlobal.className = "py-1 text-xs rounded text-center transition-colors text-zinc-400 font-medium";
        filterGraphScope();
    };

    // 9. Desktop depth slider
    const dSlider = document.getElementById('d-depth-slider');
    dSlider.oninput = (e) => {
        const val = parseInt(e.target.value);
        state.depth = val;
        document.getElementById('d-depth-val').innerText = `${val} hop${val > 1 ? 's' : ''}`;
        if (state.scope === 'local') filterGraphScope();
    };

    // 10. Sidebar expand
    const btnExpand = document.getElementById('btn-expand-sidebar');
    const dSidebar = document.getElementById('desktop-sidebar');
    btnExpand.onclick = () => {
        dSidebar.style.display = 'flex';
        btnExpand.style.display = 'none';
        setTimeout(() => dSidebar.classList.remove('-translate-x-full'), 20);
    };

    // 11. Mobile overlays
    const searchOverlay = document.getElementById('m-overlay-search');
    const addOverlay = document.getElementById('m-overlay-add');
    const filterOverlay = document.getElementById('m-overlay-filters');

    function closeAllMobileOverlays() {
        [searchOverlay, addOverlay, filterOverlay].forEach(o => o.classList.add('translate-y-full'));
        document.querySelectorAll('nav button').forEach(b => {
            b.classList.remove('text-violet-400');
            b.classList.add('text-zinc-500');
        });
        document.getElementById('m-tab-graph').classList.add('text-violet-400');
    }

    function openMobileOverlay(target, tabId) {
        closeAllMobileOverlays();
        closeSettings();
        target.classList.remove('translate-y-full');
        document.getElementById('m-tab-graph').classList.remove('text-violet-400');
        const activeTab = document.getElementById(tabId);
        activeTab.classList.remove('text-zinc-500');
        activeTab.classList.add('text-violet-400');
    }

    document.getElementById('btn-close-search').onclick = closeAllMobileOverlays;
    document.getElementById('btn-close-add').onclick = closeAllMobileOverlays;
    document.getElementById('btn-close-filters').onclick = closeAllMobileOverlays;
    document.getElementById('m-tab-graph').onclick = closeAllMobileOverlays;
    document.getElementById('m-tab-search').onclick = () => openMobileOverlay(searchOverlay, 'm-tab-search');
    document.getElementById('m-tab-add').onclick = () => openMobileOverlay(addOverlay, 'm-tab-add');
    document.getElementById('m-tab-filters').onclick = () => openMobileOverlay(filterOverlay, 'm-tab-filters');

    // 12. Mobile search
    const mSearch = document.getElementById('mobile-search');
    mSearch.addEventListener('input', (e) => fuzzySearch(e.target.value, 'mobile-suggestions', 'm-overlay-search'));
    document.getElementById('mobile-search-clear').onclick = () => {
        mSearch.value = '';
        fuzzySearch('', 'mobile-suggestions', null);
    };

    // 13. Mobile add form
    document.getElementById('mobile-add-form').onsubmit = async (e) => {
        e.preventDefault();
        const word = document.getElementById('m-new-word').value;
        const pos = document.getElementById('m-new-pos').value;
        const defEn = document.getElementById('m-new-def-en').value;
        const defTh = document.getElementById('m-new-def-th').value;
        const definitions = {};
        if (defEn) definitions.en = defEn;
        if (defTh) definitions.th = defTh;
        const rel = document.getElementById('m-new-rel').value;
        const relType = document.getElementById('m-new-rel-type').value;
        await submitAddNodeForm(word, pos, definitions, rel, relType);
        e.target.reset();
        closeAllMobileOverlays();
    };

    // 14. Mobile filters
    document.getElementById('mobile-filters').addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT') {
            state.filters[e.target.getAttribute('data-edge-type')] = e.target.checked;
            filterGraphScope();
        }
    });

    const mScopeGlobal = document.getElementById('m-scope-global');
    const mScopeLocal = document.getElementById('m-scope-local');
    mScopeGlobal.onclick = () => {
        state.scope = 'global';
        mScopeGlobal.className = "py-2.5 text-xs rounded-lg text-center transition-colors bg-zinc-850 text-violet-400 font-medium";
        mScopeLocal.className = "py-2.5 text-xs rounded-lg text-center transition-colors text-zinc-400 font-medium";
        filterGraphScope();
    };
    mScopeLocal.onclick = () => {
        state.scope = 'local';
        mScopeLocal.className = "py-2.5 text-xs rounded-lg text-center transition-colors bg-zinc-850 text-violet-400 font-medium";
        mScopeGlobal.className = "py-2.5 text-xs rounded-lg text-center transition-colors text-zinc-400 font-medium";
        filterGraphScope();
    };

    const mSlider = document.getElementById('m-depth-slider');
    mSlider.oninput = (e) => {
        const val = parseInt(e.target.value);
        state.depth = val;
        document.getElementById('m-depth-val').innerText = `${val} hop${val > 1 ? 's' : ''}`;
        if (state.scope === 'local') filterGraphScope();
    };

    // 15. Edit modal
    const editMod = document.getElementById('edit-modal');
    document.getElementById('btn-inspector-edit').onclick = () => {
        const node = state.nodes.get(state.activeNodeId);
        if (!node) return;
        document.getElementById('edit-word-id').value = node.id;
        document.getElementById('edit-word').value = node.word;
        document.getElementById('edit-pos').value = node.pos;
        document.getElementById('edit-definition-en').value = node.definitions?.en || '';
        document.getElementById('edit-definition-th').value = node.definitions?.th || '';
        document.getElementById('edit-examples').value = (node.examples || []).join('\n');
        editMod.classList.remove('hidden');
    };

    const closeEdit = () => editMod.classList.add('hidden');
    document.getElementById('edit-modal-close').onclick = closeEdit;
    document.getElementById('edit-modal-cancel').onclick = closeEdit;

    document.getElementById('edit-word-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-word-id').value;
        const pos = document.getElementById('edit-pos').value;
        const defEn = document.getElementById('edit-definition-en').value;
        const defTh = document.getElementById('edit-definition-th').value;
        const definitions = {};
        if (defEn) definitions.en = defEn;
        if (defTh) definitions.th = defTh;
        const examples = document.getElementById('edit-examples').value.split('\n').filter(Boolean);
        const node = state.nodes.get(id);
        if (node) {
            node.pos = pos;
            node.definitions = definitions;
            node.examples = examples;
            await saveNodeToDB(node);
            showToast(`Updated "${node.word}"`);
            updateInspectorPanel(node);
            filterGraphScope();
        }
        closeEdit();
    };

    // 16. Delete node
    document.getElementById('btn-inspector-delete').onclick = async () => {
        const node = state.nodes.get(state.activeNodeId);
        if (!node) return;
        const confirmOverlay = document.createElement('div');
        confirmOverlay.className = "fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4";
        confirmOverlay.innerHTML = `
      <div class="bg-zinc-950 border border-zinc-900 p-6 rounded-[20px] max-w-sm w-full space-y-4">
        <h4 class="text-sm font-bold uppercase tracking-wider text-red-500">Delete Semantic Node?</h4>
        <p class="text-xs text-zinc-400 leading-relaxed">This permanently deletes <strong>"${node.word}"</strong> and its linking connections from storage.</p>
        <div class="flex justify-end gap-2.5">
          <button id="cancel-del" class="px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300">Cancel</button>
          <button id="confirm-del" class="px-4 py-2 bg-red-600 rounded-xl text-xs text-white font-bold">Delete</button>
        </div>
      </div>
    `;
        document.body.appendChild(confirmOverlay);
        confirmOverlay.querySelector('#cancel-del').onclick = () => confirmOverlay.remove();
        confirmOverlay.querySelector('#confirm-del').onclick = async () => {
            confirmOverlay.remove();
            await deleteNodeFromDB(node.id);
            state.nodes.delete(node.id);
            state.edges = state.edges.filter(e => e.from !== node.id && e.to !== node.id);
            computeNodeWeights();
            syncUIStats();
            loadInspector();
            showToast(`Deleted "${node.word}"`);
        };
    };

    // 17. Camera controls
    document.getElementById('cam-fit-view').onclick = () => {
        const dpr = window.devicePixelRatio || 1;
        state.camera.x = canvas.width / (2 * dpr);
        state.camera.y = canvas.height / (2 * dpr);
        state.camera.targetZoom = 0.9;
    };
    document.getElementById('cam-zoom-in').onclick = () => state.camera.targetZoom = Math.min(state.camera.targetZoom * 1.35, 3.5);
    document.getElementById('cam-zoom-out').onclick = () => state.camera.targetZoom = Math.max(state.camera.targetZoom / 1.35, 0.2);

    // 18. Import / Export
    const fileIn = document.getElementById('file-import-input');
    document.getElementById('btn-d-import').onclick = () => fileIn.click();
    fileIn.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed.nodes || !parsed.edges) throw new Error('Invalid structure');
                const db = await openDatabase();
                const tx = db.transaction(['nodes', 'edges'], 'readwrite');
                tx.objectStore('nodes').clear();
                tx.objectStore('edges').clear();
                parsed.nodes.forEach(n => tx.objectStore('nodes').put(n));
                parsed.edges.forEach(ed => tx.objectStore('edges').add(ed));
                tx.oncomplete = async () => {
                    showToast('Import completed successfully.');
                    await loadAllFromDB();
                    loadInspector();
                    closeSettings();
                };
            } catch (err) {
                showToast('Import error: Invalid file format.');
            }
        };
        reader.readAsText(file);
    };

    document.getElementById('btn-d-export').onclick = () => {
        const payload = {
            nodes: Array.from(state.nodes.values()),
            edges: state.edges
        };
        const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', data);
        a.setAttribute('download', 'semantic_graph_dictionary.json');
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Backup exported.');
    };

    // 19. Reset seed
    const confirmReset = async () => {
        await resetDatabaseToDefault();
        await loadAllFromDB();
        loadInspector();
        closeSettings();
        showToast('Database reset to seed.');
    };
    document.getElementById('btn-m-reset').onclick = confirmReset;
    document.getElementById('btn-desktop-reset').onclick = confirmReset;

    // 20. Desktop add toggle
    const desktopAddToggle = document.getElementById('desktop-add-toggle');
    const desktopAddBody = document.getElementById('desktop-add-body');
    const desktopAddChevron = document.getElementById('desktop-add-chevron');
    desktopAddToggle.onclick = () => {
        desktopAddBody.classList.toggle('hidden');
        desktopAddChevron.classList.toggle('rotate-180');
    };
}