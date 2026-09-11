/**
 * 玩家初始存档与属性计算（迁移自 server/game/initialPlayer.js + combatUtils 基础部分）
 * 静态数据（items/skills/techniques）从打包的 dataLoader 读取（构建时内联）。
 */
import { calculateExpNeeded } from './exp.js';
import { getItems, getSkills, getTechniques } from './game/dataLoader.js';

// 基础战斗属性计算（对应 initialPlayer.applyCombatStatsFromBase）
export function applyCombatStatsFromBase(player) {
  const strength = Number(player.strength) || 10;
  const constitution = Number(player.constitution) || 10;
  const bone = Number(player.bone) || 10;
  const zhenyuan = Number(player.zhenyuan) || 10;
  const boneMult = 1.0 + (bone / 300.0) * 0.01;
  const maxHp = Math.max(1, Math.floor(constitution * 5 * boneMult));
  const maxMp = Math.max(1, Math.floor(zhenyuan * 3 * boneMult));
  player.max_hp = maxHp;
  player.max_mp = maxMp;
  if (Number(player.hp) <= 0) player.hp = maxHp;
  if (Number(player.mp) <= 0) player.mp = maxMp;
  const minAttack = Math.max(1, Math.floor(strength * 0.3 * boneMult));
  const maxAttack = Math.max(minAttack + 1, Math.floor(strength * 1.2 * boneMult));
  player.min_phys_damage = minAttack;
  player.max_phys_damage = maxAttack;
  player.phys_defense = Math.max(0, Math.floor(constitution * 0.25 * boneMult));
  const spellAttack = Math.max(0, Math.floor(zhenyuan * 0.8 * boneMult));
  player.min_spell_attack = spellAttack;
  player.max_spell_attack = spellAttack;
  player.spell_defense = Math.max(0, Math.floor(zhenyuan * 0.2 * boneMult));
}

// ── 灵根随机生成（《仙 九重天阙》风格：数量定品质 + 特殊/伪灵根） ──────────────
export const SPIRIT_ROOT_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];
export const SPIRIT_ROOT_VARIANTS = ['雷', '冰', '风', '暗', '光'];
export const SPIRIT_ROOT_QUALITY_LABELS = { tian: '天灵根', zhen: '真灵根', wei: '伪灵根', variant: '变异灵根' };

/**
 * 灵根随机生成：
 *  天灵根 单系，数值 90-100（8%）
 *  变异灵根 单系+变异属性，数值 85-100（5%）
 *  真灵根 2-3 系，数值 60-90（30%）
 *  伪灵根 4-5 系，数值 30-60（57%）
 * @param provided {roots:{metal:..}, quality, variant} 可选，创建页预览结果回传（合法则采用，非法则重随机）
 */
export function rollSpiritRoots(provided) {
  const p = provided && typeof provided === 'object' ? provided : {};
  const pRoots = p.roots && typeof p.roots === 'object' && !Array.isArray(p.roots) ? p.roots : null;
  const pQuality = String(p.quality || '');
  if (pRoots && ['tian', 'zhen', 'wei', 'variant'].includes(pQuality)) {
    const keys = SPIRIT_ROOT_KEYS.filter((k) => Number(pRoots[k]) > 0);
    const cnt = keys.length;
    let ok = true;
    if (pQuality === 'tian' || pQuality === 'variant') ok = cnt === 1;
    else if (pQuality === 'zhen') ok = cnt >= 2 && cnt <= 3;
    else ok = cnt >= 4 && cnt <= 5;
    if (ok) {
      const roots = {};
      for (const k of SPIRIT_ROOT_KEYS) {
        const v = Number(pRoots[k]);
        roots[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.floor(v))) : 0;
      }
      return {
        roots,
        quality: pQuality,
        variant: pQuality === 'variant' ? String(p.variant || SPIRIT_ROOT_VARIANTS[0]).slice(0, 4) : '',
        count: cnt,
      };
    }
  }
  const r = Math.random();
  let quality;
  let count;
  if (r < 0.05) { quality = 'variant'; count = 1; }
  else if (r < 0.13) { quality = 'tian'; count = 1; }
  else if (r < 0.43) { quality = 'zhen'; count = 2 + (Math.random() < 0.5 ? 0 : 1); }
  else { quality = 'wei'; count = 4 + (Math.random() < 0.5 ? 0 : 1); }
  const shuffled = [...SPIRIT_ROOT_KEYS].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, count);
  const hi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const roots = {};
  for (const k of SPIRIT_ROOT_KEYS) {
    if (picked.includes(k)) {
      roots[k] = quality === 'tian' ? hi(90, 100) : quality === 'variant' ? hi(85, 100) : quality === 'zhen' ? hi(60, 90) : hi(30, 60);
    } else roots[k] = 0;
  }
  return {
    roots,
    quality,
    variant: quality === 'variant' ? SPIRIT_ROOT_VARIANTS[Math.floor(Math.random() * SPIRIT_ROOT_VARIANTS.length)] : '',
    count,
  };
}

async function readKv(env, key) {
  if (env.GAME_DATA_KV) {
    const raw = await env.GAME_DATA_KV.get(key, 'text').catch(() => null);
    if (raw) return JSON.parse(raw);
  }
  return null;
}

