// ==UserScript==
// @name         艾德尔修仙传 - 完整皮肤系统 v3
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  完整皮肤系统 v4 - 个性化定制 + Token 管理 + 自定义皮肤 + 工单集成
// @author       Ider
// @match        https://idlexiuxianzhuan.cn/*
// @match        http://idlexiuxianzhuan.cn/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
'use strict';

// ═══════════════════════════════════════════════════════════
// 工单系统配置
// ═══════════════════════════════════════════════════════════

const CONFIG_KEY = 'ider_skin_sys_config';
const STORAGE_KEY = 'ider_skin_v2';

function getConfig() {
  const raw = GM_getValue(CONFIG_KEY, '{}');
  try { return JSON.parse(raw); } catch { return {}; }
}

function setConfig(cfg) {
  GM_setValue(CONFIG_KEY, JSON.stringify(cfg));
}

function getOrderSystemUrl() {
  return getConfig().apiUrl || 'https://ider-order-system.pages.dev';
}

function getApiToken() {
  return getConfig().token || '';
}

// ═══════════════════════════════════════════════════════════
// 8套全面升级皮肤（覆盖CSS + 布局优化）
// ═══════════════════════════════════════════════════════════

const SKINS = {

// ───────────────────────────────────────────────
// ① 水墨修仙 — 水墨写意风（重写布局）
// ───────────────────────────────────────────────
inkwash: {
name: '水墨修仙',
desc: '泼墨写意，素雅高远 · 大面积留白，笔触质感',
css: `
:root {
  --bg: #f5f0e8 !important; --bg2: #ece5d8 !important; --bg3: #e0d7c8 !important;
  --bg4: #d5ccbc !important; --border: #c4b8a4 !important;
  --text: #3a3228 !important; --text2: #8a7a6a !important;
  --gold: #c41e3a !important; --gold2: #8b1528 !important;
  --accent: #5a7a6a !important; --red: #c41e3a !important; --green: #4a7a4a !important;
  --radius: 2px !important;
}
body { font-family: 'STKaiti','KaiTi','Ma Shan Zheng',cursive !important; color: #3a3228 !important; }

.view-login { background: linear-gradient(160deg, #f5f0e8 0%, #e8dfd0 40%, #f0e8d8 100%) !important; }
.login-card { background: rgba(245,240,232,0.95) !important; border: 1px solid #c4b8a4 !important; box-shadow: 0 8px 40px rgba(0,0,0,0.06) !important; }
.game-title { font-family: 'Ma Shan Zheng','STKaiti',cursive !important; font-size: 34px !important; color: #3a3228 !important; letter-spacing: 12px !important; font-weight: 400 !important; }

.game-header { background: #f5f0e8 !important; border-bottom: 1px solid #c4b8a4 !important; padding: 8px 16px !important; }
.game-header::after { content: '' !important; position: absolute !important; bottom: -4px !important; left: 10% !important; right: 10% !important; height: 2px !important; background: #3a3228 !important; opacity: 0.15 !important; }
.hdr-name { font-family: 'Ma Shan Zheng','STKaiti',cursive !important; font-size: 16px !important; color: #3a3228 !important; letter-spacing: 4px !important; }
.realm-badge { background: #ece5d8 !important; border: 1px solid #c4b8a4 !important; color: #c41e3a !important; border-radius: 0 !important; }
.btn-icon { color: #8a7a6a !important; }
.btn-icon:hover { color: #c41e3a !important; }

.tab-nav { background: #f0e8dc !important; border-bottom: 1px solid #d5ccbc !important; }
.tab-btn { color: #8a7a6a !important; letter-spacing: 2px !important; border-bottom: 2px solid transparent !important; padding: 10px 20px !important; }
.tab-btn.active { color: #c41e3a !important; border-bottom-color: #c41e3a !important; }
.tab-btn:hover { color: #3a3228 !important; background: rgba(0,0,0,0.02) !important; }

.battle-sidebar { background: #f0e8dc !important; border-right: 1px solid #d5ccbc !important; }
.sidebar-char-name { color: #c41e3a !important; font-family: 'Ma Shan Zheng',cursive !important; font-size: 18px !important; }
.sidebar-section-title { color: #3a3228 !important; border-bottom: 1px solid #d5ccbc !important; letter-spacing: 2px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: #faf6f0 !important; border: 1px solid #d5ccbc !important;
  padding: 16px 20px !important; box-shadow: 0 1px 4px rgba(0,0,0,0.03) !important;
}
.skill-card.equipped { border-left: 3px solid #c41e3a !important; background: #f5ede0 !important; }
.section-title { color: #c41e3a !important; border-bottom: 1px solid #d5ccbc !important; font-size: 14px !important; letter-spacing: 4px !important; padding-bottom: 8px !important; margin-bottom: 12px !important; }

.btn-action { background: #ece5d8 !important; border: 1px solid #c4b8a4 !important; color: #3a3228 !important; padding: 8px 16px !important; }
.btn-action:hover { background: #e0d7c8 !important; }
.btn-action.gold { background: #c41e3a !important; border-color: #8b1528 !important; color: #fff !important; }
.btn-sm { background: #ece5d8 !important; border: 1px solid #c4b8a4 !important; }
.btn-primary { background: #3a3228 !important; border: none !important; color: #f5f0e8 !important; }

.bar-track { background: #e0d7c8 !important; border: none !important; height: 6px !important; }
.hp-bar-red { background: linear-gradient(90deg, #8b1528, #c41e3a) !important; }
.hp-bar-green { background: linear-gradient(90deg, #2a5a3a, #4a7a4a) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #4a5a7a, #6a8aaa) !important; }
.exp-fill { background: #3a3228 !important; }

.modal-overlay { background: rgba(245,240,232,0.85) !important; }

.map-card { background: #faf6f0 !important; border: 1px solid #d5ccbc !important; padding: 12px !important; }
.map-card.active { border-color: #c41e3a !important; background: #f5ede0 !important; }

.inv-slot { background: #faf6f0 !important; border: 1px solid #d5ccbc !important; }
.inv-slot.occupied:hover { border-color: #c41e3a !important; }

.toast { background: rgba(250,246,240,0.95) !important; border: 1px solid #3a3228 !important; color: #3a3228 !important; }

::-webkit-scrollbar-thumb { background: #c4b8a4 !important; }
::-webkit-scrollbar-track { background: #f5f0e8 !important; }

input, select, textarea { background: #faf6f0 !important; border-color: #c4b8a4 !important; color: #3a3228 !important; }
input:focus { border-color: #3a3228 !important; }

.tab-btn.active::after { display: none !important; }

.panel { animation: iderWashIn 0.4s ease !important; }
@keyframes iderWashIn { from { opacity: 0; letter-spacing: 8px; } to { opacity: 1; letter-spacing: 0; } }
`
},

// ───────────────────────────────────────────────
// ② 赛博修仙 — 霓虹赛博朋克（重构布局）
// ───────────────────────────────────────────────
cyber: {
name: '赛博修仙',
desc: '霓虹光污染，数据流涌动 · 紧凑布局，速度感',
css: `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;500;700&display=swap');
:root {
  --bg: #03030a !important; --bg2: #070718 !important; --bg3: #0c0c28 !important;
  --bg4: #11113a !important; --border: #1a1a4a !important;
  --text: #c4d0e0 !important; --text2: #4a5a7a !important;
  --gold: #00f0ff !important; --gold2: #0090ff !important;
  --accent: #ff00aa !important; --red: #ff0044 !important; --green: #00ff88 !important;
  --radius: 2px !important;
}
body { font-family: 'Rajdhani','Noto Sans SC',sans-serif !important; }

.view-login { background: linear-gradient(135deg, #03030a, #0a0a20, #03030a) !important; }
.login-card { background: rgba(7,7,24,0.95) !important; border: 1px solid rgba(0,240,255,0.15) !important; box-shadow: 0 0 60px rgba(0,240,255,0.03), inset 0 0 60px rgba(0,240,255,0.02) !important; }
.game-title { font-family: 'Orbitron',sans-serif !important; font-size: 28px !important; color: #00f0ff !important; text-shadow: 0 0 30px rgba(0,240,255,0.3) !important; letter-spacing: 4px !important; text-transform: uppercase !important; }

.game-header { background: linear-gradient(90deg, #03030a, #070718, #03030a) !important; border-bottom: 1px solid rgba(0,240,255,0.1) !important; position: relative !important; }
.game-header::after { content: '' !important; position: absolute !important; bottom: -1px !important; left: 0 !important; right: 0 !important; height: 1px !important; background: linear-gradient(90deg, transparent, #00f0ff, #ff00aa, #00f0ff, transparent) !important; background-size: 200% 100% !important; animation: iderScan 2s linear infinite !important; }
@keyframes iderScan { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.hdr-name { font-family: 'Orbitron',sans-serif !important; font-size: 14px !important; color: #00f0ff !important; text-shadow: 0 0 15px rgba(0,240,255,0.4) !important; letter-spacing: 2px !important; text-transform: uppercase !important; }
.realm-badge { background: rgba(255,0,170,0.1) !important; border: 1px solid rgba(255,0,170,0.25) !important; color: #ff00aa !important; text-shadow: 0 0 8px rgba(255,0,170,0.3) !important; border-radius: 2px !important; }
.btn-icon { color: #4a5a7a !important; }
.btn-icon:hover { color: #00f0ff !important; text-shadow: 0 0 15px rgba(0,240,255,0.5) !important; }

.tab-nav { background: #050510 !important; border-bottom: 1px solid #0c0c28 !important; }
.tab-btn { color: #4a5a7a !important; font-family: 'Rajdhani',sans-serif !important; font-size: 13px !important; letter-spacing: 1px !important; padding: 8px 16px !important; text-transform: uppercase !important; }
.tab-btn.active { color: #00f0ff !important; border-bottom: 1px solid #00f0ff !important; text-shadow: 0 0 10px rgba(0,240,255,0.3) !important; }

.battle-sidebar { background: #050510 !important; border-right: 1px solid #0c0c28 !important; }
.sidebar-char-name { font-family: 'Orbitron',sans-serif !important; color: #00f0ff !important; font-size: 12px !important; text-transform: uppercase !important; letter-spacing: 1px !important; }
.sidebar-section-title { color: #ff00aa !important; border-bottom: 1px solid #1a1a4a !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 2px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: linear-gradient(135deg, #070718, #0c0c28) !important; border: 1px solid #1a1a4a !important;
  padding: 12px 16px !important;
}
.skill-card.equipped { border-color: #00f0ff !important; box-shadow: 0 0 20px rgba(0,240,255,0.05), inset 0 0 20px rgba(0,240,255,0.03) !important; }
.section-title { font-family: 'Orbitron',sans-serif !important; color: #00f0ff !important; border-bottom: 1px solid #1a1a4a !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 2px !important; padding-bottom: 6px !important; }

.btn-action { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; color: #c4d0e0 !important; padding: 6px 14px !important; font-family: 'Rajdhani',sans-serif !important; font-size: 13px !important; text-transform: uppercase !important; letter-spacing: 1px !important; }
.btn-action:hover { border-color: #00f0ff !important; box-shadow: 0 0 15px rgba(0,240,255,0.1) !important; }
.btn-action.gold { border-color: #00f0ff !important; color: #00f0ff !important; text-shadow: 0 0 8px rgba(0,240,255,0.3) !important; }
.btn-sm { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; color: #c4d0e0 !important; }
.btn-primary { background: linear-gradient(135deg, #ff00aa, #00f0ff) !important; border: none !important; color: #000 !important; font-weight: 700 !important; text-transform: uppercase !important; }

.bar-track { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; height: 8px !important; }
.hp-bar-red { background: linear-gradient(90deg, #5a0018, #ff0044) !important; }
.hp-bar-green { background: linear-gradient(90deg, #004a2a, #00ff88) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #002a6a, #0090ff) !important; }
.exp-fill { background: linear-gradient(90deg, #6a00aa, #ff00aa) !important; }

.modal-overlay { background: rgba(3,3,10,0.85) !important; backdrop-filter: blur(8px) !important; }

.map-card { background: linear-gradient(135deg, #070718, #0c0c28) !important; border: 1px solid #1a1a4a !important; }
.map-card.active { border-color: #00f0ff !important; box-shadow: 0 0 25px rgba(0,240,255,0.08) !important; }

.inv-slot { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; }
.inv-slot.occupied:hover { border-color: #00f0ff !important; box-shadow: 0 0 12px rgba(0,240,255,0.1) !important; }

.toast { background: rgba(7,7,24,0.95) !important; border: 1px solid #00f0ff !important; color: #00f0ff !important; box-shadow: 0 0 25px rgba(0,240,255,0.1) !important; }

::-webkit-scrollbar-thumb { background: #1a1a4a !important; }
::-webkit-scrollbar-track { background: #03030a !important; }

.panel { animation: iderGlitchIn 0.25s ease !important; }
@keyframes iderGlitchIn { 0% { opacity: 0; clip-path: inset(0 100% 0 0); } 80% { clip-path: inset(0 0 0 0); } 85% { clip-path: inset(2px 0 0 0); } 90% { clip-path: inset(0 0 3px 0); } 100% { opacity: 1; clip-path: inset(0 0 0 0); } }
`
},

// ───────────────────────────────────────────────
// ③ 奢华金属 — 奢靡金属质感
// ───────────────────────────────────────────────
luxe: {
name: '奢华金属',
desc: '鎏金溢彩，华贵典藏 · 金属光泽，浮雕质感',
css: `
:root {
  --bg: #0d0b08 !important; --bg2: #1a1612 !important; --bg3: #28221c !important;
  --bg4: #3a322a !important; --border: #4a3f35 !important;
  --text: #e8ddd0 !important; --text2: #a09080 !important;
  --gold: #d4a844 !important; --gold2: #b8860b !important;
  --accent: #c0c0c0 !important; --red: #c04040 !important; --green: #40a060 !important;
  --radius: 4px !important;
}
body { font-family: 'Playfair Display','Noto Serif SC',serif !important; }

.view-login { background: radial-gradient(ellipse at 50% 0%, #1a1612 0%, #0d0b08 60%) !important; }
.login-card { background: linear-gradient(160deg, #1a1612, #221e18) !important; border: 1px solid #4a3f35 !important; box-shadow: 0 8px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(212,168,68,0.05) !important; }
.game-title { font-family: 'Playfair Display',serif !important; font-size: 30px !important; color: #d4a844 !important; text-shadow: 0 0 40px rgba(212,168,68,0.15) !important; letter-spacing: 3px !important; font-weight: 700 !important; }

.game-header { background: linear-gradient(180deg, #1a1612, #0d0b08) !important; border-bottom: 2px solid #4a3f35 !important; position: relative !important; }
.game-header::after { content: '' !important; position: absolute !important; bottom: -2px !important; left: 15% !important; right: 15% !important; height: 1px !important; background: linear-gradient(90deg, transparent, #d4a844, transparent) !important; }
.hdr-name { font-family: 'Playfair Display',serif !important; font-size: 16px !important; color: #d4a844 !important; letter-spacing: 2px !important; font-weight: 700 !important; text-shadow: 0 1px 4px rgba(0,0,0,0.3) !important; }
.realm-badge { background: linear-gradient(135deg, #2a2318, #3a3022) !important; border: 1px solid #4a3f35 !important; color: #d4a844 !important; box-shadow: inset 0 1px 0 rgba(212,168,68,0.1) !important; }
.btn-icon { color: #a09080 !important; }
.btn-icon:hover { color: #d4a844 !important; text-shadow: 0 0 10px rgba(212,168,68,0.2) !important; }

.tab-nav { background: #0d0b08 !important; border-bottom: 1px solid #3a322a !important; }
.tab-btn { color: #8a7a6a !important; font-family: 'Playfair Display',serif !important; font-size: 13px !important; letter-spacing: 1px !important; padding: 10px 24px !important; }
.tab-btn.active { color: #d4a844 !important; border-bottom: 1px solid #d4a844 !important; }
.tab-btn:hover { color: #e8ddd0 !important; background: rgba(212,168,68,0.03) !important; }

.battle-sidebar { background: #0d0b08 !important; border-right: 1px solid #3a322a !important; }
.sidebar-char-name { color: #d4a844 !important; font-family: 'Playfair Display',serif !important; font-weight: 700 !important; }
.sidebar-section-title { color: #d4a844 !important; border-bottom: 1px solid #3a322a !important; letter-spacing: 2px !important; text-transform: uppercase !important; font-size: 10px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: linear-gradient(160deg, #1a1612, #221e18) !important; border: 1px solid #3a322a !important;
  padding: 16px 20px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.02) !important;
}
.skill-card.equipped { border-color: #d4a844 !important; background: linear-gradient(160deg, #221a12, #2a2218) !important; }
.section-title { color: #d4a844 !important; border-bottom: 1px solid #4a3f35 !important; font-size: 13px !important; letter-spacing: 3px !important; text-transform: uppercase !important; padding-bottom: 8px !important; }

.btn-action { background: linear-gradient(160deg, #1a1612, #28221c) !important; border: 1px solid #4a3f35 !important; color: #e8ddd0 !important; padding: 8px 18px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03) !important; }
.btn-action:hover { border-color: #d4a844 !important; box-shadow: inset 0 1px 0 rgba(212,168,68,0.05), 0 2px 12px rgba(212,168,68,0.08) !important; }
.btn-action.gold { background: linear-gradient(160deg, #3a3022, #4a3f35) !important; border-color: #d4a844 !important; color: #d4a844 !important; }
.btn-sm { background: #1a1612 !important; border: 1px solid #4a3f35 !important; }
.btn-primary { background: linear-gradient(135deg, #d4a844, #b8860b) !important; border: none !important; color: #000 !important; box-shadow: 0 2px 12px rgba(212,168,68,0.2) !important; }

.bar-track { background: #28221c !important; border: 1px solid #4a3f35 !important; height: 8px !important; }
.hp-bar-red { background: linear-gradient(90deg, #6a2020, #c04040) !important; }
.hp-bar-green { background: linear-gradient(90deg, #2a5a3a, #40a060) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #2a3a6a, #4080c0) !important; }
.exp-fill { background: linear-gradient(90deg, #8a6a20, #d4a844) !important; }

.modal-overlay { background: rgba(13,11,8,0.85) !important; backdrop-filter: blur(4px) !important; }

.map-card { background: linear-gradient(160deg, #1a1612, #221e18) !important; border: 1px solid #3a322a !important; }
.map-card.active { border-color: #d4a844 !important; box-shadow: 0 0 20px rgba(212,168,68,0.06) !important; }

.inv-slot { background: #1a1612 !important; border: 1px solid #3a322a !important; }
.inv-slot.occupied:hover { border-color: #d4a844 !important; }

.toast { background: rgba(26,22,18,0.95) !important; border: 1px solid #d4a844 !important; color: #d4a844 !important; box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; }

::-webkit-scrollbar-thumb { background: #4a3f35 !important; }
::-webkit-scrollbar-track { background: #0d0b08 !important; }

.panel { animation: iderLuxeIn 0.4s ease !important; }
@keyframes iderLuxeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
`
},

// ───────────────────────────────────────────────
// ④ 轻奢杂志 — 极简编辑风格
// ───────────────────────────────────────────────
magazine: {
name: '轻奢杂志',
desc: '杂志级排版，克制优雅 · 大留白，精字距',
css: `
:root {
  --bg: #f8f6f2 !important; --bg2: #f0ece6 !important; --bg3: #e8e2da !important;
  --bg4: #ddd6cc !important; --border: #d0c8bc !important;
  --text: #2a2520 !important; --text2: #8a8078 !important;
  --gold: #c49a6c !important; --gold2: #a07850 !important;
  --accent: #6a7a8a !important; --red: #b04a3a !important; --green: #5a8a5a !important;
  --radius: 0 !important;
}
body { font-family: 'Noto Serif SC','Georgia',serif !important; }

.view-login { background: #f8f6f2 !important; }
.login-card { background: #fff !important; border: 1px solid #ddd6cc !important; box-shadow: none !important; }
.game-title { font-family: 'Noto Serif SC',serif !important; font-size: 28px !important; color: #2a2520 !important; letter-spacing: 6px !important; font-weight: 300 !important; }

.game-header { background: #fff !important; border-bottom: 1px solid #ddd6cc !important; padding: 12px 24px !important; }
.hdr-name { font-family: 'Noto Serif SC',serif !important; font-size: 14px !important; color: #c49a6c !important; letter-spacing: 3px !important; font-weight: 400 !important; }
.realm-badge { background: #f0ece6 !important; border: none !important; color: #8a8078 !important; font-size: 11px !important; }
.btn-icon { color: #c4b8ac !important; }
.btn-icon:hover { color: #c49a6c !important; }

.tab-nav { background: #fff !important; border-bottom: 1px solid #e8e2da !important; padding: 0 24px !important; }
.tab-btn { color: #8a8078 !important; font-size: 12px !important; letter-spacing: 2px !important; padding: 12px 20px !important; text-transform: uppercase !important; }
.tab-btn.active { color: #2a2520 !important; border-bottom: 2px solid #2a2520 !important; }
.tab-btn:hover { color: #2a2520 !important; background: rgba(0,0,0,0.01) !important; }

.battle-sidebar { background: #f8f6f2 !important; border-right: 1px solid #e8e2da !important; }
.sidebar-char-name { color: #2a2520 !important; font-family: 'Noto Serif SC',serif !important; font-weight: 400 !important; letter-spacing: 2px !important; }
.sidebar-section-title { color: #c49a6c !important; border-bottom: 1px solid #ddd6cc !important; text-transform: uppercase !important; font-size: 10px !important; letter-spacing: 3px !important; padding-bottom: 8px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: #fff !important; border: 1px solid #e8e2da !important;
  padding: 20px 24px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.02) !important;
}
.skill-card.equipped { border-left: 3px solid #c49a6c !important; }
.section-title { color: #2a2520 !important; border-bottom: 1px solid #e8e2da !important; font-size: 11px !important; letter-spacing: 4px !important; text-transform: uppercase !important; padding-bottom: 10px !important; margin-bottom: 16px !important; font-weight: 600 !important; }

.btn-action { background: #f8f6f2 !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; padding: 8px 20px !important; font-size: 12px !important; letter-spacing: 1px !important; }
.btn-action:hover { background: #f0ece6 !important; }
.btn-action.gold { background: #c49a6c !important; border-color: #a07850 !important; color: #fff !important; }
.btn-sm { background: #f8f6f2 !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; }
.btn-primary { background: #2a2520 !important; border: none !important; color: #fff !important; letter-spacing: 2px !important; text-transform: uppercase !important; font-size: 11px !important; padding: 10px 24px !important; }

.bar-track { background: #e8e2da !important; border: none !important; height: 4px !important; }
.hp-bar-red { background: #b04a3a !important; }
.hp-bar-green { background: #5a8a5a !important; }
.mp-bar-blue { background: #6a7a8a !important; }
.exp-fill { background: #c49a6c !important; }

.modal-overlay { background: rgba(248,246,242,0.9) !important; }

.map-card { background: #fff !important; border: 1px solid #e8e2da !important; }
.map-card.active { border-color: #c49a6c !important; background: #f8f6f2 !important; }

.inv-slot { background: #f8f6f2 !important; border: 1px solid #e8e2da !important; }
.inv-slot.occupied:hover { border-color: #c49a6c !important; }

.toast { background: rgba(255,255,255,0.95) !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important; }

::-webkit-scrollbar-thumb { background: #ddd6cc !important; }
::-webkit-scrollbar-track { background: #f8f6f2 !important; }

input, select, textarea { background: #fff !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; padding: 8px 12px !important; }
input:focus { border-color: #2a2520 !important; }

.panel { animation: iderMagIn 0.35s ease !important; }
@keyframes iderMagIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
`
},

// ───────────────────────────────────────────────
// ⑤ 日式和风 — 侘寂禅意
// ───────────────────────────────────────────────
wabi: {
name: '日式和风',
desc: '侘寂美学，一木一石 · 自然质感，和纸纹理',
css: `
:root {
  --bg: #e8ddd0 !important; --bg2: #ddd0c0 !important; --bg3: #d0c0ae !important;
  --bg4: #c4b4a0 !important; --border: #b09880 !important;
  --text: #3a3028 !important; --text2: #7a6a5a !important;
  --gold: #8b6f4c !important; --gold2: #6a5038 !important;
  --accent: #7b8d4e !important; --red: #8a4040 !important; --green: #5a7a4a !important;
  --radius: 0 !important;
}
body { font-family: 'Noto Serif JP','STSong','Yu Mincho','游明朝',serif !important; color: #3a3028 !important; }

.view-login { background: linear-gradient(170deg, #e8ddd0, #ddd0c0) !important; }
.login-card { background: rgba(232,221,208,0.95) !important; border: 1px solid #b09880 !important; }
.game-title { font-family: 'Noto Serif JP',serif !important; font-size: 28px !important; color: #3a3028 !important; letter-spacing: 8px !important; font-weight: 400 !important; }

.game-header { background: #ddd0c0 !important; border-bottom: 1px solid #b09880 !important; }
.game-header::before { content: '◇' !important; position: absolute !important; left: 50% !important; bottom: -8px !important; transform: translateX(-50%) !important; color: #b09880 !important; font-size: 12px !important; background: #e8ddd0 !important; padding: 0 8px !important; }
.hdr-name { font-family: 'Noto Serif JP',serif !important; font-size: 15px !important; color: #3a3028 !important; letter-spacing: 4px !important; font-weight: 400 !important; }
.realm-badge { background: #d0c0ae !important; border: 1px solid #b09880 !important; color: #3a3028 !important; }
.btn-icon { color: #7a6a5a !important; }
.btn-icon:hover { color: #8b6f4c !important; }

.tab-nav { background: #ddd0c0 !important; border-bottom: 1px solid #b09880 !important; }
.tab-btn { color: #7a6a5a !important; letter-spacing: 2px !important; padding: 8px 20px !important; border-bottom: 1px solid transparent !important; }
.tab-btn.active { color: #3a3028 !important; border-bottom-color: #3a3028 !important; }
.tab-btn:hover { background: rgba(0,0,0,0.02) !important; }

.battle-sidebar { background: #ddd0c0 !important; border-right: 1px solid #b09880 !important; }
.sidebar-char-name { color: #3a3028 !important; font-size: 16px !important; letter-spacing: 2px !important; }
.sidebar-section-title { color: #8b6f4c !important; border-bottom: 1px solid #b09880 !important; letter-spacing: 2px !important; padding-bottom: 6px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: #f0e8dc !important; border: 1px solid #c4b4a0 !important;
  padding: 16px !important;
}
.skill-card.equipped { background: #e8ddd0 !important; border-left: 2px solid #8b6f4c !important; }
.section-title { color: #3a3028 !important; border-bottom: 1px solid #b09880 !important; font-size: 12px !important; letter-spacing: 3px !important; padding-bottom: 6px !important; margin-bottom: 10px !important; font-weight: 400 !important; }

.btn-action { background: #d0c0ae !important; border: 1px solid #b09880 !important; color: #3a3028 !important; padding: 6px 16px !important; }
.btn-action:hover { background: #c4b4a0 !important; }
.btn-action.gold { background: #8b6f4c !important; border-color: #6a5038 !important; color: #f0e8dc !important; }
.btn-sm { background: #d0c0ae !important; border: 1px solid #b09880 !important; }
.btn-primary { background: #3a3028 !important; border: none !important; color: #f0e8dc !important; }

.bar-track { background: #c4b4a0 !important; height: 6px !important; border: none !important; }
.hp-bar-red { background: #8a4040 !important; }
.hp-bar-green { background: #5a7a4a !important; }
.mp-bar-blue { background: #6a7a8a !important; }
.exp-fill { background: #8b6f4c !important; }

.modal-overlay { background: rgba(232,221,208,0.85) !important; }

.map-card { background: #f0e8dc !important; border: 1px solid #c4b4a0 !important; }
.map-card.active { border-color: #8b6f4c !important; background: #e8ddd0 !important; }

.inv-slot { background: #f0e8dc !important; border: 1px solid #c4b4a0 !important; }
.inv-slot.occupied:hover { border-color: #8b6f4c !important; }

.toast { background: rgba(232,221,208,0.95) !important; border: 1px solid #8b6f4c !important; color: #3a3028 !important; }

::-webkit-scrollbar-thumb { background: #b09880 !important; }
::-webkit-scrollbar-track { background: #e8ddd0 !important; }

input, select, textarea { background: #f0e8dc !important; border-color: #b09880 !important; color: #3a3028 !important; }
input:focus { border-color: #3a3028 !important; }

.panel { animation: iderZenIn 0.4s ease !important; }
@keyframes iderZenIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
`
},

// ───────────────────────────────────────────────
// ⑥ 极简主义 — 极致克制
// ───────────────────────────────────────────────
minimal: {
name: '极简主义',
desc: '少即是多，内容至上 · 极致留白，去装饰化',
css: `
:root {
  --bg: #ffffff !important; --bg2: #f8f8f8 !important; --bg3: #f0f0f0 !important;
  --bg4: #e8e8e8 !important; --border: #e0e0e0 !important;
  --text: #1a1a1a !important; --text2: #888888 !important;
  --gold: #333333 !important; --gold2: #555555 !important;
  --accent: #666666 !important; --red: #cc3333 !important; --green: #339933 !important;
  --radius: 0 !important;
}
body { font-family: 'Inter','Noto Sans SC',-apple-system,sans-serif !important; }

.view-login { background: #ffffff !important; }
.login-card { background: #ffffff !important; border: 1px solid #e0e0e0 !important; box-shadow: none !important; }
.game-title { font-size: 24px !important; color: #1a1a1a !important; letter-spacing: 2px !important; font-weight: 300 !important; }

.game-header { background: #ffffff !important; border-bottom: 1px solid #e8e8e8 !important; }
.hdr-name { font-size: 14px !important; color: #333333 !important; font-weight: 400 !important; }
.realm-badge { background: #f8f8f8 !important; border: none !important; color: #1a1a1a !important; }
.btn-icon { color: #bbbbbb !important; }
.btn-icon:hover { color: #333333 !important; }

.tab-nav { background: #ffffff !important; border-bottom: 1px solid #e8e8e8 !important; }
.tab-btn { color: #bbbbbb !important; padding: 8px 16px !important; font-size: 13px !important; border-bottom: 1px solid transparent !important; margin-bottom: -1px !important; }
.tab-btn.active { color: #333333 !important; border-bottom-color: #333333 !important; }
.tab-btn:hover { color: #666666 !important; background: #f8f8f8 !important; }

.battle-sidebar { background: #fafafa !important; border-right: 1px solid #e8e8e8 !important; }
.sidebar-char-name { color: #1a1a1a !important; font-weight: 500 !important; }
.sidebar-section-title { color: #666666 !important; border-bottom: 1px solid #e8e8e8 !important; font-size: 10px !important; text-transform: uppercase !important; letter-spacing: 2px !important; padding-bottom: 6px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: #ffffff !important; border: 1px solid #f0f0f0 !important;
  padding: 16px !important;
}
.skill-card.equipped { border: 1px solid #333333 !important; }
.section-title { color: #1a1a1a !important; border-bottom: 1px solid #e8e8e8 !important; font-size: 11px !important; letter-spacing: 2px !important; text-transform: uppercase !important; padding-bottom: 6px !important; font-weight: 500 !important; }

.btn-action { background: #ffffff !important; border: 1px solid #e0e0e0 !important; color: #1a1a1a !important; padding: 6px 16px !important; font-size: 12px !important; }
.btn-action:hover { background: #f8f8f8 !important; border-color: #cccccc !important; }
.btn-action.gold { background: #333333 !important; border-color: #333333 !important; color: #ffffff !important; }
.btn-sm { background: #ffffff !important; border: 1px solid #e0e0e0 !important; color: #1a1a1a !important; }
.btn-primary { background: #333333 !important; border: none !important; color: #ffffff !important; }

.bar-track { background: #f0f0f0 !important; border: none !important; height: 4px !important; }
.hp-bar-red { background: #cc3333 !important; }
.hp-bar-green { background: #339933 !important; }
.mp-bar-blue { background: #3366aa !important; }
.exp-fill { background: #333333 !important; }

.modal-overlay { background: rgba(255,255,255,0.8) !important; }

.map-card { background: #ffffff !important; border: 1px solid #f0f0f0 !important; }
.map-card.active { border-color: #333333 !important; background: #fafafa !important; }

.inv-slot { background: #fafafa !important; border: 1px solid #f0f0f0 !important; }
.inv-slot.occupied:hover { border-color: #333333 !important; }

.toast { background: rgba(255,255,255,0.95) !important; border: 1px solid #e0e0e0 !important; color: #1a1a1a !important; }

::-webkit-scrollbar-thumb { background: #e0e0e0 !important; }
::-webkit-scrollbar-track { background: #ffffff !important; }

input, select, textarea { background: #ffffff !important; border: 1px solid #e0e0e0 !important; color: #1a1a1a !important; }
input:focus { border-color: #333333 !important; }

.panel { animation: iderMinIn 0.3s ease !important; }
@keyframes iderMinIn { from { opacity: 0; } to { opacity: 1; } }
`
},

// ───────────────────────────────────────────────
// ⑦ 磨砂玻璃态 — Apple 风格玻璃拟态
// ───────────────────────────────────────────────
frost: {
name: '磨砂玻璃态',
desc: 'Apple 风格玻璃拟态 · 通透模糊，悬浮层次',
css: `
:root {
  --bg: #0e0e14 !important; --bg2: rgba(30,32,48,0.45) !important;
  --bg3: rgba(36,38,56,0.4) !important; --bg4: rgba(44,46,68,0.35) !important;
  --border: rgba(255,255,255,0.06) !important;
  --text: rgba(255,255,255,0.9) !important; --text2: rgba(255,255,255,0.4) !important;
  --gold: rgba(0,122,255,0.85) !important; --gold2: rgba(0,90,200,0.8) !important;
  --accent: rgba(0,122,255,0.7) !important; --red: rgba(255,69,58,0.8) !important;
  --green: rgba(52,199,89,0.8) !important; --radius: 14px !important;
}

.game-header { background: rgba(20,22,32,0.6) !important; backdrop-filter: blur(30px) saturate(1.4) !important; -webkit-backdrop-filter: blur(30px) saturate(1.4) !important; border-bottom: 1px solid rgba(255,255,255,0.04) !important; }
.hdr-name { font-weight: 500 !important; color: rgba(255,255,255,0.9) !important; letter-spacing: 0 !important; }
.realm-badge { background: rgba(0,122,255,0.1) !important; border: 1px solid rgba(0,122,255,0.15) !important; color: rgba(0,122,255,0.9) !important; }

.tab-nav { background: rgba(20,22,32,0.35) !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; border-bottom: 1px solid rgba(255,255,255,0.03) !important; }
.tab-btn { color: rgba(255,255,255,0.4) !important; font-size: 13px !important; font-weight: 500 !important; }
.tab-btn.active { color: var(--gold) !important; border-bottom: 1px solid var(--gold) !important; }

.battle-sidebar { background: rgba(14,14,20,0.5) !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; border-right: 1px solid rgba(255,255,255,0.03) !important; }
.sidebar-char-name { color: rgba(255,255,255,0.9) !important; font-weight: 500 !important; }
.sidebar-section-title { color: rgba(255,255,255,0.5) !important; border-bottom: 1px solid rgba(255,255,255,0.04) !important; font-size: 11px !important; letter-spacing: 1px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: rgba(30,32,48,0.35) !important;
  backdrop-filter: blur(20px) saturate(1.3) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.3) !important;
  border: 1px solid rgba(255,255,255,0.04) !important;
  padding: 16px 20px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.2) !important;
}
.skill-card.equipped { border-color: var(--gold) !important; background: rgba(0,122,255,0.06) !important; }
.section-title { color: rgba(255,255,255,0.8) !important; border-bottom: 1px solid rgba(255,255,255,0.04) !important; font-size: 12px !important; font-weight: 600 !important; padding-bottom: 8px !important; }

.btn-action { background: rgba(255,255,255,0.04) !important; border: 1px solid rgba(255,255,255,0.06) !important; color: rgba(255,255,255,0.8) !important; padding: 8px 18px !important; border-radius: 12px !important; backdrop-filter: blur(8px) !important; }
.btn-action:hover { background: rgba(255,255,255,0.08) !important; }
.btn-action.gold { background: rgba(0,122,255,0.15) !important; border-color: rgba(0,122,255,0.25) !important; color: var(--gold) !important; }
.btn-sm { background: rgba(255,255,255,0.04) !important; border: 1px solid rgba(255,255,255,0.06) !important; color: rgba(255,255,255,0.7) !important; border-radius: 10px !important; }
.btn-primary { background: var(--gold) !important; border: none !important; color: #fff !important; border-radius: 12px !important; font-weight: 600 !important; padding: 8px 22px !important; }

.bar-track { background: rgba(255,255,255,0.06) !important; border: none !important; height: 6px !important; border-radius: 3px !important; }
.hp-bar-red { background: linear-gradient(90deg, rgba(255,69,58,0.5), rgba(255,69,58,0.8)) !important; border-radius: 3px !important; }
.hp-bar-green { background: linear-gradient(90deg, rgba(52,199,89,0.5), rgba(52,199,89,0.8)) !important; }
.mp-bar-blue { background: linear-gradient(90deg, rgba(0,122,255,0.5), rgba(0,122,255,0.8)) !important; }
.exp-fill { background: var(--gold) !important; }

.modal-overlay { background: rgba(0,0,0,0.3) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important; }

.map-card { background: rgba(30,32,48,0.3) !important; backdrop-filter: blur(16px) !important; border: 1px solid rgba(255,255,255,0.04) !important; }
.map-card.active { border-color: var(--gold) !important; background: rgba(0,122,255,0.05) !important; }

.inv-slot { background: rgba(255,255,255,0.03) !important; border: 1px solid rgba(255,255,255,0.04) !important; border-radius: 12px !important; }
.inv-slot.occupied:hover { border-color: var(--gold) !important; background: rgba(0,122,255,0.04) !important; }

.toast { background: rgba(30,32,48,0.7) !important; backdrop-filter: blur(30px) !important; border: 1px solid rgba(255,255,255,0.06) !important; color: rgba(255,255,255,0.9) !important; border-radius: 14px !important; }

::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08) !important; border-radius: 4px !important; }
::-webkit-scrollbar-track { background: transparent !important; }

.panel { animation: iderFrostIn 0.4s ease !important; }
@keyframes iderFrostIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
`
},

// ───────────────────────────────────────────────
// ⑧ 粗野主义 — 粗粝反叛
// ───────────────────────────────────────────────
brutal: {
name: '粗野主义',
desc: '粗粝不羁，破格醒目 · 厚边框，撞色块，无圆角',
css: `
:root {
  --bg: #f0f0f0 !important; --bg2: #ffffff !important; --bg3: #e0e0e0 !important;
  --bg4: #d0d0d0 !important; --border: #000000 !important;
  --text: #000000 !important; --text2: #555555 !important;
  --gold: #ff3300 !important; --gold2: #cc2200 !important;
  --accent: #0044ff !important; --red: #ff0000 !important; --green: #00cc00 !important;
  --radius: 0 !important;
}
body { font-family: 'Impact','Arial Black','Oswald',sans-serif !important; color: #000 !important; }

.view-login { background: #f0f0f0 !important; }
.login-card { background: #ffffff !important; border: 3px solid #000 !important; box-shadow: 8px 8px 0 #000 !important; }
.game-title { font-family: 'Impact',sans-serif !important; font-size: 32px !important; color: #000 !important; letter-spacing: 0 !important; text-transform: uppercase !important; text-shadow: 4px 4px 0 rgba(0,0,0,0.1) !important; }

.game-header { background: #000 !important; border-bottom: 4px solid #ff3300 !important; }
.hdr-name { font-family: 'Impact',sans-serif !important; font-size: 18px !important; color: #fff !important; text-transform: uppercase !important; letter-spacing: 2px !important; }
.realm-badge { background: #ff3300 !important; border: 2px solid #fff !important; color: #fff !important; font-size: 11px !important; }
.btn-icon { color: rgba(255,255,255,0.5) !important; }
.btn-icon:hover { color: #ff3300 !important; }

.tab-nav { background: #fff !important; border-bottom: 3px solid #000 !important; }
.tab-btn { color: #888 !important; font-family: 'Arial Black',sans-serif !important; font-size: 13px !important; text-transform: uppercase !important; padding: 10px 20px !important; border: none !important; }
.tab-btn.active { color: #000 !important; background: #ff3300 !important; color: #fff !important; }
.tab-btn:hover { color: #000 !important; background: #eee !important; }

.battle-sidebar { background: #fff !important; border-right: 3px solid #000 !important; }
.sidebar-char-name { font-family: 'Arial Black',sans-serif !important; color: #ff3300 !important; font-size: 16px !important; text-transform: uppercase !important; }
.sidebar-section-title { color: #000 !important; border-bottom: 2px solid #000 !important; font-size: 11px !important; text-transform: uppercase !important; padding-bottom: 4px !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: #fff !important; border: 2px solid #000 !important;
  padding: 12px !important; box-shadow: 4px 4px 0 #000 !important;
}
.skill-card.equipped { border-color: #ff3300 !important; background: #fff5f0 !important; }
.section-title { color: #ff3300 !important; border-bottom: 2px solid #000 !important; font-size: 12px !important; text-transform: uppercase !important; font-family: 'Arial Black',sans-serif !important; padding-bottom: 4px !important; }

.btn-action { background: #fff !important; border: 2px solid #000 !important; color: #000 !important; padding: 8px 16px !important; font-family: 'Arial Black',sans-serif !important; font-size: 12px !important; text-transform: uppercase !important; }
.btn-action:hover { background: #000 !important; color: #fff !important; }
.btn-action.gold { background: #ff3300 !important; border-color: #cc2200 !important; color: #fff !important; }
.btn-sm { background: #fff !important; border: 2px solid #000 !important; color: #000 !important; font-family: monospace !important; }
.btn-primary { background: #000 !important; border: 2px solid #000 !important; color: #fff !important; font-family: 'Arial Black',sans-serif !important; text-transform: uppercase !important; }

.bar-track { background: #e0e0e0 !important; border: 2px solid #000 !important; height: 12px !important; }
.hp-bar-red { background: #ff0000 !important; }
.hp-bar-green { background: #00cc00 !important; }
.mp-bar-blue { background: #0044ff !important; }
.exp-fill { background: #ff3300 !important; }

.modal-overlay { background: rgba(240,240,240,0.9) !important; }

.map-card { background: #fff !important; border: 2px solid #000 !important; box-shadow: 3px 3px 0 #000 !important; }
.map-card.active { border-color: #ff3300 !important; background: #fff5f0 !important; }

.inv-slot { background: #fff !important; border: 2px solid #000 !important; }
.inv-slot.occupied:hover { border-color: #ff3300 !important; }

.toast { background: #000 !important; border: 2px solid #ff3300 !important; color: #fff !important; }

::-webkit-scrollbar-thumb { background: #000 !important; }
::-webkit-scrollbar-track { background: #f0f0f0 !important; }

input, select, textarea { background: #fff !important; border: 2px solid #000 !important; color: #000 !important; }
input:focus { border-color: #ff3300 !important; }

.panel { animation: iderBrutIn 0.2s ease !important; }
@keyframes iderBrutIn { from { opacity: 0; transform: rotate(-1deg); } to { opacity: 1; transform: rotate(0); } }
`
}

}; // SKINS end

