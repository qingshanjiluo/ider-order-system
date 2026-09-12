// pages/orders.js — 我的工单列表 + 新建工单
//
// 平台只保留「购买邀请积分」一种工单：
//   - 新建工单不再提供其它类型选项；
//   - 修仙币支付即时扣款并自动通过（后端直接置为 approved）。

import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

// 邀请积分工单在历史数据中以 代练 / 代打 / 托管 三种写法存储；
// 已下线的旧类型保留映射，仅用于展示历史工单（不可再新建）。
const ORDER_TYPE_LABEL = {
  '代练': '购买邀请积分',
  '代打': '购买邀请积分',
  '托管': '购买邀请积分',
  '仙盟采集': '仙盟采集（已下线）',
  '试炼测试': '试炼测试（已下线）',
  '每日试炼': '每日试炼（已下线）',
  '传人派出': '传人派出（已下线）',
  '副本刷取': '副本刷取（已下线）',
};

// 新建工单的固定类型（后端白名单：代练 / 代打 / 托管）
const NEW_ORDER_TYPE = '代练';

const STATUS_MAP = {
  pending: { label: '待审批', class: 'badge-pending' },
  approved: { label: '进行中', class: 'badge-approved' },
  completed: { label: '已完成', class: 'badge-completed' },
  processing: { label: '挂机中', class: 'badge-approved' },
  rejected: { label: '已拒绝', class: 'badge-rejected' },
  cancelled: { label: '已取消', class: 'badge-pending' },
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
      ${skeletonRows(3)}
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

async function loadOrders() {
  const el = document.getElementById('orders-list');
  if (!el) return;
  el.innerHTML = skeletonRows(3);

  try {
    const res = await api.getOrders(_currentStatus, _currentPage);
    const orders = res.orders || [];
    const total = res.total || 0;
    _totalPages = Math.ceil(total / 20) || 1;
    if (!orders.length) {
      el.innerHTML = `<div class="empty-state"><p>暂无工单</p></div>`;
      updatePager(total);
      return;
    }

    el.innerHTML = orders.map(o => `
      <div class="order-card" data-order-id="${o.id}">
        <div class="order-card-head">
          <span class="font-mono text-xs">#${o.id}</span>
          <span class="badge ${(STATUS_MAP[o.status]||{}).class || ''}">${(STATUS_MAP[o.status]||{}).label || o.status}</span>
        </div>
        <div class="order-card-body">
          <div class="order-card-grid">
            <div class="oc-item"><span class="oc-label">类型</span><span class="oc-value">${ORDER_TYPE_LABEL[o.order_type] || '购买邀请积分'}</span></div>
            <div class="oc-item"><span class="oc-label">账号数</span><span class="oc-value">${o.account_count || o.quantity || 0}</span></div>
            <div class="oc-item"><span class="oc-label">积分</span><span class="oc-value">${o.bonus_points || 0}</span></div>
            <div class="oc-item"><span class="oc-label">付款</span><span class="oc-value">${formatPrice(o)}</span></div>
            <div class="oc-item"><span class="oc-label">创建</span><span class="oc-value">${new Date(o.created_at).toLocaleDateString('zh-CN')}</span></div>
          </div>
        </div>
        <div class="order-card-foot">
          <a href="#/orders/${o.id}" class="btn btn-ghost btn-xs" style="text-decoration:none">详情</a>
          ${o.status === 'pending' ? '<button class="btn btn-xs" style="background:var(--accent-red);color:#fff;border:none;padding:2px 8px;cursor:pointer;font-size:11px" data-cancel="' + o.id + '">取消</button>' : ''}
        </div>
      </div>
    `).join('');

    // 取消按钮事件（修复：之前未绑定导致无法取消）
    el.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => cancelOrder(btn.dataset.cancel));
    });

    updatePager(total);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}

