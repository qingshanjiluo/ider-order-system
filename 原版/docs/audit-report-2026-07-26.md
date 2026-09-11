# 艾德尔工单系统 · 全量审查报告

> 审查范围: GitHub Actions 工作流 · Worker · Pages Functions · gh-actions 脚本 · 前端 · 数据库
> 审查日期: 2026-07-26

---

## 目录

1. [安全漏洞（严重）](#1-安全漏洞严重)
2. [GitHub Actions 工作流](#2-github-actions-工作流)
3. [Worker (index.js)](#3-worker-indexjs)
4. [Pages Functions](#4-pages-functions)
5. [gh-actions 脚本](#5-gh-actions-脚本)
6. [前端页面](#6-前端页面)
7. [数据库与架构](#7-数据库与架构)
8. [总评与修复优先级](#8-总评与修复优先级)

---

## 1. 安全漏洞（严重）

### 1.1 密钥硬编码在源码中

**涉及文件**: `gh-actions/` 下几乎所有脚本

```js
// scan_orders.js:12, health_check.js:12, daily_maintenance.js:12, pre_check.js:10
const API_KEY = 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';
// scan_orders.js:11, health_check.js:11, level_up.js:12, etc.
const WORKER_URL = 'https://ider-order-system.sifangzhiji.workers.dev';
// 所有脚本
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';
```

**严重性**: 🔴 任何人拿到仓库源码即可调用生产 Worker API 和游戏服务器 API。

### 1.2 游戏账号密码硬编码

```js
// auto_farm.js:8-9, auto_sell.js:8-9, daily_trial.js:9-10, trial_tester.js:34-35
const FARM_USERNAME = 'zzhx';
const FARM_PASSWORD = 'Pipi20100817';
```

**严重性**: 🔴 游戏账号密码明文暴露在代码仓库中。

### 1.3 全站 XSS 漏洞

**范围**: 所有前端页面使用 `innerHTML` + 模板字符串嵌入 API 返回数据，未做 HTML 转义。

```js
// admin-accounts.js, accounts.js, order-detail.js, admin-orders.js, account-detail.js, etc.
`<td>${a.username || '-'}</td>`
`<td>${a.character_name || '-'}</td>`
```

**严重性**: 🔴 如果任何 API 数据包含 `<script>` 标签，XSS 可完全控制用户会话。

### 1.4 缺少 CSP 头

**范围**: 全站无 Content-Security-Policy 头，配合 `innerHTML` + `onclick` 属性，任何 XSS 可完全执行。

---

## 2. GitHub Actions 工作流

### 2.1 子目录死文件（严重）

**问题**: `工单系统/.github/workflows/` 下的 **11 个文件不会被 GitHub 识别执行**（GitHub 只扫描根目录 `.github/workflows/`）。

**涉及文件**:
```
工单系统/.github/workflows/auto-farm.yml
工单系统/.github/workflows/auto-fill.yml
工单系统/.github/workflows/auto-levelup-fast.yml
工单系统/.github/workflows/auto-levelup.yml
工单系统/.github/workflows/auto-sell.yml
工单系统/.github/workflows/daily-maintenance.yml
工单系统/.github/workflows/daily-trial.yml
工单系统/.github/workflows/deploy.yml
工单系统/.github/workflows/health-check.yml
工单系统/.github/workflows/order-scan.yml
工单系统/.github/workflows/trial-test.yml
```

**影响**: 子目录里修改工作流等于是改了没用的副本，真正的生效在根目录。

### 2.2 Node 版本已弃用

**问题**: 21 个根工作流中 20 个使用 `node-version: 20`（已弃用），3 个使用 `node-version: 18`（已 EOL）。

**涉及文件**:
- Node 18: `alliance-daily.yml:82`, `batch-register.yml:85`, `check-accounts.yml:56`, `email-bind.yml:75`
- Node 20: 其余 17 个
- Node 22（正确）: `deploy.yml:19`

### 2.3 timeout-minutes 缺失

**问题**: 以下工作流没有设置 timeout-minutes，默认 6h 超时：
`ai-planner.yml`, `alchemy-pipeline.yml`, `alliance-daily.yml`, `auto-alchemy.yml`, `batch-register.yml`, `check-accounts.yml`, `craft-pills.yml`, `daily-dispatch.yml`, `dungeon-clear.yml`, `email-bind.yml`, `mail-claim.yml`

**`order-scan.yml:53`** 只有 `timeout-minutes: 60`，处理大量账号可能不够。

### 2.4 Cron 调度碰撞

| 碰撞时间 | 工作流 | 问题 |
|---------|--------|------|
| 每天 2:00 UTC | `daily-trial.yml` + `health-check.yml` | 同时运行两个重量级任务 |
| 0、6、12、18 点 | `auto-levelup.yml`(3h) + `auto-levelup-all.yml`(2h) | 重叠运行同类型任务 |

### 2.5 脚本路径风格不统一

**写法 A**（正确，推荐）: `working-directory: 工单系统` + `run: node gh-actions/xxx.js`
**写法 B**: 无 working-directory，`run: node 工单系统/gh-actions/xxx.js`

涉及冲突文件: `auto-levelup.yml:21`, `daily-dispatch.yml:18`, `dungeon-clear.yml:18`

### 2.6 缺失环境变量

- `daily-trial.yml`: 缺少 `API_BASE`、`SIGN_KEY`、`CLIENT_VERSION`
- `auto-farm.yml`: 依赖 `secrets.FARM_USERNAME`/`FARM_PASSWORD`，未设置则运行失败
- `auto-sell.yml`: 同上

---

## 3. Worker (index.js)

### 3.1 认证问题

**`/api/config`（L1702-1707）**: 无需认证即可返回**所有**配置值，可能暴露 AI API Key。

### 3.2 角色字段不存在

**L1284-1309** (`/api/admin/recharge-codes`): 检查 `user.role` 但 `authenticate()` 返回的 user 对象没有 `role` 字段（只有 `is_admin`）。**所有管理员都无法访问充值码管理端点。**

### 3.3 complete-order 阶段逻辑错误

**L1653**: 当所有账号都已完成（`farming=0, finished=total`），阶段 1 和阶段 2 条件**同时匹配**。阶段 1 先触发，把订单设为 `processing` 而非 `completed`。

**L1639-1647**: `finalPhase` 包含 `failed`，导致全部失败的订单也被视为"已完成"。

### 3.4 report-account 状态转换问题

**L1407-1410**: 重试失败账号时重置了 `status` 和 `error_msg`，但**没有重置 `password` 或 `server_password`**。如果密码是注册失败的原因，重试会再次失败。

**L1426-1437**: `JSON.stringify(skills || [])` — 如果调用方已传入 JSON 字符串，会双重序列化。

### 3.5 竞态条件

**L1800-1857** (`redeem`): 兑换码使用存在竞态条件——检查是否已使用（L1813-1816）和更新计数（L1829-1836）之间有 `await` 调用。

### 3.6 聊天系统问题

- 无每用户频率限制（只有全局 60 次/分钟）
- `user.nickname` 因 SELECT 未包含而始终为 `undefined`
- 无内容审核

### 3.7 其他

- **L186-221**: 频率限制使用进程内 `Map` —— Cloudflare Workers 多隔离区（isolates）无法共享状态
- **L367**: 严格每 IP 一个账号 —— NAT 网络用户无法注册
- **L278**: `PAGES_URL` 硬编码
- **无 WebSocket 实现**（项目需求提到但未实现）
- 大量 `.catch(() => {})` 静默吞噬错误

---

## 4. Pages Functions

### 4.1 管理员权限检查不一致

**`admin/accounts.js:10`**: 使用 `!user.is_admin` 检查
**`auth.js:39`**: `isAdmin()` 使用 `user.is_admin === 1 || user.role === 'admin' || user.role === 'super_admin'`
**影响**: `admin/accounts.js` 不兼容 `role=admin` 但 `is_admin=0` 的用户。

### 4.2 管理员查看他人工单账号为空

**`accounts/index.js:13`**: `WHERE o.user_id = ?` 强制限制为当前用户。
**影响**: 管理员完全看不到他人工单下的账号列表。

### 4.3 订单状态修改端点路径不一致

**`orders/[id]/status.js`**: 使用 `authenticateAdmin` 却是 `/api/orders/:id/status` 路径（应为 `/api/admin/orders/:id/status`）。

### 4.4 `/api/config` 泄露

**`config.js:8-11`**: 返回 config 表的所有 key-value 对，可能泄露 AI API Key。

### 4.5 优惠券校验无需登录

**`coupon/validate.js`**: 没有任何认证，可被遍历。

---

## 5. gh-actions 脚本

### 5.1 大量空 catch 块（严重）

**涉及位置**: 几乎每个脚本都有 `catch (e) {}` 或 `catch (e2) {}`。

```js
// scan_orders.js:106,329,344,353
// health_check.js:195,238,152,289
// level_up.js:124,178,239
// auto_levelup_all.js:85,112,117,156,164,189
// daily_trial.js:109,177
// daily_maintenance.js:152
// dungeon_clear.js:128
// trial_tester.js:413
```

**影响**: 关键错误（登录失败、token 过期、战斗停用）被静默忽略。

### 5.2 重复代码（中等）

以下函数在每个脚本中完全重复（13 份）：

| 函数 | 出现次数 |
|------|---------|
| `makeSign()` | 13 |
| `apiRequest()` | 13 |
| `sleep()` | 12 |
| `workerApi()` | 7 |
| `tsLog()` | 6 |
| 环境变量验证循环 | 7 |
| 所有常量 | 13 |

**建议**: 提取为 `_api.js` / `_config.js` 共享模块。

### 5.3 API 调用格式不一致

- `/battle/start` 使用 `mapId`（camelCase）
- `/player/set_map` 使用 `map_id`（snake_case）
- `auto_farm.js:38` 跳过 `API_BASE` 直接硬编码 URL
- `daily_trial.js` 等使用原生 `https` 模块而非 `fetch`

### 5.4 战斗检测逻辑问题

**`auto_farm.js:96`**: `currentMap > 1` 被用作战斗检测——地图 ID > 1 不代表在战斗中，逻辑错误。

**`health_check.js:127`**: `const hasBattle = false;` 声明了但从未使用。

### 5.5 竞态条件

- **`auto_levelup_all.js:97-99`**: `battle/start` → `sleep(800)` → `battle/auto_restart` — 800ms 可能不够
- **`scan_orders.js:390-394`**: 申请仙盟后 `sleep(2000)` 然后立即检查 — 服务器处理慢时会失败

### 5.6 运算符优先级 Bug

**`auto_farm.js:87`**:
```js
console.log('  ✅ 已切换到 ' + MAP_NAMES[MAP_ID] || MAP_ID)
```
由于运算符优先级，`||` 作用在字符串拼接结果而非 `MAP_NAMES[MAP_ID]`。地图名回退永远不生效。

---

## 6. 前端页面

### 6.1 轮询定时器泄漏

**`accounts.js:87`**, **`dashboard.js:108`**: 使用 `setInterval(loadAccounts, 20000)` 但离开页面时不清除。导航到详情页后后台继续发请求。

### 6.2 重试状态不匹配

**`admin-accounts.js`** 的 `STATUS_MAP` 有 `creating` 但没有 `registering`。重试后后端设 status 为 `'registering'` 但前端无对应 badge 样式。

### 6.3 客户端过滤受限于 LIMIT 100

**`admin/accounts.js:16`**: 后端 `LIMIT 100`。
**前端**: 在客户端做 status/setup 过滤（只有 100 条数据可用）。

### 6.4 `res.accounts || res || []` 模式问题

**`admin-accounts.js:128`**, **`accounts.js:50`**, **`dashboard.js:30`**, **`order-detail.js:24`**: 如果 `res.accounts` 是 undefined，使用 `res`（对象）作为数组，`.filter()` 会崩溃。

### 6.5 setup_status 显示函数三份重复

`admin-accounts.js`、`account-detail.js`、`order-detail.js` 各有自己的 `getSetupLabel` / `SETUP_MAP`，可能不一致。

### 6.6 内联样式问题

`admin-orders.js:132,136` 等按钮使用大段内联样式而非 CSS 类。

---

## 7. 数据库与架构

### 7.1 架构问题

- **状态机不完整**: `game_accounts.status` 缺少中间状态文档
- **兑换码并发**: 无事务或 `UPDATE ... WHERE used_count = old_count` 乐观锁

### 7.2 缺少字段

- `game_accounts` 缺少 `exp` / `exp_percent`（刚通过 migration_exp.sql 添加）

---

## 8. 总评与修复优先级

### 优先级 P0（必须立即修复 — 安全/数据丢失）

| # | 问题 | 文件 |
|---|------|------|
| 1 | API_KEY/SIGN_KEY/密码硬编码在源码 | 所有 gh-actions 脚本 |
| 2 | 空 catch 块吞噬关键错误 | 所有 gh-actions 脚本 |
| 3 | 全站 XSS（innerHTML 不转义） | 所有前端页面 |
| 4 | 角色字段不存在导致充值码管理 403 | `worker/index.js:154` |

### 优先级 P1（功能损坏）

| # | 问题 | 文件 |
|---|------|------|
| 5 | 子目录 workflow 是死文件 | `工单系统/.github/workflows/` |
| 6 | complete-order 阶段逻辑错误 | `worker/index.js:1653` |
| 7 | 管理员看不到他人工单账号 | `functions/api/accounts/index.js:13` |
| 8 | 订单端点路径不一致 | `functions/api/orders/[id]/status.js` |
| 9 | `auto_farm.js` 日志 Bug（运算符优先级） | `gh-actions/auto_farm.js:87` |
| 10 | 轮询定时器泄漏 | `accounts.js:87`, `dashboard.js:108` |

### 优先级 P2（优化）

| # | 问题 | 文件 |
|---|------|------|
| 11 | 工作流 Node 版本升级（18→22, 20→22） | 全部 workflow |
| 12 | 重复代码抽取共享模块 | 所有 gh-actions 脚本 |
| 13 | 工作流 timeout-minutes 补全 | 多个 workflow |
| 14 | `daily-trial.yml` 缺失 env | `.github/workflows/daily-trial.yml` |
| 15 | 工作流脚本路径风格统一 | `.github/workflows/` |
| 16 | 后端 admin/accounts LIMIT 100 不足 | `functions/api/admin/accounts.js` |
| 17 | setup_status 显示函数重复 | 3 个前端文件 |
| 18 | 兑换码竞态条件 | `worker/index.js:1800-1857` |
| 19 | `/api/config` 无需认证 | `worker/index.js:1702` |
| 20 | 优惠券无需认证可遍历 | `functions/api/coupon/validate.js` |

---

> 请确认是否按此优先级修复，或调整顺序。
