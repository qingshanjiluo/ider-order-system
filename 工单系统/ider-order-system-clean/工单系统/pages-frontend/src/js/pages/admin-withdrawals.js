// pages/admin-withdrawals.js — 管理后台 - 提现审核

import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

const STATUS_MAP = {
  pending: { label: '待审核', class: 'badge-pending' },
  approved: { label: '已通过', class: 'badge-completed' },
  rejected: { label: '已拒绝', class: 'badge-rejected' },
};

export async function renderAdminWithdrawals({ container }) {
  container.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    await loadWithdrawals(container, '');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}

async function loadWithdrawals(container, statusFilter) {
  const res = await api.adminGetWithdrawals(statusFilter);
  const withdrawals = res.withdrawals || [];

  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h2>提现审核</h2>
          <p>审核用户积分提现申请</p>
        </div>
        <a href="#/admin/config" class="btn btn-secondary">提现开关设置</a>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="card mb-6">
      <div class="flex gap-2" style="flex-wrap:wrap;padding:var(--space-3) var(--space-4);">
        <button class="btn btn-sm ${statusFilter === '' ? 'btn-primary' : 'btn-secondary'}" data-filter="">全部</button>
        <button class="btn btn-sm ${statusFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}" data-filter="pending">待审核</button>
        <button class="btn btn-sm ${statusFilter === 'approved' ? 'btn-primary' : 'btn-secondary'}" data-filter="approved">已通过</button>
        <button class="btn btn-sm ${statusFilter === 'rejected' ? 'btn-primary' : 'btn-secondary'}" data-filter="rejected">已拒绝</button>
      </div>
    </div>

    ${withdrawals.length === 0 ? '<div class="empty-state"><p>暂无提现记录</p></div>' : `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>用户</th>
            <th>积分</th>
            <th>状态</th>
            <th>管理员回复</th>
            <th>申请时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${withdrawals.map(w => {
            const st = STATUS_MAP[w.status] || { label: w.status, class: '' };
            return `
              <tr>
                <td class="font-mono text-xs">#${w.id}</td>
                <td>${w.username || '-'}</td>
                <td style="color:var(--accent-amber);font-weight:600;">${w.points}</td>
                <td><span class="badge ${st.class}">${st.label}</span></td>
                <td class="text-sm text-muted">${w.admin_reply || '-'}</td>
                <td class="text-sm text-muted">${new Date(w.created_at).toLocaleString('zh-CN')}</td>
                <td>
                  ${w.status === 'pending' ? `
                    <button class="btn btn-sm btn-ghost" style="color:var(--accent-green);" data-action="approve" data-id="${w.id}">通过</button>
                    <button class="btn btn-sm btn-ghost" style="color:var(--accent-red);" data-action="reject" data-id="${w.id}">拒绝</button>
                  ` : '-'}
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}`;

  // 筛选按钮
  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => loadWithdrawals(container, btn.dataset.filter));
  });

  // 审核操作
  container.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', () => processWithdrawal(container, parseInt(btn.dataset.id), 'approve', statusFilter));
  });
  container.querySelectorAll('[data-action="reject"]').forEach(btn => {
    btn.addEventListener('click', () => processWithdrawal(container, parseInt(btn.dataset.id), 'reject', statusFilter));
  });
}

async function processWithdrawal(container, id, action, statusFilter) {
  const actionLabel = action === 'approve' ? '通过' : '拒绝';
  modal.open({
    title: `${actionLabel}提现申请`,
    body: `
      <div class="form-group">
        <label class="form-label">管理员回复（可选）</label>
        <textarea class="form-input" id="modal-reply" rows="3" placeholder="输入回复内容..."></textarea>
      </div>`,
    confirmText: actionLabel,
    onConfirm: async () => {
      const reply = document.getElementById('modal-reply')?.value || '';
      try {
        await api.adminProcessWithdrawal(id, action, reply);
        toast.success(`已${actionLabel}`);
        modal.close();
        loadWithdrawals(container, statusFilter);
      } catch (err) {
        toast.error(err.message || '操作失败');
      }
    },
  });
}
