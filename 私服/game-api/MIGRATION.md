# game-api 迁移指南（Node → Cloudflare Workers + D1）

> 本目录是「艾德尔修仙传」游戏后端从原 Node Express 服务器
> （`源代码/server`）迁移到 Cloudflare Workers + D1 的工程。
> 目标：私服完全跑在 Cloudflare 边缘，脱离原 43.130.240.37 服务器。

## 已完成（本仓库当前状态）

| 模块 | 文件 | 说明 |
|------|------|------|
| 数据库 schema | `migrations/001_schema.sql` | 31 表全量迁移（从 db.js 提取，D1 兼容）+ 聊天表 |
| 认证 | `src/auth.js` | JWT HS256 签名/校验（兼容原 signToken，7天过期） |
| 密码 | `src/crypto.js` | sha256(pwd + pepper)（兼容原 hashPassword） |
| 初始存档 | `src/player.js` | 创建角色初始数据 + 基础战斗属性 |
| 经验表 | `src/exp.js` | 完整 400 级 EXP_TABLE 查表 |
| 聊天 | `src/chat.js` | messages/send + 限频禁言（D1 持久化，替代原内存数组） |
| D1 封装 | `src/db.js` | 兼容原 dbAsync 方法名的持久化层（getPlayerByAccountId/savePlayer 等） |
| 静态数据 | `src/data/*.js` | 14 个游戏静态 JSON 转 ESM（build-game-static.mjs 生成） |
| 战斗核心 | `src/game/*.js` | 18 个纯逻辑模块零修改复用（battleEngine/combatUtils/playerOps 等） |
| 战斗缓存 | `src/game/battleSessionCache.js` | D1 持久化版（createBattleCache(env)，27 导出全 async，替代 redis） |
| 战斗编排 | `src/game/battleSessionOrchestrator.js` | 惰性推进（server_driven poll 时按时间差推进，替代后台 gameLoop） |
| 战斗路由 | `src/routes/battle.js` | start/command/state/poll/auto_restart（command 逐指令 + poll 惰性推进） |
| 结算 | `src/game/battleSettlementService.js` | finalizeBattle + settleKillTaskProgress 内联 + setSettlementDb 注入 |
| 玩家路由 | `src/routes/player.js` | level_up/breakthrough/equip/unequip/use_item/skill/talent 等 30 路由 |
| 副本路由 | `src/routes/dungeon.js` | 列表/详情/怪物/组队/每日次数（D1） |
| 交易所路由 | `src/routes/exchange.js` | 坊市 2301 行迁移为 Worker handler（listings/quote/buy_orders/buy/fulfill_buy/cancel + 市场令牌 + 动态税 + 锚点价） |
| 邮件路由 | `src/routes/mail.js` | 系统邮箱（收件/领取/删除/一键领取，含装备附件动态生成） |
| 试炼路由 | `src/routes/trial.js` + `src/game/trialContracts.js` | 仅保留危机试炼（词条契约/试炼币商店）；问心试炼已删除，测试 5/5 |
| 联赛系统 | `src/routes/league.js` + `src/game/leagueSystem.js` | 14 端点（建队/匹配/排行/run_due GM 结算），`migrations/003_league.sql` |
| 仙盟系统 | `src/routes/alliance.js` + `src/game/allianceBuildings.js` | 建盟/成员/建筑/仓库/退盟全端点，`migrations/004_alliance.sql` |
| 宗门系统 | `src/routes/online/sect*Routes.js` | core（加入/贡献/功法/轮道点）/task（任务刷新接取完成）/treasury（兑换/购买）+ `/city/buy` |
| 百艺系统 | `src/routes/online/baiyiRoutes.js` | 炼丹/炼器/刻阵/制物/兑换码 11 端点（`/online/*`） |
| 洞府系统 | `src/routes/online/caveDiscipleRoutes.js` + `src/game/cave.js` | 采集/升级/阵形（`/cave/*`）；传人系统已删除 |
| 邀请系统 | `src/routes/invite.js` | 邀请码/绑定/灵石存储/积分领取/商店购买（D1 原子扣减） |
| 邮箱绑定 | `src/routes/email.js` | 绑定/解绑/改密/找回密码（验证码机制已取消，直接生效；send-code 保留为前端兼容） |
| GM 工具 | `src/routes/gm.js` | ban/unban/status（`x-gm-token` 鉴权，503/403） |
| 传人（弟子派遣） | `src/routes/apprentice.js` + `src/game/apprentice.js` | 派遣搜集/装备/改名（`/apprentice/*`） |
| 城池斗法/副本战斗 | `src/routes/dungeonBattle.js` + `src/game/dungeonBattleCache.js`/`duelRankSeason.js` | start/advance + city_duel 战神榜（赛季结算+邮件奖励） |
| 路由骨架 | `src/index.js` | 认证 + 玩家 + 聊天 + 战斗 + 副本 + 交易所 + 邮件 + 试炼(危机) + 联赛 + 仙盟 + 宗门 + 百艺 + 洞府 + 邀请 + 邮箱 + GM + 传人派遣 + 城池斗法 + 状态 |
| 回归测试 | `test-*.mjs` × 15 | Mock D1 全绿 **357/357**（local/gameplay/e2e/battle/dungeon/exchange/mail/trial/league/alliance/sect/baiyi/cave/small/dungeonbattle） |

