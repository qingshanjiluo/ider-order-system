// sidebar.js — 侧边栏导航组件

import { store } from '../store.js';
import { icon } from '../icons.js';

const NAV_ITEMS = [
  { section: '概览', items: [
    { id: 'dashboard', label: '控制台', icon: 'diamond', hash: '#/dashboard' },
    { id: 'orders', label: '我的工单', icon: 'diamondSolid', hash: '#/orders' },
    { id: 'accounts', label: '我的账号', icon: 'diamondOutline', hash: '#/accounts' },
  ]},
  { section: '社交', items: [
    { id: 'invite', label: '邀请返利', icon: 'star', hash: '#/invite' },
    { id: 'leaderboard', label: '排行榜', icon: 'triangle', hash: '#/leaderboard' },
    { id: 'chat', label: '修仙聊天室', icon: 'star', hash: '#/chat' },
  ]},
  { section: '坊市', items: [
    { id: 'market', label: '修仙坊市', icon: 'star', hash: '#/market' },
    { id: 'recharge', label: '修仙币充值', icon: 'diamondSolid', hash: '#/recharge' },
  ]},
  { section: '支持', items: [
    { id: 'appeals', label: '申诉中心', icon: 'circle', hash: '#/appeals' },
    { id: 'after-sales', label: '售后服务', icon: 'diamondOutline', hash: '#/after-sales' },
    { id: 'help', label: '帮助文档', icon: 'question', hash: '#/help' },
    { id: 'contact', label: '联系站长', icon: 'mail', hash: '#/contact' },
    { id: 'changelog', label: '更新日志', icon: 'star', hash: '#/changelog' },
  ]},
];

export function getAdminItems() {
  const user = store.getUser();
  const role = user?.role || (user?.is_admin ? 'admin' : 'user');
  const isSuper = role === 'super_admin';

  const items = [
    { section: '管理', items: [
      { id: 'admin-stats', label: '数据统计', icon: 'diamond', hash: '#/admin/stats' },
      { id: 'admin-users', label: '用户管理', icon: 'diamondSolid', hash: '#/admin/users' },
      { id: 'admin-orders', label: '工单管理', icon: 'diamondOutline', hash: '#/admin/orders' },
      { id: 'admin-accounts', label: '账号管理', icon: 'star', hash: '#/admin/accounts' },
      { id: 'admin-appeals', label: '申诉管理', icon: 'circle', hash: '#/admin/appeals' },
      { id: 'admin-config', label: '系统配置', icon: 'gear', hash: '#/admin/config' },
      { id: 'admin-coupons', label: '优惠券', icon: 'square', hash: '#/admin/coupons' },
      { id: 'admin-market', label: '商品管理', icon: 'star', hash: '#/admin/market' },
      { id: 'admin-market-orders', label: '黑市订单', icon: 'diamondOutline', hash: '#/admin/market-orders' },
      { id: 'admin-market-purchases', label: '商城审核', icon: 'star', hash: '#/admin/market-purchases' },
      { id: 'admin-recharge', label: '充值审核', icon: 'diamondSolid', hash: '#/admin/recharge' },
      { id: 'admin-recharge-codes', label: '兑换码管理', icon: 'star', hash: '#/admin/recharge-codes' },
      { id: 'admin-ai-config', label: 'AI 设置', icon: 'robot', hash: '#/admin/ai-config' },
      { id: 'admin-announcements', label: '公告管理', icon: 'triangleUp', hash: '#/admin/announcements' },
      { id: 'admin-ads', label: '广告管理', icon: 'arrowRight', hash: '#/admin/ads' },
    ]},
  ];

  // 超管额外显示超管工具
  if (isSuper) {
    items[0].items.push({ id: 'admin-super', label: '超管工具', icon: 'starFilled', hash: '#/admin/super' });
  }

  return items;
}

export function renderSidebar() {
  const user = store.getUser();
  const role = user?.role || (user?.is_admin ? 'admin' : 'user');
  const isAdmin = role === 'admin' || role === 'super_admin';
  const adminItems = isAdmin ? getAdminItems() : [];
  const allItems = isAdmin ? [...NAV_ITEMS, ...adminItems] : NAV_ITEMS;
  // 从 localStorage 恢复展开状态
  let expandedSections;
  try { expandedSections = JSON.parse(localStorage.getItem('ider_sidebar_expanded') || '{}'); } catch { expandedSections = {}; }

  const sections = allItems.map((s, si) => {
    const sectionKey = `section_${si}`;
    const isExpanded = expandedSections[sectionKey] !== false;
    return `
    <div class="sidebar-section-trigger" data-section="${sectionKey}" role="button" tabindex="0" aria-expanded="${isExpanded}">
      <span class="sidebar-section-arrow">${isExpanded ? '▾' : '▸'}</span>
      <span>${s.section}</span>
    </div>
    <div class="sidebar-items" data-section="${sectionKey}" style="display:${isExpanded ? 'block' : 'none'}">
      ${s.items.map(item => `
        <div class="nav-item" data-hash="${item.hash}">
          <span class="icon">${icon(item.icon, 16)}</span>
          <span>${item.label}</span>
        </div>
      `).join('')}
    </div>`;
  }).join('');

  return `
    <div class="sidebar-brand">
      <h1>艾德尔</h1>
    </div>
    <nav class="sidebar-nav">
      ${sections}
      <div class="sidebar-section">账号</div>
      <div class="nav-item" data-hash="#/settings">
        <span class="icon">${icon('gear', 16)}</span>
        <span>设置</span>
      </div>
      <div class="nav-item" data-action="logout">
        <span class="icon">${icon('arrowRight', 16)}</span>
        <span>退出登录</span>
      </div>
    </nav>`;
}

export function initSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // 侧边栏分区展开/收起（只有再次点击同一触发器才切换，点击外部不关闭）
  sidebar.querySelectorAll('.sidebar-section-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const sectionKey = trigger.dataset.section;
      const list = sidebar.querySelector(`.sidebar-items[data-section="${sectionKey}"]`);
      if (!list) return;
      const isOpen = list.style.display !== 'none';
      list.style.display = isOpen ? 'none' : 'block';
      trigger.setAttribute('aria-expanded', !isOpen);
      trigger.querySelector('.sidebar-section-arrow').textContent = isOpen ? '▸' : '▾';
      // 持久化展开状态
      try {
        const state = JSON.parse(localStorage.getItem('ider_sidebar_expanded') || '{}');
        state[sectionKey] = !isOpen;
        localStorage.setItem('ider_sidebar_expanded', JSON.stringify(state));
      } catch { /* 静默降级 */ }
    });
  });

  sidebar.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (!item) return;

    const hash = item.dataset.hash;
    const action = item.dataset.action;

    if (action === 'logout') {
      store.clearStorage();
      window.location.hash = '#/login';
      return;
    }

    if (hash) {
      window.location.hash = hash;
      // 移动端关闭侧边栏
      sidebar.classList.remove('open');
    }
  });

  updateActiveNav();
  window.addEventListener('hashchange', updateActiveNav);
}

function updateActiveNav() {
  const currentHash = window.location.hash || '#/dashboard';
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.querySelectorAll('.nav-item').forEach(item => {
    const h = item.dataset.hash;
    if (!h) return;
    const isActive = currentHash === h || (h !== '#/' && currentHash.startsWith(h));
    item.classList.toggle('active', isActive);
  });
}

export function refreshSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.innerHTML = renderSidebar();
    initSidebar();
  }
}