// ═══════════════════════════════════════════════════════════
// 映射：本地 key → 工单系统 CSS key
// ═══════════════════════════════════════════════════════════
const SKIN_KEY_MAP = {
  inkwash: 'ink',
  cyber: 'cyber',
  luxe: 'luxe',
  magazine: 'magazine',
  wabi: 'wabi',
  minimal: 'minimal',
  frost: 'frost',
  brutal: 'brutal',
};

// ═══════════════════════════════════════════════════════════
// 管理逻辑
// ═══════════════════════════════════════════════════════════

let activeStyleEl = null;
let isOrderSystemMode = false; // 是否正在使用工单系统皮肤

function getActiveSkin() { return GM_getValue(STORAGE_KEY, ''); }
function setActiveSkin(name) { GM_setValue(STORAGE_KEY, name); }

function clearActiveStyle() {
  if (activeStyleEl) { activeStyleEl.remove(); activeStyleEl = null; }
  const existing = document.querySelector('[data-ider-skin]');
  if (existing) existing.remove();
  const existingOs = document.querySelector('[data-ider-skin-os]');
  if (existingOs) existingOs.remove();
}

function applySkin(skinName) {
  clearActiveStyle();
  isOrderSystemMode = false;

  if (skinName && SKINS[skinName]) {
    const style = document.createElement('style');
    style.textContent = SKINS[skinName].css;
    style.setAttribute('data-ider-skin', skinName);
    document.head.appendChild(style);
    activeStyleEl = style;
    setActiveSkin(skinName);
    console.log('[皮肤] 已应用: ' + SKINS[skinName].name);
  } else {
    setActiveSkin('');
    console.log('[皮肤] 已恢复默认');
  }
}

