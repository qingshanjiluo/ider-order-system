/**
 * ChatRoom Durable Object
 * WebSocket 实时聊天广播（Hibernation API）
 *
 * 每个频道（world/alliance）一个 DO 实例，通过 room ID 隔离。
 * 支持：
 *   - WebSocket 连接管理（Hibernation API，节省资源）
 *   - 消息广播（发送到所有同频道连接）
 *   - 在线人数统计
 *   - 心跳检测（30s 超时断开）
 */
const HEARTBEAT_INTERVAL = 30000; // 30s 心跳
const MAX_CONNECTIONS_PER_ROOM = 500;

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;

    // 初始化 D1 表（如果不存在）
    this.state.blockConcurrencyWhile(async () => {
      await this.sql.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel TEXT NOT NULL DEFAULT 'world',
          username TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          alliance_id INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_chat_channel_ts ON chat_messages(channel, timestamp DESC);
      `);
    });

    // Hibernation API：恢复现有 WebSocket 连接
    this.ctx = {
      acceptWebSocket: (ws) => this.state.acceptWebSocket(ws),
      getWebSockets: () => this.state.getWebSockets(),
      getTags: (ws) => this.state.getTags(ws),
    };
  }

  /**
   * 处理 HTTP 请求（升级到 WebSocket 或发送消息）
   */
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // POST /chat/send → 广播消息
    if (request.method === 'POST' && path.endsWith('/send')) {
      return this.handleSend(request);
    }

    // GET /chat/ws?channel=world → WebSocket 升级
    if (request.method === 'GET' && path.endsWith('/ws')) {
      return this.handleWebSocketUpgrade(request);
    }

    // GET /chat/online → 在线人数
    if (request.method === 'GET' && path.endsWith('/online')) {
      return this.handleOnlineCount();
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * WebSocket 升级
   */
  async handleWebSocketUpgrade(request) {
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || 'world';
    const username = url.searchParams.get('username') || '匿名';

    // 检查连接数限制
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_CONNECTIONS_PER_ROOM) {
      return new Response('Room full', { status: 429 });
    }

    // 升级 WebSocket
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.ctx.acceptWebSocket(server, [`channel:${channel}`, `user:${username}`]);

    // 发送欢迎消息
    server.send(JSON.stringify({
      type: 'system',
      text: `${username} 进入了聊天室`,
      timestamp: Math.floor(Date.now() / 1000),
      online: this.ctx.getWebSockets().length
    }));

    // 广播上线通知
    this.broadcast({
      type: 'presence',
      action: 'join',
      username,
      online: this.ctx.getWebSockets().length
    }, null);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * WebSocket 消息处理（Hibernation API 回调）
   */
  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Math.floor(Date.now() / 1000) }));
        return;
      }

      if (data.type === 'chat' && data.text) {
        const tags = this.ctx.getTags(ws);
        const channelTag = tags.find(t => t.startsWith('channel:'));
        const channel = channelTag ? channelTag.replace('channel:', '') : 'world';
        const userTag = tags.find(t => t.startsWith('user:'));
        const username = userTag ? userTag.replace('user:', '') : '匿名';

        // 消息过滤
        const text = String(data.text).trim().slice(0, 200);
        if (!text) return;

        // 保存到 D1
        const timestamp = Math.floor(Date.now() / 1000);
        try {
          await this.env.DB.prepare(
            'INSERT INTO chat_messages (channel, username, text, timestamp) VALUES (?, ?, ?, ?)'
          ).bind(channel, username, text, timestamp).run();
        } catch (e) {
          console.error('[chatRoom] save message error:', e?.message);
        }

        // 广播到所有连接
        this.broadcast({
          type: 'message',
          channel,
          username,
          text,
          timestamp
        }, null);
      }
    } catch (e) {
      console.error('[chatRoom] message parse error:', e?.message);
    }
  }

  /**
   * WebSocket 关闭处理
   */
  async webSocketClose(ws, code, reason, wasClean) {
    const tags = this.ctx.getTags(ws);
    const userTag = tags.find(t => t.startsWith('user:'));
    const username = userTag ? userTag.replace('user:', '') : '匿名';

    // 广播下线通知
    this.broadcast({
      type: 'presence',
      action: 'leave',
      username,
      online: this.ctx.getWebSockets().length - 1
    }, null);
  }

  /**
   * WebSocket 错误处理
   */
  async webSocketError(ws, error) {
    console.error('[chatRoom] websocket error:', error?.message);
  }

  /**
   * 处理 HTTP 发送消息（兼容非 WebSocket 客户端）
   */
  async handleSend(request) {
    try {
      const body = await request.json();
      const { channel = 'world', username = '匿名', text } = body;

      if (!text || !String(text).trim()) {
        return new Response(JSON.stringify({ ok: false, error: '消息不能为空' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sanitized = String(text).trim().slice(0, 200);
      const timestamp = Math.floor(Date.now() / 1000);

      // 保存到 D1
      await this.env.DB.prepare(
        'INSERT INTO chat_messages (channel, username, text, timestamp) VALUES (?, ?, ?, ?)'
      ).bind(channel, username, sanitized, timestamp).run();

      // 广播到所有 WebSocket 连接
      this.broadcast({
        type: 'message',
        channel,
        username,
        text: sanitized,
        timestamp
      }, null);

      return new Response(JSON.stringify({ ok: true, timestamp }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: '发送失败' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 获取在线人数
   */
  handleOnlineCount() {
    return new Response(JSON.stringify({
      ok: true,
      online: this.ctx.getWebSockets().length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 广播消息到所有 WebSocket 连接
   * @param {object} data 消息数据
   * @param {WebSocket|null} exclude 排除的连接（发给自己时可选）
   */
  broadcast(data, exclude = null) {
    const message = JSON.stringify(data);
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch (_) {
          // 连接已断开，忽略
        }
      }
    }
  }
}
