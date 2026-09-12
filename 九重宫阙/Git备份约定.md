# Git 备份约定（轮40 立）

## 为什么单列这份文档
轮40 之前，`main` 领先 `origin/main` **87 个提交**，也就是 P0 全程 40 轮的成果只存在于这一块磁盘上；
而且全仓**没有任何 tag**。更糟的是恢复演练证明：`data/game.db` 被 .gitignore 排除，
而"从 .js 定义重建存档"这条路**根本跑不通**（见下）。当时真正独一无二的东西恰恰是没进 git 的那一份。

## 现状：什么进 git、什么不进
| 物件 | 是否入 git | 理由 |
|---|---|---|
| `data/game.db` | **入**（轮40 起，`git add -f`） | 唯一含全部数值真源的存档：86 怪物 stats、技能/材料/地图/图纸/副本定义、rebalance 结果 |
| `data/game.db-wal` / `-shm` | 不入 | SQLite sidecar；入库前必须 checkpoint 合并，否则主文件不自包含 |
| `data/game.json` | 不入 | legacy 迁移源，仅作考古；放回全新克隆会触发一次性迁移路径，可能把旧数据盖进新库 |
| `node_modules/`、`*.log`、`*.bundle`、`backups/` | 不入 | 可重装 / 体积 / 循环引用 |

## 远端与陷阱
- `origin` = `github.com/qingshanjiluo/ider-sign` —— **本项目只推这个**。
- `deploy` = `github.com/qingshanjiluo/ider-order-system` —— **另一个项目**，绝不可 `git push deploy main`（会把本仓历史灌进别人仓库）。
- 推送后必须独立核验，不许只看 push 的输出：`git ls-remote origin refs/heads/main` 的 SHA 必须等于本地 HEAD。

## 恢复流程（轮40 实测可用）
```bash
git clone -b main "<备份目录>/ad-main+tags-<时间>.bundle" 恢复目录
cd 恢复目录/九重宫阙
npm install                       # node_modules 不入库
node -e 'require("./src/db/store").close()'   # 若 game.db-wal 非空需先合并
npm test                          # 期望 exit 0
```
演练结论（必须照做才有 HEAD/内容一致）：`git clone -b main <bundle>` —— **不带 `-b main` 会克隆出空 HEAD**，
我第一次演练就踩了这个坑，报了个假的"备份完好"。

## 已知未修：存档不可从 .js 重建
全新克隆里跑 `npm run init-db` / `seed:expand-data` 都会崩在 `src/database.js:33`：
`if (db.realms.length === 0)` —— `db.realms` 为 undefined。
只有当 legacy `data/game.json` 存在时（走迁移分支）这条链才碰巧可用，所以长期没人发现。
**在修好之前，game.db 入 git 是唯一防线**；修好后本文档要更新，`game.db` 是否继续入库再评估。

## 每轮纪律（写进自动化，别靠记性）
1. 每轮结束：`git status --porcelain` 必须为空（gate.js 保证跑完存档无侧写）。
2. 每轮结束推 `origin`；`git rev-list --count origin/main..HEAD` 若 > 20 立即补推。
3. 里程碑打 annotated tag（例如 `round40-gate232`，消息里写清门禁数字）。
4. `npm run backup` —— 洁净性闸 + tag + bundle（含 tag，只留最近 3 份）+ 存档快照，一次做完并 verify。
5. 定期做一次真恢复演练（bundle → clone → npm install → npm test），只验元数据不算验过。