// ══ 从工单系统 API 获取皮肤 ══
function fetchOrderSystemSkin() {
  const token = getApiToken();
  const apiUrl = getOrderSystemUrl();
  if (!token || !apiUrl) return Promise.resolve(null);

  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: apiUrl + '/api/skins/mine',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      onload: function(res) {
        try {
          const data = JSON.parse(res.responseText);
          if (data.ok && data.active && data.active.key) {
            const key = data.active.key;
            // Fetch the CSS
            GM_xmlhttpRequest({
              method: 'GET',
              url: apiUrl + '/api/skins/css/' + key,
              onload: function(cssRes) {
                resolve({ key: key, css: cssRes.responseText });
              },
              onerror: function() { resolve(null); },
              ontimeout: function() { resolve(null); },
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      },
      onerror: function() { resolve(null); },
      ontimeout: function() { resolve(null); },
    });
  });
}

// ══ 应用已保存的皮肤（启动时） ══
async function applySavedSkin() {
  const savedSkin = getActiveSkin();

  // 先尝试从工单系统同步（只要有 token 配置）
  const token = getApiToken();
  if (token) {
    const result = await fetchOrderSystemSkin();
    if (result) {
      applyOrderSystemSkin(result.key, result.css);
      return;
    }
  }

  // 回退到本地保存的皮肤
  if (savedSkin && savedSkin.startsWith('__os_')) {
    setActiveSkin('');
    return;
  }

  if (savedSkin && SKINS[savedSkin]) {
    if (document.querySelector('.game-header')) {
      applySkin(savedSkin);
    } else {
      const iv = setInterval(() => {
        if (document.querySelector('.game-header')) {
          applySkin(savedSkin);
          clearInterval(iv);
        }
      }, 200);
    }
  }
}

