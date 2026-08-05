// app.js — SPA 入口文件
// 艾德尔工单系统 · Swedish Functionalism × Minimalism

import { router } from './router.js';
import { store } from './store.js';
import { api } from './api.js';
import { renderSidebar, initSidebar } from './components/sidebar.js';
import { renderTopbar, initTopbar } from './components/topbar.js';
import { initChatBot } from './components/chat-bot.js';

// ── 全局 DOM ──────────────────────────
const appEl = document.getElementById('app');

// ── 页面渲染辅助 ──────────────────────
// ── 滚动公告栏（带会话缓存，避免每次导航重复请求）──
let announcementCache = null;
async function loadScrollingAnnouncement() {
  const bar = document.getElementById('scrolling-announcement-bar');
  if (!bar) return;
  if (announcementCache === null) {
    try {
      const res = await api.get('/announcements/active');
      announcementCache = (res && res.announcement && res.announcement.content) ? res.announcement.content : '';
    } catch { announcementCache = ''; }
  }
  if (announcementCache) {
    bar.style.display = 'block';
    bar.innerHTML = `
      <div class="scrolling-wrap">
        <span class="scrolling-text"></span>
      </div>
      <button class="scrolling-close" onclick="this.parentElement.style.display='none'">&times;</button>`;
    bar.querySelector('.scrolling-text').textContent = announcementCache;
  }
}

// ── 路由守卫 ──────────────────────────
const PUBLIC_ROUTES = ['/', '/landing', '/login', '/register', '/forgot-password', '/help', '/contact', '/changelog'];

router.beforeEach = (path, params) => {
  const isPublic = PUBLIC_ROUTES.includes(path);
  const loggedIn = store.isLoggedIn() || store.loadFromStorage();

  if (!isPublic && !loggedIn) {
    window.location.hash = '#/login';
    return false;
  }

  if ((path === '/login' || path === '/register') && loggedIn) {
    window.location.hash = '#/dashboard';
    return false;
  }

  return true;
};

// ── 页面加载器：按需动态导入，极大减少首屏加载 ──
const pageLoaders = {
  landing: () => import('./pages/landing.js').then(m => m.renderLanding),
  login: () => import('./pages/login.js').then(m => m.renderLogin),
  register: () => import('./pages/register.js').then(m => m.renderRegister),
  forgotPassword: () => import('./pages/forgot-password.js').then(m => m.renderForgotPassword),
  dashboard: () => import('./pages/dashboard.js').then(m => m.renderDashboard),
  help: () => import('./pages/help.js').then(m => m.renderHelp),
  contact: () => import('./pages/contact.js').then(m => m.renderContact),
  changelog: () => import('./pages/changelog.js').then(m => m.renderChangelog),
  chat: () => import('./pages/chat.js').then(m => m.renderChat),
  orders: () => import('./pages/orders.js').then(m => m.renderOrders),
  withdrawals: () => import('./pages/withdrawals.js').then(m => m.renderWithdrawals),
  orderDetail: () => import('./pages/order-detail.js').then(m => m.renderOrderDetail),
  accounts: () => import('./pages/accounts.js').then(m => m.renderAccounts),
  accountDetail: () => import('./pages/account-detail.js').then(m => m.renderAccountDetail),
  invite: () => import('./pages/invite.js').then(m => m.renderInvite),
  leaderboard: () => import('./pages/leaderboard.js').then(m => m.renderLeaderboard),
  settings: () => import('./pages/settings.js').then(m => m.renderSettings),
  appeals: () => import('./pages/appeals.js').then(m => m.renderAppeals),
  afterSales: () => import('./pages/after-sales.js').then(m => m.renderAfterSales),
  adminStats: () => import('./pages/admin-stats.js').then(m => m.renderAdminStats),
  adminUsers: () => import('./pages/admin-users.js').then(m => m.renderAdminUsers),
  adminOrders: () => import('./pages/admin-orders.js').then(m => m.renderAdminOrders),
  adminSuper: () => import('./pages/admin-super.js').then(m => m.renderAdminSuper),
  adminAccounts: () => import('./pages/admin-accounts.js').then(m => m.renderAdminAccounts),
  adminAppeals: () => import('./pages/admin-appeals.js').then(m => m.renderAdminAppeals),
  adminConfig: () => import('./pages/admin-config.js').then(m => m.renderAdminConfig),
  adminCoupons: () => import('./pages/admin-coupons.js').then(m => m.renderAdminCoupons),
  adminAnnouncements: () => import('./pages/admin-announcements.js').then(m => m.renderAdminAnnouncements),
  adminAds: () => import('./pages/admin-ads.js').then(m => m.renderAdminAds),
  recharge: () => import('./pages/recharge.js').then(m => m.renderRecharge),
  market: () => import('./pages/market.js').then(m => m.renderMarket),
  adminMarket: () => import('./pages/admin-market.js').then(m => m.renderAdminMarket),
  adminRecharge: () => import('./pages/admin-recharge.js').then(m => m.renderAdminRecharge),
  adminRechargeCodes: () => import('./pages/admin-recharge-codes.js').then(m => m.renderAdminRechargeCodes),
  adminAiConfig: () => import('./pages/admin-ai-config.js').then(m => m.renderAdminAiConfig),
  adminMarketOrders: () => import('./pages/admin-market-orders.js').then(m => m.renderAdminMarketOrders),
  adminMarketPurchases: () => import('./pages/admin-market-purchases.js').then(m => m.renderAdminMarketPurchases),
  adminWithdrawals: () => import('./pages/admin-withdrawals.js').then(m => m.renderAdminWithdrawals),
  skins: () => import('./pages/skins.js').then(m => m.renderSkins),
  adminSkins: () => import('./pages/admin-skins.js').then(m => m.renderAdminSkins),
  csDialog: () => import('./pages/cs-dialog.js').then(m => m.renderCsDialog),
  adminCs: () => import('./pages/admin-cs.js').then(m => m.renderAdminCs),
};

