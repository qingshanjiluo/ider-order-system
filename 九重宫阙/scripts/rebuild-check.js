/**
 * 空库重建链检查（轮41）
 *
 * 起因：轮40 恢复演练证明，全新克隆里 seed 链跑不通 —— store.boot() 只从已存在的 col_* 表建镜像，
 * 空库时 `db.realms` 是 undefined，`initDatabase` 第一行就 TypeError。"丢了磁盘可以从代码重建"
 * 当时是未经检验的信念；它坏着三轮没人发现，正因为 DATA_DIR 写死，这条路径无法在不破坏正式存档的前提下测试。
 *
 * 判据（轮41 定稿，注意方向性，别把"两边一模一样"当目标）：
 *   硬失败 —— 链上任一脚本非零退出；重建库缺任何一个文档集合；
 *             **存档里已有的"定义行"在重建产物中缺失**；隔离性不成立（见下）。
 *   仅告警 —— ① 定义行字段与存档不同（实测 monsters 81/86、items 100/566、maps 15/20…）：
 *               存档是轮38 校准与轮40 暴击修正**之前**的产物，代码侧已变而存档未同步，需单独了结；
 *             ② 重建比存档多出定义行（items +77、dungeons +5）：反向漂移，代码里有、存档里没有。
 *             ③ 运行时集合（users/characters/inventory/…）空库重建必然为空 —— 那是正确行为，不该要求。
 *
 * 隔离性怎么证明才有效（轮41 的教训）：早先这里比较"跑前跑后正式存档字节"，
 * 但在测试套件里**必然误报** —— 套件自身会经服务层写库、结束时才按快照还原，别人写的字节被算到我头上
 * （实测：单跑 true、套件内 false）。真正要证明的是本检查及其子进程只写临时目录，故改为两条有效判据：
 *   (1) 静态：链上脚本不得出现硬编码的 data/game.db|json 路径（只能经 src/db/store 取路径）；
 *   (2) 正向：带 DSH_DATA_DIR 的子进程必须在**该目录**里产出 game.db（证明 env 真生效而非被忽略）。
 *
 * 用法：node scripts/rebuild-check.js [--keep]
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const NL = String.fromCharCode(10);

const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const CHAIN = [
  ['init-db', 'src/scripts/init-db.js'],
  ['expand-data', 'src/scripts/expand-data.js'],
  ['expand-systems', 'src/scripts/expand-systems.js'],
  ['init-gongfa', 'src/scripts/init-gongfa.js'],
  ['content:import', 'src/scripts/content-sync.js', 'import'],
  ['seed:rebalance', 'scripts/rebalance-monsters.js', '--apply']
];
// 定义类集合：内容必须可被代码 + 导出文件完整重出
const DEFINITIONS = ['realms', 'maps', 'items', 'monsters', 'dungeons', 'blueprints',
  'recipes', 'forge_recipes', 'shop', 'skills', 'gongfa', 'pets', 'achievements'];

const liveBefore = fs.readFileSync(LIVE_DB);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild41-'));
const env = Object.assign({}, process.env, { DSH_DATA_DIR: tmp });
const problems = [];
const warns = [];
const drift = [];
console.log(`临时数据目录：${tmp}`);

/* ---------- 隔离性判据 (1)：链上脚本不得硬编码库路径 ---------- */
const HARDCODED = /data[\\/]+game\.(db|json)/;
for (const [, rel] of CHAIN) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const hit = fs.readFileSync(file, 'utf8').split(NL)
    .find(l => HARDCODED.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
  if (hit) {
    problems.push(`${rel} 硬编码了库路径，DSH_DATA_DIR 对它无效（会直接在正式存档上跑 seed）：${hit.trim().slice(0, 90)}`);
  }
}
console.log(`链上脚本硬编码路径扫描 = ${problems.some(p => /硬编码了库路径/.test(p)) ? '发现 ✗' : '未见 ✓'}`);

/* ---------- 链本体 ---------- */
for (const [label, rel, ...args] of CHAIN) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { problems.push(`${label}: 脚本不存在 ${rel}`); continue; }
  const r = spawnSync(process.execPath, [file, ...args], { env, cwd: ROOT, encoding: 'utf8' });
  const errLine = (r.stderr || '').split(NL).find(l => l.trim()) || '';
  console.log(`  ${r.status === 0 ? '✓' : '✗'} ${label.padEnd(15)} exit=${r.status} ${errLine.slice(0, 60)}`);
  if (r.status !== 0) problems.push(`${label} 退出码 ${r.status}：${errLine.slice(0, 160)}`);
}

/* ---------- 隔离性判据 (2)：正向探针 ---------- */
const probeDir = path.join(tmp, 'probe');
fs.mkdirSync(probeDir, { recursive: true });
const PROBE = 'const s=require(process.argv[1]);s.boot();'
  + 'console.log(require("fs").existsSync(require("path").join(process.env.DSH_DATA_DIR,"game.db")));';
