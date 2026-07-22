// pages/about.js — 站点信息页

import { api } from '../api.js';

export async function renderAbout({ container }) {
  container.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const [configRes, statsRes] = await Promise.all([
      api.getConfig(),
      api.getStats(),
    ]);

    const config = configRes.config || {};
    const rawStats = statsRes.stats || statsRes || {};
    
    // 获取用户免费试用余额（需登录）
    let freeTrialBalance = null;
    try {
      const info = await api.getUserInfo();
      freeTrialBalance = info.user?.free_trial_balance || 0;
    } catch (e) { /* 未登录 */ }

    container.innerHTML = `
      <div class="page-header">
        <h2>站点信息</h2>
        <p>艾德尔修仙工单平台</p>
      </div>

      <!-- 基本信息 -->
      <div class="card mb-6">
        <div class="card-header">
          <h3>基本信息</h3>
        </div>
        <div style="display:grid;grid-template-columns:140px 1fr;gap:var(--space-3) var(--space-4);padding:0 var(--space-4) var(--space-4);font-size:var(--text-sm);">
          <span class="text-muted">站点名称</span><span class="font-semibold">${config.site_name || '艾德尔修仙工单平台'}</span>
          <span class="text-muted">平台版本</span><span>v3.2</span>
          <span class="text-muted">技术支持</span><span>Cloudflare Pages + D1</span>
          <span class="text-muted">部署方式</span><span>GitHub Actions 自动部署</span>
          <span class="text-muted">前端框架</span><span>原生 JavaScript SPA</span>
          <span class="text-muted">数据库</span><span>Cloudflare D1 (SQLite)</span>
        </div>
      </div>

      <!-- 平台数据 -->
      <div class="card mb-6">
        <div class="card-header">
          <h3>平台数据</h3>
        </div>
        <div class="stats-grid" style="padding:var(--space-4);">
          <div class="stat-card">
            <div class="stat-label">总用户</div>
            <div class="stat-value">${rawStats.total_users || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">总工单</div>
            <div class="stat-value">${rawStats.total_orders || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">已完成</div>
            <div class="stat-value" style="color:var(--accent-green)">${rawStats.completed_orders || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">进行中</div>
            <div class="stat-value" style="color:var(--accent-amber)">${rawStats.approved_orders || 0}</div>
          </div>
        </div>
      </div>

      <!-- 功能状态 -->
      <div class="card mb-6">
        <div class="card-header">
          <h3>功能状态</h3>
        </div>
        <div style="padding:0 var(--space-4) var(--space-4);">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:var(--space-3);">
            ${[
              { key: 'bot_enabled', label: 'AI 客服', icon: '🤖' },
              { key: 'free_trial_enabled', label: '免费试用', icon: '🎁', extra: freeTrialBalance !== null ? `余额: ${freeTrialBalance} 修仙币` : null },
              { key: 'ai_enabled', label: 'AI 智能回复', icon: '🧠' },
              { key: 'withdraw_enabled', label: '积分提现', icon: '💰' },
            ].map(f => {
              const enabled = config[f.key] !== '0';
              return `
                <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--border-light);border-radius:var(--radius-md);">
                  <span style="font-size:20px;">${f.icon}</span>
                  <div>
                    <div class="text-sm font-semibold">${f.label}</div>
                    <div class="text-xs" style="color:${enabled ? 'var(--accent-green)' : 'var(--text-muted)'};">
                      ${enabled ? '✅ 已开启' : '⬜ 已关闭'}
                    </div>
                    ${f.extra && enabled ? `<div class="text-xs" style="color:var(--accent-amber);margin-top:2px;">${f.extra}</div>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 关于 -->
      <div class="card">
        <div class="card-header">
          <h3>关于</h3>
        </div>
        <div style="padding:0 var(--space-4) var(--space-4);font-size:var(--text-sm);line-height:1.8;">
          <p>艾德尔修仙工单平台是一个基于修仙主题的游戏自动化服务平台。</p>
          <p>支持工单提交、挂机账号管理、邀请返利、修仙坊市、积分兑换等功能。</p>
          <p class="text-muted mt-2">© 2026 艾德尔修仙工单平台 · Powered by Cloudflare</p>
        </div>
      </div>`;
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <p>加载失败: ${err.message}</p>
      </div>`;
  }
}
