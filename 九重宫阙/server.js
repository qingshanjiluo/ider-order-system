const express = require('express');
const cors = require('cors');
const { secureHeaders } = require('./src/middleware/secureHeaders');
const path = require('path');
require('dotenv').config();

const { rateLimit } = require('./src/middleware/rateLimit');
const { sanitizeMiddleware } = require('./src/middleware/validate');

const authRoutes = require('./src/routes/auth');
const tribulationRoutes = require('./src/routes/tribulation'); // E5/T0-1 大限劫
const characterRoutes = require('./src/routes/character');
const gameRoutes = require('./src/routes/game');
const cultivationRoutes = require('./src/routes/cultivation');
const battleRoutes = require('./src/routes/battle');
const equipmentRoutes = require('./src/routes/equipment');
const gongfaRoutes = require('./src/routes/gongfa');
const petRoutes = require('./src/routes/pet');
const dungeonRoutes = require('./src/routes/dungeon');
const guildRoutes = require('./src/routes/guild');
const arenaRoutes = require('./src/routes/arena');
const checkinRoutes = require('./src/routes/checkin');
const achievementRoutes = require('./src/routes/achievement');
const vipRoutes = require('./src/routes/vip');
const seasonRoutes = require('./src/routes/season');
const afkRoutes = require('./src/routes/afk');
const forgeRoutes = require('./src/routes/forge');
const shopRoutes = require('./src/routes/shop');
const gatheringRoutes = require('./src/routes/gathering');
const systemsRoutes = require('./src/routes/systems');
const forgeSystemsRoutes = require('./src/routes/forge-systems');
const skillRoutes = require('./src/routes/skill');
const chatRoutes = require('./src/routes/chat');
const settingsRoutes = require('./src/routes/settings');
const inviteRoutes = require('./src/routes/invite');
const talismanRoutes = require('./src/routes/talismans');
const formationRoutes = require('./src/routes/formations');
const questRoutes = require('./src/routes/quests');
const adminRoutes = require('./src/routes/admin');
const announcementRoutes = require('./src/routes/announcements');
const adRoutes = require('./src/routes/ads');
const alchemyRoutes = require('./src/routes/alchemy');
const caveRoutes = require('./src/routes/cave');

const app = express();
app.use(secureHeaders); // E2（轮63）：自备安全头，不引 helmet —— 镜像走 npm ci，加依赖会让镜像与本地不一致
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(sanitizeMiddleware); // Sanitize all inputs
app.use(rateLimit); // Apply rate limiting globally（天花板）
app.use(require('./src/middleware/tierLimit')); // E2：按端点代价分层收紧（健康探针豁免）

// E2 安全加固：生产 JWT 密钥断言 + 反向代理下的真实 IP（限流依赖）。
// trust proxy 轮52 改为**默认不信任**（原先无条件 `app.set('trust proxy', 1)`，直连部署时任何客户端
// 都能伪造 X-Forwarded-For 拿到全新的 IP 限流桶，等于限流与封禁全部可绕 —— 由 E2 攻击模拟的静态锁抓到）。
// 确实架在反向代理后面时，运维显式设 DSH_TRUST_PROXY=1（或代理层数 2）；未设则按 socket 真实地址判定。
const trustProxy = process.env.DSH_TRUST_PROXY;
if (trustProxy && trustProxy !== '0' && trustProxy !== 'false') {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy);
  console.log(`[server] trust proxy 已开启（DSH_TRUST_PROXY=${trustProxy}）：IP 限流按 X-Forwarded-For 判定`);
}
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret.length < 32 || /change|default|secret|example/i.test(secret)) {
    console.error('[FATAL] 生产环境必须设置强随机 JWT_SECRET（≥32 字符，且不含 change/default/secret/example）');
    process.exit(1);
  }
}

