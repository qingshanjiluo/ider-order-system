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
 * 注意：这只保护 game.db 不被测试污染；**数据迁移**（如 npm run seed:rebalance）必须在门禁之外执行。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'data', 'game.db');
const hadDb = fs.existsSync(DB);
const snapshot = hadDb ? fs.readFileSync(DB) : null;

console.log(`[gate] 快照 game.db：${hadDb ? snapshot.length + ' 字节' : '（不存在，跑完也不会创建）'}`);

const r = spawnSync(process.execPath, [path.join(__dirname, 'run-all-tests.js')], { stdio: 'inherit' });

if (snapshot) {
  try {
    fs.writeFileSync(DB, snapshot);
    const back = fs.readFileSync(DB);
    if (Buffer.compare(back, snapshot) === 0) {
      console.log('[gate] 已还原 game.db（逐字节一致，测试无侧写）');
    } else {
      console.log('[gate] **还原后字节不一致**：仍有东西在退出后写库，门禁洁净性失效');
      process.exitCode = 3;
    }
  } catch (e) {
    console.log('[gate] 还原失败: ' + e.message);
    process.exitCode = 3;
  }
} else if (hadDb === false && fs.existsSync(DB)) {
  console.log('[gate] 门禁期间凭空出现了 game.db，请查');
  process.exitCode = 3;
}

if ((r.status === null || r.signal) && process.exitCode !== 3) {
  console.log('[gate] 子进程被信号终止: ' + r.signal);
  process.exitCode = 1;
} else if (process.exitCode !== 3) {
  process.exitCode = r.status === null ? 1 : r.status;
}
