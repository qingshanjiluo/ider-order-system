/* ═══════════════════════════════════════
   水墨修仙 · INKWASH LAYOUT
   画卷展开式 DOM 布局改造引擎
   ═══════════════════════════════════════ */

const INKWASH_CLASS = 'theme-inkwash';
let _active = false;
let _observer = null;
let _observerTarget = null;

/* ── SVG 图标库 ── */
const ICONS = {
  mountain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 18L9 8l4 6 5-8 3 4"/><path d="M3 18h18"/><path d="M7 18V6"/><path d="M4 6l3 2 5-3 4 2 5-2"/></svg>`,
  sword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 14L3 21M21 3l-9 9M5 5l3 3M16 16l3 3"/></svg>`,
  pouch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 10h12v10a2 2 0 01-2 2H8a2 2 0 01-2-2V10z"/><path d="M8 10V6a4 4 0 018 0v4"/><path d="M12 14v4"/><path d="M10 16h4"/></svg>`,
  bamboo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="14" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/></svg>`,
  talisman: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20l4-10 4 6 4-8 4 12"/><circle cx="7" cy="6" r="1.5" fill="#C43A2B" stroke="none"/><circle cx="17" cy="5" r="1" fill="currentColor" opacity="0.3" stroke="none"/></svg>`,
  inkstone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="14" width="16" height="6" rx="1"/><rect x="6" y="16" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.15"/><path d="M8 4l2 10M12 4l2 10M16 4l2 10"/><line x1="3" y1="14" x2="21" y2="14"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20l-7-7a4.5 4.5 0 016-6l1 1 1-1a4.5 4.5 0 016 6l-7 7z"/></svg>`,
  dantian: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="5" stroke-dasharray="1 4"/><circle cx="12" cy="12" r="2" fill="currentColor" fill-opacity="0.15"/><path d="M12 2l1 3-1 1-1-1z" fill="currentColor" opacity="0.3"/></svg>`,
  scroll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="13" y2="11"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
};

/* ── Tab → SVG 图标映射 ── */
const TAB_ICONS = {
  announcement: ICONS.scroll,
  character: ICONS.heart,
  inventory: ICONS.pouch,
  equipment: ICONS.sword,
  skills: ICONS.bamboo,
  techniques: ICONS.bamboo,
  map: ICONS.mountain,
  mail: ICONS.scroll,
  chat: ICONS.scroll,
  baiyi: ICONS.talisman,
  cave: ICONS.mountain,
  forge: ICONS.talisman,
  sect: ICONS.mountain,
  alliance: ICONS.mountain,
  duel: ICONS.sword,
  league: ICONS.sword,
  dungeon: ICONS.mountain,
  exchange: ICONS.pouch,
  help: ICONS.scroll,
  settings: ICONS.inkstone,
};

/* ═══════════════════════════════════════
   布局改造核心函数
   ═══════════════════════════════════════ */

/* ── Phase 1: Header 引首 + 印章 ── */
function layoutHeader() {
  const header = document.querySelector('.game-header');
  if (!header || header.classList.contains('inkwash-done')) return;
  header.classList.add('inkwash-done');

  // 1. 引首垂线
  if (!header.querySelector('.inkwash-header-line')) {
    const line = document.createElement('div');
    line.className = 'inkwash-header-line';
    header.prepend(line);
  }

  // 2. 名字元素加印章类 (CSS 已处理样式)
  const nameEl = header.querySelector('.hdr-name');
  if (nameEl) nameEl.classList.add('inkwash-seal-text');

  // 3. 墨线分割器 (after hdr-info, before hdr-res)
  const info = header.querySelector('.hdr-info');
  const res = header.querySelector('.hdr-res');
  if (info && !header.querySelector('.inkwash-divider')) {
    const div = document.createElement('div');
    div.className = 'inkwash-divider';
    if (res) header.insertBefore(div, res);
    else header.appendChild(div);
  }

  // 4. 替换所有 btn-icon 为水墨风格 SVG
  const btns = header.querySelectorAll('.btn-icon');
  btns.forEach(btn => {
    const title = (btn.getAttribute('title') || '').toLowerCase();
    let svg = null;
    if (title.includes('退出') || title.includes('logout')) svg = ICONS.logout;
    else if (title.includes('帮助') || title.includes('help')) svg = ICONS.scroll;
    else if (title.includes('主题') || title.includes('theme')) svg = ICONS.inkstone;
    if (svg) {
      btn.innerHTML = svg;
      btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;color:var(--text2);width:28px;height:28px';
    }
  });
}

