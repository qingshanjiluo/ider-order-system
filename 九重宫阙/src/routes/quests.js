const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const QL = require('../data/quest-library');

/**
 * 剧情任务路由（P7 批4 真源化）
 *
 * ## 改了什么
 *
 * 此前本文件顶部硬编码 8 条任务，文案是机器模板（「击杀10只妖兽」），
 * 描述里没有世界、没有人物、没有过程。现在定义全部来自 `src/data/quest-library.js`：
 * 四卷 20 条剧情任务（每条带委托人、委托辞、多阶段过场、交差辞、落幕后记），
 * 外加 6 条日常差事。本路由只负责「把定义与玩家存档状态拼起来」。
 *
 * ## 阶段化（本次的行为变化）
 *
 * 旧实现把 objectives 拍成一条平列表，任何进度上报都会同时累加到所有匹配目标上。
 * 新实现按 `stageIndex` **只推进当前阶段** —— 否则玩家在推图时会顺手把后续阶段的
 * 计数提前刷满（例如「清 8 只怪 → 通关 1 次副本 → 修至 10 级」这条链，
 * 玩家在清怪阶段打副本，副本计数就自己满了，第三阶段白送）。
 * 具体推进逻辑在 quest-library 的 `applyProgress`，有专门的测试锁。
 */

/** 把定义整理成前端可直接渲染的形态（含阶段与委托人行） */
function presentDef(q) {
  return {
    id: q.id,
    name: q.name,
    type: q.type,
    chapter: q.chapter,
    realmRange: [q.realmFrom, q.realmTo],
    giver: q.giver,
    giverLine: QL.giverLine(q),
    brief: q.brief,
    stageCount: q.stages.length,
    stages: q.stages.map((s) => ({ text: s.text, objectives: s.objectives.map((o) => ({ ...o, label: QL.renderObjective(o) })) })),
    rewards: q.rewards,
    epilogue: q.epilogue
  };
}

/** 取当前角色（所有路由共用） */
function findCharacter(db, userId) {
  return (db.characters || []).find((c) => c.user_id === userId) || null;
}

/** 已接（active/completed）的任务 id 集合 —— 用于过滤"还能接什么" */
function takenIds(db, characterId) {
  return new Set((db.quests || [])
    .filter((q) => q.character_id === characterId && (q.status === 'active' || q.status === 'completed'))
    .map((q) => q.quest_id));
}

