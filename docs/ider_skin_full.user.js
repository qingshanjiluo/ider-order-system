// ==UserScript==
// @name         艾德尔修仙传 - 完整皮肤系统 v3
// @namespace    http://tampermonkey.net/
// @version      4.0
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
// 5套完整皮肤（本地硬编码，作离线/手动选择用）
// ═══════════════════════════════════════════════════════════

const SKINS = {

// ───────────────────────────────────────────────
// ① 金碧辉煌 — 宫廷奢华风
// ───────────────────────────────────────────────
imperial: {
name: '金碧辉煌',
desc: '古典宫廷，朱红描金',
css: `
/* ══ 全局 ══ */
:root {
  --bg: #0d0505 !important;
  --bg2: #1a0a0a !important;
  --bg3: #2a1212 !important;
  --bg4: #3a1a1a !important;
  --border: #5a3a1a !important;
  --text: #e8d5c0 !important;
  --text2: #a89070 !important;
  --gold: #ffd700 !important;
  --gold2: #b8860b !important;
  --accent: #e8a735 !important;
  --red: #d04040 !important;
  --green: #40a040 !important;
  --radius: 12px !important;
}
body { font-family: 'STKaiti','KaiTi','楷体','Noto Serif SC',serif !important; }

/* ══ 登录页 ══ */
.view-login {
  background: linear-gradient(135deg, #0d0505 0%, #2a0a0a 30%, #1a0505 60%, #0d0505 100%) !important;
}
.login-card {
  background: linear-gradient(135deg, #1a0a0a, #2a1212) !important;
  border: 1px solid #5a3a1a !important;
  box-shadow: 0 0 40px rgba(139,105,20,0.15), inset 0 1px 0 rgba(255,215,0,0.05) !important;
}
.game-title {
  font-size: 32px !important;
  text-shadow: 0 0 30px rgba(255,215,0,0.3) !important;
  letter-spacing: 6px !important;
}

/* ══ Header ══ */
.game-header {
  background: linear-gradient(135deg, #1a0505, #2d0a0a, #1a0808) !important;
  border-bottom: 2px solid #8b6914 !important;
  box-shadow: 0 2px 20px rgba(139,105,20,0.15) !important;
}
.game-header::before {
  content: '' !important; position: absolute !important;
  bottom: -2px !important; left: 0 !important; right: 0 !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, #ffd700, transparent) !important;
}
.hdr-name {
  font-family: 'STKaiti','KaiTi',serif !important;
  font-size: 18px !important; color: #ffd700 !important;
  text-shadow: 0 0 12px rgba(255,215,0,0.3) !important;
  letter-spacing: 2px !important;
}
.realm-badge {
  background: linear-gradient(135deg, #5c3d0e, #8b6914) !important;
  color: #fff !important; border: 1px solid #ffd700 !important;
  box-shadow: 0 0 8px rgba(255,215,0,0.2) !important;
}
.hdr-res span:first-child { color: #ffd700 !important; border: 1px solid rgba(255,215,0,0.15) !important; border-radius: 12px !important; padding: 2px 10px !important; }
.hdr-res span[title*="宗门"] { color: #a78bfa !important; border: 1px solid rgba(167,139,250,0.15) !important; border-radius: 12px !important; padding: 2px 10px !important; }
.btn-icon:hover { color: #ffd700 !important; text-shadow: 0 0 12px rgba(255,215,0,0.3) !important; }

/* ══ Tab 导航 ══ */
.tab-nav { background: #120808 !important; border-bottom: 1px solid #3a1a1a !important; }
.tab-btn { color: #8a7a6a !important; }
.tab-btn.active {
  color: #ffd700 !important;
  border-bottom-color: #ffd700 !important;
  text-shadow: 0 0 10px rgba(255,215,0,0.2) !important;
}
.tab-btn:hover { color: #e8d5c0 !important; }
.sub-tab.active { color: #ffd700 !important; border-bottom-color: #ffd700 !important; }

/* ══ 侧边栏 ══ */
.battle-sidebar { background: #120808 !important; border-right: 1px solid #3a1a1a !important; }
.sidebar-char-name { color: #ffd700 !important; }
.sidebar-section-title { color: #ffd700 !important; border-bottom-color: #3a1a1a !important; }

/* ══ 卡片翻新 ══ */
.stat-card, .skill-card, .recipe-card, .sect-card, .alliance-card, .duel-card, .dungeon-card,
.mail-card, .listing-card, .task-card, .log-card, .chat-messages, .battle-status-panel,
.battle-log-box, .forge-form, .info-block, .modal-panel {
  background: linear-gradient(135deg, #1a0a0a, #2a1212) !important;
  border: 1px solid #3a1a1a !important;
  box-shadow: 0 2px 12px rgba(0,0,0,0.2) !important;
}
.skill-card.equipped {
  border-color: #b8860b !important;
  background: linear-gradient(135deg, #2a1a0a, #3a2a12) !important;
}
.section-title {
  color: #ffd700 !important;
  border-bottom-color: #3a1a1a !important;
  text-shadow: 0 0 8px rgba(255,215,0,0.15) !important;
}

/* ══ 按钮 ══ */
.btn-action {
  background: linear-gradient(135deg, #2a1212, #3a1a1a) !important;
  border: 1px solid #5a3a1a !important;
}
.btn-action.gold {
  background: linear-gradient(135deg, #5c3d0e, #8b6914) !important;
  color: #fff !important; border-color: #b8860b !important;
}
.btn-sm {
  background: #2a1212 !important; border: 1px solid #3a1a1a !important;
}
.btn-sm.gold { color: #ffd700 !important; border-color: #b8860b !important; }
.btn-primary { background: linear-gradient(135deg, #8b6914, #b8860b) !important; }

/* ══ 弹窗 ══ */
.modal-overlay { background: rgba(0,0,0,0.7) !important; }
.modal-title { color: #ffd700 !important; }

/* ══ 血条/进度条翻新 ══ */
.bar-track { background: #1a0a0a !important; border: 1px solid #3a1a1a !important; }
.hp-bar-red { background: linear-gradient(90deg, #8a2a2a, #d04040) !important; }
.hp-bar-green { background: linear-gradient(90deg, #2a6a2a, #40a040) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #2a3a8a, #3366e6) !important; }
.action-bar-yellow { background: linear-gradient(90deg, #8a7a2a, #e6b800) !important; }
.exp-fill { background: linear-gradient(90deg, #8b6914, #ffd700) !important; }
.exp-bar { background: #1a0a0a !important; border: 1px solid #3a1a1a !important; }

/* ══ 战斗日志 ══ */
.log-victory { color: #40a040 !important; }
.log-defeat { color: #d04040 !important; }
.log-ally { color: #74c0fc !important; }
.log-enemy { color: #ff6b6b !important; }
.battle-result.victory { background: rgba(64,160,64,0.15) !important; border: 1px solid rgba(64,160,64,0.3) !important; }
.battle-result.defeat { background: rgba(208,64,64,0.15) !important; border: 1px solid rgba(208,64,64,0.3) !important; }

/* ══ 地图卡片 ══ */
.map-card { background: linear-gradient(135deg, #1a0a0a, #2a1212) !important; }
.map-card.active { border-color: #ffd700 !important; background: rgba(255,215,0,0.08) !important; }

/* ══ 灵根 ══ */
.sr-bar { background: #1a0a0a !important; border: 1px solid #3a1a1a !important; }

/* ══ 背包 ══ */
.inv-slot { background: #1a0a0a !important; border: 1px solid #3a1a1a !important; }
.inv-slot.occupied:hover { border-color: #ffd700 !important; }
.inv-slot.selected { border-color: #ffd700 !important; }

/* ══ 物品详情 ══ */
.item-detail { background: linear-gradient(135deg, #1a0a0a, #2a1212) !important; }

/* ══ 装备槽 ══ */
.equip-slot { background: #1a0a0a !important; }

/* ══ 地图卡片噩梦 ══ */
.map-card-nightmare {
  border-color: #6b2a36 !important;
  background: radial-gradient(circle at 20% 0%, rgba(139,30,30,0.2), transparent 60%), linear-gradient(165deg, #2a0a0a, #1a0808) !important;
}

/* ══ Loading ══ */
.loading-spinner { border-top-color: #ffd700 !important; }

/* ══ Toast ══ */
.toast {
  background: rgba(26,10,10,0.95) !important;
  border: 1px solid #ffd700 !important;
  color: #ffd700 !important;
}

/* ══ 离线栏 ══ */
.offline-bar { background: #5a1a1a !important; }

/* ══ 滚动条 ══ */
::-webkit-scrollbar-thumb { background: #5a3a1a !important; }
::-webkit-scrollbar-track { background: #0d0505 !important; }

/* ══ 输入框 ══ */
input, select, textarea {
  background: #1a0a0a !important;
  border-color: #3a1a1a !important;
  color: #e8d5c0 !important;
}
input:focus { border-color: #ffd700 !important; }

/* ══ 页签底部动画 ══ */
.tab-btn.active::after {
  content: '' !important;
  display: block !important;
  height: 2px !important;
  background: linear-gradient(90deg, transparent, #ffd700, transparent) !important;
  margin-top: 2px !important;
  animation: iderTabGlow 2s ease-in-out infinite !important;
}
@keyframes iderTabGlow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ══ 按钮悬浮动画 ══ */
.btn-action, .btn-sm, .btn-icon {
  transition: all 0.3s cubic-bezier(.4,0,.2,1) !important;
}
.btn-action:hover, .btn-sm:hover {
  transform: translateY(-1px) !important;
}
.btn-action:active, .btn-sm:active {
  transform: translateY(0) scale(0.98) !important;
}

/* ══ 面板进场动画 ══ */
.panel {
  animation: iderPanelIn 0.3s ease !important;
}
@keyframes iderPanelIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
`
},

// ───────────────────────────────────────────────
// ② 水墨丹青 — 中式水墨风
// ───────────────────────────────────────────────
inkwash: {
name: '水墨丹青',
desc: '素雅写意，笔墨纸砚',
css: `
:root {
  --bg: #1a1a18 !important;
  --bg2: #22201c !important;
  --bg3: #2a2824 !important;
  --bg4: #3a3832 !important;
  --border: #4a4540 !important;
  --text: #d4ccc0 !important;
  --text2: #9a8a7a !important;
  --gold: #c9a96e !important;
  --gold2: #a08050 !important;
  --accent: #8a9ab8 !important;
  --red: #8a4040 !important;
  --green: #4a7a4a !important;
  --radius: 4px !important;
}
body { font-family: 'STSong','SimSun','宋体','Noto Serif SC',serif !important; }

.view-login { background: linear-gradient(135deg, #1a1a18, #2a2824) !important; }
.login-card { background: #22201c !important; border: 1px solid #4a4540 !important; }
.game-title { font-family: 'STSong',serif !important; font-size: 30px !important; letter-spacing: 8px !important; color: #c9a96e !important; font-weight: 400 !important; }

.game-header {
  background: linear-gradient(135deg, #1c1c1a, #2a2824, #1e1e1c) !important;
  border-bottom: 1px solid #4a4540 !important;
}
.game-header::before {
  content: '' !important; position: absolute !important;
  top: 0 !important; left: 5% !important; right: 5% !important;
  height: 2px !important;
  background: linear-gradient(90deg, transparent, #8a7a6a, #c9a96e, #8a7a6a, transparent) !important;
  opacity: 0.4 !important;
}
.hdr-name {
  font-family: 'STSong',serif !important;
  font-size: 17px !important; color: #c9a96e !important;
  letter-spacing: 3px !important; font-weight: 400 !important;
}
.realm-badge {
  background: rgba(201,169,110,0.08) !important;
  border: 1px solid rgba(201,169,110,0.2) !important;
  color: #c9a96e !important;
  border-radius: 2px !important;
}
.btn-icon { opacity: 0.6 !important; }
.btn-icon:hover { opacity: 1 !important; color: #c9a96e !important; }

.tab-nav { background: #1e1e1c !important; }
.tab-btn { color: #7a6a5a !important; letter-spacing: 1px !important; }
.tab-btn.active { color: #c9a96e !important; border-bottom-color: #c9a96e !important; }

.battle-sidebar { background: #1e1e1c !important; }
.sidebar-char-name { color: #c9a96e !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: #2a2824 !important;
  border: 1px solid #3a3832 !important;
  border-radius: 4px !important;
}
.section-title {
  color: #c9a96e !important;
  font-weight: 400 !important;
  letter-spacing: 2px !important;
  border-bottom: 1px solid #3a3832 !important;
}

.btn-action { background: #2a2824 !important; border: 1px solid #3a3832 !important; border-radius: 3px !important; }
.btn-action.gold { background: rgba(201,169,110,0.1) !important; border-color: #c9a96e !important; color: #c9a96e !important; }
.btn-primary { background: #3a3832 !important; color: #c9a96e !important; }

.bar-track { background: #1a1a18 !important; }
.hp-bar-red { background: linear-gradient(90deg, #5a2a2a, #8a4040) !important; }
.hp-bar-green { background: linear-gradient(90deg, #2a4a2a, #4a7a4a) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #2a3a5a, #4a6a8a) !important; }
.exp-fill { background: linear-gradient(90deg, #6a5a4a, #c9a96e) !important; }

.modal-overlay { background: rgba(0,0,0,0.6) !important; }

.map-card { background: #2a2824 !important; border: 1px solid #3a3832 !important; }
.map-card.active { border-color: #c9a96e !important; }

.inv-slot { background: #2a2824 !important; border: 1px solid #3a3832 !important; }

::-webkit-scrollbar-thumb { background: #4a4540 !important; }
::-webkit-scrollbar-track { background: #1a1a18 !important; }

.toast { background: rgba(34,32,28,0.95) !important; border-color: #c9a96e !important; color: #c9a96e !important; }

.panel { animation: iderFadeIn 0.4s ease !important; }
@keyframes iderFadeIn { from { opacity: 0; } to { opacity: 1; } }
`
},

// ───────────────────────────────────────────────
// ③ 赛博修仙 — 霓虹科幻风
// ───────────────────────────────────────────────
cyber: {
name: '赛博修仙',
desc: '霓虹光效，赛博修仙',
css: `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600&family=Rajdhani:wght@400;600&display=swap');

:root {
  --bg: #050510 !important;
  --bg2: #0a0a20 !important;
  --bg3: #10102a !important;
  --bg4: #1a1a3a !important;
  --border: #2a2a4a !important;
  --text: #c8d0e0 !important;
  --text2: #64748b !important;
  --gold: #22d3ee !important;
  --gold2: #0891b2 !important;
  --accent: #a855f7 !important;
  --red: #ef4444 !important;
  --green: #22c55e !important;
  --radius: 6px !important;
}
body { font-family: 'Rajdhani','Noto Sans SC',sans-serif !important; }

.view-login { background: linear-gradient(135deg, #050510, #0a0a20, #050510) !important; }
.login-card { background: rgba(10,10,32,0.9) !important; border: 1px solid rgba(168,85,247,0.2) !important; box-shadow: 0 0 40px rgba(168,85,247,0.05) !important; }
.game-title { font-family: 'Orbitron',sans-serif !important; text-shadow: 0 0 20px rgba(34,211,238,0.3) !important; color: #22d3ee !important; letter-spacing: 3px !important; }

.game-header {
  background: linear-gradient(135deg, #050510, #0a0a20, #050510) !important;
  border-bottom: 1px solid rgba(168,85,247,0.15) !important;
  box-shadow: 0 0 30px rgba(168,85,247,0.03) !important;
}
.game-header::before {
  content: '' !important; position: absolute !important;
  bottom: 0 !important; left: 0 !important; right: 0 !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, #a855f7, #22d3ee, #a855f7, transparent) !important;
  background-size: 200% 100% !important;
  animation: iderNeonScan 3s linear infinite !important;
}
@keyframes iderNeonScan {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.hdr-name {
  font-family: 'Orbitron',sans-serif !important;
  color: #22d3ee !important;
  text-shadow: 0 0 10px rgba(34,211,238,0.5), 0 0 30px rgba(34,211,238,0.2) !important;
}
.realm-badge {
  background: rgba(168,85,247,0.1) !important;
  border: 1px solid rgba(168,85,247,0.3) !important;
  color: #c084fc !important;
  text-shadow: 0 0 8px rgba(168,85,247,0.3) !important;
}
.btn-icon:hover { color: #22d3ee !important; text-shadow: 0 0 12px rgba(34,211,238,0.6) !important; }

.tab-nav { background: #080818 !important; border-bottom: 1px solid #1a1a3a !important; }
.tab-btn { color: #475569 !important; font-family: 'Rajdhani',sans-serif !important; font-size: 14px !important; letter-spacing: 0.5px !important; }
.tab-btn.active { color: #22d3ee !important; border-bottom-color: #22d3ee !important; text-shadow: 0 0 10px rgba(34,211,238,0.3) !important; }

.battle-sidebar { background: #080818 !important; border-right: 1px solid #1a1a3a !important; }
.sidebar-char-name { color: #22d3ee !important; font-family: 'Orbitron',sans-serif !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: linear-gradient(135deg, #0a0a20, #10102a) !important;
  border: 1px solid #2a2a4a !important;
}
.section-title { color: #22d3ee !important; border-bottom-color: #2a2a4a !important; font-family: 'Rajdhani',sans-serif !important; }

.btn-action { background: linear-gradient(135deg, #0a0a20, #10102a) !important; border: 1px solid #2a2a4a !important; }
.btn-action.gold {
  background: linear-gradient(135deg, rgba(34,211,238,0.1), rgba(168,85,247,0.1)) !important;
  border-color: rgba(34,211,238,0.3) !important;
  color: #22d3ee !important;
  text-shadow: 0 0 8px rgba(34,211,238,0.2) !important;
}
.btn-sm { background: #0a0a20 !important; border: 1px solid #2a2a4a !important; }
.btn-primary { background: linear-gradient(135deg, #a855f7, #22d3ee) !important; color: #000 !important; }

.hp-bar-red { background: linear-gradient(90deg, #7f1d1d, #ef4444) !important; box-shadow: 0 0 6px rgba(239,68,68,0.3) !important; }
.hp-bar-green { background: linear-gradient(90deg, #166534, #22c55e) !important; box-shadow: 0 0 6px rgba(34,197,94,0.3) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #1e3a5f, #3b82f6) !important; box-shadow: 0 0 6px rgba(59,130,246,0.3) !important; }
.exp-fill { background: linear-gradient(90deg, #6b21a8, #a855f7) !important; }

.bar-track { background: #0a0a20 !important; border: 1px solid #1a1a3a !important; }

.modal-overlay { background: rgba(0,0,0,0.7) !important; backdrop-filter: blur(4px) !important; }

.map-card { background: linear-gradient(135deg, #0a0a20, #10102a) !important; }
.map-card.active { border-color: #22d3ee !important; box-shadow: 0 0 16px rgba(34,211,238,0.1) !important; }

.inv-slot { background: #0a0a20 !important; border: 1px solid #2a2a4a !important; }

.toast {
  background: rgba(10,10,32,0.95) !important;
  border: 1px solid #22d3ee !important;
  color: #22d3ee !important;
  box-shadow: 0 0 20px rgba(34,211,238,0.1) !important;
}

::-webkit-scrollbar-thumb { background: #2a2a4a !important; }
::-webkit-scrollbar-track { background: #050510 !important; }

.panel { animation: iderCyberIn 0.3s ease !important; }
@keyframes iderCyberIn {
  from { opacity: 0; transform: translateX(-10px); filter: blur(2px); }
  to { opacity: 1; transform: translateX(0); filter: blur(0); }
}

/* 按钮霓虹边框动画 */
.btn-action.gold, .btn-sm.gold {
  transition: all 0.3s !important;
}
.btn-action.gold:hover {
  box-shadow: 0 0 16px rgba(34,211,238,0.2), inset 0 0 16px rgba(34,211,238,0.05) !important;
}
`
},

// ───────────────────────────────────────────────
// ④ 毛玻璃 — 玻璃拟态
// ───────────────────────────────────────────────
glass: {
name: '毛玻璃',
desc: '通透磨砂，现代简约',
css: `
:root {
  --bg: #0e0e14 !important;
  --bg2: rgba(20,22,32,0.6) !important;
  --bg3: rgba(26,29,46,0.5) !important;
  --bg4: rgba(34,38,64,0.4) !important;
  --border: rgba(255,255,255,0.06) !important;
  --text: rgba(255,255,255,0.85) !important;
  --text2: rgba(255,255,255,0.45) !important;
  --gold: rgba(212,168,68,0.9) !important;
  --gold2: rgba(192,144,48,0.8) !important;
  --accent: rgba(90,122,255,0.8) !important;
  --red: rgba(208,64,64,0.8) !important;
  --green: rgba(64,160,64,0.8) !important;
  --radius: 16px !important;
}

.game-header {
  background: rgba(20,22,32,0.5) !important;
  backdrop-filter: blur(20px) saturate(1.3) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.3) !important;
  border-bottom: 1px solid rgba(255,255,255,0.04) !important;
}
.hdr-name { font-weight: 300 !important; color: rgba(255,255,255,0.9) !important; }
.realm-badge { background: rgba(212,168,68,0.08) !important; backdrop-filter: blur(8px) !important; border: 1px solid rgba(212,168,68,0.15) !important; }

.tab-nav { background: rgba(20,22,32,0.4) !important; backdrop-filter: blur(12px) !important; }
.tab-btn.active { color: var(--gold) !important; }

.stat-card, .skill-card, .modal-panel {
  background: rgba(26,29,46,0.4) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255,255,255,0.04) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2) !important;
}

.battle-sidebar { background: rgba(20,22,32,0.3) !important; backdrop-filter: blur(12px) !important; }

.bar-track { background: rgba(255,255,255,0.05) !important; }
.hp-bar-red { background: linear-gradient(90deg, rgba(208,64,64,0.5), rgba(208,64,64,0.8)) !important; }
.exp-fill { background: linear-gradient(90deg, rgba(212,168,68,0.3), var(--gold)) !important; }

.btn-action { background: rgba(255,255,255,0.03) !important; border: 1px solid rgba(255,255,255,0.06) !important; backdrop-filter: blur(8px) !important; }
.btn-action:hover { background: rgba(255,255,255,0.06) !important; }
.btn-action.gold { border-color: rgba(212,168,68,0.2) !important; color: var(--gold) !important; }

.modal-overlay { background: rgba(0,0,0,0.4) !important; backdrop-filter: blur(4px) !important; }

.section-title { border-bottom-color: rgba(255,255,255,0.04) !important; }

.toast { background: rgba(20,22,32,0.8) !important; backdrop-filter: blur(20px) !important; }

.panel { animation: iderGlassIn 0.4s ease !important; }
@keyframes iderGlassIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
`
},

// ───────────────────────────────────────────────
// ⑤ 暗黑符文 — 神秘魔法风
// ───────────────────────────────────────────────
runic: {
name: '暗黑符文',
desc: '神秘符文，幽暗魔法',
css: `
:root {
  --bg: #08080e !important;
  --bg2: #0c0a14 !important;
  --bg3: #120e1e !important;
  --bg4: #1a1630 !important;
  --border: #2a2640 !important;
  --text: #c8c4e0 !important;
  --text2: #6a6690 !important;
  --gold: #a5b4fc !important;
  --gold2: #818cf8 !important;
  --accent: #6366f1 !important;
  --red: #dc2626 !important;
  --green: #22c55e !important;
  --radius: 8px !important;
}
body { font-family: 'Noto Sans SC','Segoe UI',sans-serif !important; }

.view-login { background: linear-gradient(135deg, #08080e, #0c0a14, #08080e) !important; }
.login-card { background: #0c0a14 !important; border: 1px solid #2a2640 !important; box-shadow: 0 0 40px rgba(99,102,241,0.05) !important; }
.game-title { color: #a5b4fc !important; text-shadow: 0 0 20px rgba(99,102,241,0.2) !important; }

.game-header {
  background: linear-gradient(135deg, #08080e, #0c0a14, #08080e) !important;
  border-bottom: 1px solid rgba(99,102,241,0.12) !important;
}
.game-header::before, .game-header::after {
  content: '✦' !important;
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  color: rgba(99,102,241,0.12) !important;
  font-size: 18px !important;
  text-shadow: 0 0 20px rgba(99,102,241,0.15) !important;
  animation: iderRunePulse 3s ease-in-out infinite !important;
}
.game-header::before { left: 10px !important; }
.game-header::after { right: 10px !important; animation-delay: 1.5s !important; }
@keyframes iderRunePulse {
  0%, 100% { opacity: 0.3; transform: translateY(-50%) scale(1); }
  50% { opacity: 0.8; transform: translateY(-50%) scale(1.15); }
}
.hdr-name {
  color: #a5b4fc !important;
  text-shadow: 0 0 15px rgba(99,102,241,0.3) !important;
}
.realm-badge {
  background: rgba(99,102,241,0.08) !important;
  border: 1px solid rgba(99,102,241,0.2) !important;
  color: #a5b4fc !important;
}

.tab-nav { background: #0a0812 !important; }
.tab-btn.active { color: #a5b4fc !important; border-bottom-color: #6366f1 !important; }

.battle-sidebar { background: #0a0812 !important; border-right: 1px solid #1a1630 !important; }
.sidebar-char-name { color: #a5b4fc !important; }

.stat-card, .skill-card, .modal-panel, .battle-status-panel {
  background: linear-gradient(135deg, #0c0a14, #120e1e) !important;
  border: 1px solid #2a2640 !important;
}
.section-title { color: #a5b4fc !important; border-bottom-color: #2a2640 !important; }

.btn-action { background: #120e1e !important; border: 1px solid #2a2640 !important; }
.btn-action.gold { background: rgba(99,102,241,0.08) !important; border-color: rgba(99,102,241,0.3) !important; color: #a5b4fc !important; }
.btn-primary { background: linear-gradient(135deg, #6366f1, #818cf8) !important; }

.bar-track { background: #0c0a14 !important; border: 1px solid #1a1630 !important; }
.hp-bar-red { background: linear-gradient(90deg, #5a1a1a, #dc2626) !important; box-shadow: 0 0 6px rgba(220,38,38,0.2) !important; }
.hp-bar-green { background: linear-gradient(90deg, #1a4a2a, #22c55e) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #1a2a5a, #6366f1) !important; }
.exp-fill { background: linear-gradient(90deg, #4a1a6a, #a855f7) !important; }

.modal-overlay { background: rgba(0,0,0,0.7) !important; }
.map-card { background: #120e1e !important; }
.map-card.active { border-color: #a5b4fc !important; }
.inv-slot { background: #120e1e !important; border: 1px solid #2a2640 !important; }

.toast { background: rgba(12,10,20,0.95) !important; border: 1px solid #6366f1 !important; color: #a5b4fc !important; }

::-webkit-scrollbar-thumb { background: #2a2640 !important; }
::-webkit-scrollbar-track { background: #08080e !important; }

/* 按钮符文光效 */
.btn-action { position: relative !important; overflow: hidden !important; }
.btn-action::after {
  content: '' !important;
  position: absolute !important;
  inset: 0 !important;
  background: linear-gradient(135deg, transparent 40%, rgba(99,102,241,0.03) 100%) !important;
  pointer-events: none !important;
}

.panel { animation: iderRuneIn 0.35s ease !important; }
@keyframes iderRuneIn {
  from { opacity: 0; clip-path: polygon(0 0, 100% 0, 100% 0, 0 0); }
  to { opacity: 1; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
}
`
}

}; // SKINS end

