// ============================================================
// ค่าคงที่ทั้งหมดของแอป
// ============================================================

// ข้อมูลเริ่มต้น (Seed Data) – รองรับหลายภาษา
export const SEED_DATA = {
    nodes: [
        {
            id: "meticulous",
            word: "meticulous",
            pos: "adj",
            definitions: {
                en: "Showing great attention to detail; very careful and precise.",
                th: "พิถีพิถัน ละเอียดรอบคอบ"
            },
            examples: [
                "He was meticulous about keeping his records.",
                "Meticulous design makes UI seamless on mobile devices."
            ],
            pronunciation: "/məˈtɪk.jə.ləs/"
        },
        {
            id: "precise",
            word: "precise",
            pos: "adj",
            definitions: {
                en: "Marked by exactness and accuracy of expression or detail.",
                th: "แม่นยำ ถูกต้อง"
            },
            examples: ["The system gave precise directions.", "We require precise measurements."],
            pronunciation: "/prɪˈsaɪs/"
        },
        {
            id: "careless",
            word: "careless",
            pos: "adj",
            definitions: {
                en: "Not giving sufficient attention or thought to avoiding harm or errors.",
                th: "สะเพร่า ไม่ระมัดระวัง"
            },
            examples: ["A careless mistake disrupted the server system."],
            pronunciation: "/ˈkeə.ləs/"
        },
        {
            id: "sloppy",
            word: "sloppy",
            pos: "adj",
            definitions: {
                en: "Careless and unsystematic; excessively casual or messy.",
                th: "เลอะเทอะ ไม่เป็นระเบียบ"
            },
            examples: ["The layout code was sloppy, causing layout overflows."],
            pronunciation: "/ˈslɒp.i/"
        },
        {
            id: "diligent",
            word: "diligent",
            pos: "adj",
            definitions: {
                en: "Having or showing care and conscientiousness in one's work or duties.",
                th: "ขยันหมั่นเพียร"
            },
            examples: ["She is a diligent student who researched every detail."],
            pronunciation: "/ˈdɪl.ɪ.dʒənt/"
        },
        {
            id: "conscientious",
            word: "conscientious",
            pos: "adj",
            definitions: {
                en: "Wishing to do what is right, especially to do one's work or duty well and thoroughly.",
                th: "รอบคอบ มีสำนึกในหน้าที่"
            },
            examples: ["A conscientious designer tests layouts on mobile devices."],
            pronunciation: "/ˌkɒn.ʃiˈen.ʃəs/"
        },
        {
            id: "vague",
            word: "vague",
            pos: "adj",
            definitions: {
                en: "Of uncertain, indefinite, or unclear character or meaning.",
                th: "คลุมเครือ ไม่ชัดเจน"
            },
            examples: ["The requirements were too vague to construct logic."],
            pronunciation: "/veɪɡ/"
        }
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

// สีประจำความสัมพันธ์
export const COLOR_THEME = {
    synonym: '#10b981',
    antonym: '#f43f5e',
    hypernym: '#f59e0b',
    related: '#8b5cf6',
    nodeBg: '#18181b',
    strokeFocus: '#8b5cf6',
    text: '#ffffff',
    textMuted: '#a1a1aa'
};

// ค่าพารามิเตอร์ฟิสิกส์เริ่มต้น (ปรับแล้ว)
export const PHYSICS_CONFIG = {
    repulsion: 4500,          // ลดลงจาก 7500 ให้โหนดดึงดูดกันมากขึ้น
    spring: 90,               // ลดลงจาก 130 ให้โหนดที่เชื่อมโยงอยู่ใกล้กัน
    springK: 0.25,            // เพิ่มขึ้นจาก 0.07 ให้สปริงแข็งแรงขึ้น
    gravity: 0.003,           // ลดลงจาก 0.009 ให้กราฟกระจายตัว
    friction: 0.85,           // คงเดิม
    baseNodeRadius: 22
};

// ชื่อฐานข้อมูล
export const DB_NAME = 'semanticGraphDB_v3';
export const DB_VERSION = 1;