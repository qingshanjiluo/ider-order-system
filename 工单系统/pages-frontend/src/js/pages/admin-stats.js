// pages/admin-stats.js — 管理后台 - 数据统计

import { api } from '../api.js';
import { toast } from '../components/toast.js';

export async function renderAdminStats({ container }) {
  container.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const raw = await api.adminGetStats();
    // API 返回 { ok: true, stats: { ... } }，解包内层 stats
    const stats = raw.stats || raw;

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
          <div class="stat-value" style="color:var(--accent-blue)">${stats.active_orders || stats.approved_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总账号</div>
          <div class="stat-value">${stats.total_accounts || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">在线账号</div>
          <div class="stat-value" style="color:var(--accent-green)">${stats.online_accounts || 0}</div>
        </div>
      </div>

      <!-- 收入趋势 -->
      ${(stats.daily_trend && stats.daily_trend.length > 0) ? `
      <div class="card">
        <div class="card-header">
          <h3>近7日收入</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>工单数</th><th>收入</th></tr></thead>
            <tbody>
              ${stats.daily_trend.map(d => `
                <tr>
                  <td>${d.day}</td>
                  <td>${d.cnt || 0}</td>
                  <td class="font-semibold">¥${(d.revenue || 0).toFixed(2)}</td>
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