// 健康检查（容器/负载探针；置于限流之后、鉴权之前，无需 token）
app.use('/api/health', require('./src/routes/health'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/tribulation', tribulationRoutes); // E5/T0-1 大限劫：应劫面板与出手入口
app.use('/api/character', characterRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/cultivation', cultivationRoutes);
app.use('/api/battle', battleRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/gongfa', gongfaRoutes);
app.use('/api/pet', petRoutes);
app.use('/api/dungeon', dungeonRoutes);
app.use('/api/guild', guildRoutes);
app.use('/api/arena', arenaRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/achievement', achievementRoutes);
app.use('/api/vip', vipRoutes);
app.use('/api/season', seasonRoutes);
app.use('/api/afk', afkRoutes);
app.use('/api/forge', forgeRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/gathering', gatheringRoutes);
app.use('/api/systems', systemsRoutes);
app.use('/api/forge-systems', forgeSystemsRoutes);
app.use('/api/skill', skillRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/talismans', talismanRoutes);
app.use('/api/formations', formationRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/alchemy', alchemyRoutes);
app.use('/api/cave', caveRoutes);
app.use('/api/sect', require('./src/routes/sect'));
app.use('/api/economy', require('./src/routes/economy'));
app.use('/api/market', require('./src/routes/market'));
app.use('/api/friend', require('./src/routes/friend'));   // P2/E8（轮48）：好友与洞府拜访
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/chronicle', require('./src/routes/chronicle'));

// API 未匹配端点统一返回 404 JSON（不得落入 SPA fallback 返回 HTML）
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `接口不存在: ${req.method} ${req.originalUrl}` });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 统一错误出口（必须最后挂）：畸形 JSON / 超大 body 不再回 HTML 堆栈页，而是回结构化 JSON
app.use(require('./src/middleware/requestError'));

const http = require('http');
const WebSocket = require('ws');
const { loadDatabase, saveDatabase, getNextId } = require('./src/database');
const config = require('./src/config');

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

function broadcastToChannel(channel, message) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      // 轮96 隐私洞修复：旧版兜底"未 join 者收一切"让默认用户收到**所有频道**广播
      // （仙盟密谋被全场旁听）。默认位是 world，system 人人可得。负锁盯死该兜底复活。
      if (channel === 'system' || client.currentChannel === channel) {
        client.ws.send(data);
      }
    }
  });
}

function broadcastOnlineCount() {
  const count = clients.size;
  const users = Array.from(clients.values()).map(c => ({
    userId: c.userId, // 轮96：私聊按 userId 定向，名单必须带身份
    username: c.username,
    vipLevel: c.vipLevel,
    realm: c.realm
  }));
  const data = JSON.stringify({ type: 'online', count, users });
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

function broadcastSystem(content) {
  broadcastToChannel('system', {
    type: 'system',
    content,
    timestamp: Date.now()
  });
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  try {
    const jwt = require('jsonwebtoken');
    const config = require('./src/config');
    const decoded = jwt.verify(token, config.jwt.secret);
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === decoded.userId);

    if (!character) { ws.close(); return; }

    const clientInfo = {
      ws,
      userId: decoded.userId,
      username: character.name,
      characterId: character.id,
      // 轮96：旧版读 character.guild_id（建盟写的是 guild_members，此列常年为空）——
      // 仙盟频道因此对所有人不可用 yet 又因旁听洞被旁听。改接真源。
      guildId: ((db.guild_members || []).find((m) => m.character_id === character.id) || {}).guild_id || null,
      vipLevel: character.vip_level || 0,
      realm: character.realm || '炼气',
      currentChannel: 'world', // 轮96：默认只待世界频道（旧版 undefined=旁听全频道）
      msgTimes: [] // 轮96：WS 限速表（tierLimit 只盖 HTTP，聊天洪水此前无人管）
    };

    clients.set(decoded.userId, clientInfo);

    ws.send(JSON.stringify({ type: 'connected', userId: decoded.userId, username: character.name }));
    broadcastOnlineCount();
    broadcastToChannel('world', {
      type: 'system',
      content: `${character.name} 加入了聊天`,
      timestamp: Date.now()
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleChatMessage(clientInfo, msg);
      } catch (e) {}
    });

    ws.on('close', () => {
      clients.delete(decoded.userId);
      broadcastOnlineCount();
      broadcastToChannel('world', {
        type: 'system',
        content: `${clientInfo.username} 离开了聊天`,
        timestamp: Date.now()
      });
    });
  } catch (e) {
    ws.close();
  }
});

