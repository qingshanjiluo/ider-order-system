# 艾德尔修仙传 · 私服部署与改造规划

> 目标：在 Cloudflare 全托管架构下，部署一套「艾德尔修仙传」私服，内置赛博皮肤切换器，
> 新增「游戏内聊天面板 + 独立聊天页面」，并针对中国大陆访问做稳定性与加速优化。

---

## 一、架构总览（Cloudflare 全托管）

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户（中国 + 全球）                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
          ┌─────────────────────┴──────────────────────┐
          │              Cloudflare 边缘网络             │
          │    （全球 330+ PoP，大陆走优选IP/国内加速）    │
          └───────────┬────────────────┬───────────────┘
                      │                │
          ┌───────────▼───┐   ┌────────▼──────────┐
          │  Cloudflare   │   │  Cloudflare       │
          │  Pages        │   │  Workers (API)    │
          │  (静态前端)    │   │  + Durable Objects │
          └──────┬────────┘   └────────┬──────────┘
                 │                     │
                 └──────┬──────────────┘
                        ▼
              ┌──────────────────┐
              │   Cloudflare D1  │  持久化数据库（聊天/存档/排名）
              │  (SQLite 系)     │
              └──────────────────┘
```

### 组件划分

| 组件 | 宿主 | 说明 |
|------|------|------|
| **前端 SPA** | Cloudflare Pages（或 GitHub Pages） | 现成 `web-client`（Vue3 无构建），内置皮肤切换器 |
| **游戏 API** | Cloudflare Workers + Durable Objects | 登录/战斗/存档等接口从 Node 迁移为 Worker 路由 |
| **聊天服务** | Cloudflare Workers + D1 | 游戏内聊天 + 独立聊天页共用一套 API + 持久化 |
| **WebSocket 实时** | Cloudflare Durable Objects + WebSocket Hibernation | 聊天实时推送、在线状态 |
| **数据库** | Cloudflare D1 (SQLite) | 账号/角色/聊天记录/皮肤拥有状态 |
| **静态游戏数据** | Cloudflare Pages 静态 JSON / KV | items/skills/maps 等只读数据 |

### 为什么这样分

- **Pages 静态托管**：`web-client` 本身就是纯静态 Vue SPA（Vue 走 CDN、无打包器），零改造即可托管，全球 CDN 加速。
- **Workers + D1 替代 Node**：原 server 是 Express + SQLite/MySQL + WS 长驻进程，无法直接上 Pages。用 Worker 路由一一映射原路由，D1 替代 SQLite，Durable Objects 替代长连接/WS。
- **D1 兼容 SQLite 语法**：原 `db.js` 用 better-sqlite3，D1 用 SQL 方言近似，迁移成本可控。

---

## 二、聊天功能（本期核心新增）

### 2.1 功能清单

1. **游戏内聊天面板**（世界频道 / 仙盟频道）
   - 游戏主界面底部或侧栏常驻面板，可开合
   - 消息实时推送（Durable Objects WebSocket）＋ 轮询兜底
   - 发送频率限制（2s/条）、刷屏禁言（复用原 chat.js 规则）
   - 仙盟频道仅仙盟成员可见

2. **独立聊天页** `/chat`（无需登录游戏也可访问）
   - 全屏聊天室页面，多频道（世界/仙盟/私聊）
   - 历史消息分页加载（D1 持久化）
   - 游客可浏览世界频道，发言需登录
   - 在线人数、@提及（v2）

### 2.2 聊天数据结构（D1 表）

```sql
-- 聊天消息（持久化，替换原内存数组）
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL DEFAULT 'global',   -- global / alliance / whisper
  alliance_id INTEGER DEFAULT 0,            -- channel=alliance 时生效
  account_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_channel_ts ON chat_messages(channel, alliance_id, ts);

-- 私聊会话（v2）
CREATE TABLE IF NOT EXISTS chat_whispers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  ts INTEGER NOT NULL
);
```

### 2.3 聊天 API（Worker 路由）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chat/messages?channel=&alliance_id=&since=&limit=` | 拉取消息（增量/分页） |
| POST | `/api/chat/send` | 发送消息（限频/禁言校验） |
| GET | `/api/chat/history?channel=&before_id=&limit=` | 独立聊天页历史分页 |
| WS | `/ws/chat` | 实时消息推送（Durable Object） |
| GET | `/api/chat/online` | 在线人数/在线列表 |

---

## 三、赛博皮肤内置化（本期核心新增）

### 3.1 现状

- `docs/ider_skin_full.user.js`：Tampermonkey 脚本，含 **8 套皮肤 CSS** + 皮肤选择 UI + 工单系统 Token 同步。
- `docs/ider_skin.user.js`：早期简化版。

