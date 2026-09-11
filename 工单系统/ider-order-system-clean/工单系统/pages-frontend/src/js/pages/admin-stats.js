// pages/admin-stats.js — 管理后台 - 数据统计

import { api } from '../api.js';
import { toast } from '../components/toast.js';

export async function renderAdminStats({ container }) {
  container.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const stats = await api.adminGetStats();

    container.innerHTML = `
      <div class="page-header">
        <h2>数据统计</h2>
        <p>系统运营数据概览</p>
      </div>

      <div class="stats-grid mb-6">
        <div class="stat-card">
          <div class="stat-label">总用户</div>
          <div class="stat-value">${stats.total_users || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总工单</div>
          <div class="stat-value">${stats.total_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总营收</div>
          <div class="stat-value">¥${(stats.total_revenue || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">今日工单</div>
          <div class="stat-value" style="color:var(--accent-green)">${stats.today_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">今日营收</div>
          <div class="stat-value" style="color:var(--accent-green)">¥${(stats.today_revenue || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">本周工单</div>
          <div class="stat-value">${stats.weekly_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">待审批</div>
          <div class="stat-value" style="color:var(--accent-amber)">${stats.pending_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">进行中</div>
          <div class="stat-value" style="color:var(--accent-blue)">${stats.active_orders || 0}</div>
        </div>
      </div>

      <!-- 待处理快速导航 -->
      <div class="card mb-6">
        <div class="card-header">
          <h3>待处理事项</h3>
          <a href="#/admin/orders?status=pending" class="text-sm" style="color:var(--accent);">查看全部</a>
        </div>
        <div class="pending-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px;">
          <a href="#/admin/orders?status=pending" class="pending-item" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);text-decoration:none;transition:all .15s;">
            <span style="font-size:28px;font-weight:700;color:var(--accent-amber);">${stats.pending_orders || 0}</span>
            <span style="font-size:13px;color:var(--text-muted);">待审批工单</span>
          </a>
          <a href="#/admin/appeals" class="pending-item" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);text-decoration:none;transition:all .15s;">
            <span style="font-size:28px;font-weight:700;color:var(--accent-orange);">${stats.pending_appeals || 0}</span>
            <span style="font-size:13px;color:var(--text-muted);">待处理申诉</span>
          </a>
          <a href="#/admin/recharge" class="pending-item" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);text-decoration:none;transition:all .15s;">
            <span style="font-size:28px;font-weight:700;color:var(--accent-blue);">${stats.pending_recharge || 0}</span>
            <span style="font-size:13px;color:var(--text-muted);">待审核充值</span>
          </a>
          <a href="#/admin/market-purchases" class="pending-item" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);text-decoration:none;transition:all .15s;">
            <span style="font-size:28px;font-weight:700;color:var(--accent-purple);">${stats.pending_market_purchases || 0}</span>
            <span style="font-size:13px;color:var(--text-muted);">待审核购买</span>
          </a>
          <a href="#/admin/withdrawals" class="pending-item" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);text-decoration:none;transition:all .15s;">
            <span style="font-size:28px;font-weight:700;color:#e91e63;">${stats.pending_withdrawals || 0}</span>
            <span style="font-size:13px;color:var(--text-muted);">待处理提现</span>
          </a>
        </div>
      </div>

      <!-- 收入趋势 -->
      ${stats.daily_revenue ? `
      <div class="card">
        <div class="card-header">
          <h3>近7日收入</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>工单数</th><th>收入</th></tr></thead>
            <tbody>
              ${Object.entries(stats.daily_revenue).map(([date, data]) => `
                <tr>
                  <td>${date}</td>
                  <td>${data.orders || 0}</td>
                  <td class="font-semibold">¥${(data.revenue || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}