async function showNewOrderModal() {
  // 获取用户信息（余额）— 优先用本地缓存立即打开弹窗，余额随后异步刷新
  let userBalance = 0;
  let cachedUser = null;
  try {
    cachedUser = JSON.parse(localStorage.getItem('ider_user') || 'null');
    userBalance = cachedUser?.bonus_points || 0;
  } catch (e) { /* ignore */ }

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="new-order-form">
      <div class="form-group">
        <label class="form-label">工单类型</label>
        <input type="text" class="form-input" value="购买邀请积分" readonly disabled>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">平台仅提供购买邀请积分工单</div>
      </div>

      <!-- 付款方式 -->
      <div class="form-group" id="payment-method-group-wrap">
        <label class="form-label">付款方式 <span style="color:var(--accent-red)">*</span></label>
        <div class="radio-group" id="payment-method-group" style="display:flex;gap:8px;flex-wrap:wrap;">
          <label class="radio-card" style="flex:1;min-width:120px;padding:10px;border:2px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.2s;">
            <input type="radio" name="payment-method" value="wechat" checked style="display:none;">
            <div style="font-size:var(--text-lg);font-weight:600;">¥</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">现金（微信）</div>
          </label>
          <label class="radio-card" style="flex:1;min-width:120px;padding:10px;border:2px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.2s;">
            <input type="radio" name="payment-method" value="coin" style="display:none;">
            <div style="font-size:var(--text-lg);font-weight:600;">B</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">修仙币 (余: ${userBalance})</div>
          </label>
          <label class="radio-card" style="flex:1;min-width:120px;padding:10px;border:2px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.2s;">
            <input type="radio" name="payment-method" value="spirit_stone" style="display:none;">
            <div style="font-size:var(--text-lg);font-weight:600;">灵</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">灵石</div>
          </label>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">修仙币支付即时扣款并自动通过，无需等待审核</div>
      </div>

      <!-- 邀请码 + 积分 -->
      <div id="invite-fields-wrap">
        <div class="form-group">
          <label class="form-label">邀请码 <span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-invite-code" placeholder="输入邀请码">
        </div>
        <div class="form-group">
          <label class="form-label">邀请积分数量 <span style="color:var(--accent-red)">*</span></label>
          <input type="number" class="form-input" id="order-points" value="10" min="10" max="500" step="10">
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">每10积分 = 1个120级账号，必须是10的倍数，单工单最多500积分</div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">优惠码（选填）</label>
        <div style="display:flex;gap:8px;">
          <input type="text" class="form-input" id="order-coupon" placeholder="输入优惠码" style="flex:1;">
          <button type="button" class="btn btn-ghost btn-sm" id="coupon-check-btn">验证</button>
        </div>
        <div id="coupon-info" style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;"></div>
      </div>

      <div class="form-group">
        <label class="form-label">备注（选填）</label>
        <textarea class="form-textarea" id="order-note" placeholder="特殊要求请在此说明"></textarea>
      </div>

      <div id="order-price-info" style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="font-weight:600;margin-bottom:8px;">订单预览</div>
        <div id="price-preview" style="font-size:var(--text-sm);color:var(--text-secondary);"></div>
      </div>
    </form>`;

  modal.open({
    title: '新建工单',
    body,
    confirmText: '提交工单',
    onConfirm: async () => {
      const coupon_code = document.getElementById('order-coupon').value.trim();
      const note = document.getElementById('order-note').value.trim();
      const payment_method = document.querySelector('input[name="payment-method"]:checked')?.value;
      const invite_code = document.getElementById('order-invite-code').value.trim();
      const points = parseInt(document.getElementById('order-points').value) || 0;

      if (!payment_method) { toast.error('请选择付款方式'); return; }
      if (!invite_code) { toast.error('请输入邀请码'); return; }
      if (points < 10 || points % 10 !== 0) { toast.error('积分数量必须是10的倍数'); return; }
      if (points > 500) { toast.error('单个工单最多500积分'); return; }

      try {
        const res = await api.createOrder({
          order_type: NEW_ORDER_TYPE,
          payment_method,
          invite_code,
          points,
          coupon_code: coupon_code || undefined,
          note: note || undefined,
        });
        toast.success(res.message || '工单创建成功');
        modal.close();
        // 刷新用户余额（扣除修仙币后同步本地存储）
        try {
          const info = await api.getUserInfo();
          const fresh = info.user || info;
          localStorage.setItem('ider_user', JSON.stringify(fresh));
        } catch (e) { /* 保持原值 */ }
        loadOrders();
      } catch (err) {
        toast.error(err.message || '创建失败');
      }
    },
  });

  // 异步刷新修仙币余额（不阻塞弹窗打开）
  (async () => {
    try {
      const info = await api.getUserInfo();
      const fresh = info.user?.bonus_points || info.bonus_points || 0;
      if (fresh !== userBalance) {
        const label = body.querySelector('label.radio-card input[value="coin"]')?.closest('label');
        const divs = label ? label.querySelectorAll('div') : [];
        if (divs.length >= 2) {
          divs[divs.length - 1].textContent = `修仙币 (余: ${fresh})`;
        }
        userBalance = fresh;
      }
    } catch (e) { /* 保持缓存值 */ }
  })();

  // ── 价格实时预览 ──
  // 缓存灵石兑换比例（从 config 获取）
  let spiritPer10Cache = 1000000; // 默认值

  async function loadSpiritConfig() {
    try {
      const cfg = await api.getPublicConfig();
      const val = cfg?.config?.spirit_stone_per_10_points || cfg?.spirit_stone_per_10_points;
      if (val) spiritPer10Cache = parseInt(val);
    } catch (e) { /* use default */ }
  }
  loadSpiritConfig();

  function updatePricePreview() {
    const el = document.getElementById('price-preview');
    if (!el) return;

    const pts = parseInt(document.getElementById('order-points')?.value) || 0;
    const method = document.querySelector('input[name="payment-method"]:checked')?.value;
    if (pts < 10) {
      el.innerHTML = '<span style="color:var(--text-muted)">请填写积分数量</span>';
      return;
    }

    const accounts = Math.ceil(pts / 10);
    const couponInfo = document.getElementById('coupon-info');
    const discountPercent = couponInfo?.dataset?.couponType === 'percent' ? parseInt(couponInfo.dataset.discountPercent) : 0;
    const fixedAmount = couponInfo?.dataset?.couponType === 'fixed' ? parseFloat(couponInfo.dataset.fixedAmount) : 0;

    let priceText = '';
    let discountLine = '';
    if (method === 'wechat') {
      const orig = pts / 120;
      const final = fixedAmount > 0 ? Math.max(0, orig - fixedAmount) : orig * (100 - discountPercent) / 100;
      priceText = `¥${(discountPercent > 0 || fixedAmount > 0) ? final.toFixed(2) : orig.toFixed(2)}`;
      if (discountPercent > 0 || fixedAmount > 0) discountLine = `<div class="text-xs text-muted mt-1">原价 <s>¥${orig.toFixed(2)}</s> → 实付 <strong style="color:var(--accent-green)">¥${final.toFixed(2)}</strong> (省 ¥${(orig - final).toFixed(2)})</div>`;
    } else if (method === 'coin') {
      const orig = pts;
      const final = Math.round(orig * (100 - discountPercent) / 100);
      priceText = discountPercent > 0 ? `${final} 修仙币` : `${orig} 修仙币`;
      if (discountPercent > 0) discountLine = `<div class="text-xs text-muted mt-1">原价 <s>${orig} 修仙币</s> → 实付 <strong style="color:var(--accent-green)">${final} 修仙币</strong> (省 ${orig - final} 修仙币)</div>`;
    } else if (method === 'spirit_stone') {
      const spiritPrice = Math.round(pts / 10 * spiritPer10Cache / 10000);
      const final = Math.round(spiritPrice * (100 - discountPercent) / 100);
      priceText = discountPercent > 0 ? `${final.toLocaleString()} 万灵石` : `${spiritPrice.toLocaleString()} 万灵石`;
      if (discountPercent > 0) discountLine = `<div class="text-xs text-muted mt-1">原价 <s>${spiritPrice.toLocaleString()} 万灵石</s> → 实付 <strong style="color:var(--accent-green)">${final.toLocaleString()} 万灵石</strong></div>`;
    }

    const autoHint = method === 'coin' ? '<div class="text-xs" style="color:var(--accent-green);margin-top:4px;">修仙币支付将自动通过并立即开始处理</div>' : '';
    el.innerHTML = `
      <div>积分: <strong>${pts}</strong> | 账号数: <strong>${accounts}</strong></div>
      <div>实付: <strong>${priceText}</strong>${discountLine}</div>
      ${autoHint}
    `;
  }

  // 绑定事件
  body.querySelectorAll('input[name="payment-method"]').forEach(radio => {
    radio.addEventListener('change', () => {
      body.querySelectorAll('.radio-card').forEach(card => {
        card.style.borderColor = card.querySelector('input').checked ? 'var(--accent-primary)' : 'var(--border)';
        card.style.background = card.querySelector('input').checked ? 'var(--accent-primary-light)' : '';
      });
      updatePricePreview();
    });
    // 初始选中
    if (radio.checked) {
      radio.closest('.radio-card').style.borderColor = 'var(--accent-primary)';
      radio.closest('.radio-card').style.background = 'var(--accent-primary-light)';
    }
  });

  body.querySelector('#order-points').addEventListener('input', updatePricePreview);

  // 优惠券验证
  body.querySelector('#coupon-check-btn').addEventListener('click', async () => {
    const code = body.querySelector('#order-coupon').value.trim();
    const infoEl = body.querySelector('#coupon-info');
    if (!code) { infoEl.textContent = ''; infoEl.dataset.couponType = ''; return; }

    try {
      const res = await api.validateCoupon(code);
      if (res.ok) {
        infoEl.style.color = 'var(--accent-green)';
        if (res.coupon_type === 'fixed') {
          infoEl.textContent = `优惠券有效: 减免 ¥${res.fixed_amount}`;
          infoEl.dataset.couponType = 'fixed';
          infoEl.dataset.fixedAmount = res.fixed_amount;
          delete infoEl.dataset.discountPercent;
        } else {
          infoEl.textContent = `优惠券有效: ${res.discount_percent}% 折扣`;
          infoEl.dataset.couponType = 'percent';
          infoEl.dataset.discountPercent = res.discount_percent;
          delete infoEl.dataset.fixedAmount;
        }
        updatePricePreview();
      }
    } catch (err) {
      infoEl.style.color = 'var(--accent-red)';
      infoEl.textContent = err.message || '优惠码无效';
      delete infoEl.dataset.couponType;
      updatePricePreview();
    }
  });

  updatePricePreview();
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
  if (!confirm('确定取消工单 #' + orderId + '？')) return;
  try {
    var res = await api.request('POST', '/orders/' + orderId + '/cancel');
    if (res && res.ok) {
      toast.success(res.message || '工单已取消');
      loadOrders();
    } else {
      toast.error((res && res.error) || '取消失败');
    }
  } catch (e) { toast.error(e.message); }
}