// ═══════════════════════════════════════════════════════════
// 映射：本地 key → 工单系统 CSS key
// ═══════════════════════════════════════════════════════════
const SKIN_KEY_MAP = {
  imperial: 'golden',
  inkwash: 'ink',
  cyber: 'cyber',
  glass: 'glass',
  runic: 'rune',
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
    // 之前用的是工单系统皮肤但获取失败了，恢复默认
    setActiveSkin('');
    return;
  }

  if (savedSkin === '__ider_custom') {
    const customDef = getCustomSkinDef();
    if (customDef && customDef.colors) {
      const css = buildCustomSkinCss(customDef);
      const applyIt = () => {
        clearActiveStyle();
        const style = document.createElement('style');
        style.textContent = css;
        style.setAttribute('data-ider-skin', 'custom');
        document.head.appendChild(style);
        activeStyleEl = style;
      };
      if (document.querySelector('.game-header')) {
        applyIt();
      } else {
        const iv = setInterval(() => {
          if (document.querySelector('.game-header')) { applyIt(); clearInterval(iv); }
        }, 200);
      }
    }
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
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;font-size:14px;color:${act?'#d4a844':'#ccc'}">${skin.name}</div>
            <div style="font-size:12px;color:#888;margin-top:2px">${skin.desc}（本地缓存）</div>
          </div>
          <span class="ider-skin-customize-btn" data-skin-key="${apiKey}" data-skin-label="${skin.name}"
                style="font-size:14px;opacity:0.4;cursor:pointer;transition:opacity 0.2s;" title="个性化">✏️</span>
        </div>
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
    el.addEventListener('click', (e) => {
      if (e.target.closest('.ider-skin-customize-btn')) return;
      applyOrderSystemSkinFromApi(key, panel);
    });
  });
  listEl.querySelectorAll('#ider-skin-list .ider-skin-customize-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCustomizeModal(btn.dataset.skinKey, btn.dataset.skinLabel);
    });
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

