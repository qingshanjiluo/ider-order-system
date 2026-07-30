// pages/orders.js 鈥?鎴戠殑宸ュ崟鍒楄〃 + 鏂板缓宸ュ崟

import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

const ORDER_TYPE_LABEL = {
  '浠ｇ粌': '璐拱閭€璇风Н鍒?,
  '浠ｆ墦': '璐拱閭€璇风Н鍒?,
  '鎵樼': '璐拱閭€璇风Н鍒?,
  '浠欑洘閲囬泦': '浠欑洘閲囬泦',
  '璇曠偧娴嬭瘯': '璇曠偧娴嬭瘯',
  '姣忔棩璇曠偧': '姣忔棩璇曠偧',
  '浼犱汉娲惧嚭': '浼犱汉娲惧嚭',
  '鍓湰鍒峰彇': '鍓湰鍒峰彇',
};

const STATUS_MAP = {
  pending: { label: '寰呭鎵?, class: 'badge-pending' },
  approved: { label: '杩涜涓?, class: 'badge-approved' },
  completed: { label: '宸插畬鎴?, class: 'badge-completed' },
  rejected: { label: '宸叉嫆缁?, class: 'badge-rejected' },
  cancelled: { label: '宸插彇娑?, class: 'badge-pending' },
};

let _currentPage = 1;
let _totalPages = 1;
let _currentStatus = '';

const PAYMENT_METHODS = {
  wechat: { label: '鐜伴噾锛堝井淇℃敮浠橈級', unit: '鍏?, icon: '楼' },
  coin: { label: '淇粰甯?, unit: '淇粰甯?, icon: 'B' },
  spirit_stone: { label: '鐏电煶', unit: '涓囩伒鐭?, icon: '鐏? },
};

export async function renderOrders({ container, query }) {
  // 濡傛灉鏈??action=new 鍒欏脊鍑烘柊寤哄伐鍗?  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h2>鎴戠殑宸ュ崟</h2>
          <p>绠＄悊浣犵殑宸ュ崟</p>
        </div>
        <button class="btn btn-primary" id="new-order-btn">+ 鏂板缓宸ュ崟</button>
      </div>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="status-filter">
        <option value="">鍏ㄩ儴鐘舵€?/option>
        <option value="pending">寰呭鎵?/option>
        <option value="approved">杩涜涓?/option>
        <option value="completed">宸插畬鎴?/option>
        <option value="rejected">宸叉嫆缁?/option>
        <option value="cancelled">宸插彇娑?/option>
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
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const res = await api.getOrders(status);
    const orders = res.orders || res || [];

    if (!orders.length) {
      el.innerHTML = `<div class="empty-state"><p>鏆傛棤宸ュ崟</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>璁㈠崟鍙?/th>
              <th>绫诲瀷</th>
              <th>鐘舵€?/th>
              <th>璐﹀彿鏁?/th>
              <th>绉垎</th>
              <th>浠樻鏂瑰紡</th>
              <th>閲戦</th>
              <th>鍒涘缓鏃堕棿</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr style="cursor:pointer" onclick="location.hash='#/orders/${o.id}'">
                <td class="font-mono text-xs">#${o.id}</td>
                <td>${ORDER_TYPE_LABEL[o.order_type] || '璐拱閭€璇风Н鍒?}</td>
                <td><span class="badge ${STATUS_MAP[o.status]?.class || ''}">${STATUS_MAP[o.status]?.label || o.status}</span></td>
                <td>${o.account_count || o.quantity || 0}</td>
                <td class="font-semibold">${o.bonus_points || o.amount || 0}</td>
                <td>${PAYMENT_METHODS[o.payment_method]?.label || o.payment_method || '-'}</td>
                <td class="font-semibold">${formatPrice(o)}</td>
                <td class="text-sm text-muted">${new Date(o.created_at).toLocaleDateString('zh-CN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>鍔犺浇澶辫触: ${err.message}</p></div>`;
  }
}

function formatPrice(order) {
  const method = PAYMENT_METHODS[order.payment_method];
  if (!method) return `楼${(order.price || 0).toFixed(2)}`;
  if (order.payment_method === 'wechat') return `楼${(order.price || 0).toFixed(2)}`;
  if (order.payment_method === 'coin') return `${order.price || 0} 淇粰甯乣;
  if (order.payment_method === 'spirit_stone') return `${order.price || 0} 涓囩伒鐭砢;
  return `楼${(order.price || 0).toFixed(2)}`;
}

async function showNewOrderModal() {
  // 鑾峰彇鐢ㄦ埛淇℃伅锛堜綑棰濓級
  let userBalance = 0;
  try {
    const info = await api.getUserInfo();
    userBalance = info.user?.bonus_points || info.bonus_points || 0;
  } catch (e) { /* ignore */ }

  // 宸ュ崟绫诲瀷閰嶇疆
  const ORDER_TYPES = {
    '浠ｇ粌': { label: '璐拱閭€璇风Н鍒?, priceUnit: '绉垎', needsInvite: true, needsAccount: false, fixedPrice: null },
    '浠欑洘閲囬泦': { label: '浠欑洘閲囬泦', priceUnit: '淇粰甯?, needsInvite: false, needsAccount: true, fixedPrice: 1, fixedMethod: 'coin', desc: '姣忔棩鑷姩棰嗗彇浠欑洘骞跺紑鍚噰闆嗭紙1淇粰甯?鏈堬級' },
    '璇曠偧娴嬭瘯': { label: '璇曠偧娴嬭瘯', priceUnit: '淇粰甯?, needsInvite: false, needsAccount: false, needsAccountName: true, fixedPrice: 0.5, fixedMethod: 'coin', desc: '娴嬭瘯骞惰褰曟渶浣抽厤缃紙0.5淇粰甯?娆★級' },
    '姣忔棩璇曠偧': { label: '姣忔棩璇曠偧', priceUnit: '淇粰甯?, needsInvite: false, needsAccount: true, fixedPrice: 2, fixedMethod: 'coin', desc: '姣忔棩鑷姩瀹屾垚璇曠偧鎸戞垬锛?淇粰甯?鏈堬級' },
    '浼犱汉娲惧嚭': { label: '浼犱汉娲惧嚭', priceUnit: '淇粰甯?, needsInvite: false, needsAccount: true, needsDispatchFields: true, fixedPrice: 1, fixedMethod: 'coin', desc: '姣忔棩鑷姩娲惧嚭浼犱汉閲囬泦鐗╄祫锛?淇粰甯?鏈堬級' },
    '鍓湰鍒峰彇': { label: '鍓湰鍒峰彇', priceUnit: '淇粰甯?, needsInvite: false, needsAccount: true, needsClearType: true, fixedPrice: 3, fixedMethod: 'coin', desc: '鍏ㄥ湴鍥惧壇鏈埛鍙栵紝姣忓浘鎴樻枟2娆¤嚜鍔ㄦ帹杩涳紙3淇粰甯?娆★級' },
  };

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="new-order-form">
      <div class="form-group">
        <label class="form-label">宸ュ崟绫诲瀷 <span style="color:var(--accent-red)">*</span></label>
        <select class="form-select" id="order-type">
          <option value="浠ｇ粌">璐拱閭€璇风Н鍒?/option>
          <option value="浠欑洘閲囬泦">馃彲 浠欑洘閲囬泦锛?淇粰甯?鏈堬級</option>
          <option value="璇曠偧娴嬭瘯">鈿旓笍 璇曠偧娴嬭瘯锛?.5淇粰甯?娆★級</option>
          <option value="姣忔棩璇曠偧">馃棥锔?姣忔棩璇曠偧锛?淇粰甯?鏈堬級</option>
          <option value="浼犱汉娲惧嚭">馃殮 浼犱汉娲惧嚭锛?淇粰甯?鏈堬級</option>
          <option value="鍓湰鍒峰彇">鈿旓笍 鍓湰鍒峰彇锛?淇粰甯?娆★級</option>
        </select>
        <div id="order-type-desc" style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;"></div>
      </div>

      <!-- 浠樻鏂瑰紡锛堣喘涔伴個璇风Н鍒嗘椂鏄剧ず锛?-->
      <div class="form-group" id="payment-method-group-wrap">
        <label class="form-label">浠樻鏂瑰紡 <span style="color:var(--accent-red)">*</span></label>
        <div class="radio-group" id="payment-method-group" style="display:flex;gap:8px;flex-wrap:wrap;">
          <label class="radio-card" style="flex:1;min-width:120px;padding:10px;border:2px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.2s;">
            <input type="radio" name="payment-method" value="wechat" checked style="display:none;">
            <div style="font-size:var(--text-lg);font-weight:600;">楼</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">鐜伴噾锛堝井淇★級</div>
          </label>
          <label class="radio-card" style="flex:1;min-width:120px;padding:10px;border:2px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.2s;">
            <input type="radio" name="payment-method" value="coin" style="display:none;">
            <div style="font-size:var(--text-lg);font-weight:600;">B</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">淇粰甯?(浣? ${userBalance})</div>
          </label>
          <label class="radio-card" style="flex:1;min-width:120px;padding:10px;border:2px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.2s;">
            <input type="radio" name="payment-method" value="spirit_stone" style="display:none;">
            <div style="font-size:var(--text-lg);font-weight:600;">鐏?/div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">鐏电煶</div>
          </label>
        </div>
      </div>

      <!-- 閭€璇风爜 + 绉垎锛堣喘涔伴個璇风Н鍒嗘椂鏄剧ず锛?-->
      <div id="invite-fields-wrap">
        <div class="form-group">
          <label class="form-label">閭€璇风爜 <span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-invite-code" placeholder="杈撳叆閭€璇风爜">
        </div>
        <div class="form-group">
          <label class="form-label">閭€璇风Н鍒嗘暟閲?<span style="color:var(--accent-red)">*</span></label>
          <input type="number" class="form-input" id="order-points" value="10" min="10" step="10">
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">姣?0绉垎 = 1涓?20绾ц处鍙凤紝蹇呴』鏄?0鐨勫€嶆暟</div>
        </div>
      </div>

      <!-- 娓告垙璐﹀彿淇℃伅锛堜粰鐩熼噰闆?姣忔棩璇曠偧鏃舵樉绀猴級 -->
      <div id="game-account-fields-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">娓告垙璐﹀彿鍚?<span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-game-account" placeholder="杈撳叆娓告垙璐﹀彿鍚?>
        </div>
        <div class="form-group">
          <label class="form-label">娓告垙璐﹀彿瀵嗙爜 <span style="color:var(--accent-red)">*</span></label>
          <input type="password" class="form-input" id="order-game-password" placeholder="杈撳叆娓告垙璐﹀彿瀵嗙爜">
        </div>
      </div>

      <!-- 浠呰处鍙峰悕锛堣瘯鐐兼祴璇曟椂鏄剧ず锛?-->
      <div id="account-name-only-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">娓告垙璐﹀彿鍚?<span style="color:var(--accent-red)">*</span></label>
          <input type="text" class="form-input" id="order-game-account-name" placeholder="杈撳叆宸叉敞鍐岀殑娓告垙璐﹀彿鍚?>
        </div>
      </div>

      <!-- 娲惧嚭鍦板浘 + 鐗╄祫绫诲埆锛堜紶浜烘淳鍑烘椂鏄剧ず锛?-->
      <div id="dispatch-fields-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">娲惧嚭鍦板浘 <span style="color:var(--accent-red)">*</span></label>
          <select class="form-select" id="order-dispatch-map">
            <option value="鐏电繝灞辫剦">鐏电繝灞辫剦</option>
            <option value="骞芥殫妫灄">骞芥殫妫灄</option>
            <option value="鍐伴湝宄¤胺">鍐伴湝宄¤胺</option>
            <option value="鐏劙灞?>鐏劙灞?/option>
            <option value="鏄熻景濉?>鏄熻景濉?/option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">鐗╄祫绫诲埆 <span style="color:var(--accent-red)">*</span></label>
          <select class="form-select" id="order-material-type">
            <option value="鐏电煶">鐏电煶</option>
            <option value="鑽潗">鑽潗</option>
            <option value="鐭跨煶">鐭跨煶</option>
            <option value="鏈ㄦ潗">鏈ㄦ潗</option>
          </select>
        </div>
      </div>

      <!-- 鍒峰彇绫诲瀷锛堝壇鏈埛鍙栨椂鏄剧ず锛?-->
      <div id="clear-type-wrap" style="display:none;">
        <div class="form-group">
          <label class="form-label">鍒峰彇绫诲瀷 <span style="color:var(--accent-red)">*</span></label>
          <select class="form-select" id="order-clear-type">
            <option value="鍏ㄧ墿璧?>鍏ㄧ墿璧?鈥?鍓湰濂栧姳鍏ㄩ儴閫夌墿璧?/option>
            <option value="鍏ㄩ樀绾?>鍏ㄩ樀绾?鈥?鍓湰濂栧姳鍏ㄩ儴閫夐樀绾?/option>
            <option value="涓€鍗婁竴鍗?>涓€鍗婁竴鍗?鈥?鐗╄祫鍜岄樀绾瑰悇鍙栦竴鍗?/option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">浼樻儬鐮侊紙閫夊～锛?/label>
        <div style="display:flex;gap:8px;">
          <input type="text" class="form-input" id="order-coupon" placeholder="杈撳叆浼樻儬鐮? style="flex:1;">
          <button type="button" class="btn btn-ghost btn-sm" id="coupon-check-btn">楠岃瘉</button>
        </div>
        <div id="coupon-info" style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;"></div>
      </div>

      <div class="form-group">
        <label class="form-label">澶囨敞锛堥€夊～锛?/label>
        <textarea class="form-textarea" id="order-note" placeholder="鐗规畩瑕佹眰璇峰湪姝よ鏄?></textarea>
      </div>

      <div id="order-price-info" style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="font-weight:600;margin-bottom:8px;">璁㈠崟棰勮</div>
        <div id="price-preview" style="font-size:var(--text-sm);color:var(--text-secondary);"></div>
      </div>
    </form>`;

  // 鈹€鈹€ 宸ュ崟绫诲瀷鍒囨崲閫昏緫 鈹€鈹€
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

    // 鑷姩璁剧疆浠樻鏂瑰紡鍜屼环鏍?    if (cfg.fixedMethod) {
      const radio = body.querySelector(`input[name="payment-method"][value="${cfg.fixedMethod}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
    }
    updatePricePreview();
  }

  modal.open({
    title: '鏂板缓宸ュ崟',
    body,
    confirmText: '鎻愪氦宸ュ崟',
    onConfirm: async () => {
      const order_type = document.getElementById('order-type').value;
      const cfg = ORDER_TYPES[order_type] || {};
      const coupon_code = document.getElementById('order-coupon').value.trim();
      const note = document.getElementById('order-note').value.trim();

      let payment_method, invite_code, points, game_account_name, game_account_password;

      if (cfg.needsInvite) {
        // 璐拱閭€璇风Н鍒?        payment_method = document.querySelector('input[name="payment-method"]:checked')?.value;
        invite_code = document.getElementById('order-invite-code').value.trim();
        points = parseInt(document.getElementById('order-points').value) || 0;
        if (!payment_method) { toast.error('璇烽€夋嫨浠樻鏂瑰紡'); return; }
        if (!invite_code) { toast.error('璇疯緭鍏ラ個璇风爜'); return; }
        if (points < 10 || points % 10 !== 0) { toast.error('绉垎鏁伴噺蹇呴』鏄?0鐨勫€嶆暟'); return; }
      } else {
        // 鏂板伐鍗曠被鍨嬶細鍥哄畾淇粰甯佹敮浠?        payment_method = cfg.fixedMethod || 'coin';
        invite_code = '';
        points = Math.round((cfg.fixedPrice || 0) * 100); // 杞负鏁存暟瀛樺偍
        game_account_name = (document.getElementById('order-game-account') || document.getElementById('order-game-account-name'))?.value?.trim() || '';
        game_account_password = document.getElementById('order-game-password')?.value?.trim() || '';
        if (!game_account_name) { toast.error('璇疯緭鍏ユ父鎴忚处鍙峰悕'); return; }
        if (cfg.needsAccount && !game_account_password) { toast.error('璇疯緭鍏ユ父鎴忚处鍙峰瘑鐮?); return; }
      }

      let dispatch_map, material_type, clear_type;
      if (cfg.needsDispatchFields) {
        dispatch_map = document.getElementById('order-dispatch-map')?.value;
        material_type = document.getElementById('order-material-type')?.value;
        if (!dispatch_map) { toast.error('璇烽€夋嫨娲惧嚭鍦板浘'); return; }
        if (!material_type) { toast.error('璇烽€夋嫨鐗╄祫绫诲埆'); return; }
      }
      if (cfg.needsClearType) {
        clear_type = document.getElementById('order-clear-type')?.value;
        if (!clear_type) { toast.error('璇烽€夋嫨鍒峰彇绫诲瀷'); return; }
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
        toast.success('宸ュ崟鍒涘缓鎴愬姛');
        modal.close();
        loadOrders();
      } catch (err) {
        toast.error(err.message || '鍒涘缓澶辫触');
      }
    },
  });

  // 鈹€鈹€ 宸ュ崟绫诲瀷鍒囨崲浜嬩欢锛堢珛鍗崇粦瀹氾紝涓嶄緷璧栦紭鎯犲埜楠岃瘉锛?鈹€鈹€
  body.querySelector('#order-type').addEventListener('change', handleOrderTypeChange);
  handleOrderTypeChange(); // 鍒濆鍖栨樉绀虹姸鎬?
  // 鈹€鈹€ 浠锋牸瀹炴椂棰勮 鈹€鈹€
  // 缂撳瓨鐏电煶鍏戞崲姣斾緥锛堜粠 config 鑾峰彇锛?  let spiritPer10Cache = 1000000; // 榛樿鍊?  
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

    // 鏂板伐鍗曠被鍨嬶細鍥哄畾浠锋牸棰勮
    if (!cfg.needsInvite) {
      const fixedPrice = cfg.fixedPrice || 0;
      const desc = cfg.desc || '';
      el.innerHTML = `
        <div>绫诲瀷: <strong>${cfg.label}</strong></div>
        <div>浠锋牸: <strong>${fixedPrice} 淇粰甯?/strong>${cfg.needsAccount ? '锛堟湀浠橈級' : '锛堝崟娆★級'}</div>
        ${desc ? `<div style="color:var(--text-tertiary);font-size:var(--text-xs);margin-top:4px;">${desc}</div>` : ''}
      `;
      return;
    }

    // 璐拱閭€璇风Н鍒嗭細绉垎鍒堕瑙?    const pts = parseInt(document.getElementById('order-points')?.value) || 0;
    const method = document.querySelector('input[name="payment-method"]:checked')?.value;
    if (pts < 10) {
      el.innerHTML = '<span style="color:var(--text-muted)">璇峰～鍐欑Н鍒嗘暟閲?/span>';
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
      priceText = `楼${(discountPercent > 0 || fixedAmount > 0) ? final.toFixed(2) : orig.toFixed(2)}`;
      if (discountPercent > 0 || fixedAmount > 0) discountLine = `<div class="text-xs text-muted mt-1">鍘熶环 <s>楼${orig.toFixed(2)}</s> 鈫?瀹炰粯 <strong style="color:var(--accent-green)">楼${final.toFixed(2)}</strong> (鐪?楼${(orig - final).toFixed(2)})</div>`;
    } else if (method === 'coin') {
      const orig = pts;
      const final = Math.round(orig * (100 - discountPercent) / 100);
      priceText = discountPercent > 0 ? `${final} 淇粰甯乣 : `${orig} 淇粰甯乣;
      if (discountPercent > 0) discountLine = `<div class="text-xs text-muted mt-1">鍘熶环 <s>${orig} 淇粰甯?/s> 鈫?瀹炰粯 <strong style="color:var(--accent-green)">${final} 淇粰甯?/strong> (鐪?${orig - final} 淇粰甯?</div>`;
    } else if (method === 'spirit_stone') {
      const spiritPrice = Math.round(pts / 10 * spiritPer10Cache / 10000);
      const final = Math.round(spiritPrice * (100 - discountPercent) / 100);
      priceText = discountPercent > 0 ? `${final.toLocaleString()} 涓囩伒鐭砢 : `${spiritPrice.toLocaleString()} 涓囩伒鐭砢;
      if (discountPercent > 0) discountLine = `<div class="text-xs text-muted mt-1">鍘熶环 <s>${spiritPrice.toLocaleString()} 涓囩伒鐭?/s> 鈫?瀹炰粯 <strong style="color:var(--accent-green)">${final.toLocaleString()} 涓囩伒鐭?/strong></div>`;
    }

    el.innerHTML = `
      <div>绉垎: <strong>${pts}</strong> | 璐﹀彿鏁? <strong>${accounts}</strong></div>
      <div>瀹炰粯: <strong>${priceText}</strong>${discountLine}</div>
    `;
  }

  // 缁戝畾浜嬩欢
  body.querySelectorAll('input[name="payment-method"]').forEach(radio => {
    radio.addEventListener('change', () => {
      body.querySelectorAll('.radio-card').forEach(card => {
        card.style.borderColor = card.querySelector('input').checked ? 'var(--accent-primary)' : 'var(--border)';
        card.style.background = card.querySelector('input').checked ? 'var(--accent-primary-light)' : '';
      });
      updatePricePreview();
    });
    // 鍒濆閫変腑
    if (radio.checked) {
      radio.closest('.radio-card').style.borderColor = 'var(--accent-primary)';
      radio.closest('.radio-card').style.background = 'var(--accent-primary-light)';
    }
  });

  body.querySelector('#order-points').addEventListener('input', updatePricePreview);

  // 浼樻儬鍒搁獙璇?  body.querySelector('#coupon-check-btn').addEventListener('click', async () => {
    const code = body.querySelector('#order-coupon').value.trim();
    const infoEl = body.querySelector('#coupon-info');
    if (!code) { infoEl.textContent = ''; infoEl.dataset.couponType = ''; return; }
    
    try {
      const res = await api.validateCoupon(code);
      if (res.ok) {
        infoEl.style.color = 'var(--accent-green)';
        if (res.coupon_type === 'fixed') {
          infoEl.textContent = `浼樻儬鍒告湁鏁? 鍑忓厤 楼${res.fixed_amount}`;
          infoEl.dataset.couponType = 'fixed';
          infoEl.dataset.fixedAmount = res.fixed_amount;
          delete infoEl.dataset.discountPercent;
        } else {
          infoEl.textContent = `浼樻儬鍒告湁鏁? ${res.discount_percent}% 鎶樻墸`;
          infoEl.dataset.couponType = 'percent';
          infoEl.dataset.discountPercent = res.discount_percent;
          delete infoEl.dataset.fixedAmount;
        }
        updatePricePreview();
      }
    } catch (err) {
      infoEl.style.color = 'var(--accent-red)';
      infoEl.textContent = err.message || '浼樻儬鐮佹棤鏁?;
      delete infoEl.dataset.couponType;
      updatePricePreview();
    }
  });

  updatePricePreview();
}
