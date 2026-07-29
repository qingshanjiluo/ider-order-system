// pages/withdrawals.js — 提现管理
import { api } from '../api.js';
import { toast } from '../components/toast.js';

export async function renderWithdrawals({ container }) {
  container.innerHTML = `
    <div class="page-header"><h2>提现</h2><p>修仙币/灵石兑换现金</p></div>
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:12px">兑换汇率</h3>
      <div id="wd-rates"></div>
      <div style="margin-top:12px">
        <select class="form-select" id="wd-type" style="margin-bottom:8px">
          <option value="coin">修仙币（1500修仙币 = 1元）</option>
          <option value="spirit_stone">灵石（1亿灵石 = 1元）</option>
        </select>
        <div style="color:#888;font-size:12px;margin-bottom:8px" id="wd-balance">加载余额...</div>
        <input class="form-input" id="wd-account" placeholder="收款账号（支付宝/微信/银行卡号）" style="margin-bottom:8px">
        <input class="form-input" id="wd-info" placeholder="收款人姓名（选填）" style="margin-bottom:8px">
        <button class="btn btn-primary" id="wd-submit" disabled>提交提现申请</button>
        <div id="wd-preview" style="margin-top:8px;font-size:12px;color:var(--gold);display:none"></div>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px">提现记录</h3>
      <div id="wd-history"><div class="loading"><div class="spinner"></div></div></div>
    </div>`;

  const rates = await loadRates();
  loadHistory();
  document.getElementById('wd-type').addEventListener('change', updatePreview);
  document.getElementById('wd-submit').addEventListener('click', submitWithdrawal);
}

async function loadRates() {
  try {
    const r = await api.get('/withdrawals');
    const rates = r.rates || {};
    document.getElementById('wd-rates').innerHTML = Object.values(rates).map(rr =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-faint)"><span>${rr.rateText}</span></div>`
    ).join('');
    const type = document.getElementById('wd-type').value;
    const userEl = document.getElementById('wd-balance');
    if (r.balance) {
      const b = type === 'coin' ? (r.balance.bonus_points || 0) : Math.floor((r.balance.spirit_stones || 0) / 10000);
      userEl.textContent = `当前${type === 'coin' ? '修仙币' : '万灵石'}: ${b.toLocaleString()}`;
    }
    return rates;
  } catch {}
}

function updatePreview() {
  const type = document.getElementById('wd-type').value;
  const rate = type === 'coin' ? 1500 : 10000;
  const unit = type === 'coin' ? '修仙币' : '万灵石';
  document.getElementById('wd-preview').style.display = 'block';
  document.getElementById('wd-preview').textContent = `每 1 元 = ${rate} ${unit}`;
}

async function submitWithdrawal() {
  const btn = document.getElementById('wd-submit');
  btn.disabled = true; btn.textContent = '提交中...';
  try {
    const res = await api.post('/withdrawals', {
      cost_type: document.getElementById('wd-type').value,
      account_name: document.getElementById('wd-account').value,
      account_info: document.getElementById('wd-info').value,
    });
    if (res.ok) {
      toast.success('提现申请已提交，等待审核');
      document.getElementById('wd-account').value = '';
      document.getElementById('wd-info').value = '';
      loadHistory();
    } else {
      toast.error(res.error || '提交失败');
    }
  } catch (e) { toast.error(e.message); }
  btn.disabled = false; btn.textContent = '提交提现申请';
}

async function loadHistory() {
  try {
    const r = await api.get('/withdrawals');
    const list = r.withdrawals || [];
    const el = document.getElementById('wd-history');
    if (!list.length) { el.innerHTML = '<div class="empty-state"><p>暂无提现记录</p></div>'; return; }
    el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>时间</th><th>金额</th><th>汇率</th><th>扣除</th><th>状态</th></tr></thead><tbody>
      ${list.map(w => `<tr>
        <td class="text-sm text-muted">${new Date(w.created_at).toLocaleDateString('zh-CN')}</td>
        <td class="font-semibold">${w.amount_rmb} 元</td>
        <td class="text-sm">${w.rate_text}</td>
        <td class="text-sm">${w.cost_amount.toLocaleString()} ${w.cost_type === 'coin' ? '修仙币' : '万灵石'}</td>
        <td><span class="badge ${w.status === 'approved' ? 'badge-completed' : w.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}">${w.status === 'approved' ? '已通过' : w.status === 'rejected' ? '已拒绝' : '审核中'}</span></td>
      </tr>`).join('')}
    </tbody></table></div>`;
  } catch {}
}