// 异步路由包装：动态导入页面模块后再渲染，避免首屏加载全部页面
function lazyPage(loader, mode, basePath) {
  return (ctx) => {
    const seq = ctx.seq;
    if (mode === 'full') {
      renderFullPageSkeleton();
    } else {
      renderLayoutSkeleton(basePath);
    }
    loader().then((renderFn) => {
      // 若期间用户已切换到其它页面，则放弃本次渲染
      if (router.navSeq() !== seq) return;
      const contentEl = document.getElementById('app-content');
      if (!contentEl) return;
      renderFn({ container: contentEl, params: ctx.params, query: ctx.query });
    }).catch(() => {
      if (router.navSeq() !== seq) return;
      const contentEl = document.getElementById('app-content');
      if (contentEl) contentEl.innerHTML = `<div class="empty-state"><p>页面加载失败，请刷新重试</p></div>`;
    });
  };
}

// 布局骨架：先渲染侧边栏/顶栏，再按需加载页面内容
function renderLayoutSkeleton(basePath) {
  appEl.innerHTML = `
    <aside class="sidebar" id="sidebar"></aside>
    <main class="main-content">
      <header class="topbar" id="topbar"></header>
      <div id="scrolling-announcement-bar" class="scrolling-announcement" style="display:none;"></div>
      <div class="content-area" id="app-content">
        <div class="page-skeleton">
          <div class="skeleton-block" style="width:160px;height:24px;"></div>
          <div class="skeleton-block" style="width:100%;height:12px;margin-top:12px;"></div>
          <div class="skeleton-block" style="width:70%;height:12px;margin-top:8px;"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      </div>
    </main>`;

  document.getElementById('sidebar').innerHTML = renderSidebar();
  document.getElementById('topbar').innerHTML = renderTopbar(basePath);

  initSidebar();
  initTopbar();
  loadScrollingAnnouncement();
}

function renderFullPageSkeleton() {
  appEl.innerHTML = `
    <div id="app-content" style="width:100%;">
      <div class="page-skeleton" style="max-width:520px;margin:24px auto;padding:24px;">
        <div class="skeleton-block" style="width:120px;height:24px;"></div>
        <div class="skeleton-card"></div>
      </div>
    </div>`;
}

// ── 路由注册（全部按需加载）──────────────────
router.register('/', lazyPage(pageLoaders.landing, 'full'));
router.register('/landing', lazyPage(pageLoaders.landing, 'full'));
router.register('/login', lazyPage(pageLoaders.login, 'full'));
router.register('/register', lazyPage(pageLoaders.register, 'full'));
router.register('/forgot-password', lazyPage(pageLoaders.forgotPassword, 'full'));
router.register('/help', lazyPage(pageLoaders.help, 'full'));
router.register('/contact', lazyPage(pageLoaders.contact, 'full'));
router.register('/changelog', lazyPage(pageLoaders.changelog, 'full'));

