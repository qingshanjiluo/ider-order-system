/**
 * 装备图鉴（内容富集七期）
 * 六部位 × 八品阶 × 多器型变体 = 96 件装备，数值随品阶单调递增，境界门槛成阶梯。
 * 部位（canonical subtype）：weapon/armor/helmet/gloves/shoes/accessory
 */

const QUALITY_LADDER = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器'];
const REALM_BY_QUALITY = ['炼气', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '大乘'];

const SLOTS = {
  weapon: { label: '兵器', names: ['铁剑', '精钢剑', '流光剑', '紫霄剑', '斩龙剑', '太虚剑', '混元剑', '诛仙剑'], main: 'attack' },
  armor: { label: '护甲', names: ['布甲', '皮甲', '玄铁甲', '锁子甲', '龙鳞甲', '玄武甲', '太乙甲', '仙灵甲'], main: 'defense' },
  helmet: { label: '头盔', names: ['布巾', '皮盔', '铁盔', '玄铁盔', '蛟龙盔', '玄武冠', '太虚冠', '仙灵冠'], main: 'hp' },
  gloves: { label: '护手', names: ['布手套', '皮护手', '铁护手', '玄铁护手', '蛟鳞护手', '玄武护腕', '太虚护腕', '仙灵护腕'], main: 'attack' },
  shoes: { label: '战靴', names: ['草鞋', '皮靴', '铁靴', '疾风靴', '踏云靴', '凌虚靴', '太虚履', '仙灵履'], main: 'speed' },
  accessory: { label: '饰品', names: ['木珠', '玉坠', '灵玉坠', '玄铁符', '龙纹佩', '玄武印', '太虚令', '仙灵佩'], main: 'hp' }
};

// 同名变体（丰富器型选择）：每品阶主器型外再给 2 个变体名
const VARIANTS = {
  weapon: ['长枪', '宝刀', '飞剑', '折扇'],
  armor: ['战袍', '软甲', '法衣'],
  helmet: ['发冠', '面具'],
  gloves: ['拳套', '臂环'],
  shoes: ['云履', '战靴'],
  accessory: ['戒指', '项链', '灵珠']
};

const VARIANT_PREFIX = ['赤炎', '寒霜', '青木', '厚土', '锐金', '圣辉', '幽冥'];

function statsFor(slot, qualityIdx, varIdx) {
  const s = { attack: 0, defense: 0, hp: 0, speed: 0 };
  const mul = 1 + qualityIdx * 0.85;
  const slotStats = {
    weapon: { attack: 8 * mul, speed: 1 * mul },
    armor: { defense: 6 * mul, hp: 25 * mul },
    helmet: { hp: 18 * mul, defense: 3 * mul },
    gloves: { attack: 4 * mul, defense: 2 * mul },
    shoes: { speed: 4 * mul, defense: 1 * mul },
    accessory: { hp: 15 * mul, attack: 2 * mul }
  };
  for (const [k, v] of Object.entries(slotStats[slot])) s[k] = Math.floor(v * (1 + varIdx * 0.08));
  return s;
}

function buildEquipment() {
  const out = [];
  for (const [slot, def] of Object.entries(SLOTS)) {
    QUALITY_LADDER.forEach((quality, qi) => {
      // 主器型
      out.push({
        name: def.names[qi],
        type: '装备', subtype: slot, quality,
        realm: REALM_BY_QUALITY[qi],
        stats: statsFor(slot, qi, 0),
        desc: `${quality}${def.label}，${REALM_BY_QUALITY[qi]}修士可用`
      });
      // 变体器型（取两种前缀轮转）
      for (let v = 0; v < 2; v++) {
        const variant = VARIANTS[slot][(qi + v) % VARIANTS[slot].length];
        const prefix = VARIANT_PREFIX[(qi + v) % VARIANT_PREFIX.length];
        out.push({
          name: `${prefix}${variant}·${quality}`,
          type: '装备', subtype: slot, quality,
          realm: REALM_BY_QUALITY[qi],
          stats: statsFor(slot, qi, v + 1),
          desc: `${prefix}${variant}，${quality}${def.label}`
        });
      }
    });
  }
  return out;
}

const EQUIPMENT_LIBRARY = buildEquipment();

/** 低阶装备上架坊市（凡器→灵器），高阶走锻造/掉落 */
const EQUIPMENT_SHOP = {
  凡器: 200, 法器: 800, 灵器: 3000
};

module.exports = { EQUIPMENT_LIBRARY, EQUIPMENT_SHOP, QUALITY_LADDER, REALM_BY_QUALITY, SLOTS };
