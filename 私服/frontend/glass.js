/* ═══════════════════════════════════════
   玻璃态 · GLASS LAYOUT
   毛玻璃质感 + 聚光灯跟随
   ═══════════════════════════════════════ */

const GLASS_CLASS = 'theme-glass';
let _active = false;
let _observer = null;
let _observerTarget = null;

/* ── SVG 图标（极细几何感） ── */
const ICONS = {
  mountain: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M2 16l4-7 3 5 4-8 5 10"/></svg>`,
  sword: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M15 5L9 11M11 9l-2 2"/><path d="M17 3l-6 6"/></svg>`,
  pouch: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><rect x="5" y="7" width="10" height="11" rx="1.5"/><path d="M7 7V4.5a3 3 0 016 0V7"/><circle cx="10" cy="14" r="1.5"/></svg>`,
  bamboo: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><line x1="5" y1="2" x2="5" y2="18"/><line x1="15" y1="2" x2="15" y2="18"/><line x1="3" y1="8" x2="17" y2="8"/><line x1="3" y1="12" x2="17" y2="12"/></svg>`,
  talisman: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M7 4l-4 12h14L13 4"/><circle cx="10" cy="9" r="1" fill="currentColor" opacity="0.4"/></svg>`,
  inkstone: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8"><rect x="5" y="12" width="10" height="5" rx="1"/><path d="M7 4l2 8M13 4l-2 8"/></svg>`,
  heart: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M10 16l-5-5a3.5 3.5 0 015-5 3.5 3.5 0 015 5l-5 5z"/></svg>`,
  scroll: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M4 16.5A1.5 1.5 0 015.5 15H16"/><path d="M5.5 3H16v14H5.5A1.5 1.5 0 014 15.5v-11A1.5 1.5 0 015.5 3z"/><line x1="7" y1="6" x2="13" y2="6"/><line x1="7" y1="9" x2="11" y2="9"/></svg>`,
  logout: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3"/><polyline points="14 14 18 10 14 6"/><line x1="18" y1="10" x2="8" y2="10"/></svg>`,
  help: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8"><circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 014 0c0 1.5-2 2-2 3"/><circle cx="10" cy="14" r="0.5" fill="currentColor"/></svg>`,
  theme: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"/></svg>`,
  refresh: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M14 3l3 3-3 3"/><path d="M3 13a6 6 0 0110-8l4 4"/><path d="M6 17l-3-3 3-3"/><path d="M17 7a6 6 0 01-10 8l-4-4"/></svg>`,
  map: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M3 17V3l5 2 4-2 5 2v14l-5-2-4 2-5-2z"/><line x1="8" y1="5" x2="8" y2="15"/><line x1="12" y1="3" x2="12" y2="13"/></svg>`,
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
   Layout — DOM 改造
   ═══════════════════════════════════════ */

/* ── Phase 1: Header 玻璃顶线 + 分隔 + 图标 ── */
function layoutHeader() {
  const header = document.querySelector('.game-header');
  if (!header || header.classList.contains('glass-done')) return;
  header.classList.add('glass-done');

  // 1. 玻璃发光顶线
  if (!header.querySelector('.glass-header-glow')) {
    const glow = document.createElement('div');
    glow.className = 'glass-header-glow';
    glow.style.cssText = 'position:absolute;top:0;left:8%;right:8%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2) 30%,rgba(255,255,255,0.2) 70%,transparent);pointer-events:none';
    header.appendChild(glow);
  }

  // 2. 信息区与资源区之间插入玻璃分隔
  const info = header.querySelector('.hdr-info');
  const res = header.querySelector('.hdr-res');
  if (info && res && !header.querySelector('.glass-hdr-divider')) {
    const div = document.createElement('span');
    div.className = 'glass-hdr-divider';
    div.style.cssText = 'width:1px;height:14px;background:rgba(255,255,255,0.08);flex-shrink:0;display:inline-block';
    header.insertBefore(div, res);
  }

  // 3. 替换所有 btn-icon 为玻璃风格 SVG
  const btns = header.querySelectorAll('.btn-icon');
  btns.forEach(btn => {
    const title = (btn.getAttribute('title') || '').toLowerCase();
    let svg = null;
    if (title.includes('退出') || title.includes('logout')) svg = ICONS.logout;
    else if (title.includes('帮助') || title.includes('help')) svg = ICONS.help;
    else if (title.includes('主题') || title.includes('theme')) svg = ICONS.theme;
    else if (title.includes('刷新') || title.includes('refresh')) svg = ICONS.refresh;
    else if (title.includes('地图') || title.includes('map')) svg = ICONS.map;
    if (svg) {
      btn.innerHTML = svg;
      btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:5px;color:rgba(255,255,255,0.4);width:30px;height:30px;border-radius:10px;transition:all 0.3s';
    }
  });
}

/* ── Phase 2: 导航栏 SVG 图标注入 ── */
function layoutNav() {
  const nav = document.querySelector('.tab-nav');
  if (!nav || nav.classList.contains('glass-done')) return;
  nav.classList.add('glass-done');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const tabId = btn.getAttribute('data-tab');
    if (!tabId || btn.querySelector('.glass-nav-icon')) return;
    const iconSVG = TAB_ICONS[tabId];
    if (iconSVG) {
      const s = document.createElement('span');
      s.className = 'glass-nav-icon';
      s.innerHTML = iconSVG;
      btn.prepend(s);
    }
  });
}

