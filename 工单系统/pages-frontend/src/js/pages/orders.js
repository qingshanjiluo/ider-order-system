// pages/orders.js — 我的工单列表 + 新建工单

import { api } from '../api.js';
import { icon } from '../icons.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

const STATUS_MAP = {
  pending: { label: '待审批', class: 'badge-pending' },
  approved: { label: '进行中', class: 'badge-approved' },
  completed: { label: '已完成', class: 'badge-completed' },
  rejected: { label: '已拒绝', class: 'badge-rejected' },
  cancelled: { label: '已取消', class: 'badge-pending' },
};

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
          <p>管理你的服务工单</p>
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
    </div>`;

  document.getElementById('new-order-btn').addEventListener('click', showNewOrderModal);
  document.getElementById('status-filter').addEventListener('change', (e) => loadOrders(e.target.value));

  loadOrders();

  if (query?.action === 'new') {
    showNewOrderModal();
  }
}

async function loadOrders(status = '') {
  const el = document.getElementById('orders-list');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const res = await api.getOrders(status);
    const orders = res.orders || res || [];

    if (!orders.length) {
      el.innerHTML = `<div class="empty-state"><p>暂无工单</p></div>`;
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
              <th>付款方式</th>
              <th>金额</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td class="font-mono text-xs" style="cursor:pointer" onclick="location.hash='#/orders/${o.id}'">#${o.id}</td>
                <td style="cursor:pointer" onclick="location.hash='#/orders/${o.id}'">${o.order_type || '购买邀请积分'}</td>
                <td><span class="badge ${STATUS_MAP[o.status]?.class || ''}">${STATUS_MAP[o.status]?.label || o.status}</span></td>
                <td>${o.account_count || o.quantity || 0}</td>
                <td class="font-semibold">${o.bonus_points || o.amount || 0}</td>
                <td>${PAYMENT_METHODS[o.payment_method]?.label || o.payment_method || '-'}</td>
                <td class="font-semibold">${formatPrice(o)}</td>
                <td class="text-sm text-muted">${new Date(o.created_at).toLocaleDateString('zh-CN')}</td>
                <td>${o.status === 'pending' ? `<button class="btn btn-ghost btn-xs" style="color:var(--accent-red);font-size:0.75em;" data-cancel-id="${o.id}">撤回</button>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  
      // 绑定撤回按钮
      el.querySelectorAll('[data-cancel-id]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.cancelId;
          if (!confirm('确定要撤回此工单吗？退款将即时到账。')) return;
          try {
            await api.cancelOrder(id);
            toast.success('工单已撤回，退款已到账');
            loadOrders(status);
          } catch (err) {
            toast.error(err.message || '撤回失败');
          }
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
    }
  }

function formatPrice(order) {
  const method = PAYMENT_METHODS[order.payment_method];
  if (!method) return `¥${(order.price || 0).toFixed(2)}`;
  if (order.payment_method === 'wechat') return `¥${(order.price || 0).toFixed(2)}`;
  if (order.payment_method === 'coin') return `${order.price || 0} 修仙币`;
  if (order.payment_method === 'spirit_stone') return `${order.price || 0} 万灵石`;
  return `¥${(order.price || 0).toFixed(2)}`;
}

