# Git 备份约定（轮40 立，轮41 更新）

## 为什么单列这份文档
轮40 之前，`main` 领先 `origin/main` **87 个提交**，也就是 P0 全程 40 轮的成果只存在于这一块磁盘上；
而且全仓**没有任何 tag**。更糟的是恢复演练证明：`data/game.db` 被 .gitignore 排除，
而"从 .js 定义重建存档"这条路**当时根本跑不通**（轮41 已修，见下）。当时真正独一无二的东西恰恰是没进 git 的那一份。

## 现状：什么进 git、什么不进
| 物件 | 是否入 git | 理由 |
|---|---|---|
| `data/game.db` | **入**（轮40 起，`git add -f`） | 唯一含全部数值真源的存档：86 怪物 stats、技能/材料/地图/图纸/副本定义、rebalance 结果 |
| `src/data/content-export.json` | **入**（轮41 起） | 同一批定义的可 diff 文本副本；存档不再是这些内容的唯一副本 |
| `data/game.db-wal` / `-shm` | 不入 | SQLite sidecar；入库前必须 checkpoint 合并，否则主文件不自包含 |
| `data/game.json` | 不入 | legacy 迁移源，仅作考古；放回全新克隆会触发一次性迁移路径，可能把旧数据盖进新库 |
| `node_modules/`、`*.log`、`*.bundle`、`backups/` | 不入 | 可重装 / 体积 / 循环引用 |

## 远端与陷阱
- `origin` = `github.com/qingshanjiluo/ider-sign` —— **本项目只推这个**。
- `deploy` = `github.com/qingshanjiluo/ider-order-system` —— **另一个项目**，绝不可 `git push deploy main`（会把本仓历史灌进别人仓库）。
- 推送后必须独立核验，不许只看 push 的输出：`git ls-remote origin refs/heads/main` 的 SHA 必须等于本地 HEAD。

## 恢复流程（轮40 实测可用；bash 语法）
```bash
git clone -b main "<备份目录>/ad-main+tags-<时间>.bundle" 恢复目录
cd 恢复目录/九重宫阙
npm install                       # node_modules 不入库
npm run verify:rebuild            # 证明"代码 + 导出文件可重出全部定义"（只写临时目录）
npm test                          # 期望 exit 0
```
演练结论（必须照做才有 HEAD/内容一致）：`git clone -b main <bundle>` —— **不带 `-b main` 会克隆出空 HEAD**，
我第一次演练就踩了这个坑，报了个假的"备份完好"。

## 存档重建链（轮41 已修，且已有机器锁）
轮40 记的是"重建链不可用"，轮41 查明根因并修掉，同时把这条路径变成**可测**的：
- `src/db/store.js` 现在把 22 个文档集合在空库上一律自愈为空数组（此前 `db.realms` 是 undefined，
  `initDatabase` 第一行就 TypeError）；名单 `DOC_COLLECTIONS` 就写在该文件里，新系统落文档集合须登记。
- `DATA_DIR` 可被 `DSH_DATA_DIR` 覆盖 —— 在此之前这条路径**根本没法测**，所以它坏了三轮没人发现。
- 链（顺序有意义，见下）：`init-db` → `expand-data` → `expand-systems` → `init-gongfa`
  → `seed:rebalance` → **`seed:content`（台账对齐，必须收尾）**。
  rebalance 若排在台账之后，会按当前曲线再改写怪物 stats，与台账冲突（轮42 实测 22/86 行不同）。
- `src/database.js` 的 `initDatabase` **不再兜底播种 maps / items**（轮42）：那 6 张贫字段图只在空库时插入，
  会抢先占掉 id 1-6，而各 seed 都是"id 已存在则跳过"，于是正式地图的 `monsters` / `gather_nodes` 被遮蔽 ——
  全新安装会得到"没有刷怪表与采集点"的地图。这个 bug 十年不发作，因为正式存档当年是从 `game.json` 迁移来的。
- （`seed:blueprints` = `src/scripts/init-blueprints.js` 仍直写 legacy `game.json`，对 SQLite 库无效，别再用它。）
- `npm run verify:rebuild` 在临时目录跑完整链并与在用存档**逐行**对账；正式存档不许被它碰。

### 轮41 查清的事实：存档不只是"构建产物"
旧链跑完空库只有 `monsters 36 / items 328 / shop 28 / dungeons 20 / blueprints 0`，而存档是 `86 / 566 / 136 / 32 / 21`
—— 那 50 个怪物模板、238 件物品、108 个商店项、12 个副本、21 张图纸**在任何 .js 里都不存在**。
我轮38 记的"内容真源 = init-db + expand-data"当时只对 realms/maps/recipes/forge_recipes 成立，被我当成全局事实。
现在有 `src/data/content-export.json`（`content:export` 只读导出；`seed:content` 按 id 幂等补齐），
定义内容第一次有了文本副本 —— **P1 补定义请走代码/导出这条线，别再只改二进制存档**。

### 漂移的处置（轮42 定性 + 决定）
行级诊断显示，所谓"存档落后于代码"其实**不是数值校准问题**，而是 seed 之间、seed 与一次性脚本抢 id：
- `init-db` 与 `expand-data` 都往 maps 的 id 1-20 塞**不同**的地图，谁先跑谁赢（两者都是"id 已存在则跳过"）；
- 存档里 6 张图的 `monsters` / `gather_nodes` 是 `fix-maps.js` 这类一次性脚本后补的，从来不在链里；
- `items` 里 46 行同名重复、77 行是代码多出的（历史上改过名/去过重而没回写种子）。

**决定（不是发现）**：定义内容真源 = 存档 + `src/data/content-export.json` 台账；seed 只负责"能开机的结构 + 基础内容"。
`seed:content` 升级为按 id 覆盖式对齐，`verify:rebuild` 于是把定义集合的**精确一致**当硬判据 ——
实测 `realms/maps/items/monsters/dungeons/blueprints/recipes/forge_recipes/shop` 全部 0 差异。
唯一例外是 `RUNTIME_FIELDS`（目前只有 `shop.stock`，被购买消耗；不排除的话门禁会因玩家买东西随机变红）。
仍开放的反向漂移（每次都会打印，不许静默放宽）：`items +77`、`dungeons +5` 行代码里有、存档里没有。
要采用新校准时的固定流程：`seed:rebalance`（正式存档）→ 复测 `sim-battle` 四段胜率 → `content:export` 重出台账 → 门禁。

## 每轮纪律（写进自动化，别靠记性）
1. 每轮结束：`git status --porcelain` 必须为空（gate.js 保证跑完存档与 -wal/-shm 无侧写）。
2. 每轮结束推 `origin`；`git rev-list --count origin/main..HEAD` 若 > 20 立即补推。
3. 里程碑打 annotated tag（例如 `round40-gate232`，消息里写清门禁数字）。
4. `npm run backup` —— 洁净性闸 + tag + bundle（含 tag，只留最近 3 份）+ 存档快照，一次做完并 verify。
5. 定期做一次真恢复演练（bundle → clone → `npm install` → `npm test`），只验元数据不算验过。
6. 改了定义类内容后：`npm run content:export` 重新导出，并跑 `npm run verify:rebuild`
   （门禁里已有锁会比对导出文件与存档的行数，不一致直接变红）。