> **功能删减**（本期）：验证码验证机制已取消（邮箱绑定/改密/重置直接生效）；问心试炼已删除（仅保留危机试炼，战斗走 `/dungeon-battle` 的 `trial_contract` 模式）；传人系统（`/disciple/*`、传人比拼、`game/disciple.js`、`game/discipleBattle.js`）已整体删除，前端「传人」页与相关逻辑同步移除。

## 已实现接口

- `POST /api/auth/register` — 注册（含 IP 封禁检查、大小写查重）
- `POST /api/auth/login` — 登录（含封禁检查、machine_id 记录）
- `GET /api/player/sync` — 玩家存档读取
- `POST /api/player/create` — 创建角色
- `GET /api/player/state` — 玩家状态
- `POST /api/player/level_up` — 升级（含自动多级）
- `POST /api/player/breakthrough` — 突破
- `POST /api/player/equip` / `unequip` — 装备/卸下
- `POST /api/player/use_item` — 使用物品
- `POST /api/player/inventory/sort` / `inventory/lock` — 背包整理/锁定
- `POST /api/player/sell_item` / `decompose_equipment` — 出售/分解
- `POST /api/player/equip_skill` / `unequip_skill` / `set_key_skill` — 技能
- `POST /api/player/save_skill_preset` / `apply_skill_preset` / `preset_*` — 技能预设
- `POST /api/player/set_talisman` / `set_technique` — 法宝/功法
- `POST /api/player/talent/unlock` / `talent/reset` — 天赋
- `POST /api/player/rename` / `set_map` / `wipe` — 改名/换图/删档
- `POST /api/player/save` / `agreement_seen` — 占位/协议
- `GET /api/chat/messages` — 拉取聊天消息（D1 持久化）
- `POST /api/chat/send` — 发送聊天消息（限频禁言）
- `GET /api/battle/state/:battleId` — 战斗状态查询
- `GET /api/battle/poll` — 轮询推进（server_driven 惰性推进 + 事件流 + 结算）
- `POST /api/battle/auto_restart` — 自动开战开关
- `POST /api/battle/command` — 逐指令操作（含幂等、防速攻）
- `GET /api/dungeon/list` / `monsters` / `:id` — 副本列表/怪物/详情（剩余次数）
- `POST /api/dungeon/team/create|join|leave|kick` + `GET team/:code|mine` — 组队
- `GET /api/exchange/listings` — 市场列表（含 market_token、税率策略）
- `GET /api/exchange/quote` — 询价（灵石/以物易物，动态税 + 锚点）
- `GET /api/exchange/item_search` / `my/listings` — 物品搜索/我的挂单
- `POST /api/exchange/listings` — 上架出售（防超卖：背包扣除即持久化 + 回滚）
- `POST /api/exchange/buy_orders` — 发布求购单（灵石预存 / 以物易物 escrow）
- `POST /api/exchange/buy` — 购买（market_token 校验 + 原子扣减）
- `POST /api/exchange/fulfill_buy` — 成交求购单（装备/物品/以物易物）
- `POST /api/exchange/listings/:id/cancel` — 撤单（邮件退回）
- `GET /api/status` — 服务状态

## 待迁移清单（按优先级）

