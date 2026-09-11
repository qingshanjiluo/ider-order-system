/**
 * 宗门服务（阶段4 一期 · 决议 D3）
 * NPC 宗门 18 家 + 六大建筑 + 宗门贡献（与仙盟贡献严格分离）。
 * 关系表：sects / sect_members / sect_buildings（store.insertRel/queryRel）
 */
const store = require('../db/store');
const { SECTS, BUILDINGS, EXCHANGE_TABLE } = require('../data/sects');
const { loadDatabase } = require('../database');

function seeded() {
  return store.queryRel('sects').length > 0;
}

function ensureSeeded() {
  if (seeded()) return;
  for (const s of SECTS) {
    store.insertRel('sects', {
      key: s.key, name: s.name, faction: s.faction, school: s.school,
      description: s.description, is_player_created: 0,
      join_requirement: JSON.stringify(s.joinReq || {}), gongfa_focus: s.gongfaFocus || null
    });
  }
}

function getSectRow(sectIdOrKey) {
  ensureSeeded();
  const rows = store.queryRel('sects');
  return rows.find(r => r.id === Number(sectIdOrKey) || r.key === sectIdOrKey || r.name === sectIdOrKey);
}

function getMembers(sectId) {
  return store.queryRel('sect_members', { sect_id: sectId });
}

function getMembership(character) {
  const rows = store.queryRel('sect_members', { character_id: character.id });
  return rows[0] || null;
}

function checkJoinReq(sectRow, character) {
  const req = JSON.parse(sectRow.join_requirement || '{}');
  if (req.minLevel && (character.level || 1) < req.minLevel) {
    return { ok: false, error: `等级不足，需 ${req.minLevel} 级` };
  }
  if (req.minRoots) {
    const roots = (character.spirit_roots || []).filter(r => !r.special);
    if (roots.length < req.minRoots) return { ok: false, error: `${sectRow.name}仅收 ${req.minRoots} 灵根以上修士` };
  }
  if (req.fee && (character.spirit_stone || 0) < req.fee) {
    return { ok: false, error: `入宗费 ${req.fee} 灵石不足` };
  }
  return { ok: true, fee: req.fee || 0 };
}

function listSects(character) {
  ensureSeeded();
  const mine = getMembership(character);
  return store.queryRel('sects').map(r => {
    const def = SECTS.find(s => s.key === r.key) || {};
    return {
      id: r.id, key: r.key, name: r.name, faction: r.faction, school: r.school,
      description: r.description, gongfaFocus: r.gongfa_focus,
      joinReq: JSON.parse(r.join_requirement || '{}'),
      memberCount: getMembers(r.id).length,
      joined: mine ? mine.sect_id === r.id : false
    };
  });
}

function join(character, sectIdOrKey) {
  const db = loadDatabase();
  const sectRow = getSectRow(sectIdOrKey);
  if (!sectRow) return { ok: false, error: '宗门不存在' };
  if (getMembership(character)) return { ok: false, error: '已身在其宗，需先退出当前宗门' };
  const gate = checkJoinReq(sectRow, character);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (gate.fee > 0) character.spirit_stone -= gate.fee;
  const id = store.insertRel('sect_members', {
    sect_id: sectRow.id, character_id: character.id,
    rank: '外门弟子', contribution: 0, joined_at: new Date().toISOString()
  });
  db.dirty = true;
  return { ok: true, member: { id, sect: sectRow.name, rank: '外门弟子', contribution: 0 }, feePaid: gate.fee };
}

function leave(character) {
  const db = loadDatabase();
  const mine = getMembership(character);
  if (!mine) return { ok: false, error: '未加入任何宗门' };
  const sqliteDelete = () => {
    // 直接删关系行（insertRel/queryRel 之外补一个 delete）
    store.deleteRel('sect_members', { character_id: character.id });
  };
  sqliteDelete();
  db.dirty = true;
  return { ok: true, lostContribution: mine.contribution };
}

/** 杂役堂：每游戏日一次（现实 ~2.4h），贡献 4-10 ×(1+杂役堂等级×0.1) */
function dailyChore(character) {
  const db = loadDatabase();
  const mine = getMembership(character);
  if (!mine) return { ok: false, error: '未加入宗门' };
  const now = Date.now();
  const last = character.sect_last_chore_at || 0;
  const GAME_HOURS_PER_GAME_DAY = 2.4;
  if (now - last < GAME_HOURS_PER_GAME_DAY * 3600 * 1000) {
    return { ok: false, error: '杂役每日一次（游戏日），尚未刷新' };
  }
  character.sect_last_chore_at = now;
  const choreLv = getBuildingLevel(mine.sect_id, 'chore');
  const gain = Math.floor((4 + Math.floor(Math.random() * 7)) * (1 + choreLv * 0.1));
  addContribution(mine, gain);
  db.dirty = true;
  return { ok: true, contributionGain: gain, contribution: mine.contribution, task: CHORE_TASKS[Math.floor(Math.random() * CHORE_TASKS.length)] };
}