// ═══════════════════════════════════════════════════════════
// 皮肤个性化定制系统
// ═══════════════════════════════════════════════════════════

const CUSTOM_KEY = 'ider_skin_custom_v1';

const FONT_OPTIONS = [
  { value: '', label: '默认字体' },
  { value: "'STKaiti','KaiTi','楷体',serif", label: '楷体 (KaiTi)' },
  { value: "'STSong','SimSun','宋体',serif", label: '宋体 (Songti)' },
  { value: "'Orbitron','Rajdhani',sans-serif", label: '赛博朋克 (Cyber)' },
  { value: "'Noto Sans SC','Microsoft YaHei',sans-serif", label: '黑体 (YaHei)' },
  { value: "'Ma Shan Zheng','STKaiti',cursive", label: '马善政手写体' },
  { value: "'ZCOOL XiaoWei',serif", label: '少年体 (ZCOOL)' },
];

function getCustom() {
  const raw = GM_getValue(CUSTOM_KEY, '{}');
  try { return JSON.parse(raw); } catch { return {}; }
}

function setCustom(c) {
  GM_setValue(CUSTOM_KEY, JSON.stringify(c));
}

function getSkinOverrides(skinKey) {
  const custom = getCustom();
  return custom.overrides && custom.overrides[skinKey] ? custom.overrides[skinKey] : {};
}

