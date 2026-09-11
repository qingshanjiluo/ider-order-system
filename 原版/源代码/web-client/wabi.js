/* ═══════════════════════════════════════
   侘寂 · WABI-SABI LAYOUT
   一期一会，世当珍惜
   ═══════════════════════════════════════ */

const WABI_CLASS = 'theme-wabi';
let _active = false;
let _observer = null;
let _observerTarget = null;

/* ── SVG 图标库 ── */
const ICONS = {
  mountain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M4 16l4-8 3 6 4-6 3 4 6-8"/><path d="M2 20h20"/></svg>`,
  sword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M12 2L2 12l3 3 7-7 7 7 3-3-10-10z"/><path d="M8 8l8 8"/><path d="M5 15l-3 3 4 4 3-3"/></svg>`,
  pouch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="6" y="8" width="12" height="14" rx="2"/><path d="M8 8V5a4 4 0 018 0v3"/><line x1="12" y1="14" x2="12" y2="17"/></svg>`,
  bamboo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M6 3v18"/><path d="M18 3v18"/><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>`,
  talisman: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 4l-4 16h12l4-16"/><circle cx="9.5" cy="10" r="1.5" fill="currentColor" opacity="0.3"/></svg>`,
  inkstone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="6" y="14" width="12" height="6" rx="1"/><path d="M9 4l2 10M15 4l-2 10"/><line x1="4" y1="14" x2="20" y2="14"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M12 20l-7-7a4.5 4.5 0 016-6l1 1 1-1a4.5 4.5 0 016 6l-7 7z"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 2-2.5 2.5-2.5 3.5"/><circle cx="12" cy="16" r="0.8" fill="currentColor"/></svg>`,
  theme: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M17 4l3 3-3 3"/><path d="M4 15a7 7 0 0112-9l4 4"/><path d="M7 20l-3-3 3-3"/><path d="M20 9a7 7 0 01-12 9l-4-4"/></svg>`,
};

const TAB_ICONS = {
  announcement: ICONS.bamboo,
  character: ICONS.heart,
  inventory: ICONS.pouch,
  equipment: ICONS.sword,
  skills: ICONS.bamboo,
  techniques: ICONS.bamboo,
  map: ICONS.mountain,
  mail: ICONS.bamboo,
  chat: ICONS.bamboo,
  baiyi: ICONS.talisman,
  cave: ICONS.mountain,
  forge: ICONS.talisman,
  sect: ICONS.mountain,
  alliance: ICONS.mountain,
  duel: ICONS.sword,
  league: ICONS.sword,
  dungeon: ICONS.mountain,
  exchange: ICONS.pouch,
  help: ICONS.bamboo,
  settings: ICONS.inkstone,
};

/* ═══════════════════════════════════════
   Layout
   ═══════════════════════════════════════ */

function layoutHeader() {
  const header = document.querySelector('.game-header');
  if (!header || header.classList.contains('wabi-done')) return;
  header.classList.add('wabi-done');

  if (!header.querySelector('.wabi-header-line')) {
    const line = document.createElement('div');
    line.className = 'wabi-header-line';
    header.prepend(line);
  }

  const nameEl = header.querySelector('.hdr-name');
  if (nameEl) nameEl.style.fontWeight = '600';

  const info = header.querySelector('.hdr-info');
  const res = header.querySelector('.hdr-res');
  if (info && !header.querySelector('.wabi-divider')) {
    const div = document.createElement('div');
    div.className = 'wabi-divider';
    if (res) header.insertBefore(div, res);
    else header.appendChild(div);
  }

  const logoutBtn = header.querySelector('.btn-icon[title*="退出"]');
  if (logoutBtn) {
    logoutBtn.innerHTML = ICONS.sword;
    logoutBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;color:var(--ink-fade);width:28px;height:28px';
  }

  // 替换其他 btn-icon
  const btns = header.querySelectorAll('.btn-icon');
  btns.forEach(btn => {
    const title = (btn.getAttribute('title') || '').toLowerCase();
    let svg = null;
    if (title.includes('帮助') || title.includes('help')) svg = ICONS.bamboo;
    else if (title.includes('主题') || title.includes('theme')) svg = ICONS.inkstone;
    else if (title.includes('刷新') || title.includes('refresh')) svg = ICONS.bamboo;
    if (svg && btn !== logoutBtn) {
      btn.innerHTML = svg;
      btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;color:var(--ink-fade);width:28px;height:28px';
    }
  });
}

