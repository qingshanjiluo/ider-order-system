/* ═══════════════════════════════════════
   粗野主义 · BRUTAL LAYOUT
   裸露结构，拒绝修饰
   ═══════════════════════════════════════ */

const BRUTAL_CLASS = 'theme-brutal';
let _active = false;
let _observer = null;
let _observerTarget = null;

/* ── SVG 图标（粗犷 2px 线） ── */
const ICONS = {
  mountain: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M2 17l5-10 4 6 5-8 4 12"/></svg>`,
  sword: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M14 4L8 10"/><path d="M10 10L7 7"/><path d="M17 3l-5 5"/></svg>`,
  pouch: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="7" width="10" height="11" rx="0"/><path d="M7 7V4a3 3 0 016 0v3"/></svg>`,
  bamboo: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><line x1="4" y1="2" x2="4" y2="18"/><line x1="16" y1="2" x2="16" y2="18"/><line x1="2" y1="8" x2="18" y2="8"/><line x1="2" y1="13" x2="18" y2="13"/></svg>`,
  talisman: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l-4 12h16L14 4"/><rect x="9" y="8" width="2" height="2" fill="currentColor"/></svg>`,
  inkstone: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="12" width="10" height="5" rx="0"/><path d="M7 4l2 8M13 4l-2 8"/></svg>`,
  heart: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 17l-6-6a4 4 0 016-6 4 4 0 016 6l-6 6z"/></svg>`,
  scroll: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16.5A1.5 1.5 0 015.5 15H16"/><path d="M5.5 3H16v14H5.5A1.5 1.5 0 014 15.5v-11A1.5 1.5 0 015.5 3z"/></svg>`,
  logout: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3"/><polyline points="13 14 17 10 13 6"/><line x1="17" y1="10" x2="8" y2="10"/></svg>`,
  help: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7"/><path d="M7.5 7.5a2.5 2.5 0 015 0c0 2-2.5 2.5-2.5 3.5"/><rect x="9.5" y="14" width="1" height="1" fill="currentColor"/></svg>`,
  theme: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.5 1.5M14 14l1.5 1.5M4.5 15.5L6 14M14 6l1.5-1.5"/></svg>`,
  refresh: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M15 3l3 3-3 3"/><path d="M3 13a7 7 0 0112-9l4 4"/><path d="M5 17l-3-3 3-3"/><path d="M17 7a7 7 0 01-12 9l-4-4"/></svg>`,
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
   Layout
   ═══════════════════════════════════════ */

function layoutHeader() {
  const header = document.querySelector('.game-header');
  if (!header || header.classList.contains('brutal-done')) return;
  header.classList.add('brutal-done');

  const nameEl = header.querySelector('.hdr-name');
  if (nameEl) {
    nameEl.style.fontFamily = "'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif";
    nameEl.style.textTransform = 'uppercase';
    nameEl.style.letterSpacing = '0.05em';
  }

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
      btn.style.cssText = 'background:none;border:2px solid transparent;cursor:pointer;padding:4px;color:#888;width:28px;height:28px';
    }
  });
}

function layoutNav() {
  const nav = document.querySelector('.tab-nav');
  if (!nav || nav.classList.contains('brutal-done')) return;
  nav.classList.add('brutal-done');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const tabId = btn.getAttribute('data-tab');
    if (!tabId || btn.querySelector('.brutal-nav-icon')) return;
    const iconSVG = TAB_ICONS[tabId];
    if (iconSVG) {
      const s = document.createElement('span');
      s.className = 'brutal-nav-icon';
      s.innerHTML = iconSVG;
      btn.prepend(s);
    }
  });
}

function layoutSidebar() {
  const sidebar = document.querySelector('.battle-sidebar');
  if (!sidebar || sidebar.classList.contains('brutal-done')) return;
  sidebar.classList.add('brutal-done');

  const nameEl = sidebar.querySelector('.sidebar-char-name');
  if (nameEl) {
    nameEl.style.fontFamily = "'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif";
    nameEl.style.textTransform = 'uppercase';
    nameEl.style.fontSize = '1.2rem';
    nameEl.style.letterSpacing = '0.04em';
  }

  sidebar.querySelectorAll('.exp-bar, .sr-bar, .bar-track').forEach(bar => {
    bar.style.cssText = 'height:6px;background:var(--brutal-bar);border-radius:0;overflow:hidden;border:none;margin:8px 0';
    const fill = bar.querySelector('.exp-fill, .sr-fill, .bar-fill');
    if (fill) fill.style.cssText = 'height:100%;background:var(--brutal-bar-fill);border-radius:0';
  });
}

function layoutBattle() {
  const panel = document.querySelector('.battle-status-panel');
  if (!panel || panel.classList.contains('brutal-done')) return;
  panel.classList.add('brutal-done');

  panel.querySelectorAll('.bar-track').forEach(bar => {
    bar.style.cssText = 'height:6px;background:var(--brutal-bar);border-radius:0;overflow:hidden;border:none;margin:8px 0';
    const fill = bar.querySelector('.bar-fill');
    if (fill) fill.style.cssText = 'height:100%;background:var(--brutal-bar-fill);border-radius:0';
  });
}

function layoutCards() {
  document.querySelectorAll('.stat-card, .skill-card, .map-card').forEach(card => {
    if (card.classList.contains('brutal-done')) return;
    card.classList.add('brutal-done');
  });
}

function layoutModals() {
  document.querySelectorAll('.modal-panel, .modal-overlay').forEach(el => {
    if (el.classList.contains('brutal-done')) return;
    el.classList.add('brutal-done');
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
  document.querySelectorAll('.brutal-done').forEach(el => el.classList.remove('brutal-done'));
}

/* ═══════════════════════════════════════
   导出
   ═══════════════════════════════════════ */

export function applyBrutal() {
  if (_active) return;
  _active = true;
  layout();
  startObserver();
}

export function removeBrutal() {
  _active = false;
  stopObserver();
}

export function toggleBrutal(enable) {
  if (enable) {
    document.documentElement.classList.add(BRUTAL_CLASS);
    applyBrutal();
  } else {
    document.documentElement.classList.remove(BRUTAL_CLASS);
    removeBrutal();
  }
}
