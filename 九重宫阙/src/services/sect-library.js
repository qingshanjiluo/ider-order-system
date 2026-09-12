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
const UPLOAD_KINDS = ['功法', '丹方', '器方', '符方', '技能书'];

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

module.exports = { entriesOf, ensureSectBase, upload, learn, UPLOAD_KINDS, CONTRIB_BY_QUALITY, LEARN_COST };
