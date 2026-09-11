# 艾德尔修仙传 — 项目工作区

本工作区包含四个子项目，已于 2026-09-11 整理为以下结构：

```
艾德尔机器人/
├── 原版/          # 原版游戏（Node.js + Express + MySQL/SQLite）与批量自动化工具链
│   ├── 源代码/            # 游戏服务端 + web-client 前端 + 爬虫 + AI训练器
│   ├── 批量注册工具/       # 批量注册/邮箱绑定/仙盟日常/自动刷怪等 Node 工具
│   ├── gh-actions/        # 游戏自动化脚本（GitHub Actions 调用）
│   ├── docs/              # 游戏 API 参考、审计报告、油猴皮肤脚本
│   ├── sql/ migrations/   # 原版数据库脚本
│   ├── 仙盟仓库管理插件.js / 账号切换*.js
│   └── 新建文件夹 (6)(1).rar
├── 私服/          # 私服《仙·九重天阙》（Cloudflare 全托管：Pages + Workers + D1 + DO）
│   ├── frontend/          # 前端 SPA（含皮肤切换器）
│   ├── game-api/          # 游戏 API Worker（D1）
│   ├── chat/              # 聊天服务 Worker
│   ├── shared/ scripts/ .github/
│   └── PLAN.md            # 私服部署与改造规划
├── 工单系统/       # 代练工单 + 账号自动化平台（Cloudflare Pages + Functions + D1）
│   ├── 工单系统/          # （原根级工单系统主体：pages-frontend / functions / worker / gh-actions）
│   ├── order-worker/      # 独立订单 Worker
│   ├── ider-order-system-clean/  # 2026-08-27 历史快照（独立 git 仓库，含独有 withdrawals DDL）
│   └── test-api.mjs / 全面审计报告.md / 皮肤系统完整设计文档.md / test-report-*.md
└── 九重宫阙/       # ★ 当前开发重点：水墨修仙挂机页游（Node.js + Express + JSON 存储）
    ├── server.js          # 入口：Express + WebSocket
    ├── src/               # routes(33) / services / middleware / data / scripts
    ├── public/            # 无框架 SPA（api.js + app.js + 水墨风 CSS）
    ├── data/game.json     # JSON 文件数据库
    ├── 方案规划/           # 确认版设计方案 + 42 份系统设计文档
    ├── 开发文档/           # 系统审计报告 + 修复实施计划
    └── 开发计划.md / AUDIT-REPORT-2026-09-10.md
```

## 各子项目技术栈速览

| 项目 | 后端 | 前端 | 存储 | 部署 |
|------|------|------|------|------|
| 原版 | Node.js + Express | web-client（多主题） | SQLite/MySQL + Redis | 自有服务器 |
| 私服 | Cloudflare Workers | Vue3 无构建 SPA | D1 + Durable Objects | Cloudflare 全托管 |
| 工单系统 | Pages Functions（115 端点） | 原生 ES Modules SPA | D1（25+ 表） | Cloudflare Pages |
| 九重宫阙 | Node.js + Express + WS | 原生 JS SPA（3312 行 app.js） | JSON 文件（game.json） | 本地 / 可迁移 CF |

## GitHub Actions 说明

- 游戏自动化工作流已同步指向 `原版/批量注册工具/` 与 `原版/gh-actions/`。
- 私服部署工作流（deploy-ideer.yml）已同步指向 `私服/`。
- 工单系统自动化工作流使用 `working-directory: 工单系统`，不受整理影响。
- 根目录保留：`.github/`（CI）、`.wrangler/`（部署缓存）、`node_modules/`、`package-lock.json`。

## 九重宫阙本地运行

```bash
cd 九重宫阙
npm install
npm start            # http://localhost:3000
npm run init-db      # 初始化数据库（如需）
```