function layoutNav() {
  const nav = document.querySelector('.tab-nav');
  if (!nav || nav.classList.contains('wabi-done')) return;
  nav.classList.add('wabi-done');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const tabId = btn.getAttribute('data-tab');
    if (!tabId || btn.querySelector('.wabi-nav-icon')) return;

    const iconSVG = TAB_ICONS[tabId];
    if (iconSVG) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'wabi-nav-icon';
      iconSpan.innerHTML = iconSVG;
      iconSpan.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:3px;flex-shrink:0';
      btn.prepend(iconSpan);
    }
  });
}

function layoutSidebar() {
  const sidebar = document.querySelector('.battle-sidebar');
  if (!sidebar || sidebar.classList.contains('wabi-done')) return;
  sidebar.classList.add('wabi-done');

  const nameEl = sidebar.querySelector('.sidebar-char-name');
  if (nameEl) {
    nameEl.style.writingMode = 'vertical-rl';
    nameEl.style.textOrientation = 'upright';
    nameEl.style.fontSize = '1rem';
  }

  sidebar.querySelectorAll('.exp-bar, .sr-bar, .bar-track').forEach(bar => {
    bar.style.background = 'var(--line)';
    bar.style.height = '4px';
    bar.style.borderRadius = '0';
  });
}

function layoutBattle() {
  const panel = document.querySelector('.battle-status-panel');
  if (!panel || panel.classList.contains('wabi-done')) return;
  panel.classList.add('wabi-done');

  panel.querySelectorAll('.bar-track').forEach(bar => {
    bar.style.background = 'var(--line)';
    bar.style.height = '4px';
    bar.style.borderRadius = '0';
  });
}

function layoutCards() {
  document.querySelectorAll('.stat-card, .skill-card, .map-card').forEach(card => {
    if (card.classList.contains('wabi-done')) return;
    card.classList.add('wabi-done');
  });
}

function layoutModals() {
  document.querySelectorAll('.modal-panel, .modal-overlay').forEach(el => {
    if (el.classList.contains('wabi-done')) return;
    el.classList.add('wabi-done');
  });
}

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
   装饰层
   ═══════════════════════════════════════ */

function createDecorations() {
  const wrap = document.createElement('div');
  wrap.id = 'wabi-decor';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none';

  // 和纸纹理
  const paper = document.createElement('div');
  paper.className = 'wabi-paper';
  wrap.appendChild(paper);

  // 墨点散落 (3个)
  const splats = [
    {w:160,h:160,t:'15%',r:'8%',bg:'radial-gradient(circle, rgba(44,44,44,0.06) 0%, transparent 70%)'},
    {w:100,h:120,t:'45%',l:'5%',bg:'radial-gradient(ellipse, rgba(44,44,44,0.04) 0%, transparent 70%)'},
    {w:80,h:80,b:'20%',r:'12%',bg:'radial-gradient(circle, rgba(44,44,44,0.05) 0%, transparent 70%)'},
  ];
  for (const s of splats) {
    const dot = document.createElement('div');
    dot.className = 'wabi-splash';
    dot.style.cssText = `width:${s.w}px;height:${s.h}px;top:${s.top||'auto'};bottom:${s.bottom||'auto'};left:${s.left||'auto'};right:${s.right||'auto'};background:${s.bg}`;
    wrap.appendChild(dot);
  }

  // 圆环装饰 (2个)
  const circles = [
    {size:200,t:'20%',l:'70%'},
    {size:120,t:'60%',l:'15%'},
  ];
  for (const c of circles) {
    const circle = document.createElement('div');
    circle.className = 'wabi-circle-motif';
    circle.style.cssText = `width:${c.size}px;height:${c.size}px;top:${c.top};left:${c.left};opacity:0.25`;
    wrap.appendChild(circle);
  }

  return wrap;
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
  if (_observer) { _observer.disconnect(); _observer = null; }
  document.querySelectorAll('.wabi-done').forEach(el => el.classList.remove('wabi-done'));
}

/* ═══════════════════════════════════════
   导出
   ═══════════════════════════════════════ */

export function applyWabi() {
  if (_active) return;
  _active = true;

  if (!document.getElementById('wabi-decor')) {
    const decor = createDecorations();
    document.body.prepend(decor);
  }
  layout();
  startObserver();
}

export function removeWabi() {
  _active = false;
  stopObserver();
  const decor = document.getElementById('wabi-decor');
  if (decor) decor.remove();
}

export function toggleWabi(enable) {
  if (enable) {
    document.documentElement.classList.add(WABI_CLASS);
    applyWabi();
  } else {
    document.documentElement.classList.remove(WABI_CLASS);
    removeWabi();
  }
}