### 3.2 方案：内置皮肤切换器（无需油猴）

1. **抽取 8 套 CSS** 到独立文件 `web-client/skins/<key>.css`
   - inkwash 水墨修仙 / imperial 金碧辉煌 / cyber 赛博 / 其余按脚本内 SKINS 提取
2. **前端内置皮肤管理器** `web-client/js/skinManager.js`
   - `applySkin(key)`：动态 `<link>` 加载皮肤 CSS
   - localStorage 记住选择，登录页就有皮肤切换入口
   - 皮肤数据走 Pages 静态托管（CDN 加速）
3. **保留油猴脚本**：改 `@match` 为私服域名，作为高级用户选项

### 3.3 皮肤选择器 UI

- 登录页右上角「🎨 换肤」按钮
- 游戏内「设置」tab 增加「皮肤」分组
- 独立聊天页顶部也可换肤

---

## 四、中国访问稳定加速方案

### 4.1 Cloudflare Pages/Workers 大陆加速

Cloudflare 免费大陆边缘不稳定，按可靠性从高到低：

| 方案 | 效果 | 成本 | 备注 |
|------|------|------|------|
| **A. 优选 IP + CNAME 自选** | 中，多数地区 P99 < 80ms | 免费 | 自选落地 IP（阿里云香港/腾讯云香港），CNAME 到 Pages 或 Workers 自定义域 |
| **B. 国内 CDN 回源 Cloudflare** | 高，全国低延迟 | 低（按量） | 腾讯云 CDN/阿里云 CDN 反代 Pages/Workers，缓存静态资源 |
| **C. 自定义域名 + Cloudflare 加速** | 中高 | 域名费 | `cf.域名.com` 走 Cloudflare，国内可选 B 回源 |
| **D. GitHub Pages + jsDelivr** | 中 | 免费 | 静态资源走 jsDelivr 国内节点，但交互 API 仍需 CF |

**推荐组合**：
- **静态前端** → Cloudflare Pages 自定义域（国内加一层腾讯云 CDN 静态加速，低成本高收益）
- **API/聊天** → Cloudflare Workers 自定义域 + 优选 IP 解析（API 动态无法 CDN 缓存，靠 Workers 全球边缘 + 大陆优选）
- 在 README 提供 **大陆访问检测脚本**（自选 IP 测速）

### 4.2 网络层优化

- HTTP/3 + Brotli：Cloudflare 默认开启，前端资源已压缩传输
- 前端静态资源加 `immutable` 强缓存 + 版本指纹（复用原 server 的 Cache-Control 策略）
- WebSocket 使用 permessage-deflate（原 ws.js 已有），减少长连接流量
- 减少首屏体积：游戏数据 JSON 可迁入 KV 就近分发

---

## 五、改造实施步骤

### Phase 1：前端静态化 + 皮肤内置（低风险，先行）
1. [x] 复制 `web-client` → 私服仓库 `frontend/`
2. [x] 抽取 8 套皮肤 CSS → `frontend/skins/*.css`，写 `skinManager.js`
3. [x] 登录页 + 游戏内 + 聊天页加入皮肤切换器
4. [x] Pages 部署 `frontend/`（wrangler.toml + GitHub Actions 自动部署）

### Phase 2：聊天系统（Worker + D1 + DO）
5. [x] 建 D1 表 `chat_messages/chat_whispers`（已并入 game-api 迁移）
6. [x] 聊天路由 messages/send + 限频禁言（game-api `src/chat.js`，D1 持久化）
7. [ ] Durable Object `ChatRoom`：WebSocket 实时广播（Hibernation API，可后续加）
8. [x] 游戏内聊天面板：app.js 激活 useChat、补 index.html 模板
9. [x] 独立聊天页 `/chat`：全屏聊天室 SPA
10. [x] 联调：面板与独立页互通、历史持久化（D1）
> 注：`chat/` Worker 保留为「反代原 server」的过渡方案；整体重建下聊天直接由 game-api 提供。

### Phase 3：游戏后端迁移（最大工作量，可分批）
11. [x] 建立 Worker `game-api` 路由骨架，映射原 server 路由清单
12. [x] 迁移数据库：schema.sql → D1（27 表 + 聊天表），建 D1 封装层 `src/db.js`
13. [x] 迁移认证：JWT（原 jsonwebtoken 兼容）/ 注册（sha256+pepper 兼容）
14. [x] 迁移核心玩法：角色创建/存档/升级/突破/装备/技能/背包/天赋（复用 playerOps+combatUtils）
15. [x] 静态数据接口 `/game-data`（14 个 JSON → ESM 内联）
16. [x] 迁移战斗/副本/交易/联盟/联赛/宗门/百艺/洞府/传人派遣/邀请/邮箱/GM/城池斗法（15 套 Mock D1 回归全绿 357/357）。功能删减：验证码机制取消、问心试炼删除（保留危机试炼）、传人系统整体删除。
17. [ ] WebSocket 战斗推送 → Durable Object 战斗会话
18. [ ] 删除对 better-sqlite3/redis 的依赖，纯 serverless（已无 Node 特有依赖，部署即纯 serverless）