/* ── Phase 3: 侧栏玻璃化 ── */
function layoutSidebar() {
  const sidebar = document.querySelector('.battle-sidebar');
  if (!sidebar || sidebar.classList.contains('glass-done')) return;
  sidebar.classList.add('glass-done');

  // 1. 角色名发光
  const nameEl = sidebar.querySelector('.sidebar-char-name');
  if (nameEl) {
    nameEl.style.textShadow = '0 0 20px rgba(255,255,255,0.08)';
    nameEl.style.fontWeight = '300';
  }

  // 2. 血条/修为条玻璃化
  sidebar.querySelectorAll('.exp-bar, .sr-bar, .bar-track').forEach(bar => {
    bar.style.cssText = 'height:4px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;border:none;margin:6px 0';
    const fill = bar.querySelector('.exp-fill, .sr-fill, .bar-fill');
    if (fill) {
      fill.style.cssText = 'height:100%;border-radius:4px;transition:width 0.5s ease';
      fill.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.6))';
    }
  });
}

/* ── Phase 4: 战斗面板 ── */
function layoutBattle() {
  const panel = document.querySelector('.battle-status-panel');
  if (!panel || panel.classList.contains('glass-done')) return;
  panel.classList.add('glass-done');

  panel.querySelectorAll('.bar-track').forEach(bar => {
    bar.style.cssText = 'height:4px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;border:none;margin:6px 0';
    const fill = bar.querySelector('.bar-fill');
    if (fill) {
      fill.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.6))';
      fill.style.borderRadius = '4px';
    }
  });
}

/* ── Phase 5: 卡片 ── */
function layoutCards() {
  document.querySelectorAll('.stat-card, .skill-card, .map-card').forEach(card => {
    if (card.classList.contains('glass-done')) return;
    card.classList.add('glass-done');
    // 每张卡片注入高光伪元素的前置标识
    card.style.position = 'relative';
  });
}

/* ── Phase 6: 弹窗 ── */
function layoutModals() {
  document.querySelectorAll('.modal-panel, .modal-overlay').forEach(el => {
    if (el.classList.contains('glass-done')) return;
    el.classList.add('glass-done');
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
   装饰层（光晕 + 噪点 + 聚光灯）
   ═══════════════════════════════════════ */

let _spotlightEl = null;

function createDecorations() {
  const wrap = document.createElement('div');
  wrap.id = 'glass-decor';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:#020617';

  const orbs = [
    { cls: 'glass-orb orb-1' },
    { cls: 'glass-orb orb-2' },
    { cls: 'glass-orb orb-3' },
  ];
  for (const o of orbs) {
    const el = document.createElement('div');
    el.className = o.cls;
    wrap.appendChild(el);
  }
  return wrap;
}

function createGrain() {
  const g = document.createElement('div');
  g.className = 'glass-grain';
  return g;
}

function createSpotlight() {
  const s = document.createElement('div');
  s.className = 'glass-spotlight';
  return s;
}

function startSpotlight() {
  if (_spotlightEl) return;
  _spotlightEl = document.querySelector('.glass-spotlight') || createSpotlight();
  if (!_spotlightEl.parentNode) document.body.appendChild(_spotlightEl);

  function onMove(e) {
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    _spotlightEl.style.setProperty('--mx', x + '%');
    _spotlightEl.style.setProperty('--my', y + '%');
  }

  _spotlightEl._listener = onMove;
  document.addEventListener('mousemove', onMove);

  if ('ontouchstart' in window) {
    _spotlightEl.style.display = 'none';
  }
}

function stopSpotlight() {
  if (_spotlightEl) {
    if (_spotlightEl._listener) {
      document.removeEventListener('mousemove', _spotlightEl._listener);
    }
    _spotlightEl.remove();
    _spotlightEl = null;
  }
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
  document.querySelectorAll('.glass-done').forEach(el => el.classList.remove('glass-done'));
}

/* ═══════════════════════════════════════
   导出
   ═══════════════════════════════════════ */

export function applyGlass() {
  if (_active) return;
  _active = true;

  if (!document.getElementById('glass-decor')) {
    const decor = createDecorations();
    document.body.prepend(decor);
  }
  if (!document.querySelector('.glass-grain')) {
    document.body.appendChild(createGrain());
  }
  startSpotlight();

  layout();
  startObserver();
}

export function removeGlass() {
  _active = false;
  stopObserver();
  stopSpotlight();

  const decor = document.getElementById('glass-decor');
  if (decor) decor.remove();
  const grain = document.querySelector('.glass-grain');
  if (grain) grain.remove();
}

export function toggleGlass(enable) {
  if (enable) {
    document.documentElement.classList.add(GLASS_CLASS);
    applyGlass();
  } else {
    document.documentElement.classList.remove(GLASS_CLASS);
    removeGlass();
  }
}