export async function createInitialPlayerData(name, spiritRoots, env) {
  const now = Math.floor(Date.now() / 1000);
  // 灵根：创建时随机生成（创建页预览回传合法数据则采用），不再手动分配
  const roll = rollSpiritRoots(spiritRoots);
  const kvItems = env && env.GAME_DATA_KV ? await readKv(env, 'items') : null;
  const kvSkills = env && env.GAME_DATA_KV ? await readKv(env, 'skills') : null;
  const kvTechniques = env && env.GAME_DATA_KV ? await readKv(env, 'techniques') : null;
  const items = kvItems || getItems() || [];
  const skills = kvSkills || getSkills() || [];
  const techniques = kvTechniques || getTechniques() || [];

  const player = {
    name: String(name || '无名散修').slice(0, 12),
    level: 1,
    exp: 0,
    spirit_roots: { ...roll.roots },
    base_spirit_roots: { ...roll.roots },
    original_spirit_roots: { ...roll.roots },
    spirit_root_quality: roll.quality,
    spirit_root_variant: roll.variant || '',
    strength: 10, constitution: 10, bone: 10, agility: 10, zhenyuan: 10, lingli: 10,
    original_base_attributes: { strength: 10, constitution: 10, bone: 10, agility: 10, zhenyuan: 10, lingli: 10 },
    hp: 0,
    mp: 0,
    equipment: {},
    inventory: [],
    current_inventory_page: 0,
    current_map_id: 1,
    equipped_skills: [],
    key_skill_id: 0,
    skill_presets: {
      grind:   { equipped_skills: [], key_skill_id: 0 },
      dungeon: { equipped_skills: [], key_skill_id: 0 },
      duel:    { equipped_skills: [], key_skill_id: 0 }
    },
    equipped_talisman_id: 0,
    skill_levels: {},
    skill_cooldowns: {},
    talents: { points_earned: 0, points_spent: 0, available_points: 0, unlocked_nodes: {} },
    techniques: { main: null, sub: null },
    technique_levels: {},
    alchemy: {},
    forging: {},
    baiyi: {},
    sect_id: 0,
    sect_contribution: 0,
    alliance_id: 0,
    alliance_contribution: 0,
    alliance_donate_date: '',
    alliance_donate_contrib_today: 0,
    beasts: { roster: [], active_id: 0, egg_incubating: null },
    spirit_pool_buff: null,
    spirit_pool_last_bathe_date: '',
    enlightenment_buff_expires_at: 0,
    enlightenment_last_date: '',
    lundaodian_sect_id: 0,
    rest_until: 0,
    auto_battle_enabled: false,
    auto_battle_map_id: 1,
    breakthrough_foundation_pills_stored: 0,
    breakthrough_yunling_stored: 0,
    breakthrough_yuanying_stored: 0,
    breakthrough_huashen_stored: 0,
    breakthrough_lianxu_stored: 0,
    breakthrough_heti_stored: 0,
    breakthrough_dacheng_stored: 0,
    breakthrough_zhenxian_stored: 0,
    breakthrough_jinxian_stored: 0,
    breakthrough_taiyi_stored: 0,
    breakthrough_daluo_stored: 0,
    breakthrough_daozu_stored: 0,
    breakthrough_nascent_kill_count: 0,
    breakthrough_spirit_dungeon_count: 0,
    used_redemption_codes: [],
    battle_potion_enabled: false,
    battle_potion_hp_item_id: 0,
    battle_potion_mp_item_id: 0,
    battle_potion_hp_threshold: 50,
    battle_potion_mp_threshold: 50,
    timed_buffs: {},
    league_points: 0,
    league_rating: 1000,
    duel_rank_score: 1000,
    agreement_seen: false,
    time_state: {
      last_activity_at: now,
      last_tick_at: now,
      universal_time_seconds: 0,
      oct_seconds: 0,
      oct_paused: false
    }
  };

  // 初始物品：铁剑 id=11、寒潭沙 id=27 x2，背包 10 页 × 20 格
  const emptyPage = () => Array(20).fill(null);
  player.inventory = Array(10).fill(null).map(emptyPage);
  if (items.length) {
    const ironSword = items.find(i => i && Number(i.id) === 11);
    const hanTanSha = items.find(i => i && Number(i.id) === 27);
    if (ironSword) player.inventory[0][0] = { item: ironSword, count: 1 };
    if (hanTanSha) player.inventory[0][1] = { item: hanTanSha, count: 2 };
  }

  // 学习 unlocked 技能/功法
  for (const s of skills) {
    if (s && s.unlocked && Number(s.id) > 0) player.skill_levels[String(s.id)] = { level: 1, exp: 0 };
  }
  for (const t of techniques) {
    if (t && t.unlocked && Number(t.id) > 0) player.technique_levels[String(t.id)] = { level: 1, exp: 0 };
  }

  applyCombatStatsFromBase(player);
  return player;
}

/** 为客户端响应补充 max_exp 等展示字段（对应 enrichPlayerForClient） */
export function enrichPlayer(p) {
  if (!p || typeof p !== 'object') return;
  const lv = Math.floor(Number(p.level) || 1);
  p.max_exp = calculateExpNeeded(lv);
  return p;
}