function setSkinOverrides(skinKey, overrides) {
  const custom = getCustom();
  if (!custom.overrides) custom.overrides = {};
  custom.overrides[skinKey] = overrides;
  setCustom(custom);
}

function getCustomSkinDef() {
  const custom = getCustom();
  return custom.customSkin || null;
}

function setCustomSkinDef(def) {
  const custom = getCustom();
  custom.customSkin = def;
  setCustom(custom);
}

// 生成覆盖 CSS 变量
function buildOverrideCss(overrides) {
  const parts = [];
  if (overrides.accent) parts.push(`--gold:${overrides.accent}!important`);
  if (overrides.accent2) parts.push(`--gold2:${overrides.accent2}!important`);
  if (overrides.bg) parts.push(`--bg:${overrides.bg}!important`);
  if (overrides.bg2) parts.push(`--bg2:${overrides.bg2}!important`);
  if (overrides.radius) parts.push(`--radius:${overrides.radius}px!important`);
  if (overrides.font) parts.push(`body{font-family:${overrides.font}!important}`);
  if (overrides.textColor) parts.push(`--text:${overrides.textColor}!important`);
  if (overrides.text2Color) parts.push(`--text2:${overrides.text2Color}!important`);
  if (overrides.borderColor) parts.push(`--border:${overrides.borderColor}!important`);
  if (overrides.headerBg) parts.push(`.game-header{background:${overrides.headerBg}!important}`);
  return parts.join('\n');
}