// ══ 注入切换按钮 ══
function injectSkinBtn() {
  const observer = new MutationObserver(() => {
    const header = document.querySelector('.game-header');
    if (header && !document.querySelector('.ider-skin-btn')) {
      const btn = document.createElement('button');
      btn.className = 'btn-icon ider-skin-btn';
      btn.textContent = '🎨';
      btn.title = '切换皮肤';
      btn.addEventListener('click', showSkinPicker);
      header.appendChild(btn);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ══ 皮肤选择面板（仅显示已拥有的皮肤） ══
let ownedSkinsCache = null; // { key: label } 已拥有皮肤缓存

async function fetchOwnedSkins() {
  const token = getApiToken();
  const apiUrl = getOrderSystemUrl();
  if (!token || !apiUrl) return null;
  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: apiUrl + '/api/skins/mine',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      onload: function(res) {
        try {
          const data = JSON.parse(res.responseText);
          if (data.ok && data.owned) {
            const map = {};
            (data.owned || []).forEach(s => { map[s.key] = s.label; });
            resolve(map);
          } else { resolve(null); }
        } catch (e) { resolve(null); }
      },
      onerror: function() { resolve(null); },
      ontimeout: function() { resolve(null); },
    });
  });
}

function showSkinPicker() {
  const existing = document.querySelector('.ider-skin-panel');
  if (existing) { existing.remove(); document.querySelector('.ider-skin-overlay')?.remove(); return; }

  const current = getActiveSkin();
  const overlay = document.createElement('div');
  overlay.className = 'ider-skin-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99998;';
  overlay.addEventListener('click', closeSkinPicker);

  const panel = document.createElement('div');
  panel.className = 'ider-skin-panel';
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(20,22,32,0.95);border:1px solid rgba(255,255,255,0.08);
    border-radius:16px;padding:24px;z-index:99999;
    min-width:320px;max-width:90vw;max-height:80vh;overflow-y:auto;
    backdrop-filter:blur(20px);box-shadow:0 24px 80px rgba(0,0,0,0.5);
    color:#d4d4e0;font-family:'PingFang SC','Microsoft YaHei',sans-serif;
  `;

  const token = getApiToken();
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="font-size:16px;font-weight:600;color:#d4a844">🎨 皮肤切换</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="ider-skin-config-btn" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#888;font-size:12px;padding:4px 8px;border-radius:8px;cursor:pointer;">⚙</button>
        <span class="ider-skin-close" style="font-size:20px;color:#888;cursor:pointer;line-height:1">✕</span>
      </div>
    </div>
    <div id="ider-os-status" style="font-size:11px;color:#666;margin-bottom:12px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.03);display:${token ? 'block' : 'none'}">
      <span id="ider-os-status-text">${token ? '工单系统已连接' : ''}</span>
    </div>
    <div style="display:grid;gap:8px" id="ider-skin-list">
      <div class="ider-skin-opt ${!current?'active':''}" data-skin=""
           style="padding:12px 16px;border-radius:12px;cursor:pointer;border:2px solid ${!current?'rgba(212,168,68,0.6)':'transparent'};background:rgba(255,255,255,0.03);transition:all 0.2s;">
        <div style="font-weight:600;font-size:14px;color:${!current?'#d4a844':'#ccc'}">🔄 默认样式</div>
        <div style="font-size:12px;color:#888;margin-top:2px">恢复游戏原始外观</div>
      </div>
  `;

  // 有 token 时从 API 获取已拥有皮肤列表
  if (token) {
    html += `<div style="text-align:center;padding:16px;color:#888;font-size:12px;" id="ider-skin-loading">⏳ 加载已拥有的皮肤...</div>`;
  } else {
    html += `
      <div style="text-align:center;padding:24px 16px;color:#666;font-size:13px;">
        <div style="font-size:32px;margin-bottom:8px;">🔒</div>
        <div>请在 ⚙ 设置中配置工单系统 Token</div>
        <div style="font-size:11px;margin-top:8px;color:#555;">登录工单系统 → 设置 → 获取 Token</div>
      </div>`;
  }

  html += `</div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);font-size:10px;color:#555;">
      <span>💡 仅显示你在工单系统已购买的皮肤</span>
    </div>`;
  panel.innerHTML = html;

  panel.querySelector('.ider-skin-close').addEventListener('click', closeSkinPicker);

  panel.querySelector('#ider-skin-config-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showConfigPanel(panel);
  });

  // 默认样式按钮
  panel.querySelectorAll('.ider-skin-opt[data-skin=""]').forEach(el => {
    el.addEventListener('click', () => {
      applySkin('');
      closeSkinPicker();
      showToast('已恢复默认样式');
    });
  });

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  // 有 token 时异步加载已拥有皮肤
  if (token) {
    loadOwnedSkins(panel);
  }
}

