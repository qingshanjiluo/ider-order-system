/**
 * P7 内容投产（轮103）：把"有档位没内容"的空洞补上
 *
 * 审计发现的三个真断点（scripts/audit-gameplay.js 可复现）：
 *   ① 12 张地图 Lv8~94 连续成带，却一只怪都没有 —— 玩家点进去只有空列表；
 *   ② 6 项材料既无获取途径也不被任何配方引用 —— 数据里的死物；
 *   ③ 222 件装备/法器/符箓/阵法的获取途径未覆盖（本轮先补材料，装备走下一轮配方）。
 *
 * 纪律：
 *   - 幂等：靠 name+map_id 去重，重复跑不会翻倍；
 *   - 不改已有怪物（只新增），不动既有数值；
 *   - 只写 12 张空地图 + 6 项死材料的挂点，范围可控、可回滚（git 管 data/game.db 的种子部分）。
 *
 * 用法：node scripts/seed-content.js [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase, getNextId } = require(path.join(ROOT, 'src', 'database'));

/**
 * 取下一个可用 id。
 * ⚠ 血泪教训（轮103）：getNextId 只接**一个**参数（集合名），
 *   写成 getNextId(db, 'monsters') 时第一个参数成了 db 对象 → 返回 1 →
 *   新增的 48 只怪从 id=1 开始，把灵兔/竹妖/火焰蜥蜴王等 23 只原有怪全顶掉了。
 *   所以这里自己按"当前最大 id + 1"取，并且在插入前查重（双保险）。
 */
function nextId(table) {
  const rows = db[table] || [];
  let max = 0;
  for (const r of rows) { const n = Number(r.id); if (Number.isFinite(n) && n > max) max = n; }
  return max + 1;
}