function resolveChannel(client, ch) {
  // 轮96：FE 的世界观是 channel='guild'；内部真键是 guild:<id>——不同盟的"guild"必须落到不同键，
  // 否则仙盟频道就是全盟串音的公共走廊。返回 null = 无权使用该频道。
  if (ch === 'guild' || (ch && String(ch).startsWith('guild:'))) {
    if (client.guildId == null) return null;
    return `guild:${client.guildId}`;
  }
  return ch || 'world';
}

function handleChatMessage(client, msg) {
  const db = loadDatabase();

  switch (msg.type) {
    case 'chat': {
      const channel = resolveChannel(client, msg.channel || 'world');
      if (!channel) return; // 无盟籍插话仙盟频道：静默丢弃
      // 轮96 限速：滚动 5 秒窗口超 8 条即回 rate 通知（不入库不广播）
      const now = Date.now();
      client.msgTimes = (client.msgTimes || []).filter((t) => now - t < 5000);
      if (client.msgTimes.length >= 8) {
        client.ws.send(JSON.stringify({ type: 'rate', error: '语速太快，稍候再叙', timestamp: now }));
        return;
      }
      client.msgTimes.push(now);
      const chatMsg = {
        id: getNextId('chat_messages'),
        channel,
        userId: client.userId,
        username: client.username,
        content: String(msg.content || '').substring(0, 200),
        timestamp: now,
        type: 'text',
        vipLevel: client.vipLevel
      };
      if (!db.chat_messages) db.chat_messages = [];
      db.chat_messages.push(chatMsg);
      if (db.chat_messages.length > 500) {
        db.chat_messages = db.chat_messages.slice(-500);
      }
      saveDatabase(db);
      broadcastToChannel(chatMsg.channel, chatMsg);
      break;
    }
    case 'whisper': {
      // 轮96 私聊：只投递给目标与本人（不进公共广播、不落后端历史——私信非公共档案）
      const to = Number(msg.to);
      const content = String(msg.content || '').trim().substring(0, 200);
      if (!to || !content) return;
      const payload = { type: 'whisper', from: client.username, fromUserId: client.userId, to, content, timestamp: Date.now() };
      const target = clients.get(to);
      if (target && target.ws.readyState === WebSocket.OPEN) {
        target.ws.send(JSON.stringify(payload));
      }
      client.ws.send(JSON.stringify({ ...payload, delivered: !!(target && target.ws && target.ws.readyState === WebSocket.OPEN) }));
      break;
    }
    case 'join_channel': {
      const target = resolveChannel(client, msg.channel);
      if (target) client.currentChannel = target;
      break;
    }
    case 'ping':
      client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
  }
}

// 内容富集二期：材料品阶分级 + 商店目录（幂等，boot 时回填一次）
try {
  const materials = require('./src/services/materials');
  const { loadDatabase, saveDatabase } = require('./src/database');
  const db = loadDatabase();
  const res = materials.ensureAll(db);
  if (res.changed > 0) {
    saveDatabase(db);
    console.log(`[materials] 已回填材料分级 ${res.materialGrades} 项、商店货架 ${res.shopEntries} 项`);
  }
} catch (e) {
  console.error('[materials] 内容目录回填失败:', e.message);
}

server.listen(PORT, () => {
  console.log(`九重宫阙服务器运行于 http://localhost:${PORT}`);
  console.log(`WebSocket 服务已启动，端口: ${PORT}`);
});

// 优雅退出：SQLite 落盘 + 关库
const { closeDatabase } = require('./src/database');
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n收到 ${sig}，落盘并退出...`);
    closeDatabase();
    process.exit(0);
  });
}
process.on('exit', () => { try { closeDatabase(); } catch (_) { /* ignore */ } });

module.exports = { clients, broadcastSystem, broadcastToChannel };
