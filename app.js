// Initial Seed Database
const SEED_DATA = {
    nodes: [
        { id: "meticulous", word: "meticulous", pos: "adj", definition: "Showing great attention to detail; very careful and precise.", examples: ["He was meticulous about keeping his records.", "Meticulous design makes UI seamless on mobile devices."], pronunciation: "/məˈtɪk.jə.ləs/" },
        { id: "precise", word: "precise", pos: "adj", definition: "Marked by exactness and accuracy of expression or detail.", examples: ["The system gave precise directions.", "We require precise measurements."], pronunciation: "/prɪˈsaɪs/" },
        { id: "careless", word: "careless", pos: "adj", definition: "Not giving sufficient attention or thought to avoiding harm or errors.", examples: ["A careless mistake disrupted the server system."], pronunciation: "/ˈkeə.ləs/" },
        { id: "sloppy", word: "sloppy", pos: "adj", definition: "Careless and unsystematic; excessively casual or messy.", examples: ["The layout code was sloppy, causing layout overflows."], pronunciation: "/ˈslɒp.i/" },
        { id: "diligent", word: "diligent", pos: "adj", definition: "Having or showing care and conscientiousness in one's work or duties.", examples: ["She is a diligent student who researched every detail."], pronunciation: "/ˈdɪl.ɪ.dʒənt/" },
        { id: "conscientious", word: "conscientious", pos: "adj", definition: "Wishing to do what is right, especially to do one's work or duty well and thoroughly.", examples: ["A conscientious designer tests layouts on mobile devices."], pronunciation: "/ˌkɒn.ʃiˈen.ʃəs/" },
        { id: "vague", word: "vague", pos: "adj", definition: "Of uncertain, indefinite, or unclear character or meaning.", examples: ["The requirements were too vague to construct logic."], pronunciation: "/veɪɡ/" }
    ],
    edges: [
        { from: "meticulous", to: "precise", type: "synonym" },
        { from: "meticulous", to: "careless", type: "antonym" },
        { from: "meticulous", to: "diligent", type: "synonym" },
        { from: "meticulous", to: "conscientious", type: "synonym" },
        { from: "precise", to: "vague", type: "antonym" },
        { from: "sloppy", to: "careless", type: "synonym" },
        { from: "sloppy", to: "meticulous", type: "antonym" },
        { from: "diligent", to: "conscientious", type: "synonym" }
    ]
};

// State Mapping
const state = {
    nodes: new Map(),
    edges: [],
    visibleNodes: [],
    visibleEdges: [],
    activeNodeId: null,
    filters: {
        synonym: true,
        antonym: true,
        hypernym: true,
        related: true
    },
    scope: 'global',
    depth: 2,
    camera: { x: 0, y: 0, zoom: 1, targetZoom: 1 },
    dragNode: null,
    hoverNode: null,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    isTouch: false,

    // Direct link drawer state vars
    isShiftPressed: false,
    isDrawLinkMode: false,
    linkStartNode: null,
    linkDragCoords: { x: 0, y: 0 },
    linkHoverTargetNode: null,
    pendingLink: null
};

// Physics Tuning Defaults Configuration
const PHYSICS_CONFIG = {
    repulsion: 7500,
    spring: 130,
    springK: 0.07,
    gravity: 0.009,
    friction: 0.82,

    // Renderer styles
    baseNodeRadius: 22
};

// Core Configs
const DB_NAME = 'semanticGraphDB_v3';
const DB_VERSION = 1;

// Elements
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
const inspector = document.getElementById('inspector');
const settingsPanel = document.getElementById('settings-panel');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');
const linkDialog = document.getElementById('link-dialog');

// ==========================================
// INDEXED DATABASE STORAGE HANDLERS
// ==========================================
function openDatabase() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('nodes')) db.createObjectStore('nodes', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('edges')) db.createObjectStore('edges', { autoIncrement: true });
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function loadAllFromDB() {
    const db = await openDatabase();

    const getNodes = new Promise(resolve => {
        const req = db.transaction('nodes', 'readonly').objectStore('nodes').getAll();
        req.onsuccess = () => resolve(req.result);
    });
    const getEdges = new Promise(resolve => {
        const req = db.transaction('edges', 'readonly').objectStore('edges').getAll();
        req.onsuccess = () => resolve(req.result);
    });

    const [nodes, edges] = await Promise.all([getNodes, getEdges]);

    if (nodes.length === 0) {
        await resetDatabaseToDefault();
        return loadAllFromDB();
    }

    state.nodes.clear();
    nodes.forEach(n => {
        state.nodes.set(n.id, {
            ...n,
            x: n.x ?? (Math.random() * 300 - 150),
            y: n.y ?? (Math.random() * 300 - 150),
            vx: 0, vy: 0, weight: 0
        });
    });
    state.edges = edges;

    computeNodeWeights();
    syncUIStats();
    filterGraphScope();
}

