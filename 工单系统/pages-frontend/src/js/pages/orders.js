// pages/orders.js — 我的工单列表 + 新建工单

import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

const ORDER_TYPE_LABEL = {
  '代练': '购买邀请积分',
  '代打': '购买邀请积分',
  '托管': '购买邀请积分',
  '仙盟采集': '仙盟采集',
  '试炼测试': '试炼测试',
  '每日试炼': '每日试炼',
  '传人派出': '传人派出',
  '副本刷取': '副本刷取',
};

const STATUS_MAP = {
  pending: { label: '待审批', class: 'badge-pending' },
  approved: { label: '进行中', class: 'badge-approved' },
  processing: { label: '挂机中', class: 'badge-approved' },
  completed: { label: '已完成', class: 'badge-completed' },
  rejected: { label: '已拒绝', class: 'badge-rejected' },
  cancelled: { label: '已取消', class: 'badge-pending' },
};

const PAYMENT_METHODS = {
  wechat: { label: '现金（微信支付）', unit: '元', icon: '¥' },
  coin: { label: '修仙币', unit: '修仙币', icon: 'B' },
  spirit_stone: { label: '灵石', unit: '万灵石', icon: '灵' },
};

let _currentPage = 1;
let _totalPages = 1;
let _currentStatus = '';

export async function renderOrders({ container, query }) {
  // 如果有 ?action=new 则弹出新建工单
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h2>我的工单</h2>
          <p>管理你的工单</p>
        </div>
        <button class="btn btn-primary" id="new-order-btn">+ 新建工单</button>
      </div>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="status-filter">
        <option value="">全部状态</option>
        <option value="pending">待审批</option>
        <option value="approved">进行中</option>
        <option value="completed">已完成</option>
        <option value="rejected">已拒绝</option>
        <option value="cancelled">已取消</option>
      </select>
    </div>
    <div id="orders-list">
      <div class="loading"><div class="spinner"></div></div>
    </div>
    <div id="orders-pager" style="display:flex;justify-content:center;align-items:center;gap:12px;padding:16px 0;">
      <button class="btn btn-sm btn-ghost" id="orders-prev" disabled>‹ 上一页</button>
      <span class="text-sm text-muted" id="orders-info">第 1 页</span>
      <button class="btn btn-sm btn-ghost" id="orders-next" disabled>下一页 ›</button>
    </div>`;

  document.getElementById('new-order-btn').addEventListener('click', showNewOrderModal);
  document.getElementById('status-filter').addEventListener('change', (e) => { _currentPage = 1; _currentStatus = e.target.value; loadOrders(); });
  document.getElementById('orders-prev').addEventListener('click', () => { if (_currentPage > 1) { _currentPage--; loadOrders(); } });
  document.getElementById('orders-next').addEventListener('click', () => { if (_currentPage < _totalPages) { _currentPage++; loadOrders(); } });

  loadOrders();

  if (query?.action === 'new') {
    showNewOrderModal();
  }
}

async function loadOrders() {
  const el = document.getElementById('orders-list');
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    var ret = await api.getOrders(_currentStatus, _currentPage);
    var orders = ret.orders || [];
    var total = ret.total || 0;
    _totalPages = Math.ceil(total / 20) || 1;

    if (!orders.length) {
      el.innerHTML = '<div class="empty-state"><p>暂无工单</p></div>';
      updatePager(total);
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>订单号</th>
              <th>类型</th>
              <th>状态</th>
              <th>账号数</th>
              <th>积分</th>
              <th>金额</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(function(o) { return `
              <tr>
                <td class="font-mono text-xs">#${o.id}</td>
                <td>${ORDER_TYPE_LABEL[o.order_type] || '购买邀请积分'}</td>
                <td><span class="badge ${(STATUS_MAP[o.status]||{}).class || ''}">${(STATUS_MAP[o.status]||{}).label || o.status}</span></td>
                <td>${o.account_count || o.quantity || 0}</td>
                <td>${o.bonus_points || 0}</td>
                <td>${formatPrice(o)}</td>
                <td class="text-sm text-muted">${new Date(o.created_at).toLocaleDateString('zh-CN')}</td>
                <td>
                  <a href="#/orders/${o.id}" class="btn btn-ghost btn-xs" style="text-decoration:none">详情</a>
                  ${o.status === 'pending' ? '<button class="btn btn-xs" style="background:var(--accent-red);color:#fff;border:none;padding:2px 8px;cursor:pointer;font-size:11px" data-cancel="' + o.id + '">取消</button>' : ''}
                </td>
              </tr>`; }).join('')}
          </tbody>
        </table>
      </div>';

    el.querySelectorAll('[data-cancel]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        cancelOrder(parseInt(this.dataset.cancel));
      });
    });

    updatePager(total);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><p>加载失败: ' + err.message + '</p></div>';
  }
}

function updatePager(total) {
  var prev = document.getElementById('orders-prev');
  var next = document.getElementById('orders-next');
  var info = document.getElementById('orders-info');
  if (!prev || !next || !info) return;
  prev.disabled = _currentPage <= 1;
  next.disabled = _currentPage >= _totalPages;
  info.textContent = '第 ' + _currentPage + '/' + _totalPages + ' 页（共' + total + '条）';
}

function formatPrice(o) {
  if (o.payment_method === 'coin') return o.price + ' 修仙币' + (o.discount > 0 ? ' (优惠' + o.discount + '%)' : '');
  if (o.payment_method === 'spirit_stone') return (o.price || 0) + ' 万灵石';
  return '¥' + (o.price || 0).toFixed(2);
}

async function cancelOrder(orderId) {
  if (!confirm('确定取消工单 #' + orderId + '？取消后如果已付费将退还修仙币。')) return;
  try {
    var btn = document.querySelector('[data-cancel="' + orderId + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '取消中...'; }
    var res = await api.request('POST', '/orders/' + orderId + '/cancel');
    if (res && res.ok) {
      toast.success(res.message || '工单已取消');
      loadOrders();
    } else {
      toast.error((res && res.error) || '取消失败');
      if (btn) { btn.disabled = false; btn.textContent = '取消'; }
    }
  } catch (e) { toast.error(e.message); }
}
