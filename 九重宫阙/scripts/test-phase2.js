/* 阶段2 验收测试：元素体系 / 时间引擎 / 寿命 / 伤势 */
const assert = require('assert');
const elements = require('../src/services/elements');
const gameTime = require('../src/services/gameTime');
const injury = require('../src/services/injury');
const store = require('../src/db/store');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

console.log('== 元素体系（D2）==');
t('全部中文旧命名归一化', () => {
  assert.strictEqual(elements.normalize('金'), 'metal');
  assert.strictEqual(elements.normalize('雷'), 'metal');
  assert.strictEqual(elements.normalize('木'), 'wood');
  assert.strictEqual(elements.normalize('风'), 'wood');
  assert.strictEqual(elements.normalize('光'), 'light');
  assert.strictEqual(elements.normalize('暗'), 'dark');
  assert.strictEqual(elements.normalize('混沌'), 'none');
  assert.strictEqual(elements.normalize('五行'), 'none');
  assert.strictEqual(elements.normalize('仙'), 'light');
});
t('金/土 映射冲突已修复', () => {
  assert.notStrictEqual(elements.normalize('金'), elements.normalize('土'));
  assert.strictEqual(elements.normalize('土'), 'earth');
});
t('五行克制环 金克木→木克土→土克水→水克火→火克金', () => {
  assert.strictEqual(elements.effectiveness('metal', 'wood'), 1.3);
  assert.strictEqual(elements.effectiveness('wood', 'earth'), 1.3);
  assert.strictEqual(elements.effectiveness('earth', 'water'), 1.3);
  assert.strictEqual(elements.effectiveness('water', 'fire'), 1.3);
  assert.strictEqual(elements.effectiveness('fire', 'metal'), 1.3);
});
t('被克 0.7 / 光暗互克 1.3 / 无关 1.0 / 无属性 1.0', () => {
  assert.strictEqual(elements.effectiveness('wood', 'metal'), 0.7);
  assert.strictEqual(elements.effectiveness('light', 'dark'), 1.3);
  assert.strictEqual(elements.effectiveness('dark', 'light'), 1.3);
  assert.strictEqual(elements.effectiveness('metal', 'water'), 1.0);
  assert.strictEqual(elements.effectiveness('none', 'fire'), 1.0);
});
t('中文元素名参战（怪物数据不需迁移）', () => {
  assert.strictEqual(elements.effectiveness('金', '木'), 1.3);
  assert.strictEqual(elements.effectiveness('火', '水'), 0.7);
});
t('伤害计算器接入', () => {
  const dmg = require('../src/services/battle/damage');
  const r = dmg.calculateElementDamage(1000, '金', '木');
  assert.strictEqual(r.damage, 1300);
  const r2 = dmg.calculateElementDamage(1000, '雷', '土'); // 雷→metal vs earth = 1.0
  assert.strictEqual(r2.damage, 1000);
});