/* ── Phase 2: 导航栏 SVG 图标 ── */
function layoutNav() {
  const nav = document.querySelector('.tab-nav');
  if (!nav || nav.classList.contains('inkwash-done')) return;
  nav.classList.add('inkwash-done');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const tabId = btn.getAttribute('data-tab');
    if (!tabId) return;

    // 已有图标则跳过
    if (btn.querySelector('.inkwash-nav-icon')) return;

    const iconSVG = TAB_ICONS[tabId];
    if (iconSVG) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'inkwash-nav-icon';
      iconSpan.innerHTML = iconSVG;
      iconSpan.style.cssText = 'display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:4px;flex-shrink:0';
      btn.prepend(iconSpan);
    }
  });
}

/* ── Phase 3: 侧栏玉册 ── */
function layoutSidebar() {
  const sidebar = document.querySelector('.battle-sidebar');
  if (!sidebar || sidebar.classList.contains('inkwash-done')) return;
  sidebar.classList.add('inkwash-done');

  // 角色名竖排
  const nameEl = sidebar.querySelector('.sidebar-char-name');
  if (nameEl) nameEl.classList.add('inkwash-vertical-name');

  // 属性条转墨线填染
  sidebar.querySelectorAll('.exp-bar, .sr-bar, .bar-track').forEach(bar => {
    bar.classList.add('inkwash-bar-bg');
    const fill = bar.querySelector('.exp-fill, .sr-fill, .bar-fill');
    if (fill) fill.classList.add('inkwash-bar-fill');
  });
}

/* ── Phase 4: 战斗面板 ── */
function layoutBattle() {
  const panel = document.querySelector('.battle-status-panel');
  if (!panel || panel.classList.contains('inkwash-done')) return;
  panel.classList.add('inkwash-done');

  // 血条改墨染
  panel.querySelectorAll('.bar-track').forEach(bar => {
    bar.classList.add('inkwash-bar-bg');
    const fill = bar.querySelector('.bar-fill');
    if (fill) fill.classList.add('inkwash-bar-fill');
  });
}

/* ── Phase 5: 卡片 ── */
function layoutCards() {
  document.querySelectorAll('.stat-card, .skill-card, .map-card').forEach(card => {
    if (card.classList.contains('inkwash-done')) return;
    // 卡片朱砂左线 → 由 CSS ::before 处理
    card.classList.add('inkwash-card');
  });
}

/* ── Phase 6: Modal 弹窗 ── */
function layoutModals() {
  // CSS 已处理，确保 inkwash-done 标记
  document.querySelectorAll('.modal-panel, .modal-overlay').forEach(el => {
    if (el.classList.contains('inkwash-done')) return;
    el.classList.add('inkwash-done');
  });
}

/* ── 统一 layout 入口 ── */
function layout() {
  if (!_active) return;
  layoutHeader();
  layoutNav();
  layoutSidebar();
  layoutBattle();
  layoutCards();
  layoutModals();
}

/* ═══════════════════════════════════════
   背景装饰层（不受 Vue 影响）
   ═══════════════════════════════════════ */

const MOUNTAIN_SVG = `<svg viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="mg1" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:0.05"/><stop offset="60%" style="stop-color:#1a1a1a;stop-opacity:0.02"/><stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:0"/></linearGradient><linearGradient id="mg2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:0.04"/><stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:0"/></linearGradient><filter id="mb1"><feGaussianBlur stdDeviation="2"/></filter></defs><path d="M0,340 Q200,280 400,310 T800,270 T1200,300 T1440,280 L1440,420 L0,420 Z" fill="url(#mg1)" filter="url(#mb1)"/><path d="M0,370 Q240,320 480,345 T960,315 T1440,340 L1440,420 L0,420 Z" fill="url(#mg2)"/><path d="M-60,420 Q240,360 520,390 T1040,370 T1500,400 L1500,420 L-60,420 Z" fill="rgba(26,26,26,0.02)"/><path d="M620,420 Q640,240 670,210 Q700,240 720,420 Z" fill="rgba(26,26,26,0.025)"/><path d="M900,420 Q1000,320 1100,300 Q1200,320 1300,420 Z" fill="rgba(26,26,26,0.02)"/><path d="M0,400 Q360,390 720,400 T1440,395" stroke="rgba(26,26,26,0.03)" stroke-width="0.5" fill="none"/><path d="M0,408 Q360,398 720,408 T1440,403" stroke="rgba(26,26,26,0.025)" stroke-width="0.5" fill="none"/><path d="M0,415 Q360,405 720,415 T1440,410" stroke="rgba(26,26,26,0.02)" stroke-width="0.5" fill="none"/></svg>`;

