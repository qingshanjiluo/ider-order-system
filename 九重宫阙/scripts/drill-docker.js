#!/usr/bin/env node
/**
 * P5 第 3/4/5 项的联合演练：第三方视角的独立部署 → 健康检查 → 备份 → 灾难 → 恢复 → 复登。
 *
 * 为什么必须在"从 GitHub 新克隆的临时目录"里跑，而不是在仓库里跑：
 *   docker-compose.yml 把 ./data 直接挂进容器，在仓库里 up 会让容器改写受保护的 data/game.db。
 *   而且"第三方独立部署"本身要求从零拿到代码 —— 克隆位顺带满足 P5 第 5 项。
 *
 * 轮61 的关键收获：第一轮演练就是在这里丢的档 —— 注册写进 -wal，
 * 用裸拷贝备份主库再删库还原，同账号登录 401。所以本脚本的备份一步走
 * 容器内的 snapshotDatabase(VACUUM INTO)，并把"同一账号能登录"当作硬判据。
 *
 * 产物：部署演练.md（尾部 DSH-HEADLINE 机器块，供 gen-acceptance.js 读）。
 * 用法：node scripts/drill-docker.js [--keep]   // --keep 演练后不停容器，便于人工继续看
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPO_URL = process.env.DRILL_REPO || 'https://github.com/qingshanjiluo/ider-sign.git';
const SUBDIR = '九重宫阙';
const KEEP = process.argv.includes('--keep');
const CONTAINER = 'jiuchong';
const USER = 'drill-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
const PASS = 'P5-Drill-' + Math.random().toString(36).slice(2, 12) + '!';

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
const steps = [];
const rec = (name, ok, detail) => { steps.push({ name, ok, detail }); console.log(`  ${ok ? '✅' : '❌'} [${el()}] ${name}${detail ? '　— ' + detail : ''}`); };

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: opts.timeout || 900000, cwd: opts.cwd }, opts.env ? { env: Object.assign({}, process.env, opts.env) } : {}));
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  return { code: r.status, out, err: r.error ? r.error.message : null };
}

function httpJson(method, url, body, token, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = require('http');
    const data = body === undefined ? null : JSON.stringify(body);
    const req = lib.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method,
      headers: Object.assign(
        { 'content-type': 'application/json' },
        token ? { authorization: 'Bearer ' + token } : {},
        data ? { 'content-length': Buffer.byteLength(data) } : {}),
      timeout: timeoutMs
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: buf, json: (() => { try { return JSON.parse(buf); } catch (_) { return null; } })() }));
    });
    req.on('error', (e) => resolve({ status: 0, text: e.message, json: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, text: 'timeout', json: null }); });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('== P5 容器演练：新克隆 → build → up → health → 备份 → 灾难 → 恢复 → 复登 ==');

  let clonedHead = null;
  // 0) 守护进程必须在（CLI 在而 daemon 不在是最常见的假可运行）
  const dv = sh('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 30000 });
  if (dv.code !== 0) { rec('docker 守护进程可达', false, (dv.out || dv.err || '').split('\n')[0]); return finish(); }
  const serverVersion = dv.out.trim();
  rec('docker 守护进程可达', true, 'Server ' + serverVersion);

  // 1) 第三方视角：从远端 main 新克隆到临时目录（绝不碰仓库工作树）
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'p5-drill-'));
  const cloneDir = path.join(work, 'repo');
  const cl = sh('git', ['clone', '--quiet', REPO_URL, cloneDir], { timeout: 600000 });
  const proj = path.join(cloneDir, SUBDIR);
  if (cl.code !== 0 || !fs.existsSync(proj)) { rec('从 GitHub 新克隆', false, (cl.out || cl.err || '缺项目目录').split('\n')[0]); return finish(); }
  const head = sh('git', ['-C', proj, 'rev-parse', '--short', 'HEAD']).out.trim();
  clonedHead = head;
  rec('从 GitHub 新克隆', true, 'HEAD ' + head + '，用时 ' + el());

  // 2) compose 要求生产密钥（缺它会直接报错，这本身就是一条门控）
  const secret = require('crypto').randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(proj, '.env'), `JWT_SECRET=${secret}\nCORS_ORIGINS=\n`, 'utf8');
  const cfg = sh('docker', ['compose', 'config', '--quiet'], { cwd: proj, timeout: 60000 });
  rec('compose 配置可解析（含 JWT_SECRET 强制项）', cfg.code === 0, (cfg.out || cfg.err || '').split('\n')[0] || 'ok');
  if (cfg.code !== 0) return finish();

  const bd = sh('docker', ['compose', 'build'], { cwd: proj, timeout: 1800000 });
  rec('docker compose build', bd.code === 0, '用时 ' + el() + (bd.code === 0 ? '' : '　' + (bd.out || '').split('\n').slice(-3).join(' / ')));
  if (bd.code !== 0) return finish();

  const up = sh('docker', ['compose', 'up', '-d'], { cwd: proj, timeout: 300000 });
  rec('docker compose up -d', up.code === 0, (up.out || up.err || '').split('\n').slice(-1)[0]);
  if (up.code !== 0) return finish();

  // 3) 等到 healthy（healthcheck 是在容器内跑的，等价于"容器内 /api/health 通"）
  let state = '';
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    state = sh('docker', ['inspect', '--format', '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}nohc{{end}}', CONTAINER], { timeout: 30000 }).out.trim();
    if (/healthy|unhealthy|exited|dead/.test(state)) break;
  }
  rec('容器自检转 healthy（healthcheck 在容器内打 /api/health）', /running\/healthy/.test(state), state + '，累计 ' + el());
  const hv = await httpJson('GET', 'http://127.0.0.1:3000/api/health');
  rec('主机侧 GET /api/health', hv.status === 200 && !!hv.json && hv.json.ok === true,
    hv.status + ' ' + String(hv.text).slice(0, 90));

  // 4) 制造需要被恢复的真实数据
  const reg = await httpJson('POST', 'http://127.0.0.1:3000/api/auth/register', { username: USER, password: PASS });
  const token = reg.json && (reg.json.token || (reg.json.user && reg.json.token));
  const ch = token ? await httpJson('GET', 'http://127.0.0.1:3000/api/character', undefined, token) : { status: 0, json: null };
  rec('容器内注册 + 取到角色（制造待恢复数据）', reg.status === 200 && !!token && ch.status === 200 && !!(ch.json && ch.json.id),
    `HTTP ${reg.status}/${ch.status} user=${ch.json && ch.json.user_id} realm=${ch.json && ch.json.realm}`);

  // 5) 备份：容器内走 snapshotDatabase(VACUUM INTO)，再 cp 出来。轮61 之前这一步是裸拷贝主库 ⇒ 丢写。
  const inSnap = '/tmp/snap-' + Date.now() + '.db';
  const ex = sh('docker', ['exec', CONTAINER, 'node', '-e',
    `require('/app/src/database').snapshotDatabase('${inSnap}'); console.log('SNAP_OK ' + require('fs').statSync('${inSnap}').size)`], { timeout: 120000 });
  rec('容器内 VACUUM INTO 出一致快照', ex.code === 0 && /SNAP_OK/.test(ex.out), (ex.out || ex.err || '').split('\n')[0]);
  const hostSnap = path.join(work, 'backup.db');
  const cp = sh('docker', ['cp', `${CONTAINER}:${inSnap}`, hostSnap], { timeout: 120000 });
  const snapMd5 = cp.code === 0 ? require('crypto').createHash('md5').update(fs.readFileSync(hostSnap)).digest('hex').toUpperCase() : null;
  rec('docker cp 把快照取到宿主机', cp.code === 0 && !!snapMd5, snapMd5 ? snapMd5 + '／' + Math.round(fs.statSync(hostSnap).size / 1024) + 'KB' : (cp.out || cp.err));

  // 6) 灾难：停容器 + 删掉数据目录里的全部库文件（含 -wal / -shm）
  sh('docker', ['compose', 'down'], { cwd: proj, timeout: 180000 });
  const dataDir = path.join(proj, 'data');
  let removed = 0;
  for (const f of fs.readdirSync(dataDir)) if (/\.db(-wal|-shm)?$/.test(f)) { fs.unlinkSync(path.join(dataDir, f)); removed++; }
  rec('模拟灾难：down + 删除数据目录内 ' + removed + ' 个库文件', removed >= 1, '剩余 db 文件 ' + fs.readdirSync(dataDir).filter((f) => /\.db/.test(f)).length);

  // 7) 恢复 + 复登：还原的必须是活数据，"文件在"不算过
  fs.copyFileSync(hostSnap, path.join(dataDir, 'game.db'));
  sh('docker', ['compose', 'up', '-d'], { cwd: proj, timeout: 300000 });
  let st2 = '';
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    st2 = sh('docker', ['inspect', '--format', '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}nohc{{end}}', CONTAINER], { timeout: 30000 }).out.trim();
    if (/healthy|unhealthy|exited|dead/.test(st2)) break;
  }
  const hv2 = await httpJson('GET', 'http://127.0.0.1:3000/api/health');
  rec('恢复后容器 healthy + /api/health 200', /running\/healthy/.test(st2) && hv2.status === 200, st2 + ' / HTTP ' + hv2.status);
  const login = await httpJson('POST', 'http://127.0.0.1:3000/api/auth/login', { username: USER, password: PASS });
  const tok2 = login.json && login.json.token;
  const ch2 = tok2 ? await httpJson('GET', 'http://127.0.0.1:3000/api/character', undefined, tok2) : { status: 0, json: null };
  const sameUser = !!(ch.json && ch2.json && Number(ch.json.id) === Number(ch2.json.id));
  rec('恢复后同一账号能登录并取回**同一个**角色', login.status === 200 && !!tok2 && ch2.status === 200 && sameUser,
    `login HTTP ${login.status} 角色 ${ch.json && ch.json.id}→${ch2.json && ch2.json.id} 一致=${sameUser}`);
  // 轮61：原先这一步断言"容器内主库与备份逐字节同源"，是我想错了方向 —— 还原之后又发生过登录，
  // 应用会写 last_login 与年龄结算，主库自然与备份不同。真正要判的是"恢复出来的库结构完整可用"，
  // 那已由上一步（同账号登录并取回同一个角色 id）证明；这里只补一道 integrity_check。
  const integ = sh('docker', ['exec', CONTAINER, 'node', '-e',
    "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/app/data/game.db',{readOnly:true});console.log('IC ' + d.prepare('PRAGMA integrity_check').get().integrity_check);d.close()"], { timeout: 60000 });
  const md5In = sh('docker', ['exec', CONTAINER, 'node', '-e',
    "const c=require('crypto'),f=require('fs');console.log(c.createHash('md5').update(f.readFileSync('/app/data/game.db')).digest('hex').toUpperCase())"], { timeout: 60000 }).out.trim();
  rec('恢复后的主库结构完整（integrity_check ok）', /\bIC ok\b/.test(integ.out),
    (integ.out || integ.err || '').trim() + '；备份 MD5 ' + snapMd5 + '，还原后经登录写入主库为 ' + md5In + '（两者不同属正常）');

  // 8) 现场清理（默认清；--keep 时留着人看）
  if (!KEEP) {
    sh('docker', ['compose', 'down'], { cwd: proj, timeout: 180000 });
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { console.log('  · 临时目录未删净：' + e.code); }
    rec('演练现场清理（容器 down + 临时目录删除）', true, '仓库 data/ 全程未被容器挂载触碰');
  } else {
    console.log('  · --keep：容器仍在运行（' + CONTAINER + '），手动 docker compose down 收尾');
  }
  finish(work);

  async function finish(workDir) {
    const bad = steps.filter((s) => !s.ok);
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    const head0 = require('child_process').spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    const head = {
      kind: 'deploy-drill',
      passed: steps.filter((s) => s.ok).length,
      failed: bad.length,
      total: steps.length,
      serverVersion,
      clonedHead: clonedHead || head0,
      elapsedMinutes: Number(mins),
      within30min: Number(mins) < 30,
      buildUpHealthOk: !steps.slice(2, 7).some((s) => !s.ok),
      restoreLoginOk: !!steps.find((s) => /同一账号/.test(s.name) && s.ok),
      backupSnapshotOk: !!steps.find((s) => /VACUUM INTO 出一致快照/.test(s.name) && s.ok)
    };
    const out = [];
    out.push('# 九重宫阙 · 容器部署与恢复演练（**由 `node scripts/drill-docker.js` 生成**）');
    out.push('');
    out.push('> 这份文档是**演练产物**：它记录的是"从 GitHub 新克隆一份代码，在 Docker 里真的把它跑起来、');
    out.push('> 备份、删库、还原、再登录"的一次实跑，不是计划。对应 P5 第 3/4/5 项。');
    out.push('> 演练全程在临时克隆目录里进行：compose 把 ./data 挂进容器，在仓库里 up 会改写受保护的 data/game.db。');
    out.push('');
    out.push(`- Docker Server：**${head.serverVersion || '未取到'}**`);
    out.push(`- 克隆到的提交：**${head.clonedHead || '未取到'}**（仓库 HEAD ${head0}）`);
    out.push(`- 全程耗时：**${mins} 分钟**（P5 第 5 项要求 30 分钟内完成 ⇒ ${head.within30min ? '满足' : '超时'}）`);
    out.push(`- 备份一步走容器内 ` + '`VACUUM INTO`' + `：轮61 首轮演练用裸拷贝主库备份，删库还原后同账号登录 401 —— 写都留在 -wal 里`);
    out.push('');
    out.push('## 逐步结果');
    out.push('');
    out.push('| # | 步骤 | 判定 | 依据 |');
    out.push('| --- | --- | --- | --- |');
    steps.forEach((s, i) => out.push(`| ${i + 1} | ${s.name} | ${s.ok ? '🟢 过' : '🔴 不过'} | ${s.detail || '—'} |`));
    out.push('');
    out.push(`## 结论：**${bad.length === 0 ? '演练全绿' : '演练有 ' + bad.length + ' 步判红'}**（${head.passed}/${head.total}）`);
    if (bad.length) { out.push(''); out.push('判红步骤：' + bad.map((b2) => b2.name).join('、')); }
    out.push('');
    out.push('## DSH-HEADLINE');
    out.push('');
    out.push('```json');
    out.push(JSON.stringify(head, null, 1));
    out.push('```');
    fs.writeFileSync(path.join(ROOT, '部署演练.md'), out.join('\n') + '\n', 'utf8');
    console.log(`\n  ${bad.length === 0 ? '🟢' : '🔴'} 演练 ${head.passed}/${head.total} 步通过，报告：部署演练.md（${mins} 分钟）`);
    process.exit(bad.length ? 1 : 0);
  }
})();