### Phase 4：加速与上线
18. [ ] 自定义域绑定 Pages + Workers
19. [ ] 大陆访问检测脚本 + 优选 IP 文档
20. [ ] 国内 CDN 静态加速接入（可选）
21. [ ] GitHub Actions 自动部署 Pages/Workers/D1 迁移
22. [ ] 压测与调优（战斗接口限流、聊天连接数）

---

## 六、目录结构（私服仓库）

```
私服艾德尔修仙传/
├── frontend/                  # Cloudflare Pages 静态前端（改造自 web-client）
│   ├── index.html
│   ├── style.css
│   ├── skins/                 # 8套皮肤 CSS（内置切换器）
│   │   ├── inkwash.css
│   │   ├── imperial.css
│   │   └── ...
│   ├── js/
│   │   ├── app.js             # 激活 chat、接皮肤管理器
│   │   ├── panels.js
│   │   ├── skinManager.js     # 新增
│   │   └── ...
│   └── chat.html              # 独立聊天页（或路由 /chat）
├── chat/                      # 聊天 Worker（本期）
│   ├── wrangler.toml
│   ├── src/
│   │   ├── index.js           # HTTP 路由 + 静态兜底
│   │   ├── chat-room.js       # Durable Object：WS 广播
│   │   └── rate-limit.js      # 限频/禁言（迁移自 chat.js）
│   └── migrations/chat.sql    # D1 表结构
├── game-api/                  # 游戏后端 Worker（Phase 3）
│   ├── wrangler.toml
│   ├── src/
│   │   ├── index.js           # 路由映射
│   │   ├── db/d1.js           # D1 封装
│   │   ├── routes/            # auth/player/battle/... 逐一迁移
│   │   └── game/              # 战斗引擎等纯逻辑直接复用
│   └── migrations/*.sql
├── shared/                    # 跨 Worker 共用
│   ├── skin-registry.json     # 皮肤元数据（名称/说明/预览）
│   └── api-constants.js
├── .github/workflows/         # 自动部署
│   ├── deploy-pages.yml
│   ├── deploy-chat.yml
│   └── deploy-game-api.yml
├── scripts/
│   ├── extract-skins.js       # 从油猴脚本抽取8套CSS（一次性）
│   └── cn-speedtest.js        # 大陆优选 IP 测速
└── README.md                  # 部署 + 大陆加速指南
```

---

## 七、关键技术风险与对策

| 风险 | 对策 |
|------|------|
| 游戏后端迁移工作量巨大（战斗引擎/联赛/DO 会话） | Phase 3 分批；纯计算逻辑（battleEngine 等）原样复制，仅替换 IO 层 |
| D1 与 better-sqlite3 方言差异（JSON 函数、临时表、事务） | 先做迁移 smoke test；热数据（战斗缓存）放 DO 内存，D1 只做持久化 |
| WebSocket 在 Workers 的限制（连接时长、Hibernation） | 用 DO WebSocket Hibernation API；聊天走 DO，战斗推送按需降级轮询 |
| Cloudflare 大陆访问不稳定 | 四层加速方案（4.1），静态+动态分离；提供测速脚本 |
| 皮肤脚本 CSS 依赖原页面 class | 抽取后逐套在私服页面核对；用 Shadow DOM 隔离可选方案 |

---

## 八、验收标准

- [ ] `frontend/` 部署 Pages 后可正常登录/进游戏（若连 Phase 3 完成则全功能）
- [ ] 登录页可切换 8 套皮肤且选择持久化
- [ ] 游戏内聊天面板可收发世界/仙盟消息，限频与禁言生效
- [ ] 独立 `/chat` 页与游戏内聊天互通，历史消息可翻页
- [ ] 大陆节点访问静态资源延迟可接受（推荐方案 B 下 P95 < 150ms）
- [ ] GitHub Actions 一键部署 Pages / Workers / D1

---

> **注**：本规划将「聊天 + 皮肤 + 前端静态化」作为 P0（本期立即实施），
> 「游戏后端迁 Workers」为 P1（工作量大，按路由分批迁移，先跑通 auth+player+battle）。
> 若后续只想先上线「静态前端 + 皮肤 + 聊天」，Phase 1 + Phase 2 即可交付可用版本。