const BIRDS_SVG = `<svg viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg"><path d="M20 15Q25 8 30 15Q35 8 40 15" stroke="#1a1a1a" stroke-width="0.8" fill="none" opacity="0.08"/><path d="M70 12Q74 6 78 12Q82 6 86 12" stroke="#1a1a1a" stroke-width="0.6" fill="none" opacity="0.06"/><path d="M50 18Q53 13 56 18Q59 13 62 18" stroke="#1a1a1a" stroke-width="0.5" fill="none" opacity="0.04"/></svg>`;

function createDecorations() {
  const wrap = document.createElement('div');
  wrap.id = 'inkwash-decor';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none';

  const layers = [
    { tag: 'div', cls: 'inkwash-paper' },
    { tag: 'div', cls: 'inkwash-noise' },
    { tag: 'div', cls: 'inkwash-landscape', html: MOUNTAIN_SVG },
    { tag: 'div', cls: 'inkwash-mist' },
    { tag: 'div', cls: 'inkwash-corner tr' },
    { tag: 'div', cls: 'inkwash-corner bl' },
    { tag: 'div', cls: 'inkwash-birds', html: BIRDS_SVG },
  ];
  for (const l of layers) {
    const el = document.createElement(l.tag);
    el.className = l.cls;
    if (l.html) el.innerHTML = l.html;
    wrap.appendChild(el);
  }

  const positions = [
    {w:5,t:'12%',l:'10%'},{w:3,t:'28%',r:'12%'},{w:7,b:'30%',l:'15%'},
    {w:4,t:'55%',r:'18%'},{w:6,b:'45%',r:'8%'},{w:2,t:'42%',l:'22%'},
    {w:5,b:'20%',r:'25%'},{w:3,t:'70%',l:'30%'}
  ];
  for (const p of positions) {
    const dot = document.createElement('div');
    dot.className = 'inkwash-splash';
    dot.style.cssText = `width:${p.w}px;height:${p.w}px;top:${p.top||'auto'};bottom:${p.bottom||'auto'};left:${p.left||'auto'};right:${p.right||'auto'}`;
    wrap.appendChild(dot);
  }
  return wrap;
}

/* ═══════════════════════════════════════
   MutationObserver — 抵抗 Vue 重渲染
   ═══════════════════════════════════════ */
function startObserver() {
  if (_observer && _observerTarget && document.body.contains(_observerTarget)) return;
  stopObserver();
  _observerTarget = document.body;
  let timer = null;
  _observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (_active && document.querySelector('.view-game')) layout();
    }, 100);
  });
  _observer.observe(_observerTarget, { childList: true, subtree: true, attributes: false });
}

function stopObserver() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
  // 清理 inkwash-done 标记（移除装饰类以便下次重新应用）
  document.querySelectorAll('.inkwash-done').forEach(el => el.classList.remove('inkwash-done'));
}

/* ═══════════════════════════════════════
   导出接口
   ═══════════════════════════════════════ */

export function applyInkWash() {
  if (_active) return;
  _active = true;

  // 1. 装饰层
  if (!document.getElementById('inkwash-decor')) {
    const decor = createDecorations();
    document.body.prepend(decor);
  }

  // 2. 立即执行 layout
  layout();

  // 3. 启动 observer 抵御 Vue 重渲染
  startObserver();
}

export function removeInkWash() {
  _active = false;
  stopObserver();

  const decor = document.getElementById('inkwash-decor');
  if (decor) decor.remove();
}

export function toggleInkWash(enable) {
  if (enable) {
    document.documentElement.classList.add(INKWASH_CLASS);
    applyInkWash();
  } else {
    document.documentElement.classList.remove(INKWASH_CLASS);
    removeInkWash();
  }
}
