const { ref, computed } = Vue;
import api from './api.js?v=20260821a';
import { getRealm, getRealmStage } from './appShared.js?v=20260821a';

let _p = null;
let _showToast = () => {};

async function safe(fn) {
  try { return await fn(); } catch (e) { _showToast(e.message || '操作失败'); return null; }
}

export function initCultivation(ctx) {
  if (ctx?.showToast) _showToast = ctx.showToast;
}

function p() { return _p || {}; }
function pnum(k) { return Number(p()[k]) || 0; }

const BREAKTHROUGH_NODES = [
  [120, 121, '筑基', 0.20, 'foundation', '筑基丹'],
  [136, 137, '结丹', 0.16, 'yunling', '蕴灵丹'],
  [152, 153, '元婴', 0.14, 'yuanying', '元婴育神丹'],
  [168, 169, '化神', 0.12, 'huashen', '化神淬体丹'],
  [184, 185, '炼虚', 0.10, 'lianxu', '炼虚合道丹'],
  [200, 201, '合体', 0.08, 'heti', '合体归元丹'],
  [216, 217, '大乘', 0.06, 'dacheng', '大乘渡劫丹'],
  [232, 233, '真仙', 0.05, 'zhenxian', '飞升接引丹'],
  [248, 249, '金仙', 0.04, 'jinxian', '金仙证道丹'],
  [264, 265, '太乙', 0.03, 'taiyi', '太乙归元丹'],
  [280, 281, '大罗', 0.02, 'daluo', '大罗混元丹'],
  [296, 297, '道祖', 0.01, 'daozu', '道祖证道丹'],
];

const PILL_CFG = {
  foundation: ['breakthrough_foundation_pills_stored', 5, 0.20],
  yunling:    ['breakthrough_yunling_stored', 4, 0.20],
  yuanying:   ['breakthrough_yuanying_stored', 3, 0.20],
  huashen:    ['breakthrough_huashen_stored', 3, 0.20],
  lianxu:     ['breakthrough_lianxu_stored', 3, 0.20],
  heti:       ['breakthrough_heti_stored', 3, 0.20],
  dacheng:    ['breakthrough_dacheng_stored', 2, 0.25],
  zhenxian:   ['breakthrough_zhenxian_stored', 2, 0.25],
  jinxian:    ['breakthrough_jinxian_stored', 2, 0.25],
  taiyi:      ['breakthrough_taiyi_stored', 1, 0.30],
  daluo:      ['breakthrough_daluo_stored', 1, 0.30],
  daozu:      ['breakthrough_daozu_stored', 1, 0.30],
};

const SPIRIT_ROOT_ELEMENTS = ['金', '木', '水', '火', '土', '暗', '雷'];
const SPIRIT_ROOT_QUALITY = {
  tian: { name: '天灵根', bonus: 0.15, color: '#ffd700' },
  variant: { name: '变异灵根', bonus: 0.20, color: '#ff6aff' },
  zhen: { name: '真灵根', bonus: 0.05, color: '#4af' },
  wei: { name: '伪灵根', bonus: -0.05, color: '#888' },
};

const SIX_KEYS = ['strength', 'constitution', 'bone', 'agility', 'zhenyuan', 'lingli'];
const SIX_NAMES = { strength: '力量', constitution: '体质', bone: '根骨', agility: '敏捷', zhenyuan: '真元', lingli: '灵力' };

function getExpNeeded(level) {
  return Math.floor(20 + level * level * 0.5 + level * 8);
}

function formatRate(v) {
  const n = Number(v || 0) * 100;
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(1).replace(/\.0$/, '')}%`;
}

function fmtBuffExpires(ts) {
  if (!ts) return '无';
  const ms = Number(ts) * 1000 - Date.now();
  if (ms <= 0) return '已过期';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}小时${m}分钟` : `${m}分钟`;
}

