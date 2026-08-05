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
  completed: { label: '已完成', class: 'badge-completed' },
  processing: { label: '挂机中', class: 'badge-approved' },
  rejected: { label: '已拒绝', class: 'badge-rejected' },
  cancelled: { label: '已取消', class: 'badge-pending' },
};

let _currentPage = 1;
let _totalPages = 1;
let _currentStatus = '';

const PAYMENT_METHODS = {
  wechat: { label: '现金（微信支付）', unit: '元', icon: '¥' },
  coin: { label: '修仙币', unit: '修仙币', icon: 'B' },
  spirit_stone: { label: '灵石', unit: '万灵石', icon: '灵' },
};

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

  // 工单类型配置
  const ORDER_TYPES = {
    '代练': { label: '购买邀请积分', priceUnit: '积分', needsInvite: true, needsAccount: false, fixedPrice: null },
    '仙盟采集': { label: '仙盟采集', priceUnit: '修仙币', needsInvite: false, needsAccount: true, fixedPrice: 1, fixedMethod: 'coin', desc: '每日自动领取仙盟并开启采集（1修仙币/月）' },
    '试炼测试': { label: '试炼测试', priceUnit: '修仙币', needsInvite: false, needsAccount: false, needsAccountName: true, fixedPrice: 0.5, fixedMethod: 'coin', desc: '测试并记录最佳配置（0.5修仙币/次）' },
    '每日试炼': { label: '每日试炼', priceUnit: '修仙币', needsInvite: false, needsAccount: true, fixedPrice: 2, fixedMethod: 'coin', desc: '每日自动完成试炼挑战（2修仙币/月）' },
    '传人派出': { label: '传人派出', priceUnit: '修仙币', needsInvite: false, needsAccount: true, needsDispatchFields: true, fixedPrice: 1, fixedMethod: 'coin', desc: '每日自动派出传人采集物资（1修仙币/月）' },
    '副本刷取': { label: '副本刷取', priceUnit: '修仙币', needsInvite: false, needsAccount: true, needsClearType: true, fixedPrice: 3, fixedMethod: 'coin', desc: '全地图副本刷取，每图战斗2次自动推进（3修仙币/次）' },
  };

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="new-order-form">
      <div class="form-group">
        <label class="form-label">工单类型 <span style="color:var(--accent-red)">*</span></label>
        <select class="form-select" id="order-type">
          <option value="代练">购买邀请积分</option>
          <option value="仙盟采集">🏯 仙盟采集（1修仙币/月）</option>
          <option value="试炼测试">⚔️ 试炼测试（0.5修仙币/次）</option>
          <option value="每日试炼">🗡️ 每日试炼（2修仙币/月）</option>
          <option value="传人派出">🚚 传人派出（1修仙币/月）</option>
          <option value="副本刷取">⚔️ 副本刷取（3修仙币/次）</option>
        </select>
        <div id="order-type-desc" style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;"></div>
      </div>

      <!-- 付款方式（购买邀请积分时显示） -->
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
      </div>

      <!-- 邀请码 + 积分（购买邀请积分时显示） -->
      <div id="invite-fields-wrap">
        <div class="form-group">
          <label class="form-label">邀请码 <span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-invite-code" placeholder="输入邀请码">
        </div>
        <div class="form-group">
          <label class="form-label">邀请积分数量 <span style="color:var(--accent-red)">*</span></label>
          <input type="number" class="form-input" id="order-points" value="10" min="10" step="10">
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">每10积分 = 1个120级账号，必须是10的倍数</div>
        </div>
      </div>

      <!-- 游戏账号信息（仙盟采集/每日试炼时显示） -->
      <div id="game-account-fields-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">游戏账号名 <span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-game-account" placeholder="输入游戏账号名">
        </div>
        <div class="form-group">
          <label class="form-label">游戏账号密码 <span style="color:var(--accent-red)">*</span></label>
          <input type="password" class="form-input" id="order-game-password" placeholder="输入游戏账号密码">
        </div>
      </div>

      <!-- 仅账号名（试炼测试时显示） -->
      <div id="account-name-only-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">游戏账号名 <span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-game-account-name" placeholder="输入已注册的游戏账号名">
        </div>
      </div>

      <!-- 派出地图 + 物资类别（传人派出时显示） -->
      <div id="dispatch-fields-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">派出地图 <span style="color:var(--accent-red)">*</span></label>
          <select class="form-select" id="order-dispatch-map">
            <option value="灵翠山脉">灵翠山脉</option>
            <option value="幽暗森林">幽暗森林</option>
            <option value="冰霜峡谷">冰霜峡谷</option>
            <option value="火焰山">火焰山</option>
            <option value="星辰塔">星辰塔</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">物资类别 <span style="color:var(--accent-red)">*</span></label>
          <select class="form-select" id="order-material-type">
            <option value="灵石">灵石</option>
            <option value="药材">药材</option>
            <option value="矿石">矿石</option>
            <option value="木材">木材</option>
          </select>
        </div>
      </div>

      <!-- 刷取类型（副本刷取时显示） -->
      <div id="clear-type-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">刷取类型 <span style="color:var(--accent-red)">*</span></label>
          <select class="form-select" id="order-clear-type">
            <option value="全物资">全物资 — 副本奖励全部选物资</option>
            <option value="全阵纹">全阵纹 — 副本奖励全部选阵纹</option>
            <option value="一半一半">一半一半 — 物资和阵纹各取一半</option>
          </select>
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

  // ── 工单类型切换逻辑 ──
  function handleOrderTypeChange() {
    const type = document.getElementById('order-type').value;
    const cfg = ORDER_TYPES[type] || {};
    const descEl = document.getElementById('order-type-desc');
    const paymentWrap = document.getElementById('payment-method-group-wrap');
    const inviteWrap = document.getElementById('invite-fields-wrap');
    const gameAccWrap = document.getElementById('game-account-fields-wrap');
    const accNameWrap = document.getElementById('account-name-only-wrap');
    const dispatchWrap = document.getElementById('dispatch-fields-wrap');
    const clearWrap = document.getElementById('clear-type-wrap');

    descEl.textContent = cfg.desc || '';
    paymentWrap.style.display = cfg.needsInvite ? '' : 'none';
    inviteWrap.style.display = cfg.needsInvite ? '' : 'none';
    gameAccWrap.style.display = cfg.needsAccount ? '' : 'none';
    accNameWrap.style.display = cfg.needsAccountName ? '' : 'none';
    dispatchWrap.style.display = cfg.needsDispatchFields ? '' : 'none';
    clearWrap.style.display = cfg.needsClearType ? '' : 'none';

    // 自动设置付款方式和价格
    if (cfg.fixedMethod) {
      const radio = body.querySelector(`input[name="payment-method"][value="${cfg.fixedMethod}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
    }
    updatePricePreview();
  }

  modal.open({
    title: '新建工单',
    body,
    confirmText: '提交工单',
    onConfirm: async () => {
      const order_type = document.getElementById('order-type').value;
      const cfg = ORDER_TYPES[order_type] || {};
      const coupon_code = document.getElementById('order-coupon').value.trim();
      const note = document.getElementById('order-note').value.trim();

      let payment_method, invite_code, points, game_account_name, game_account_password;

      if (cfg.needsInvite) {
        // 购买邀请积分
        payment_method = document.querySelector('input[name="payment-method"]:checked')?.value;
        invite_code = document.getElementById('order-invite-code').value.trim();
        points = parseInt(document.getElementById('order-points').value) || 0;
        if (!payment_method) { toast.error('请选择付款方式'); return; }
        if (!invite_code) { toast.error('请输入邀请码'); return; }
        if (points < 10 || points % 10 !== 0) { toast.error('积分数量必须是10的倍数'); return; }
      } else {
        // 新工单类型：固定修仙币支付
        payment_method = cfg.fixedMethod || 'coin';
        invite_code = '';
        points = Math.round((cfg.fixedPrice || 0) * 100); // 转为整数存储
        game_account_name = (document.getElementById('order-game-account') || document.getElementById('order-game-account-name'))?.value?.trim() || '';
        game_account_password = document.getElementById('order-game-password')?.value?.trim() || '';
        if (!game_account_name) { toast.error('请输入游戏账号名'); return; }
        if (cfg.needsAccount && !game_account_password) { toast.error('请输入游戏账号密码'); return; }
      }

      let dispatch_map, material_type, clear_type;
      if (cfg.needsDispatchFields) {
        dispatch_map = document.getElementById('order-dispatch-map')?.value;
        material_type = document.getElementById('order-material-type')?.value;
        if (!dispatch_map) { toast.error('请选择派出地图'); return; }
        if (!material_type) { toast.error('请选择物资类别'); return; }
      }
      if (cfg.needsClearType) {
        clear_type = document.getElementById('order-clear-type')?.value;
        if (!clear_type) { toast.error('请选择刷取类型'); return; }
      }

      try {
        const payload = {
          order_type,
          payment_method,
          invite_code,
          points,
          coupon_code: coupon_code || undefined,
          note: note || undefined,
        };
        if (game_account_name) payload.game_account_name = game_account_name;
        if (game_account_password) payload.game_account_password = game_account_password;
        if (dispatch_map) payload.dispatch_map = dispatch_map;
        if (material_type) payload.material_type = material_type;
        if (clear_type) payload.clear_type = clear_type;
        const res = await api.createOrder(payload);
        toast.success('工单创建成功');
        modal.close();
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

  // ── 工单类型切换事件（立即绑定，不依赖优惠券验证） ──
  body.querySelector('#order-type').addEventListener('change', handleOrderTypeChange);
  handleOrderTypeChange(); // 初始化显示状态

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

    const orderType = document.getElementById('order-type').value;
    const cfg = ORDER_TYPES[orderType] || {};

    // 新工单类型：固定价格预览
    if (!cfg.needsInvite) {
      const fixedPrice = cfg.fixedPrice || 0;
      const desc = cfg.desc || '';
      el.innerHTML = `
        <div>类型: <strong>${cfg.label}</strong></div>
        <div>价格: <strong>${fixedPrice} 修仙币</strong>${cfg.needsAccount ? '（月付）' : '（单次）'}</div>
        ${desc ? `<div style="color:var(--text-tertiary);font-size:var(--text-xs);margin-top:4px;">${desc}</div>` : ''}
      `;
      return;
    }

    // 购买邀请积分：积分制预览
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

    el.innerHTML = `
      <div>积分: <strong>${pts}</strong> | 账号数: <strong>${accounts}</strong></div>
      <div>实付: <strong>${priceText}</strong>${discountLine}</div>
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