console.log('== 时间引擎（D1/D5）==');
t('24h=10年 折算', () => {
  const c = { age_years: 16, time_settled_at: Date.now() };
  const { advancedYears } = gameTime.settleTime(c, Date.now() + 24 * 3600 * 1000);
  assert.ok(Math.abs(advancedYears - 10) < 0.001, `期望10年，实际${advancedYears}`);
  assert.ok(Math.abs(c.age_years - 26) < 0.001);
});
t('寿元曲线映射', () => {
  assert.strictEqual(gameTime.getLifespanBase({ realm: '凡人' }), 100);
  assert.strictEqual(gameTime.getLifespanBase({ realm: '炼气' }), 200);
  assert.strictEqual(gameTime.getLifespanBase({ realm: '渡劫' }), 1000000);
  assert.strictEqual(gameTime.getLifespanBase({ realm: '飞升' }), null);
});
t('有效寿元 = min(基础+加成-惩罚, 100万)', () => {
  assert.strictEqual(gameTime.effectiveLifespan({ realm: '炼气' }), 200);
  assert.strictEqual(gameTime.effectiveLifespan({ realm: '炼气', lifespan_bonus_years: 800 }), 1000);
  assert.strictEqual(gameTime.effectiveLifespan({ realm: '渡劫', lifespan_bonus_years: 500000 }), 1000000);
  assert.strictEqual(gameTime.effectiveLifespan({ realm: '飞升' }), null);
});
t('延寿封顶边际递减（两道闸：相对 35% 硬闸 + 绝对 100 万顶格）', () => {
  // 语义变更记录：本测试原只锁"绝对 100 万"，把 balance.LONGEVITY_BONUS_CAP_RATIO
  // 那条"累计不超过境界基础寿元 35%"的硬闸留在无人消费的状态（T0-1 一并接线）。
  // 延寿收益现走 longevity_years 桶；lifespan_bonus_years 专表境界内成长（升级），不占此闸。
  const bal = require('../src/config/balance');
  const low = { realm: '炼气', lifespan_bonus_years: 0 };
  const ceiling = Math.floor(200 * bal.LONGEVITY_BONUS_CAP_RATIO); // 70
  assert.strictEqual(gameTime.addLifespanBonus(low, 100), ceiling, '低境界一次性延寿未被 35% 闸削平');
  assert.strictEqual(low.lifespan_bonus_years, 0, '延寿误写进境界内成长桶（两桶混淆）');
  assert.strictEqual(gameTime.addLifespanBonus(low, 100000), 0, '闸未关死，仍可无限堆延寿');
  assert.strictEqual(gameTime.effectiveLifespan(low), 200 + ceiling);

  const mid = { realm: '大乘', lifespan_bonus_years: 0 };
  const midCeiling = Math.floor(300000 * bal.LONGEVITY_BONUS_CAP_RATIO); // 10.5 万
  assert.strictEqual(gameTime.addLifespanBonus(mid, midCeiling), midCeiling, '大乘延寿闸值不符');
  assert.strictEqual(gameTime.effectiveLifespan(mid), 300000 + midCeiling);
  assert.strictEqual(gameTime.addLifespanBonus(mid, 1), 0, '相对闸未关死');

  const top = { realm: '渡劫', lifespan_bonus_years: 0 };
  assert.strictEqual(gameTime.addLifespanBonus(top, 500000), 0, '顶格后仍可续，A 案 100 万上限被架空');
  assert.strictEqual(gameTime.effectiveLifespan(top), 1000000, '绝对顶格未生效（两闸须同时成立）');
});
t('境界内成长（升级）不受延寿闸影响，且两桶相加仍受绝对顶格', () => {
  const c = { realm: '筑基', lifespan_bonus_years: 400, longevity_years: 100 };
  assert.strictEqual(gameTime.effectiveLifespan(c), 500 + 400 + 100, '两桶记账口径被改动');
  const over = { realm: '凡人', lifespan_bonus_years: 2000000 };
  assert.strictEqual(gameTime.effectiveLifespan(over), 1000000, '绝对顶格丢失');
});
t('扣寿永久生效', () => {
  const c = { realm: '筑基', lifespan_bonus_years: 100 };
  const lost = gameTime.subtractLifespan(c, 50);
  assert.strictEqual(lost, 50);
  assert.strictEqual(gameTime.effectiveLifespan(c), 550); // 500+100-50
});
t('坐化转世：保留/清空/折损', () => {
  const char = {
    id: 999001, realm: '金丹', realm_stage: 2, level: 25, exp: 999,
    spirit_stone: 10000, vip_level: 3, jade: 50, reincarnation_count: 0,
    age_years: 2000, lifespan_bonus_years: 0
  };
  const db = {
    inventory: [
      { id: 1, character_id: 999001 }, { id: 2, character_id: 999001 },
      { id: 3, character_id: 999001 }, { id: 4, character_id: 888 }
    ],
    equipments: [{ id: 5, character_id: 999001 }],
    gongfa: [{ id: 6, character_id: 999001 }],
    pets: [{ id: 7, character_id: 999001 }],
    player_skills: [{ id: 8, character_id: 999001 }],
    achievements: [{ id: 9, character_id: 999001 }]
  };
  const s = gameTime.passAway(char, db);
  assert.strictEqual(char.realm, '炼气');
  assert.strictEqual(char.level, 1);
  assert.strictEqual(char.age_years, gameTime.STARTING_AGE);
  assert.strictEqual(char.reincarnation_count, 1);
  assert.strictEqual(char.spirit_stone, 3000); // 70% 折损
  assert.strictEqual(char.vip_level, 3);       // VIP 保留
  assert.strictEqual(db.equipments.length, 0); // 装备清空
  assert.strictEqual(db.gongfa.length, 0);
  assert.strictEqual(db.pets.length, 0);
  assert.strictEqual(db.player_skills.length, 0);
  assert.ok(db.inventory.some(i => i.id === 4)); // 他人物品不受影响
  assert.ok(db.inventory.filter(i => i.character_id === 999001).length <= 3); // 50% 折损
  assert.ok(s.retained.length > 0 && s.lost.length > 0);
  gameTime.passAway && store.queryRel('lifespan_events', { character_id: 999001 }, 'id');
});
t('shouldPassAway 判定', () => {
  assert.strictEqual(gameTime.shouldPassAway({ realm: '炼气', age_years: 200 }), true);
  assert.strictEqual(gameTime.shouldPassAway({ realm: '炼气', age_years: 199 }), false);
  assert.strictEqual(gameTime.shouldPassAway({ realm: '飞升', age_years: 99999999 }), false);
});

