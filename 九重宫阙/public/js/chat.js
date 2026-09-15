let chatWs = null;
let currentChatChannel = 'world';
let chatReconnectTimer = null;

function initChat() {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  chatWs = new WebSocket(`${protocol}//${location.host}?token=${token}`);
  
  chatWs.onopen = () => {
    console.log('Chat connected');
    if (chatReconnectTimer) {
      clearTimeout(chatReconnectTimer);
      chatReconnectTimer = null;
    }
    chatWs.send(JSON.stringify({ type: 'join_channel', channel: currentChatChannel }));
  };
  
  chatWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleChatEvent(msg);
  };
  
  chatWs.onclose = () => {
    console.log('Chat disconnected, reconnecting in 5s...');
    chatReconnectTimer = setTimeout(initChat, 5000);
  };
  
  chatWs.onerror = () => {};
}

function handleChatEvent(msg) {
  switch (msg.type) {
    case 'connected':
      break;
    case 'chat':
    case 'system':
      appendChatMessage(msg);
      break;
    case 'online':
      updateOnlineCount(msg.count, msg.users);
      break;
    case 'pong':
      break;
    case 'whisper':
      // 轮96：他人来信渲染成"私聊@我"；本人回声只报送达状态（不进公共流样式）
      if (msg.fromUserId !== gameState.character?.user_id && msg.from) {
        appendChatMessage({ username: `${msg.from}（私聊）`, content: msg.content, timestamp: msg.timestamp, type: 'chat' });
      } else if (msg.fromUserId === gameState.character?.user_id || msg.delivered !== undefined) {
        if (typeof ui !== 'undefined') ui.showToast(msg.delivered ? '私聊已送达' : '对方不在线');
      }
      break;
  }
}

function whisperUser(userId, name) {
  if (!chatWs || chatWs.readyState !== WebSocket.OPEN) { ui.showToast('聊天未连接'); return; }
  const txt = prompt(`传话给 ${name}`);
  if (!txt || !txt.trim()) return;
  chatWs.send(JSON.stringify({ type: 'whisper', to: userId, content: txt.trim() }));
}

// 轮76 修实锤缺陷：本函数只写浮动面板 #chat-messages；聊天 tab 页的容器是
// #chat-tab-messages（app.js:2893），**没有任何代码写过它** ⇒ 打开聊天 tab 消息区永远空。
// 新做法：两处容器存在即各写一份。举报按钮只挂在有 id 的消息上（ws 中继无 id 时降级不显示）。
function chatContainers() {
  return ['chat-messages', 'chat-tab-messages'].map((id) => document.getElementById(id)).filter(Boolean);
}

function appendChatMessage(msg) {
  const targets = chatContainers();
  if (!targets.length) return;

  const isSystem = msg.type === 'system';
  const isMyMessage = msg.userId === gameState.character?.id;

  const VIP_COLORS = {
    0: '', 1: '#8d6e63', 2: '#4fc3f7', 3: '#66bb6a',
    4: '#ffa726', 5: '#ef5350', 6: '#ab47bc', 7: '#ff7043',
    8: '#26c6da', 9: '#ffee58', 10: '#e040fb'
  };

  const html = isSystem
    ? `<span style="color:var(--gold);font-size:11px;">[系统] ${escapeHtml(String(msg.content == null ? '' : msg.content))}</span>`
    : `
      <div style="display:flex;gap:4px;align-items:baseline;">
        <span style="font-weight:600;font-size:11px;${VIP_COLORS[msg.vipLevel] ? `color:${VIP_COLORS[msg.vipLevel]};` : ''}">${escapeHtml(String(msg.username || '道友'))}</span>
        ${msg.vipLevel > 0 ? `<span style="font-size:9px;padding:1px 3px;background:${VIP_COLORS[msg.vipLevel] || ''};color:#fff;border-radius:2px;">V${msg.vipLevel}</span>` : ''}
        <span style="font-size:10px;color:var(--text2);">${formatChatTime(msg.timestamp)}</span>
        ${msg.id != null && !isMyMessage ? `<button class="btn small" style="font-size:9px;padding:0 4px;margin-left:auto;" onclick="handleReportChat(${msg.id})">举报</button>` : ''}
      </div>
      <div style="font-size:12px;color:var(--text);margin-top:2px;">${escapeHtml(msg.content)}</div>
    `;
  for (const container of targets) {
    const div = document.createElement('div');
    div.style.cssText = 'margin-bottom:6px;padding:4px 0;border-bottom:1px solid var(--border);';
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    while (container.children.length > 100) {
      container.removeChild(container.firstChild);
    }
  }
}

// P6 批2：举报走 POST /api/chat/report（服务端真落 db.chat_reports，admin 有读端）
async function handleReportChat(messageId) {
  const reason = prompt('举报理由（违规内容、谩骂、广告…）：');
  if (!reason || !reason.trim()) return;
  try {
    await api.reportChatMessage(messageId, reason.trim());
    alert('举报已提交，管理员将在后台「举报处理」中审核。');
  } catch (e) { alert('举报失败：' + e.message); }
}

function updateOnlineCount(count, users) {
  const el = document.getElementById('chat-online-count');
  if (!el) return;
  // 轮96：名单可点——点谁就给谁传话（whisper）
  const list = (users || []).slice(0, 12).map((u) =>
    `<span style="cursor:pointer;color:var(--accent);" title="点击传话" onclick="whisperUser(${Number(u.userId)},'${String(u.username || '').replace(/'/g, '')}')">${escapeHtml(String(u.username || '?'))}</span>`).join('、');
  el.innerHTML = `在线: ${count}${list ? `<div style="font-size:10px;color:var(--text2);margin-top:2px;">${list}</div>` : ''}`;
}

function switchChatChannel(channel, btn) {
  currentChatChannel = channel;
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  if (chatWs && chatWs.readyState === WebSocket.OPEN) {
    chatWs.send(JSON.stringify({ type: 'join_channel', channel }));
  }
  loadChatHistory(channel);
}

async function loadChatHistory(channel) {
  try {
    const data = await api.getChatHistory(channel);
    const messages = data.messages || data || [];
    const targets = chatContainers();
    for (const container of targets) container.innerHTML = '';
    messages.forEach(m => appendChatMessage(m));
  } catch (e) {}
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;
  
  const content = input.value.trim();
  input.value = '';
  
  if (chatWs && chatWs.readyState === WebSocket.OPEN) {
    chatWs.send(JSON.stringify({
      type: 'chat',
      channel: currentChatChannel,
      content
    }));
  }
}

function toggleChatPanel() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  
  if (panel.style.display === 'none') {
    panel.style.display = 'flex';
    loadChatHistory(currentChatChannel);
    if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
      initChat();
    }
  } else {
    panel.style.display = 'none';
  }
}

function formatChatTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
