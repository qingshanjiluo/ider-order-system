/**
 * 宗门藏书阁（内容富集三期）
 *  - ensureSectBase：宗门基础功法（gongfa-library 按 sect_key）幂等入库
 *  - upload：弟子上传 功法/丹方/器方/符方/技能书 → 按品阶得贡献 → 入藏书阁（同名去重）
 *  - learn：消耗贡献学习（功法→功法物品入包；丹方/器方/符方→learned_blueprints；技能书→player_skills 学会）
 */
const store = require('../db/store');
const { getNextId } = require('../database');
const { GONGFA_LIBRARY } = require('../data/gongfa-library');

const CONTRIB_BY_QUALITY = { 黄阶: 10, 玄阶: 20, 地阶: 40, 天阶: 80, 圣阶: 150, 仙阶: 300, 凡品: 10, 灵品: 20, 宝品: 40 };
const LEARN_COST = { 黄阶: 20, 玄阶: 40, 地阶: 80, 天阶: 160, 圣阶: 300, 仙阶: 600 };
const UPLOAD_KINDS = ['功法', '丹方', '器方', '符方', '技能书', '阵法'];

function entriesOf(sectId) {
  return store.queryRel('sect_library', { sect_id: sectId }, 'rowid');
}

function ensureSectBase(db, sectId, sectKey) {
  const existing = new Set(entriesOf(sectId).map(e => e.name));
  let added = 0;
  for (const g of GONGFA_LIBRARY.filter(g => g.sect_key === sectKey)) {
    if (existing.has(g.name)) continue;
    store.insertRel('sect_library', {
      sect_id: sectId, kind: '功法', name: g.name, quality: g.quality,
      realm: g.realm, upgradeable: g.upgradeable ? 1 : 0, source: 'sect_base',
      contributor: null, contribution: 0, stats: JSON.stringify(g.stats),
      created_at: new Date().toISOString()
    });
    added++;
  }
  return added;
}

/** 上传：消耗背包物品 → 贡献 + 藏书阁 */
function upload(db, character, itemId) {
  const member = store.queryRel('sect_members', { character_id: character.id })[0];
  if (!member) return { ok: false, error: '未加入宗门' };
  const invIdx = db.inventory.findIndex(i => i.id === Number(itemId) && i.character_id === character.id);
  if (invIdx === -1) return { ok: false, error: '背包中没有该物品' };
  const inv = db.inventory[invIdx];
  const item = db.items.find(i => i.id === inv.item_id);
  if (!item) return { ok: false, error: '物品定义不存在' };
  if (!UPLOAD_KINDS.includes(item.type)) return { ok: false, error: `仅可上传 ${UPLOAD_KINDS.join('/')}，此物品为 ${item.type}` };

  const sect = store.queryRel('sects', { id: member.sect_id })[0];
  if (!sect) return { ok: false, error: '宗门不存在' };
  if (entriesOf(member.sect_id).some(e => e.name === item.name)) {
    return { ok: false, error: '藏书阁已有同名典籍' };
  }

  const contribution = CONTRIB_BY_QUALITY[item.quality] || 10;
  store.insertRel('sect_library', {
    sect_id: member.sect_id, kind: item.type, name: item.name, quality: item.quality,
    realm: null, upgradeable: item.type === '功法' ? 1 : 0, source: 'upload',
    contributor: character.name, contribution, stats: item.stats || '{}',
    created_at: new Date().toISOString()
  });

  // 消耗背包物品
  inv.quantity = (inv.quantity || 1) - 1;
  if (inv.quantity <= 0) db.inventory.splice(invIdx, 1);
  member.contribution = (member.contribution || 0) + contribution;
  store.updateRel('sect_members', member.id, { contribution: member.contribution });
  db.dirty = true;
  return { ok: true, contribution, name: item.name, kind: item.type, totalContribution: member.contribution };
}