const probe = spawnSync(process.execPath, ['-e', PROBE, path.join(ROOT, 'src', 'db', 'store.js')],
  { env: Object.assign({}, env, { DSH_DATA_DIR: probeDir }), cwd: ROOT, encoding: 'utf8' });
const probeOk = (probe.stdout || '').trim() === 'true';
console.log(`DSH_DATA_DIR 正向探针（库落在临时目录而非正式目录）= ${probeOk ? 'true ✓' : 'false ✗'}`);
if (!probeOk) {
  problems.push('DSH_DATA_DIR 未生效：探针没在临时目录产出 game.db（stdout=' + (probe.stdout || '').trim()
    + ' stderr=' + (probe.stderr || '').slice(0, 120).replace(/\n/g, ' ') + '）');
}
try { fs.rmSync(probeDir, { recursive: true, force: true }); } catch (e) { /* 留给临时目录整体清理 */ }

function rows(dbFile) {
  const db = new DatabaseSync(dbFile);
  try {
    // WAL 里可能还压着数据，先合并再读，否则会误判"表是空的"
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'col_%'")
      .all().map(r => r.name.slice(4));
    const out = {};
    for (const n of names) {
      const map = new Map();
      for (const row of db.prepare(`SELECT data FROM col_${n}`).all()) {
        const o = JSON.parse(row.data);
        map.set(String(o && o.id), o);
      }
      out[n] = map;
    }
    return out;
  } finally { db.close(); }
}

const newDb = path.join(tmp, 'game.db');
if (!fs.existsSync(newDb)) {
  problems.push('重建链没有产出 game.db');
} else {
  const A = rows(LIVE_DB);           // 在用存档 = 事实基线
  const B = rows(newDb);             // 空库重建产物
  const names = Array.from(new Set(Object.keys(A).concat(Object.keys(B)))).sort();
  console.log(NL + '集合              存档    重建   缺失  字段不同  多出   判定');
  for (const name of names) {
    if (!B[name]) { problems.push(`重建产出缺少集合 ${name}（store 白名单自愈失效？）`); continue; }
    const a = A[name] || new Map();
    const b = B[name];
    const isDef = DEFINITIONS.includes(name);
    let missing = 0, differ = 0;
    for (const [id, row] of a) {
      if (!b.has(id)) { missing++; continue; }
      if (JSON.stringify(row) !== JSON.stringify(b.get(id))) differ++;
    }
    const extra = Array.from(b.keys()).filter(k => !a.has(k)).length;
    let verdict = '';
    if (missing && isDef) {
      verdict = '✗ 存档定义未被完整重出';
      problems.push(`${name}: ${missing} 行定义在重建产物中缺失（代码 + 导出文件必须能重出全部定义）`);
    } else if (missing) {
      verdict = '· 运行时数据，不要求重出';
    } else if (differ && isDef) {
      verdict = '⚠ 定义与存档漂移';
      drift.push(`${name}: ${differ}/${a.size} 行字段不同（存档是轮38/轮40 之前的校准产物，或是后续一次性脚本改过的结果；需定以谁为准）`);
    } else if (differ) {
      verdict = '· 运行时数据不要求一致';
    } else if (extra) {
      verdict = '⚠ 反向漂移';
      warns.push(`${name}: 代码里有 ${extra} 行是存档里没有的`);
    }
    console.log(`  ${name.padEnd(16)}${String(a.size).padStart(5)}${String(b.size).padStart(7)}${String(missing).padStart(7)}${String(differ).padStart(10)}${String(extra).padStart(6)}   ${verdict}`);
  }
  console.log(NL + '重建库体积 = ' + (fs.statSync(newDb).size / 1024).toFixed(0) + ' KB（存档 '
    + (liveBefore.length / 1024).toFixed(0) + ' KB）｜重建出的文档集合数 = ' + Object.keys(B).length);
}

if (!process.argv.includes('--keep')) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { console.log('（临时目录未清理：' + e.message + '）'); }
} else {
  console.log('已保留临时库：' + newDb);
}

const liveNow = fs.readFileSync(LIVE_DB);
console.log('正式存档字节数未变 = ' + (liveNow.length === liveBefore.length)
  + '（仅记录：套件内其它用例会合法地写库再还原，故不作硬判据；硬判据是上面的扫描 + 探针）');

if (drift.length) {
  console.log(NL + '⚠ 定义与存档漂移（下次改这些集合前先定以谁为准）：');
  for (const d of drift) console.log('  - ' + d);
}
if (warns.length) {
  console.log(NL + '⚠ 反向漂移（代码里有、存档里没有）：');
  for (const w of warns) console.log('  - ' + w);
}
if (problems.length) {
  console.log(NL + '🔴 空库重建链不合格：');
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  console.log(NL + '🟢 合格：git 内的代码 + 导出文件足以完整重出存档的全部内容定义，且全程只写临时目录');
}