// 应用个性化覆盖
function applyCustomOverrides(baseCss, skinKey) {
  const overrides = getSkinOverrides(skinKey);
  const overrideCss = buildOverrideCss(overrides);
  if (!overrideCss) return baseCss;
  return baseCss + '\n/* 个性化覆盖 */\n' + overrideCss;
}

// 生成自定义皮肤 CSS
function buildCustomSkinCss(def) {
  if (!def || !def.colors) return '';
  const c = def.colors;
  return `
:root {
  --bg: ${c.bg || '#0d0d14'} !important;
  --bg2: ${c.bg2 || '#1a1a24'} !important;
  --bg3: ${c.bg3 || '#22223a'} !important;
  --bg4: ${c.bg4 || '#2a2a46'} !important;
  --border: ${c.border || '#3a3a5a'} !important;
  --text: ${c.text || '#d4d4e8'} !important;
  --text2: ${c.text2 || '#8888aa'} !important;
  --gold: ${c.gold || '#d4a844'} !important;
  --gold2: ${c.gold2 || '#b8860b'} !important;
  --accent: ${c.accent || '#6366f1'} !important;
  --red: ${c.red || '#dc2626'} !important;
  --green: ${c.green || '#22c55e'} !important;
  --radius: ${c.radius || '8'}px !important;
}
body { font-family: ${c.font || "'Noto Sans SC',sans-serif"} !important; }
${c.headerBg ? `.game-header { background: ${c.headerBg} !important; }` : ''}
${c.headerBorder ? `.game-header { border-bottom: 2px solid ${c.headerBorder} !important; }` : ''}
${c.accent ? `
.tab-btn.active { color: ${c.gold || '#d4a844'} !important; border-bottom-color: ${c.gold || '#d4a844'} !important; }
.section-title { color: ${c.gold || '#d4a844'} !important; }
.sidebar-char-name { color: ${c.gold || '#d4a844'} !important; }
.hdr-name { color: ${c.gold || '#d4a844'} !important; }
` : ''}
.stat-card, .skill-card, .modal-panel {
  background: ${c.bg2 || '#1a1a24'} !important;
  border: 1px solid ${c.border || '#3a3a5a'} !important;
  border-radius: ${c.radius || '8'}px !important;
}
.btn-action { background: ${c.bg3 || '#22223a'} !important; border: 1px solid ${c.border || '#3a3a5a'} !important; }
.btn-action.gold {
  background: linear-gradient(135deg, ${c.bg2 || '#1a1a24'}, ${c.bg3 || '#22223a'}) !important;
  border-color: ${c.gold || '#d4a844'} !important;
  color: ${c.gold || '#d4a844'} !important;
}
.btn-primary { background: linear-gradient(135deg, ${c.gold2 || '#b8860b'}, ${c.gold || '#d4a844'}) !important; }
.hp-bar-red { background: linear-gradient(90deg, #4a1a1a, ${c.red || '#dc2626'}) !important; }
.hp-bar-green { background: linear-gradient(90deg, #1a4a2a, ${c.green || '#22c55e'}) !important; }
.exp-fill { background: linear-gradient(90deg, ${c.gold2 || '#b8860b'}, ${c.gold || '#d4a844'}) !important; }
.toast { background: ${c.bg2 || '#1a1a24'}e8 !important; border-color: ${c.gold || '#d4a844'} !important; color: ${c.gold || '#d4a844'} !important; }
.bar-track { background: ${c.bg || '#0d0d14'} !important; border: 1px solid ${c.border || '#3a3a5a'} !important; }
.map-card { background: ${c.bg2 || '#1a1a24'} !important; border: 1px solid ${c.border || '#3a3a5a'} !important; }
.inv-slot { background: ${c.bg2 || '#1a1a24'} !important; border: 1px solid ${c.border || '#3a3a5a'} !important; }
::-webkit-scrollbar-thumb { background: ${c.border || '#3a3a5a'} !important; }
::-webkit-scrollbar-track { background: ${c.bg || '#0d0d14'} !important; }
.tab-nav { background: ${c.bg || '#0d0d14'} !important; border-bottom: 1px solid ${c.border || '#3a3a5a'} !important; }
.battle-sidebar { background: ${c.bg || '#0d0d14'} !important; border-right: 1px solid ${c.border || '#3a3a5a'} !important; }
.game-header { background: linear-gradient(135deg, ${c.bg || '#0d0d14'}, ${c.bg2 || '#1a1a24'}) !important; }
.panel { animation: iderCustomIn 0.3s ease !important; }
@keyframes iderCustomIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
`;
}

