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
          <div class="stat-value">${(stats.total_users || 0).toLocaleString()} <span class="text-xs text-muted">人</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总工单</div>
          <div class="stat-value">${(stats.total_orders || 0).toLocaleString()} <span class="text-xs text-muted">单</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总修仙分</div>
          <div class="stat-value">${(stats.total_bonus_points || 0).toLocaleString()} <span class="text-xs text-muted">分</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">今日工单</div>
          <div class="stat-value" style="color:var(--accent-green)">${stats.today_orders || 0} <span class="text-xs text-muted">单</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">今日修仙分</div>
          <div class="stat-value" style="color:var(--accent-green)">${(stats.today_bonus_points || 0).toLocaleString()} <span class="text-xs text-muted">分</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">本周工单</div>
          <div class="stat-value">${stats.weekly_orders || 0} <span class="text-xs text-muted">单</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">待审批</div>
          <div class="stat-value" style="color:var(--accent-amber)">${stats.pending_orders || 0} <span class="text-xs text-muted">单</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">进行中</div>
          <div class="stat-value" style="color:var(--accent-blue)">${stats.active_orders || 0} <span class="text-xs text-muted">单</span></div>
        </div>
      </div>

      <!-- 修仙分趋势 -->
      ${stats.daily_trend && stats.daily_trend.length ? `
      <div class="card">
        <div class="card-header">
          <h3>近7日趋势</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>工单数</th><th>修仙分</th></tr></thead>
            <tbody>
              ${stats.daily_trend.map(d => `
                <tr>
                  <td>${d.day}</td>
                  <td>${d.cnt || 0} <span class="text-xs text-muted">单</span></td>
                  <td class="font-semibold">${(d.revenue || 0).toLocaleString()} <span class="text-xs text-muted">分</span></td>
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
