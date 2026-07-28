// ==UserScript==
// @name         艾德尔修仙传 - 完整皮肤系统 v3
// @namespace    http://tampermonkey.net/
// @version      5.0
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
// SVG 图标系统 — 每个皮肤定制图标
// ═══════════════════════════════════════════════════════════

const ICONS = {
  // ── 通用 UI 图标（跨皮肤） ──
  gear: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1a7 7 0 0 0-.7.04l-.3.75-1.2.4-.6-.6-.7.7.6.6-.4 1.2-.75.3A7 7 0 0 0 1 8a7 7 0 0 0 .04.7l.75.3.4 1.2-.6.6.7.7.6-.6 1.2.4.3.75A7 7 0 0 0 8 15a7 7 0 0 0 .7-.04l.3-.75 1.2-.4.6.6.7-.7-.6-.6.4-1.2.75-.3A7 7 0 0 0 15 8a7 7 0 0 0-.04-.7l-.75-.3-.4-1.2.6-.6-.7-.7-.6.6-1.2-.4-.3-.75A7 7 0 0 0 8 1z"/><circle cx="8" cy="8" r="2.5"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3.5" y="7.5" width="9" height="7" rx="1"/><path d="M5.5 7.5V4.5a2.5 2.5 0 015 0v3"/><circle cx="8" cy="10.5" r="1"/></svg>',
  key: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="5.5" cy="10.5" r="3.5"/><path d="M8 8l4.5-4.5"/><line x1="10" y1="6" x2="12" y2="8"/><line x1="11" y1="3" x2="14" y2="6"/></svg>',
  bulb: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1a5 5 0 0 0-3 9c0 1 1 2 1 3h4c0-1 1-2 1-3a5 5 0 0 0-3-9z"/><line x1="6" y1="13" x2="10" y2="13"/><line x1="7" y1="15" x2="9" y2="15"/></svg>',
  checkmark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,8 6.5,12 13,4"/></svg>',
  warning: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1.5L1 13.5h14L8 1.5z"/><line x1="8" y1="6" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.8" fill="currentColor"/></svg>',
  cross: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>',
  cycle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><polyline points="14 2 14 7 9 7"/><polyline points="2 14 2 9 7 9"/><path d="M13.5 5.5A7 7 0 002.5 10M2.5 10.5A7 7 0 0013.5 6"/></svg>',
  hourglass: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 1h10v2a4 4 0 01-4 4 4 4 0 014 4v2H3v-2a4 4 0 014-4 4 4 0 01-4-4V1z"/><line x1="3" y1="1" x2="13" y2="1"/><line x1="3" y1="15" x2="13" y2="15"/></svg>',
  link: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5 11l6-6"/><path d="M7 4l1.5-1.5a3.5 3.5 0 015 5L12 9"/><path d="M9 12l-1.5 1.5a3.5 3.5 0 11-5-5L4 7"/></svg>',
  note: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="7.5" x2="11" y2="7.5"/><line x1="5" y1="10" x2="8" y2="10"/></svg>',
  palette: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="7"/><circle cx="5" cy="5" r="1.2" fill="currentColor"/><circle cx="11" cy="5" r="1.2" fill="currentColor"/><circle cx="3" cy="9" r="1" fill="currentColor"/><path d="M8 13a2 2 0 002-2" opacity="0.5"/></svg>',
  diamond: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><polygon points="8,2 14,6.5 8,14 2,6.5"/></svg>',
  // ── 水墨修仙 — 笔触质感图标 ──
  ink: {
    palette: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 13l4-8 4 6 4-8"/><circle cx="6" cy="4" r="1.2" fill="#c41e3a" stroke="none"/><path d="M2 13h12" opacity="0.3"/></svg>',
    setting: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="10" height="10" rx="0" stroke-dasharray="2 2"/><circle cx="8" cy="8" r="2.5"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="#8a7a6a" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/><path d="M2 2l12 12" opacity="0.15"/></svg>',
    lock: '<svg viewBox="0 0 16 16" fill="none" stroke="#8a7a6a" stroke-width="1.3"><rect x="4" y="7" width="8" height="7" rx="0"/><path d="M5.5 7V4.5a2.5 2.5 0 015 0V7"/><path d="M8 10v2" stroke-width="1.5"/></svg>',
    key: '<svg viewBox="0 0 16 16" fill="none" stroke="#8a7a6a" stroke-width="1.3"><path d="M5 11l-2 2"/><circle cx="7.5" cy="8.5" r="2.5"/><path d="M9 7l4-4M11 5l-2 2"/></svg>',
    tip: '<svg viewBox="0 0 16 16" fill="none" stroke="#8a7a6a" stroke-width="1"><path d="M8 2a4 4 0 00-4 4c0 2 1.5 3 1.5 4.5h5C10.5 9 12 8 12 6a4 4 0 00-4-4z"/><line x1="6.5" y1="12" x2="9.5" y2="12"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="#3a3228" stroke-width="1.5"><polyline points="33 41 37 45 44 37" stroke-dasharray="0"/><path d="M4 8l3 4 5-7"/></svg>',
    warning: '<svg viewBox="0 0 16 16" fill="none" stroke="#c41e3a" stroke-width="1.2"><path d="M8 2L2 13h12L8 2z"/><line x1="8" y1="6" x2="8" y2="9"/></svg>',
    cycle: '<svg viewBox="0 0 16 16" fill="none" stroke="#8a7a6a" stroke-width="1.3"><path d="M12 4a6 6 0 012 10"/><path d="M4 12a6 6 0 01-2-10"/><circle cx="8" cy="8" r="1.5" fill="#c41e3a"/></svg>',
    link: '<svg viewBox="0 0 16 16" fill="none" stroke="#8a7a6a" stroke-width="1.3"><path d="M5 11l6-6"/><path d="M7 4l1-1a2.5 2.5 0 013.5 3.5l-1 1"/><path d="M9 12l-1 1a2.5 2.5 0 11-3.5-3.5l1-1"/></svg>',
    hourglass: '<svg viewBox="0 0 16 16" fill="none" stroke="#8a7a6a" stroke-width="1.3"><path d="M4 2h8v3a4 4 0 01-4 4 4 4 0 014 4v1H4v-1a4 4 0 014-4 4 4 0 01-4-4V2z"/></svg>',
    crossError: '<svg viewBox="0 0 16 16" fill="none" stroke="#c41e3a" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  },
  // ── 樱花物语 — 粉嫩柔美 ──
  sakura: {
    palette: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M8 3L9 6l3-1-2 3 3 2-3 1 1 3-3-2-3 2 1-3-3-1 3-2-2-3 3 1z" opacity="0.7"/><circle cx="8" cy="8" r="2"/></svg>',
    setting: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M12.5 3.5L11 5M5 11L3.5 12.5"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="#d4878a" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/><circle cx="8" cy="8" r="6" opacity="0.15"/></svg>',
    lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="7.5" width="8" height="6" rx="2"/><path d="M5.5 7.5V5a2.5 2.5 0 015 0v2.5"/><circle cx="8" cy="10.5" r="0.8" fill="#d4878a"/></svg>',
    key: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><circle cx="5" cy="10" r="3"/><path d="M7 8l4-4"/><circle cx="12.5" cy="3.5" r="1.5" fill="#d4878a" stroke="none" opacity="0.3"/></svg>',
    tip: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><circle cx="8" cy="5" r="3"/><path d="M5 10c0-1 1.5-2 3-2s3 1 3 2"/><path d="M6 12h4"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="#7ab07a" stroke-width="2"><polyline points="3 8 6.5 12 13 4"/></svg>',
    warning: '<svg viewBox="0 0 16 16" fill="none" stroke="#d4878a" stroke-width="1.2"><path d="M8 2L2 13h12L8 2z"/><line x1="8" y1="6" x2="8" y2="9"/><circle cx="8" cy="11" r="0.5" fill="#d4878a"/></svg>',
    cycle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 4a6 6 0 012 10M4 12a6 6 0 01-2-10"/><circle cx="8" cy="8" r="1.5" fill="#f0bcc0"/></svg>',
    link: '<svg viewBox="0 0 16 16" fill="none" stroke="#d4878a" stroke-width="1"><path d="M5 11l6-6"/><path d="M7 4l1-1a2.5 2.5 0 013.5 3.5l-1 1"/><path d="M9 12l-1 1a2.5 2.5 0 11-3.5-3.5l1-1"/></svg>',
    hourglass: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 2h8v2a4 4 0 01-4 4 4 4 0 014 4v2H4v-2a4 4 0 014-4 4 4 0 01-4-4V2z"/></svg>',
    crossError: '<svg viewBox="0 0 16 16" fill="none" stroke="#d4878a" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  },
  // ── 赛博修仙 ──
  cyber: {
    palette: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1"><polygon points="8,2 14,6 12,14 4,14 2,6"/><circle cx="8" cy="8" r="1.5" fill="#00f0ff" opacity="0.4"/></svg>',
    setting: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1.2"><rect x="2" y="2" width="12" height="12" rx="0" stroke-dasharray="4 2"/><circle cx="8" cy="8" r="2.5"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2" opacity="0.4"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/><rect x="3" y="3" width="10" height="10" opacity="0.1"/></svg>',
    lock: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1.2"><rect x="4" y="7" width="8" height="7" rx="0"/><path d="M5.5 7V4a2.5 2.5 0 015 0v3"/><path d="M10 10.5a2 2 0 11-4 0z"/></svg>',
    key: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1.2"><circle cx="5.5" cy="10" r="3"/><path d="M8 7l4-4"/><rect x="10" y="4" width="3" height="1.5" fill="#00f0ff" opacity="0.3"/></svg>',
    tip: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1"><circle cx="8" cy="5" r="3"/><path d="M4 11a4 4 0 018 0"/><line x1="6" y1="12.5" x2="10" y2="12.5"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="2"><polyline points="3,8 6.5,12 13,4"/></svg>',
    warning: '<svg viewBox="0 0 16 16" fill="none" stroke="#f0c000" stroke-width="1.2"><polygon points="8,2 2,13 14,13"/><line x1="8" y1="6" x2="8" y2="9"/><rect x="7.5" y="10.5" width="1" height="1" fill="#f0c000"/></svg>',
    cycle: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1.2"><path d="M12 4a6 6 0 012 10M4 12a6 6 0 01-2-10"/><circle cx="8" cy="8" r="1"/></svg>',
    link: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1"><path d="M5 11l6-6"/><path d="M7 4l1-1a2.5 2.5 0 013.5 3.5l-1 1"/><path d="M9 12l-1 1a2.5 2.5 0 11-3.5-3.5l1-1"/></svg>',
    hourglass: '<svg viewBox="0 0 16 16" fill="none" stroke="#00f0ff" stroke-width="1.2"><polygon points="4,2 12,2 10,8 12,14 4,14 6,8" opacity="0.6"/><polygon points="6,8 10,8 8,8" fill="#00f0ff" opacity="0.15"/></svg>',
    crossError: '<svg viewBox="0 0 16 16" fill="none" stroke="#f04040" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  },
};

function icon(name, skinKey, size) {
  let svg;
  if (skinKey && ICONS[skinKey] && ICONS[skinKey][name]) {
    svg = ICONS[skinKey][name];
  } else if (ICONS[name]) {
    svg = ICONS[name];
  } else {
    return '';
  }
  const s = size || 16;
  return svg.replace('<svg', `<svg width="${s}" height="${s}" style="vertical-align:middle;display:inline-block;"`);
}

// ═══════════════════════════════════════════════════════════
// 水墨修仙 layout 引擎 (Phase 1-8 DOM 改造)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════
// 水墨修仙 · INKWASH LAYOUT
// 画卷展开式 DOM 布局改造引擎
// 参考: inkwash.css + inkwash.js
// ═══════════════════════════════════════

const INKWASH_CLASS = 'theme-inkwash';

const INKWASH = {
  active: false,
  observer: null,
  decorEl: null,

  ICONS: {
    mountain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 18L9 8l4 6 5-8 3 4"/><path d="M3 18h18"/><path d="M7 18V6"/><path d="M4 6l3 2 5-3 4 2 5-2"/></svg>',
    sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 14L3 21M21 3l-9 9M5 5l3 3M16 16l3 3"/></svg>',
    pouch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 10h12v10a2 2 0 01-2 2H8a2 2 0 01-2-2V10z"/><path d="M8 10V6a4 4 0 018 0v4"/><path d="M12 14v4"/><path d="M10 16h4"/></svg>',
    bamboo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="14" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/></svg>',
    talisman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20l4-10 4 6 4-8 4 12"/><circle cx="7" cy="6" r="1.5" fill="#C43A2B" stroke="none"/><circle cx="17" cy="5" r="1" fill="currentColor" opacity="0.3" stroke="none"/></svg>',
    inkstone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="14" width="16" height="6" rx="1"/><rect x="6" y="16" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.15"/><path d="M8 4l2 10M12 4l2 10M16 4l2 10"/><line x1="3" y1="14" x2="21" y2="14"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20l-7-7a4.5 4.5 0 016-6l1 1 1-1a4.5 4.5 0 016 6l-7 7z"/></svg>',
    dantian: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="5" stroke-dasharray="1 4"/><circle cx="12" cy="12" r="2" fill="currentColor" fill-opacity="0.15"/><path d="M12 2l1 3-1 1-1-1z" fill="currentColor" opacity="0.3"/></svg>',
    scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="13" y2="11"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  },

  TAB_ICONS: {
    announcement: 'scroll', character: 'heart', inventory: 'pouch',
    equipment: 'sword', skills: 'bamboo', techniques: 'bamboo',
    map: 'mountain', mail: 'scroll', chat: 'scroll',
    baiyi: 'talisman', cave: 'mountain', forge: 'talisman',
    sect: 'mountain', alliance: 'mountain', duel: 'sword',
    league: 'sword', dungeon: 'mountain', exchange: 'pouch',
    help: 'scroll', settings: 'inkstone',
  },

  // ── Phase 1: Header 引首 + 印章 ──
  layoutHeader() {
    const header = document.querySelector('.game-header');
    if (!header || header.classList.contains('inkwash-done')) return;
    header.classList.add('inkwash-done');

    try {
      if (!header.querySelector('.inkwash-header-line')) {
        const line = document.createElement('div');
        line.className = 'inkwash-header-line';
        header.insertAdjacentElement('afterbegin', line);
      }
    } catch (e) { console.error('[inkwash] header-line跳过:', e.message); }

    try {
      const nameEl = header.querySelector('.hdr-name');
      if (nameEl) nameEl.classList.add('inkwash-seal-text');
    } catch (e) { /* ignore */ }

    try {
      const info = header.querySelector('.hdr-info');
      const res = header.querySelector('.hdr-res');
      if (info && !header.querySelector('.inkwash-divider')) {
        const div = document.createElement('div');
        div.className = 'inkwash-divider';
        if (res) header.insertBefore(div, res);
        else header.insertAdjacentElement('beforeend', div);
      }
    } catch (e) { console.error('[inkwash] divider跳过:', e.message); }

    const applyBtnSvgs = () => {
      try {
        const btns = document.querySelectorAll('.game-header .btn-icon:not(.ider-skin-btn), header .btn-icon:not(.ider-skin-btn)');
        btns.forEach(btn => {
          if (btn.dataset.inkwashBound) return;
          btn.dataset.inkwashBound = '1';
          btn.style.cssText = 'background:none!important;border:none!important;cursor:pointer!important;padding:4px!important;color:var(--text2)!important;font-size:16px!important;line-height:1!important';
        });
      } catch (e) { /* ignore */ }
    };
    setTimeout(applyBtnSvgs, 800);
  },

  // ── Phase 2: 导航栏（禁用 SVG 图标）──
  layoutNav() {
  },

  // ── Phase 3: 侧栏玉册 ──
  layoutSidebar() {
    const sidebar = document.querySelector('.battle-sidebar');
    if (!sidebar || sidebar.classList.contains('inkwash-done')) return;
    sidebar.classList.add('inkwash-done');

    const nameEl = sidebar.querySelector('.sidebar-char-name');
    if (nameEl) {/* 已移除竖排样式 */}

    sidebar.querySelectorAll('.exp-bar, .sr-bar, .bar-track').forEach(bar => {
      bar.classList.add('inkwash-bar-bg');
      const fill = bar.querySelector('.exp-fill, .sr-fill, .bar-fill');
      if (fill) fill.classList.add('inkwash-bar-fill');
    });
  },

  // ── Phase 4: 战斗面板 ──
  layoutBattle() {
    const panel = document.querySelector('.battle-status-panel');
    if (!panel || panel.classList.contains('inkwash-done')) return;
    panel.classList.add('inkwash-done');

    panel.querySelectorAll('.bar-track').forEach(bar => {
      bar.classList.add('inkwash-bar-bg');
      const fill = bar.querySelector('.bar-fill');
      if (fill) fill.classList.add('inkwash-bar-fill');
    });
  },

  // ── Phase 5: 卡片 ──
  layoutCards() {
    document.querySelectorAll('.stat-card, .skill-card, .map-card').forEach(card => {
      if (card.classList.contains('inkwash-done')) return;
      card.classList.add('inkwash-card');
    });
  },

  // ── Phase 6: Modal 弹窗 ──
  layoutModals() {
    document.querySelectorAll('.modal-panel, .modal-overlay').forEach(el => {
      if (el.classList.contains('inkwash-done')) return;
      el.classList.add('inkwash-done');
    });
  },

  // ── 统一 layout 入口 ──
  layout() {
    if (!this.active) return;
    this.layoutHeader();
    this.layoutNav();
    this.layoutSidebar();
    this.layoutBattle();
    this.layoutCards();
    this.layoutModals();
  },

  // ── 背景装饰层 ──
  MOUNTAIN_SVG: '<svg viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="mg1" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:0.08"/><stop offset="40%" style="stop-color:#1a1a1a;stop-opacity:0.03"/><stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:0"/></linearGradient><linearGradient id="mg2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:0.05"/><stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:0"/></linearGradient><linearGradient id="mg3" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:0.025"/><stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:0"/></linearGradient><filter id="mb1"><feGaussianBlur stdDeviation="3"/></filter><filter id="mb2"><feGaussianBlur stdDeviation="1.5"/></filter><filter id="mb3"><feGaussianBlur stdDeviation="4"/></filter></defs><path d="M0,320 Q120,260 240,290 Q360,250 480,280 Q540,260 600,270 Q720,220 840,260 Q960,230 1080,270 Q1200,250 1320,280 Q1380,260 1440,270 L1440,420 L0,420 Z" fill="url(#mg1)" filter="url(#mb1)"/><path d="M0,360 Q180,310 360,340 T720,310 T1080,340 T1440,320 L1440,420 L0,420 Z" fill="url(#mg2)" filter="url(#mb2)"/><path d="M0,390 Q200,350 400,370 T800,350 T1200,380 T1440,360 L1440,420 L0,420 Z" fill="url(#mg3)" filter="url(#mb3)"/><path d="M500,420 Q520,200 560,160 Q600,200 620,420 Z" fill="rgba(26,26,26,0.03)"/><path d="M720,420 Q780,260 840,220 Q900,260 960,420 Z" fill="rgba(26,26,26,0.025)"/><path d="M200,420 Q220,280 260,260 Q300,280 320,420 Z" fill="rgba(26,26,26,0.02)"/><path d="M1050,420 Q1100,300 1150,280 Q1200,300 1250,420 Z" fill="rgba(26,26,26,0.015)"/><path d="M0,400 Q180,385 360,400 T720,390 T1080,400 T1440,395" stroke="rgba(26,26,26,0.04)" stroke-width="0.6" fill="none"/><path d="M0,408 Q180,395 360,408 T720,398 T1080,408 T1440,403" stroke="rgba(26,26,26,0.03)" stroke-width="0.4" fill="none"/><path d="M0,415 Q180,405 360,415 T720,405 T1080,415 T1440,410" stroke="rgba(26,26,26,0.02)" stroke-width="0.3" fill="none"/><path d="M60,310 Q80,280 100,310 Q120,280 140,310 Q160,280 180,310" stroke="rgba(26,26,26,0.015)" stroke-width="0.4" fill="none" opacity="0.5"/><path d="M1150,290 Q1180,250 1210,290 Q1240,250 1270,290" stroke="rgba(26,26,26,0.012)" stroke-width="0.3" fill="none" opacity="0.4"/></svg>',

  BAMBOO_SVG: '<svg viewBox="0 0 60 120" xmlns="http://www.w3.org/2000/svg"><g opacity="0.06" stroke="#1a1a1a" fill="none" stroke-linecap="round"><path d="M15,10 Q12,30 16,50 Q20,70 14,90 Q10,105 15,115" stroke-width="2"/><path d="M15,30 Q20,35 18,40" stroke-width="1.5"/><path d="M16,55 Q22,60 18,65" stroke-width="1.5"/><path d="M14,80 Q8,85 12,90" stroke-width="1.5"/><path d="M38,18 Q35,35 40,55 Q44,75 38,95 Q34,110 40,118" stroke-width="1.8"/><path d="M38,40 Q44,45 40,50" stroke-width="1.2"/><path d="M39,65 Q45,68 42,73" stroke-width="1.2"/><path d="M24,5 Q22,15 24,25 Q26,15 24,5" fill="#1a1a1a" opacity="0.4" stroke="none"/><path d="M50,8 Q48,18 50,28 Q52,18 50,8" fill="#1a1a1a" opacity="0.3" stroke="none"/></g></svg>',

  PAPER_TEXTURE: '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="pt1"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="matrix" values="1 0 0 0 0  0 0.97 0 0 0  0 0.94 0 0 0  0 0 0 0.12 0"/></filter><rect width="200" height="200" fill="transparent" filter="url(#pt1)"/></svg>',

  BIRDS_SVG: '<svg viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg"><path d="M20 15Q25 8 30 15Q35 8 40 15" stroke="#1a1a1a" stroke-width="0.8" fill="none" opacity="0.08"/><path d="M70 12Q74 6 78 12Q82 6 86 12" stroke="#1a1a1a" stroke-width="0.6" fill="none" opacity="0.06"/><path d="M50 18Q53 13 56 18Q59 13 62 18" stroke="#1a1a1a" stroke-width="0.5" fill="none" opacity="0.04"/><path d="M30 20Q33 14 36 20Q39 14 42 20" stroke="#1a1a1a" stroke-width="0.4" fill="none" opacity="0.03"/></svg>',

  createDecorations() {
    if (this.decorEl) return;
    const wrap = document.createElement('div');
    wrap.id = 'inkwash-decor';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none';

    const layers = [
      { tag: 'div', cls: 'ider-ink-mountains', html: this.MOUNTAIN_SVG },
      { tag: 'div', cls: 'ider-ink-mist' },
      { tag: 'div', cls: 'ider-ink-corner tl' },
      { tag: 'div', cls: 'ider-ink-corner tr' },
      { tag: 'div', cls: 'ider-ink-corner bl' },
      { tag: 'div', cls: 'ider-ink-corner br' },
      { tag: 'div', cls: 'ider-ink-bamboo', html: this.BAMBOO_SVG },
      { tag: 'div', cls: 'ider-ink-birds', html: this.BIRDS_SVG },
      { tag: 'div', cls: 'ider-ink-paper-texture', html: this.PAPER_TEXTURE },
    ];
    for (const l of layers) {
      const el = document.createElement(l.tag);
      el.className = l.cls;
      if (l.html) el.innerHTML = l.html;
      wrap.appendChild(el);
    }

    const positions = [
      {w:5,t:'10%',l:'8%'},{w:3,t:'25%',r:'10%'},{w:7,b:'28%',l:'12%'},
      {w:4,t:'52%',r:'15%'},{w:6,b:'42%',r:'6%'},{w:2,t:'40%',l:'20%'},
      {w:5,b:'18%',r:'22%'},{w:3,t:'68%',l:'28%'},{w:4,t:'15%',r:'35%'},
      {w:8,b:'50%',l:'5%'},{w:3,b:'60%',r:'30%'},{w:6,t:'35%',l:'40%'}
    ];
    for (const p of positions) {
      const dot = document.createElement('div');
      dot.className = 'ider-ink-splash';
      dot.style.cssText = `width:${p.w}px;height:${p.w}px;top:${p.top||'auto'};bottom:${p.bottom||'auto'};left:${p.left||'auto'};right:${p.right||'auto'}`;
      wrap.appendChild(dot);
    }
    document.body.prepend(wrap);
    this.decorEl = wrap;
  },

  removeDecorations() {
    if (this.decorEl) { this.decorEl.remove(); this.decorEl = null; }
  },

  // ── 定时刷新布局（不监听 DOM 变化，避免干扰 Vue） ──
  startObserver() {
    if (this._pollIv) return;
    this._pollIv = setInterval(() => {
      if (this.active && document.querySelector('.view-game')) this.layout();
    }, 3000);
  },

  stopObserver() {
    if (this._pollIv) { clearInterval(this._pollIv); this._pollIv = null; }
    document.querySelectorAll('.inkwash-done').forEach(el => el.classList.remove('inkwash-done'));
  },

  // ── 应用 / 移除 ──
  apply() {
    if (this.active) return;
    this.active = true;
    // 移除游戏自带的旧 inkwash.css（flex-direction:column 冲突）
    document.querySelectorAll('link[rel="stylesheet"][href*="inkwash.css"]').forEach(el => el.remove());
    document.documentElement.classList.add(INKWASH_CLASS);
    this.createDecorations();
    this.layout();
    this.startObserver();
  },

  remove() {
    this.active = false;
    document.documentElement.classList.remove(INKWASH_CLASS);
    this.stopObserver();
    this.removeDecorations();
  },
};

// ═══════════════════════════════════════════════════════════
// 赛博修仙 — 代码雨 + 文字扫描动画
// ═══════════════════════════════════════════════════════════

const CYBERWASH = {
  active: false,
  canvas: null,
  ctx: null,
  animId: null,
  scanEl: null,
  chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏灵气氤氲剑意纵横道法自然万剑归宗',
  drops: [],

  apply() {
    if (this.active) return;
    this.active = true;
    this.createScanLine();
    this.createCanvas();
    this.animate();
  },

  remove() {
    this.active = false;
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    if (this.canvas) { this.canvas.remove(); this.canvas = null; this.ctx = null; }
    if (this.scanEl) { this.scanEl.remove(); this.scanEl = null; }
    this.drops = [];
  },

  createScanLine() {
    this.scanEl = document.createElement('div');
    this.scanEl.id = 'ider-cyber-scan';
    this.scanEl.textContent = '道 法 自 然  ·  剑 意 纵 衡  ·  灵 气 氤 氲';
    this.scanEl.style.cssText = 'position:fixed!important;left:0!important;right:0!important;height:24px!important;line-height:24px!important;text-align:center!important;font-size:11px!important;font-family:"Rajdhani","Courier New",monospace!important;letter-spacing:8px!important;color:#00f0ff!important;z-index:-2!important;pointer-events:none!important;background:linear-gradient(90deg,transparent,rgba(0,240,255,0.06),transparent)!important;animation:iderCyberScanLine 8s ease-in-out infinite!important;mix-blend-mode:screen!important;opacity:0!important';
    document.body.prepend(this.scanEl);
  },

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'ider-code-rain';
    this.canvas.style.cssText = 'position:fixed!important;inset:0!important;z-index:-2!important;pointer-events:none!important;opacity:0.25!important;width:100vw!important;height:100vh!important';
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const cols = Math.floor(this.canvas.width / 16);
    this.drops = [];
    for (let i = 0; i < cols; i++) {
      this.drops[i] = Math.floor(Math.random() * -100);
    }
  },

  animate() {
    if (!this.active || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = 'rgba(3,3,10,0.08)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = '14px "Rajdhani","Courier New",monospace';
    for (let i = 0; i < this.drops.length; i++) {
      const char = this.chars[Math.floor(Math.random() * this.chars.length)];
      const x = i * 16;
      const y = this.drops[i] * 16;

      ctx.fillStyle = '#00f0ff';
      ctx.fillText(char, x, y);

      const neon = y - 16 * 8;
      for (let j = 1; j <= 8; j++) {
        const fadeY = y - j * 16;
        if (fadeY < 0) break;
        const fadeChar = this.chars[Math.floor(Math.random() * this.chars.length)];
        const alpha = 0.6 - j * 0.07;
        ctx.fillStyle = `rgba(0,240,255,${alpha < 0 ? 0 : alpha})`;
        ctx.fillText(fadeChar, x, fadeY);
      }

      if (this.drops[i] * 16 > h && Math.random() > 0.98) {
        this.drops[i] = 0;
      }
      this.drops[i]++;
    }
    this.animId = requestAnimationFrame(() => this.animate());
  },
};

// ═══════════════════════════════════════════════════════════
// 8套全面升级皮肤（覆盖CSS + 布局优化）
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════
// 敦煌飞天 — 壁画霓裳，飞天神韵
// ═══════════════════════════════════════

const DUNHUANGWASH = {
  active: false, decorEl: null, observer: null,

  RIBBON_SVG: '<svg viewBox="0 0 1440 800" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rib1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#D4432A" stop-opacity="0.08"/><stop offset="30%" stop-color="#D4A844" stop-opacity="0.06"/><stop offset="60%" stop-color="#2AA8A8" stop-opacity="0.05"/><stop offset="100%" stop-color="#D4432A" stop-opacity="0.04"/></linearGradient><linearGradient id="rib2" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2AA8A8" stop-opacity="0.06"/><stop offset="40%" stop-color="#D4A844" stop-opacity="0.04"/><stop offset="100%" stop-color="#D4432A" stop-opacity="0.06"/></linearGradient><linearGradient id="rib3" x1="0.5" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#D4A844" stop-opacity="0.03"/><stop offset="100%" stop-color="#2AA8A8" stop-opacity="0.05"/></linearGradient></defs><path d="M0,380 Q150,320 300,400 T600,340 T900,410 T1200,350 T1440,390 L1440,800 L0,800 Z" fill="url(#rib1)"><animate attributeName="d" dur="20s" repeatCount="indefinite" values="M0,380 Q150,320 300,400 T600,340 T900,410 T1200,350 T1440,390 L1440,800 L0,800 Z;M0,400 Q150,360 300,380 T600,420 T900,370 T1200,410 T1440,390 L1440,800 L0,800 Z;M0,380 Q150,320 300,400 T600,340 T900,410 T1200,350 T1440,390 L1440,800 L0,800 Z"/></path><path d="M0,500 Q200,430 400,490 T800,440 T1200,500 T1440,470 L1440,800 L0,800 Z" fill="url(#rib2)" opacity="0.7"><animate attributeName="d" dur="25s" repeatCount="indefinite" values="M0,500 Q200,430 400,490 T800,440 T1200,500 T1440,470 L1440,800 L0,800 Z;M0,480 Q200,520 400,470 T800,520 T1200,480 T1440,510 L1440,800 L0,800 Z;M0,500 Q200,430 400,490 T800,440 T1200,500 T1440,470 L1440,800 L0,800 Z"/></path><path d="M0,600 Q300,550 600,620 T1200,570 T1440,600 L1440,800 L0,800 Z" fill="url(#rib3)" opacity="0.4"><animate attributeName="d" dur="30s" repeatCount="indefinite" values="M0,600 Q300,550 600,620 T1200,570 T1440,600 L1440,800 L0,800 Z;M0,580 Q300,620 600,580 T1200,610 T1440,590 L1440,800 L0,800 Z;M0,600 Q300,550 600,620 T1200,570 T1440,600 L1440,800 L0,800 Z"/></path></svg>',

  PETAL_SVG: '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M5,0 Q7,3 5,5 Q3,3 5,0" fill="currentColor"/></svg>',

  APSARAS_SVG: '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><g opacity="0.05" fill="none" stroke="#D4432A" stroke-width="0.8" stroke-linecap="round"><path d="M20,50 Q40,20 60,40 Q80,15 100,35 Q120,10 140,30 Q160,15 180,25" opacity="0.6"/><path d="M30,55 Q45,30 65,45 Q85,25 105,40 Q125,20 145,35 Q165,25 185,30" opacity="0.4" stroke="#D4A844" stroke-width="0.6"/><path d="M15,60 Q35,40 55,55 Q75,35 95,50 Q115,30 135,45 Q155,35 175,40" opacity="0.3" stroke="#2AA8A8" stroke-width="0.5"/><path d="M40,65 Q55,50 70,60 Q90,45 110,55 Q130,40 150,50" opacity="0.2" stroke="#C49B5E" stroke-width="0.4"/><path d="M50,10 Q60,5 70,12 Q80,5 90,10 Q100,5 110,12 Q120,5 130,10" opacity="0.25" stroke="#D4A844" stroke-width="0.5"/><path d="M60,15 Q70,10 80,18 Q90,10 100,15" opacity="0.15" stroke="#D4432A" stroke-width="0.4"/></g><g opacity="0.04" fill="none" stroke="#D4A844" stroke-width="0.6"><path d="M40,70 Q50,55 60,65 Q75,50 85,60 Q100,45 110,55 Q125,40 135,50 Q150,45 160,50"/><path d="M50,75 Q60,65 70,72 Q85,60 95,68 Q110,55 120,63 Q135,55 145,60"/></g></svg>',

  GOLDEN_DUST: '<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><g opacity="0.04" fill="#D4A844"><circle cx="50" cy="60" r="1.5"/><circle cx="120" cy="30" r="1"/><circle cx="200" cy="80" r="2"/><circle cx="280" cy="45" r="1.2"/><circle cx="350" cy="70" r="1.8"/><circle cx="80" cy="150" r="1"/><circle cx="180" cy="130" r="1.5"/><circle cx="300" cy="160" r="1.3"/><circle cx="40" cy="250" r="2"/><circle cx="160" cy="220" r="1"/><circle cx="260" cy="280" r="1.8"/><circle cx="360" cy="240" r="1.2"/><circle cx="100" cy="330" r="1.5"/><circle cx="220" cy="360" r="1"/><circle cx="340" cy="320" r="2"/></g></svg>',

  CAVE_TEXTURE: 'radial-gradient(ellipse at 20% 30%, rgba(196,155,94,0.06), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(212,67,42,0.04), transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(42,168,168,0.03), transparent 50%), repeating-linear-gradient(0deg, transparent, transparent 80px, rgba(196,155,94,0.012) 80px, rgba(196,155,94,0.012) 81px), repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(196,155,94,0.008) 80px, rgba(196,155,94,0.008) 81px)',

  apply() {
    if (this.active) return;
    this.active = true;
    document.documentElement.classList.add('theme-dunhuang');
    this.createDecor();
    this.startObserver();
  },

  remove() {
    this.active = false;
    document.documentElement.classList.remove('theme-dunhuang');
    if (this.decorEl) { this.decorEl.remove(); this.decorEl = null; }
    this.stopObserver();
  },

  createDecor() {
    if (this.decorEl) return;
    var w = document.createElement('div');
    w.id = 'guzhenren-decor';
    w.style.cssText = 'position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden';

    var bg = document.createElement('div');
    bg.id = 'gzr-bg-img';
    bg.style.cssText = 'position:fixed;inset:0;z-index:-3;background-size:cover;background-position:center;background-repeat:no-repeat;transition:opacity 0.8s ease;background-image:url("https://ider-order-system.pages.dev/docs/guzhenren/%E8%83%8C%E6%99%AF1.png")';
    document.body.prepend(bg);

    var sigil = document.createElement('div');
    sigil.innerHTML = this.SIGIL_SVG;
    sigil.style.cssText = 'position:absolute;top:50%;left:50%;width:500px;height:500px;margin:-250px 0 0 -250px;opacity:0.35;animation:gzrSigilSpin 120s linear infinite';
    w.appendChild(sigil);

    var chars = ['蛊','虫','禁','残','蚀','腐','骨','噬','影','咒','蛹','蜕'];
    for (var i = 0; i < 16; i++) {
      var g = document.createElement('div');
      g.textContent = chars[i % chars.length];
      g.style.cssText = 'position:absolute;left:' + (5 + Math.random() * 90) + '%;top:' + (5 + Math.random() * 90) + '%;font-size:' + (10 + Math.random() * 16) + 'px;color:rgba(139,115,85,0.035);font-family:"Noto Serif SC",serif;font-weight:900;pointer-events:none;animation:gzrFloat ' + (15 + Math.random() * 25) + 's ease-in-out ' + (Math.random() * 20) + 's infinite';
      w.appendChild(g);
    }

    var vid = document.createElement('video');
    vid.src = 'https://ider-order-system.pages.dev/docs/guzhenren/%E8%A7%86%E9%A2%91%E5%A3%81%E7%BA%B82.mp4';
    vid.muted = true; vid.loop = true; vid.playsinline = true;
    vid.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.025;z-index:-4;pointer-events:none';
    vid.play().catch(function(){});
    document.body.prepend(vid);

    var wm = document.createElement('div');
    wm.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:url("https://ider-order-system.pages.dev/docs/guzhenren/%E8%9B%8A%E7%9C%9F%E4%BA%BA%E4%B9%A6%E6%B3%95%E5%AD%97.png");background-repeat:no-repeat;background-position:50% 50%;background-size:clamp(200px,40vw,500px);opacity:0.03;animation:gzrWatermarkFloat 20s ease-in-out infinite';
    w.appendChild(wm);

    var cicada = document.createElement('div');
    cicada.style.cssText = 'position:fixed;left:10px;bottom:80px;width:clamp(50px,6vw,90px);height:auto;aspect-ratio:1;background-image:url("https://ider-order-system.pages.dev/docs/guzhenren/%E6%98%A5%E7%A7%8B%E8%9D%89%E7%BA%BF%E7%A8%BF.png");background-size:contain;background-repeat:no-repeat;opacity:0.08;z-index:-1;pointer-events:none;animation:gzrFloat 20s ease-in-out infinite';
    w.appendChild(cicada);

    document.body.prepend(w);
    this.decorEl = w;
    this.createPortraitPanel();
    this.startBgSwitcher();
  },

  BG_MAP: {
    announcement: "https://ider-order-system.pages.dev/docs/guzhenren/89-008.jpg",
    character: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B83.png",
    inventory: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B84.png",
    equipment: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B85.png",
    skills: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B86.png",
    techniques: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B86.png",
    map: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B82.png",
    baiyi: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B83.png",
    cave: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B82.png",
    disciple: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B84.png",
    sect: "https://ider-order-system.pages.dev/docs/guzhenren/89-007.jpg",
    alliance: "https://ider-order-system.pages.dev/docs/guzhenren/89-006.jpg",
    exchange: "https://ider-order-system.pages.dev/docs/guzhenren/89-002.jpg",
    dungeon: "https://ider-order-system.pages.dev/docs/guzhenren/89-003.jpg",
    duel: "https://ider-order-system.pages.dev/docs/guzhenren/89-005.jpg",
    league: "https://ider-order-system.pages.dev/docs/guzhenren/89-004.jpg",
    trial: "https://ider-order-system.pages.dev/docs/guzhenren/89-001.jpg",
    mail: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B87.png",
    dictionary: "https://ider-order-system.pages.dev/docs/guzhenren/89-009.jpg",
    settings: "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B88.png",
  },
  BG_CYCLE: [
    "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B82.png",
    "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B83.png",
    "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B84.png",
    "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B85.png",
    "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B86.png",
    "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B87.png",
    "https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B88.png",
    "https://ider-order-system.pages.dev/docs/guzhenren/%E8%83%8C%E6%99%AF1.png",
  ],
  DEFAULT_BG: "https://ider-order-system.pages.dev/docs/guzhenren/%E8%83%8C%E6%99%AF1.png",
  _lastBgTime: 0,

  startBgSwitcher: function() {
    var self = this;
    var lastTab = '';
    setInterval(function() {
      var active = document.querySelector('.tab-btn.active');
      var bgEl = document.getElementById('gzr-bg-img');
      if (!bgEl) return;

      // Tab change: immediate switch
      if (active) {
        var tab = active.getAttribute('data-tab') || '';
        if (tab !== lastTab) {
          lastTab = tab;
          var url = self.BG_MAP[tab] || self.DEFAULT_BG;
          self.setBg(url);
          self._lastBgTime = Date.now();
          return;
        }
      } else {
        if (lastTab !== '') { lastTab = ''; self.setBg(self.DEFAULT_BG); self._lastBgTime = Date.now(); }
        return;
      }

      // Time-based cycle: same tab for >30s, rotate through wallpapers
      var elapsed = Date.now() - self._lastBgTime;
      if (elapsed > 30000) {
        self._lastBgTime = Date.now();
        var current = bgEl.dataset.current || '';
        var cycle = self.BG_CYCLE;
        var nextIdx = 0;
        for (var i = 0; i < cycle.length; i++) {
          if (cycle[i] === current) { nextIdx = (i + 1) % cycle.length; break; }
        }
        self.setBg(cycle[nextIdx]);
      }
    }, 1000);
  },

  setBg: function(url) {
    var bgEl = document.getElementById('gzr-bg-img');
    if (!bgEl || bgEl.dataset.current === url) return;
    bgEl.dataset.current = url;
    bgEl.style.opacity = '0';
    setTimeout(function() {
      bgEl.style.backgroundImage = 'url("' + url + '")';
      bgEl.style.opacity = '0.15';
    }, 200);
  },
  startObserver() {
  },

  stopObserver() {
  },
};

// ═══════════════════════════════════════
// 阴阳太极 — 阴阳相生，太极无极
// ═══════════════════════════════════════

const TAIJI_CLASS = 'theme-taiji';

const TAIJIWASH = {
  active: false, decorEl: null, observer: null,

  apply() {
    if (this.active) return;
    this.active = true;
    document.documentElement.classList.add(TAIJI_CLASS);
    this.createDecor();
    this.startObserver();
  },

  remove() {
    this.active = false;
    document.documentElement.classList.remove(TAIJI_CLASS);
    if (this.decorEl) { this.decorEl.remove(); this.decorEl = null; }
    this.stopObserver();
  },

  createDecor() {
    if (this.decorEl) return;
    const w = document.createElement('div');
    w.id = 'taiji-decor';
    w.style.cssText = 'position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden';

    // 径向渐变叠加层
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,0.03),transparent 50%),radial-gradient(ellipse at 70% 80%,rgba(0,0,0,0.02),transparent 50%)';
    w.appendChild(overlay);

    // 太极图背景（旋转）- 增强版
    const taiji = document.createElement('div');
    taiji.innerHTML = '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="tg1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FFF" stop-opacity="0.05"/><stop offset="100%" stop-color="#FFF" stop-opacity="0.01"/></radialGradient><radialGradient id="tg2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#000" stop-opacity="0.04"/><stop offset="100%" stop-color="#000" stop-opacity="0.01"/></radialGradient></defs><circle cx="100" cy="100" r="95" fill="#0A0A0A" opacity="0.04"/><circle cx="100" cy="100" r="95" fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="0.8"/><circle cx="100" cy="100" r="90" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="0.3" stroke-dasharray="4 3"/><path d="M100,5 A95,95 0 0,1 100,195 A47.5,47.5 0 0,1 100,100 A47.5,47.5 0 0,0 100,5" fill="url(#tg1)"/><path d="M100,5 A95,95 0 0,0 100,195 A47.5,47.5 0 0,0 100,100 A47.5,47.5 0 0,1 100,5" fill="url(#tg2)"/><circle cx="100" cy="52.5" r="14" fill="#FFF" opacity="0.05"/><circle cx="100" cy="52.5" r="5" fill="#000" opacity="0.04"/><circle cx="100" cy="147.5" r="14" fill="#000" opacity="0.04"/><circle cx="100" cy="147.5" r="5" fill="#FFF" opacity="0.05"/><path d="M50,30 Q60,25 70,30" stroke="rgba(0,0,0,0.02)" stroke-width="0.5" fill="none"/><path d="M130,170 Q140,175 150,170" stroke="rgba(0,0,0,0.02)" stroke-width="0.5" fill="none"/></svg>';
    taiji.style.cssText = 'position:absolute;top:50%;left:50%;width:400px;height:400px;margin:-200px 0 0 -200px;animation:taijiSpin 30s linear infinite;opacity:0.5';
    w.appendChild(taiji);

    // 浮游小太极图
    for (let i = 0; i < 5; i++) {
      const mini = document.createElement('div');
      const mx = 5 + Math.random() * 90;
      const my = 5 + Math.random() * 90;
      const ms = 20 + Math.random() * 30;
      const md = Math.random() * 15;
      mini.innerHTML = '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="none" stroke="rgba(0,0,0,0.03)" stroke-width="0.5"/><path d="M20,2 A18,18 0 0,1 20,38 A9,9 0 0,1 20,20 A9,9 0 0,0 20,2" fill="rgba(255,255,255,0.03)"/><path d="M20,2 A18,18 0 0,0 20,38 A9,9 0 0,0 20,20 A9,9 0 0,1 20,2" fill="rgba(0,0,0,0.02)"/><circle cx="20" cy="11" r="2.5" fill="rgba(255,255,255,0.03)"/><circle cx="20" cy="29" r="2.5" fill="rgba(0,0,0,0.02)"/></svg>';
      mini.style.cssText = `position:absolute;left:${mx}%;top:${my}%;width:${ms}px;height:${ms}px;animation:taijiFloat ${12 + i * 3}s ease-in-out ${md}s infinite,taijiSpin ${20 + i * 5}s linear infinite;opacity:0.3`;
      w.appendChild(mini);
    }

    // 阴阳鱼粒子（30个，环状分布）
    for (let i = 0; i < 30; i++) {
      const dot = document.createElement('div');
      const isDark = i % 2 === 0;
      const size = 1.5 + Math.random() * 4;
      const angle = (i / 30) * 2 * Math.PI;
      const radius = 15 + Math.random() * 35;
      const cx = 50 + Math.cos(angle) * radius;
      const cy = 50 + Math.sin(angle) * radius;
      const delay = Math.random() * 12;
      const dur = 6 + Math.random() * 14;
      dot.style.cssText = `position:absolute;left:${cx}%;top:${cy}%;width:${size}px;height:${size}px;border-radius:50%;background:${isDark?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.07)'};animation:taijiPulse ${dur}s ease-in-out ${delay}s infinite;opacity:${0.2 + Math.random() * 0.3}`;
      w.appendChild(dot);
    }

    // 能量波纹
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.style.cssText = `position:absolute;top:50%;left:50%;width:${200 + i * 100}px;height:${200 + i * 100}px;margin:-${100 + i * 50}px 0 0 -${100 + i * 50}px;border-radius:50%;border:1px solid rgba(0,0,0,0.015);animation:taijiRing ${6 + i * 2}s ease-out ${i * 2}s infinite`;
      w.appendChild(ring);
    }

    document.body.prepend(w);
    this.decorEl = w;
  },

  startObserver() {
  },

  stopObserver() {
  },
};


