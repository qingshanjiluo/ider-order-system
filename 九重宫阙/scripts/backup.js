/**
 * Git 备份（内容真源 + 可恢复性）
 *
 * 为什么存在：data/game.db 被 .gitignore 的双星通配规则排除（data 目录下的 db 文件），而它是唯一一份装着全部数值的存档：
 * 86 个怪物模板的 stats、技能表、材料/地图/图纸/副本定义、以及历轮 rebalance --apply 的结果。
 * 轮40 的恢复演练证明：全新克隆里 `npm run init-db` / `expand-data` 都跑不起来
 * （src/database.js:33 在无 legacy game.json 时 db.realms 为 undefined），
 * 所以"库丢了可以从 .js 重建"当时是**未经检验的信念**，不是事实。可重建性修好之前，db 必须入 git。
 *
 * 做四件事：① 洁净性闸（工作区脏就不备份，避免把半成品固化）② annotated tag（恢复点）
 * ③ bundle（含 tag，脱离 GitHub 也能恢复）④ 存档快照（db + legacy json，附命名说明）。
 *
 * 用法：node scripts/backup.js [--tag 名字] [--force]   （--force 才允许脏树）
 * 教训：块注释里不要写含星号斜杠的通配模式 —— 它会提前闭合注释，把后面的中文当代码执行。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');          // 仓库根（艾德尔机器人）
const GAME = path.join(REPO, '九重宫阙');
const DB = path.join(GAME, 'data', 'game.db');
const WAL = path.join(GAME, 'data', 'game.db-wal');
const LEGACY = path.join(GAME, 'data', 'game.json');
const DEST = process.env.DSH_BACKUP_DIR
  || path.resolve(REPO, '..', '_git备份', '艾德尔机器人');

function git(args, opts) {
  return execFileSync('git', args, Object.assign({ cwd: REPO, encoding: 'utf8' }, opts || {}));
}
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const tagIx = argv.indexOf('--tag');
const tag = tagIx >= 0 && argv[tagIx + 1] ? argv[tagIx + 1] : `backup-${stamp()}`;
const problems = [];

// ① 洁净性：脏树意味着还有未提交的成果，先提交再备份
const status = git(['status', '--porcelain']).trim();
if (status && !force) {
  problems.push('工作区不干净，先提交再备份（或加 --force）：\n' + status);
}
// WAL 非空说明 db 不是自包含的，复制出来会缺数据
if (fs.existsSync(WAL) && fs.statSync(WAL).size > 0) {
  problems.push(`game.db-wal 有 ${fs.statSync(WAL).size} 字节未合并，备份出的 db 可能不完整`);
}
if (!fs.existsSync(DB)) problems.push('找不到 data/game.db');

if (problems.length) {
  console.log('🔴 备份前置检查未通过：');
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  fs.mkdirSync(DEST, { recursive: true });
  fs.mkdirSync(path.join(DEST, '存档快照'), { recursive: true });
  const ts = stamp();
  const bundle = path.join(DEST, `ad-main+tags-${ts}.bundle`);
  const head = git(['rev-parse', '--short', 'HEAD']).trim();

  // ② tag（annotated，消息里写清门禁状态，恢复时才知道这版是不是绿的）
  const msg = process.env.DSH_BACKUP_NOTE
    || `backup at ${new Date().toISOString()} HEAD=${head}`;
  git(['tag', '-a', tag, '-m', msg]);
  console.log(`① tag ${tag} -> ${head}`);

  // ③ bundle：main + 全部 tag，且必须 verify 通过才算成功
  git(['bundle', 'create', bundle, 'main', '--tags']);
  const verify = git(['bundle', 'verify', bundle], { stdio: ['ignore', 'pipe', 'pipe'] });
  const okVerify = /is okay/.test(verify) || /records a complete history/.test(verify);
  const sizeMb = (fs.statSync(bundle).size / 1048576).toFixed(1);
  console.log(`② bundle ${path.basename(bundle)}（${sizeMb} MB）verify=${okVerify ? 'okay' : '存疑'}`);
  if (!okVerify) throw new Error('bundle verify 未通过，备份不可信');

  // ④ 存档快照：db 是真源；legacy json 只作考古用，放回全新克隆会触发迁移路径
  const snap = path.join(DEST, '存档快照');
  fs.copyFileSync(DB, path.join(snap, `game-${ts}.db`));
  if (fs.existsSync(LEGACY)) fs.copyFileSync(LEGACY, path.join(snap, `game-legacy-${ts}.json`));
  const same = fs.readFileSync(DB).equals(fs.readFileSync(path.join(snap, `game-${ts}.db`)));
  console.log(`③ 存档快照 game-${ts}.db 逐字节一致=${same}`);
  if (!same) throw new Error('快照与在用 db 不一致');

  // 只保留最近 3 份 bundle，避免 145 MB 级别的东西堆满磁盘
  const bundles = fs.readdirSync(DEST).filter(f => f.endsWith('.bundle')).sort();
  while (bundles.length > 3) {
    const doomed = bundles.shift();
    fs.unlinkSync(path.join(DEST, doomed));
    console.log(`④ 清理旧 bundle: ${doomed}`);
  }
  console.log(`\n🟢 备份完成 -> ${DEST}`);
  console.log('   恢复：git clone -b main <bundle> <目录>（要回滚到本次点：git checkout ' + tag + '）');
}