export function useCultivation(playerRef) {
  _p = playerRef;

  const subTab = ref('cultivate');
  const loading = ref(false);

  const level = computed(() => pnum('level') || 1);
  const exp = computed(() => pnum('exp') || 0);
  const expNeeded = computed(() => getExpNeeded(level.value));
  const expPercent = computed(() => Math.min(100, Math.floor(exp.value / Math.max(1, expNeeded.value) * 100)));
  const realm = computed(() => getRealm(level.value));
  const stage = computed(() => getRealmStage(level.value));

  const isBreakthroughLevel = computed(() => {
    return BREAKTHROUGH_NODES.some(n => n[0] === level.value);
  });

  const currentBreakthroughNode = computed(() => {
    return BREAKTHROUGH_NODES.find(n => n[0] === level.value) || null;
  });

  const breakthroughRate = computed(() => {
    const node = currentBreakthroughNode.value;
    if (!node) return { rate: 0, parts: [], pills: {} };
    const [, , , baseRate, pillKey, pillLabel] = node;
    let rate = baseRate;
    const parts = [`基础 ${formatRate(baseRate)}`];
    const pc = PILL_CFG[pillKey];
    const pills = {};
    if (pc) {
      const [field, cap, perPill] = pc;
      const stored = Math.min(cap, pnum(field));
      const pillBonus = stored * perPill;
      rate += pillBonus;
      pills.key = pillKey;
      pills.label = pillLabel;
      pills.stored = stored;
      pills.cap = cap;
      pills.bonus = pillBonus;
      parts.push(`${pillLabel} ${stored}/${cap} (+${formatRate(pillBonus)})`);
    }
    const sq = String(p().spirit_root_quality || 'zhen');
    const sqInfo = SPIRIT_ROOT_QUALITY[sq] || SPIRIT_ROOT_QUALITY.zhen;
    rate += sqInfo.bonus;
    parts.push(`${sqInfo.name} (${sqInfo.bonus >= 0 ? '+' : ''}${formatRate(sqInfo.bonus)})`);
    const oa = p().original_base_attributes || {};
    let sixSum = 0;
    for (const k of SIX_KEYS) sixSum += Number(oa[k] ?? p()[k]) || 0;
    const threshold = level.value * 12;
    const sixBonus = sixSum > threshold ? Math.min(0.25, (sixSum - threshold) / (threshold * 3)) : 0;
    rate += sixBonus;
    parts.push(`六维 ${sixSum} ${sixBonus > 0 ? '(+' + formatRate(sixBonus) + ')' : '(需>' + threshold + ')'}`);
    rate = Math.min(rate, 1);
    return { rate, parts, pills };
  });

  const breakthroughInfo = computed(() => {
    const node = currentBreakthroughNode.value;
    if (!node) return null;
    const [, toLevel, realmName] = node;
    return {
      fromLevel: level.value,
      toLevel,
      realmName,
      rate: breakthroughRate.value.rate,
      parts: breakthroughRate.value.parts,
      pills: breakthroughRate.value.pills,
    };
  });

  const nextBreakthrough = computed(() => {
    const node = BREAKTHROUGH_NODES.find(n => n[0] > level.value);
    if (!node) return null;
    const [, toLevel, realmName, baseRate, pillKey, pillLabel] = node;
    const pc = PILL_CFG[pillKey];
    let stored = 0, cap = 0;
    if (pc) {
      cap = pc[1];
      stored = Math.min(cap, pnum(pc[0]));
    }
    return { toLevel, realmName, baseRate, pillKey, pillLabel, stored, cap };
  });

  const spiritRootQuality = computed(() => {
    const q = String(p().spirit_root_quality || 'zhen');
    return SPIRIT_ROOT_QUALITY[q] || SPIRIT_ROOT_QUALITY.zhen;
  });

  const spiritRootElement = computed(() => {
    const elem = p().spirit_root_element || p().spirit_root_type || '';
    return typeof elem === 'string' ? elem : '';
  });

  const spiritRootVariant = computed(() => {
    return p().spirit_root_variant || p().spirit_root_name || '';
  });

  const sixStats = computed(() => {
    const oa = p().original_base_attributes || {};
    return SIX_KEYS.map(k => ({
      key: k,
      name: SIX_NAMES[k],
      value: Number(oa[k] ?? p()[k]) || 0,
    }));
  });

  const sixSum = computed(() => sixStats.value.reduce((s, item) => s + item.value, 0));

  const destinyPoints = computed(() => {
    return {
      available: Number(p().destiny?.available_points ?? p().talents?.available_points ?? 0) || 0,
      earned: Number(p().destiny?.points_earned ?? p().talents?.points_earned ?? 0) || 0,
      spent: Number(p().destiny?.points_spent ?? p().talents?.points_spent ?? 0) || 0,
    };
  });

  const activeBuffs = computed(() => {
    const buffs = [];
    if (p().enlightenment_buff_expires_at) {
      buffs.push({
        name: '悟性加成',
        desc: '经验获取加速',
        expires: fmtBuffExpires(p().enlightenment_buff_expires_at),
        active: Number(p().enlightenment_buff_expires_at) * 1000 > Date.now(),
      });
    }
    if (p().spirit_pool_buff) {
      buffs.push({
        name: '灵池增益',
        desc: '修炼速度提升',
        active: true,
        expires: '持续中',
      });
    }
    if (p().timed_buffs && typeof p().timed_buffs === 'object') {
      for (const [k, v] of Object.entries(p().timed_buffs)) {
        if (v && v.expires_at && Number(v.expires_at) * 1000 > Date.now()) {
          buffs.push({
            name: k.replace(/_/g, ' '),
            desc: v.desc || '',
            expires: fmtBuffExpires(v.expires_at),
            active: true,
          });
        }
      }
    }
    return buffs;
  });

  const techniqueList = computed(() => {
    const techniques = p().techniques || {};
    const levels = p().technique_levels && typeof p().technique_levels === 'object' ? p().technique_levels : {};
    const mainId = techniques.main?.id || techniques.main;
    const subId = techniques.sub?.id || techniques.sub;
    const gameTechs = p()._gameTechniques || [];
    const list = [];
    for (const [tid, data] of Object.entries(levels)) {
      const id = Number(tid);
      const gt = gameTechs.find(t => Number(t.id) === id) || {};
      const lv = Number(data?.level) || 1;
      const tExp = Number(data?.exp) || 0;
      const needed = Math.floor(30 + lv * lv * 0.5 + lv * 10);
      list.push({
        id,
        name: gt.name || `功法#${id}`,
        level: lv,
        exp: tExp,
        expNeeded: needed,
        expPercent: Math.min(100, Math.floor(tExp / Math.max(1, needed) * 100)),
        isMain: Number(mainId) === id,
        isSub: Number(subId) === id,
        desc: gt.desc || gt.description || '',
        passiveEffects: gt.passiveEffects || gt.effects || [],
        skillUnlocks: gt.skillUnlocks || [],
      });
    }
    return list;
  });

  const mainTechnique = computed(() => techniqueList.value.find(t => t.isMain) || null);
  const subTechnique = computed(() => techniqueList.value.find(t => t.isSub) || null);

  async function doBreakthrough() {
    const node = currentBreakthroughNode.value;
    if (!node) { _showToast('当前等级无法突破'); return; }
    const [, , realmName] = node;
    const rate = breakthroughRate.value.rate;
    let msg = `确定要尝试${realmName}突破？\n当前成功率: ${formatRate(rate)}\n\n失败将降级并清空当前经验。`;
    if (rate < 1) msg = `⚠ 当前成功率仅 ${formatRate(rate)}！\n\n` + msg;
    if (!confirm(msg)) return;
    loading.value = true;
    const r = await safe(() => api.breakthrough());
    loading.value = false;
    if (!r?.ok) { _showToast(r?.error || '突破失败'); return; }
    if (r.player) Object.assign(_p, r.player);
    _showToast(r.success ? '突破成功！' : '突破失败，境界回落...');
  }

  async function doLevelUp() {
    loading.value = true;
    const r = await safe(() => api.levelUp());
    loading.value = false;
    if (!r?.ok) { _showToast(r?.error || '升级失败'); return; }
    if (r.player) Object.assign(_p, r.player);
    _showToast('修炼成功，等级提升！');
  }

  return {
    subTab, loading,
    level, exp, expNeeded, expPercent, realm, stage,
    isBreakthroughLevel, currentBreakthroughNode,
    breakthroughRate, breakthroughInfo, nextBreakthrough,
    spiritRootQuality, spiritRootElement, spiritRootVariant,
    sixStats, sixSum,
    destinyPoints, activeBuffs,
    techniqueList, mainTechnique, subTechnique,
    doBreakthrough, doLevelUp,
    SPIRIT_ROOT_ELEMENTS, SIX_NAMES,
  };
}
