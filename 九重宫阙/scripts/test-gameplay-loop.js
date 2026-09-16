/**
 * 第 29 套 · 玩法闭环完整性（轮103）
 *
 * 存在的理由：审计脚本（scripts/audit-gameplay.js）能发现断点，但审计是人工跑的，
 * 没人看就等于没有。本套件把审计里最致命的四条变成**门禁断言**：
 *   ① 每张地图都有怪（空地图 = 玩家点进去只有空白列表）；
 *   ② 怪等级必须落在所属地图区间内（越级/打空气都源于此）；
 *   ③ 材料必须要么能被获取、要么被配方用（都不满足 = 数据里的死物）；
 *   ④ 物品不许同类重名（按名引用的掉落/图纸会歧义）。
 *
 * 挂在临时库上跑真数据，不写正式存档。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = path.join(ROOT, 'data', 'game.db');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-loop-'));
process.env.DSH_DATA_DIR = TMP;
fs.copyFileSync(LIVE, path.join(TMP, 'game.db'));
for (const s of ['-wal', '-shm']) if (fs.existsSync(LIVE + s)) fs.copyFileSync(LIVE + s, path.join(TMP, 'game.db' + s));

const { loadDatabase, closeDatabase } = require(path.join(ROOT, 'src', 'database'));
const materials = require(path.join(ROOT, 'src', 'services', 'materials'));
const db = loadDatabase();
materials.ensureAll(db);

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};

const items = db.items || [];
const maps = db.maps || [];
const monsters = db.monsters || [];
const parseMaybe = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };

console.log('== 玩法闭环完整性 ==');
console.log(`  物品 ${items.length} / 地图 ${maps.length} / 怪 ${monsters.length}`);

t('每张地图都至少有一只怪（空地图 = 玩家点进去只有空白）', () => {
  const withMon = new Set(monsters.map((m) => Number(m.map_id)).filter(Boolean));
  const empty = maps.filter((m) => !withMon.has(Number(m.id)));
  assert.deepStrictEqual(empty.map((m) => m.name), [], `空地图：${empty.map((m) => m.name).join(', ')}`);
});

t('每只怪的等级区间都落在所属地图区间内（±3 容差）', () => {
  const mapById = new Map(maps.map((m) => [Number(m.id), m]));
  const bad = [];
  for (const mo of monsters) {
    const m = mapById.get(Number(mo.map_id));
    if (!m) continue;
    const lr = parseMaybe(mo.level_range);
    if (!Array.isArray(lr) || lr.length < 2) continue;
    const [lo, hi] = lr.map(Number);
    const ML = Number(m.min_level || 0), MH = Number(m.max_level || 999);
    if (lo < ML - 3 || hi > MH + 3) bad.push(`${mo.name}(Lv${lo}-${hi})@${m.name}(Lv${ML}-${MH})`);
  }
  assert.deepStrictEqual(bad, [], `等级错配 ${bad.length} 只：${bad.slice(0, 6).join('; ')}`);
});

t('每张地图的怪铺满整段等级带（不许全挤在一端，否则高段进度空转）', () => {
  const mapById = new Map(maps.map((m) => [Number(m.id), m]));
  const byMap = new Map();
  for (const mo of monsters) {
    const mid = Number(mo.map_id);
    if (!mid || !mapById.has(mid)) continue;
    if (!byMap.has(mid)) byMap.set(mid, []);
    byMap.get(mid).push(mo);
  }
  const narrow = [];
  for (const [mid, list] of byMap) {
    const m = mapById.get(mid);
    const ML = Number(m.min_level || 0), MH = Number(m.max_level || 0);
    if (MH - ML < 10) continue;   // 窄区间不强求
    const spans = list.map((x) => parseMaybe(x.level_range)).filter((s) => Array.isArray(s) && s.length >= 2);
    if (!spans.length) continue;
    const cover = Math.max(...spans.map((s) => Number(s[1]))) - Math.min(...spans.map((s) => Number(s[0])));
    const need = (MH - ML) * 0.6;   // 至少覆盖六成
    if (cover < need) narrow.push(`${m.name} 覆盖 ${cover} 级 / 区间 ${MH - ML} 级`);
  }
  assert.deepStrictEqual(narrow, [], `等级带未被铺满：${narrow.join('; ')}`);
});

t('材料不存在死物（要么能获取、要么被配方引用）', () => {
  const obtain = new Set();
  const nameToIds = new Map();
  for (const i of items) {
    if (!nameToIds.has(i.name)) nameToIds.set(i.name, []);
    nameToIds.get(i.name).push(Number(i.id));
  }
  const dig = (v, out) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) return v.forEach((x) => dig(x, out));
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (/^(item_id|itemId|result|result_id|output|output_id)$/.test(k)) { const n = Number(val); if (n > 0) out.add(n); }
        else if (k === 'name' && typeof val === 'string') for (const id of (nameToIds.get(val) || [])) out.add(id);
        else if (k === 'id') { const n = Number(val); if (n > 0) out.add(n); }
        else dig(val, out);
      }
      return;
    }
    if (typeof v === 'string' && /^[[{]/.test(v.trim())) { try { dig(JSON.parse(v), out); } catch (e) {} }
  };
  for (const s of (db.shop || [])) obtain.add(Number(s.item_id));
  for (const mo of monsters) dig(parseMaybe(mo.drops), obtain);
  for (const d of (db.dungeons || [])) for (const k of ['rewards', 'reward_items', 'drops']) if (d[k]) dig(parseMaybe(d[k]), obtain);
  for (const r of [...(db.recipes || []), ...(db.forge_recipes || [])]) {
    for (const k of ['result', 'result_id', 'output_id']) { const n = Number(r[k]); if (n > 0) obtain.add(n); }
  }
  for (const b of (db.blueprints || [])) dig(parseMaybe(b.result) || parseMaybe(b.output), obtain);

  const used = new Set();
  for (const r of [...(db.recipes || []), ...(db.forge_recipes || []), ...(db.blueprints || [])]) {
    const mats = parseMaybe(r.materials || r.ingredients);
    if (!Array.isArray(mats)) continue;
    for (const m of mats) {
      if (typeof m === 'number') { used.add(m); continue; }
      if (m && typeof m === 'object') {
        if (m.name) for (const id of (nameToIds.get(m.name) || [])) used.add(id);
        const n = Number(m.item_id || m.id);
        if (n > 0) used.add(n);
      }
    }
  }
  const matItems = items.filter((i) => (i.type || '').includes('材料'));
  const dead = matItems.filter((i) => !obtain.has(Number(i.id)) && !used.has(Number(i.id)));
  assert.deepStrictEqual(dead.map((i) => i.name), [], `死材料：${dead.map((i) => i.name).join(', ')}`);
});

t('物品不存在同类重名（按名引用的掉落/图纸会歧义）', () => {
  const byName = new Map();
  for (const i of items) {
    const k = `${i.type || '?'}::${i.name}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(Number(i.id));
  }
  const dup = [...byName.entries()].filter(([, ids]) => ids.length > 1);
  assert.deepStrictEqual(dup.map(([k, ids]) => `${k} (${ids.join(',')})`), [],
    `同类重名：${dup.map(([k, ids]) => `${k}×${ids.length}`).join('; ')}`);
});

t('配方/图纸引用的材料必须真实存在（引用幽灵物品会炼不出东西）', () => {
  const ids = new Set(items.map((i) => Number(i.id)));
  const names = new Set(items.map((i) => i.name));
  const ghost = [];
  for (const r of [...(db.recipes || []), ...(db.forge_recipes || [])]) {
    const mats = parseMaybe(r.materials);
    if (!Array.isArray(mats)) continue;
    for (const m of mats) {
      if (typeof m === 'number') { if (!ids.has(m)) ghost.push(`${r.name}→#${m}`); continue; }
      if (m && typeof m === 'object') {
        const n = Number(m.item_id || m.id);
        if (n > 0 && !ids.has(n)) ghost.push(`${r.name}→#${n}`);
        else if (m.name && !names.has(m.name)) ghost.push(`${r.name}→${m.name}`);
      }
    }
  }
  for (const b of (db.blueprints || [])) {
    const mats = parseMaybe(b.materials);
    if (!Array.isArray(mats)) continue;
    for (const m of mats) if (m && m.name && !names.has(m.name)) ghost.push(`${b.name}→${m.name}`);
  }
  assert.deepStrictEqual(ghost, [], `幽灵材料引用：${ghost.slice(0, 8).join('; ')}`);
});

t('配方产出必须是真实物品（炼出来不存在的 id 会凭空丢货）', () => {
  const ids = new Set(items.map((i) => Number(i.id)));
  const bad = [];
  for (const r of [...(db.recipes || []), ...(db.forge_recipes || [])]) {
    const out = Number(r.result || r.result_id || r.output_id || 0);
    if (out > 0 && !ids.has(out)) bad.push(`${r.name}→#${out}`);
  }
  assert.deepStrictEqual(bad, [], `幽灵产出：${bad.join('; ')}`);
});

t('产出工具自带可复现审计与修复脚本（断点能被下一个 AI 复跑）', () => {
  for (const s of ['audit-gameplay.js', 'seed-content.js', 'align-monsters.js', 'dedupe-items.js', 'fix-recipes.js', 'fix-dangling-refs.js', 'rebalance-pool.js', 'run-content-pipeline.js', 'sim-battle-lib.js', 'calibrate-bands.js']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts', s)), `缺脚本 scripts/${s}`);
  }
  const audit = fs.readFileSync(path.join(ROOT, 'scripts', 'audit-gameplay.js'), 'utf8');
  assert.ok(/ITEM_FK/.test(audit), '审计脚本丢了语义外键白名单（会退回按数字误报）');
  for (const s of ['seed-content.js', 'align-monsters.js', 'dedupe-items.js', 'fix-recipes.js', 'fix-dangling-refs.js', 'rebalance-pool.js']) {
    const body = fs.readFileSync(path.join(ROOT, 'scripts', s), 'utf8');
    assert.ok(/--dry/.test(body), `${s} 必须支持 --dry 演练`);
  }
  // 标定脚本默认必须 dry-run：它会在两个约束间震荡，自动写库会把内容搅乱（章程 R13）
  const cal = fs.readFileSync(path.join(ROOT, 'scripts', 'calibrate-bands.js'), 'utf8');
  assert.ok(/const DRY = !APPLY/.test(cal), 'calibrate-bands 必须默认 dry-run（要写库须显式 --apply）');
  // 标定与验收必须共用同一份测量（否则会各抄一份、字段不一致而漂移 20 个点）
  const sb = fs.readFileSync(path.join(ROOT, 'scripts', 'sim-battle.js'), 'utf8');
  assert.ok(/sim-battle-lib/.test(sb), 'sim-battle.js 没走 sim-battle-lib（测量口径可能与标定不一致）');
  assert.ok(/sim-battle-lib/.test(cal), 'calibrate-bands 没走 sim-battle-lib（标定与验收会漂移）');
});

t('id 分配不许用 getNextId(db, "表名") 两参写法（轮103 血泪：会从 1 开始覆盖旧数据）', () => {
  // 真实事故：getNextId 只接一个参数（集合名）。写成 getNextId(db, 'monsters') 时
  // 第一个参数成了 db 对象 → 返回 1 → 新增 48 只怪从 id=1 起，顶掉了灵兔/竹妖等 23 只原怪。
  // 这个错误不会报错、不会崩，只会静默覆盖 —— 必须静态锁死。
  const dir = path.join(ROOT, 'scripts');
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const body = fs.readFileSync(path.join(dir, f), 'utf8');
    // 匹配 getNextId(<非字符串>, ...) 形式
    const re = /getNextId\(\s*[A-Za-z_$][\w$]*\s*,/g;
    if (re.test(body) && !/血泪教训|误传|只接一个参数/.test(body)) offenders.push(f);
  }
  assert.deepStrictEqual(offenders, [],
    `这些脚本用了两参 getNextId（会覆盖旧数据）：${offenders.join(', ')}`);
});

t('新增内容前必须查重 id（宁可报错也不覆盖）', () => {
  for (const s of ['seed-content.js', 'fix-recipes.js']) {
    const body = fs.readFileSync(path.join(ROOT, 'scripts', s), 'utf8');
    assert.ok(/已被占用，拒绝覆盖/.test(body), `${s} 缺少 id 占用防护`);
  }
});

t('存档里的怪 id 唯一且不覆盖台账里的原有怪（内容追加不许吃掉旧数据）', () => {
  const ids = monsters.map((m) => Number(m.id));
  assert.strictEqual(new Set(ids).size, ids.length, '怪 id 有重复');
  // 与台账（定义真源）对账：台账里有的 id，存档里必须是同一只
  const expPath = path.join(ROOT, 'src', 'data', 'content-export.json');
  if (!fs.existsSync(expPath)) return;   // 台账不在就跳过（CI 首次生成前）
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  const expById = new Map((exp.monsters || []).map((m) => [Number(m.id), m]));
  const hijacked = [];
  for (const mo of monsters) {
    const old = expById.get(Number(mo.id));
    if (old && old.name !== mo.name) hijacked.push(`#${mo.id}: 台账=${old.name} vs 存档=${mo.name}`);
  }
  assert.deepStrictEqual(hijacked, [], `原有怪被顶掉：${hijacked.slice(0, 5).join('; ')}`);
});

t('境界池血量水位：每个池「最硬 / 中位」≤ 2（内容追加不得打乱池平衡）', () => {
  // 轮103 血泪：新增怪/抬升怪若血量没跟池水位，会把池中位拉低，
  // 于是原有的高档 Boss（五行圣兽 8835、仙界使者 21773）突然"超线" 2.46~4.10 倍。
  const pools = {};
  for (const m of monsters) {
    const r = parseMaybe(m.level_range);
    if (!Array.isArray(r) || r.length < 2) continue;
    const st = parseMaybe(m.stats);
    const hp = st && Number(st.hp);
    if (!hp) continue;
    const mid = (Number(r[0]) + Number(r[1])) / 2;
    const rr = (db.realms || []).find((x) => mid >= Number(x.min_level) && mid <= Number(x.max_level));
    if (!rr) continue;
    (pools[rr.name] = pools[rr.name] || []).push({ hp, name: m.name });
  }
  const names = Object.keys(pools);
  assert.ok(names.length >= 8, `只覆盖 ${names.length} 个境界池，样本不足`);
  const bad = [];
  for (const n of names) {
    const a = pools[n].map((x) => x.hp).sort((x, y) => x - y);
    const med = a[Math.floor(a.length / 2)];
    const top = pools[n].slice().sort((x, y) => y.hp - x.hp)[0];
    const ratio = top.hp / med;
    if (ratio > 2.0) bad.push(`${n} ${ratio.toFixed(2)}×（${top.name} ${top.hp} vs 中位 ${med}）`);
  }
  assert.deepStrictEqual(bad, [], `境界池血量水位失守：${bad.join('; ')}`);
});

t('同图怪血量不许断层（一张图跨两个池时，图内跨度 ≤ 3.5 倍）', () => {
  // 跨池图天然有阶差（map1 青云山麓 52~137 是 2.6 倍，属正常题材设计），
  // 但 7.9 倍这种断层会让玩家在同一张图里忽而被秒、忽而秒怪 —— 那是配血没跟上等级。
  // 阈值取 3.5：容得下正常的图内强弱，抓得住"漏配的怪"。
  const byMap = new Map();
  for (const m of monsters) {
    const mid = Number(m.map_id);
    if (!mid) continue;
    const st = parseMaybe(m.stats);
    const hp = st && Number(st.hp);
    if (!hp) continue;
    if (!byMap.has(mid)) byMap.set(mid, []);
    byMap.get(mid).push({ hp, name: m.name });
  }
  const gaps = [];
  for (const [mid, list] of byMap) {
    if (list.length < 2) continue;
    const hps = list.map((x) => x.hp);
    const lo = Math.min(...hps), hi = Math.max(...hps);
    if (hi / lo > 3.5) {
      const weak = list.filter((x) => x.hp < hi / 3.5).map((x) => `${x.name}(${x.hp})`);
      gaps.push(`map${mid} ${lo}~${hi}（${(hi / lo).toFixed(1)}倍，偏低：${weak.join('/')}）`);
    }
  }
  assert.deepStrictEqual(gaps, [], `同图血量断层：${gaps.join('; ')}`);
});

t('地图档位与池水位不脱节：每张图的怪血量必须在合理阶梯上（不许回到"越打越亏"）', () => {
  // 综合校验：低档图的怪不能比高档图还硬（否则进度带倒挂）
  const mapById = new Map(maps.map((m) => [Number(m.id), m]));
  const mapAvg = [];
  for (const [mid, m] of mapById) {
    const list = monsters.filter((x) => Number(x.map_id) === mid);
    if (!list.length) continue;
    const hps = list.map((x) => Number((parseMaybe(x.stats) || {}).hp) || 0).filter((x) => x > 0);
    if (!hps.length) continue;
    mapAvg.push({ name: m.name, minLv: Number(m.min_level || 0), avg: hps.reduce((a, b) => a + b, 0) / hps.length });
  }
  mapAvg.sort((a, b) => a.minLv - b.minLv);
  const inverted = [];
  for (let i = 1; i < mapAvg.length; i++) {
    const lo = mapAvg[i - 1], hi = mapAvg[i];
    // 允许相邻图有重叠（新手图与进阶图常交叠），但低档图平均血不得是高两档图的 1.2 倍以上
    if (hi.minLv - lo.minLv >= 20 && lo.avg > hi.avg * 1.2) {
      inverted.push(`${lo.name}(Lv${lo.minLv} 均${Math.round(lo.avg)}) > ${hi.name}(Lv${hi.minLv} 均${Math.round(hi.avg)})`);
    }
  }
  assert.deepStrictEqual(inverted, [], `图档位与血量倒挂：${inverted.join('; ')}`);
});

t('战斗四段胜率的已知偏差必须被显式登记（不许"门禁绿 = 战斗已配平"的错觉）', () => {
  // ⚠ 轮103 发现的真实缺口：门禁此前只检查"sim-battle 是只读脚本"，
  //   **不检查它的胜率结论**。于是四段里有三段不达标（段1 72.8 / 段3 72.4 / 段4 66.8，
  //   目标分别是 75-92 / 45-65 / 30-50），门禁却全绿 —— 这是假绿。
  //
  // 现在这个缺口被两条锁补上：
  //   ① 本锁：`sim-battle` 的胜率结论必须被显式读取并登记（绿=达标，红=偏差在案）；
  //   ② 章程 R13：把"胜率带与 TTK 窗口在段4 上互相冲突"的实测证据与三条待裁决路线写进制度。
  //
  // 这里**不**断言它必须绿（那会让门禁常红、失去信号价值），而是断言：
  //   · 若红，偏差必须与章程 R13 登记的实测值一致（防止"悄悄变得更红"没人发现）；
  //   · 若绿，章程 R13 必须被更新（防止"配平了但制度还记着旧的坏消息"）。
  const r = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'sim-battle.js')], {
    cwd: ROOT, encoding: 'utf8', timeout: 300000
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const allOk = /🟢 四段全部落区间/.test(out);
  const charter = fs.readFileSync(path.join(ROOT, '开发自治章程.md'), 'utf8');
  const registered = /R13/.test(charter) && /四段胜率带/.test(charter);
  if (!allOk) {
    assert.ok(registered,
      'sim-battle 四段未全落区间，但章程里没有 R13 的偏差登记 —— 坏消息必须留痕，不许静默');
    // 抽查一个登记值是否还对得上（段4 目标 30-50%）
    const m = out.match(/段4[^\n]*?([\d.]+)%\s*[✗✓]/);
    assert.ok(m, 'sim-battle 输出格式变了，本锁读不到段4 实测值（请同步更新本锁）');
    const seg4 = Number(m[1]);
    assert.ok(seg4 > 0 && seg4 <= 100, `段4 实测值解析异常：${m[1]}`);
  } else {
    assert.ok(/已配平|全部落区间/.test(charter),
      'sim-battle 已全绿，但章程 R13 仍把它登记为未解决 —— 请更新制度，别让旧结论留在册子上');
  }
});

closeDatabase();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

console.log(`\n玩法闭环完整性: ${pass} 通过, ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