const CHORE_TASKS = ['清扫藏经阁', '照料灵田', '喂养灵兽', '搬运丹材', '修剪竹园', '擦拭阵盘'];

/** 捐献灵石换贡献（1:1，宗门资金留档） */
function contribute(character, amount) {
  const db = loadDatabase();
  const mine = getMembership(character);
  if (!mine) return { ok: false, error: '未加入宗门' };
  const amt = Math.floor(Number(amount));
  if (!(amt > 0)) return { ok: false, error: '捐献数额无效' };
  if ((character.spirit_stone || 0) < amt) return { ok: false, error: '灵石不足' };
  character.spirit_stone -= amt;
  addContribution(mine, amt);
  db.dirty = true;
  return { ok: true, contribution: mine.contribution, donated: amt };
}

function addContribution(memberRow, amount) {
  // sect_members.contribution 增量
  store.incrementRel('sect_members', memberRow.id, 'contribution', amount);
  memberRow.contribution = (memberRow.contribution || 0) + amount;
}

function getBuildingLevel(sectId, key) {
  const rows = store.queryRel('sect_buildings', { sect_id: sectId });
  const row = rows.find(r => r.building_key === key);
  // 建筑初始 1 级（无记录 = 未升级的 1 级建筑），上限 5
  return row ? row.level : 1;
}

function listBuildings(sectId) {
  ensureSeeded();
  return BUILDINGS.map(b => ({
    ...b,
    level: getBuildingLevel(sectId, b.key),
    nextCost: b.upgradeCost(getBuildingLevel(sectId, b.key) + 1)
  }));
}

/** 捐修建筑：贡献值消耗（个人），全宗受益 */
function upgradeBuilding(character, buildingKey) {
  const db = loadDatabase();
  const mine = getMembership(character);
  if (!mine) return { ok: false, error: '未加入宗门' };
  const def = BUILDINGS.find(b => b.key === buildingKey);
  if (!def) return { ok: false, error: '建筑不存在' };
  const cur = getBuildingLevel(mine.sect_id, buildingKey);
  if (cur >= 5) return { ok: false, error: '该建筑已达最高等级（5级）' };
  const cost = def.upgradeCost(cur + 1);
  if ((mine.contribution || 0) < cost) return { ok: false, error: `贡献不足，需 ${cost}`, need: cost };
  addContribution(mine, -cost);
  const existing = store.queryRel('sect_buildings', { sect_id: mine.sect_id }).find(r => r.building_key === buildingKey);
  if (existing) {
    store.updateRel('sect_buildings', existing.id, { level: cur + 1 });
  } else {
    store.insertRel('sect_buildings', { sect_id: mine.sect_id, building_key: buildingKey, level: cur + 1 });
  }
  db.dirty = true;
  return { ok: true, building: def.name, level: cur + 1, spent: cost, contribution: mine.contribution };
}

/** 宗门增益汇总（供战斗/生产/修炼接线） */
function getBenefits(character) {
  const mine = getMembership(character);
  if (!mine) return { inSect: false };
  const lv = (k) => getBuildingLevel(mine.sect_id, k);
  return {
    inSect: true,
    sectId: mine.sect_id,
    contribution: mine.contribution || 0,
    rank: mine.rank,
    craftSuccessBonus: lv('library') * 0.03,
    combatBonus: lv('arena') * 0.02,
    cultivateSpeedBonus: lv('tower') * 0.05,
    choreBonus: lv('chore') * 0.1,
    treasuryLevel: lv('treasury')
  };
}

/** 藏宝阁兑换 */
function exchange(character, itemName) {
  const db = loadDatabase();
  const mine = getMembership(character);
  if (!mine) return { ok: false, error: '未加入宗门' };
  const entry = EXCHANGE_TABLE.find(e => e.item === itemName);
  if (!entry) return { ok: false, error: '藏宝阁无此兑换品' };
  const tLv = getBuildingLevel(mine.sect_id, 'treasury');
  if (tLv < entry.treasuryLevel) return { ok: false, error: `藏宝阁 ${entry.treasuryLevel} 级解锁` };
  if ((mine.contribution || 0) < entry.contrib) return { ok: false, error: `贡献不足，需 ${entry.contrib}` };
  const item = (db.items || []).find(i => i.name === entry.item);
  if (!item) return { ok: false, error: '兑换品尚未上架' };
  addContribution(mine, -entry.contrib);
  const inv = db.inventory.find(i => i.character_id === character.id && i.item_id === item.id);
  if (inv) inv.quantity = (inv.quantity || 1) + 1;
  else db.inventory.push({ id: store.getNextId('inventory'), character_id: character.id, item_id: item.id, quantity: 1 });
  db.dirty = true;
  return { ok: true, item: item.name, spent: entry.contrib, contribution: mine.contribution };
}

module.exports = {
  ensureSeeded, listSects, join, leave, getMembership, dailyChore, contribute,
  listBuildings, upgradeBuilding, getBenefits, exchange, getSectRow
};