async function saveNodeToDB(node) {
    const db = await openDatabase();
    const tx = db.transaction('nodes', 'readwrite');
    tx.objectStore('nodes').put({
        id: node.id, word: node.word, pos: node.pos,
        definition: node.definition, examples: node.examples,
        pronunciation: node.pronunciation, x: node.x, y: node.y
    });
}

async function saveEdgeToDB(edge) {
    const db = await openDatabase();
    const tx = db.transaction('edges', 'readwrite');
    tx.objectStore('edges').add(edge);
}

async function deleteNodeFromDB(id) {
    const db = await openDatabase();
    const tx = db.transaction(['nodes', 'edges'], 'readwrite');
    tx.objectStore('nodes').delete(id);

    const edgeStore = tx.objectStore('edges');
    const req = edgeStore.openCursor();
    req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (cursor.value.from === id || cursor.value.to === id) cursor.delete();
            cursor.continue();
        }
    };
}

async function resetDatabaseToDefault() {
    const db = await openDatabase();
    const tx = db.transaction(['nodes', 'edges'], 'readwrite');
    tx.objectStore('nodes').clear();
    tx.objectStore('edges').clear();
    SEED_DATA.nodes.forEach(n => tx.objectStore('nodes').put(n));
    SEED_DATA.edges.forEach(e => tx.objectStore('edges').add(e));
    return new Promise(resolve => tx.oncomplete = () => {
        showToast("Database seeded successfully.");
        resolve();
    });
}

async function eraseEntireDatabase() {
    const db = await openDatabase();
    const tx = db.transaction(['nodes', 'edges'], 'readwrite');
    tx.objectStore('nodes').clear();
    tx.objectStore('edges').clear();
    return new Promise(resolve => tx.oncomplete = () => {
        showToast("Local database cleared empty.");
        resolve();
    });
}

function computeNodeWeights() {
    state.nodes.forEach(n => n.weight = 0);
    state.edges.forEach(e => {
        const f = state.nodes.get(e.from);
        const t = state.nodes.get(e.to);
        if (f) f.weight++;
        if (t) t.weight++;
    });
}

function syncUIStats() {
    document.getElementById('d-total-nodes').innerText = state.nodes.size;
    document.getElementById('m-stats').innerText = `${state.nodes.size} words • ${state.edges.length} links`;
}

// ==========================================
// DYNAMIC GRAPH FILTERING & MATH PHYSICS
// ==========================================
function filterGraphScope() {
    const activeTypes = Object.keys(state.filters).filter(k => state.filters[k]);
    const filteredEdges = state.edges.filter(e => activeTypes.includes(e.type));

    if (state.scope === 'global') {
        state.visibleNodes = Array.from(state.nodes.values());
        state.visibleEdges = filteredEdges.filter(e => state.nodes.has(e.from) && state.nodes.has(e.to));
    } else {
        if (!state.activeNodeId || !state.nodes.has(state.activeNodeId)) {
            state.activeNodeId = state.nodes.keys().next().value || null;
        }
        if (!state.activeNodeId) {
            state.visibleNodes = []; state.visibleEdges = []; return;
        }

        const visited = new Set([state.activeNodeId]);
        const edgesToKeep = [];
        let frontier = [state.activeNodeId];

        for (let i = 0; i < state.depth; i++) {
            const nextFrontier = [];
            for (const currId of frontier) {
                for (const edge of filteredEdges) {
                    let neighbor = null;
                    if (edge.from === currId) neighbor = edge.to;
                    else if (edge.to === currId) neighbor = edge.from;

                    if (neighbor && state.nodes.has(neighbor)) {
                        edgesToKeep.push(edge);
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            nextFrontier.push(neighbor);
                        }
                    }
                }
            }
            frontier = nextFrontier;
        }
        state.visibleNodes = Array.from(visited).map(id => state.nodes.get(id));
        state.visibleEdges = Array.from(new Set(edgesToKeep));
    }
}

