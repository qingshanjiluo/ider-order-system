// pages/admin-orders.js — 管理后台 - 工单管理（含审批操作）
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

const ORDER_TYPE_LABEL = { '代练':'购买邀请积分', '代打':'购买邀请积分', '托管':'购买邀请积分', '仙盟采集':'仙盟采集', '试炼测试':'试炼测试', '每日试炼':'每日试炼' };

/** 需要创建游戏账号的工单类型 */
const ACCOUNT_ORDER_TYPES = ['代练', '代打', '托管'];

let _currentPage = 1;
let _totalPages = 1;
let _currentStatus = '';

/** 根据支付方式格式化价格显示 */
function formatAdminPrice(order) {
  const price = order.total_price || order.price || 0;
  const method = order.payment_method;
  let display = '';
  if (method === 'coin') {
    display = `${price} 修仙币`;
  } else if (method === 'spirit_stone') {
    display = `${price} 万灵石`;
  } else {
    display = `¥${price.toFixed(2)}`;
  }
  // 显示折扣信息（如有）— discount 字段存储折扣百分比（如 20 = 优惠20%）
  const discount = order.discount || 0;
  if (discount > 0) {
    display += ` (优惠${discount}%)`;
  }
  return display;
}

const STATUS_MAP = {
  pending: { label: '待审批', class: 'badge-pending' },
  approved: { label: '进行中', class: 'badge-approved' },
  processing: { label: '挂机中', class: 'badge-approved' },
  completed: { label: '已完成', class: 'badge-completed' },
  rejected: { label: '已拒绝', class: 'badge-rejected' },
  cancelled: { label: '已取消', class: 'badge-pending' },
};