/** 12 张空地图 × 每图 4 只怪：档位严格对齐地图 min/max_level，元素贴合地图主题 */
const MAP_MONSTERS = {
  21: { name: '黄土坡', el: '土', list: [
    // 轮103 回调：初版 hp 180~300 违反「池内最硬 ≤ 中位 2 倍」（炼气池中位 86 → 上限 172），
    // 原因是照地图档位 Lv8-16 配了后期血量，但炼气池里最硬的原有怪才 137。
    // 这里贴齐炼气池实际口径（Lv8-16 落 120~165），保持"比青云山麓强、但不越池"的手感。
    { name: '黄土石魈', lv: [8, 12], hp: 122, atk: 16, def: 9, spd: 11, drops: ['火灵草'] },
    { name: '坡地沙狼', lv: [10, 14], hp: 132, atk: 19, def: 8, spd: 15, drops: [] },
    { name: '旱魃幼体', lv: [12, 15], hp: 148, atk: 22, def: 12, spd: 10, drops: ['精铁矿'] },
    { name: '裂地岩龟', lv: [14, 16], hp: 165, atk: 20, def: 20, spd: 6, drops: [] }
  ] },
  22: { name: '药王谷', el: '木', list: [
    { name: '药圃守灵', lv: [15, 18], hp: 260, atk: 24, def: 14, spd: 12, drops: ['灵草', '火灵草'] },
    { name: '缠魂藤妖', lv: [17, 21], hp: 285, atk: 27, def: 13, spd: 13, drops: ['灵草'] },
    { name: '采药傀', lv: [19, 23], hp: 320, atk: 30, def: 18, spd: 11, drops: ['火灵草'] },
    { name: '千年药灵', lv: [22, 24], hp: 400, atk: 33, def: 22, spd: 14, drops: ['千年灵芝', '灵草'] }
  ] },
  23: { name: '幽冥旧道', el: '暗', list: [
    { name: '旧道游魂', lv: [15, 19], hp: 250, atk: 26, def: 11, spd: 16, drops: [] },
    { name: '引路鬼差', lv: [18, 22], hp: 300, atk: 29, def: 15, spd: 14, drops: ['九转还魂草'] },
    { name: '无面行者', lv: [20, 23], hp: 340, atk: 32, def: 17, spd: 15, drops: [] },
    { name: '旧道守关鬼将', lv: [22, 24], hp: 450, atk: 36, def: 24, spd: 13, drops: ['九转还魂草'] }
  ] },
  24: { name: '剑冢', el: '土', list: [
    { name: '残剑剑灵', lv: [20, 23], hp: 330, atk: 34, def: 16, spd: 18, drops: [] },
    { name: '锈剑傀儡', lv: [22, 25], hp: 380, atk: 36, def: 22, spd: 12, drops: ['玄铁矿'] },
    { name: '剑冢守墓人', lv: [24, 26], hp: 420, atk: 40, def: 20, spd: 15, drops: [] },
    { name: '万剑归宗灵', lv: [25, 26], hp: 520, atk: 46, def: 26, spd: 20, drops: ['天外陨铁'] }
  ] },
  25: { name: '赤霞洞', el: '火', list: [
    { name: '赤霞火蝠', lv: [26, 30], hp: 440, atk: 44, def: 20, spd: 22, drops: [] },
    { name: '熔岩蛛', lv: [29, 33], hp: 500, atk: 48, def: 26, spd: 17, drops: ['火铜'] },
    { name: '赤霞洞主', lv: [32, 36], hp: 620, atk: 54, def: 30, spd: 19, drops: ['火铜', '火灵草'] },
    { name: '烈焰麒麟兽', lv: [35, 38], hp: 750, atk: 62, def: 34, spd: 23, drops: ['龙血矿'] }
  ] },
  26: { name: '玄武寒潭', el: '冰', list: [
    { name: '寒潭水鬼', lv: [35, 39], hp: 560, atk: 52, def: 28, spd: 18, drops: ['万年寒潭水'] },
    { name: '玄冰龟', lv: [38, 41], hp: 700, atk: 50, def: 40, spd: 10, drops: [] },
    { name: '寒潭蛟', lv: [40, 43], hp: 680, atk: 62, def: 32, spd: 24, drops: ['龙涎香'] },
    { name: '玄武残魂', lv: [42, 44], hp: 900, atk: 68, def: 44, spd: 16, drops: ['万年寒潭水', '冰晶石'] }
  ] },
  27: { name: '雷鸣泽渊', el: '雷', list: [
    { name: '泽渊雷蛙', lv: [41, 45], hp: 660, atk: 64, def: 30, spd: 22, drops: ['雷灵草'] },
    { name: '引雷藤', lv: [44, 47], hp: 720, atk: 66, def: 36, spd: 16, drops: ['雷灵草'] },
    { name: '雷泽蛟龙', lv: [46, 49], hp: 850, atk: 76, def: 38, spd: 25, drops: ['雷银'] },
    { name: '雷渊主宰', lv: [48, 50], hp: 1050, atk: 86, def: 46, spd: 28, drops: ['雷银', '雷灵草'] }
  ] },
  28: { name: '金光塔', el: '光', list: [
    { name: '金光守卫', lv: [55, 58], hp: 980, atk: 92, def: 52, spd: 24, drops: [] },
    { name: '塔层执法者', lv: [57, 60], hp: 1080, atk: 98, def: 56, spd: 26, drops: ['仙灵结晶'] },
    { name: '金光法相', lv: [59, 62], hp: 1200, atk: 106, def: 62, spd: 25, drops: [] },
    { name: '塔主金身', lv: [62, 64], hp: 1450, atk: 118, def: 72, spd: 27, drops: ['仙灵结晶', '星辰锭'] }
  ] },
  29: { name: '五行轮台', el: '五行', list: [
    { name: '金行傀儡', lv: [60, 63], hp: 1150, atk: 108, def: 66, spd: 22, drops: ['星辰锭'] },
    { name: '木行藤君', lv: [61, 64], hp: 1250, atk: 104, def: 60, spd: 24, drops: [] },
    { name: '水行渊灵', lv: [62, 65], hp: 1300, atk: 112, def: 64, spd: 26, drops: ['地髓乳'] },
    { name: '五行轮转使', lv: [64, 66], hp: 1600, atk: 126, def: 78, spd: 28, drops: ['混沌土', '地髓乳'] }
  ] },
  30: { name: '星宫遗墟', el: '混沌', list: [
    { name: '星宫残卫', lv: [65, 68], hp: 1420, atk: 124, def: 70, spd: 26, drops: [] },
    { name: '陨星游魂', lv: [67, 70], hp: 1520, atk: 132, def: 74, spd: 30, drops: ['天外陨铁', '混沌土'] },
    { name: '遗墟星兽', lv: [69, 72], hp: 1680, atk: 140, def: 80, spd: 28, drops: ['混沌矿'] },
    { name: '星宫之主残念', lv: [72, 74], hp: 2000, atk: 156, def: 92, spd: 32, drops: ['混沌土', '混沌矿'] }
  ] },
  31: { name: '仙人跳涧', el: '仙', list: [
    { name: '跳涧仙鹤', lv: [80, 83], hp: 2100, atk: 168, def: 96, spd: 36, drops: [] },
    { name: '守涧仙童', lv: [82, 85], hp: 2250, atk: 176, def: 102, spd: 34, drops: ['仙晶矿'] },
    { name: '涧底仙人遗蜕', lv: [84, 88], hp: 2500, atk: 188, def: 112, spd: 32, drops: ['仙晶矿', '仙灵草'] },
    { name: '涧主仙影', lv: [86, 90], hp: 2900, atk: 205, def: 126, spd: 38, drops: ['仙灵草', '龙涎香'] }
  ] },
  32: { name: '无相幻境', el: '无', list: [
    { name: '幻境镜像', lv: [85, 88], hp: 2400, atk: 190, def: 108, spd: 36, drops: [] },
    { name: '无相心魔', lv: [87, 90], hp: 2600, atk: 200, def: 116, spd: 40, drops: ['地髓乳'] },
    { name: '幻境执念体', lv: [89, 92], hp: 2850, atk: 212, def: 124, spd: 38, drops: [] },
    { name: '无相幻主', lv: [91, 94], hp: 3400, atk: 232, def: 140, spd: 42, drops: ['混沌土', '仙灵结晶'] }
  ] }
};