/** GET /api/quests —— 我的任务（含阶段进度） */
router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = findCharacter(db, req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const mine = (db.quests || []).filter((q) => q.character_id === character.id);
    // 补上"当前阶段目标"的可读标签（旧存档没有 label 字段）
    const quests = mine.map((q) => {
      const st = q.stages && q.stages[q.stageIndex];
      return {
        ...q,
        stageTotal: q.stages ? q.stages.length : 1,
        currentStage: st || null,
        objectives: (st ? st.objectives : q.objectives || []).map((o) => ({ ...o, label: QL.renderObjective(o) }))
      };
    });
    res.json({ quests, volumes: QL.VOLUMES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/quests/available —— 可接的剧情委托（按角色境界筛 + 去掉已接的） */
router.get('/available', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = findCharacter(db, req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const taken = takenIds(db, character.id);
    // 境界顺序一律取 balance.REALM_ORDER 真源（本仓禁多份副本）
    const forRealm = QL.questsForRealm(character.realm, QL.realmOrder());
    const quests = forRealm.filter((q) => !taken.has(q.id)).map(presentDef);
    res.json({
      quests,
      volumes: QL.volumesWithRealms(),
      dailies: QL.DAILY_CHORES.map((d) => ({ ...d, objectives: d.objectives.map((o) => ({ ...o, label: QL.renderObjective(o) })) })),
      realm: character.realm
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/quests/library —— 全量剧情一览（图鉴用；不含玩家状态） */
router.get('/library', auth, (req, res) => {
  try {
    res.json({
      volumes: QL.VOLUMES,
      quests: QL.allQuests().map(presentDef)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/quests/accept —— 接委托（校验境界范围） */
router.post('/accept', auth, (req, res) => {
  try {
    const { questId } = req.body;
    if (!questId) return res.status(400).json({ error: '请指定要接受的委托' });

    const db = loadDatabase();
    const character = findCharacter(db, req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    // 委托可以来自剧情库（字符串 id）或日常差事（d_ 前缀）
    const isDaily = String(questId).startsWith('d_');
    const def = isDaily
      ? QL.DAILY_CHORES.find((d) => d.id === questId)
      : QL.questById(questId);
    if (!def) return res.status(400).json({ error: '未知的委托' });

    if (!isDaily) {
      const realmOrder = QL.realmOrder();
      const idx = realmOrder.indexOf(character.realm);
      const a = realmOrder.indexOf(def.realmFrom);
      const b = realmOrder.indexOf(def.realmTo);
      if (idx >= 0 && a >= 0 && b >= 0 && (idx < Math.min(a, b) || idx > Math.max(a, b))) {
        return res.status(400).json({ error: `此委托须 ${def.realmFrom}~${def.realmTo} 境界方可承接` });
      }
    }

    const existing = (db.quests || []).find(
      (q) => q.character_id === character.id && q.quest_id === questId && (q.status === 'active' || q.status === 'completed')
    );
    if (existing) return res.status(400).json({ error: '已承接或已完成此委托' });

    // 剧情任务用 instantiate（带阶段），日常差事走平铺形态
    let quest;
    if (isDaily) {
      // ⚠ 关键：objectives 与 stages[0].objectives 必须**指向同一个数组**。
      // 此前各 map 一份，导致"改 objectives 不改 stage"或反之，进度推进读一处、完成判定读另一处，
      // 出现"改了 required 也不生效 / 判完成用的是旧值"这类幽灵 bug。
      const objs = def.objectives.map((o) => ({ ...o }));
      quest = {
        id: getNextId('quests'),
        character_id: character.id,
        quest_id: def.id,
        name: def.name,
        type: 'daily',
        description: def.description,
        chapter: '日常差事',
        volume: 0,
        order: 0,
        giver: '',
        brief: def.description,
        closing: '',
        epilogue: '',
        stages: [{ index: 0, text: def.description, objectives: objs }],
        stageIndex: 0,
        objectives: objs,
        rewards: { ...def.rewards },
        status: 'active',
        accepted_at: Date.now(),
        completed_at: null
      };
    } else {
      quest = QL.instantiate(def, character.id, getNextId('quests'));
    }

    if (!db.quests) db.quests = [];
    db.quests.push(quest);
    saveDatabase(db);
    res.json({ success: true, message: `已承接：${def.name}`, quest });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/quests/complete —— 交差（全部阶段完成后才可） */
router.post('/complete', auth, (req, res) => {
  try {
    const body = req.body || {};
    // 兼容两种调用：按实例 id（questId 传 db.quests.id）或按定义 id（questId 传 quest_id）
    const raw = body.questId !== undefined ? body.questId : body.id;
    if (raw === undefined || raw === null) return res.status(400).json({ error: '请指定要交差的委托' });

    const db = loadDatabase();
    const character = findCharacter(db, req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const active = (db.quests || []).filter((q) => q.character_id === character.id && q.status === 'active');
    const quest = active.find((q) => String(q.id) === String(raw))
      || active.find((q) => String(q.quest_id) === String(raw));
    if (!quest) return res.status(400).json({ error: '委托不存在或未激活' });

    // 阶段化完成判定：所有阶段的所有目标都要满足
    const done = quest.stages && quest.stages.length
      ? quest.stages.every((st) => st.objectives.every((o) => o.current >= o.required))
      : (quest.objectives || []).every((o) => o.current >= o.required);
    if (!done) {
      const st = quest.stages && quest.stages[quest.stageIndex];
      const left = (st ? st.objectives : quest.objectives || [])
        .filter((o) => o.current < o.required)
        .map((o) => `${QL.renderObjective(o)}（${o.current}/${o.required}）`);
      return res.status(400).json({ error: '此委托尚未了结：' + (left.join('、') || '尚有未竟之事') });
    }

    quest.status = 'completed';
    quest.completed_at = Date.now();

    const rewards = quest.rewards || {};
    const expGain = rewards.exp || 0;
    const spiritStoneGain = rewards.spirit_stone || 0;
    character.spirit_stone = (character.spirit_stone || 0) + spiritStoneGain;

    // 奖励物品真的发到背包（此前只回一个数字，玩家拿不到东西）
    const granted = [];
    for (const it of (rewards.items || [])) {
      const item = (db.items || []).find((x) => x.name === it.name);
      if (!item) continue;
      const row = (db.inventory || []).find((v) => v.character_id === character.id && v.item_id === item.id);
      if (row) row.quantity = (row.quantity || 0) + (it.count || 1);
      else {
        if (!db.inventory) db.inventory = [];
        db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: item.id, quantity: it.count || 1 });
      }
      granted.push({ name: it.name, count: it.count || 1 });
    }

    // 轮54 铁律：只加修为，升级全部交给唯一入口（含境界封顶、圆满钉值、寿元成长、属性重算）
    let levelUp = false;
    if (expGain > 0) {
      const r = require('../services/character').addExp(character.id, expGain);
      levelUp = !!(r && r.leveledUp);
    }

    saveDatabase(db);
    res.json({
      success: true,
      message: `「${quest.name}」已了结`,
      // 交差辞与落幕后记：让"完成任务"有叙事收束，而不是只弹一个数字
      closing: quest.closing || '',
      epilogue: quest.epilogue || '',
      rewards: { exp: expGain, spirit_stone: spiritStoneGain, items: granted },
      levelUp,
      newLevel: character.level
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/quests/abandon —— 放弃委托（可再接） */
router.post('/abandon', auth, (req, res) => {
  try {
    const raw = (req.body || {}).questId;
    if (raw === undefined || raw === null) return res.status(400).json({ error: '请指定要放弃的委托' });
    const db = loadDatabase();
    const character = findCharacter(db, req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const quest = (db.quests || []).find(
      (q) => q.character_id === character.id && q.status === 'active'
        && (String(q.id) === String(raw) || String(q.quest_id) === String(raw))
    );
    if (!quest) return res.status(400).json({ error: '没有这条进行中的委托' });
    quest.status = 'abandoned';
    quest.abandoned_at = Date.now();
    saveDatabase(db);
    res.json({ success: true, message: `已放下「${quest.name}」` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/quests/revisit —— 回访委托人（推进 talk 目标） */
router.post('/revisit', auth, (req, res) => {
  try {
    const raw = (req.body || {}).questId;
    if (raw === undefined || raw === null) return res.status(400).json({ error: '请指定要回访的委托' });
    const db = loadDatabase();
    const character = findCharacter(db, req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const quest = (db.quests || []).find(
      (q) => q.character_id === character.id && q.status === 'active'
        && (String(q.id) === String(raw) || String(q.quest_id) === String(raw))
    );
    if (!quest) return res.status(400).json({ error: '没有这条进行中的委托' });

    // 回访 = 与委托人当面说话。这是 `talk` 目标的**唯一真实来源**：
    // 本游戏没有独立的 NPC 行走系统，委托里的"回来把所见告诉鬼差"就是这一次回访。
    // 只推当前阶段，且只推 target 与委托人名字相符的 talk 目标（由 objectiveMatches 保证：
    // 剧情库里 talk 的 target 一律写作委托人姓名，测试有锁）。
    const before = quest.stageIndex;
    const r = QL.applyProgress(quest, 'talk', 1, { npc: quest.giverName || undefined });
    // giverName 没存过（旧档）：退化为"任何 talk 目标都算"，让老玩家不至于卡死
    if (r.gained === 0 && !quest.giverName) {
      const st = quest.stages && quest.stages[quest.stageIndex];
      if (st) {
        for (const o of st.objectives) {
          if (o.type === 'talk' && o.current < o.required) o.current = o.required;
        }
        QL.applyProgress(quest, 'talk', 0, undefined);   // 触发阶段推进判定
      }
    }
    saveDatabase(db);
    const st = quest.stages && quest.stages[quest.stageIndex];
    res.json({
      success: true,
      message: `${quest.giver || '委托人'}听你说完，点了点头。`,
      stageIndex: quest.stageIndex,
      advanced: quest.stageIndex !== before,
      objective: st ? st.objectives.map((o) => ({ label: QL.renderObjective(o), current: o.current, required: o.required })) : []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

/**
 * 进度上报（供战斗/采集/炼器/炼丹/渡劫/探索/交付等路由调用）。
 *
 * ## 为什么要带 context（轮105）
 *
 * 剧情委托的目标是**具体的**：「讨伐 灵兔 3 头」「探明 无相幻境」「凑齐 镜心砂 3 件」。
 * 如果钩子只报类型（"我杀了一只怪"），那"讨伐灵兔"和"讨伐旱魃幼体"就分不开，
 * 玩家杀别的怪也能刷满灵兔委托。所以第三参之后的 `context` 要带**实体的名字**，
 * 由这里与目标的 `target` 做匹配。
 *
 * 匹配规则（三种，覆盖全部写法）：
 *   1. `target` 为空 / `'monster'` / `'battle'` / 与类型同名 → 通配（任何该类型都算）
 *   2. `target` 在 context 里出现（怪名、地图名、物品名任一命中）→ 算
 *   3. 同上都不满足 → 不算（这正是我们要的严格性）
 *
 * ## 向后兼容
 *
 * 旧调用 `updateQuestProgress(cid, 'kill', 1)` 不带 context：只匹配通配目标，
 * 具体命名的目标不会被推进 —— 这是**故意**的：宁可少推（玩家看得见进度没动、
 * 会去查），也不要错推（静默把别的怪算进灵兔委托）。
 *
 * @param {number} characterId
 * @param {string} objectiveType  kill/battle/dungeon/checkin/gather/craft/forge/guild/level/alchemy/tribulation/explore/collect/talk
 * @param {number} increment      增量
 * @param {object} [context]      { monster, map, item, dungeon, npc, realm } 任意字段
 * @returns {Array} 因本次上报而推进阶段的委托实例
 */
module.exports.updateQuestProgress = function updateQuestProgress(characterId, objectiveType, increment, context) {
  try {
    const db = loadDatabase();
    if (!db.quests) return [];
    const active = db.quests.filter((q) => q.character_id === characterId && q.status === 'active');
    const advanced = [];
    for (const quest of active) {
      if (!quest.stages || !quest.stages.length) {
        // 旧存档（平铺 objectives）：保持原行为（不带 context 匹配，避免误伤老档）
        for (const o of quest.objectives || []) {
          if (o.type === objectiveType && o.current < o.required) o.current = Math.min(o.current + increment, o.required);
        }
        if ((quest.objectives || []).every((o) => o.current >= o.required)) advanced.push(quest);
        continue;
      }
      const before = quest.stageIndex;
      const r = QL.applyProgress(quest, objectiveType, increment, context);
      if (r.stageIndex !== before) advanced.push(quest);
      if (r.finished) advanced.push(quest);
    }
    saveDatabase(db);
    return advanced;
  } catch (e) {
    return [];
  }
};

/**
 * 目标的 target 是否与本次上报的 context 匹配（导出供测试单独验证匹配规则）。
 */
module.exports.objectiveMatches = QL.objectiveMatches;
