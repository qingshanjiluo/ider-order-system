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
let _searchText = '';

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
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-sm" style="background:var(--accent-red);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;" id="admin-cleanup-excess-btn">一键清理超额</button>
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
        <option value="cancelled">已取消</option>
      </select>
      <div style="flex:1;min-width:180px;display:flex;gap:6px;">
        <input type="search" class="form-input" id="admin-order-search" placeholder="搜索工单号 / 用户" style="flex:1;">
      </div>
    </div>
    <div id="admin-orders-list">
      ${skeletonRows(3)}
    </div>
    <div id="admin-orders-pager" style="display:flex;justify-content:center;align-items:center;gap:12px;padding:16px 0;">
      <button class="btn btn-sm btn-ghost" id="page-prev" disabled>‹ 上一页</button>
      <span class="text-sm text-muted" id="page-info">第 1 页</span>
      <button class="btn btn-sm btn-ghost" id="page-next" disabled>下一页 ›</button>
    </div>`;

  document.getElementById('admin-order-status').addEventListener('change', (e) => { _currentPage = 1; _currentStatus = e.target.value; loadOrders(); });
  // 搜索框：输入停顿 400ms 后自动搜索（防抖）
  let searchTimer = null;
  document.getElementById('admin-order-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      _currentPage = 1;
      _searchText = e.target.value.trim();
      loadOrders();
    }, 400);
  });
  document.getElementById('batch-approve-btn').addEventListener('click', batchApprove);
  document.getElementById('batch-select-all').addEventListener('click', toggleSelectAll);
  document.getElementById('admin-cleanup-excess-btn').addEventListener('click', cleanupAllExcess);
  document.getElementById('page-prev').addEventListener('click', () => {
    if (_currentPage > 1) { _currentPage--; loadOrders(); }
  });
  document.getElementById('page-next').addEventListener('click', () => {
    if (_currentPage < _totalPages) { _currentPage++; loadOrders(); }
  });
  loadOrders();
}

function skeletonRows(count) {
  let rows = '';
  for (let i = 0; i < count; i++) {
    rows += `<div class="order-skeleton">
      <div class="skeleton-block" style="width:60px;height:14px;"></div>
      <div class="skeleton-block" style="width:100%;height:14px;margin-top:10px;"></div>
      <div class="skeleton-block" style="width:45%;height:14px;margin-top:10px;"></div>
    </div>`;
  }
  return `<div class="orders-card-list">${rows}</div>`;
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
  el.innerHTML = skeletonRows(3);

  try {
    const res = await api.adminGetOrders(_currentStatus, _currentPage, _searchText);
    const orders = res.orders || [];
    const total = res.total || 0;
    const limit = res.limit || 50;
    _totalPages = Math.ceil(total / limit) || 1;

    if (!orders.length) {
      el.innerHTML = `<div class="empty-state"><p>${_searchText ? '未找到匹配的工单' : '暂无工单'}</p></div>`;
      updatePager();
      return;
    }

    // 桌面端用表格，移动端用卡片（CSS 自动切换）
    el.innerHTML = `
      <div class="table-wrap desktop-table">
        <table>
          <thead>
            <tr><th style="width:32px;"><input type="checkbox" id="select-all-header" style="cursor:pointer;"></th><th>ID</th><th>用户</th><th>类型</th><th>状态</th><th>金额</th><th>订购数</th><th>已创建</th><th>差额</th><th>创建时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${orders.map(o => {
              const st = STATUS_MAP[o.status] || { label: o.status, class: '' };
              const adminBtns = getActionButtons(o);
              const canSelect = o.status === 'pending';
              const qty = o.quantity || 0;
              const created = o.delivered_count ?? o.account_count ?? 0;
              const diff = qty - created;
              return `
                <tr>
                  <td>${canSelect ? '<input type="checkbox" class="order-checkbox" value="' + o.id + '" style="cursor:pointer;">' : ''}</td>
                  <td class="font-mono text-xs">#${o.id}</td>
                  <td>${o.user_name || o.username || o.user_id || '-'}</td>
                  <td>${ORDER_TYPE_LABEL[o.order_type] || '购买邀请积分'}</td>
                  <td><span class="badge ${st.class}">${st.label}</span></td>
                  <td class="font-semibold">${formatAdminPrice(o)}</td>
                  <td>${qty}</td>
                  <td>${created}</td>
                  <td>${diff > 0 ? `<span style="color:var(--accent-red);font-weight:600;">缺 ${diff}</span>` : diff < 0 ? `<span style="color:var(--accent-amber);font-weight:600;">多 ${-diff}</span>` : '<span class="text-muted">-</span>'}</td>
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
      </div>
      <div class="orders-card-list mobile-cards">
        ${orders.map(o => {
          const st = STATUS_MAP[o.status] || { label: o.status, class: '' };
          const adminBtns = getActionButtons(o);
          const canSelect = o.status === 'pending';
          const qty = o.quantity || 0;
          const created = o.delivered_count ?? o.account_count ?? 0;
          const diff = qty - created;
          const diffHtml = diff > 0 ? `<span style="color:var(--accent-red);font-weight:600;">缺 ${diff}</span>` : diff < 0 ? `<span style="color:var(--accent-amber);font-weight:600;">多 ${-diff}</span>` : '<span class="text-muted">-</span>';
          return `
            <div class="order-card" data-order-id="${o.id}">
              <div class="order-card-head">
                <span style="display:flex;align-items:center;gap:8px;">
                  ${canSelect ? '<input type="checkbox" class="order-checkbox" value="' + o.id + '" style="cursor:pointer;">' : ''}
                  <span class="font-mono text-xs">#${o.id}</span>
                </span>
                <span class="badge ${st.class}">${st.label}</span>
              </div>
              <div class="order-card-body">
                <div class="order-card-grid">
                  <div class="oc-item"><span class="oc-label">用户</span><span class="oc-value">${o.user_name || o.username || o.user_id || '-'}</span></div>
                  <div class="oc-item"><span class="oc-label">类型</span><span class="oc-value">${ORDER_TYPE_LABEL[o.order_type] || '购买邀请积分'}</span></div>
                  <div class="oc-item"><span class="oc-label">金额</span><span class="oc-value">${formatAdminPrice(o)}</span></div>
                  <div class="oc-item"><span class="oc-label">订购/已创建</span><span class="oc-value">${qty} / ${created}</span></div>
                  <div class="oc-item"><span class="oc-label">差额</span><span class="oc-value">${diffHtml}</span></div>
                  <div class="oc-item"><span class="oc-label">创建</span><span class="oc-value">${new Date(o.created_at).toLocaleDateString('zh-CN')}</span></div>
                </div>
              </div>
              <div class="order-card-foot">
                <div class="flex gap-1" style="flex-wrap:wrap;gap:6px;">
                  ${adminBtns}
                  ${needsReissue(o) ? `<button class="btn btn-sm" style="background:var(--accent-amber);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;" data-action="reissue-order" data-id="${o.id}">补发审查</button>` : ''}
                  ${hasExcess(o) ? `<button class="btn btn-sm" style="background:var(--accent-red);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;" data-action="cleanup-excess" data-id="${o.id}">清理超额</button>` : ''}
                  <button class="btn btn-ghost btn-sm" onclick="location.hash='#/orders/${o.id}'">详情</button>
                </div>
              </div>
            </div>`;
        }).join('')}
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
    const selectAllHeader = document.getElementById('select-all-header');
    if (selectAllHeader) {
      selectAllHeader.addEventListener('change', function() {
        document.querySelectorAll('.order-checkbox:not(:disabled)').forEach(cb => {
          cb.checked = this.checked;
          if (this.checked) selectedOrders.add(cb.value);
          else selectedOrders.delete(cb.value);
        });
        updateBatchBar();
      });
    }

    updatePager();

  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}

function updatePager() {
  const prev = document.getElementById('page-prev');
  const next = document.getElementById('page-next');
  const info = document.getElementById('page-info');
  if (!prev || !next || !info) return;
  prev.disabled = _currentPage <= 1;
  next.disabled = _currentPage >= _totalPages;
  info.textContent = '第 ' + _currentPage + '/' + _totalPages + ' 页';
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
  // 补发审查：判断是否少于应创建的数量（以实际有效交付账号数为准）
  if (!ACCOUNT_ORDER_TYPES.includes(order.order_type)) return false;
  const qty = order.quantity || 0;
  const created = order.delivered_count ?? order.account_count ?? order.total_accounts_created ?? 0;
  return qty > 0 && created < qty;
}

function hasExcess(order) {
  const qty = order.quantity || 0;
  const created = order.delivered_count ?? order.account_count ?? order.total_accounts_created ?? 0;
  return qty > 0 && created > qty;
}

async function reissueOrder(orderId) {
  if (!confirm(`确定对工单 #${orderId} 执行补发审查？将重置角色未创建/失败/名字重复的账号并重新处理，同时补齐数量不足的账号。`)) return;
  try {
    const btn = document.querySelector(`[data-action="reissue-order"][data-id="${orderId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '审查中...'; }
    const res = await api.adminReissueOrder(orderId);
    if (res.ok) {
      const msgs = [];
      if (res.reset_count > 0) msgs.push('重置 ' + res.reset_count + ' 个异常账号（角色未创建/失败/名字重复）');
      if (res.shortfall > 0) msgs.push('缺 ' + res.shortfall + ' 个账号，已恢复补发');
      if (msgs.length) {
        toast.success(msgs.join('，'));
      } else {
        toast.info('账号数量已达标，无需补发');
      }
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

// 一键清理所有超额账号（分批，防超时）
async function cleanupAllExcess() {
  const btn = document.getElementById('admin-cleanup-excess-btn');
  if (!btn) return;
  if (!confirm('确定一键清理所有超额注册的账号？将保留每个工单的订购数量，多余账号标记为已清理。')) return;
  btn.disabled = true; btn.textContent = '清理中...';
  let total = 0, rounds = 0;
  try {
    while (true) {
      const res = await api.adminCleanupExcess();
      total += res.cleaned || 0;
      rounds++;
      if (!res.ok) { toast.error(res.error || '清理失败'); break; }
      if (!res.has_more || res.cleaned === 0) break;
      if (rounds >= 20) break;
    }
    if (total > 0) toast.success('已清理 ' + total + ' 个超额账号');
    else toast.info('没有需要清理的超额账号');
    loadOrders();
  } catch (err) {
    toast.error('清理失败: ' + err.message + (total > 0 ? '（已清理 ' + total + ' 个，可再次点击）' : ''));
  } finally {
    btn.disabled = false; btn.textContent = '一键清理超额';
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