function applyOrderSystemSkinFromApi(skinKey, panel) {
  const apiUrl = getOrderSystemUrl();
  const token = getApiToken();
  if (!apiUrl || !token) return;

  const localKey = API_KEY_TO_LOCAL[skinKey];
  const localSkin = localKey ? SKINS[localKey] : null;

  const msgEl = panel.querySelector('#ider-os-status-text');
  if (msgEl) msgEl.textContent = '⏳ 应用皮肤...';

  GM_xmlhttpRequest({
    method: 'GET',
    url: apiUrl + '/api/skins/css/' + skinKey,
    onload: function(cssRes) {
      if (cssRes.status === 200 && cssRes.responseText) {
        applyOrderSystemSkin(skinKey, cssRes.responseText);
        closeSkinPicker();
        showToast('已切换皮肤');
      } else if (localSkin) {
        applySkin(localKey);
        closeSkinPicker();
        showToast('已切换为「' + localSkin.name + '」（离线模式）');
      }
    },
    onerror: function() {
      if (localSkin) {
        applySkin(localKey);
        closeSkinPicker();
        showToast('已切换为「' + localSkin.name + '」（离线模式）');
      }
    },
    ontimeout: function() {
      if (localSkin) {
        applySkin(localKey);
        closeSkinPicker();
        showToast('已切换为「' + localSkin.name + '」（离线模式）');
      }
    },
  });
}

