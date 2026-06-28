// ============================================================
// main.js – จุดเริ่มต้นของแอป
// ============================================================

import { setupCanvas, frame } from './renderer.js';
import { initGestures, hookEvents, initializeSettingsSliders } from './ui.js';
import { loadAllFromDB } from './db.js';
import { state } from './state.js';

// เมื่อ DOM โหลดเสร็จ
window.onload = async () => {
  // สร้างไอคอน Lucide (จาก CDN)
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // ตั้งค่า canvas
  setupCanvas();

  // เริ่มต้น Gesture (mouse/touch)
  initGestures();

  // โหลดข้อมูลจาก IndexedDB (ถ้าไม่มีจะใช้ seed)
  await loadAllFromDB();

  // ติดตั้ง Event Listeners ทั้งหมด
  hookEvents();

  // ตั้งค่าสไลด์เกอร์ใน Settings
  initializeSettingsSliders();

  // ปรับกล้องเริ่มต้น
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.getElementById('graph-canvas');
  state.camera.x = canvas.width / (2 * dpr);
  state.camera.y = canvas.height / (2 * dpr);
  state.camera.targetZoom = 0.95;

  // เริ่ม loop การวาด
  frame();
};

// เมื่อปรับขนาดหน้าจอ
window.onresize = () => {
  setupCanvas();
};