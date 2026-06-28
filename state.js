// ============================================================
// สถานะหลักของแอป
// ============================================================

export const state = {
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

    // สถานะสำหรับการลากเชื่อมโยง
    isShiftPressed: false,
    isDrawLinkMode: false,
    linkStartNode: null,
    linkDragCoords: { x: 0, y: 0 },
    linkHoverTargetNode: null,
    pendingLink: null
};