// ============================================================
// ตรรกะฟิสิกส์และการกรองกราฟ
// ============================================================

import { state } from './state.js';
import { PHYSICS_CONFIG } from './config.js';

// คำนวณน้ำหนักของโหนดจากจำนวนขอบที่เชื่อม
export function computeNodeWeights() {
    state.nodes.forEach(n => n.weight = 0);
    state.edges.forEach(e => {
        const f = state.nodes.get(e.from);
        const t = state.nodes.get(e.to);
        if (f) f.weight++;
        if (t) t.weight++;
    });
}

// อัปเดตตัวเลขสถิติบน UI
export function syncUIStats() {
    document.getElementById('d-total-nodes').innerText = state.nodes.size;
    document.getElementById('m-stats').innerText =
        `${state.nodes.size} words • ${state.edges.length} links`;
}

// กรองโหนดและขอบตาม scope และ filter
export function filterGraphScope() {
    const activeTypes = Object.keys(state.filters).filter(k => state.filters[k]);
    const filteredEdges = state.edges.filter(e => activeTypes.includes(e.type));

    if (state.scope === 'global') {
        state.visibleNodes = Array.from(state.nodes.values());
        state.visibleEdges = filteredEdges.filter(e =>
            state.nodes.has(e.from) && state.nodes.has(e.to)
        );
    } else {
        // Local scope
        if (!state.activeNodeId || !state.nodes.has(state.activeNodeId)) {
            state.activeNodeId = state.nodes.keys().next().value || null;
        }
        if (!state.activeNodeId) {
            state.visibleNodes = [];
            state.visibleEdges = [];
            return;
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

// อัปเดตฟิสิกส์ของโหนดที่มองเห็น
export function updatePhysics() {
    const nodes = state.visibleNodes;
    const edges = state.visibleEdges;
    if (nodes.length === 0) return;

    // แรงผลัก
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
                u.vx -= fx;
                u.vy -= fy;
                if (v !== state.dragNode) { v.vx += fx; v.vy += fy; }
            }
        }
    }

    // แรงสปริง
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

    // แรงดึงดูดศูนย์กลาง + การหน่วง
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