router.register('/dashboard', lazyPage(pageLoaders.dashboard, 'layout', '/dashboard'));
router.register('/orders', lazyPage(pageLoaders.orders, 'layout', '/orders'));
router.register('/withdrawals', lazyPage(pageLoaders.withdrawals, 'layout', '/withdrawals'));
router.register('/orders/:id', lazyPage(pageLoaders.orderDetail, 'layout', '/orders'));
router.register('/accounts', lazyPage(pageLoaders.accounts, 'layout', '/accounts'));
router.register('/accounts/:id', lazyPage(pageLoaders.accountDetail, 'layout', '/accounts'));
router.register('/market', lazyPage(pageLoaders.market, 'layout', '/market'));
router.register('/recharge', lazyPage(pageLoaders.recharge, 'layout', '/recharge'));
router.register('/skins', lazyPage(pageLoaders.skins, 'layout', '/skins'));
router.register('/invite', lazyPage(pageLoaders.invite, 'layout', '/invite'));
router.register('/leaderboard', lazyPage(pageLoaders.leaderboard, 'layout', '/leaderboard'));
router.register('/settings', lazyPage(pageLoaders.settings, 'layout', '/settings'));
router.register('/appeals', lazyPage(pageLoaders.appeals, 'layout', '/appeals'));
router.register('/after-sales', lazyPage(pageLoaders.afterSales, 'layout', '/after-sales'));
router.register('/cs', lazyPage(pageLoaders.csDialog, 'layout', '/cs'));
router.register('/chat', lazyPage(pageLoaders.chat, 'layout', '/chat'));

// Admin pages
router.register('/admin/stats', lazyPage(pageLoaders.adminStats, 'layout', '/admin/stats'));
router.register('/admin/users', lazyPage(pageLoaders.adminUsers, 'layout', '/admin/users'));
router.register('/admin/cs', lazyPage(pageLoaders.adminCs, 'layout', '/admin/cs'));
router.register('/admin/market', lazyPage(pageLoaders.adminMarket, 'layout', '/admin/market'));
router.register('/admin/recharge', lazyPage(pageLoaders.adminRecharge, 'layout', '/admin/recharge'));
router.register('/admin/orders', lazyPage(pageLoaders.adminOrders, 'layout', '/admin/orders'));
router.register('/admin/super', lazyPage(pageLoaders.adminSuper, 'layout', '/admin/super'));
router.register('/admin/accounts', lazyPage(pageLoaders.adminAccounts, 'layout', '/admin/accounts'));
router.register('/admin/appeals', lazyPage(pageLoaders.adminAppeals, 'layout', '/admin/appeals'));
router.register('/admin/config', lazyPage(pageLoaders.adminConfig, 'layout', '/admin/config'));
router.register('/admin/coupons', lazyPage(pageLoaders.adminCoupons, 'layout', '/admin/coupons'));
router.register('/admin/announcements', lazyPage(pageLoaders.adminAnnouncements, 'layout', '/admin/announcements'));
router.register('/admin/recharge-codes', lazyPage(pageLoaders.adminRechargeCodes, 'layout', '/admin/recharge-codes'));
router.register('/admin/ai-config', lazyPage(pageLoaders.adminAiConfig, 'layout', '/admin/ai-config'));
router.register('/admin/ads', lazyPage(pageLoaders.adminAds, 'layout', '/admin/ads'));
router.register('/admin/skins', lazyPage(pageLoaders.adminSkins, 'layout', '/admin/skins'));
router.register('/admin/market-orders', lazyPage(pageLoaders.adminMarketOrders, 'layout', '/admin/market-orders'));
router.register('/admin/market-purchases', lazyPage(pageLoaders.adminMarketPurchases, 'layout', '/admin/market-purchases'));
router.register('/admin/withdrawals', lazyPage(pageLoaders.adminWithdrawals, 'layout', '/admin/withdrawals'));

// ── 初始化 ──────────────────────────
// 尝试从 localStorage 恢复登录状态
store.loadFromStorage();

// 立即启动路由，页面先渲染，不等待网络请求
async function init() {
  // 确保 #app-content 容器存在
  let contentEl = document.getElementById('app-content');
  if (!contentEl) {
    appEl.innerHTML = '<div id="app-content" style="width:100%;"></div>';
    contentEl = document.getElementById('app-content');
  }

  // 启动路由（同步执行，立即渲染当前路由）
  router.setContainer(contentEl);
  router.start();

  // 后台刷新用户信息：不阻塞首屏渲染，失败时静默降级
  if (store.isLoggedIn()) {
    api.getUserInfo().then((res) => {
      const user = res.user || res;
      store.setUser(user);
      localStorage.setItem('ider_user', JSON.stringify(user));
    }).catch(() => {
      // Token 可能失效，清除登录状态
      store.clearStorage();
    });
  }

  // 非关键功能延后加载，不阻塞首屏
  requestIdleCallback(() => {
    initChatBot();
  }, { timeout: 3000 });
}

init();

// 非关键 JS 在 DOMContentLoaded 后执行
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img:not([loading])').forEach(img => {
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
  });
});
