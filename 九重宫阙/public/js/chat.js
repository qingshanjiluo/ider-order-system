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
  }
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  const isSystem = msg.type === 'system';
  const isMyMessage = msg.userId === gameState.character?.id;
  
  const VIP_COLORS = {
    0: '', 1: '#8d6e63', 2: '#4fc3f7', 3: '#66bb6a',
    4: '#ffa726', 5: '#ef5350', 6: '#ab47bc', 7: '#ff7043',
    8: '#26c6da', 9: '#ffee58', 10: '#e040fb'
  };
  
  const div = document.createElement('div');
  div.style.cssText = 'margin-bottom:6px;padding:4px 0;border-bottom:1px solid var(--border);';
  
  if (isSystem) {
    div.innerHTML = `<span style="color:var(--gold);font-size:11px;">[系统] ${msg.content}</span>`;
  } else {
    const vipColor = VIP_COLORS[msg.vipLevel] || '';
    const nameStyle = vipColor ? `color:${vipColor};text-shadow:0 0 4px ${vipColor}40;` : '';
    div.innerHTML = `
      <div style="display:flex;gap:4px;align-items:baseline;">
        <span style="font-weight:600;font-size:11px;${nameStyle}">${msg.username}</span>
        ${msg.vipLevel > 0 ? `<span style="font-size:9px;padding:1px 3px;background:${vipColor};color:#fff;border-radius:2px;">V${msg.vipLevel}</span>` : ''}
        <span style="font-size:10px;color:var(--text2);">${formatChatTime(msg.timestamp)}</span>
      </div>
      <div style="font-size:12px;color:var(--text);margin-top:2px;">${escapeHtml(msg.content)}</div>
    `;
  }
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  
  while (container.children.length > 100) {
    container.removeChild(container.firstChild);
  }
}

function updateOnlineCount(count, users) {
  const el = document.getElementById('chat-online-count');
  if (el) el.textContent = `在线: ${count}`;
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
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = '';
    const messages = data.messages || data || [];
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