/** 6 项死材料的挂点：让它们至少有一条稳定获取途径（怪已在上面的 drops 里） */
const DEAD_MATERIAL_FALLBACK = {
  '火灵草': { shopPrice: 180, note: '黄土坡/药王谷/赤霞洞 掉落，坊市亦有售' },
  '雷灵草': { shopPrice: 1400, note: '雷鸣泽渊 掉落' },
  '龙涎香': { shopPrice: 6200, note: '玄武寒潭/仙人跳涧 掉落' },
  '万年寒潭水': { shopPrice: 7200, note: '玄武寒潭 掉落' },
  '地髓乳': { shopPrice: 11000, note: '五行轮台/无相幻境 掉落' },
  '混沌土': { shopPrice: 13000, note: '五行轮台/星宫遗墟/无相幻境 掉落' }
};

const db = loadDatabase();
const items = db.items || [];
const nameToItem = new Map(items.map((i) => [i.name, i]));
const existing = new Set((db.monsters || []).map((m) => `${m.map_id}:${m.name}`));

/**
 * 池水位：取"该等级所属境界池"现有怪的中位 hp。
 *
 * ⚠ 血泪教训（轮103 第三轮）：新怪血量若照等级线性推算，会与**境界池标尺**脱节 ——
 *   地图档位（Lv60-66）与境界池（合体 Lv61-70）不是同一把尺，
 *   结果新怪血量偏低，涌进池子后把中位拉低，触发「池内最硬 ≤ 中位 2 倍」失守
 *   （合体 1.60→2.46、大乘 1.60→2.67、渡劫 1.60→4.10）。
 *   正确做法：先看这个等级落在哪个池、该池现在的中位是多少，新怪血量就照这个水位配。
 */
function poolMedianHp(level) {
  const realms = db.realms || [];
  const rr = realms.find((x) => level >= Number(x.min_level) && level <= Number(x.max_level));
  if (!rr) return null;
  const hps = [];
  for (const m of (db.monsters || [])) {
    let r = m.level_range;
    if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
    if (!Array.isArray(r)) continue;
    const mid = (Number(r[0]) + Number(r[1])) / 2;
    if (mid < Number(rr.min_level) || mid > Number(rr.max_level)) continue;
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    const hp = Number(st.hp);
    if (hp > 0) hps.push(hp);
  }
  if (!hps.length) return null;
  hps.sort((a, b) => a - b);
  return hps[Math.floor(hps.length / 2)];
}

let addedMonsters = 0, addedShops = 0, skipped = 0;
const dropsWired = new Set();