/** 学习：扣贡献 → 功法入包 / 方子入蓝图 / 技能书学会 */
function learn(db, character, name) {
  const member = store.queryRel('sect_members', { character_id: character.id })[0];
  if (!member) return { ok: false, error: '未加入宗门' };
  const entry = entriesOf(member.sect_id).find(e => e.name === name);
  if (!entry) return { ok: false, error: '藏书阁没有此典籍' };
  const cost = LEARN_COST[entry.quality] || 40;
  if ((member.contribution || 0) < cost) return { ok: false, error: `贡献不足（需 ${cost}，现有 ${member.contribution || 0}）` };

  if (entry.kind === '功法') {
    const itemId = getNextId('items');
    db.items.push({
      id: itemId, name: entry.name, type: '功法', quality: entry.quality,
      // 轮46：带上传承境界（此前漏带，学来的功法 items.realm 恒缺，cultivation.js 的境界适配判定落空）。
      // 功法库的 realm 带"期"后缀（炼气期…渡劫期），而 db.realms 的名字不带（炼气…渡劫），
      // 所以在此就地剥掉后缀，不留给卫生工序去擦 —— items.realm 边要求直接合法。
      realm: String(entry.realm || '').replace(/期$/, '') || null,
      stats: entry.stats || '{}', description: `宗门藏书阁典籍（${entry.realm || ''}适用，${entry.upgradeable ? '可升级' : '不可升级'}）`
    });
    db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: itemId, quantity: 1 });
  } else if (entry.kind === '技能书') {
    const st = JSON.parse(entry.stats || '{}');
    if (!st.skill_id) return { ok: false, error: '技能书数据异常' };
    if (!db.player_skills) db.player_skills = [];
    if (db.player_skills.find(ps => ps.character_id === character.id && ps.skill_id === st.skill_id)) {
      return { ok: false, error: '已学会该技能' };
    }
    db.player_skills.push({ id: getNextId('player_skills'), character_id: character.id, skill_id: st.skill_id, level: 1, equipped_slot: null });
  } else {
    // 丹方/器方/符方 → 蓝图
    if (!character.learned_blueprints) character.learned_blueprints = [];
    if (character.learned_blueprints.find(b => b.name === entry.name)) {
      return { ok: false, error: '已掌握该方子' };
    }
    character.learned_blueprints.push({ name: entry.name, kind: entry.kind, source: 'sect_library' });
  }

  member.contribution = (member.contribution || 0) - cost;
  store.updateRel('sect_members', member.id, { contribution: member.contribution });
  db.dirty = true;
  return { ok: true, learned: entry.name, kind: entry.kind, cost, remainingContribution: member.contribution };
}

/**
 * 功法/灵宠"具名货架"（轮46 · 落实 T1-1 硬约束 2「补定义之前先解决可达性」）
 *
 * 轮46 实测的两处真缺口：
 *  ① `ensureSectBase` 被导出却**没有任何调用点**（findstr 全仓只有定义与 module.exports 两处），
 *    存档 `sect_library` 里 kind='功法' 只有 4 行（全是玩家上传的）⇒ 18 个宗门的功法架全是空的，
 *    82 门宗门功法无人可学；
 *  ② 非宗门典籍（传承/副本/机遇）从未物化成物品，而 `POST /gongfa/equip` 只认背包里一件 type='功法'
 *    的物品 ⇒ 扩展口径后审计显示「功法 3/69、灵宠 1/13、功法书 0/5 有获取路径」。
 * 本工序一次把三件事补齐（幂等，名称为键）：给现存每个宗门铺基础功法架、把非宗门典籍物化成
 * items 并挂坊市、给早期种子里既无货架又不在架上的 功法/灵宠 物品补货架。
 * 价格阶梯有意做重（圣阶 4.5 万、仙阶 15 万灵石），是长期灵石沉淀口；同时 economy.js 的"机缘"
 * 仍会从 type='功法' 物品池随机赠予，非付费路线没有被堵死。
 */
// 新号起始 100 灵石（routes/auth.js:55），故黄阶定价 100 —— 让"第一门具名功法"开局就买得起，
// 这是对 T1-1 硬约束 2（补定义之前先解决买不起）的正面回答，而不是把门槛挪到玩家摸不到的地方。
const GONGFA_PRICE = { 黄阶: 100, 玄阶: 800, 地阶: 3000, 天阶: 12000, 圣阶: 45000, 仙阶: 150000 };
const PET_PRICE = { 凡兽: 150, 灵兽: 500, 玄兽: 1500, 地兽: 5000, 天兽: 15000, 圣兽: 45000, 仙兽: 150000 };

