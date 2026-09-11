# 艾德尔修仙传 API 参考文档

> 游戏服务器: `http://43.130.240.37:3000`
> 源码位置: `G:\皮皮\编程项目\艾德尔机器人\源代码\server\`

---

## 一、请求规范

### 1.1 签名算法

所有请求必须带签名头：

```
X-Sign-T: <Unix时间戳(秒)>
X-Sign: HMAC-SHA256(方法 + "\n" + 路径 + "\n" + 时间戳 + "\n" + 请求体)
```

签名密钥（硬编码）：
```
KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l
```

### 1.2 公共请求头

```js
{
  'Content-Type': 'application/json',
  'X-Client-Version': '1.2.4',
  'X-Sign-T': String(Math.floor(Date.now() / 1000)),
  'X-Sign': '<hmac-hex>',
  'Authorization': 'Bearer <token>'  // 登录后需要
}
```

### 1.3 Token

- JWT, payload: `{ accountId, username, sessionId }`
- 有效期: 7 天
- 服务端存储: `localStorage key='game_token'`

### 1.4 通用响应格式

```js
// 成功
{ ok: true, ... }

// 失败
{ ok: false, error: '错误描述' }

// 封禁
{ ok: false, error: '账号已封禁：珍爱老冯，远离作弊' }
```

---

## 二、认证 API

### `POST /auth/register`

请求：
```js
{ username: string, password: string, machine_id?: string }
```

响应：
```js
{ ok: true, token: string, accountId: number }
```

错误：`缺少用户名或密码` | `用户名已存在` | `该IP已被封禁` | `密码至少 6 位`

### `POST /auth/login`

请求：
```js
{ username: string, password: string, machine_id?: string }
```

响应：
```js
{ ok: true, token: string, accountId: number }
```

---

## 三、玩家 API

### `GET /player/ping`

心跳检测，无需参数。

响应：
```js
{ ok: true, ts: number }
```

### `GET /player/state`

轻量状态同步（无离线结算）。

响应：
```js
{
  ok: true,
  hasCharacter: boolean,
  player: {
    name: string,
    level: number,
    exp: number,
    max_exp: number,        // 服务端补充
    hp: number, max_hp: number,
    mp: number, max_mp: number,
    spirit_stones: number,
    trial_coins: number,
    league_points: number,
    league_rating: number,
    current_map_id: number,
    rest_until: number,
    auto_battle_enabled: boolean,
    auto_battle_map_id: number,
    sect_id: number,
    alliance_id: number,
    alliance_contribution: number,
    baiyi: { pending_job: object|null },
    cave: { gathering: object|null },
    time_state: { last_activity_at: number }
  } | null,
  active_battle: { battleId: string } | null,
  email_bound: boolean,
  ts: number
}
```

### `GET /player/sync`

完整数据同步（含离线结算、战报、技能冷却清理）。

响应比 state 多：
```js
{
  player: { /* 完整 player(含装备/背包/技能等) */ },
  offline_battle_report: object|null,
  sync_fast_mode: boolean,
  sync_heavy_settled: boolean,
  sync_deep_maintenance_run: boolean,
  sync_heavy_due_in_sec: number,
  sync_heavy_interval_sec: number
}
```

节流时：
```js
{ ok: false, error: '同步过于频繁...', code: 'SYNC_RATE_LIMITED', retry_after_ms: number }
```

### `POST /player/create`

请求：
```js
{
  name: string,         // 2-30 字符，角色名
  spirit_roots: {       // 五灵根，总和=100
    metal: number,
    wood: number,
    water: number,
    fire: number,
    earth: number
  }
}
```

响应：
```js
{ ok: true, player: { /* 完整初始 player */ } }
```

错误：`已有角色` | `五灵根总和必须为 100 点` | `该角色名已被使用`

### `POST /player/level_up`

请求：`{}` 空对象

响应：
```js
{ ok: true, player: { /* 升级后 player(level+1, exp抵扣) */ } }
```

错误：`无角色` | `经验不足`（exp 不够升一级时返回此错误，非 ok:false 而是异常）

### `POST /player/breakthrough`

请求：`{}` 空对象

响应：
```js
{ ok: true, player: { /* 突破后 player */ }, success: boolean, penalty: object|null }
```

### `POST /player/equip`

请求：
```js
{ page: number, slot_index: number, expect_item_id?: number }
```

### `POST /player/equip_skill`

请求：
```js
{ skill_id: number }
```

### `POST /player/unequip_skill`

请求：
```js
{ skill_id: number }
```

### `POST /player/set_technique`

请求：
```js
{ slot: 'main'|'sub', technique_id: number }
```

### `POST /player/set_map`

请求：
```js
{ map_id: number }
```

响应：
```js
{ ok: true, player: { ... }, map_id: number, map_name: string }
```

### `POST /player/use_item`

请求：
```js
{ page: number, slot_index: number, count: number, expect_item_id?: number, use_options?: object }
```

---

## 四、战斗 API

### `POST /battle/start`

请求：
```js
{ mapId: number, poll_mode: boolean, auto_restart: boolean }
```

响应：
```js
{ ok: true, battleId: string, events: [...] }
```

节流：`{ ok: false, error: '开始战斗过于频繁...', code: 'BATTLE_START_THROTTLED', retry_after_ms }`

### `POST /battle/auto_restart`

请求：
```js
{ enabled: boolean, map_id?: number }
```

---

## 五、游戏数据

### 5.1 经验表 (`game/exp.js`)

- `EXP_TABLE[lv]` = 从 `lv` 升到 `lv+1` 所需经验
- `lv` 范围: 0..400, `EXP_TABLE[1]=168`, 指数增长到 `EXP_TABLE[399]=1259838720`
- 最大等级: 120（工单系统目标），第 120 级需约 200 万经验

```js
function calculateExpNeeded(level) {
  if (level <= 0) return 0;
  if (level >= 400) return EXP_TABLE[399];
  return EXP_TABLE[level];
}
```

### 5.2 初始角色 (`game/initialPlayer.js`)

初始背包：
- `[0][0]` = 铁剑 (item_id=11)
- `[0][1]` = 寒潭沙 (item_id=27) × 2

初始技能预设：
```js
skill_presets: {
  grind: { equipped_skills: [], key_skill_id: 0 },
  dungeon: { equipped_skills: [], key_skill_id: 0 },
  duel: { equipped_skills: [], key_skill_id: 0 }
}
```

### 5.3 游戏数据文件 (`源代码/data/`)

玩家创建后需要设置：

| 数据 | 来源文件 | 初始推荐值 |
|------|---------|-----------|
| 技能 | `skills.json` | 重击(id=1), 火球术(id=2), 治疗术(id=3) |
| 功法 | `techniques.json` | 吐纳法(id=1) |
| 地图 | `maps.json` | 荒石村(id=1) |
| 装备 | `items.json` | 铁剑(id=11, 初始背包已有) |
| 怪物 | `enemies.json` | 地图关联的怪物 |

---

## 六、完整自动化账号 Setup 流程

```
1. POST /auth/register     → 注册账号，取 token
2. POST /player/create      → 创建角色（金灵根100）
3. POST /player/sync        → 拉取完整玩家数据（拿背包/技能列表）
4. POST /player/equip_skill → 装备重击(id=1)
5. POST /player/equip_skill → 装备火球术(id=2)
6. POST /player/equip_skill → 装备治疗术(id=3)
7. POST /player/equip       → 装备铁剑（page=0, slot_index=0, expect_item_id=11）
8. POST /player/set_technique → 设置功法吐纳法（slot='main', technique_id=1）
9. POST /battle/start       → 开始战斗（mapId=1, auto_restart=false）
10. POST /battle/auto_restart → 开启自动刷怪（enabled=true, map_id=1）
```

**循环升级：**
```
1. POST /player/level_up → 升级（重复直到经验不足）
2. POST /player/state    → 检查当前等级和经验
3. POST /player/breakthrough → 100级时突破境界
```

---

## 七、开发注意事项

### 7.1 限流

- `/player/sync`: 最小间隔 2s，60s 内超 20 次封 10 分钟
- `/battle/start`: 有节流限制 (`BATTLE_START_THROTTLED`)

### 7.2 写操作串行

player 写操作（POST）会被 settlementLock 串行化：
- 如果正在离线结算，POST 会返回 `{ ok: false, error: '数据结算中，请稍后重试' }`
- 重试 1-2 秒即可

### 7.3 角色名规则

- 2-30 字符
- 不能与已有角色重名
- 角色名含特殊规则需测试

### 7.4 瓶颈

- 高等级所需经验指数增长（120 级约需 200 万经验，400 级需 12 亿）
- 战斗产经验速度约每秒计算一次（取决于 auto_battle 频率）
- 高峰期升级慢是因为战斗产经验需要时间