for (const [mapId, cfg] of Object.entries(MAP_MONSTERS)) {
  for (const mo of cfg.list) {
    const key = `${mapId}:${mo.name}`;
    if (existing.has(key)) { skipped++; continue; }
    const drops = mo.drops.map((nm) => {
      const it = nameToItem.get(nm);
      if (!it) { console.log(`  ⚠ 掉落物「${nm}」不存在于 items，跳过该条`); return null; }
      dropsWired.add(nm);
      return { item_id: Number(it.id), name: nm, chance: 0.18, min: 1, max: 1 };
    }).filter(Boolean);
    if (!DRY) {
      const id = nextId('monsters');
      // 双保险：该 id 不该已存在（若存在说明 nextId 被误用，宁可报错也不覆盖）
      if ((db.monsters || []).some((x) => Number(x.id) === id)) {
        console.log(`  ❌ id ${id} 已被占用，拒绝覆盖（请检查 nextId 实现）`);
        process.exitCode = 1;
        continue;
      }
      // 血量按"**该图最高等级**所属池的水位"校准。
      // ⚠ 轮103 第三轮修正（两次）：
      //   ① 初版"全图最小值对齐池中位、其余按配置比例放大" → 跨池图被拉出 1200~12389 的离谱跨度；
      //   ② 改"每只怪各自按自己等级的池配" → 又出现同图内 1680 vs 7926（4.7 倍）的断层，
      //      因为一张图跨两个池（金光塔 Lv55-64 跨炼虚/合体、星宫遗墟 Lv65-74 跨合体/大乘）。
      //   最终锚：**以该图最高等级所在池的中位为准**，图内各怪按配置形状在 0.8~1.15 之间微调。
      //   这样①同图怪不脱节；②整图跟着它该在的高池走（不会拖低高档池的中位）。
      const topLv = Math.max(...cfg.list.map((x) => (x.lv[0] + x.lv[1]) / 2));
      const medHp = poolMedianHp(topLv) || poolMedianHp((mo.lv[0] + mo.lv[1]) / 2);
      const base = Math.min(...cfg.list.map((x) => x.hp));
      const shape = base > 0 ? mo.hp / base : 1;               // 图内相对强弱（1.0 = 最弱）
      const shaped = 0.80 + 0.35 * Math.min(1, Math.max(0, shape - 1) / 1.6);  // 压到 0.80~1.15
      const hp = medHp ? Math.round(medHp * shaped) : Math.round(mo.hp);
      const refAtk = Math.min(...cfg.list.map((x) => x.atk)) || 1;
      const atkShape = mo.atk / refAtk;
      const atk = Math.round((medHp ? Math.sqrt(medHp) * 1.6 : mo.atk) * Math.min(1.5, atkShape));
      const def = Math.round((medHp ? Math.sqrt(medHp) * 0.9 : mo.def) * Math.min(1.5, atkShape));
      db.monsters.push({
        id,
        name: mo.name,
        map_id: Number(mapId),
        level_range: mo.lv,
        element: cfg.el,
        stats: JSON.stringify({ hp, attack: atk, defense: def, speed: mo.spd }),
        drops: JSON.stringify(drops),
        exp_reward: Math.round(hp * 0.22),
        stone_reward: Math.round(hp * 0.06),
        is_boss: mo.name.includes('主') || mo.name.includes('主宰') || mo.name.includes('残念') ? 1 : 0
      });
    }
    addedMonsters++;
  }
}

// 死材料兜底：给坊市一条明路（价格对齐同品质档位）
const shopItemIds = new Set((db.shop || []).map((s) => Number(s.item_id)));
for (const [nm, cfg] of Object.entries(DEAD_MATERIAL_FALLBACK)) {
  const it = nameToItem.get(nm);
  if (!it) { console.log(`  ⚠ 兜底材料「${nm}」不存在，跳过`); continue; }
  if (shopItemIds.has(Number(it.id))) continue;
  if (!DRY) {
    const sid = nextId('shop');
    if ((db.shop || []).some((x) => Number(x.id) === sid)) {
      console.log(`  ❌ 坊市 id ${sid} 已被占用，拒绝覆盖`);
      process.exitCode = 1;
      continue;
    }
    db.shop.push({
      id: sid,
      item_id: Number(it.id),
      price: cfg.shopPrice,
      stock: 999,
      description: cfg.note
    });
  }
  addedShops++;
  console.log(`  ＋ 坊市上架 ${nm} @${cfg.shopPrice}`);
}

if (!DRY) saveDatabase(db);

console.log(`\n${DRY ? '[演练] ' : ''}新增怪物 ${addedMonsters} 只（跳过已存在 ${skipped}），坊市上架 ${addedShops} 项`);
console.log(`挂上的掉落物：${[...dropsWired].join('、') || '（无）'}`);
console.log(`\n复跑审计：node scripts/audit-gameplay.js`);
