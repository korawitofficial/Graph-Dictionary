// ============================================================
// db.js – จัดการ IndexedDB (ปรับปรุงการอ่าน/เขียน key)
// ============================================================

import { state } from './state.js';
import { SEED_DATA, DB_NAME, DB_VERSION } from './config.js';
import { computeNodeWeights, syncUIStats, filterGraphScope } from './physics.js';
import { showToast } from './ui.js';

export function openDatabase() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('nodes')) {
                db.createObjectStore('nodes', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('edges')) {
                // ใช้ autoIncrement โดยไม่กำหนด keyPath -> key จะเป็นตัวเลข autoIncrement
                db.createObjectStore('edges', { autoIncrement: true });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function loadAllFromDB() {
    try {
        const db = await openDatabase();

        // อ่าน nodes (มี keyPath 'id' อยู่แล้ว)
        const getNodes = new Promise(resolve => {
            const req = db.transaction('nodes', 'readonly').objectStore('nodes').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve([]);
        });

        // อ่าน edges พร้อม key (autoIncrement)
        const getEdges = new Promise(resolve => {
            const store = db.transaction('edges', 'readonly').objectStore('edges');
            const edges = [];
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const value = cursor.value;
                    value.id = cursor.key;      // เพิ่ม id จาก key
                    edges.push(value);
                    cursor.continue();
                } else {
                    resolve(edges);
                }
            };
            req.onerror = () => resolve([]);
        });

        const [nodes, edges] = await Promise.all([getNodes, getEdges]);

        if (nodes.length === 0) {
            await resetDatabaseToDefault();
            return loadAllFromDB();
        }

        state.nodes.clear();
        nodes.forEach(n => {
            if (n.definition && !n.definitions) {
                n.definitions = { en: n.definition };
                delete n.definition;
            }
            if (!n.definitions) {
                n.definitions = { en: 'No definition' };
            }
            state.nodes.set(n.id, {
                ...n,
                x: n.x ?? (Math.random() * 300 - 150),
                y: n.y ?? (Math.random() * 300 - 150),
                vx: 0,
                vy: 0,
                weight: 0
            });
        });

        // edges มี id แล้ว
        state.edges = edges;

        computeNodeWeights();
        syncUIStats();
        filterGraphScope();
    } catch (err) {
        console.error('loadAllFromDB error:', err);
        showToast('Failed to load database, using seed data.');
        await resetDatabaseToDefault();
    }
}

export async function saveNodeToDB(node) {
    const db = await openDatabase();
    const tx = db.transaction('nodes', 'readwrite');
    tx.objectStore('nodes').put({
        id: node.id,
        word: node.word,
        pos: node.pos,
        definitions: node.definitions,
        examples: node.examples,
        pronunciation: node.pronunciation,
        x: node.x,
        y: node.y
    });
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function saveEdgeToDB(edge) {
    const db = await openDatabase();
    const tx = db.transaction('edges', 'readwrite');
    const store = tx.objectStore('edges');
    // edge object ไม่มี id (autoIncrement จะสร้างให้)
    const req = store.add(edge);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result); // req.result คือ key (ตัวเลข)
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
    });
}

export async function updateEdgeInDB(edgeId, newType) {
    if (edgeId == null) {
        throw new Error('updateEdgeInDB: edgeId is required');
    }
    const db = await openDatabase();
    const tx = db.transaction('edges', 'readwrite');
    const store = tx.objectStore('edges');
    const req = store.get(edgeId);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => {
            const data = req.result;
            if (!data) {
                reject(new Error(`Edge with id ${edgeId} not found`));
                return;
            }
            data.type = newType;
            // ใช้ put(data, key) เพื่ออัปเดต record ที่มี key นี้
            const updateReq = store.put(data, edgeId);
            updateReq.onsuccess = () => resolve();
            updateReq.onerror = () => reject(updateReq.error);
        };
        req.onerror = () => reject(req.error);
    });
}

export async function deleteEdgeFromDB(edgeId) {
    if (edgeId == null) {
        throw new Error('deleteEdgeFromDB: edgeId is required');
    }
    const db = await openDatabase();
    const tx = db.transaction('edges', 'readwrite');
    const store = tx.objectStore('edges');
    const req = store.delete(edgeId);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
    });
}

export async function deleteNodeFromDB(id) {
    const db = await openDatabase();
    const tx = db.transaction(['nodes', 'edges'], 'readwrite');
    tx.objectStore('nodes').delete(id);

    const edgeStore = tx.objectStore('edges');
    const req = edgeStore.openCursor();
    req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const value = cursor.value;
            if (value.from === id || value.to === id) {
                cursor.delete(); // ลบ record ที่ cursor ชี้
            }
            cursor.continue();
        }
    };
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function resetDatabaseToDefault() {
    const db = await openDatabase();
    const tx = db.transaction(['nodes', 'edges'], 'readwrite');
    tx.objectStore('nodes').clear();
    tx.objectStore('edges').clear();
    SEED_DATA.nodes.forEach(n => tx.objectStore('nodes').put(n));
    SEED_DATA.edges.forEach(e => tx.objectStore('edges').add(e));
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function eraseEntireDatabase() {
    const db = await openDatabase();
    const tx = db.transaction(['nodes', 'edges'], 'readwrite');
    tx.objectStore('nodes').clear();
    tx.objectStore('edges').clear();
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}