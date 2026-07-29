// pages/admin-withdrawals.js — 提现审核
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

let _page = 1, _totalPages = 1;

export async function renderAdminWithdrawals({ container }) {
  container.innerHTML = `
    <div class="page-header"><h2>提现审核</h2><p>管理用户提现申请</p></div>
    <div class="filter-bar">
      <select class="form-select" id="aw-status">
        <option value="">全部</option><option value="pending">待审核</option>
        <option value="approved">已通过</option><option value="rejected">已拒绝</option>
      </select>
    </div>
    <div id="aw-list"><div class="loading"><div class="spinner"></div></div></div>
    <div id="aw-pager" style="display:flex;justify-content:center;align-items:center;gap:12px;padding:16px 0;">
      <button class="btn btn-sm btn-ghost" id="aw-prev" disabled>‹ 上一页</button>
      <span class="text-sm text-muted" id="aw-info">第 1 页</span>
      <button class="btn btn-sm btn-ghost" id="aw-next" disabled>下一页 ›</button>
    </div>`;

  document.getElementById('aw-status').onchange = function() { _page = 1; load(); };
  document.getElementById('aw-prev').onclick = function() { if (_page > 1) { _page--; load(); } };
  document.getElementById('aw-next').onclick = function() { if (_page < _totalPages) { _page++; load(); } };
  load();
}

async function load() {
  const status = document.getElementById('aw-status')?.value || '';
  try {
    const r = await api.request('GET', `/admin/withdrawals?status=${status}&page=${_page}`);
    const list = r.withdrawals || [];
    const total = r.total || 0;
    _totalPages = Math.ceil(total / 50) || 1;
    const el = document.getElementById('aw-list');
    if (!list.length) { el.innerHTML = '<div class="empty-state"><p>暂无记录</p></div>'; return; }
    el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>ID</th><th>用户</th><th>金额</th><th>汇率</th><th>扣除</th><th>账号</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>
      ${list.map(w => `<tr>
        <td>#${w.id}</td><td>${w.username || w.user_id}</td>
        <td class="font-semibold">${w.amount_rmb} 元</td>
        <td class="text-sm">${w.rate_text}</td>
        <td class="text-sm">${w.cost_amount.toLocaleString()}</td>
        <td class="text-sm">${w.account_name}${w.account_info ? '/' + w.account_info : ''}</td>
        <td class="text-sm text-muted">${new Date(w.created_at).toLocaleDateString('zh-CN')}</td>
        <td><span class="badge ${w.status === 'approved' ? 'badge-completed' : w.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}">${w.status === 'approved' ? '已通过' : w.status === 'rejected' ? '已拒绝' : '待审核'}</span></td>
        <td>${w.status === 'pending' ? `<button class="btn btn-sm btn-primary" data-action="approve" data-id="${w.id}">通过</button><button class="btn btn-sm" style="background:var(--accent-red);color:#fff;border:none;" data-action="reject" data-id="${w.id}">拒绝</button>` : '-'}</td>
      </tr>`).join('')}</tbody></table></div>`;
    el.querySelectorAll('[data-action="approve"]').forEach(b => b.onclick = () => review(b.dataset.id, 'approved'));
    el.querySelectorAll('[data-action="reject"]').forEach(b => b.onclick = () => review(b.dataset.id, 'rejected'));
    document.getElementById('aw-prev').disabled = _page <= 1;
    document.getElementById('aw-next').disabled = _page >= _totalPages;
    document.getElementById('aw-info').textContent = `第 ${_page}/${_totalPages} 页（共${total}条）`;
  } catch {}
}

function review(id, action) {
  const label = action === 'approved' ? '通过' : '拒绝';
  const body = document.createElement('div');
  body.innerHTML = `<p>确定${label}提现 #${id}？</p><div class="form-group" style="margin-top:12px"><textarea class="form-input" id="aw-note" rows="2" placeholder="备注（可选）"></textarea></div>`;
  modal.open({
    title: `${label}提现 #${id}`,
    body, confirmText: '确认',
    onConfirm: async () => {
      const note = document.getElementById('aw-note')?.value || '';
      try {
        const r = await api.request('POST', '/admin/withdrawals', { withdrawal_id: id, action, admin_notes: note });
        if (r.ok) { toast.success(r.message); modal.close(); load(); }
        else toast.error(r.error);
      } catch (e) { toast.error(e.message); }
    },
  });
}