function updatePhysics() {
    const nodes = state.visibleNodes;
    const edges = state.visibleEdges;
    if (nodes.length === 0) return;

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
        const u = nodes[i];
        if (u === state.dragNode) continue;
        for (let j = i + 1; j < nodes.length; j++) {
            const v = nodes[j];
            let dx = v.x - u.x;
            let dy = v.y - u.y;
            if (dx === 0 && dy === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
            const dSq = dx * dx + dy * dy;
            const dist = Math.sqrt(dSq);
            if (dist < 450) {
                const force = PHYSICS_CONFIG.repulsion / (dSq + 2);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                u.vx -= fx; u.vy -= fy;
                if (v !== state.dragNode) { v.vx += fx; v.vy += fy; }
            }
        }
    }

    // Spring Connective tension
    for (const edge of edges) {
        const u = state.nodes.get(edge.from);
        const v = state.nodes.get(edge.to);
        if (!u || !v) continue;
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const delta = dist - PHYSICS_CONFIG.spring;
        const force = delta * PHYSICS_CONFIG.springK;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (u !== state.dragNode) { u.vx += fx; u.vy += fy; }
        if (v !== state.dragNode) { v.vx -= fx; v.vy -= fy; }
    }

    // Central gravity / Integration
    for (const node of nodes) {
        if (node === state.dragNode) continue;
        node.vx -= node.x * PHYSICS_CONFIG.gravity;
        node.vy -= node.y * PHYSICS_CONFIG.gravity;
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= PHYSICS_CONFIG.friction;
        node.vy *= PHYSICS_CONFIG.friction;
    }
}

// ==========================================
// CANVAS DRAW LOOP (HIGH PERFORMANCE RETINA)
// ==========================================
const COLOR_THEME = {
    synonym: '#10b981', antonym: '#f43f5e', hypernym: '#f59e0b', related: '#8b5cf6',
    nodeBg: '#18181b', strokeFocus: '#8b5cf6', text: '#ffffff', textMuted: '#a1a1aa'
};