async function showNewOrderModal() {
  // 获取用户信息（余额 + 免费试用额度）
  let userBalance = 0;
  let freeTrialBalance = 0;
  try {
    const info = await api.getUserInfo();
    userBalance = info.user?.bonus_points || info.bonus_points || 0;
    freeTrialBalance = info.user?.free_trial_balance || 0;
  } catch (e) { /* ignore */ }

  // 工单类型配置
  const ORDER_TYPES = {
    '购买邀请积分': { label: '购买邀请积分', priceUnit: 'auto', needsInvite: true, needsAccount: false, fixedPrice: null, desc: '自动注册账号并挂机到120级（需填写邀请码）' },
    '仙盟采集': { label: '仙盟采集', priceUnit: '修仙币', needsInvite: false, needsAccount: true, fixedPrice: 1, fixedMethod: 'coin', desc: '每日自动领取仙盟并开启采集（1修仙币/月）' },
    '试炼测试': { label: '试炼测试', priceUnit: '修仙币', needsInvite: false, needsAccount: true, fixedPrice: 0.5, fixedMethod: 'coin', desc: '测试并记录最佳试炼配置（0.5修仙币/次）' },
    '每日试炼': { label: '每日试炼', priceUnit: '修仙币', needsInvite: false, needsAccount: true, fixedPrice: 2, fixedMethod: 'coin', desc: '每日自动完成试炼挑战（2修仙币/月）' },
  };

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="new-order-form">
      <div class="form-group">
        <label class="form-label">工单类型 <span style="color:var(--accent-red)">*</span></label>
        <select class="form-select" id="order-type">
        <option value="购买邀请积分">${icon('money', 14)} 购买邀请积分（自动注册+挂机到120级）</option>
        <option value="仙盟采集">${icon('castle', 14)} 仙盟采集（1修仙币/月）</option>
        <option value="试炼测试">${icon('swords', 14)} 试炼测试（0.5修仙币/次）</option>
        <option value="每日试炼">${icon('sword', 14)} 每日试炼（2修仙币/月）</option>
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
            ${freeTrialBalance > 0 ? `<div style="font-size:var(--text-xs);color:var(--accent-green);margin-top:2px;">${icon('gift', 14)} 试用: ${freeTrialBalance}</div>` : ''}
          </label>
          <label class="radio-card" style="flex:1;min-width:120px;padding:10px;border:2px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.2s;">
            <input type="radio" name="payment-method" value="spirit_stone" style="display:none;">
            <div style="font-size:var(--text-lg);font-weight:600;">灵</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">灵石</div>
          </label>
        </div>
      </div>

      <!-- 购买邀请积分：邀请码 + 积分数量 -->
      <div id="invite-fields-wrap">
        <div class="form-group">
          <label class="form-label">邀请码 <span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-invite-code" placeholder="输入邀请码">
        </div>
        <div class="form-group">
          <label class="form-label">购买积分数量 <span style="color:var(--accent-red)">*</span></label>
          <input type="number" class="form-input" id="order-points" value="100" min="10" step="10">
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">每10积分 = 1个120级账号，必须是10的倍数</div>
        </div>
      </div>

      <!-- 游戏账号信息（仙盟采集/试炼测试/每日试炼时显示） -->
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

    descEl.textContent = cfg.desc || '';
    paymentWrap.style.display = cfg.needsInvite ? '' : 'none';
    inviteWrap.style.display = cfg.needsInvite ? '' : 'none';
    gameAccWrap.style.display = cfg.needsAccount ? '' : 'none';

    // 自动设置付款方式
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
        // 购买邀请积分：用户选择付款方式和数量
        payment_method = document.querySelector('input[name="payment-method"]:checked')?.value;
        invite_code = document.getElementById('order-invite-code').value.trim();
        points = parseInt(document.getElementById('order-points').value) || 0;
        if (!payment_method) { toast.error('请选择付款方式'); return; }
        if (!invite_code) { toast.error('请输入邀请码'); return; }
        if (points < 10 || points % 10 !== 0) { toast.error('积分数量必须是10的倍数'); return; }
      } else {
        // 仙盟采集/试炼测试/每日试炼：固定修仙币支付
        payment_method = cfg.fixedMethod || 'coin';
        invite_code = '';
        points = Math.round((cfg.fixedPrice || 0) * 100); // 转为整数存储
        game_account_name = document.getElementById('order-game-account')?.value?.trim() || '';
        game_account_password = document.getElementById('order-game-password')?.value?.trim() || '';
        if (!game_account_name) { toast.error('请输入游戏账号名'); return; }
        if (!game_account_password) { toast.error('请输入游戏账号密码'); return; }
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
        const res = await api.createOrder(payload);
        toast.success('工单创建成功');
        modal.close();
        loadOrders();
      } catch (err) {
        toast.error(err.message || '创建失败');
      }
    },
  });

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

    // 固定价格预览（仙盟采集/试炼测试/每日试炼）
    if (cfg.fixedPrice !== null && cfg.fixedPrice !== undefined) {
      const fixedPrice = cfg.fixedPrice || 0;
      const desc = cfg.desc || '';
      // 免费试用抵扣预览
      let trialInfo = '';
      if (freeTrialBalance > 0 && cfg.fixedMethod === 'coin') {
        const trialDeduct = Math.min(freeTrialBalance, fixedPrice);
        const realCost = fixedPrice - trialDeduct;
        if (trialDeduct > 0) {
          trialInfo = `<div style="color:var(--accent-green);font-size:var(--text-xs);margin-top:4px;">${icon('gift', 14)} 免费试用抵扣 ${trialDeduct} 修仙币${realCost > 0 ? `，实际扣 ${realCost} 修仙币` : '，免费！'}</div>`;
        }
      }
      el.innerHTML = `
        <div>类型: <strong>${cfg.label}</strong></div>
        <div>价格: <strong>${fixedPrice} 修仙币</strong>${cfg.needsAccount ? '（月付）' : '（单次）'}</div>
        ${trialInfo}
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
    let originalPrice = 0;
    let priceUnit = '';
    let priceText = '';
    
    if (method === 'wechat') {
      originalPrice = pts / 120;
      priceUnit = '元';
      priceText = `¥${originalPrice.toFixed(2)}`;
    } else if (method === 'coin') {
      originalPrice = pts;
      priceUnit = '修仙币';
      priceText = `${pts} 修仙币`;
    } else if (method === 'spirit_stone') {
      originalPrice = Math.round(pts / 10 * spiritPer10Cache / 10000);
      priceUnit = '万灵石';
      priceText = `${originalPrice.toLocaleString()} 万灵石`;
    }

    // 计算优惠后的价格
    const couponInfo = document.getElementById('coupon-info');
    let finalPrice = originalPrice;
    let discountText = '';
    let hasDiscount = false;
    
    if (couponInfo?.dataset?.couponType) {
      hasDiscount = true;
      if (couponInfo.dataset.couponType === 'percent') {
        const pct = parseFloat(couponInfo.dataset.discountPercent) || 0;
        finalPrice = originalPrice * (1 - pct / 100);
        discountText = `(优惠 ${pct}%)`;
      } else {
        const fixedAmt = parseFloat(couponInfo.dataset.fixedAmount) || 0;
        finalPrice = Math.max(0, originalPrice - fixedAmt);
        discountText = `(减免 ${fixedAmt} ${priceUnit})`;
      }
    }

    // 构建价格显示
    let priceDisplay = `<strong>${priceText}</strong>`;
    if (hasDiscount) {
      let finalText = '';
      if (method === 'wechat') {
        finalText = `¥${finalPrice.toFixed(2)}`;
      } else if (method === 'coin') {
        finalText = `${Math.round(finalPrice)} 修仙币`;
      } else if (method === 'spirit_stone') {
        finalText = `${Math.round(finalPrice).toLocaleString()} 万灵石`;
      }
      priceDisplay = `<s style="color:var(--text-muted)">${priceText}</s> <strong style="color:var(--accent-green)">${finalText}</strong> ${discountText}`;
    }

    // 免费试用抵扣预览（仅修仙币支付）
    let trialInfo = '';
    if (method === 'coin' && freeTrialBalance > 0) {
      const trialDeduct = Math.min(freeTrialBalance, Math.round(finalPrice));
      if (trialDeduct > 0) {
        const realCost = Math.round(finalPrice) - trialDeduct;
        trialInfo = `<div style="color:var(--accent-green);font-size:var(--text-xs);margin-top:4px;">${icon('gift', 14)} 免费试用抵扣 ${trialDeduct} 修仙币${realCost > 0 ? `，实际扣 ${realCost} 修仙币` : '，免费！'}</div>`;
      }
    }
    
    el.innerHTML = `
      <div>积分: <strong>${pts}</strong> | 账号数: <strong>${accounts}</strong></div>
      <div>价格: ${priceDisplay}</div>
      ${trialInfo}
      <div style="color:var(--text-tertiary);font-size:var(--text-xs);margin-top:4px;">审核通过后自动注册账号并挂机到120级</div>
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