// ═══════════════════════════════════════════════════════════
// 蛊真人 — 残章禁卷，蛊界法则
// ═══════════════════════════════════════════════════════════

const GUZHENREN_CLASS = 'theme-guzhenren';

const GUZHENRENWASH = {
  active: false, decorEl: null, observer: null,

  SIGIL_SVG: '<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="95" stroke="#8B7355" stroke-width="0.4" stroke-dasharray="8 4" opacity="0.25"/><circle cx="100" cy="100" r="75" stroke="#8B7355" stroke-width="0.2" opacity="0.15"/><circle cx="100" cy="100" r="55" stroke="#8B7355" stroke-width="0.2" stroke-dasharray="4 8" opacity="0.2"/><path d="M100 5 L100 35 M100 165 L100 195 M5 100 L35 100 M165 100 L195 100" stroke="#8B7355" stroke-width="0.3" opacity="0.15"/><path d="M35 35 L55 55 M145 145 L165 165 M165 35 L145 55 M55 145 L35 165" stroke="#8B7355" stroke-width="0.3" opacity="0.12"/><rect x="85" y="85" width="30" height="30" stroke="#8B7355" stroke-width="0.3" opacity="0.15" transform="rotate(45 100 100)"/></svg>',

  apply() {
    if (this.active) return;
    this.active = true;
    document.querySelectorAll('link[rel="stylesheet"][href*="inkwash.css"],link[rel="stylesheet"][href*="wabi.css"]').forEach(function(el) { el.remove(); });
    document.documentElement.classList.add(GUZHENREN_CLASS);
    this.createDecor();
    this.startObserver();
  },

  remove() {
    this.active = false;
    document.documentElement.classList.remove(GUZHENREN_CLASS);
    if (this.decorEl) { this.decorEl.remove(); this.decorEl = null; }
    this.stopObserver();
  },

  createDecor() {
    if (this.decorEl) return;
    var w = document.createElement('div');
    w.id = 'guzhenren-decor';
    w.style.cssText = 'position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden';

    var bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%, rgba(139,115,85,0.03) 0%, transparent 60%)';
    w.appendChild(bg);

    var sigil = document.createElement('div');
    sigil.innerHTML = this.SIGIL_SVG;
    sigil.style.cssText = 'position:absolute;top:50%;left:50%;width:500px;height:500px;margin:-250px 0 0 -250px;opacity:0.5;animation:gzrSigilSpin 120s linear infinite';
    w.appendChild(sigil);

    var chars = ['蛊','虫','禁','残','蚀','腐','骨','噬','影','咒','蛹','蜕'];
    for (var i = 0; i < 16; i++) {
      var g = document.createElement('div');
      g.textContent = chars[i % chars.length];
      var gx = 5 + Math.random() * 90;
      var gy = 5 + Math.random() * 90;
      var gs = 10 + Math.random() * 16;
      var gd = Math.random() * 20;
      var gdur = 15 + Math.random() * 25;
      g.style.cssText = 'position:absolute;left:' + gx + '%;top:' + gy + '%;font-size:' + gs + 'px;color:rgba(139,115,85,0.035);font-family:"Noto Serif SC",serif;font-weight:900;pointer-events:none;animation:gzrFloat ' + gdur + 's ease-in-out ' + gd + 's infinite';
      w.appendChild(g);
    }

    // 视频背景（循环播放，静音）
    var vid = document.createElement('video');
    vid.src = 'https://ider-order-system.pages.dev/docs/guzhenren/%E8%A7%86%E9%A2%91%E5%A3%81%E7%BA%B82.mp4';
    vid.muted = true;
    vid.loop = true;
    vid.playsinline = true;
    vid.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.04;z-index:-3;pointer-events:none';
    vid.play().catch(function(){});
    document.body.prepend(vid);

    // 春秋蝉线稿（侧栏装饰）
    var cicada = document.createElement('div');
    cicada.style.cssText = 'position:fixed;left:10px;bottom:80px;width:clamp(50px,6vw,90px);height:auto;aspect-ratio:1;background-image:url("https://ider-order-system.pages.dev/docs/guzhenren/%E6%98%A5%E7%A7%8B%E8%9D%89%E7%BA%BF%E7%A8%BF.png");background-size:contain;background-repeat:no-repeat;opacity:0.08;z-index:-1;pointer-events:none;animation:gzrFloat 20s ease-in-out infinite';
    w.appendChild(cicada);

    document.body.prepend(w);
    this.decorEl = w;

    // 立绘交互面板（最上层，可关闭/切换）
    this.createPortraitPanel();
  },

  PORTRAITS: [
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E5%8F%A4%E6%9C%88%E6%96%B9%E6%BA%90%E7%AB%8B%E7%BB%98.png",name:"古月方源"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E7%99%BD%E8%A1%A3%E6%96%B9%E6%BA%90%E7%AB%8B%E7%BB%98.png",name:"白衣方源"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E7%99%BD%E5%87%9D%E5%86%B0%E7%AB%8B%E7%BB%98.png",name:"白凝冰"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E9%BB%91%E6%A5%BC%E5%85%B0%E7%AB%8B%E7%BB%98.png",name:"黑楼兰"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E7%8B%82%E8%9B%AE%E4%BB%99%E5%B0%8A%E7%AB%8B%E7%BB%98.png",name:"狂蛮仙尊"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E5%95%86%E5%BF%83%E6%85%88%E7%AB%8B%E7%BB%98.png",name:"商心慈"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E5%B0%8F%E7%8B%90%E5%A8%98%E7%AB%8B%E7%BB%98.png",name:"小狐娘"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E4%BB%99%E5%83%B5%E7%AB%8B%E7%BB%98.png",name:"仙僵"},
    {url:"https://ider-order-system.pages.dev/docs/guzhenren/%E4%B9%A6%E7%94%9F%E7%AB%8B%E7%BB%98.png",name:"书生"},
  ],

  createPortraitPanel: function() {
    if (document.getElementById('gzr-portrait')) return;
    var portraits = this.PORTRAITS;
    var idx = Math.floor(Math.random() * portraits.length);
    var panel = document.createElement('div');
    panel.id = 'gzr-portrait';
    panel.style.cssText = 'position:fixed;bottom:60px;right:10px;z-index:9999;cursor:pointer';
    panel.style.animation = 'gzrPortraitIn 0.5s ease';
    panel.innerHTML =
      '<div id="gzr-p-close" style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;background:rgba(0,0,0,0.6);border:1px solid rgba(139,115,85,0.4);color:#A09888;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;font-family:sans-serif;border-radius:50%">\u2715</div>' +
      '<div id="gzr-p-img" style="width:clamp(100px,15vw,200px);height:clamp(160px,24vw,320px);background-image:url(' + portraits[idx].url + ');background-size:contain;background-repeat:no-repeat;background-position:center bottom;transition:opacity 0.4s ease;border-radius:4px;box-shadow:0 4px 30px rgba(0,0,0,0.5)"></div>' +
      '<div style="text-align:center;margin-top:4px;font-size:10px;color:rgba(160,152,136,0.6);font-family:Noto Serif SC,serif;letter-spacing:2px" id="gzr-p-name">' + portraits[idx].name + '</div>';
    panel.querySelector('#gzr-p-close').addEventListener('click', function(e) {
      e.stopPropagation();
      panel.style.transition = 'opacity 0.3s';
      panel.style.opacity = '0';
      setTimeout(function(){ panel.remove(); }, 300);
    });
    panel.addEventListener('click', function() {
      idx = (idx + 1) % portraits.length;
      var imgEl = panel.querySelector('#gzr-p-img');
      var nameEl = panel.querySelector('#gzr-p-name');
      imgEl.style.opacity = '0';
      setTimeout(function() {
        imgEl.style.backgroundImage = 'url(' + portraits[idx].url + ')';
        nameEl.textContent = portraits[idx].name;
        imgEl.style.opacity = '1';
      }, 200);
    });
    document.body.appendChild(panel);
  },
  startObserver() {
  },

  stopObserver() {
  },
};

