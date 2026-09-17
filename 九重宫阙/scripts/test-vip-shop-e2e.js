/**
 * 仙玉商城端到端（轮108）。
 *
 * ## 存在理由
 *
 * 商城是**真花钱**的地方（仙玉/充值）。轮108 发现它此前把三件商品卖成了虚空：
 *   · j3 回城符 → itemId 50（物品表缺号，不存在）
 *   · j4 传音符 → itemId 49（缺号，不存在）
 *   · j12 复活令 → itemId 56 实为回城符，且"复活令"根本不在物品表里
 * 静态审计能查"引用对不对"，但查不到"买下来到底进了什么" ——
 * 本套真注册角色、真给仙玉、真 POST /jade-buy，然后核对背包里到手的是不是那件东西。
 *
 * 隔离：临时 DSH_DATA_DIR；正式档只读比对。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g13-vip-'));
process.env.DSH_DATA_DIR = TMP;
const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.readFileSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase } = require('../src/database');
const materials = require('../src/services/materials');

// ── boot 平价（两段，缺一不可）──
// ① 内容播种：空档必须跑 content-sync import（= npm run seed:content），把
//    src/data/content-export.json 的 634 件物品/134 怪/32 图按 id 覆盖式灌进去。
//    踩过的坑：第一版只跑 materials.ensureAll，那只是**兜底回填**（补 grade/货架/图节点），
//    假设 db.items 已有基础数据 —— 于是临时档只有 327 件物品，商城要卖的"回城符"根本不存在，
//    测试报 500。这不是测试写法问题，是**临时档与正式档的内容不等价**。
//    content-sync 是顶层执行的 CLI（无导出函数），所以走子进程。
// ② materials.ensureAll：真服务器起动时跑的同一个 boot 钩子。
{
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'scripts', 'content-sync.js'), 'import'],
    { env: { ...process.env, DSH_DATA_DIR: TMP }, stdio: 'pipe' });
  const db = loadDatabase();
  materials.ensureAll(db);
  saveDatabase(db);
  const n = (db.items || []).length;
  if (n < 600) {
    console.error(`🔴 boot 平价失败：临时档只有 ${n} 件物品（正式档 634）。`
      + '临时档与正式档内容不等价，功能测试的结论不可信。');
    process.exit(1);
  }
  console.log(`  boot 平价：物品 ${n} / 怪 ${(db.monsters || []).length} / 图 ${(db.maps || []).length}`);
}

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

(async () => {
  console.log('== G13 · 仙玉商城端到端（临时数据目录）==');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/character', require('../src/routes/character'));
  app.use('/api/vip', require('../src/routes/vip'));
  const srv = app.listen(0);
  const port = srv.address().port;
  const call = async (method, p, body, token) => {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let j; const txt = await res.text(); try { j = JSON.parse(txt); } catch { j = txt; }
    return { code: res.status, body: j };
  };

  const u = 'vip' + Date.now().toString(36).slice(-6);
  const reg = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
  if (reg.code !== 200) throw new Error('注册失败：' + JSON.stringify(reg.body).slice(0, 120));
  const TOKEN = reg.body.token;
  const CID = loadDatabase().characters.find((c) => c.user_id === reg.body.userId).id;

  const giveJade = (n) => {
    const db = loadDatabase();
    const c = db.characters.find((x) => x.id === CID);
    c.jade = (c.jade || 0) + n;
    saveDatabase(db);
  };

  // ── 1. 商城列表本身可用 ──
  const list = await call('GET', '/api/vip/jade-shop', undefined, TOKEN);
  await t('GET /jade-shop 返回商品列表（不是 500）', async () => {
    if (list.code !== 200) throw new Error(`HTTP ${list.code}：${JSON.stringify(list.body).slice(0, 140)}`);
    if (!Array.isArray(list.body.items) || !list.body.items.length) throw new Error('items 为空');
  });

  await t('每个商品都带可用的 itemId（前端能显示、能买）', async () => {
    const db = loadDatabase();
    const byId = new Map((db.items || []).map((i) => [Number(i.id), i]));
    const bad = [];
    for (const it of list.body.items) {
      if (it.type !== 'item') continue;
      const found = byId.get(Number(it.itemId));
      if (!found) { bad.push(`${it.id}「${it.name}」itemId=${it.itemId} 无对应物品`); continue; }
      if (found.name !== it.name.split('x')[0]) bad.push(`${it.id}「${it.name}」实际是「${found.name}」`);
    }
    if (bad.length) throw new Error(bad.join('；'));
  });

  // ── 2. 真买：每件物品商品都买一次，核对背包到手的是不是它 ──
  await t('真买每一件物品商品：背包里到手的名字与商品名一致', async () => {
    const itemGoods = list.body.items.filter((i) => i.type === 'item');
    if (!itemGoods.length) throw new Error('没有物品类商品可测');
    giveJade(itemGoods.reduce((a, i) => a + i.cost, 0) + 100);
    const bad = [];
    for (const g of itemGoods) {
      const before = (() => {
        const db = loadDatabase();
        return (db.inventory || []).find((r) => r.character_id === CID && Number(r.item_id) === Number(g.itemId));
      })();
      const beforeQty = before ? (before.quantity || 0) : 0;

      const r = await call('POST', '/api/vip/jade-buy', { itemId: g.id }, TOKEN);
      if (r.code !== 200) { bad.push(`买「${g.name}」失败 HTTP ${r.code}：${JSON.stringify(r.body).slice(0, 80)}`); continue; }

      const db = loadDatabase();
      const row = (db.inventory || []).find((x) => x.character_id === CID && Number(x.item_id) === Number(g.itemId));
      const afterQty = row ? (row.quantity || 0) : 0;
      const delta = afterQty - beforeQty;
      if (delta !== g.quantity) bad.push(`买「${g.name}」应得 ${g.quantity} 件，实际进背包 ${delta} 件`);
      // 关键：物品定义真的存在，且名字对得上
      const def = (db.items || []).find((i) => Number(i.id) === Number(g.itemId));
      if (!def) { bad.push(`买「${g.name}」拿到的 item_id=${g.itemId} 在物品表里没有定义`); continue; }
      if (def.name !== g.name.split('x')[0]) bad.push(`买「${g.name}」到手是「${def.name}」`);
    }
    if (bad.length) throw new Error(bad.join('；'));
  });

  await t('仙玉不足时拒绝购买，且不扣玉、不发物', async () => {
    const db0 = loadDatabase();
    const c0 = db0.characters.find((x) => x.id === CID);
    c0.jade = 0;
    saveDatabase(db0);
    const g = list.body.items.find((i) => i.type === 'item');
    const r = await call('POST', '/api/vip/jade-buy', { itemId: g.id }, TOKEN);
    if (r.code !== 400) throw new Error(`玉为 0 时应 400，实际 ${r.code}`);
    const db = loadDatabase();
    const c = db.characters.find((x) => x.id === CID);
    if ((c.jade || 0) !== 0) throw new Error('仙玉被扣了：' + c.jade);
  });

  await t('不存在的商品 id 被拒（不许静默成功）', async () => {
    giveJade(999);
    const r = await call('POST', '/api/vip/jade-buy', { itemId: 'j_not_exist' }, TOKEN);
    if (r.code !== 400) throw new Error(`应 400，实际 ${r.code}`);
    const db = loadDatabase();
    const c = db.characters.find((x) => x.id === CID);
    if (c.jade !== 999) throw new Error('玉被扣了：' + c.jade);
  });

  await t('灵石类商品发的是灵石而不是物品', async () => {
    giveJade(999);
    const g = list.body.items.find((i) => i.type === 'spirit_stone');
    const before = loadDatabase().characters.find((x) => x.id === CID).spirit_stone || 0;
    const r = await call('POST', '/api/vip/jade-buy', { itemId: g.id }, TOKEN);
    if (r.code !== 200) throw new Error(`HTTP ${r.code}：${JSON.stringify(r.body).slice(0, 80)}`);
    const after = loadDatabase().characters.find((x) => x.id === CID).spirit_stone || 0;
    if (after - before !== g.value) throw new Error(`应加 ${g.value} 灵石，实际加 ${after - before}`);
  });

  await t('正式存档 data/game.db 未被本套件写动（只写临时目录）', async () => {
    const liveNow = fs.existsSync(LIVE_DB) ? fs.readFileSync(LIVE_DB) : null;
    if (String(liveBefore) !== String(liveNow)) throw new Error('正式存档被改了！');
  });

  srv.close();
  console.log('\nG13 仙玉商城端到端: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('套件异常：' + e.message); process.exit(1); });
