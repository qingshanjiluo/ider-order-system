# 艾德尔工单系统 — 全功能自动化测试报告

- **测试时间**: 2026/7/21 21:27:06
- **测试URL**: https://ider-order-system.pages.dev
- **测试用户**: test_1784619977185
- **管理员**: zzhx
- **总耗时**: 28.0 秒

## 测试汇总

| 指标 | 数值 |
|------|------|
| 总计 | 80 |
| ✅ 通过 | 75 |
| ❌ 失败 | 5 |
| ⏭️ 跳过 | 2 |
| 通过率 | 93.8% |

## 详细结果

### P1 (7/7 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/public/config | ✅ PASS | status=200 |
| GET /api/stats | ✅ PASS | status=200 |
| GET /api/market/items (无认证→401) | ✅ PASS | status=401 |
| GET /api/orders (无认证→401) | ✅ PASS | status=401 |
| GET /api/user/info (无认证→401) | ✅ PASS | status=401 |
| GET / (首页) | ✅ PASS | status=200, 1429 bytes |
| GET /index.html | ✅ PASS | status=308 |

### P2 (6/6 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| 用户已存在，直接登录 | ✅ PASS | hasToken=true |
| 重复注册应失败 | ✅ PASS | status=403 |
| 缺少密码应失败 | ✅ PASS | status=400 |
| 空用户名应失败 | ✅ PASS | status=400 |
| 超长用户名应失败 | ✅ PASS | status=400 |
| XSS用户名应失败或净化 | ✅ PASS | status=400 |

### P3 (5/5 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| 正确登录 | ✅ PASS | status=200, hasToken=true |
| 错误密码应失败 | ✅ PASS | status=401 |
| 空用户名应失败 | ✅ PASS | status=400 |
| 不存在的用户应失败 | ✅ PASS | status=404 |
| 管理员登录 (zzhx) | ✅ PASS | status=200, hasToken=true, role=super_admin, is_admin=1 |

### P4 (7/7 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/user/info | ✅ PASS | status=200 |
| GET /api/user/profile (应405) | ✅ PASS | status=405 |
| 修改密码（旧密码错误） | ✅ PASS | status=400 |
| 修改密码（旧密码正确） | ✅ PASS | status=200 |
| 改密码后重新登录 | ✅ PASS | hasToken=true |
| PUT /api/user/profile | ✅ PASS | status=200 |
| GET /api/invite/info | ✅ PASS | status=200 |

### P5 (4/4 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/orders | ✅ PASS | status=200 |
| 创建工单 | ✅ PASS | status=400, msg=邀请积分数量必须是10的倍数（最少10）, orderId= |
| GET 不存在的工单 | ✅ PASS | status=404 |
| 创建工单缺少字段应失败 | ✅ PASS | status=400 |

### P6 (1/3 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/accounts | ✅ PASS | status=200 |
| POST /api/gh/report-account (无API Key) | ❌ FAIL | status=200 |
| POST /api/gh/report-health (无API Key) | ❌ FAIL | status=200 |

### P7 (3/3 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/invite/info | ✅ PASS | status=200 |
| POST /api/invite/withdraw | ✅ PASS | status=400, msg=最少提现10积分 |
| POST /api/invite/purchase | ✅ PASS | status=400 |

### P8 (2/2 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/notifications | ✅ PASS | status=200 |
| GET /api/notifications?type=order | ✅ PASS | status=200 |

### P9 (3/3 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/market/items (无认证→401) | ✅ PASS | status=401 |
| GET /api/market/items (已认证) | ✅ PASS | status=200 |
| GET /api/market/orders | ✅ PASS | status=200 |

### P10 (3/3 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/recharge/packages | ✅ PASS | status=200 |
| GET /api/recharge (充值记录) | ✅ PASS | status=200 |
| POST /api/recharge (创建充值) | ✅ PASS | status=400 |

### P11 (0/1 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| POST /api/redeem (兑换) | ❌ FAIL | status=404 |

### P12 (2/2 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/after-sales | ✅ PASS | status=200 |
| POST /api/after-sales | ✅ PASS | status=400 |

### P13 (11/11 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| SQL注入登录 | ✅ PASS | status=404 |
| XSS注入订单 | ✅ PASS | status=400 |
| 超大payload应拒绝 | ✅ PASS | status=400 |
| 未认证访问管理API | ✅ PASS | status=403 |
| 未认证访问管理订单 | ✅ PASS | status=403 |
| 未认证访问管理用户 | ✅ PASS | status=403 |
| 普通用户访问管理API→403 | ✅ PASS | status=403 |
| 普通用户发放修仙分→403 | ✅ PASS | status=401 |
| POST /api/auth/forgot-password | ✅ PASS | status=400 |
| 无效token应拒绝 | ✅ PASS | status=401 |
| 空token应拒绝 | ✅ PASS | status=401 |

### P14 (21/23 通过)

| 测试项 | 结果 | 详情 |
|--------|------|------|
| 普通用户 → 管理统计→403 | ✅ PASS | status=403 |
| 普通用户 → 管理订单→403 | ✅ PASS | status=403 |
| 普通用户 → 管理用户→403 | ✅ PASS | status=403 |
| 普通用户 → 管理充值→403 | ✅ PASS | status=403 |
| 普通用户 → 管理市场→403 | ✅ PASS | status=403 |
| 普通用户 → 兑换码管理→403 | ✅ PASS | status=403 |
| 普通用户 → 修仙分管理→403 | ✅ PASS | status=401 |
| 管理员登录成功 | ✅ PASS | hasToken=true, userId=1 |
| 管理员 → GET /api/admin/stats | ✅ PASS | status=200, users=undefined, orders=undefined |
| 管理员 → GET /api/admin/orders | ✅ PASS | status=200, orders=5 |
| 管理员 → GET /api/admin/orders?status=pending | ✅ PASS | status=200 |
| 管理员 → GET /api/admin/users | ✅ PASS | status=200, users=9 |
| 管理员 → GET /api/admin/recharge | ✅ PASS | status=200 |
| 管理员 → GET /api/admin/market/items | ✅ PASS | status=200, items=2 |
| 管理员 → POST /api/admin/market/items (创建) | ✅ PASS | status=200, msg=商品已创建, itemId=8 |
| 管理员 → GET /api/admin/recharge-codes | ✅ PASS | status=200, codes=1 |
| 管理员 → POST /api/admin/recharge-codes (批量生成) | ❌ FAIL | status=500, msg=ok, count=0, firstCode=none |
| 管理员 → POST /api/admin/points (发放修仙分) | ❌ FAIL | status=500, msg=ok |
| 管理员 → POST /api/admin/points (缺参数→400) | ✅ PASS | status=400 |
| 不存在的路由 | ✅ PASS | status=200 (SPA fallback=200 或 404 均可) |
| GET /api/ads/active | ✅ PASS | status=200 |
| GET /api/public/config | ✅ PASS | status=200 |
| DELETE /api/admin/stats (不支持→405) | ✅ PASS | status=405 |

## ❌ 失败项分析

### POST /api/gh/report-account (无API Key)
- **阶段**: P6
- **详情**: status=200

### POST /api/gh/report-health (无API Key)
- **阶段**: P6
- **详情**: status=200

### POST /api/redeem (兑换)
- **阶段**: P11
- **详情**: status=404

### 管理员 → POST /api/admin/recharge-codes (批量生成)
- **阶段**: P14
- **详情**: status=500, msg=ok, count=0, firstCode=none

### 管理员 → POST /api/admin/points (发放修仙分)
- **阶段**: P14
- **详情**: status=500, msg=ok