### P0 — 核心玩法（已基本完成 ✅）
- [x] `game/combatUtils.js` — `recalcAndAssignCombatStats`（完整复用）
- [x] `routes/player.js` — 修炼升级 / 突破 / 装备 / 技能 / 功法 / 背包 / 属性（30 路由）
- [x] `game/playerOps.js` — 玩家操作集合（完整复用）
- [x] `game/backgroundJobs.js` — 百艺后台任务结算（同步调用版，无 cron；配合请求级结算）
- [x] `game/universalTime.js` — 时间系统（完整复用）
- [x] 静态数据接口（data/*.json → ESM 内联 → dataLoader）

### P1 — 战斗 ✅
- [x] `game/battleEngine.js`（完整复用）
- [x] `game/combatDamage.js` / `combatComputeAdapter`（纯 JS 兜底）
- [x] `routes/battle.js`（battleStart/battleCommand/battleState/battlePoll → D1 + 惰性推进）
- [x] `game/offlineBattle.js`（已复制；离线结算需 dbAsync 扩展）
- [x] `game/battleSessionCache.js` / `battleSettlementService.js`（redis → D1 事务式读改写）
- [x] `game/battleSessionOrchestrator.js` / `battleCommandService.js` / `battleStateService.js`（async DI 版）
- [x] `game/battleStartEffectsService.js`（转 ESM）/ `commandRateLimit.js`（Worker 简化版）

### P2 — 各系统
- [x] `routes/dungeon.js` + `game/dungeonBattleEngine.js`（副本已完成；dungeonBattleEngine 结算走 D1）
- [x] `routes/exchange.js`（坊市交易：db 层 12 方法 + 市场令牌 + 动态税 + 锚点价 + 邮箱发放）
- [x] `routes/alliance.js` + `routes/online/caveDiscipleRoutes.js` + `game/cave.js`
- [x] `routes/trial.js` / `routes/duel`（city_duel 并入 dungeonBattle.js）/ `routes/league.js` + `game/leagueSystem.js`
- [x] `routes/mail.js` / `routes/online/*`（百艺/宗门/洞府；传人已删除）
- [x] `game/equipmentGen.js`（装备生成，完整复用）
- [x] `game/talents.js`（天赋，完整复用）
- [x] `routes/email.js`（邮箱绑定，验证码机制已取消）
- [x] `routes/invite.js`（邀请系统）、`routes/gm.js`（GM 工具）、`routes/apprentice.js`（传人派遣）

### P3 — 基础设施
- [ ] WebSocket 战斗推送 → Durable Objects
- [ ] 游戏循环 / 定时结算（联赛 run_due、战神榜赛季、百艺离线结算、洞府采集）→ Cron Triggers（当前为惰性/请求级触发）
- [ ] 玩家写锁（原 settlementLock）→ D1 事务 / DO 串行化（当前依赖 D1 原子 UPDATE 兜底）
- [ ] 静态数据 CDN（Pages 或 KV）
- [ ] 邮箱验证码真实发送（需 SMTP / Email Worker；当前验证码机制已取消）

## 迁移策略

1. **纯逻辑模块直接复制**：battleEngine、combatUtils、equipmentGen 等都是纯 JS 计算，
   不依赖 Node 特有 API 的部分原样搬移，只替换 IO（db 调用 → D1）。
2. **db 调用替换**：原 `db.getPlayerByAccountId()` → `env.DB.prepare('SELECT * FROM players WHERE account_id=?').bind(id).first()`。
   建议写 `src/db.js` 封装层，让迁移路由保持接近原写法。
3. **Node 特有依赖替换**：
   - `crypto.createHash` → WebCrypto `crypto.subtle`
   - `fs.readFileSync`（静态 JSON）→ KV `env.GAME_DATA_KV.get()`
   - `setInterval`（游戏循环）→ Cron Triggers
   - `Buffer` → `TextEncoder/TextDecoder` / base64
4. **前端兼容**：前端 `api.js` 已支持 `IDEER_API_BASE` 覆盖，部署后把 API 指向 game-api Worker 域名。

## 部署

```bash
# 1. 创建 D1
npx wrangler d1 create ideer-game
#    把 database_id 填入 wrangler.toml

# 2. 初始化 schema
npx wrangler d1 execute ideer-game --remote --file=migrations/001_schema.sql

# 3. 创建 KV 并上传静态数据
npx wrangler kv namespace create ideer-game-data
node scripts/upload-game-data.js --namespace-id=<KV_ID>
#    把 KV id 填入 wrangler.toml

# 4. 部署
npx wrangler deploy
```

## 验证

```bash
# 注册
curl -X POST https://<worker>/api/auth/register -d '{"username":"test1","password":"123456"}'
# 登录
curl -X POST https://<worker>/api/auth/login -d '{"username":"test1","password":"123456"}'
# 建角色（带 token）
curl -X POST https://<worker>/api/player/create -H "Authorization: Bearer <token>" -d '{"name":"测试","spirit_roots":[1,2]}'
# 同步
curl https://<worker>/api/player/sync -H "Authorization: Bearer <token>"
```
