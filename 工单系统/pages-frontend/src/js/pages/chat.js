// pages/chat.js — 修仙聊天室

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F0B27A', '#82E0AA', '#F1948A', '#85929E', '#73C6B6',
];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function fmtTime(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? d.replace(' ', 'T') : d;
  const date = new Date(dt);
  if (isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export async function renderChat({ container }) {
  const html = `
  <div class="page-header">
    <h2>修仙聊天室</h2>
    <p>与各位道友交流心得</p>
  </div>
  <div class="chat-room" style="display:flex;flex-direction:column;height:calc(100vh - 200px);min-height:400px;border:1px solid var(--border-default);border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-card);">
    <div id="chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;"></div>
    <div style="border-top:1px solid var(--border-light);padding:12px 16px;display:flex;gap:8px;background:var(--bg-base);">
      <input id="chat-input" type="text" placeholder="输入消息..." maxlength="500" class="form-input" style="flex:1;" autocomplete="off">
      <button id="chat-send-btn" class="btn btn-primary">发送</button>
    </div>
  </div>`;

  container.innerHTML = html;

  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  let lastId = 0;
  let polling = true;

  async function loadMessages() {
    try {
      const { api } = await import('../api.js');
      const res = await api.get('/chat/messages');
      const msgs = res.messages || [];
      if (msgs.length === 0) {
        messagesEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:14px;">暂无消息，发送第一条吧</div>';
        return;
      }
      const newLastId = msgs[msgs.length - 1]?.id || 0;
      if (newLastId === lastId) return;
      lastId = newLastId;

      messagesEl.innerHTML = msgs.map(m => {
        const initial = (m.username || '?')[0];
        const color = avatarColor(m.username || '');
        const isSelf = false;
        return `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:4px 0;">
            <div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;flex-shrink:0;">${initial}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:baseline;gap:8px;">
                <span style="font-size:13px;font-weight:600;color:${color};">${m.username}</span>
                <span style="font-size:11px;color:var(--text-tertiary);">${fmtTime(m.created_at)}</span>
              </div>
              <p style="margin:2px 0 0;font-size:14px;line-height:1.5;color:var(--text-primary);word-break:break-word;">${escapeHtml(m.content)}</p>
            </div>
          </div>`;
      }).join('');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (e) { /* ignore polling errors */ }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function sendMessage() {
    const content = inputEl.value.trim();
    if (!content) return;
    inputEl.value = '';
    try {
      const { api } = await import('../api.js');
      await api.post('/chat/send', { content });
      await loadMessages();
    } catch (err) {
      const { toast } = await import('../components/toast.js');
      toast.error(err.message || '发送失败');
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  await loadMessages();
  const interval = setInterval(() => { if (polling) loadMessages(); }, 3000);

  return () => { polling = false; clearInterval(interval); };
}