const SKINS = {

// ───────────────────────────────────────────────
// ① 水墨修仙 — 水墨写意风（重写布局）
// ───────────────────────────────────────────────
inkwash: {
name: '水墨修仙',
desc: '泼墨写意，素雅高远 · 大面积留白，笔触质感',
css: `
html.theme-inkwash{--paper:#F5F0E6;--paper-warm:#F0EBE0;--ink-deep:#1a1a1a;--ink-mid:rgba(26,26,26,0.55);--ink-light:rgba(26,26,26,0.18);--ink-faint:rgba(26,26,26,0.06);--ink-ghost:rgba(26,26,26,0.025);--cinnabar:#C43A2B;--cinnabar-soft:rgba(196,58,43,0.85);--cinnabar-faint:rgba(196,58,43,0.08);--gold-seal:#8B7355;--bg:#F5F0E6;--bg2:#F0EBE0;--bg3:#E8E0D0;--bg4:#DDD4C0;--border:rgba(26,26,26,0.18);--text:#1a1a1a;--text2:rgba(26,26,26,0.55);--gold:#C43A2B;--gold2:#C43A2B;--accent:#8B7355;--red:#C43A2B;--green:#5a7a3a;--radius:4px}
@keyframes inkwashIn{0%{opacity:0;clip-path:inset(0 50% 0 50%)}60%{clip-path:inset(0 0 0 0)}100%{opacity:1}}
@keyframes inkwashSpread{from{background-position:100% 0}to{background-position:0% 0}}
@keyframes inkwashPour{0%{background-position:100% 0}100%{background-position:0% 0}}
@keyframes inkwashMist{0%,100%{transform:translateX(0)}50%{transform:translateX(15%)}}
@keyframes inkwashFloat{0%,100%{transform:translateY(0) scale(1);opacity:0.03}50%{transform:translateY(-6px) scale(1.1);opacity:0.06}}
.theme-inkwash body{font-family:'Noto Serif SC','STKaiti','KaiTi','FangSong',serif!important;background:var(--paper)!important;letter-spacing:0.04em!important;color:var(--ink-deep)!important}
.theme-inkwash .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:2px 8px!important;background:transparent!important;border-bottom:1px solid var(--border)!important;gap:2px!important;flex-wrap:nowrap!important;overflow:hidden!important;min-height:32px!important}
.theme-inkwash .inkwash-header-line{display:none!important}
.theme-inkwash .game-header .hdr-name{font-family:'Ma Shan Zheng',cursive!important;font-size:0.7rem!important;letter-spacing:0.06em!important;color:var(--cinnabar)!important;white-space:nowrap!important;max-width:72px!important;overflow:hidden!important;text-overflow:ellipsis!important;flex-shrink:0!important}


.theme-inkwash .game-header .hdr-info{font-family:'Noto Serif SC',serif!important;font-weight:200!important;letter-spacing:0.04em!important;color:var(--text2)!important;font-size:0.55rem!important;white-space:nowrap!important;flex-shrink:0!important}
.theme-inkwash .game-header .hdr-info .realm-badge{background:transparent!important;color:var(--text2)!important;padding:0!important;font-size:inherit!important;border:none!important}
.theme-inkwash .game-header .hdr-qq{display:none!important}
.theme-inkwash .game-header .hdr-res{font-size:11px!important;letter-spacing:0.1em!important;gap:8px!important;white-space:nowrap!important;display:flex!important;align-items:center!important}
.theme-inkwash .inkwash-divider{display:none!important}



.theme-inkwash .game-header .btn-icon{color:var(--text2)!important;font-size:14px!important;padding:2px 6px!important;background:none!important;border:none!important;cursor:pointer!important;width:24px!important;height:24px!important}
.theme-inkwash .game-header .hdr-res{margin-right:auto!important}
.theme-inkwash .game-header .btn-icon:hover{background:var(--cinnabar-faint)!important}
.theme-inkwash .game-header .btn-icon[title*="退出"]{display:none!important}
.theme-inkwash .tab-nav{justify-content:center!important;background:transparent!important;border-bottom:1px solid var(--border)!important;padding:4px 8px!important;gap:2px!important}
.theme-inkwash .tab-btn{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.12em!important;padding:6px 12px!important;font-size:12px!important;border-bottom:1px solid transparent!important;transition:all 0.4s ease!important;color:var(--text2)!important}
.theme-inkwash .tab-btn.active{color:var(--cinnabar)!important;border-bottom-color:var(--cinnabar)!important}
.theme-inkwash .tab-btn:hover{background:linear-gradient(90deg,transparent 50%,rgba(196,58,43,0.06) 100%)!important;background-size:200% 100%!important;animation:inkwashSpread 0.4s ease forwards!important}
.theme-inkwash .inkwash-nav-icon{display:inline-block!important;width:16px!important;height:16px!important;vertical-align:middle!important;margin-right:4px!important;flex-shrink:0!important;color:var(--text2)!important;transition:color 0.3s!important}
.theme-inkwash .tab-btn.active .inkwash-nav-icon{color:var(--cinnabar)!important}
.theme-inkwash .tab-btn:hover .inkwash-nav-icon{color:var(--cinnabar-soft)!important}
@media(min-width:1024px){.theme-inkwash .tab-nav{flex-direction:column!important;position:fixed!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:100!important;background:var(--bg2)!important;border:1px solid var(--border)!important;border-left:none!important;padding:12px 8px!important;gap:4px!important;border-radius:0 8px 8px 0!important;box-shadow:2px 2px 12px rgba(0,0,0,0.04)!important}.theme-inkwash .tab-btn{writing-mode:vertical-rl!important;padding:8px 6px!important;font-size:11px!important;letter-spacing:0.2em!important;border-bottom:none!important;border-right:1px solid transparent!important}.theme-inkwash .tab-btn.active{border-bottom-color:transparent!important;border-right-color:var(--cinnabar)!important}.theme-inkwash .tab-btn[data-tab="character"],.theme-inkwash .tab-btn[data-tab="battle"]{display:block!important}.theme-inkwash .inkwash-nav-icon{width:20px!important;height:20px!important;margin-right:0!important;margin-bottom:2px!important}.theme-inkwash .main-area{margin-left:48px!important}}
@media(min-width:1024px){.theme-inkwash .battle-sidebar{width:300px!important;border-right:none!important;border-left:1px solid var(--border)!important;background:var(--paper-warm)!important;padding:16px 14px!important;position:relative!important}.theme-inkwash .battle-sidebar::before{content:''!important;position:absolute!important;left:8px!important;top:8px!important;bottom:8px!important;width:1px!important;background:var(--ink-ghost)!important;opacity:0.4!important}.theme-inkwash .sidebar-char-header{flex-direction:column!important;align-items:center!important;gap:4px!important;margin-bottom:12px!important;padding-bottom:12px!important;border-bottom:1px solid var(--border)!important}.theme-inkwash .sidebar-char-realm{font-size:10px!important;letter-spacing:0.2em!important;color:var(--text2)!important;text-align:center!important;display:block!important;margin-top:4px!important}.theme-inkwash .sidebar-section-title{font-family:'Noto Serif SC',serif!important;font-weight:200!important;letter-spacing:0.2em!important;font-size:10px!important;color:var(--text2)!important;border-bottom:1px solid var(--border)!important}.theme-inkwash .sidebar-attr-grid .attr-item{background:transparent!important;padding:3px 4px!important;font-size:11px!important}.theme-inkwash .sidebar-stat-cards .stat-card.compact{background:transparent!important;border:1px solid var(--border)!important;padding:6px 8px!important}}
.theme-inkwash .stat-card,.theme-inkwash .skill-card,.theme-inkwash .map-card,.theme-inkwash .sect-card,.theme-inkwash .alliance-card,.theme-inkwash .recipe-card,.theme-inkwash .dungeon-card,.theme-inkwash .listing-card{background:var(--bg3)!important;border:1px solid var(--border)!important;position:relative!important;transition:all 0.6s ease!important}
.theme-inkwash .stat-card::before,.theme-inkwash .skill-card::before,.theme-inkwash .map-card::before{content:''!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:2px!important;background:var(--cinnabar)!important;transform:scaleY(0)!important;transition:transform 0.4s ease!important}
.theme-inkwash .stat-card:hover::before,.theme-inkwash .skill-card:hover::before,.theme-inkwash .map-card:hover::before{transform:scaleY(1)!important}
.theme-inkwash .section-title{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.15em!important;color:var(--ink-deep)!important;border-bottom:1px solid var(--border)!important;font-size:14px!important}
.theme-inkwash .skill-card.equipped{border-left:3px solid var(--cinnabar)!important;border-color:var(--border)!important;background:var(--cinnabar-faint)!important}
.theme-inkwash .inkwash-card::before{content:''!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:2px!important;background:var(--cinnabar)!important;transform:scaleY(0)!important;transition:transform 0.4s ease!important}
.theme-inkwash .inkwash-card:hover::before{transform:scaleY(1)!important}
.theme-inkwash .battle-status-panel{background:var(--bg3)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important;padding:14px!important}
.theme-inkwash .battle-unit .unit-name{font-family:'Ma Shan Zheng',cursive!important;font-size:1.1rem!important;letter-spacing:0.1em!important}
.theme-inkwash .battle-unit .unit-name.enemy-name{color:var(--cinnabar)!important}
.theme-inkwash .battle-vs{font-family:'Ma Shan Zheng',cursive!important;font-size:1rem!important;color:var(--text2)!important}
.theme-inkwash .battle-log-box{background:var(--bg3)!important;border:1px solid var(--border)!important;font-family:'Noto Serif SC',serif!important;font-size:12px!important;line-height:1.8!important;letter-spacing:0.06em!important}
.theme-inkwash .bar-track{height:8px!important;background:var(--ink-faint)!important;border-radius:0!important;border:none!important}
.theme-inkwash .bar-fill{border-radius:0!important;transition:width 0.8s cubic-bezier(0.22,1,0.36,1)!important}
.theme-inkwash .hp-bar-green{background:linear-gradient(90deg,#1a1a1a,#4a4a4a)!important}
.theme-inkwash .hp-bar-red{background:linear-gradient(90deg,var(--cinnabar),#8a2a1a)!important}
.theme-inkwash .mp-bar-blue{background:linear-gradient(90deg,#3a3a5a,#5a5a8a)!important}
.theme-inkwash .action-bar-yellow{background:linear-gradient(90deg,#5a4a2a,#8a7a3a)!important}
.theme-inkwash .exp-fill,.theme-inkwash .exp-bar-fill{background:linear-gradient(90deg,var(--ink-deep),var(--ink-mid))!important}
.theme-inkwash .exp-bar-green{background:linear-gradient(90deg,#3a5a3a,#5a7a4a)!important}
.theme-inkwash .inkwash-bar-bg{background:var(--ink-faint)!important;border-radius:0!important;height:6px!important}
.theme-inkwash .modal-overlay{background:rgba(0,0,0,0.3)!important}
.theme-inkwash .modal-panel{background:var(--bg2)!important;border:1px solid var(--ink-light)!important;border-radius:var(--radius)!important;box-shadow:0 4px 24px rgba(0,0,0,0.06)!important}
.theme-inkwash .modal-title{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.12em!important;color:var(--ink-deep)!important;border-bottom:1px solid var(--border)!important;padding-bottom:8px!important}
.theme-inkwash .modal-close{color:var(--text2)!important;background:transparent!important;border:1px solid var(--border)!important;border-radius:4px!important}
.theme-inkwash .modal-close:hover{background:var(--cinnabar-faint)!important;color:var(--cinnabar)!important}
.theme-inkwash .btn-primary{background:var(--ink-deep)!important;color:var(--paper)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.15em!important;border-radius:var(--radius)!important}
.theme-inkwash .btn-primary:hover{background:var(--cinnabar)!important}
.theme-inkwash .btn-action{background:transparent!important;border:1px solid var(--border)!important;color:var(--text)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;font-weight:300!important}
.theme-inkwash .btn-action:hover{background:var(--cinnabar-faint)!important;border-color:var(--cinnabar)!important}
.theme-inkwash .btn-action.gold{color:var(--cinnabar)!important;border-color:var(--cinnabar)!important}
.theme-inkwash .btn-sm{background:transparent!important;border:1px solid var(--border)!important;color:var(--text)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important;font-weight:300!important}
.theme-inkwash .btn-sm:hover{background:var(--cinnabar-faint)!important}
.theme-inkwash .btn-sm.gold{color:var(--cinnabar)!important;border-color:var(--cinnabar)!important}
.theme-inkwash .view-login{background:var(--paper)!important}
.theme-inkwash .login-card{background:var(--bg2)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important}
.theme-inkwash .game-title{font-family:'Ma Shan Zheng',cursive!important;letter-spacing:0.25em!important;color:var(--ink-deep)!important;font-weight:400!important;text-shadow:none!important;font-size:clamp(1.5rem,5vw,2rem)!important}
.theme-inkwash .login-subtitle{font-family:'Noto Serif SC',serif!important;font-weight:200!important;letter-spacing:0.3em!important}
.theme-inkwash .toast{background:var(--bg2)!important;border:1px solid var(--cinnabar)!important;color:var(--cinnabar)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;border-radius:var(--radius)!important}
.theme-inkwash .item-detail{background:var(--bg3)!important;border:1px solid var(--border)!important}
.theme-inkwash .item-detail-name{font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important}
.theme-inkwash .equip-slot,.theme-inkwash .opt-item,.theme-inkwash .inv-slot{background:var(--bg3)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important}
.theme-inkwash .inv-slot.occupied:hover{border-color:var(--cinnabar)!important}
.theme-inkwash .map-card.active{border-color:var(--cinnabar)!important;background:var(--paper-warm)!important}
.theme-inkwash .sub-tab button,.theme-inkwash .sub-tab-item{border-bottom:1px solid var(--ink-faint)!important;color:var(--ink-mid)!important;letter-spacing:1px!important;font-size:12px!important;background:transparent!important}
.theme-inkwash .sub-tab button.active{color:var(--cinnabar)!important;border-bottom:2px solid var(--cinnabar)!important}
.theme-inkwash .sr-bar{height:6px!important;background:var(--ink-faint)!important;border-radius:0!important}
.theme-inkwash .mingtu-scroll{background:radial-gradient(circle at 10% 10%,rgba(139,115,85,0.12),transparent 36%),radial-gradient(circle at 90% 25%,rgba(196,58,43,0.08),transparent 34%),linear-gradient(165deg,var(--bg2),var(--bg))!important}
.theme-inkwash .map-current{background:var(--bg3)!important;border:1px solid var(--border)!important}
.theme-inkwash .key-badge{background:var(--cinnabar)!important;font-family:'Noto Serif SC',serif!important}
.theme-inkwash .skill-name{font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important}
.theme-inkwash ::-webkit-scrollbar{width:4px!important}
.theme-inkwash ::-webkit-scrollbar-thumb{background:var(--border)!important}
.theme-inkwash input,.theme-inkwash select,.theme-inkwash textarea{background:var(--paper)!important;border:1px solid var(--border)!important;color:var(--ink-deep)!important;border-radius:4px!important;font-family:'Noto Serif SC',serif!important}
.theme-inkwash input:focus{border-color:var(--ink-deep)!important}
.theme-inkwash .panel{animation:inkwashIn 0.8s cubic-bezier(0.22,1,0.36,1)!important}
.theme-inkwash .bar-fill,.theme-inkwash .exp-fill{background-size:200% 100%!important;animation:inkwashPour 0.8s ease forwards!important}
.tab-btn svg,.ider-nav-icon{display:none!important}
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
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,240,255,0.02) 3px,rgba(0,240,255,0.02) 4px)!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% 100%,rgba(0,240,255,0.03),transparent 60%)!important}

.view-login { background: linear-gradient(135deg, #03030a, #0a0a20, #03030a) !important; }
.login-card { background: rgba(7,7,24,0.95) !important; border: 1px solid rgba(0,240,255,0.15) !important; box-shadow: 0 0 60px rgba(0,240,255,0.03), inset 0 0 60px rgba(0,240,255,0.02) !important; }
.game-title { font-family: 'Orbitron',sans-serif !important; font-size: 28px !important; color: #00f0ff !important; text-shadow: 0 0 30px rgba(0,240,255,0.3) !important; letter-spacing: 4px !important; text-transform: uppercase !important; }
.ider-cyber-grid{position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:linear-gradient(rgba(0,240,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,0.03) 1px,transparent 1px)!important;background-size:40px 40px!important}

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
.btn-sm:hover{background:#1a1a4a!important;color:#00f0ff!important}
.btn-primary { background: linear-gradient(135deg, #ff00aa, #00f0ff) !important; border: none !important; color: #000 !important; font-weight: 700 !important; text-transform: uppercase !important; }
.btn-primary:hover{box-shadow:0 0 30px rgba(0,240,255,0.5),0 0 60px rgba(255,0,170,0.2)!important}
.modal-close{background:rgba(0,240,255,0.04)!important;border:1px solid rgba(0,240,255,0.08)!important;color:#4a5a7a!important;border-radius:2px!important}
.modal-close:hover{background:rgba(0,240,255,0.1)!important;color:#00f0ff!important}
.opt-item:hover{border-color:#00f0ff!important;box-shadow:0 0 15px rgba(0,240,255,0.08)!important}

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
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% 0%,rgba(212,168,68,0.04),transparent 50%)!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:repeating-linear-gradient(90deg,transparent,transparent 80px,rgba(212,168,68,0.008) 80px,rgba(212,168,68,0.008) 81px)!important}
.ider-luxe-ornament{position:fixed!important;bottom:0!important;left:0!important;right:0!important;height:4px!important;z-index:-2!important;pointer-events:none!important;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.15),rgba(212,168,68,0.08) 50%,rgba(212,168,68,0.15),transparent)!important}

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
.btn-sm:hover{background:#28221c!important;border-color:#d4a844!important}
.btn-primary { background: linear-gradient(135deg, #d4a844, #b8860b) !important; border: none !important; color: #000 !important; box-shadow: 0 2px 12px rgba(212,168,68,0.2) !important; }
.btn-primary:hover{box-shadow:0 4px 30px rgba(212,168,68,0.4)!important}
.modal-close{background:rgba(212,168,68,0.04)!important;border:1px solid #4a3f35!important;color:#a09080!important}
.modal-close:hover{background:rgba(212,168,68,0.1)!important;color:#d4a844!important}
.opt-item:hover{border-color:#d4a844!important;box-shadow:inset 0 0 20px rgba(212,168,68,0.03)!important}

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
.tab-btn svg,.ider-nav-icon{display:none!important}
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
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(42,37,32,0.02) 40px,rgba(42,37,32,0.02) 41px)!important}

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
.btn-sm:hover{background:#f0ece6!important}
.btn-primary { background: #2a2520 !important; border: none !important; color: #fff !important; letter-spacing: 2px !important; text-transform: uppercase !important; font-size: 11px !important; padding: 10px 24px !important; }
.btn-primary:hover{background:#3a3530!important}
.modal-close{background:#f8f6f2!important;border:1px solid #ddd6cc!important;color:#8a8078!important}
.modal-close:hover{background:#f0ece6!important;color:#c49a6c!important}

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
.tab-btn svg,.ider-nav-icon{display:none!important}
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

.game-header { background: #ddd0c0 !important; border-bottom: 1px solid #b09880 !important; display:flex!important; flex-direction:row!important; align-items:center!important; padding:2px 8px!important; gap:2px!important; flex-wrap:nowrap!important; overflow:hidden!important; min-height:32px!important; position:relative!important; }
.game-header::before { content: '◇' !important; position: absolute !important; left: 50% !important; bottom: -8px !important; transform: translateX(-50%) !important; color: #b09880 !important; font-size: 12px !important; background: #e8ddd0 !important; padding: 0 8px !important; }
.hdr-name { font-family: 'Noto Serif JP',serif !important; font-size: 13px !important; color: #3a3028 !important; letter-spacing: 2px !important; font-weight: 400 !important; max-width:72px!important; overflow:hidden!important; text-overflow:ellipsis!important; flex-shrink:0!important; }
.hdr-info { font-size:11px!important; flex-shrink:0!important; }
.realm-badge { background: #d0c0ae !important; border: 1px solid #b09880 !important; color: #3a3028 !important; }
.btn-icon { color: #7a6a5a !important; }
.btn-icon:hover { color: #8b6f4c !important; }
.hdr-res { font-size:12px!important; }
.hdr-qq{display:none!important}

.tab-nav { background: #ddd0c0 !important; border-bottom: 1px solid #b09880 !important; }
.tab-btn { color: #7a6a5a !important; letter-spacing: 2px !important; padding: 8px 20px !important; border-bottom: 1px solid transparent !important; }
.tab-btn.active { color: #3a3028 !important; border-bottom-color: #3a3028 !important; }
.tab-btn:hover { background: rgba(0,0,0,0.02) !important; }

.battle-sidebar { background: #ddd0c0 !important; border-right: 1px solid #b09880 !important; }
@media(min-width:1024px){.battle-sidebar{width:300px!important;padding:16px 14px!important}}
.sidebar-char-name { color: #3a3028 !important; font-size: 15px !important; letter-spacing: 2px !important; }
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
.btn-sm:hover{background:#c4b4a0!important}
.btn-primary { background: #3a3028 !important; border: none !important; color: #f0e8dc !important; }
.btn-primary:hover{background:#4a4038!important}
.modal-close{background:#d0c0ae!important;border:1px solid #b09880!important;color:#7a6a5a!important}
.modal-close:hover{background:#c4b4a0!important;color:#3a3028!important}
.opt-item:hover{border-color:#8b6f4c!important}

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
.tab-btn svg,.ider-nav-icon{display:none!important}
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
.btn-sm:hover{background:#f8f8f8!important}
.btn-primary { background: #333333 !important; border: none !important; color: #ffffff !important; }
.btn-primary:hover{background:#555!important}
.modal-close{background:#fff!important;border:1px solid #e0e0e0!important;color:#888!important}
.modal-close:hover{border-color:#333!important;color:#1a1a1a!important}

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
.tab-btn svg,.ider-nav-icon{display:none!important}
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
  --green: rgba(52,199,89,0.8) !important;   --radius: 14px !important;
}

body{font-family:'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif!important;color:rgba(255,255,255,0.92)!important;font-weight:300!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,0.015),transparent 60%)!important;animation:frostGlow 6s ease-in-out infinite!important}
@keyframes frostGlow{0%,100%{opacity:0.5}50%{opacity:1}}

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
.btn-primary:hover{box-shadow:0 0 30px rgba(0,122,255,0.3)!important}
.modal-close{background:rgba(255,255,255,0.04)!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:10px!important;color:rgba(255,255,255,0.6)!important}
.modal-close:hover{background:rgba(255,255,255,0.08)!important;color:rgba(255,255,255,0.92)!important}

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
.tab-btn svg,.ider-nav-icon{display:none!important}
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
.btn-sm:hover{background:#000!important;color:#fff!important}
.btn-primary { background: #000 !important; border: 2px solid #000 !important; color: #fff !important; font-family: 'Arial Black',sans-serif !important; text-transform: uppercase !important; }
.btn-primary:hover{background:#ff3300!important;border-color:#cc2200!important}
.modal-close{background:#000!important;border:2px solid #000!important;color:#fff!important}
.modal-close:hover{background:#ff3300!important;border-color:#cc2200!important}

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
.tab-btn svg,.ider-nav-icon{display:none!important}
`
},


// ───────────────────────────────────────────────
// ⑨ 敦煌飞天 — 壁画霓裳，飞天神韵
// ───────────────────────────────────────────────
dunhuang: {
name: '敦煌飞天',
desc: '壁画霓裳，飞天神韵 · 莫高色彩，飘带灵动',
css: `
html.theme-dunhuang{--sand:#F0E6D3;--sand-dark:#E0D0B8;--ochre:#C49B5E;--vermilion:#D4432A;--turquoise:#2AA8A8;--gold:#D4A844;--gold-soft:rgba(212,168,68,0.15);--bg:var(--sand)!important;--bg2:var(--sand-dark)!important;--bg3:#E8DCC8!important;--bg4:#DDD0B8!important;--border:rgba(196,155,94,0.25)!important;--text:#3D2B1A!important;--text2:rgba(61,43,26,0.55)!important;--gold:var(--gold)!important;--gold2:#B8923A!important;--accent:var(--vermilion)!important;--red:var(--vermilion)!important;--green:#5A7A3A!important;--radius:4px!important}
.theme-dunhuang body{font-family:'Noto Serif SC','STSong','SimSun',serif!important;background:var(--sand)!important;color:var(--text)!important;letter-spacing:0.04em!important}
.theme-dunhuang .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:4px 12px!important;background:linear-gradient(90deg,var(--sand-dark),transparent,var(--sand-dark))!important;border-bottom:1px solid var(--border)!important;gap:4px!important;flex-wrap:nowrap!important}
.theme-dunhuang .game-header::after{content:''!important;position:absolute!important;bottom:-1px!important;left:10%!important;right:10%!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--gold),var(--vermilion),var(--gold),transparent)!important;opacity:0.3!important}
.theme-dunhuang .game-header .hdr-name{font-family:'Noto Serif SC','STSong',serif!important;font-size:0.85rem!important;letter-spacing:0.2em!important;color:var(--vermilion)!important}
.theme-dunhuang .game-header .hdr-info{color:var(--text2)!important;font-size:0.7rem!important;letter-spacing:0.1em!important;white-space:nowrap!important}
.theme-dunhuang .game-header .hdr-res{font-size:11px!important;color:var(--text2)!important;display:flex!important;align-items:center!important;gap:8px!important;white-space:nowrap!important}
.theme-dunhuang .game-header .hdr-res{margin-right:auto!important}
.theme-dunhuang .hdr-qq{display:none!important}
.theme-dunhuang .btn-icon{color:var(--text2)!important;font-size:14px!important;padding:2px 6px!important}
.theme-dunhuang .btn-icon:hover{color:var(--gold)!important}
.theme-dunhuang .tab-nav{background:var(--sand-dark)!important;border-bottom:1px solid var(--border)!important;gap:2px!important}
.theme-dunhuang .tab-btn{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.12em!important;padding:6px 12px!important;font-size:12px!important;color:var(--text2)!important;border-bottom:1px solid transparent!important;transition:all 0.3s!important}
.theme-dunhuang .tab-btn.active{color:var(--vermilion)!important;border-bottom-color:var(--gold)!important}
.theme-dunhuang .tab-btn:hover{background:var(--gold-soft)!important;color:var(--text)!important}
.theme-dunhuang .battle-sidebar{background:var(--sand-dark)!important;border-right:1px solid var(--border)!important;padding:16px 14px!important}
.theme-dunhuang .sidebar-char-name{font-family:'Noto Serif SC',serif!important;color:var(--vermilion)!important;font-size:14px!important;letter-spacing:0.15em!important}
.theme-dunhuang .sidebar-section-title{color:var(--gold)!important;border-bottom:1px solid var(--border)!important;font-size:10px!important;letter-spacing:0.15em!important}
.theme-dunhuang .stat-card,.theme-dunhuang .skill-card,.theme-dunhuang .modal-panel,.theme-dunhuang .battle-status-panel,.theme-dunhuang .battle-log-box{background:var(--sand)!important;border:1px solid var(--border)!important;padding:12px!important;transition:all 0.3s!important}
.theme-dunhuang .stat-card:hover,.theme-dunhuang .skill-card:hover{border-color:var(--gold)!important;box-shadow:0 2px 12px var(--gold-soft)!important}
.theme-dunhuang .section-title{font-family:'Noto Serif SC',serif!important;color:var(--ochre)!important;border-bottom:1px solid var(--border)!important;font-size:13px!important;letter-spacing:0.15em!important}
.theme-dunhuang .skill-card.equipped{border-left:3px solid var(--gold)!important;background:var(--gold-soft)!important}
.theme-dunhuang .btn-primary{background:var(--vermilion)!important;border:none!important;color:#fff!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important}
.theme-dunhuang .btn-primary:hover{background:var(--ochre)!important}
.theme-dunhuang .btn-action{background:transparent!important;border:1px solid var(--border)!important;color:var(--text)!important;font-family:'Noto Serif SC',serif!important}
.theme-dunhuang .btn-action:hover{background:var(--gold-soft)!important;border-color:var(--gold)!important}
.theme-dunhuang .btn-action.gold{color:var(--gold)!important;border-color:var(--gold)!important}
.theme-dunhuang .modal-overlay{background:rgba(61,43,26,0.3)!important}
.theme-dunhuang .modal-panel{background:var(--sand)!important;border:1px solid var(--border)!important}
.theme-dunhuang .modal-title{font-family:'Noto Serif SC',serif!important;color:var(--vermilion)!important;border-bottom:1px solid var(--border)!important}
.theme-dunhuang .bar-track{height:6px!important;background:var(--sand-dark)!important;border:none!important;border-radius:0!important}
.theme-dunhuang .hp-bar-red{background:linear-gradient(90deg,var(--vermilion),#8A2A1A)!important}
.theme-dunhuang .hp-bar-green{background:linear-gradient(90deg,var(--turquoise),#1A7A7A)!important}
.theme-dunhuang .mp-bar-blue{background:linear-gradient(90deg,#3A3A5A,#5A5A8A)!important}
.theme-dunhuang .exp-fill{background:linear-gradient(90deg,var(--gold),var(--ochre))!important}
.theme-dunhuang .toast{background:var(--sand)!important;border:1px solid var(--gold)!important;color:var(--vermilion)!important;font-family:'Noto Serif SC',serif!important}
.theme-dunhuang .view-login{background:var(--sand)!important}
.theme-dunhuang .login-card{background:var(--sand-dark)!important;border:1px solid var(--border)!important}
.theme-dunhuang .game-title{font-family:'Noto Serif SC','STSong',serif!important;color:var(--vermilion)!important;letter-spacing:0.25em!important;text-shadow:none!important}
.theme-dunhuang input,.theme-dunhuang select,.theme-dunhuang textarea{background:var(--sand)!important;border:1px solid var(--border)!important;color:var(--text)!important}
.theme-dunhuang ::-webkit-scrollbar-thumb{background:var(--ochre)!important}
.theme-dunhuang .panel{animation:inkwashIn 0.6s ease!important}
.tab-btn svg,.ider-nav-icon{display:none!important}
`
},

// ───────────────────────────────────────────────
// ⑩ 阴阳太极 — 阴阳相生，太极无极
// ───────────────────────────────────────────────
taiji: {
name: '阴阳太极',
desc: '阴阳相生，太极无极 · 黑白对立，道法自然',
css: `
html.theme-taiji{--ink-deep:#0A0A0A;--ink-mid:rgba(10,10,10,0.5);--ink-light:rgba(10,10,10,0.1);--ink-faint:rgba(10,10,10,0.04);--paper-pure:#F8F8F8;--paper-warm:#F0F0F0;--gray-mid:#888;--gray-light:#CCC;--bg:var(--paper-pure)!important;--bg2:var(--paper-warm)!important;--bg3:#E8E8E8!important;--bg4:#DDD!important;--border:rgba(10,10,10,0.12)!important;--text:var(--ink-deep)!important;--text2:var(--ink-mid)!important;--gold:var(--ink-deep)!important;--gold2:var(--ink-mid)!important;--accent:var(--gray-mid)!important;--red:#0A0A0A!important;--green:#4A4A4A!important;--radius:0!important;--shadow:none!important}
.theme-taiji body{font-family:'Noto Sans SC','Helvetica Neue',Arial,sans-serif!important;background:var(--paper-pure)!important;color:var(--ink-deep)!important;letter-spacing:0.02em!important}
.theme-taiji .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:4px 16px!important;background:var(--ink-deep)!important;border-bottom:2px solid var(--ink-deep)!important;gap:6px!important;flex-wrap:nowrap!important}
.theme-taiji .game-header .hdr-name{font-weight:600!important;font-size:0.8rem!important;letter-spacing:0.15em!important;color:#fff!important;white-space:nowrap!important}
.theme-taiji .game-header .hdr-info{color:rgba(255,255,255,0.5)!important;font-size:0.7rem!important;white-space:nowrap!important}
.theme-taiji .game-header .hdr-res{color:rgba(255,255,255,0.6)!important;font-size:11px!important;display:flex!important;align-items:center!important;gap:8px!important;margin-right:auto!important}
.theme-taiji .game-header .btn-icon{color:rgba(255,255,255,0.4)!important;font-size:14px!important;padding:2px 6px!important}
.theme-taiji .game-header .btn-icon:hover{color:#fff!important}
.theme-taiji .hdr-qq{display:none!important}
.theme-taiji .tab-nav{background:#fff!important;border-bottom:2px solid var(--ink-deep)!important}
.theme-taiji .tab-btn{font-weight:400!important;letter-spacing:0.08em!important;padding:8px 16px!important;font-size:12px!important;color:var(--text2)!important;border-bottom:2px solid transparent!important;margin-bottom:-2px!important;transition:all 0.2s!important}
.theme-taiji .tab-btn.active{color:var(--ink-deep)!important;border-bottom-color:var(--ink-deep)!important;font-weight:600!important}
.theme-taiji .tab-btn:hover{color:var(--ink-deep)!important;background:var(--ink-faint)!important}
.theme-taiji .battle-sidebar{background:#fff!important;border-right:1px solid var(--border)!important;padding:20px 16px!important;width:240px!important}
.theme-taiji .sidebar-char-name{font-weight:700!important;font-size:16px!important;color:var(--ink-deep)!important;letter-spacing:0.05em!important}
.theme-taiji .sidebar-section-title{font-weight:600!important;font-size:10px!important;color:var(--text2)!important;text-transform:uppercase!important;border-bottom:1px solid var(--border)!important;padding-bottom:6px!important;letter-spacing:1px!important}
.theme-taiji .stat-card,.theme-taiji .skill-card,.theme-taiji .modal-panel,.theme-taiji .battle-status-panel,.theme-taiji .battle-log-box{background:#fff!important;border:1px solid var(--border)!important;padding:14px!important}
.theme-taiji .skill-card.equipped{border-left:3px solid var(--ink-deep)!important}
.theme-taiji .section-title{font-weight:600!important;font-size:12px!important;color:var(--ink-deep)!important;border-bottom:1px solid var(--border)!important;padding-bottom:8px!important;text-transform:uppercase!important;letter-spacing:1px!important}
.theme-taiji .btn-primary{background:var(--ink-deep)!important;border:none!important;color:#fff!important;border-radius:0!important;padding:8px 20px!important;font-size:12px!important}
.theme-taiji .btn-primary:hover{background:var(--gray-mid)!important}
.theme-taiji .btn-action{background:transparent!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:0!important}
.theme-taiji .btn-action:hover{background:var(--ink-deep)!important;color:#fff!important}
.theme-taiji .btn-action.gold{color:var(--ink-deep)!important;border-color:var(--ink-deep)!important}
.theme-taiji .modal-overlay{background:rgba(10,10,10,0.4)!important}
.theme-taiji .modal-panel{background:#fff!important;border:2px solid var(--ink-deep)!important;border-radius:0!important}
.theme-taiji .modal-title{font-weight:700!important;font-size:16px!important;border-bottom:2px solid var(--ink-deep)!important;padding-bottom:10px!important}
.theme-taiji .bar-track{height:4px!important;background:var(--ink-faint)!important;border:none!important;border-radius:0!important}
.theme-taiji .hp-bar-red{background:var(--ink-deep)!important}
.theme-taiji .hp-bar-green{background:var(--gray-mid)!important}
.theme-taiji .mp-bar-blue{background:var(--gray-light)!important}
.theme-taiji .exp-fill{background:var(--ink-deep)!important}
.theme-taiji .toast{background:var(--ink-deep)!important;border:none!important;color:#fff!important;border-radius:0!important}
.theme-taiji .view-login{background:var(--paper-pure)!important}
.theme-taiji .login-card{background:#fff!important;border:2px solid var(--ink-deep)!important;border-radius:0!important;box-shadow:8px 8px 0 rgba(10,10,10,0.05)!important}
.theme-taiji .game-title{font-weight:700!important;letter-spacing:0.15em!important;color:var(--ink-deep)!important;text-shadow:none!important}
.theme-taiji input,.theme-taiji select,.theme-taiji textarea{background:#fff!important;border:1px solid var(--ink-deep)!important;color:var(--ink-deep)!important;border-radius:0!important}
.theme-taiji ::-webkit-scrollbar{width:4px!important}
.theme-taiji ::-webkit-scrollbar-thumb{background:var(--ink-deep)!important}
.theme-taiji .panel{animation:iderFrostIn 0.3s ease!important}
.tab-btn svg,.ider-nav-icon{display:none!important}
`
},



// ───────────────────────────────────────────────
// ⑪ 蛊真人 — 残章禁卷，蛊界法则
// ───────────────────────────────────────────────
guzhenren: {
name: '蛊真人',
desc: '残章禁卷，蛊界法则 · 天地为炉，万物为蛊',
css: `
html.theme-guzhenren{--void:#07070A;--abyss:#0A0A0F;--deep:#0F0F14;--ink:#141019;--miasma:#1A0A1A;--bone:#E8DCC4;--ash:#A09888;--dust:#5A5548;--gold:#8B7355;--gold-bright:#A0826D;--gold-dim:#5C4033;--rust:#6B4423;--silver:#7A7A7A;--verdigris:#2F4538;--crimson-deep:#2A1010;--line:rgba(139,115,85,0.25);--line-faint:rgba(139,115,85,0.12);--bg:var(--abyss)!important;--bg2:var(--deep)!important;--bg3:var(--ink)!important;--bg4:#1A1620!important;--border:var(--line)!important;--text:var(--bone)!important;--text2:var(--ash)!important;--gold:var(--gold)!important;--gold2:var(--gold-dim)!important;--accent:var(--verdigris)!important;--red:#6B2020!important;--green:#2F4538!important;--radius:0!important}
@keyframes gzrFadeIn{from{opacity:0}to{opacity:1}}
@keyframes gzrFadeInUp{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes gzrSigilSpin{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes gzrFloat{0%,100%{transform:translateY(0) rotate(0deg);opacity:0.02}25%{opacity:0.05}50%{transform:translateY(-15px) rotate(5deg);opacity:0.035}75%{opacity:0.04}100%{transform:translateY(0) rotate(0deg);opacity:0.02}}
@keyframes gzrPulse{0%,100%{opacity:0.3}50%{opacity:0.6}}
@keyframes gzrGlow{0%,100%{box-shadow:0 0 5px rgba(139,115,85,0.05)}50%{box-shadow:0 0 20px rgba(139,115,85,0.12)}}
@keyframes gzrReveal{0%{opacity:0;clip-path:inset(0 100% 0 0)}100%{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes gzrBgPan{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes gzrWatermarkFloat{0%,100%{transform:translateY(0) rotate(-3deg);opacity:0.04}50%{transform:translateY(-10px) rotate(-2deg);opacity:0.06}}
@keyframes gzrPortraitGlow{0%,100%{opacity:0.15;filter:brightness(0.6) sepia(0.3)}50%{opacity:0.25;filter:brightness(0.8) sepia(0.2)}}
.theme-guzhenren body{font-family:'Noto Serif SC','Songti SC','SimSun',serif!important;background:var(--abyss)!important;color:var(--bone)!important;letter-spacing:0.06em!important;line-height:2!important}
.theme-guzhenren .view-game{position:relative!important}
.theme-guzhenren .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:2px 10px!important;background:linear-gradient(180deg,var(--void),var(--abyss))!important;border-bottom:1px solid var(--line)!important;gap:2px!important;flex-wrap:nowrap!important;overflow:hidden!important;min-height:34px!important}
.theme-guzhenren .game-header .hdr-name{font-family:'Noto Serif SC',serif!important;font-size:0.75rem!important;font-weight:700!important;letter-spacing:0.2em!important;color:var(--gold)!important;white-space:nowrap!important;max-width:80px!important;overflow:hidden!important;text-overflow:ellipsis!important;flex-shrink:0!important;text-shadow:0 0 15px rgba(139,115,85,0.15)!important}
.theme-guzhenren .game-header .hdr-info{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.08em!important;color:var(--ash)!important;font-size:0.6rem!important;white-space:nowrap!important;flex-shrink:0!important}
.theme-guzhenren .game-header .hdr-info .realm-badge{background:transparent!important;color:var(--gold)!important;padding:0!important;font-size:inherit!important;border:none!important;font-weight:400!important}
.theme-guzhenren .game-header .hdr-qq{display:none!important}
.theme-guzhenren .game-header .hdr-res{font-size:11px!important;letter-spacing:0.1em!important;gap:6px!important;white-space:nowrap!important;display:flex!important;align-items:center!important;color:var(--ash)!important}
.theme-guzhenren .game-header .btn-icon{color:var(--ash)!important;font-size:14px!important;padding:2px 5px!important;background:none!important;border:none!important;cursor:pointer!important;width:24px!important;height:24px!important;border-radius:2px!important;transition:all 0.3s!important}
.theme-guzhenren .game-header .hdr-res{margin-right:auto!important}
.theme-guzhenren .game-header .btn-icon:hover{color:var(--gold-bright)!important;background:rgba(139,115,85,0.08)!important}
.theme-guzhenren .game-header .btn-icon[title*="退出"]{display:none!important}
.theme-guzhenren .tab-nav{justify-content:center!important;background:var(--deep)!important;border-bottom:1px solid var(--line)!important;padding:4px 8px!important;gap:2px!important}
.theme-guzhenren .tab-btn{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.15em!important;padding:6px 14px!important;font-size:12px!important;border-bottom:1px solid transparent!important;transition:all 0.5s ease!important;color:var(--ash)!important;position:relative!important}
.theme-guzhenren .tab-btn.active{color:var(--gold)!important;border-bottom-color:var(--gold)!important;text-shadow:0 0 15px rgba(139,115,85,0.15)!important}
.theme-guzhenren .tab-btn:hover{color:var(--gold-bright)!important;background:rgba(139,115,85,0.03)!important}
@media(min-width:1024px){.theme-guzhenren .tab-nav{flex-direction:column!important;position:fixed!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:100!important;background:var(--deep)!important;border:1px solid var(--line)!important;border-left:none!important;padding:12px 6px!important;gap:3px!important;border-radius:0 8px 8px 0!important}.theme-guzhenren .tab-btn{writing-mode:vertical-rl!important;padding:8px 5px!important;font-size:11px!important;letter-spacing:0.25em!important;border-bottom:none!important;border-right:1px solid transparent!important}.theme-guzhenren .tab-btn.active{border-bottom-color:transparent!important;border-right-color:var(--gold)!important}.theme-guzhenren .main-area{margin-left:44px!important}}
@media(min-width:1024px){.theme-guzhenren .battle-sidebar{width:300px!important;border-right:none!important;border-left:1px solid var(--line)!important;background:var(--deep)!important;padding:16px 14px!important;position:relative!important}.theme-guzhenren .sidebar-char-header{flex-direction:column!important;align-items:flex-start!important;gap:4px!important;margin-bottom:12px!important;padding-bottom:12px!important;border-bottom:1px solid var(--line)!important}.theme-guzhenren .sidebar-char-name{font-family:'Noto Serif SC',serif!important;font-weight:700!important;font-size:15px!important;color:var(--bone)!important;letter-spacing:0.15em!important}.theme-guzhenren .sidebar-char-realm{font-size:10px!important;letter-spacing:0.2em!important;color:var(--dust)!important;display:block!important;margin-top:2px!important}.theme-guzhenren .sidebar-section-title{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.2em!important;font-size:10px!important;color:var(--gold)!important;border-bottom:1px solid var(--line)!important;padding-bottom:6px!important;margin-bottom:8px!important;text-shadow:0 0 10px rgba(139,115,85,0.1)!important}.theme-guzhenren .sidebar-attr-grid .attr-item{background:transparent!important;padding:3px 4px!important;font-size:11px!important;color:var(--ash)!important}.theme-guzhenren .sidebar-stat-cards .stat-card.compact{background:rgba(255,255,255,0.02)!important;border:1px solid var(--line)!important;padding:6px 8px!important}}
.theme-guzhenren .stat-card,.theme-guzhenren .skill-card,.theme-guzhenren .map-card,.theme-guzhenren .sect-card,.theme-guzhenren .alliance-card,.theme-guzhenren .recipe-card,.theme-guzhenren .dungeon-card,.theme-guzhenren .listing-card{background:var(--ink)!important;border:1px solid var(--line)!important;position:relative!important;transition:all 0.6s ease!important;animation:gzrFadeIn 0.5s ease!important}
.theme-guzhenren .stat-card:hover,.theme-guzhenren .skill-card:hover,.theme-guzhenren .map-card:hover{border-color:var(--gold)!important;animation:gzrGlow 0.5s ease forwards!important}
.theme-guzhenren .section-title{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.2em!important;color:var(--gold)!important;border-bottom:1px solid var(--line)!important;font-size:13px!important;padding-bottom:6px!important;margin-bottom:12px!important;text-shadow:0 0 15px rgba(139,115,85,0.1)!important}
.theme-guzhenren .skill-card.equipped{border-left:2px solid var(--gold)!important;border-color:var(--line)!important;background:rgba(139,115,85,0.04)!important}
.theme-guzhenren .battle-status-panel{background:var(--ink)!important;border:1px solid var(--line)!important;padding:14px!important;animation:gzrFadeIn 0.4s ease!important}
.theme-guzhenren .battle-unit .unit-name{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.1em!important;color:var(--bone)!important}
.theme-guzhenren .battle-unit .unit-name.enemy-name{color:var(--gold)!important}
.theme-guzhenren .battle-vs{font-family:'Playfair Display',serif!important;font-size:1rem!important;color:var(--dust)!important;letter-spacing:0.15em!important}
.theme-guzhenren .battle-log-box{background:var(--ink)!important;border:1px solid var(--line)!important;font-family:'Noto Serif SC',serif!important;font-size:12px!important;line-height:2!important;letter-spacing:0.06em!important;color:var(--ash)!important}
.theme-guzhenren .bar-track{height:6px!important;background:var(--ink)!important;border:1px solid var(--line)!important;border-radius:0!important}
.theme-guzhenren .bar-fill{border-radius:0!important;transition:width 0.8s cubic-bezier(0.22,1,0.36,1)!important}
.theme-guzhenren .hp-bar-green{background:linear-gradient(90deg,var(--verdigris),#4A7A5A)!important}
.theme-guzhenren .hp-bar-red{background:linear-gradient(90deg,var(--crimson-deep),#8A3030)!important}
.theme-guzhenren .mp-bar-blue{background:linear-gradient(90deg,#2A2A4A,#5A5A8A)!important}
.theme-guzhenren .action-bar-yellow{background:linear-gradient(90deg,var(--gold-dim),var(--gold))!important}
.theme-guzhenren .exp-fill,.theme-guzhenren .exp-bar-fill{background:linear-gradient(90deg,var(--gold-dim),var(--gold))!important}
.theme-guzhenren .modal-overlay{background:rgba(7,7,10,0.85)!important;backdrop-filter:blur(4px)!important}
.theme-guzhenren .modal-panel{background:var(--deep)!important;border:1px solid var(--line)!important;box-shadow:0 4px 40px rgba(0,0,0,0.5)!important;animation:gzrFadeInUp 0.4s ease!important}
.theme-guzhenren .modal-title{font-family:'Noto Serif SC',serif!important;font-weight:700!important;letter-spacing:0.15em!important;color:var(--gold)!important;border-bottom:1px solid var(--line)!important;padding-bottom:8px!important;margin-bottom:12px!important}
.theme-guzhenren .modal-close{color:var(--ash)!important;background:transparent!important;border:1px solid var(--line)!important;border-radius:2px!important;transition:all 0.3s!important}
.theme-guzhenren .modal-close:hover{background:rgba(139,115,85,0.08)!important;color:var(--gold)!important;border-color:var(--gold)!important}
.theme-guzhenren .btn-primary{background:var(--gold-dim)!important;color:var(--bone)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.15em!important;border-radius:0!important;border:1px solid var(--gold)!important;transition:all 0.3s!important}
.theme-guzhenren .btn-primary:hover{background:var(--gold)!important;color:var(--void)!important;box-shadow:0 0 20px rgba(139,115,85,0.2)!important}
.theme-guzhenren .btn-action{background:transparent!important;border:1px solid var(--line)!important;color:var(--ash)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;font-weight:300!important;transition:all 0.3s!important}
.theme-guzhenren .btn-action:hover{background:rgba(139,115,85,0.05)!important;border-color:var(--gold)!important;color:var(--gold)!important}
.theme-guzhenren .btn-action.gold{color:var(--gold)!important;border-color:var(--gold)!important}
.theme-guzhenren .btn-sm{background:transparent!important;border:1px solid var(--line)!important;color:var(--ash)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important;font-weight:300!important;transition:all 0.3s!important}
.theme-guzhenren .btn-sm:hover{background:rgba(139,115,85,0.05)!important;color:var(--gold)!important}
.theme-guzhenren .btn-sm.gold{color:var(--gold)!important;border-color:var(--gold)!important}
.theme-guzhenren .view-login{background:var(--abyss)!important;position:relative!important;overflow:hidden!important}
.theme-guzhenren .login-card{background:var(--deep)!important;border:1px solid var(--line)!important;border-radius:0!important;box-shadow:0 4px 40px rgba(0,0,0,0.3)!important;position:relative!important;z-index:1!important}
.theme-guzhenren .game-title{font-family:'Noto Serif SC',serif!important;font-weight:900!important;letter-spacing:0.25em!important;color:var(--bone)!important;text-shadow:0 0 40px rgba(139,115,85,0.15)!important;font-size:clamp(1.5rem,5vw,2.5rem)!important}
.theme-guzhenren .login-subtitle{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.4em!important;color:var(--ash)!important}
.theme-guzhenren .toast{background:var(--deep)!important;border:1px solid var(--gold)!important;color:var(--gold)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;border-radius:0!important;box-shadow:0 4px 20px rgba(0,0,0,0.3)!important}
.theme-guzhenren .item-detail{background:var(--ink)!important;border:1px solid var(--line)!important}
.theme-guzhenren .equip-slot,.theme-guzhenren .opt-item,.theme-guzhenren .inv-slot{background:var(--ink)!important;border:1px solid var(--line)!important;border-radius:0!important;transition:all 0.3s!important}
.theme-guzhenren .inv-slot.occupied:hover{border-color:var(--gold)!important;box-shadow:0 0 10px rgba(139,115,85,0.08)!important}
.theme-guzhenren .map-card.active{border-color:var(--gold)!important;background:rgba(139,115,85,0.04)!important}
.theme-guzhenren .sub-tab button,.theme-guzhenren .sub-tab-item{border-bottom:1px solid var(--line-faint)!important;color:var(--dust)!important;letter-spacing:1px!important;font-size:12px!important;background:transparent!important}
.theme-guzhenren .sub-tab button.active{color:var(--gold)!important;border-bottom:1px solid var(--gold)!important}
.theme-guzhenren .sr-bar{height:4px!important;background:var(--ink)!important;border:1px solid var(--line-faint)!important;border-radius:0!important}
.theme-guzhenren .key-badge{background:var(--gold-dim)!important;color:var(--bone)!important;font-family:'Noto Serif SC',serif!important;border-radius:0!important}
.theme-guzhenren .skill-name{font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important;color:var(--bone)!important}
.theme-guzhenren ::-webkit-scrollbar{width:4px!important}
.theme-guzhenren ::-webkit-scrollbar-thumb{background:var(--gold-dim)!important;border-radius:0!important}
.theme-guzhenren ::-webkit-scrollbar-track{background:var(--abyss)!important}
.theme-guzhenren input,.theme-guzhenren select,.theme-guzhenren textarea{background:var(--ink)!important;border:1px solid var(--line)!important;color:var(--bone)!important;border-radius:0!important;font-family:'Noto Serif SC',serif!important}
.theme-guzhenren input:focus{border-color:var(--gold)!important;box-shadow:0 0 10px rgba(139,115,85,0.08)!important}
.theme-guzhenren .panel{animation:gzrFadeIn 0.5s ease!important}
.theme-guzhenren .bar-fill,.theme-guzhenren .exp-fill{animation:gzrFadeIn 0.6s ease!important}
.tab-btn svg,.ider-nav-icon{display:none!important}
`
},
}; // SKINS end