console.log('== 伤势系统（D5）==');
t('积累：挂机手动同系数 / PVP×2 / 上限100', () => {
  const c = { injury: 0, max_hp: 1000 };
  injury.accumulate(c, 100, 1000, false); // 10
  injury.accumulate(c, 100, 1000, true);  // 20
  assert.ok(Math.abs(c.injury - 30) < 0.001);
  injury.accumulate(c, 99999, 1000, true);
  assert.strictEqual(c.injury, 100);
});
t('debuff 阶梯 30/60/100', () => {
  assert.deepStrictEqual(injury.getDebuffs({ injury: 10 }), { combatMultiplier: 1.0, cultivateMultiplier: 1.0, heavy: false });
  assert.deepStrictEqual(injury.getDebuffs({ injury: 40 }), { combatMultiplier: 0.95, cultivateMultiplier: 1.0, heavy: false });
  assert.deepStrictEqual(injury.getDebuffs({ injury: 70 }), { combatMultiplier: 0.85, cultivateMultiplier: 0.9, heavy: false });
  const h = injury.getDebuffs({ injury: 100 });
  assert.strictEqual(h.combatMultiplier, 0.7);
  assert.strictEqual(h.cultivateMultiplier, 0.7);
  assert.strictEqual(h.heavy, true);
});
t('重伤扣寿：战败2% 濒死1%', () => {
  const c1 = { id: 999002, realm: '金丹', age_years: 100 }; // cap 1500
  const r1 = injury.triggerHeavyInjury(c1, 'defeat');
  assert.ok(Math.abs(r1.lostYears - 30) < 1, `期望≈30，实际${r1.lostYears}`);
  const c2 = { id: 999003, realm: '金丹', age_years: 100 };
  const r2 = injury.triggerHeavyInjury(c2, 'nearDeath');
  assert.ok(Math.abs(r2.lostYears - 15) < 1, `期望≈15，实际${r2.lostYears}`);
  assert.strictEqual(c2.injury, 100);
  assert.strictEqual(c2.injury_status, '重伤');
});
t('自动调息：阈值判定 + 每游戏日-20 洞府×2', () => {
  assert.strictEqual(injury.shouldAutoMeditate({ injury: 79, auto_meditate: true }), false);
  assert.strictEqual(injury.shouldAutoMeditate({ injury: 80, auto_meditate: true }), true);
  assert.strictEqual(injury.shouldAutoMeditate({ injury: 99, auto_meditate: false }), false);
  const c = { injury: 60, auto_meditate: true };
  const rec = injury.meditateRecover(c, 2.4, false); // 1游戏日
  assert.ok(Math.abs(rec - 20) < 0.001, `期望20，实际${rec}`);
  const c2 = { injury: 60 };
  const rec2 = injury.meditateRecover(c2, 2.4, true); // 洞府
  assert.ok(Math.abs(rec2 - 40) < 0.001);
});
t('疗伤丹全清', () => {
  const c = { injury: 100, injury_status: '重伤' };
  injury.fullHeal(c);
  assert.strictEqual(c.injury, 0);
  assert.strictEqual(c.injury_status, 'none');
});

console.log('== 清理测试编年史 ==');
try {
  const sqlite = require('node:sqlite');
  const db = new sqlite.DatabaseSync('data/game.db');
  db.prepare('DELETE FROM lifespan_events WHERE character_id IN (999001,999002,999003)').run();
  db.close();
  console.log('  ✅ 测试数据已清理');
} catch (e) { console.log(`  ⚠️ ${e.message}`); }

console.log(`\n单元测试: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
