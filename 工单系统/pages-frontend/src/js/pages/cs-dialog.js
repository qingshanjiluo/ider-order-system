// pages/cs-dialog.js — 客服中心（对话式）
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

let pollTimer = null;

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

export async function renderCsDialog({ container }) {
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div><h2>客服中心</h2><p>与客服人员在线沟通</p></div>
      <button class="btn btn-primary" id="cs-new-btn">新建对话</button>
    </div>
    <div id="cs-main" style="display:flex;gap:16px;height:calc(100vh - 240px);min-height:450px;">
      <div id="cs-conv-list" style="width:280px;flex-shrink:0;border:1px solid var(--border-default);border-radius:var(--radius-lg);overflow-y:auto;background:var(--bg-card);"></div>
      <div id="cs-chat-area" style="flex:1;border:1px solid var(--border-default);border-radius:var(--radius-lg);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-card);">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:14px;">选择左侧对话或创建新对话</div>
      </div>
    </div>`;

  document.getElementById('cs-new-btn').addEventListener('click', showNewDialog);
  loadConversations();
}

async function loadConversations() {
  const listEl = document.getElementById('cs-conv-list');
  if (!listEl) return;
  try {
    const res = await api.getCsConversations();
    const convs = res.conversations || [];
    if (!convs.length) {
      listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无对话<br>点击右上角「新建对话」</div>';
      return;
    }
    listEl.innerHTML = convs.map(c => {
      const statusBadge = c.status === 'closed' ? '<span style="font-size:11px;color:var(--text-tertiary);margin-left:6px;">[已关闭]</span>' : '';
      return `<div class="cs-conv-item" data-id="${c.id}" style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border-light);transition:background 0.15s;">
        <div style="font-size:13px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.subject)}${statusBadge}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.last_msg || '')}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${fmtTime(c.updated_at)}</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.cs-conv-item').forEach(el => {
      el.addEventListener('click', () => openConversation(el.dataset.id));
      el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-hover)');
      el.addEventListener('mouseleave', () => el.style.background = '');
    });
  } catch (e) {
    listEl.innerHTML = '<div style="padding:20px;color:var(--red);font-size:13px;">加载失败: ' + e.message + '</div>';
  }
}

async function openConversation(convId) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  const area = document.getElementById('cs-chat-area');
  if (!area) return;

  // Mark active in list
  document.querySelectorAll('.cs-conv-item').forEach(el => el.style.background = '');
  const activeItem = document.querySelector(`.cs-conv-item[data-id="${convId}"]`);
  if (activeItem) activeItem.style.background = 'var(--bg-hover)';

  area.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
    <div id="cs-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;"></div>
    <div style="border-top:1px solid var(--border-light);padding:12px 16px;display:flex;gap:8px;background:var(--bg-base);">
      <input id="cs-input" type="text" placeholder="输入消息..." maxlength="2000" class="form-input" style="flex:1;" autocomplete="off">
      <button id="cs-send-btn" class="btn btn-primary">发送</button>
      <button id="cs-close-btn" class="btn btn-ghost btn-sm" style="color:var(--red);">关闭对话</button>
    </div>
  </div>`;

  async function loadMessages() {
    try {
      const res = await api.getCsMessages(convId);
      const msgs = res.messages || [];
      const msgsEl = document.getElementById('cs-msgs');
      if (!msgsEl) return;
      msgsEl.innerHTML = msgs.map(m => {
        const isAdmin = m.sender_type === 'admin';
        const name = isAdmin ? '客服 ' + (m.sender_name || '') : (m.sender_name || '用户');
        const time = fmtTime(m.created_at);
        if (isAdmin) {
          return `<div style="display:flex;flex-direction:column;align-items:flex-start;max-width:80%;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;"><span style="font-size:11px;font-weight:600;color:var(--accent);">${escapeHtml(name)}</span><span style="font-size:10px;color:var(--text-tertiary);">${time}</span></div>
            <div style="background:var(--bg-hover);padding:10px 14px;border-radius:0 12px 12px 12px;font-size:14px;line-height:1.5;color:var(--text-primary);word-break:break-word;">${escapeHtml(m.content)}</div>
          </div>`;
        }
        return `<div style="display:flex;flex-direction:column;align-items:flex-end;max-width:80%;align-self:flex-end;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;"><span style="font-size:10px;color:var(--text-tertiary);">${time}</span><span style="font-size:11px;font-weight:600;color:var(--text-primary);">${escapeHtml(name)}</span></div>
          <div style="background:var(--primary);color:#fff;padding:10px 14px;border-radius:12px 0 12px 12px;font-size:14px;line-height:1.5;word-break:break-word;">${escapeHtml(m.content)}</div>
        </div>`;
      }).join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;
    } catch (e) { /* ignore */ }
  }

  document.getElementById('cs-send-btn').addEventListener('click', async () => {
    const input = document.getElementById('cs-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      await api.sendCsMessage(convId, content);
      await loadMessages();
    } catch (e) { toast.error(e.message || '发送失败'); }
  });
  document.getElementById('cs-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('cs-send-btn').click();
  });
  document.getElementById('cs-close-btn').addEventListener('click', async () => {
    try {
      await api.updateCsStatus(convId, 'closed');
      toast.success('对话已关闭');
      loadConversations();
    } catch (e) { toast.error(e.message); }
  });

  await loadMessages();
  pollTimer = setInterval(loadMessages, 3000);
}

function showNewDialog() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group"><label class="form-label">标题</label>
      <input type="text" class="form-input" id="cs-new-subject" placeholder="简单描述问题..." maxlength="200"></div>
    <div class="form-group"><label class="form-label">关联工单（可选）</label>
      <input type="number" class="form-input" id="cs-new-order" placeholder="工单编号"></div>
    <div class="form-group"><label class="form-label">问题描述</label>
      <textarea class="form-textarea" id="cs-new-msg" placeholder="详细描述您的问题..." rows="4" maxlength="5000"></textarea></div>`;

  modal.open({
    title: '新建客服对话',
    body,
    confirmText: '提交',
    onConfirm: async () => {
      const subject = document.getElementById('cs-new-subject').value.trim();
      const order_id = document.getElementById('cs-new-order').value.trim();
      const message = document.getElementById('cs-new-msg').value.trim();
      if (!subject || !message) { toast.error('标题和描述不能为空'); return; }
      try {
        await api.createCsConversation({ subject, order_id: order_id ? parseInt(order_id) : null, message });
        toast.success('对话已创建');
        modal.close();
        loadConversations();
      } catch (e) { toast.error(e.message || '创建失败'); }
    },
  });
}