function closeSkinPicker() {
  document.querySelector('.ider-skin-panel')?.remove();
  document.querySelector('.ider-skin-overlay')?.remove();
}

// 反向映射：工单系统 key → 本地 key
const API_KEY_TO_LOCAL = {};
for (const [local, api] of Object.entries(SKIN_KEY_MAP)) {
  API_KEY_TO_LOCAL[api] = local;
}

function renderFallbackSkins(listEl, owned, current, panel) {
  let count = 0;
  for (const [apiKey] of Object.entries(owned)) {
    const localKey = API_KEY_TO_LOCAL[apiKey] || apiKey;
    const skin = SKINS[localKey];
    if (!skin) continue;
    count++;
    const act = current === localKey || current === '__os_' + apiKey;
    const containerId = 'ider-fb-' + apiKey;
    listEl.insertAdjacentHTML('beforeend', `
      <div class="ider-skin-opt ${act?'active':''}" id="${containerId}"
           style="padding:12px 16px;border-radius:12px;cursor:pointer;border:2px solid ${act?'rgba(212,168,68,0.6)':'transparent'};background:rgba(255,255,255,0.03);transition:all 0.2s;">
        <div style="font-weight:600;font-size:14px;color:${act?'#d4a844':'#ccc'}">${skin.name}</div>
        <div style="font-size:12px;color:#888;margin-top:2px">${skin.desc}（本地缓存）</div>
      </div>`);
  }
  if (count === 0) {
    listEl.insertAdjacentHTML('beforeend', `
      <div style="text-align:center;padding:24px 16px;color:#666;font-size:13px;">
        <div>你还没有购买任何皮肤</div>
      </div>`);
    return;
  }
  listEl.querySelectorAll('.ider-skin-opt[id^="ider-fb-"]').forEach(el => {
    const key = el.id.replace('ider-fb-', '');
    el.addEventListener('click', () => applyOrderSystemSkinFromApi(key, panel));
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;top:60px;left:50%;transform:translateX(-50%);
    background:rgba(20,22,32,0.95);border:1px solid #d4a844;color:#d4a844;
    padding:10px 24px;border-radius:20px;z-index:99999;font-size:14px;
    max-width:90vw;text-align:center;animation:iderTIn 0.3s ease;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2500);
}



// ══ Token 获取教程 ══
function showTokenTutorial() {
  const apiUrl = getOrderSystemUrl();

  const modal = document.createElement('div');
  modal.className = 'ider-skin-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

  modal.innerHTML = `
    <div style="background:rgba(20,22,32,0.96);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;max-width:480px;width:90vw;max-height:80vh;overflow-y:auto;color:#d4d4e0;font-family:'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 24px 80px rgba(0,0,0,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span style="font-size:15px;font-weight:600;color:#d4a844;">🔑 获取 API Token</span>
        <span class="ider-custom-close" style="font-size:20px;color:#888;cursor:pointer;">✕</span>
      </div>

      <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:12px;">
        <h4 style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:8px;">📋 步骤</h4>
        <ol style="font-size:12px;color:#aaa;line-height:2;padding-left:16px;">
          <li>点击下方按钮打开 <strong>工单系统 → 设置页面</strong></li>
          <li>登录你的账号（如未登录）</li>
          <li>找到「<strong>API Token</strong>」区域</li>
          <li>点击「<strong>复制</strong>」按钮复制 Token</li>
          <li>回到游戏页面，打开 🎨 皮肤面板</li>
          <li>点击 ⚙ 设置，将 Token 粘贴到输入框中</li>
          <li>点击「保存」，脚本将自动同步你的皮肤</li>
        </ol>
      </div>

      <a href="${apiUrl}/#/settings" target="_blank" style="display:block;text-align:center;padding:10px 16px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:8px;color:#818cf8;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:12px;">
        🔗 打开工单系统设置页面
      </a>

      <div style="background:rgba(212,168,68,0.08);border:1px solid rgba(212,168,68,0.15);border-radius:8px;padding:12px;font-size:11px;color:#b8963a;">
        <strong>⚠️ 安全提醒</strong>
        <ul style="margin:4px 0 0 12px;padding:0;line-height:1.6;">
          <li>Token 相当于你的账号密码，请勿分享给他人</li>
          <li>如 Token 泄露，请立即在工单系统设置页面重新生成</li>
          <li>Token 有效期 7 天，到期后需要重新登录获取</li>
        </ul>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector('.ider-custom-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ══ 更新 config panel 添加 Token 教程按钮和自定义按钮 ══
// 在 showConfigPanel 中插入额外按钮
function showConfigPanel(panel) {
  const existingForm = panel.querySelector('#ider-config-form');
  if (existingForm) {
    existingForm.remove();
    return;
  }

  const cfg = getConfig();
  const configHtml = `
    <div id="ider-config-form" style="margin-top:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:12px;">
      <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:10px;">⚙ 设置</div>

      <div style="margin-bottom:8px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">API 地址</label>
        <input id="ider-cfg-url" type="text" value="${cfg.apiUrl || 'https://ider-order-system.pages.dev'}" style="width:100%;padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#ccc;font-size:12px;">
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">Token</label>
        <input id="ider-cfg-token" type="text" value="${cfg.token || ''}" placeholder="输入你的 Token" style="width:100%;padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#ccc;font-size:12px;font-family:monospace;">
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <button id="ider-cfg-save" style="flex:1;min-width:60px;padding:6px 12px;background:rgba(212,168,68,0.2);border:1px solid rgba(212,168,68,0.3);border-radius:8px;color:#d4a844;cursor:pointer;font-size:12px;">保存</button>
        <button id="ider-cfg-test" style="padding:6px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#888;cursor:pointer;font-size:12px;">测试连接</button>
        <button id="ider-cfg-token-help" style="padding:6px 12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:8px;color:#818cf8;cursor:pointer;font-size:12px;">🔑 获取 Token</button>
      </div>

      <div id="ider-cfg-msg" style="margin-top:8px;font-size:11px;color:#666;"></div>
    </div>`;

  const target = panel.querySelector('#ider-os-status') || panel.lastElementChild;
  target.insertAdjacentHTML('afterend', configHtml);

  // 保存
  panel.querySelector('#ider-cfg-save').addEventListener('click', () => {
    const apiUrl = panel.querySelector('#ider-cfg-url').value.trim();
    const token = panel.querySelector('#ider-cfg-token').value.trim();
    setConfig({ apiUrl, token });
    const msgEl = panel.querySelector('#ider-cfg-msg');
    msgEl.textContent = '✅ 已保存';
    msgEl.style.color = '#40a040';
    const statusEl = panel.querySelector('#ider-os-status');
    if (statusEl) {
      statusEl.style.display = token ? 'block' : 'none';
      const statusText = panel.querySelector('#ider-os-status-text');
      if (statusText) statusText.textContent = token ? '工单系统已连接' : '';
    }
    if (token) {
      msgEl.textContent = '⏳ 正在同步...';
      fetchOrderSystemSkin().then(result => {
        if (result) {
          applyOrderSystemSkin(result.key, result.css);
          msgEl.textContent = '✅ 已同步工单系统皮肤';
          closeSkinPicker();
          showToast('已同步工单系统皮肤');
        } else {
          msgEl.textContent = '⚠️ 未找到激活的皮肤或连接失败';
          msgEl.style.color = '#d4a844';
        }
      });
    }
  });

  // 测试连接
  panel.querySelector('#ider-cfg-test').addEventListener('click', () => {
    const apiUrl = panel.querySelector('#ider-cfg-url').value.trim();
    const token = panel.querySelector('#ider-cfg-token').value.trim();
    const msgEl = panel.querySelector('#ider-cfg-msg');
    msgEl.textContent = '⏳ 测试中...';
    msgEl.style.color = '#666';
    GM_xmlhttpRequest({
      method: 'GET',
      url: apiUrl + '/api/user/info',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      onload: function(res) {
        if (res.status === 200) {
          msgEl.textContent = '✅ 连接成功';
          msgEl.style.color = '#40a040';
        } else {
          msgEl.textContent = '❌ 连接失败: HTTP ' + res.status;
          msgEl.style.color = '#d04040';
        }
      },
      onerror: function() { msgEl.textContent = '❌ 网络错误'; msgEl.style.color = '#d04040'; },
    });
  });

  // Token 获取教程
  panel.querySelector('#ider-cfg-token-help').addEventListener('click', () => showTokenTutorial());
}

// ══ 加载已拥有的皮肤列表 ══
function loadOwnedSkins(panel) {
  fetchOwnedSkins().then(owned => {
    const listEl = panel.querySelector('#ider-skin-list');
    const loadingEl = panel.querySelector('#ider-skin-loading');
    if (loadingEl) loadingEl.remove();

    if (!owned || Object.keys(owned).length === 0) {
      listEl.insertAdjacentHTML('beforeend', `
        <div style="text-align:center;padding:24px 16px;color:#666;font-size:13px;">
          <div style="font-size:32px;margin-bottom:8px;">🎨</div>
          <div>你还没有购买任何皮肤</div>
          <div style="font-size:11px;margin-top:8px;color:#555;">前往工单系统皮肤商城购买</div>
        </div>`);
      return;
    }

    const apiUrl = getOrderSystemUrl();
    GM_xmlhttpRequest({
      method: 'GET',
      url: apiUrl + '/api/skins',
      headers: { 'Authorization': 'Bearer ' + getApiToken(), 'Content-Type': 'application/json' },
      onload: function(res) {
        try {
          const data = JSON.parse(res.responseText);
          const allSkins = (data.skins || []).filter(s => owned[s.key]);
          const current = getActiveSkin();

          allSkins.forEach(skin => {
            const act = current === '__os_' + skin.key;
            listEl.insertAdjacentHTML('beforeend', `
              <div class="ider-skin-opt ${act?'active':''}" data-skin-key="${skin.key}"
                   style="padding:12px 16px;border-radius:12px;cursor:pointer;border:2px solid ${act?'rgba(212,168,68,0.6)':'transparent'};background:rgba(255,255,255,0.03);transition:all 0.2s;">
                <div style="font-weight:600;font-size:14px;color:${act?'#d4a844':'#ccc'}">${skin.label}</div>
                <div style="font-size:12px;color:#888;margin-top:2px">${skin.description || ''}</div>
              </div>`);
          });

          listEl.querySelectorAll('.ider-skin-opt[data-skin-key]').forEach(el => {
            el.addEventListener('click', () => {
              applyOrderSystemSkinFromApi(el.dataset.skinKey, panel);
            });
          });
        } catch (e) {
          renderFallbackSkins(listEl, owned, getActiveSkin(), panel);
        }
      },
      onerror: function() {
        renderFallbackSkins(listEl, owned, getActiveSkin(), panel);
      },
    });
  }).catch(() => {
    const loadingEl = panel.querySelector('#ider-skin-loading');
    if (loadingEl) loadingEl.textContent = '❌ 加载失败，请检查网络';
  });
}

// ══ 应用工单系统皮肤 ══
function applyOrderSystemSkin(skinKey, cssText) {
  clearActiveStyle();
  isOrderSystemMode = true;
  const style = document.createElement('style');
  style.textContent = cssText;
  style.setAttribute('data-ider-skin-os', skinKey);
  document.head.appendChild(style);
  activeStyleEl = style;
  setActiveSkin('__os_' + skinKey);
  console.log('[皮肤] 已应用工单系统皮肤: ' + skinKey);
}

// 注入全局动画关键帧
const animStyle = document.createElement('style');
animStyle.textContent = `@keyframes iderTIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}}@keyframes iderCustomIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`;
document.head.appendChild(animStyle);

// ══ 启动 ══
setTimeout(() => {
  injectSkinBtn();
  // 延迟应用皮肤，等待 DOM 就绪
  setTimeout(applySavedSkin, 500);
}, 1000);

})();