// ══ 个性化定制面板 ══
function showCustomizeModal(skinKey, skinLabel) {
  const overrides = getSkinOverrides(skinKey);
  const custom = getCustom();

  const modal = document.createElement('div');
  modal.className = 'ider-skin-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

  const colors = ['#d4a844','#ff6b6b','#22d3ee','#a855f7','#22c55e','#f97316','#ec4899','#06b6d4','#eab308','#8b5cf6'];

  modal.innerHTML = `
    <div style="background:rgba(20,22,32,0.96);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;max-width:440px;width:90vw;max-height:80vh;overflow-y:auto;color:#d4d4e0;font-family:'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 24px 80px rgba(0,0,0,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span style="font-size:15px;font-weight:600;color:#d4a844;">✏️ 个性化 — ${skinLabel}</span>
        <span class="ider-custom-close" style="font-size:20px;color:#888;cursor:pointer;">✕</span>
      </div>

      <div style="margin-bottom:12px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">强调色（主色调）</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${colors.map(c => `
            <div class="ider-color-swatch" data-color="${c}" style="width:28px;height:28px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${overrides.accent === c ? '#fff' : 'transparent'};"></div>
          `).join('')}
          <input type="color" id="ider-custom-accent" value="${overrides.accent || '#d4a844'}" style="width:28px;height:28px;border:none;border-radius:6px;cursor:pointer;padding:0;background:none;">
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">背景深度</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="font-size:10px;color:#666;">亮</span>
          <input type="range" id="ider-custom-bg" min="0" max="100" value="${overrides.bgDarkness !== undefined ? overrides.bgDarkness : 50}" style="flex:1;">
          <span style="font-size:10px;color:#666;">暗</span>
          <span id="ider-custom-bg-val" style="font-size:11px;color:#888;min-width:24px;">${overrides.bgDarkness !== undefined ? overrides.bgDarkness : 50}</span>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">圆角大小</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="font-size:10px;color:#666;">方</span>
          <input type="range" id="ider-custom-radius" min="0" max="24" value="${overrides.radius || 8}" style="flex:1;">
          <span style="font-size:10px;color:#666;">圆</span>
          <span id="ider-custom-radius-val" style="font-size:11px;color:#888;min-width:16px;">${overrides.radius || 8}</span>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">字体</label>
        <select id="ider-custom-font" style="width:100%;padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#ccc;font-size:12px;">
          ${FONT_OPTIONS.map(f => `<option value="${f.value}" ${(overrides.font || '') === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>

      <div style="display:flex;gap:8px;">
        <button id="ider-custom-save" style="flex:1;padding:7px 12px;background:rgba(212,168,68,0.2);border:1px solid rgba(212,168,68,0.3);border-radius:8px;color:#d4a844;cursor:pointer;font-size:12px;">保存设置</button>
        <button id="ider-custom-reset" style="padding:7px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#888;cursor:pointer;font-size:12px;">重置</button>
      </div>
      <div id="ider-custom-msg" style="margin-top:8px;font-size:11px;color:#666;"></div>
    </div>`;

  document.body.appendChild(modal);

  function closeModal() { modal.remove(); }

  modal.querySelector('.ider-custom-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // 色块点击
  modal.querySelectorAll('.ider-color-swatch').forEach(el => {
    el.addEventListener('click', () => {
      const color = el.dataset.color;
      modal.querySelectorAll('.ider-color-swatch').forEach(s => s.style.borderColor = 'transparent');
      el.style.borderColor = '#fff';
      modal.querySelector('#ider-custom-accent').value = color;
    });
  });

  // 颜色选择器实时更新
  modal.querySelector('#ider-custom-accent').addEventListener('input', (e) => {
    const v = e.target.value;
    modal.querySelectorAll('.ider-color-swatch').forEach(s => {
      s.style.borderColor = s.dataset.color === v ? '#fff' : 'transparent';
    });
  });

  // 滑块显示值
  const bgSlider = modal.querySelector('#ider-custom-bg');
  const bgVal = modal.querySelector('#ider-custom-bg-val');
  bgSlider.addEventListener('input', () => { bgVal.textContent = bgSlider.value; });

  const radiusSlider = modal.querySelector('#ider-custom-radius');
  const radiusVal = modal.querySelector('#ider-custom-radius-val');
  radiusSlider.addEventListener('input', () => { radiusVal.textContent = radiusSlider.value; });

  // 保存
  modal.querySelector('#ider-custom-save').addEventListener('click', () => {
    const newOverrides = {
      accent: modal.querySelector('#ider-custom-accent').value,
      bgDarkness: parseInt(bgSlider.value),
      radius: parseInt(radiusSlider.value),
      font: modal.querySelector('#ider-custom-font').value,
    };
    // 根据背景深度计算具体颜色
    const d = newOverrides.bgDarkness / 100;
    const baseBright = Math.round(8 + d * 12);
    const bgStr = `rgb(${baseBright},${baseBright},${baseBright+4})`;
    newOverrides.bg = bgStr;
    newOverrides.bg2 = `rgb(${baseBright+8},${baseBright+8},${baseBright+14})`;

    setSkinOverrides(skinKey, newOverrides);

    const msgEl = modal.querySelector('#ider-custom-msg');
    msgEl.textContent = '✅ 已保存，重新选择该皮肤生效';
    msgEl.style.color = '#40a040';

    // 如果当前正在使用该皮肤，立即重新应用
    const current = getActiveSkin();
    const localKey = API_KEY_TO_LOCAL[skinKey] || skinKey;
    if (current === localKey || current === '__os_' + skinKey) {
      if (current.startsWith('__os_')) {
        // 对 OS 皮肤，重新从 API 加载
        GM_xmlhttpRequest({
          method: 'GET',
          url: getOrderSystemUrl() + '/api/skins/css/' + skinKey,
          onload: function(cssRes) {
            if (cssRes.status === 200 && cssRes.responseText) {
              applyOrderSystemSkin(skinKey, cssRes.responseText);
            }
          },
        });
      } else if (SKINS[localKey]) {
        applySkin(localKey);
      }
    }
  });

  // 重置
  modal.querySelector('#ider-custom-reset').addEventListener('click', () => {
    const custom = getCustom();
    if (custom.overrides) delete custom.overrides[skinKey];
    setCustom(custom);
    modal.querySelector('#ider-custom-accent').value = '#d4a844';
    bgSlider.value = '50';
    bgVal.textContent = '50';
    radiusSlider.value = '8';
    radiusVal.textContent = '8';
    modal.querySelector('#ider-custom-font').value = '';
    modal.querySelector('.ider-custom-msg') && (modal.querySelector('.ider-custom-msg').textContent = '✅ 已重置');
    const msgEl = modal.querySelector('#ider-custom-msg');
    msgEl.textContent = '✅ 已重置该皮肤的自定义设置';
    msgEl.style.color = '#40a040';
    // 重新应用
    const current = getActiveSkin();
    const localKey = API_KEY_TO_LOCAL[skinKey] || skinKey;
    if (current === localKey || current === '__os_' + skinKey) {
      if (SKINS[localKey]) { applySkin(localKey); }
    }
  });
}

// ══ 自定义皮肤创建器 ══
function showCustomSkinCreator() {
  const def = getCustomSkinDef();
  const c = def && def.colors ? def.colors : {};

  const modal = document.createElement('div');
  modal.className = 'ider-skin-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

  modal.innerHTML = `
    <div style="background:rgba(20,22,32,0.96);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;max-width:480px;width:90vw;max-height:80vh;overflow-y:auto;color:#d4d4e0;font-family:'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 24px 80px rgba(0,0,0,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span style="font-size:15px;font-weight:600;color:#d4a844;">🎨 自定义皮肤</span>
        <span class="ider-custom-close" style="font-size:20px;color:#888;cursor:pointer;">✕</span>
      </div>
      <p style="font-size:11px;color:#888;margin-bottom:16px;">完全自定义你的游戏外观，所有颜色均可调整</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">背景色</label><input type="color" id="cc-bg" value="${c.bg || '#0d0d14'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">卡片背景</label><input type="color" id="cc-bg2" value="${c.bg2 || '#1a1a24'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">按钮背景</label><input type="color" id="cc-bg3" value="${c.bg3 || '#22223a'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">边框色</label><input type="color" id="cc-border" value="${c.border || '#3a3a5a'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">主文字</label><input type="color" id="cc-text" value="${c.text || '#d4d4e8'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">次要文字</label><input type="color" id="cc-text2" value="${c.text2 || '#8888aa'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">金色（强调色）</label><input type="color" id="cc-gold" value="${c.gold || '#d4a844'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">金色暗色</label><input type="color" id="cc-gold2" value="${c.gold2 || '#b8860b'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">强调色（紫/蓝）</label><input type="color" id="cc-accent" value="${c.accent || '#6366f1'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">红色（危险）</label><input type="color" id="cc-red" value="${c.red || '#dc2626'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">绿色（安全）</label><input type="color" id="cc-green" value="${c.green || '#22c55e'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
        <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px;">页眉背景</label><input type="color" id="cc-header" value="${c.headerBg || '#0d0d14'}" style="width:100%;height:32px;border:none;border-radius:6px;cursor:pointer;background:none;"></div>
      </div>

      <div style="margin-top:12px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">圆角大小</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="font-size:10px;color:#666;">方</span>
          <input type="range" id="cc-radius" min="0" max="24" value="${c.radius || 8}" style="flex:1;">
          <span style="font-size:10px;color:#666;">圆</span>
          <span id="cc-radius-val" style="font-size:11px;color:#888;min-width:16px;">${c.radius || 8}</span>
        </div>
      </div>

      <div style="margin-top:12px;">
        <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">字体</label>
        <select id="cc-font" style="width:100%;padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#ccc;font-size:12px;">
          ${FONT_OPTIONS.map(f => `<option value="${f.value}" ${(c.font || '') === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;">
        <button id="cc-save" style="flex:1;padding:7px 12px;background:rgba(212,168,68,0.2);border:1px solid rgba(212,168,68,0.3);border-radius:8px;color:#d4a844;cursor:pointer;font-size:12px;">💾 创建自定义皮肤</button>
        <button id="cc-preview" style="padding:7px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#888;cursor:pointer;font-size:12px;">预览</button>
      </div>
      <div id="cc-msg" style="margin-top:8px;font-size:11px;color:#666;"></div>
    </div>`;

  document.body.appendChild(modal);

  function closeModal() { modal.remove(); }
  modal.querySelector('.ider-custom-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  const radiusSlider = modal.querySelector('#cc-radius');
  const radiusVal = modal.querySelector('#cc-radius-val');
  radiusSlider.addEventListener('input', () => { radiusVal.textContent = radiusSlider.value; });

  modal.querySelector('#cc-save').addEventListener('click', () => {
    const colors = {
      bg: modal.querySelector('#cc-bg').value,
      bg2: modal.querySelector('#cc-bg2').value,
      bg3: modal.querySelector('#cc-bg3').value,
      border: modal.querySelector('#cc-border').value,
      text: modal.querySelector('#cc-text').value,
      text2: modal.querySelector('#cc-text2').value,
      gold: modal.querySelector('#cc-gold').value,
      gold2: modal.querySelector('#cc-gold2').value,
      accent: modal.querySelector('#cc-accent').value,
      red: modal.querySelector('#cc-red').value,
      green: modal.querySelector('#cc-green').value,
      headerBg: modal.querySelector('#cc-header').value,
      radius: parseInt(radiusSlider.value),
      font: modal.querySelector('#cc-font').value,
    };
    setCustomSkinDef({ colors });
    closeModal();
    showToast('自定义皮肤已创建，在皮肤面板选择"✨ 自定义"使用');
  });

  modal.querySelector('#cc-preview').addEventListener('click', () => {
    const colors = {
      bg: modal.querySelector('#cc-bg').value,
      bg2: modal.querySelector('#cc-bg2').value,
      bg3: modal.querySelector('#cc-bg3').value,
      border: modal.querySelector('#cc-border').value,
      text: modal.querySelector('#cc-text').value,
      text2: modal.querySelector('#cc-text2').value,
      gold: modal.querySelector('#cc-gold').value,
      gold2: modal.querySelector('#cc-gold2').value,
      accent: modal.querySelector('#cc-accent').value,
      red: modal.querySelector('#cc-red').value,
      green: modal.querySelector('#cc-green').value,
      headerBg: modal.querySelector('#cc-header').value,
      radius: parseInt(radiusSlider.value),
      font: modal.querySelector('#cc-font').value,
    };
    const css = buildCustomSkinCss({ colors });
    clearActiveStyle();
    const style = document.createElement('style');
    style.textContent = css;
    style.setAttribute('data-ider-skin', 'custom_preview');
    document.head.appendChild(style);
    activeStyleEl = style;
    isOrderSystemMode = false;
    modal.querySelector('#cc-msg').textContent = '✅ 预览已应用，关闭后刷新恢复';
    modal.querySelector('#cc-msg').style.color = '#40a040';
  });
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

      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="ider-cfg-custom-skin" style="flex:1;padding:6px 12px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:8px;color:#a855f7;cursor:pointer;font-size:12px;">🎨 创建自定义皮肤</button>
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

  // 自定义皮肤创建器
  panel.querySelector('#ider-cfg-custom-skin').addEventListener('click', () => showCustomSkinCreator());
}

// ══ 更新 loadOwnedSkins 添加自定义皮肤和个性化按钮 ══
function loadOwnedSkins(panel) {
  fetchOwnedSkins().then(owned => {
    const listEl = panel.querySelector('#ider-skin-list');
    const loadingEl = panel.querySelector('#ider-skin-loading');
    if (loadingEl) loadingEl.remove();

    // 自定义皮肤选项（始终显示）
    const customDef = getCustomSkinDef();
    if (customDef && customDef.colors) {
      const current = getActiveSkin();
      const act = current === '__ider_custom';
      listEl.insertAdjacentHTML('beforeend', `
        <div class="ider-skin-opt ${act?'active':''}" data-skin-custom="1"
             style="padding:12px 16px;border-radius:12px;cursor:pointer;border:2px solid ${act?'rgba(168,85,247,0.6)':'transparent'};background:rgba(168,85,247,0.05);transition:all 0.2s;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:600;font-size:14px;color:${act?'#a855f7':'#ccc'}">✨ 自定义皮肤</div>
              <div style="font-size:12px;color:#888;margin-top:2px">你的专属配色方案</div>
            </div>
            <span style="font-size:18px;opacity:0.6;">🎨</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:4px;">
          <button id="ider-edit-custom-skin" style="flex:1;padding:4px 8px;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.15);border-radius:6px;color:#a855f7;cursor:pointer;font-size:10px;">✏️ 编辑自定义皮肤</button>
          <button id="ider-delete-custom-skin" style="padding:4px 8px;background:rgba(208,64,64,0.08);border:1px solid rgba(208,64,64,0.15);border-radius:6px;color:#d04040;cursor:pointer;font-size:10px;">🗑️ 删除</button>
        </div>`);
    }

    if (!owned || Object.keys(owned).length === 0) {
      if (!customDef) {
        listEl.insertAdjacentHTML('beforeend', `
          <div style="text-align:center;padding:24px 16px;color:#666;font-size:13px;">
            <div style="font-size:32px;margin-bottom:8px;">🎨</div>
            <div>你还没有购买任何皮肤</div>
            <div style="font-size:11px;margin-top:8px;color:#555;">前往工单系统皮肤商城购买</div>
          </div>`);
      }
    } else {
      // 从 API 获取完整皮肤信息
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
              const containerId = 'ider-skin-item-' + skin.key;
              listEl.insertAdjacentHTML('beforeend', `
                <div class="ider-skin-opt ${act?'active':''}" id="${containerId}"
                     style="padding:12px 16px;border-radius:12px;cursor:pointer;border:2px solid ${act?'rgba(212,168,68,0.6)':'transparent'};background:rgba(255,255,255,0.03);transition:all 0.2s;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <div style="font-weight:600;font-size:14px;color:${act?'#d4a844':'#ccc'}">${skin.label}</div>
                      <div style="font-size:12px;color:#888;margin-top:2px">${skin.description || ''}</div>
                    </div>
                    <span class="ider-skin-customize-btn" data-skin-key="${skin.key}" data-skin-label="${skin.label}"
                          style="font-size:14px;opacity:0.4;cursor:pointer;transition:opacity 0.2s;" title="个性化">✏️</span>
                  </div>
                </div>`);
            });

            // 点击皮肤应用
            listEl.querySelectorAll('.ider-skin-opt[id^="ider-skin-item-"]').forEach(el => {
              const id = el.id;
              const key = id.replace('ider-skin-item-', '');
              el.addEventListener('click', (e) => {
                if (e.target.closest('.ider-skin-customize-btn')) return;
                applyOrderSystemSkinFromApi(key, panel);
              });
            });

            // 个性化按钮
            listEl.querySelectorAll('.ider-skin-customize-btn').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showCustomizeModal(btn.dataset.skinKey, btn.dataset.skinLabel);
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
    }

    // 自定义皮肤按钮事件
    setTimeout(() => {
      const customOpt = listEl.querySelector('[data-skin-custom="1"]');
      if (customOpt) {
        customOpt.addEventListener('click', () => {
          const def = getCustomSkinDef();
          if (def && def.colors) {
            const css = buildCustomSkinCss(def);
            clearActiveStyle();
            const style = document.createElement('style');
            style.textContent = css;
            style.setAttribute('data-ider-skin', 'custom');
            document.head.appendChild(style);
            activeStyleEl = style;
            isOrderSystemMode = false;
            setActiveSkin('__ider_custom');
            closeSkinPicker();
            showToast('已应用自定义皮肤');
          }
        });
      }
      const editBtn = document.getElementById('ider-edit-custom-skin');
      if (editBtn) editBtn.addEventListener('click', () => showCustomSkinCreator());
      const delBtn = document.getElementById('ider-delete-custom-skin');
      if (delBtn) delBtn.addEventListener('click', () => {
        if (confirm('确定删除自定义皮肤吗？')) {
          const custom = getCustom();
          delete custom.customSkin;
          setCustom(custom);
          const current = getActiveSkin();
          if (current === '__ider_custom') {
            clearActiveStyle();
            setActiveSkin('');
          }
          closeSkinPicker();
          showToast('自定义皮肤已删除');
        }
      });
    }, 0);
  }).catch(() => {
    const loadingEl = panel.querySelector('#ider-skin-loading');
    if (loadingEl) loadingEl.textContent = '❌ 加载失败，请检查网络';
  });
}

// ══ 更新 applyOrderSystemSkin 应用个性化覆盖 ══
function applyOrderSystemSkin(skinKey, cssText) {
  clearActiveStyle();
  isOrderSystemMode = true;

  const overrides = getSkinOverrides(skinKey);
  const finalCss = buildOverrideCss(overrides) ? cssText + '\n' + buildOverrideCss(overrides) : cssText;

  const style = document.createElement('style');
  style.textContent = finalCss;
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
