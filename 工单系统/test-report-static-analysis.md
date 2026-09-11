# 艾德尔工单系统 - 静态代码分析测试报告

> 分析时间: 2026-07-21
> 分析方式: 代码静态审查 + 预测性功能测试
> 注意: 由于 Cloudflare Workers 域名 (.workers.dev) 在国内被 GFW 封锁，无法进行实时 API 测试。本报告基于代码逻辑分析预测各功能状态。
>
> **网络诊断结果 (2026-07-21 12:23)**:
> - DNS 解析: 正常 (185.60.218.50)
> - 代理 (Clash 127.0.0.1:7890): 运行正常
> - 其他 HTTPS 站点: 可正常访问 (api.ipify.org, httpbin.org 均返回 200)
> - Cloudflare Workers 域名: **被 GFW 专门封锁** (TLS 握手被 RST)
> - 结论: `.workers.dev` 域名在国内无法通过任何代理访问

---

## 测试总结

| 指标 | 数值 |
|------|------|
| 总测试点 | 50 |
| 预测通过 | 22 |
| 预测失败 | 18 |
| 需实时验证 | 10 |
| 预测通过率 | 44% |

---

## 阶段 1: 公开 API（无需认证）

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 1 | 系统配置 | GET /api/config | PASS | config 表存在于 schema.sql，无依赖问题 |
| 2 | 公告列表 | GET /api/announcements | PASS | announcements 表存在于 schema.sql |
| 3 | 广告列表 | GET /api/ads | PASS | ads 表存在于 schema.sql |
| 4 | 排行榜 | GET /api/leaderboard | PASS | 查询 users 表，无依赖问题 |

---

## 阶段 2: 用户注册

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 5 | 正常注册 | POST /api/auth/register | PASS | register.js 逻辑完整，schema 支持 |
| 6 | 重复用户名注册(应409) | POST /api/auth/register | PASS | 代码有 UNIQUE 约束检查 |
| 7 | 缺少字段注册(应400) | POST /api/auth/register | PASS | 代码有参数校验 |

---

## 阶段 3: 用户登录

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 8 | 正常登录 | POST /api/auth/login | PASS | login.js 逻辑完整 |
| 9 | 管理员登录 | POST /api/auth/login | PASS | seed 用户 admin/admin123 存在 |
| 10 | 错误密码登录(应401) | POST /api/auth/login | PASS | 代码有密码验证 |

---

## 阶段 4: 用户 API（需认证）

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 11 | 用户信息 | GET /api/user/info | FAIL | `_auth.js:17` 查询 `total_purchased_points` 字段，该字段不存在于 users 表 |
| 12 | 用户统计 | GET /api/user/stats | FAIL | 同上，依赖 total_purchased_points |
| 13 | 用户配置 | GET /api/user/config | PASS | 简单查询，无额外依赖 |
| 14 | 未认证访问(应401) | GET /api/user/info | PASS | 认证中间件正常 |

---

## 阶段 5: 工单系统

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 15 | 工单列表 | GET /api/orders | PASS | orders 表存在 |
| 16 | 工单活动列表 | GET /api/orders/activities | PASS | order_activities 表存在 |
| 17 | 创建工单 | POST /api/orders | PASS | 逻辑完整，支持优惠券/等级折扣 |
| 18 | 创建工单缺字段(应400) | POST /api/orders | PASS | 代码有参数校验 |
| 19 | 工单详情 | GET /api/orders/:id | PASS | 简单查询 |

---

## 阶段 6: 游戏账号

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 20 | 账号列表 | GET /api/accounts | PASS | game_accounts 表存在 |

---

## 阶段 7: 邀请系统

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 21 | 邀请信息 | GET /api/invite/info | PASS | 查询 users 表 invite_code 等字段 |
| 22 | 邀请购买 | POST /api/invite/purchase | FAIL | **BUG**: `invite/purchase.js:27` 引用 `pkg.points` 应为 `pkg.coins`（_xp.js 中 CASH_PACKAGES 用的是 coins） |
| 23 | 邀请提现 | POST /api/invite/withdraw | PASS | 逻辑简单，查询 invite_points |

---

## 阶段 8: 通知系统

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 24 | 通知列表 | GET /api/notifications | PASS | notifications 表存在 |
| 25 | 未读通知数 | GET /api/notifications/unread-count | PASS | 简单 COUNT 查询 |

---

## 阶段 9: 市场系统

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 26 | 官方市场商品列表 | GET /api/market/items | FAIL | `market_items` 表在 migration_v5.sql 中定义但**未执行迁移** |
| 27 | 购买官方商品 | POST /api/market/purchase | FAIL | 依赖 `market_items` 表，不存在 |
| 28 | 黑市商品列表 | GET /api/market/orders | FAIL | `market_orders` 表在 migration_v5.sql 中定义但**未执行迁移** |
| 29 | 创建黑市商品 | POST /api/market/orders | FAIL | 依赖 `market_orders` 表，不存在 |

---

## 阶段 10: 充值系统

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 30 | 充值套餐列表 | GET /api/recharge/packages | FAIL | `recharge/index.js:37` 查询 `recharge_orders` 表，该表在 migration_v5.sql 中**未执行迁移** |
| 31 | 充值记录列表 | GET /api/recharge | FAIL | 同上 |
| 32 | 提交充值请求 | POST /api/recharge | FAIL | INSERT INTO `recharge_orders` 表不存在 |

---

## 阶段 11: 兑换码系统

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 33 | 使用兑换码 | POST /api/redeem | FAIL | `redeem/index.js:12` 查询 `recharge_codes` 表，该表在 migration_v6.sql 中**未执行迁移** |

---