export async function renderAdminOrders({ container }) {
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div><h2>工单管理</h2><p>管理所有用户工单</p></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-primary" id="batch-approve-btn" disabled style="display:none;">批量通过</button>
        <button class="btn btn-ghost btn-sm" id="batch-select-all" style="display:none;">全选</button>
      </div>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="admin-order-status">
        <option value="">全部状态</option>
        <option value="pending">待审批</option>
        <option value="approved">进行中</option>
        <option value="completed">已完成</option>
        <option value="rejected">已拒绝</option>
      </select>
    </div>
    <div id="admin-orders-list">
      <div class="loading"><div class="spinner"></div></div>
    </div>
    <div id="admin-orders-pager" style="display:flex;justify-content:center;align-items:center;gap:12px;padding:16px 0;">
      <button class="btn btn-sm btn-ghost" id="page-prev" disabled>‹ 上一页</button>
      <span class="text-sm text-muted" id="page-info">第 1 页</span>
      <button class="btn btn-sm btn-ghost" id="page-next" disabled>下一页 ›</button>
    </div>`;

  document.getElementById('admin-order-status').addEventListener('change', (e) => { _currentPage = 1; _currentStatus = e.target.value; loadOrders(); });
  document.getElementById('batch-approve-btn').addEventListener('click', batchApprove);
  document.getElementById('batch-select-all').addEventListener('click', toggleSelectAll);
  document.getElementById('page-prev').addEventListener('click', () => {
    if (_currentPage > 1) { _currentPage--; loadOrders(); }
  });
  document.getElementById('page-next').addEventListener('click', () => {
    if (_currentPage < _totalPages) { _currentPage++; loadOrders(); }
  });
  loadOrders();
}

let selectedOrders = new Set();

function updateBatchBar() {
  const btn = document.getElementById('batch-approve-btn');
  const selBtn = document.getElementById('batch-select-all');
  const count = selectedOrders.size;
  if (count > 0) {
    btn.style.display = 'inline-flex';
    btn.disabled = false;
    btn.textContent = '批量通过 (' + count + ')';
    selBtn.style.display = 'inline-flex';
    selBtn.textContent = '取消全选';
  } else {
    btn.style.display = 'none';
    btn.disabled = true;
    selBtn.style.display = 'none';
  }
}

function toggleSelectAll() {
  const checkboxes = document.querySelectorAll('.order-checkbox:not(:disabled)');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
    if (cb.checked) selectedOrders.add(cb.value);
    else selectedOrders.delete(cb.value);
  });
  updateBatchBar();
}

function toggleOrder(id) {
  if (selectedOrders.has(id)) selectedOrders.delete(id);
  else selectedOrders.add(id);
  updateBatchBar();
}

async function loadOrders() {
  const el = document.getElementById('admin-orders-list');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const res = await api.adminGetOrders(_currentStatus, _currentPage);
    const orders = res.orders || [];
    const total = res.total || 0;
    const limit = res.limit || 50;
    _totalPages = Math.ceil(total / limit) || 1;

    if (!orders.length) {
      el.innerHTML = `<div class="empty-state"><p>暂无工单</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th style="width:32px;"><input type="checkbox" id="select-all-header" style="cursor:pointer;"></th><th>ID</th><th>用户</th><th>类型</th><th>状态</th><th>金额</th><th>数量</th><th>已创建</th><th>创建时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${orders.map(o => {
              const st = STATUS_MAP[o.status] || { label: o.status, class: '' };
              const adminBtns = getActionButtons(o);
              const canSelect = o.status === 'pending';
              return `
                <tr>
                  <td>${canSelect ? '<input type="checkbox" class="order-checkbox" value="' + o.id + '" style="cursor:pointer;">' : ''}</td>
                  <td class="font-mono text-xs">#${o.id}</td>
                  <td>${o.user_name || o.username || o.user_id || '-'}</td>
                  <td>${ORDER_TYPE_LABEL[o.order_type] || '购买邀请积分'}</td>
                  <td><span class="badge ${st.class}">${st.label}</span></td>
                  <td class="font-semibold">${formatAdminPrice(o)}</td>
                  <td>${o.account_count || o.quantity || 0}</td>
                  <td>${o.total_accounts_created || 0}</td>
                  <td class="text-sm text-muted">${new Date(o.created_at).toLocaleDateString('zh-CN')}</td>
                  <td>
            <div class="flex gap-1" style="flex-wrap:wrap;">
              ${adminBtns}
              ${needsReissue(o) ? `<button class="btn btn-sm" style="background:var(--accent-amber);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;" data-action="reissue-order" data-id="${o.id}">补发审查</button>` : ''}
              ${hasExcess(o) ? `<button class="btn btn-sm" style="background:var(--accent-red);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;" data-action="cleanup-excess" data-id="${o.id}">清理超额</button>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="location.hash='#/orders/${o.id}'">详情</button>
            </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // 绑定审批按钮事件
    document.querySelectorAll('[data-action="approve-order"]').forEach(btn => {
      btn.addEventListener('click', () => showStatusModal(btn.dataset.id, 'approved'));
    });
    document.querySelectorAll('[data-action="reject-order"]').forEach(btn => {
      btn.addEventListener('click', () => showStatusModal(btn.dataset.id, 'rejected'));
    });
    document.querySelectorAll('[data-action="complete-order"]').forEach(btn => {
      btn.addEventListener('click', () => showStatusModal(btn.dataset.id, 'completed'));
    });
    document.querySelectorAll('[data-action="reissue-order"]').forEach(btn => {
      btn.addEventListener('click', () => reissueOrder(btn.dataset.id));
    });
    document.querySelectorAll('[data-action="cleanup-excess"]').forEach(btn => {
      btn.addEventListener('click', () => cleanupExcess(btn.dataset.id));
    });

    // 多选事件
    selectedOrders.clear();
    document.querySelectorAll('.order-checkbox').forEach(cb => {
      cb.addEventListener('change', () => toggleOrder(cb.value));
    });
    document.getElementById('select-all-header').addEventListener('change', function() {
      document.querySelectorAll('.order-checkbox:not(:disabled)').forEach(cb => {
        cb.checked = this.checked;
        if (this.checked) selectedOrders.add(cb.value);
        else selectedOrders.delete(cb.value);
      });
      updateBatchBar();
    });

    // 分页控制
    document.getElementById('page-prev').disabled = _currentPage <= 1;
    document.getElementById('page-next').disabled = _currentPage >= _totalPages;
    document.getElementById('page-info').textContent = '第 ' + _currentPage + '/' + _totalPages + ' 页（共' + total + '条）';

  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}

function getActionButtons(order) {
  if (order.status === 'pending') {
    return `
      <button class="btn btn-sm btn-primary" data-action="approve-order" data-id="${order.id}">通过</button>
      <button class="btn btn-sm" style="background:var(--accent-red);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;" data-action="reject-order" data-id="${order.id}">拒绝</button>`;
  }
  if (order.status === 'approved') {
    return `
      <button class="btn btn-sm" style="background:var(--accent-green);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;" data-action="complete-order" data-id="${order.id}">完成</button>`;
  }
  return '';
}

function needsReissue(order) {
  if (!ACCOUNT_ORDER_TYPES.includes(order.order_type)) return false;
  if (order.status === 'rejected') return true;
  const qty = order.quantity || 0;
  const created = order.total_accounts_created || 0;
  return qty > 0 && created < qty;
}

function hasExcess(order) {
  const qty = order.quantity || 0;
  const created = order.total_accounts_created || 0;
  return qty > 0 && created > qty;
}

async function reissueOrder(orderId) {
  if (!confirm(`确定对工单 #${orderId} 执行补发审查？将重置所有失败账号并重新处理。`)) return;
  try {
    const btn = document.querySelector(`[data-action="reissue-order"][data-id="${orderId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '审查中...'; }
    const res = await api.adminReissueOrder(orderId);
    if (res.ok) {
      if (res.reset_count > 0) {
        toast.success('已重置 ' + res.reset_count + ' 个失败账号，下次扫描将重新处理');
      } else {
        toast.info('没有需要补发的失败账号');
      }
      // 刷新列表
      const statusEl = document.getElementById('admin-order-status');
      loadOrders();
    } else {
      toast.error(res.error || '补发审查失败');
    }
  } catch (err) {
    toast.error('补发审查失败: ' + err.message);
  }
}

async function cleanupExcess(orderId) {
  if (!confirm(`确定清理工单 #${orderId} 的超额账号？将删除超出目标数量的所有账号。`)) return;
  try {
    const res = await api.post('/admin/accounts/delete', { order_id: parseInt(orderId), excess_only: true });
    if (res.ok) {
      toast.success('已清理 ' + res.deleted + ' 个超额账号');
      const statusEl = document.getElementById('admin-order-status');
      loadOrders();
    } else {
      toast.error(res.error || '清理失败');
    }
  } catch (err) {
    toast.error('清理失败: ' + err.message);
  }
}

function showStatusModal(orderId, newStatus) {
  const statusLabels = { approved: '通过', rejected: '拒绝', completed: '完成' };
  const body = document.createElement('div');
  body.innerHTML = `
    <p>确定将工单 #${orderId} 状态改为「${statusLabels[newStatus]}」？</p>
    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">备注（可选）</label>
      <textarea class="form-input" id="admin-order-note" rows="3" placeholder="请输入备注..."></textarea>
    </div>`;

  modal.open({
    title: `${statusLabels[newStatus]}工单 #${orderId}`,
    body,
    confirmText: '确认',
    onConfirm: async () => {
      const note = document.getElementById('admin-order-note')?.value || '';
      try {
        await api.post(`/orders/${orderId}/status`, { status: newStatus, notes: note, admin_id: undefined });
        toast.success(`工单 #${orderId} 已${statusLabels[newStatus]}`);
        modal.close();
        // 刷新列表
        const statusEl = document.getElementById('admin-order-status');
        loadOrders();
      } catch (err) {
        toast.error(err.message);
      }
    },
  });
}

function batchApprove() {
  const ids = Array.from(selectedOrders);
  if (!ids.length) { toast.error('请选择工单'); return; }

  const body = document.createElement('div');
  body.innerHTML = `
    <p>确定批量通过 <strong>${ids.length}</strong> 个待审批工单？</p>
    <p style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">工单编号: ${ids.slice(0,10).join(', ')}${ids.length > 10 ? '...等' + ids.length + '个' : ''}</p>
    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">备注（可选）</label>
      <textarea class="form-input" id="batch-order-note" rows="3" placeholder="批量审批备注..."></textarea>
    </div>`;

  modal.open({
    title: '批量通过工单',
    body,
    confirmText: '确认通过 (' + ids.length + ')',
    onConfirm: async () => {
      const notes = document.getElementById('batch-order-note')?.value || '';
      const btn = document.querySelector('[data-confirm]');
      if (btn) { btn.disabled = true; btn.textContent = '处理中...'; }
      try {
        const res = await api.batchUpdateOrderStatus(ids, 'approved', notes);
        if (res.ok) {
          toast.success('已通过 ' + res.approved + ' 个工单' + (res.failed > 0 ? ', ' + res.failed + ' 个失败' : ''));
        }
        modal.close();
        selectedOrders.clear();
        const statusEl = document.getElementById('admin-order-status');
        loadOrders();
      } catch (err) {
        toast.error(err.message || '批量操作失败');
        if (btn) { btn.disabled = false; btn.textContent = '确认通过 (' + ids.length + ')'; }
      }
    },
  });
}
