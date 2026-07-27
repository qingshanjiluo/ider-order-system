// pages/admin-cs.js — 管理后台 - 客服对话
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

let pollTimer = null;
let activeConvId = null;

function fmtTime(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? d.replace(' ', 'T') : d;
  const date = new Date(dt);
  if (isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export async function renderAdminCs({ container }) {
  container.innerHTML = `
    <div class="page-header"><h2>客服对话</h2><p>处理用户咨询与售后</p></div>
    <div class="filter-bar" style="margin-bottom:12px;">
      <select class="form-select" id="admin-cs-filter">
        <option value="">全部对话</option>
        <option value="open">进行中</option>
        <option value="closed">已关闭</option>
      </select>
    </div>
    <div style="display:flex;gap:16px;height:calc(100vh - 280px);min-height:450px;">
      <div style="width:300px;flex-shrink:0;border:1px solid var(--border-default);border-radius:var(--radius-lg);overflow-y:auto;background:var(--bg-card);" id="admin-cs-list"></div>
      <div style="flex:1;border:1px solid var(--border-default);border-radius:var(--radius-lg);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-card);" id="admin-cs-chat">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:14px;">选择左侧对话开始处理</div>
      </div>
    </div>`;

  document.getElementById('admin-cs-filter').addEventListener('change', e => loadConversations(e.target.value));
  loadConversations();
}

async function loadConversations(status) {
  const listEl = document.getElementById('admin-cs-list');
  if (!listEl) return;
  try {
    const res = await api.adminGetCsConversations(status);
    const convs = res.conversations || [];
    listEl.innerHTML = convs.map(c => {
      const unreadBadge = c.unread > 0 ? `<span style="background:var(--red);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:6px;">${c.unread}</span>` : '';
      const statusIcon = c.status === 'closed' ? '🔒' : '💬';
      return `<div class="admin-cs-item ${activeConvId == c.id ? 'active' : ''}" data-id="${c.id}" style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border-light);transition:background 0.15s;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span>${statusIcon}</span>
          <span style="font-size:13px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(c.user_name || '用户#' + c.user_id)}${unreadBadge}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.subject || '(无标题)')}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.last_msg || '')}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${fmtTime(c.updated_at)}</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.admin-cs-item').forEach(el => {
      el.addEventListener('click', () => openConversation(el.dataset.id));
      el.addEventListener('mouseenter', () => { if (activeConvId != el.dataset.id) el.style.background = 'var(--bg-hover)'; });
      el.addEventListener('mouseleave', () => { if (activeConvId != el.dataset.id) el.style.background = ''; });
    });
  } catch (e) {
    listEl.innerHTML = '<div style="padding:20px;color:var(--red);font-size:13px;">加载失败: ' + e.message + '</div>';
  }
}

async function openConversation(convId) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  activeConvId = convId;
  document.querySelectorAll('.admin-cs-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.admin-cs-item[data-id="${convId}"]`);
  if (item) item.classList.add('active');

  // Get conversation info
  let convInfo = { subject: '', user_name: '', order_id: null };
  try {
    const res = await api.adminGetCsConversations();
    const found = (res.conversations || []).find(c => String(c.id) === String(convId));
    if (found) convInfo = found;
  } catch (e) {}

  const chat = document.getElementById('admin-cs-chat');
  chat.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
    <div style="padding:10px 16px;border-bottom:1px solid var(--border-light);background:var(--bg-base);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div><span style="font-size:14px;font-weight:500;">${escapeHtml(convInfo.user_name || '用户')}</span>
      <span style="font-size:12px;color:var(--text-tertiary);margin-left:8px;">${escapeHtml(convInfo.subject || '')}</span></div>
      <div style="display:flex;gap:6px;">
        ${convInfo.order_id ? `<button class="btn btn-ghost btn-sm" id="admin-cs-refund-btn" data-order="${convInfo.order_id}" style="color:var(--red);">💰 退款</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="admin-cs-close-btn">关闭对话</button>
      </div>
    </div>
    <div id="admin-cs-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;"></div>
    <div style="border-top:1px solid var(--border-light);padding:12px 16px;display:flex;gap:8px;background:var(--bg-base);flex-shrink:0;">
      <input id="admin-cs-input" type="text" placeholder="输入回复..." maxlength="2000" class="form-input" style="flex:1;" autocomplete="off">
      <button id="admin-cs-send-btn" class="btn btn-primary">发送</button>
    </div>
  </div>`;

  async function loadMessages() {
    try {
      const res = await api.getCsMessages(convId);
      const msgs = res.messages || [];
      const msgsEl = document.getElementById('admin-cs-msgs');
      if (!msgsEl) return;
      msgsEl.innerHTML = msgs.map(m => {
        const isAdmin = m.sender_type === 'admin';
        const name = isAdmin ? '客服 ' + (m.sender_name || '') : (m.sender_name || '用户');
        const time = fmtTime(m.created_at);
        if (isAdmin) {
          return `<div style="display:flex;flex-direction:column;align-items:flex-end;max-width:75%;align-self:flex-end;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;"><span style="font-size:10px;color:var(--text-tertiary);">${time}</span><span style="font-size:11px;font-weight:600;color:var(--accent);">${escapeHtml(name)}</span></div>
            <div style="background:var(--primary);color:#fff;padding:10px 14px;border-radius:12px 0 12px 12px;font-size:14px;line-height:1.5;word-break:break-word;">${escapeHtml(m.content)}</div>
          </div>`;
        }
        return `<div style="display:flex;flex-direction:column;align-items:flex-start;max-width:75%;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;"><span style="font-size:11px;font-weight:600;color:var(--text-primary);">${escapeHtml(name)}</span><span style="font-size:10px;color:var(--text-tertiary);">${time}</span></div>
          <div style="background:var(--bg-hover);padding:10px 14px;border-radius:0 12px 12px 12px;font-size:14px;line-height:1.5;color:var(--text-primary);word-break:break-word;">${escapeHtml(m.content)}</div>
        </div>`;
      }).join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;
    } catch (e) { /* ignore */ }
  }

  document.getElementById('admin-cs-send-btn').addEventListener('click', async () => {
    const input = document.getElementById('admin-cs-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      await api.sendCsMessage(convId, content);
      await loadMessages();
    } catch (e) { toast.error(e.message || '发送失败'); }
  });
  document.getElementById('admin-cs-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('admin-cs-send-btn').click();
  });
  document.getElementById('admin-cs-close-btn').addEventListener('click', async () => {
    try {
      await api.updateCsStatus(convId, 'closed');
      toast.success('对话已关闭');
    } catch (e) { toast.error(e.message); }
  });
  const refundBtn = document.getElementById('admin-cs-refund-btn');
  if (refundBtn) {
    refundBtn.addEventListener('click', () => showRefundModal(convId, refundBtn.dataset.order, convInfo));
  }

  await loadMessages();
  pollTimer = setInterval(loadMessages, 3000);
}

function showRefundModal(convId, orderId, convInfo) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group"><label class="form-label">工单编号</label>
      <input type="text" class="form-input" value="#${orderId}" disabled></div>
    <div class="form-group"><label class="form-label">用户</label>
      <input type="text" class="form-input" value="${escapeHtml(convInfo.user_name || '')}" disabled></div>
    <div class="form-group"><label class="form-label">退款金额（修仙币）</label>
      <input type="number" class="form-input" id="refund-amount" placeholder="输入退款数量" min="1"></div>
    <div class="form-group"><label class="form-label">退款原因</label>
      <textarea class="form-textarea" id="refund-reason" placeholder="说明退款原因..." rows="3"></textarea></div>`;

  modal.open({
    title: '申请退款',
    body,
    confirmText: '提交退款申请',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      const amount = parseInt(document.getElementById('refund-amount').value);
      const reason = document.getElementById('refund-reason').value.trim();
      if (!amount || amount < 1) { toast.error('请输入有效金额'); return; }
      if (!reason) { toast.error('请输入退款原因'); return; }
      try {
        await api.submitRefund(convId, { order_id: parseInt(orderId), amount, reason });
        toast.success('退款申请已提交，等待审核');
        modal.close();
      } catch (e) { toast.error(e.message || '提交失败'); }
    },
  });
}