function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.parentElement.clientWidth * dpr;
    canvas.height = canvas.parentElement.clientHeight * dpr;
    ctx.scale(dpr, dpr);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Interpolate camera zoom
    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.15;
    ctx.translate(state.camera.x, state.camera.y);
    ctx.scale(state.camera.zoom, state.camera.zoom);

    // 1. Draw Edges
    for (const edge of state.visibleEdges) {
        const u = state.nodes.get(edge.from);
        const v = state.nodes.get(edge.to);
        if (!u || !v) continue;
        const focusMatch = state.activeNodeId && (edge.from === state.activeNodeId || edge.to === state.activeNodeId);

        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.strokeStyle = COLOR_THEME[edge.type] || '#ffffff';
        ctx.globalAlpha = state.activeNodeId ? (focusMatch ? 0.9 : 0.12) : 0.45;
        ctx.lineWidth = focusMatch ? 3.0 : 1.5;
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Draw interactive dotted lasso cable if in linking gesture
    if (state.linkStartNode) {
        ctx.beginPath();
        ctx.moveTo(state.linkStartNode.x, state.linkStartNode.y);
        ctx.lineTo(state.linkDragCoords.x, state.linkDragCoords.y);
        ctx.strokeStyle = '#a78bfa'; // Violet line
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.setLineDash([]); // Reset
    }

    // 2. Draw Nodes
    for (const node of state.visibleNodes) {
        const radius = PHYSICS_CONFIG.baseNodeRadius + Math.min(node.weight * 2.5, 18);
        const isFocused = state.activeNodeId === node.id;
        const isHovered = state.hoverNode === node;
        const isLinkTarget = state.linkHoverTargetNode === node;

        const isNeighbor = state.activeNodeId && state.visibleEdges.some(e =>
            (e.from === state.activeNodeId && e.to === node.id) || (e.to === state.activeNodeId && e.from === node.id)
        );

        ctx.save();
        ctx.translate(node.x, node.y);

        let alpha = 1.0;
        if (state.activeNodeId) {
            if (isFocused) alpha = 1.0;
            else if (isNeighbor) alpha = 0.85;
            else alpha = 0.25;
        }
        ctx.globalAlpha = alpha;

        // Shadow ring on focus or direct link hover
        if (isFocused || isLinkTarget) {
            ctx.beginPath();
            ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
            ctx.fillStyle = isLinkTarget ? 'rgba(167, 139, 250, 0.35)' : 'rgba(139, 92, 246, 0.18)';
            ctx.fill();
        }

        // Main Node Core
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = isFocused ? '#8b5cf6' : (isHovered || isLinkTarget ? '#27272a' : COLOR_THEME.nodeBg);
        ctx.fill();
        ctx.strokeStyle = isFocused || isLinkTarget ? '#c084fc' : (isHovered ? '#52525b' : '#3f3f46');
        ctx.lineWidth = isFocused || isHovered || isLinkTarget ? 3.0 : 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = COLOR_THEME.text;
        ctx.font = `600 ${isFocused ? '14px' : '12px'} -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.word, 0, 0);

        // POS
        if (state.camera.zoom > 0.45) {
            ctx.fillStyle = isFocused ? '#f3e8ff' : COLOR_THEME.textMuted;
            ctx.font = 'italic 9px monospace';
            ctx.fillText(`(${node.pos}.)`, 0, radius + 14);
        }
        ctx.restore();
    }
    ctx.restore();
}

function frame() {
    updatePhysics();
    render();
    requestAnimationFrame(frame);
}

// ==========================================
// SELECTION & COMPREHENSIVE UI BINDING
// ==========================================
function selectAndFocusNode(id, recenterCameraView = false) {
    if (!state.nodes.has(id)) return;
    state.activeNodeId = id;
    const node = state.nodes.get(id);

    if (recenterCameraView) {
        state.camera.targetZoom = 1.1;
        state.camera.x = canvas.width / (2 * (window.devicePixelRatio || 1)) - (node.x * state.camera.targetZoom);
        state.camera.y = canvas.height / (2 * (window.devicePixelRatio || 1)) - (node.y * state.camera.targetZoom);
    }

    filterGraphScope();
    updateInspectorPanel(node);
}

function updateInspectorPanel(node) {
    document.getElementById('inspector-title').innerText = node.word;
    document.getElementById('inspector-pronunciation').innerText = node.pronunciation || `/${node.word}/`;
    document.getElementById('inspector-pos').innerText = `${node.pos}.`;
    document.getElementById('inspector-definition').innerText = node.definition;

    // Render Examples
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

    // Render relation connections
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

            const badge = document.createElement('button');
            badge.className = "px-2.5 py-1 text-[10px] rounded-lg border font-semibold font-mono active:scale-95 transition-transform shrink-0";
            badge.innerText = target.word;
            badge.onclick = () => selectAndFocusNode(targetId, true);

            if (e.type === 'synonym') {
                badge.className += " border-emerald-950 bg-emerald-950/20 text-emerald-400";
                synCon.appendChild(badge);
                synC++;
            } else if (e.type === 'antonym') {
                badge.className += " border-rose-950 bg-rose-950/20 text-rose-400";
                antCon.appendChild(badge);
                antC++;
            } else {
                badge.className += " border-zinc-800 bg-zinc-900 text-zinc-300";
                relCon.appendChild(badge);
                relC++;
            }
        }
    });

    if (!synC) synCon.innerHTML = `<span class="text-[10px] text-zinc-650">None</span>`;
    if (!antC) antCon.innerHTML = `<span class="text-[10px] text-zinc-650">None</span>`;
    if (!relC) relCon.innerHTML = `<span class="text-[10px] text-zinc-650">None</span>`;

    // Slide up/over the inspector panel safely
    inspector.classList.remove('hidden', 'translate-y-full', 'md:translate-x-full');
    inspector.classList.add('translate-y-0', 'md:translate-x-0');

    // Close settings to prevent overlapping panels
    closeSettings();
}

function loadInspector() {
    inspector.classList.remove('hidden');

    state.activeNodeId = null;
    filterGraphScope();
}

function closeInspector() {
    inspector.classList.add('hidden');

    state.activeNodeId = null;
    filterGraphScope();
}
// ==========================================
// SYSTEM SETTINGS HUB ACTIONS
// ==========================================
function openSettings() {
    // Setup panel active transition classes
    // Mobile: slide up
    settingsPanel.classList.remove('translate-y-full');
    settingsPanel.classList.add('translate-y-0');

    // Desktop: opacity / pointer events / centered full screen overlay
    settingsPanel.classList.remove('md:opacity-0', 'md:pointer-events-none');
    settingsPanel.classList.add('md:opacity-100', 'md:pointer-events-auto');

    // Close inspector to prevent overlapping panels
    loadInspector();
}

function closeSettings() {
    // Mobile: slide down
    settingsPanel.classList.add('translate-y-full');
    settingsPanel.classList.remove('translate-y-0');

    // Desktop: opacity / pointer events / centered full screen overlay
    settingsPanel.classList.add('md:opacity-0', 'md:pointer-events-none');
    settingsPanel.classList.remove('md:opacity-100', 'md:pointer-events-auto');
}

// Load, Sync and Bind HTML Sliders to Settings State
function initializeSettingsSliders() {
    const sliders = {
        repulsion: { el: 'slider-repulsion', valEl: 'val-repulsion', suffix: '', convert: (v) => parseInt(v) },
        spring: { el: 'slider-spring', valEl: 'val-spring', suffix: 'px', convert: (v) => parseInt(v) },
        springK: { el: 'slider-springK', valEl: 'val-springK', suffix: '', convert: (v) => parseFloat(v) },
        gravity: { el: 'slider-gravity', valEl: 'val-gravity', suffix: '', convert: (v) => parseFloat(v) },
        friction: { el: 'slider-friction', valEl: 'val-friction', suffix: '%', convert: (v) => parseInt(v) / 100, display: (v) => `${v}%` },
        nodeRadius: { el: 'slider-nodeRadius', valEl: 'val-nodeRadius', suffix: '', convert: (v) => parseInt(v) }
    };

    // Set initial values based on current constants
    document.getElementById('slider-repulsion').value = PHYSICS_CONFIG.repulsion;
    document.getElementById('slider-spring').value = PHYSICS_CONFIG.spring;
    document.getElementById('slider-springK').value = PHYSICS_CONFIG.springK;
    document.getElementById('slider-gravity').value = PHYSICS_CONFIG.gravity;
    document.getElementById('slider-friction').value = Math.round(PHYSICS_CONFIG.friction * 100);
    document.getElementById('slider-nodeRadius').value = PHYSICS_CONFIG.baseNodeRadius;

    // Helper function to update setting values on modification
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
        update(); // Run once initially to map labels
    });

    // Clear layout calibration constants to initial levels
    document.getElementById('btn-danger-reset-setting').onclick = () => {
        PHYSICS_CONFIG.repulsion = 7500;
        PHYSICS_CONFIG.spring = 130;
        PHYSICS_CONFIG.springK = 0.07;
        PHYSICS_CONFIG.gravity = 0.009;
        PHYSICS_CONFIG.friction = 0.82;
        PHYSICS_CONFIG.baseNodeRadius = 22;

        initializeSettingsSliders();
        showToast("Engine constants restored to factory settings.");
    };

    // Database erase warning modal trigger
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
        };
    };
}

// Fuzzy search modules
function fuzzySearch(term, wrapperId, overlayId) {
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
        if (n.word.startsWith(clean)) matches.push({ n, score: 3 });
        else if (n.word.includes(clean)) matches.push({ n, score: 2 });
        else if (n.definition.toLowerCase().includes(clean)) matches.push({ n, score: 1 });
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
            <span class="text-xs text-zinc-400 truncate max-w-[160px]">${n.definition}</span>
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

// ==========================================
// KEYBOARD EVENT LISTENERS FOR SHIFT KEY
// ==========================================
window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
        state.isShiftPressed = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
        state.isShiftPressed = false;
    }
});

// ==========================================
// TOUCH & GESTURES INPUT ADAPTOR
// ==========================================
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

// Pointer listeners
function initGestures() {
    const onPress = (e) => {
        const pos = getPointerPos(e);
        const hit = checkNodeUnderPointer(pos);
        const isLinkingActive = state.isShiftPressed || state.isDrawLinkMode;

        if (hit) {
            if (isLinkingActive) {
                state.linkStartNode = hit;
                state.linkDragCoords = getVirtualCoords(pos);
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
            if (hovered && hovered !== state.linkStartNode) {
                state.linkHoverTargetNode = hovered;
            } else {
                state.linkHoverTargetNode = null;
            }
        } else if (state.dragNode) {
            const v = getVirtualCoords(pos);
            state.dragNode.x = v.x;
            state.dragNode.y = v.y;
        } else if (state.isPanning) {
            state.camera.x = pos.x - state.panStart.x;
            state.camera.y = pos.y - state.panStart.y;
        }
    };

    const onRelease = () => {
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
    });
    canvas.addEventListener('touchmove', onDrag);
    window.addEventListener('touchend', onRelease);

    canvas.addEventListener('click', (e) => {
        const pos = getPointerPos(e);
        const hit = checkNodeUnderPointer(pos);
        if (hit && !state.linkStartNode) selectAndFocusNode(hit.id);
    });

    // Passive mouse zoom
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
}

// Open Interactive Link Snapping modal dialog
function openLinkBuilderDialog(fromNode, toNode) {
    state.pendingLink = { fromId: fromNode.id, toId: toNode.id };

    document.getElementById('link-source').innerText = fromNode.word;
    document.getElementById('link-target').innerText = toNode.word;

    linkDialog.classList.remove('hidden');
}

function closeLinkBuilderDialog() {
    linkDialog.classList.add('hidden');
    state.pendingLink = null;
}

async function applyPendingLink(type) {
    if (!state.pendingLink) return;
    const { fromId, toId } = state.pendingLink;

    const linkExists = state.edges.some(e =>
        (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
    );

    if (linkExists) {
        showToast(`These words are already linked.`);
    } else {
        const edge = { from: fromId, to: toId, type: type };
        state.edges.push(edge);
        await saveEdgeToDB(edge);

        computeNodeWeights();
        syncUIStats();
        filterGraphScope();

        const fromWord = state.nodes.get(fromId).word;
        const toWord = state.nodes.get(toId).word;
        showToast(`Linked: ${fromWord} ↔ ${toWord} (${type})`);

        if (state.activeNodeId === fromId || state.activeNodeId === toId) {
            selectAndFocusNode(state.activeNodeId);
        }
    }
    closeLinkBuilderDialog();
}

// ==========================================
// ACTION HANDLERS SETUP & FORMS
// ==========================================
async function submitAddNodeForm(word, pos, def, rel, relType) {
    if (!word || !def) return;
    const id = word.toLowerCase().trim();

    let node = state.nodes.get(id);
    if (!node) {
        node = {
            id, word, pos, definition: def, examples: [], pronunciation: `/${id}/`,
            x: Math.random() * 150 - 75, y: Math.random() * 150 - 75,
            vx: 0, vy: 0, weight: 0
        };
        state.nodes.set(id, node);
        await saveNodeToDB(node);
    }

    if (rel) {
        const targetId = rel.toLowerCase().trim();
        let target = state.nodes.get(targetId);
        if (!target) {
            target = {
                id: targetId, word: rel, pos: 'noun',
                definition: `Auto-generated link connection reference with ${word}`,
                examples: [], pronunciation: `/${targetId}/`,
                x: node.x + (Math.random() * 40 - 20), y: node.y + (Math.random() * 40 - 20),
                vx: 0, vy: 0, weight: 0
            };
            state.nodes.set(targetId, target);
            await saveNodeToDB(target);
        }

        const linkExists = state.edges.some(e =>
            (e.from === id && e.to === targetId) || (e.from === targetId && e.to === id)
        );
        if (!linkExists) {
            const edge = { from: id, to: targetId, type: relType };
            state.edges.push(edge);
            await saveEdgeToDB(edge);
        }
    }

    computeNodeWeights();
    syncUIStats();
    selectAndFocusNode(id, true);
    showToast(`Added node: ${word}`);
}

// Event hooks
function hookEvents() {
    // Toggle Link Drawing trigger button logic
    const drawModeBtn = document.getElementById('btn-draw-mode');
    const drawModeInd = document.getElementById('draw-mode-indicator');
    const drawModeLbl = document.getElementById('draw-mode-label');

    drawModeBtn.onclick = () => {
        state.isDrawLinkMode = !state.isDrawLinkMode;
        if (state.isDrawLinkMode) {
            drawModeInd.className = "w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse";
            drawModeLbl.innerText = "Link Mode";
            drawModeBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-violet-500 bg-violet-950/40 text-violet-300 transition-all flex items-center gap-1";
            showToast("Link drawing gesture enabled. Drag from node to node.");
        } else {
            drawModeInd.className = "w-1.5 h-1.5 rounded-full bg-zinc-500";
            drawModeLbl.innerText = "Normal";
            drawModeBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 transition-all flex items-center gap-1";
        }
    };

    // Connective Snapper hooks
    document.getElementById('link-opt-synonym').onclick = () => applyPendingLink('synonym');
    document.getElementById('link-opt-antonym').onclick = () => applyPendingLink('antonym');
    document.getElementById('link-opt-hypernym').onclick = () => applyPendingLink('hypernym');
    document.getElementById('link-opt-related').onclick = () => applyPendingLink('related');
    document.getElementById('link-opt-cancel').onclick = closeLinkBuilderDialog;

    // Settings open triggers (Both Desktop + Mobile Header)
    document.getElementById('btn-desktop-settings').onclick = openSettings;
    document.getElementById('m-btn-settings-open').onclick = openSettings;
    document.getElementById('settings-close').onclick = closeSettings;

    // Desktop search
    const dSearch = document.getElementById('desktop-search');
    dSearch.addEventListener('input', (e) => fuzzySearch(e.target.value, 'desktop-suggestions', null));
    document.getElementById('desktop-search-clear').onclick = () => { dSearch.value = ''; fuzzySearch('', 'desktop-suggestions', null); };

    // Desktop Collapsible Add Entry accordion toggle
    const desktopAddToggle = document.getElementById('desktop-add-toggle');
    const desktopAddBody = document.getElementById('desktop-add-body');
    const desktopAddChevron = document.getElementById('desktop-add-chevron');

    desktopAddToggle.onclick = () => {
        if (desktopAddBody.classList.contains('hidden')) {
            desktopAddBody.classList.remove('hidden');
            desktopAddChevron.classList.remove('rotate-180');
        } else {
            desktopAddBody.classList.add('hidden');
            desktopAddChevron.classList.add('rotate-180');
        }
    };

    // Desktop Add Word Submit
    document.getElementById('desktop-add-form').onsubmit = async (e) => {
        e.preventDefault();
        const word = document.getElementById('d-new-word').value;
        const pos = document.getElementById('d-new-pos').value;
        const def = document.getElementById('d-new-def').value;
        const rel = document.getElementById('d-new-rel').value;
        const relType = document.getElementById('d-new-rel-type').value;

        await submitAddNodeForm(word, pos, def, rel, relType);
        e.target.reset();
    };

    // Desktop Filters
    document.getElementById('desktop-filters').addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT') {
            state.filters[e.target.getAttribute('data-edge-type')] = e.target.checked;
            filterGraphScope();
        }
    });

    // Desktop Scopes
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

    // Desktop Hops slider
    const dSlider = document.getElementById('d-depth-slider');
    dSlider.oninput = (e) => {
        const val = parseInt(e.target.value);
        state.depth = val;
        document.getElementById('d-depth-val').innerText = `${val} hop${val > 1 ? 's' : ''}`;
        if (state.scope === 'local') filterGraphScope();
    };

    // Sidebar Collapsing (Computer layout)
    const btnExpand = document.getElementById('btn-expand-sidebar');
    const dSidebar = document.getElementById('desktop-sidebar');

    btnExpand.onclick = () => {
        dSidebar.style.display = 'flex';
        btnExpand.style.display = 'none';
        setTimeout(() => dSidebar.classList.remove('-translate-x-full'), 20);
    };

    // Mobile Overlay Switches
    const searchOverlay = document.getElementById('m-overlay-search');
    const addOverlay = document.getElementById('m-overlay-add');
    const filterOverlay = document.getElementById('m-overlay-filters');

    const tabs = [
        { btn: 'm-tab-graph', handler: () => closeAllMobileOverlays() },
        { btn: 'm-tab-search', handler: () => openMobileOverlay(searchOverlay, 'm-tab-search') },
        { btn: 'm-tab-add', handler: () => openMobileOverlay(addOverlay, 'm-tab-add') },
        { btn: 'm-tab-filters', handler: () => openMobileOverlay(filterOverlay, 'm-tab-filters') }
    ];

    function closeAllMobileOverlays() {
        [searchOverlay, addOverlay, filterOverlay].forEach(o => o.classList.add('translate-y-full'));
        tabs.forEach(t => {
            const el = document.getElementById(t.btn);
            el.classList.remove('text-violet-400');
            el.classList.add('text-zinc-500');
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

    tabs.forEach(t => {
        document.getElementById(t.btn).onclick = t.handler;
    });

    // Mobile search input
    const mSearch = document.getElementById('mobile-search');
    mSearch.addEventListener('input', (e) => fuzzySearch(e.target.value, 'mobile-suggestions', 'm-overlay-search'));
    document.getElementById('mobile-search-clear').onclick = () => { mSearch.value = ''; fuzzySearch('', 'mobile-suggestions', null); };

    // Mobile add word submission
    document.getElementById('mobile-add-form').onsubmit = async (e) => {
        e.preventDefault();
        const word = document.getElementById('m-new-word').value;
        const pos = document.getElementById('m-new-pos').value;
        const def = document.getElementById('m-new-def').value;
        const rel = document.getElementById('m-new-rel').value;
        const relType = document.getElementById('m-new-rel-type').value;

        await submitAddNodeForm(word, pos, def, rel, relType);
        e.target.reset();
        closeAllMobileOverlays();
    };

    // Mobile Filters checkbox listener
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

    // Mobile Hops slider depth adjustment
    const mSlider = document.getElementById('m-depth-slider');
    mSlider.oninput = (e) => {
        const val = parseInt(e.target.value);
        state.depth = val;
        document.getElementById('m-depth-val').innerText = `${val} hop${val > 1 ? 's' : ''}`;
        if (state.scope === 'local') filterGraphScope();
    };

    // Edit System Hooks
    const editMod = document.getElementById('edit-modal');
    document.getElementById('btn-inspector-edit').onclick = () => {
        const node = state.nodes.get(state.activeNodeId);
        if (!node) return;
        document.getElementById('edit-word-id').value = node.id;
        document.getElementById('edit-word').value = node.word;
        document.getElementById('edit-pos').value = node.pos;
        document.getElementById('edit-definition').value = node.definition;
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
        const def = document.getElementById('edit-definition').value;
        const examples = document.getElementById('edit-examples').value.split('\n').filter(Boolean);

        const node = state.nodes.get(id);
        if (node) {
            node.pos = pos;
            node.definition = def;
            node.examples = examples;
            await saveNodeToDB(node);
            showToast(`Updated "${node.word}"`);
            updateInspectorPanel(node);
            filterGraphScope();
        }
        closeEdit();
    };

    // Delete Node Hook
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

    // Recenter/Camera Fit View
    document.getElementById('cam-fit-view').onclick = () => {
        state.camera.x = canvas.width / (2 * (window.devicePixelRatio || 1));
        state.camera.y = canvas.height / (2 * (window.devicePixelRatio || 1));
        state.camera.targetZoom = 0.9;
    };

    document.getElementById('cam-zoom-in').onclick = () => state.camera.targetZoom = Math.min(state.camera.targetZoom * 1.35, 3.5);
    document.getElementById('cam-zoom-out').onclick = () => state.camera.targetZoom = Math.max(state.camera.targetZoom / 1.35, 0.2);

    // Imports / Exports
    const impBtnDesk = document.getElementById('btn-d-import');
    const expBtnDesk = document.getElementById('btn-d-export');
    const fileIn = document.getElementById('file-import-input');

    impBtnDesk.onclick = () => fileIn.click();

    fileIn.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed.nodes || !parsed.edges) throw new Error("Invalid structure");
                const db = await openDatabase();
                const tx = db.transaction(['nodes', 'edges'], 'readwrite');
                tx.objectStore('nodes').clear();
                tx.objectStore('edges').clear();
                parsed.nodes.forEach(n => tx.objectStore('nodes').put(n));
                parsed.edges.forEach(ed => tx.objectStore('edges').add(ed));
                tx.oncomplete = async () => {
                    showToast("Import completed successfully.");
                    await loadAllFromDB();
                    loadInspector();
                    closeSettings();
                };
            } catch (err) {
                showToast("Import error: Invalid file format.");
            }
        };
        reader.readAsText(file);
    };

    expBtnDesk.onclick = () => {
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
        showToast("Backup exported.");
    };

    // Database Re-Seeding Trigger
    const confirmReset = async () => {
        await resetDatabaseToDefault();
        await loadAllFromDB();
        loadInspector();
        closeSettings();
    };
    document.getElementById('btn-m-reset').onclick = confirmReset;
    document.getElementById('btn-desktop-reset').onclick = confirmReset;
}

// Helper alerts
function showToast(msg) {
    toastText.innerText = msg;
    toast.classList.remove('translate-y-12', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.add('translate-y-12', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3500);
}

// Initial load
window.onload = async () => {
    lucide.createIcons();
    setupCanvas();
    initGestures();
    await loadAllFromDB();
    hookEvents();
    initializeSettingsSliders();

    // Fit initial scale
    state.camera.x = canvas.width / (2 * (window.devicePixelRatio || 1));
    state.camera.y = canvas.height / (2 * (window.devicePixelRatio || 1));
    state.camera.targetZoom = 0.95;

    // Start tick loop
    frame();
};

window.onresize = () => setupCanvas();