const { loadDatabase, saveDatabase } = require('../database');
const characterService = require('./character');
const injuryService = require('./injury');
const model = require('./cultivation-model');
const B = require('../config/balance');

class CultivationService {
  /**
   * 灵气浓度（决议 v2 修炼杠杆）：地图难度 + 洞府地脉加成，受 ENV_CAP 封顶。
   * 系数改从 balance 取（此前 0.05 硬编码在此处，属不变量 5 违例）。
   */
  getSpiritDensity(character) {
    const db = loadDatabase();
    const map = (db.maps || []).find((m) => m.id === (character.afk_map || 1));
    return model.densityOf({
      mapDifficulty: map && map.difficulty,
      veinLevel: Number(character.cave_vein_level) || 0
    }).value;
  }

  /** 组装九乘区输入：数据访问只在这一层，计算全在 cultivation-model（纯函数，可单测） */
  buildContext(character, db) {
    if (!db) db = loadDatabase();
    const CM = B.CULTIVATION_MODEL;

    const gongfas = (db.gongfa || [])
      .filter(g => g.character_id === character.id && g.type === '修炼')
      .map(g => {
        const item = (db.items || []).find(i => i.id === g.item_id);
        let stats = {};
        if (item && typeof item.stats === 'string') {
          try { stats = JSON.parse(item.stats || '{}'); } catch (e) { stats = {}; }
        } else if (item && item.stats && typeof item.stats === 'object') {
          stats = item.stats;
        }
        return {
          quality: item && item.quality,
          level: Number(g.level) || 1,
          cultivationSpeed: stats.cultivation_speed,
          element: item && item.element   // 功法表普遍缺 element → 契合区会记入 pending
        };
      });

    const map = (db.maps || []).find(m => m.id === (character.afk_map || 1));
    const buffService = require('./buff');

    let sectMultiplier = 1.0;
    try {
      const benefits = require('./sect').getBenefits(character);
      if (benefits && benefits.inSect) sectMultiplier = 1 + (benefits.cultivateSpeedBonus || 0);
    } catch (_) { /* 宗门系统异常不影响修炼 */ }

    return {
      realm: character.realm,
      level: character.level,
      stats: character.stats || {},
      spiritRoots: character.spirit_roots || [],
      gongfas,
      mapDifficulty: map && map.difficulty,
      veinLevel: Number(character.cave_vein_level) || 0,
      seclusion: character.seclusion || 'none',
      pillMultiplier: buffService.getBuffMultiplier(character.id, 'exp'),
      injuryMultiplier: injuryService.getDebuffs(character).cultivateMultiplier,
      sectMultiplier,
      // toxinRatio / caveMultiplier 故意不传：对应机制（丹毒 E5、洞府阵法）尚未落地，
      // 由模型记入 pending，而不是用假的 1.0 冒充"已生效"。
      _cm: CM
    };
  }

  /** 完整明细（含各乘区与 pending 清单），供路由与前端展示 */
  getCultivationDetail(character) {
    return model.expPerSecond(this.buildContext(character));
  }

  /** 兼容旧调用方：仍返回纯数值速度 */
  getCultivationSpeed(character) {
    return this.getCultivationDetail(character).speed;
  }

  getRealmIndex(realm) {
    return (B.REALM_ORDER || []).indexOf(realm);
  }

  cultivate(characterId, durationSeconds) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;

    const detail = this.getCultivationDetail(character);
    const seconds = Math.max(0, Number(durationSeconds) || 0);
    const totalExp = detail.rate * seconds;

    const result = characterService.addExp(characterId, totalExp);
    return {
      expGained: totalExp,
      speed: detail.speed,
      baseRate: detail.baseRate,
      ratePerSecond: detail.rate,
      capped: detail.capped,
      parts: detail.parts,
      pendingZones: detail.pending,
      seclusion: detail.seclusionLabel,
      ...result
    };
  }

  offlineCultivate(characterId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;

    const lastLogin = character.last_login ? new Date(character.last_login).getTime() : 0;
    const now = Date.now();
    // 轮77：窗口有两个来源——登录时存进 pending_offline_seconds 的账本（主路径），
    // 以及"注册后没再登录直接调本接口"的裸窗口（兜底，防老号漏算）。总账封顶 250h。
    const elapsed = lastLogin > 0 ? Math.floor((now - lastLogin) / 1000) : 0;
    const banked = Math.max(0, Math.floor(character.pending_offline_seconds || 0));
    const maxOffline = 250 * 60 * 60;
    const actualOffline = Math.min(elapsed + banked, maxOffline);

    if (actualOffline <= 0) return null;

    // 决议 D1：离线修炼 100% 效率（与在线一致），离线时间同时 100% 推进游戏年龄
    // （年龄推进由 gameTime.settleTime 在角色加载/登录时统一结算）
    const detail = this.getCultivationDetail(character);
    // 闭关中"离线blocked"的档位：离线收益按 0 结算（不入关者不受影响）
    const blocked = detail.blocks.indexOf('offline') >= 0;
    const totalExp = blocked ? 0 : detail.rate * actualOffline;

    const result = totalExp > 0 ? characterService.addExp(characterId, totalExp) : { character, leveledUp: false };

    // 轮77 修"无限修为泉"：last_login 只在登录时写（auth.js:117），本函数读它却
    // 不消费——连点 offline-cultivate 每次都能按同一段离线时长再领一遍收益。
    // 口径：调用即结算——只要窗口 >0 就把 last_login 推到当下（blocked 档也消费窗口，
    // 离线时间真实流逝，不因收益为 0 而可反复白领）。ISO 格式与 auth.js 写侧一致。
    character.last_login = new Date(now).toISOString();
    character.pending_offline_seconds = 0;
    saveDatabase(db);

    const expPerHour = Math.floor(detail.rate * 3600);
    const hours = Math.floor(actualOffline / 3600);
    const minutes = Math.floor((actualOffline % 3600) / 60);

    return {
      offlineTime: `${hours}小时${minutes}分钟`,
      expGained: totalExp,
      expPerHour: blocked ? 0 : expPerHour,
      speed: detail.speed,
      baseRate: detail.baseRate,
      capped: detail.capped,
      seclusion: detail.seclusionLabel,
      offlineBlocked: blocked,
      ...result
    };
  }
}

module.exports = new CultivationService();
