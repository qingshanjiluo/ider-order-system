// pages/accounts.js — 我的账号列表

import { api } from '../api.js';
import { toast } from '../components/toast.js';

let _pollTimer = null;

function fmtDate(d) {
  if (!d) return '-';
  const dt = typeof d === 'string' ? d.replace(' ', 'T') : d;
  const date = new Date(dt);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN');
}

function fmtDateTime(d) {
  if (!d) return '-';
  const dt = typeof d === 'string' ? d.replace(' ', 'T') : d;
  const date = new Date(dt);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

const STATUS_MAP = {
  creating: { label: '注册中', class: 'badge-pending' },
  farming: { label: '挂机中', class: 'badge-approved' },
  completed: { label: '已完成', class: 'badge-completed' },
  error: { label: '异常', class: 'badge-rejected' },
  banned: { label: '封禁', class: 'badge-rejected' },
  failed: { label: '失败', class: 'badge-rejected' },
};

export async function renderAccounts({ container }) {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }

  container.innerHTML = `
    <div class="page-header">
      <h2>我的账号</h2>
      <p>账号状态实时更新</p>
    </div>
    <div class="text-xs text-muted mb-2" style="text-align:right;">上次更新: ${fmtDateTime(new Date().toISOString())}</div>
    <div id="accounts-list">
      <div class="loading"><div class="spinner"></div></div>
    </div>`;

  const el = document.getElementById('accounts-list');
  const loadAccounts = async () => {
    try {
      const res = await api.getAccounts();
      const accounts = res.accounts || res || [];
      if (!accounts.length) {
        el.innerHTML = `<div class="empty-state"><p>暂无账号，提交工单后系统会自动创建</p></div>`;
        return;
      }
      el.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>账号</th><th>状态</th><th>等级</th><th>角色名</th><th>订单号</th><th>更新时间</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${accounts.map(a => {
                const st = STATUS_MAP[a.status] || { label: a.status, class: '' };
                return `
                  <tr>
                    <td class="font-mono text-xs">${a.game_username || a.username || '-'}</td>
                    <td><span class="badge ${st.class}">${st.label}</span></td>
                    <td>Lv.${a.level || '-'}</td>
                    <td class="text-xs">${a.character_name || '-'}</td>
                    <td class="font-mono text-xs">${a.order_id ? '#' + a.order_id : '-'}</td>
                    <td class="text-sm text-muted">${fmtDate(a.last_check_at || a.created_at)}</td>
                    <td>
                      <button class="btn btn-ghost btn-sm" onclick="location.hash='#/accounts/${a.id}'">详情</button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
    }
  };

  await loadAccounts();

  _pollTimer = setInterval(loadAccounts, 20000);
}
