const express = require('express');
const cors = require('cors');
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
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(sanitizeMiddleware); // Sanitize all inputs
app.use(rateLimit); // Apply rate limiting globally（天花板）
app.use(require('./src/middleware/tierLimit')); // E2：按端点代价分层收紧（健康探针豁免）

// E2 安全加固：反向代理下取真实 IP（限流依赖）+ 生产环境密钥断言
app.set('trust proxy', 1);
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
      if (channel === 'system' || client.currentChannel === channel || !client.currentChannel) {
        client.ws.send(data);
      }
    }
  });
}

function broadcastOnlineCount() {
  const count = clients.size;
  const users = Array.from(clients.values()).map(c => ({
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
      guildId: character.guild_id || null,
      vipLevel: character.vip_level || 0,
      realm: character.realm || '炼气'
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

function handleChatMessage(client, msg) {
  const db = loadDatabase();

  switch (msg.type) {
    case 'chat': {
      const chatMsg = {
        id: getNextId('chat_messages'),
        channel: msg.channel || 'world',
        userId: client.userId,
        username: client.username,
        content: msg.content.substring(0, 200),
        timestamp: Date.now(),
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
    case 'join_channel':
      client.currentChannel = msg.channel;
      break;
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