function ensureGongfaShelves(db) {
  if (!db.items) db.items = [];
  if (!db.shop) db.shop = [];
  let changed = 0;
  const addShopRow = (item, price, note) => {
    const row = db.shop.find((s) => Number(s.item_id) === Number(item.id));
    if (row) {
      // 货架价格一律以阶梯为准：改过阶梯后已上架的行也要跟着改，否则玩家看到的还是旧价，
      // 而"黄阶 100 = 新号买得起"这条口径就成了纸面承诺。
      if (Number(row.price) !== Number(price)) { row.price = Number(price); row.description = note; return 1; }
      return 0;
    }
    db.shop.push({
      id: getNextId('shop'), item_id: item.id, price, stock: 999,
      description: note
    });
    return 1;
  };

  // ① 现存宗门的功法架（此前无人调用，等于货架空白）
  let sectRows = [];
  try { sectRows = store.queryRel('sects', {}); } catch (e) { sectRows = []; }
  for (const s of sectRows) {
    if (!s || !s.key) continue;
    changed += ensureSectBase(db, Number(s.id), String(s.key));
  }

  // 宗门功法架上的名字（learn() 会按名物化成 type='功法' 物品，故这些不再挂坊市，避免双渠道）
  const shelfNames = new Set();
  for (const s of sectRows) {
    if (!s || s.id == null) continue;
    try { for (const e of entriesOf(Number(s.id))) if (e.kind === '功法') shelfNames.add(String(e.name)); } catch (e) { /* 忽略单宗异常 */ }
  }

  // ② 非宗门典籍：物化成 items + 坊市具名货架
  for (const g of GONGFA_LIBRARY.filter((x) => !x.sect_key)) {
    let item = db.items.find((i) => String(i.name) === String(g.name));
    if (!item) {
      const id = getNextId('items');
      db.items.push({
        id, name: g.name, type: '功法', quality: g.quality,
        realm: String(g.realm || '').replace(/期$/, '') || null,   // 剥掉"期"后缀，直接对齐 db.realms 的名字
        stats: JSON.stringify(g.stats),
        description: `${g.desc}（${g.source}所得，坊市典籍铺有售）`
      });
      item = db.items.find((i) => Number(i.id) === Number(id));
      changed++;
    }
    changed += addShopRow(item, GONGFA_PRICE[item.quality] || 800, `坊市典籍铺·${item.quality}功法（装备后入功法槽，卸下回背包）`);
  }

  // ③ 治愈：功法书的引用改挂"按名"这一层 —— items.id 在不同库里不稳定（全新档上 gongfa_id=14
  //    会撞上材料行），所以只要 gongfa_id 目前确实指向一条功法，就把它的名字也写进 stats，
  //    让 /study 与 ref-integrity 都有一条不依赖 id 的解析路径。
  for (const item of db.items) {
    if (item.type !== '功法书') continue;
    let st = {};
    try { st = JSON.parse(item.stats || '{}'); } catch (e) { st = {}; }
    if (st.gongfa) continue;
    const tg = db.items.find((o) => Number(o.id) === Number(st.gongfa_id) && o.type === '功法');
    if (!tg) continue;
    st.gongfa = String(tg.name);
    item.stats = JSON.stringify(st);
    changed++;
  }

  // ④ 治愈早期种子：既不在宗门架上、坊市也无货架的 功法/灵宠 物品
  for (const item of db.items) {
    if (item.type !== '功法' && item.type !== '灵宠') continue;
    if (item.type === '功法' && shelfNames.has(String(item.name))) continue;
    const ladder = item.type === '功法' ? GONGFA_PRICE : PET_PRICE;
    changed += addShopRow(item, ladder[item.quality] || 800, `坊市${item.type === '功法' ? '典籍铺' : '灵兽铺'}·${item.quality || '无品阶'}`);
  }
  return changed;
}

module.exports = { entriesOf, ensureSectBase, ensureGongfaShelves, upload, learn, UPLOAD_KINDS, CONTRIB_BY_QUALITY, LEARN_COST, GONGFA_PRICE, PET_PRICE };
