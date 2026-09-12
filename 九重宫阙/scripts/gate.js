/**
 * 门禁外壳（npm test 的真实入口）
 *
 * 存在的理由：src/db/store.js 有一个 20 秒的 autosave 定时器（dirty 就把内存镜像刷进 data/game.db），
 * 而测试套件会经由真实服务（addExp / cultivate / 应劫结算 …）把镜像弄脏。
 * 也就是说：**跑一次 npm test 就会污染正式存档** —— 这不是理论风险，是实测到的（game.db mtime 落在门禁时间内，
 * 且同一断言在两次运行里读到不同的怪物数值）。
 *
 * 所以门禁不能只"要求测试别写库"（做不到，store 的 exit flush 抢在测试自己的还原之后）。
 * 这里按字节快照 → 跑 run-all-tests → 还原 → 透传退出码，让"无侧写"成为外壳保证的不变量。
 *
 * 轮40 补强：SQLite 的 sidecar（-wal / -shm）同样必须纳管。
 * 只还原 game.db 而把测试产生的 65952 字节 WAL 留在原地，会得到一个"主文件是旧的、WAL 是新的"的组合 ——
 * 后续任何进程读它都会把测试脏数据合并进真库；而把它提交进 git（game.db 现已作为内容真源入库）
 * 更会把缺数据的库固化成备份。规则：跑前存在的一律按字节还原，跑前不存在的一律删除。
 *
 * 注意：这只保护存档不被测试污染；**数据迁移**（如 npm run seed:rebalance）必须在门禁之外执行。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILES = ['game.db', 'game.db-wal', 'game.db-shm'].map(n => path.join(DATA, n));

const snap = FILES.map(p => (fs.existsSync(p) ? fs.readFileSync(p) : null));
console.log('[gate] 快照 ' + FILES.map((p, i) => `${path.basename(p)}:${snap[i] ? snap[i].length + 'B' : '无'}`).join('  '));

const r = spawnSync(process.execPath, [path.join(__dirname, 'run-all-tests.js')], { stdio: 'inherit' });

let dirty = false;
FILES.forEach((p, i) => {
  const before = snap[i];
  const exists = fs.existsSync(p);
  try {
    if (before) {
      fs.writeFileSync(p, before);
      if (Buffer.compare(fs.readFileSync(p), before) !== 0) {
        console.log(`[gate] **${path.basename(p)} 还原后字节不一致**：仍有东西在退出后写库`);
        dirty = true;
      }
    } else if (exists) {
      fs.unlinkSync(p);
      if (fs.existsSync(p)) {
        console.log(`[gate] **${path.basename(p)} 跑前不存在、跑后删不掉**`);
        dirty = true;
      } else {
        console.log(`[gate] 删除门禁期间凭空出现的 ${path.basename(p)}`);
      }
    }
  } catch (e) {
    console.log(`[gate] 还原 ${path.basename(p)} 失败: ` + e.message);
    dirty = true;
  }
});
if (!dirty) console.log('[gate] 已还原 game.db 与 -wal/-shm（逐字节一致，测试无侧写）');

if ((r.status === null || r.signal) && !dirty) {
  console.log('[gate] 子进程被信号终止: ' + r.signal);
  process.exitCode = 1;
} else {
  process.exitCode = dirty ? 3 : (r.status === null ? 1 : r.status);
}
