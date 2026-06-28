// ============================================================
// การวาด canvas และลูปหลัก
// ============================================================

import { state } from './state.js';
import { COLOR_THEME, PHYSICS_CONFIG } from './config.js';
import { updatePhysics } from './physics.js';

// อ้างอิง canvas และ context
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');

// ปรับขนาด canvas ให้เหมาะกับ DPR
export function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.parentElement.clientWidth * dpr;
    canvas.height = canvas.parentElement.clientHeight * dpr;
    ctx.scale(dpr, dpr);
}

// วาดทุกอย่าง
export function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // ปรับกล้อง
    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.15;
    ctx.translate(state.camera.x, state.camera.y);
    ctx.scale(state.camera.zoom, state.camera.zoom);

    // วาดขอบ
    for (const edge of state.visibleEdges) {
        const u = state.nodes.get(edge.from);
        const v = state.nodes.get(edge.to);
        if (!u || !v) continue;
        const focusMatch = state.activeNodeId &&
            (edge.from === state.activeNodeId || edge.to === state.activeNodeId);

        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.strokeStyle = COLOR_THEME[edge.type] || '#ffffff';
        ctx.globalAlpha = state.activeNodeId ? (focusMatch ? 0.9 : 0.12) : 0.45;
        ctx.lineWidth = focusMatch ? 3.0 : 1.5;
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // เส้นประขณะลากเชื่อมโยง
    if (state.linkStartNode) {
        ctx.beginPath();
        ctx.moveTo(state.linkStartNode.x, state.linkStartNode.y);
        ctx.lineTo(state.linkDragCoords.x, state.linkDragCoords.y);
        ctx.strokeStyle = '#a78bfa';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // วาดโหนด
    for (const node of state.visibleNodes) {
        const radius = PHYSICS_CONFIG.baseNodeRadius + Math.min(node.weight * 2.5, 18);
        const isFocused = state.activeNodeId === node.id;
        const isHovered = state.hoverNode === node;
        const isLinkTarget = state.linkHoverTargetNode === node;

        const isNeighbor = state.activeNodeId && state.visibleEdges.some(e =>
            (e.from === state.activeNodeId && e.to === node.id) ||
            (e.to === state.activeNodeId && e.from === node.id)
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

        // วงแหวนไฮไลต์
        if (isFocused || isLinkTarget) {
            ctx.beginPath();
            ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
            ctx.fillStyle = isLinkTarget ? 'rgba(167, 139, 250, 0.35)' : 'rgba(139, 92, 246, 0.18)';
            ctx.fill();
        }

        // ตัววงกลม
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = isFocused ? '#8b5cf6' : (isHovered || isLinkTarget ? '#27272a' : COLOR_THEME.nodeBg);
        ctx.fill();
        ctx.strokeStyle = isFocused || isLinkTarget ? '#c084fc' : (isHovered ? '#52525b' : '#3f3f46');
        ctx.lineWidth = isFocused || isHovered || isLinkTarget ? 3.0 : 1.5;
        ctx.stroke();

        // คำศัพท์
        ctx.fillStyle = COLOR_THEME.text;
        ctx.font = `600 ${isFocused ? '14px' : '12px'} -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.word, 0, 0);

        // ชนิดคำ
        if (state.camera.zoom > 0.45) {
            ctx.fillStyle = isFocused ? '#f3e8ff' : COLOR_THEME.textMuted;
            ctx.font = 'italic 9px monospace';
            ctx.fillText(`(${node.pos}.)`, 0, radius + 14);
        }
        ctx.restore();
    }
    ctx.restore();
}

// ลูปหลัก (requestAnimationFrame)
export function frame() {
    updatePhysics();
    render();
    requestAnimationFrame(frame);
}