## 阶段 12: 申诉系统

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 34 | 申诉列表 | GET /api/appeals | PASS | appeals 表存在于 schema.sql |

---

## 阶段 13: 机器人 API

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 35 | 机器人问答 | POST /api/bot/ask | PASS | 内置 AI 逻辑，无数据库依赖（除 bot_logs） |
| 36 | FAQ列表 | GET /api/bot/faq | PASS | 静态数据 |

---

## 阶段 14: 管理后台 API

| # | 浆试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 37 | 管理员工单列表 | GET /api/admin/orders | FAIL | `admin/orders.js:6` 使用 `user.is_admin` 而非 `isAdmin(user)`，权限检查不一致 |
| 38 | 管理员统计 | GET /api/admin/stats | FAIL | `admin/stats.js:6` 使用 `user.is_admin`，同样的权限问题 |
| 39 | 管理员充值列表 | GET /api/admin/recharge | FAIL | 依赖 `recharge_orders` 表（未迁移） |
| 40 | 管理员积分调整 | GET /api/admin/points | PASS | 使用正确的 `authenticateAdmin()` |
| 41 | 管理员市场商品列表 | GET /api/admin/market/items | FAIL | 依赖 `market_items` 表（未迁移） |
| 42 | 管理员创建商品 | POST /api/admin/market/items | FAIL | 依赖 `market_items` 表（未迁移） |
| 43 | 管理员黑市订单 | GET /api/admin/market/orders | FAIL | 依赖 `market_orders` 表（未迁移） |
| 44 | 管理员兑换码列表 | GET /api/admin/redeem/codes | FAIL | 依赖 `recharge_codes` 表（未迁移） |
| 45 | 普通用户访问管理API(应403) | GET /api/admin/orders | 需验证 | 权限检查不一致，可能返回 500 而非 403 |

---

## 阶段 15: 错误处理和边界测试

| # | 测试名称 | 请求 | 预测结果 | 原因 |
|---|----------|------|----------|------|
| 46 | 不存在的API路径 | GET /api/nonexistent | PASS | Pages Functions 返回 404 |
| 47 | 无效Token访问(应401) | GET /api/user/info | PASS | 认证中间件检查 token |
| 48 | 联系站长留言 | POST /api/contact | PASS | contact_messages 表存在 |
| 49 | 忘记密码请求 | POST /api/auth/forgot-password | PASS | 逻辑完整（但安全问题：token 暴露在响应中） |
| 50 | GH Actions接口(无Key) | GET /api/gh/report-account | PASS | API Key 验证正常 |

---

## 关键问题汇总

### P0 - 阻塞性问题（6个功能完全不可用）

| 问题 | 影响范围 | 根因 |
|------|----------|------|
| `recharge_orders` 表不存在 | 充值系统（3个API） | migration_v5.sql 未执行 |
| `market_items` 表不存在 | 官方市场（3个API） | migration_v5.sql 未执行 |
| `market_orders` 表不存在 | 黑市系统（3个API） | migration_v5.sql 未执行 |
| `recharge_codes` 表不存在 | 兑换码系统（1个API） | migration_v6.sql 未执行 |
| `total_purchased_points` 字段不存在 | 用户信息/统计（2个API） | migration_v8.sql 未执行或字段遗漏 |
| invite/purchase.js `pkg.points` BUG | 邀请购买（1个API） | 代码属性名错误 |

### P1 - 权限问题

| 问题 | 影响范围 | 根因 |
|------|----------|------|
| admin/orders.js 使用 `user.is_admin` | 管理员工单管理 | 应使用 `isAdmin(user)` |
| admin/stats.js 使用 `user.is_admin` | 管理员统计 | 应使用 `isAdmin(user)` |
| admin/recharge.js 使用 `user.role` | 管理员充值 | 应使用 `authenticateAdmin()` |
| admin/market/items.js 使用 `user.role` | 管理员市场 | 应使用 `authenticateAdmin()` |

### P2 - 前端问题

| 问题 | 影响范围 | 根因 |
|------|----------|------|
| api.js 重复方法定义 | getUserInfo() 重复、validateCoupon() 重复 | 代码冗余，可能导致运行时覆盖 |

---

## 修复优先级建议

### 第一步：执行数据库迁移（解决 P0 问题）
```bash
# 在 Cloudflare Dashboard 或通过 wrangler 执行:
wrangler d1 execute ider-orders --file=migration_v5.sql
wrangler d1 execute ider-orders --file=migration_v6.sql
wrangler d1 execute ider-orders --file=migration_v8.sql
```

### 第二步：修复代码 BUG
1. `invite/purchase.js:27` - `pkg.points` 改为 `pkg.coins`
2. `_auth.js:17` - 移除或添加 `total_purchased_points` 字段
3. 统一管理员权限检查为 `authenticateAdmin()`

### 第三步：清理前端重复代码
1. `api.js` 移除重复的 `getUserInfo()` 和 `validateCoupon()`

---

## 实时测试指南

由于 `.workers.dev` 域名在国内被 GFW 封锁，实时测试需要以下方式之一：

### 方式 1: 使用代理运行测试脚本
```bash
# 已创建测试脚本: 工单系统/test-api.mjs
node 工单系统/test-api.mjs --proxy http://127.0.0.1:7890
# 或
HTTPS_PROXY=http://127.0.0.1:7890 node 工单系统/test-api.mjs
```

### 方式 2: 本地运行 Worker（推荐）
```bash
cd 工单系统
npx wrangler dev
# 然后修改 test-api.mjs 中的 BASE_URL 为 http://localhost:8787
```

### 方式 3: 配置自定义域名
在 Cloudflare Dashboard 为 Pages 项目绑定自定义域名（如 `api.你的域名.com`），国内 DNS 可解析。

---

*报告生成完毕*
