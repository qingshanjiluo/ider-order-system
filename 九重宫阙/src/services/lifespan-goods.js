/**
 * 延寿货品通道（轮55 · 补上线必修「延寿通道玩家可获得 0/3」）
 *
 * 背景：`balance.LIFE_GAIN` 早就写好了四档延寿丹 / 三件灵植（含 ratio 与 perLife）/ 宗门赏赐 / 长生功，
 * `gameTime` 也早就有**受 35% 硬闸的延寿写入器** `addLifespanBonus()`（走 `longevity_years` 桶，
 * 与"升级带来的境界内成长" `lifespan_bonus_years` 分账）—— 但全仓只有一个调用者：T0-1 应劫续命。
 * 也就是说铁律(2)「元婴之后必须经营寿元」在纸面上成立，玩家手上却**一条延寿通道都没有**（E9 实测 0/3）。
 *
 * 本模块只做"策略"：哪个货品值多少、本世还能用几次、要不要拒绝。
 * **任何寿元算术都不在这里发生** —— 一律委托 `gameTime.addLifespanBonus`，
 * 保持"延寿闸只有 gameTime 一处实现"（不变量：不新增第二处寿元判定）。
 */
const B = require('../config/balance');
const gameTime = require('./gameTime');

function safeStats(item) {
  try { return JSON.parse((item && item.stats) || '{}') || {}; } catch (_) { return {}; }
}

/**
 * 这件道具是不是延寿货品？是则给出 {key, ratio, perLife}。
 *  ① 灵植：按名字命中 `LIFE_GAIN.plants`（配置里就是按名字写的，perLife 也在里面）
 *  ② 丹药/其它：`item.stats.longevity_ratio`（>0 即延寿，无 perLife 限制；由 P1 补定义时写入 stats，
 *     避免"档位"再抄一份进代码 —— LIFE_GAIN.pills 是四个无名比例，等做出实名道具再接）
 * 认不出就是"不是延寿货品"，绝不去猜。
 */
function resolveLifespanGood(item) {
  if (!item) return null;
  const plants = B.LIFE_GAIN && B.LIFE_GAIN.plants ? B.LIFE_GAIN.plants : {};
  const p = plants[item.name];
  if (p && Number(p.ratio) > 0) {
    return { key: `plant:${item.name}`, name: item.name, ratio: Number(p.ratio), perLife: Number(p.perLife) || 0 };
  }
  const st = safeStats(item);
  const r = Number(st.longevity_ratio);
  if (r > 0) {
    return { key: `pill:${item.id}`, name: item.name, ratio: r, perLife: Number(st.longevity_per_life) || 0 };
  }
  return null;
}

function usedThisLife(character, good) {
  const g = character && character.longevity_grants;
  return (g && Number(g[good.key])) || 0;
}

/** 只读预检：给前端把按钮点亮/置灰用，不改任何状态。 */
function inspect(character, good) {
  const base = gameTime.getLifespanBase(character) || 0;
  const ceiling = gameTime.longevityCeiling(base);
  const cur = character.longevity_years || 0;
  const room = Math.max(0, ceiling - cur);
  const wouldGain = Math.floor(base * good.ratio);
  const left = good.perLife > 0 ? Math.max(0, good.perLife - usedThisLife(character, good)) : Infinity;
  let reason = null;
  if (gameTime.isAscended(character)) reason = '已超脱寿数，无需延寿';
  else if (left === 0) reason = `本世已用满 ${good.perLife} 次`;
  else if (room <= 0) reason = `延寿已达本境界上限（${ceiling} 年 / 基础 ${base} 年的 ${(B.LONGEVITY_BONUS_CAP_RATIO * 100).toFixed(0)}%）`;
  return { good, base, ceiling, room, wouldGain, left, ok: reason === null, reason };
}

/**
 * 服用/使用。**先判定后扣减**：被拒时物品不损耗（否则玩家为一次"系统拒绝"白丢道具）。
 * 返回 { ok, gained, reason, ...inspect 字段 }；调用方（路由）负责扣背包并 saveDatabase。
 */
function use(character, good) {
  const info = inspect(character, good);
  if (!info.ok) return info;
  const gained = gameTime.addLifespanBonus(character, info.wouldGain);
  if (!(gained > 0)) {
    // 理论上被 inspect 拦住了；真发生说明两处口径不一致，宁可判错也不白扣玩家道具
    return Object.assign(info, { ok: false, reason: '延寿未生效（闸口已关）', rolledBack: true });
  }
  if (!character.longevity_grants || typeof character.longevity_grants !== 'object') character.longevity_grants = {};
  character.longevity_grants[good.key] = usedThisLife(character, good) + 1;
  try {
    gameTime.logEvent(character, 'longevity', '延寿',
      `${good.name}：+${gained} 年（本世第 ${character.longevity_grants[good.key]}${good.perLife > 0 ? '/' + good.perLife : ''} 次）`);
  } catch (_) { /* 纪事失败不阻断收益 */ }
  return Object.assign(info, { gained });
}

module.exports = { resolveLifespanGood, inspect, use, usedThisLife };
