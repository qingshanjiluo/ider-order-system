/* ═══════════════════════════════════════
   极简 · MINIMAL LAYOUT
   减法优先，无一冗余
   ═══════════════════════════════════════ */

const MINIMAL_CLASS = 'theme-minimal';
let _active = false;
let _observer = null;
let _observerTarget = null;

/* ── 极简 SVG 图标（纯几何，1px 等粗线） ── */
const ICONS = {
  mountain: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M1 14l4-8 3 5 4-7 3 10"/></svg>`,
  sword: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M13 3L8 8M8 8l-2 2M8 8l2 2"/><path d="M14 2l-6 6"/></svg>`,
  pouch: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="6" width="8" height="9" rx="1"/><path d="M6 6V4a2 2 0 014 0v2"/></svg>`,
  bamboo: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><line x1="4" y1="2" x2="4" y2="14"/><line x1="12" y1="2" x2="12" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="5" x2="14" y2="5"/><line x1="2" y1="11" x2="14" y2="11"/></svg>`,
  talisman: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M5 3l-3 10h12L11 3"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>`,
  inkstone: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="10" width="8" height="4" rx="0.5"/><path d="M6 3l1 7M10 3l-1 7"/></svg>`,
  heart: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M8 13l-4-4a3 3 0 014-4l0 0a3 3 0 014 4l-4 4z"/></svg>`,
  scroll: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M3 13.5A1.5 1.5 0 014.5 12H13"/><path d="M4.5 2H13v12H4.5A1.5 1.5 0 013 12.5v-9A1.5 1.5 0 014.5 2z"/><line x1="6" y1="5" x2="10" y2="5"/><line x1="6" y1="8" x2="9" y2="8"/></svg>`,
  logout: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3"/><polyline points="11 11 14 8 11 5"/><line x1="14" y1="8" x2="6" y2="8"/></svg>`,
  help: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><circle cx="8" cy="8" r="6"/><path d="M6 6a2 2 0 014 0c0 1.5-2 2-2 3"/><circle cx="8" cy="12.5" r="0.5" fill="currentColor"/></svg>`,
  theme: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5"/></svg>`,
  refresh: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><path d="M13 3.5l2 2-2 2"/><path d="M3 9.5A5 5 0 0113 7l2 2"/><path d="M3 12.5l-2-2 2-2"/><path d="M13 6.5a5 5 0 01-10 2l-2-2"/></svg>`,
};

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
   Layout — 极简化 DOM 改造
   ═══════════════════════════════════════ */

/* ── Phase 1: Header 剥离冗余 ── */
function layoutHeader() {
  const header = document.querySelector('.game-header');
  if (!header || header.classList.contains('minimal-done')) return;
  header.classList.add('minimal-done');

  // 替换所有 btn-icon 为极简几何 SVG
  const btns = header.querySelectorAll('.btn-icon');
  btns.forEach(btn => {
    const title = (btn.getAttribute('title') || '').toLowerCase();
    let svg = null;
    if (title.includes('退出') || title.includes('logout')) svg = ICONS.logout;
    else if (title.includes('帮助') || title.includes('help')) svg = ICONS.help;
    else if (title.includes('主题') || title.includes('theme')) svg = ICONS.theme;
    else if (title.includes('刷新') || title.includes('refresh')) svg = ICONS.refresh;
    if (svg) {
      btn.innerHTML = svg;
      btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:3px;color:var(--min-text2);width:24px;height:24px';
    }
  });
}

/* ── Phase 2: 导航 SVG 图标 ── */
function layoutNav() {
  const nav = document.querySelector('.tab-nav');
  if (!nav || nav.classList.contains('minimal-done')) return;
  nav.classList.add('minimal-done');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const tabId = btn.getAttribute('data-tab');
    if (!tabId || btn.querySelector('.minimal-nav-icon')) return;
    const iconSVG = TAB_ICONS[tabId];
    if (iconSVG) {
      const s = document.createElement('span');
      s.className = 'minimal-nav-icon';
      s.innerHTML = iconSVG;
      btn.prepend(s);
    }
  });
}

/* ── Phase 3: 侧栏极简清空 ── */
function layoutSidebar() {
  const sidebar = document.querySelector('.battle-sidebar');
  if (!sidebar || sidebar.classList.contains('minimal-done')) return;
  sidebar.classList.add('minimal-done');

  // 极简名字（仅保留文字，无装饰）
  const nameEl = sidebar.querySelector('.sidebar-char-name');
  if (nameEl) {
    nameEl.style.fontWeight = '300';
    nameEl.style.letterSpacing = '-0.02em';
  }

  // 血条极细处理
  sidebar.querySelectorAll('.exp-bar, .sr-bar, .bar-track').forEach(bar => {
    bar.style.cssText = 'height:2px;background:var(--min-bar);border-radius:0;overflow:hidden;border:none;margin:4px 0';
    const fill = bar.querySelector('.exp-fill, .sr-fill, .bar-fill');
    if (fill) {
      fill.style.cssText = 'height:100%;border-radius:0;background:var(--min-bar-fill)';
    }
  });
}

/* ── Phase 4: 战斗面板条 ── */
function layoutBattle() {
  const panel = document.querySelector('.battle-status-panel');
  if (!panel || panel.classList.contains('minimal-done')) return;
  panel.classList.add('minimal-done');

  panel.querySelectorAll('.bar-track').forEach(bar => {
    bar.style.cssText = 'height:2px;background:var(--min-bar);border-radius:0;overflow:hidden;border:none;margin:4px 0';
    const fill = bar.querySelector('.bar-fill');
    if (fill) fill.style.cssText = 'height:100%;border-radius:0;background:var(--min-bar-fill)';
  });
}

/* ── Phase 5: 卡片 ── */
function layoutCards() {
  document.querySelectorAll('.stat-card, .skill-card, .map-card').forEach(card => {
    if (card.classList.contains('minimal-done')) return;
    card.classList.add('minimal-done');
  });
}

/* ── Phase 6: 弹窗 ── */
function layoutModals() {
  document.querySelectorAll('.modal-panel, .modal-overlay').forEach(el => {
    if (el.classList.contains('minimal-done')) return;
    el.classList.add('minimal-done');
  });
}

/* ── 统一入口 ── */
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
   Observer
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
  if (_observer) { _observer.disconnect(); _observer = null; _observerTarget = null; }
  document.querySelectorAll('.minimal-done').forEach(el => el.classList.remove('minimal-done'));
}

/* ═══════════════════════════════════════
   导出
   ═══════════════════════════════════════ */

export function applyMinimal() {
  if (_active) return;
  _active = true;
  layout();
  startObserver();
}

export function removeMinimal() {
  _active = false;
  stopObserver();
}

export function toggleMinimal(enable) {
  if (enable) {
    document.documentElement.classList.add(MINIMAL_CLASS);
    applyMinimal();
  } else {
    document.documentElement.classList.remove(MINIMAL_CLASS);
    removeMinimal();
  }
}