// ═══════════════════════════════════════════════════════════
// 映射：本地 key → 工单系统 CSS key
// ═══════════════════════════════════════════════════════════
const SKIN_KEY_MAP = {
  inkwash: 'ink',
  dunhuang: 'dunhuang',
  taiji: 'taiji',
  cyber: 'cyber',
  luxe: 'luxe',
  magazine: 'magazine',
  wabi: 'wabi',
  minimal: 'minimal',
  frost: 'frost',
  brutal: 'brutal',
  guzhenren: 'guzhenren',
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
  INKWASH.remove();
  CYBERWASH.remove();
  DUNHUANGWASH.remove();
  TAIJIWASH.remove();
  isOrderSystemMode = false;

  if (skinName && SKINS[skinName]) {
    const style = document.createElement('style');
    style.textContent = SKINS[skinName].css;
    style.setAttribute('data-ider-skin', skinName);
    document.head.appendChild(style);
    activeStyleEl = style;
    setActiveSkin(skinName);
    console.log('[皮肤] 已应用: ' + SKINS[skinName].name);
    if (skinName === 'inkwash') {
      setTimeout(() => INKWASH.apply(), 150);
    } else if (skinName === 'cyber') {
      setTimeout(() => CYBERWASH.apply(), 150);
    } else if (skinName === 'dunhuang') {
      setTimeout(() => DUNHUANGWASH.apply(), 150);
    } else if (skinName === 'guzhenren') {
      setTimeout(() => GUZHENRENWASH.apply(), 150);
    } else if (skinName === 'taiji') {
      setTimeout(() => TAIJIWASH.apply(), 150);
    }
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
              url: apiUrl + '/api/skins/css/' + key + '?v=' + Date.now(),
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
  const tryInsert = () => {
    const header = document.querySelector('.game-header');
    if (header && !document.querySelector('.ider-skin-btn')) {
      const btn = document.createElement('button');
      btn.className = 'btn-icon ider-skin-btn';
      btn.title = '切换皮肤';
      const palSvg = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8.5" stroke="#d4a844" stroke-width="1.2"/><circle cx="6.5" cy="6.5" r="1.5" fill="#d4a844"/><circle cx="14" cy="6.5" r="1.5" fill="#e88" stroke="none"/><circle cx="4" cy="11" r="1.2" fill="#8cf" stroke="none"/><path d="M10 15a2.5 2.5 0 002.5-2.5" stroke="#d4a844" stroke-width="1.2" opacity="0.6"/></svg>';
      const enc = btoa(unescape(encodeURIComponent(palSvg)));
      btn.style.cssText = `border:none!important;cursor:pointer!important;padding:2px!important;width:28px!important;height:28px!important;background:transparent!important;background-image:url("data:image/svg+xml;base64,${enc}")!important;background-size:20px!important;background-position:center!important;background-repeat:no-repeat!important;flex-shrink:0!important;border-radius:4px!important;z-index:9999!important;position:relative!important`;
      btn.addEventListener('click', showSkinPicker);
      // 插入到灵石区域后面（和灵石并排）
      const res = header.querySelector('.hdr-res');
      if (res && res.nextSibling) {
        header.insertBefore(btn, res.nextSibling);
      } else {
        header.appendChild(btn);
      }
      return true;
    }
    return false;
  };
  // 轮询等待 header 出现，最多等10秒
  let tries = 0;
  const iv = setInterval(() => {
    if (tryInsert() || ++tries > 20) clearInterval(iv);
  }, 500);
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
      <span style="font-size:16px;font-weight:600;color:#d4a844;display:flex;align-items:center;gap:6px;">${icon('palette', null, 18)} 皮肤切换</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="ider-skin-config-btn" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#888;font-size:0;padding:4px 8px;border-radius:8px;cursor:pointer;">${icon('gear', null, 16)}</button>
        <span class="ider-skin-close" style="font-size:0;color:#888;cursor:pointer;line-height:1;display:inline-flex;">${icon('close', null, 20)}</span>
      </div>
    </div>
    <div id="ider-os-status" style="font-size:11px;color:#666;margin-bottom:12px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.03);display:${token ? 'block' : 'none'}">
      <span id="ider-os-status-text">${token ? '工单系统已连接' : ''}</span>
    </div>
    <div style="display:grid;gap:8px" id="ider-skin-list">
      <div class="ider-skin-opt ${!current?'active':''}" data-skin=""
           style="padding:12px 16px;border-radius:12px;cursor:pointer;border:2px solid ${!current?'rgba(212,168,68,0.6)':'transparent'};background:rgba(255,255,255,0.03);transition:all 0.2s;">
        <div style="font-weight:600;font-size:14px;color:${!current?'#d4a844':'#ccc'};display:flex;align-items:center;gap:6px;">${icon('cycle', null, 14)} 默认样式</div>
        <div style="font-size:12px;color:#888;margin-top:2px">恢复游戏原始外观</div>
      </div>
  `;

  // 有 token 时从 API 获取已拥有皮肤列表
  if (token) {
    html += `<div style="text-align:center;padding:16px;color:#888;font-size:12px;" id="ider-skin-loading">${icon('hourglass', null, 14)} 加载已拥有的皮肤...</div>`;
  } else {
    html += `
      <div style="text-align:center;padding:24px 16px;color:#666;font-size:13px;">
        <div style="font-size:32px;margin-bottom:8px;">${icon('lock', null, 32)}</div>
        <div style="display:flex;align-items:center;gap:4px;justify-content:center;">请在 ${icon('gear', null, 14)} 设置中配置工单系统 Token</div>
        <div style="font-size:11px;margin-top:8px;color:#555;">登录工单系统 → 设置 → 获取 Token</div>
      </div>`;
  }

  html += `</div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);font-size:10px;color:#555;">
      <span style="display:inline-flex;align-items:center;gap:4px;">${icon('bulb', null, 12)} 仅显示你在工单系统已购买的皮肤</span>
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

  if (localSkin) {
    // 直接使用本地 CSS，无需网络请求
    applySkin(localKey);
    closeSkinPicker();
    showToast('已切换为「' + localSkin.name + '」');
    return;
  }

  const msgEl = panel.querySelector('#ider-os-status-text');
  if (msgEl) msgEl.innerHTML = icon('hourglass', null, 12) + ' 应用皮肤...';

  GM_xmlhttpRequest({
    method: 'GET',
    url: apiUrl + '/api/skins/css/' + skinKey,
    onload: function(cssRes) {
      if (cssRes.status === 200 && cssRes.responseText) {
        applyOrderSystemSkin(skinKey, cssRes.responseText);
        closeSkinPicker();
        showToast('已切换皮肤');
      }
    },
    onerror: function() {
      if (msgEl) msgEl.innerHTML = icon('crossError', null, 12) + ' 加载失败';
    },
    ontimeout: function() {
      if (msgEl) msgEl.innerHTML = icon('crossError', null, 12) + ' 请求超时';
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
        <span style="font-size:15px;font-weight:600;color:#d4a844;display:flex;align-items:center;gap:6px;">${icon('key', null, 16)} 获取 API Token</span>
        <span class="ider-custom-close" style="font-size:0;color:#888;cursor:pointer;">${icon('close', null, 20)}</span>
      </div>

      <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:12px;">
        <h4 style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:8px;display:flex;align-items:center;gap:6px;">${icon('note', null, 14)} 步骤</h4>
        <ol style="font-size:12px;color:#aaa;line-height:2;padding-left:16px;">
          <li>点击下方按钮打开 <strong>工单系统 → 设置页面</strong></li>
          <li>登录你的账号（如未登录）</li>
          <li>找到「<strong>API Token</strong>」区域</li>
          <li>点击「<strong>复制</strong>」按钮复制 Token</li>
          <li>回到游戏页面，打开 <span style="display:inline-flex;align-items:center;vertical-align:middle;">${icon('palette', null, 12)}</span> 皮肤面板</li>
          <li>点击 <span style="display:inline-flex;align-items:center;vertical-align:middle;">${icon('gear', null, 12)}</span> 设置，将 Token 粘贴到输入框中</li>
          <li>点击「保存」，脚本将自动同步你的皮肤</li>
        </ol>
      </div>

      <a href="${apiUrl}/#/settings" target="_blank" style="display:block;text-align:center;padding:10px 16px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:8px;color:#818cf8;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:12px;">
        ${icon('link', null, 14)} 打开工单系统设置页面
      </a>

      <div style="background:rgba(212,168,68,0.08);border:1px solid rgba(212,168,68,0.15);border-radius:8px;padding:12px;font-size:11px;color:#b8963a;">
        <strong style="display:inline-flex;align-items:center;gap:6px;">${icon('warning', null, 14)} 安全提醒</strong>
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
      <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:10px;display:flex;align-items:center;gap:6px;">${icon('gear', null, 14)} 设置</div>

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
        <button id="ider-cfg-token-help" style="padding:6px 12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:8px;color:#818cf8;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:4px;">${icon('key', null, 12)} 获取 Token</button>
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
    msgEl.innerHTML = icon('checkmark', null, 12) + ' 已保存';
    msgEl.style.color = '#40a040';
    const statusEl = panel.querySelector('#ider-os-status');
    if (statusEl) {
      statusEl.style.display = token ? 'block' : 'none';
      const statusText = panel.querySelector('#ider-os-status-text');
      if (statusText) statusText.textContent = token ? '工单系统已连接' : '';
    }
    if (token) {
      msgEl.innerHTML = icon('hourglass', null, 12) + ' 正在同步...';
      fetchOrderSystemSkin().then(result => {
        if (result) {
          applyOrderSystemSkin(result.key, result.css);
          msgEl.innerHTML = icon('checkmark', null, 12) + ' 已同步工单系统皮肤';
          closeSkinPicker();
          showToast('已同步工单系统皮肤');
        } else {
          msgEl.innerHTML = icon('warning', null, 12) + ' 未找到激活的皮肤或连接失败';
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
    msgEl.innerHTML = icon('hourglass', null, 12) + ' 测试中...';
    msgEl.style.color = '#666';
    GM_xmlhttpRequest({
      method: 'GET',
      url: apiUrl + '/api/user/info',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      onload: function(res) {
        if (res.status === 200) {
          msgEl.innerHTML = icon('checkmark', null, 12) + ' 连接成功';
          msgEl.style.color = '#40a040';
        } else {
          msgEl.innerHTML = icon('cross', null, 12) + ' 连接失败: HTTP ' + res.status;
          msgEl.style.color = '#d04040';
        }
      },
      onerror: function() { msgEl.innerHTML = icon('cross', null, 12) + ' 网络错误'; msgEl.style.color = '#d04040'; },
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
          <div style="font-size:32px;margin-bottom:8px;">${icon('palette', null, 32)}</div>
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
    if (loadingEl) loadingEl.innerHTML = icon('cross', null, 12) + ' 加载失败，请检查网络';
  });
}

// ══ 应用工单系统皮肤 ══
function applyOrderSystemSkin(skinKey, cssText) {
  clearActiveStyle();
  INKWASH.remove();
  CYBERWASH.remove();
  DUNHUANGWASH.remove();
  TAIJIWASH.remove();
  isOrderSystemMode = true;
  const style = document.createElement('style');
  style.textContent = cssText;
  style.setAttribute('data-ider-skin-os', skinKey);
  document.head.appendChild(style);
  activeStyleEl = style;
  setActiveSkin('__os_' + skinKey);
  console.log('[皮肤] 已应用工单系统皮肤: ' + skinKey);
  if (skinKey === 'ink') {
    setTimeout(() => INKWASH.apply(), 150);
  } else if (skinKey === 'cyber') {
    setTimeout(() => CYBERWASH.apply(), 150);
  } else if (skinKey === 'dunhuang') {
    setTimeout(() => DUNHUANGWASH.apply(), 150);
  } else if (skinKey === 'guzhenren') {
    setTimeout(() => GUZHENRENWASH.apply(), 150);
  } else if (skinKey === 'taiji') {
    setTimeout(() => TAIJIWASH.apply(), 150);
  }
}

// 注入全局动画关键帧
const animStyle = document.createElement('style');
animStyle.textContent = `@keyframes iderTIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}}@keyframes iderCustomIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes iderCyberScanLine{0%,100%{top:0;opacity:0}10%{opacity:1}20%{opacity:0.3}30%{opacity:1}45%{opacity:0}50%{top:50%;opacity:0.8}60%{opacity:0.2}75%{opacity:1}90%{opacity:0}100%{top:100%;opacity:0}}@keyframes dunhuangFall{0%{transform:translateY(-20px) rotate(0deg);opacity:0}10%{opacity:0.5}90%{opacity:0.3}100%{transform:translateY(110vh) rotate(360deg);opacity:0}}@keyframes taijiSpin{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}@keyframes taijiFloat{0%,100%{transform:translateY(0) scale(1);opacity:0.3}50%{transform:translateY(-20px) scale(1.3);opacity:0.6}}`;
document.head.appendChild(animStyle);

// ══ 启动 ══
setTimeout(() => {
  injectSkinBtn();
  // 延迟应用皮肤，等待 DOM 就绪
  setTimeout(applySavedSkin, 500);
}, 1000);

// ══ 响应式 — 窗口缩放时重新触发布局 ══
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (INKWASH.active) {
      document.querySelectorAll('.inkwash-done').forEach(el => el.classList.remove('inkwash-done'));
      INKWASH.layout();
    }
  }, 200);
});

})();
