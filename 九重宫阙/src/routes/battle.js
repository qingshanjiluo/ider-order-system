const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const combatService = require('../services/battle/combat');
const characterService = require('../services/character');
const injuryService = require('../services/injury');
const { loadDatabase, saveDatabase } = require('../database');

router.get('/enemy', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const enemy = combatService.generateEnemy(character);
    res.json(enemy);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/battle', auth, async (req, res) => {
  try {
    const { enemyId, mapId, skillIndex } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    // 阶段5：自动调息闸门（D5）
    if (injuryService.shouldAutoMeditate(character)) {
      return res.status(400).json({ error: '伤势过重，调息休整中（可关闭自动调息或使用疗伤丹）' });
    }

    let result;
    if (enemyId) {
      result = await combatService.startBattle(character.id, null, 'character', 'custom', skillIndex);
    } else {
      result = await combatService.startBattle(character.id, mapId || 1, 'character', 'monster', skillIndex);
    }

    if (result.success) {
      // 阶段5：战后伤势结算（PVE 全额积累 + 重伤扣寿）
      combatService.aftermath(character, result);
      character.total_battles = (character.total_battles || 0) + 1;
      if (result.winner === 'attacker') {
        character.win_streak = (character.win_streak || 0) + 1;
        character.total_kills = (character.total_kills || 0) + 1;
        character.spirit_stone = (character.spirit_stone || 0) + (result.rewards?.spiritStone || 0);
        const { updateQuestProgress } = require('./quests');
        const completed = updateQuestProgress(character.id, 'kill', 1);
        updateQuestProgress(character.id, 'battle', 1);
      } else {
        character.win_streak = 0;
      }
      saveDatabase(db);

      if (result.rewards?.exp) {
        characterService.addExp(character.id, result.rewards.exp);
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/skills', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const gongfas = db.gongfa.filter(g => g.character_id === character.id);
    const skills = [];
    for (const gf of gongfas) {
      const item = db.items.find(i => i.id === gf.item_id);
      if (item) {
        skills.push({
          id: gf.id,
          name: item.name,
          type: gf.type || item.type,
          level: gf.level || 1,
          stats: JSON.parse(item.stats || '{}')
        });
      }
    }
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/skills/learn', auth, (req, res) => {
  try {
    const { skillId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const gongfa = db.gongfa.find(g => g.id === skillId && g.character_id === character.id);
    if (!gongfa) {
      return res.status(400).json({ error: '功法不存在' });
    }

    res.json({ success: true, message: '功法已领悟', gongfa });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/skills/upgrade', auth, (req, res) => {
  try {
    const { gongfaId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const gongfa = db.gongfa.find(g => g.id === gongfaId && g.character_id === character.id);
    if (!gongfa) {
      return res.status(400).json({ error: '功法不存在' });
    }

    const cost = (gongfa.level || 1) * 100;
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: '灵石不足', required: cost });
    }

    character.spirit_stone -= cost;
    gongfa.level = (gongfa.level || 1) + 1;
    saveDatabase(db);

    res.json({ success: true, level: gongfa.level, cost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const ARENA_REWARDS = {
  win: { exp: 100, spiritStone: 30, arenaPoints: 20 },
  lose: { exp: 20, spiritStone: 5, arenaPoints: 5 },
  streak3: { exp: 200, spiritStone: 80, arenaPoints: 50 },
  streak5: { exp: 400, spiritStone: 150, arenaPoints: 100 },
  streak10: { exp: 800, spiritStone: 300, arenaPoints: 200 }
};

router.get('/arena/rankings', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const characters = db.characters
      .filter(c => c.arena_points || c.win_streak)
      .sort((a, b) => (b.arena_points || 0) - (a.arena_points || 0))
      .slice(0, 20)
      .map((c, idx) => ({
        rank: idx + 1,
        id: c.id,
        name: c.name,
        level: c.level,
        realm: c.realm,
        arena_points: c.arena_points || 0,
        win_streak: c.win_streak || 0,
        combat_power: (c.attack || 0) + (c.defense || 0) + (c.hp || 0)
      }));
    res.json(characters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/arena/battle', auth, async (req, res) => {
  try {
    const { targetId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    let opponent;
    if (targetId) {
      opponent = db.characters.find(c => c.id === targetId);
    } else {
      const eligible = db.characters.filter(c => c.id !== character.id && Math.abs((c.level || 1) - (character.level || 1)) <= 10);
      if (eligible.length === 0) return res.status(400).json({ error: '无合适对手' });
      opponent = eligible[Math.floor(Math.random() * eligible.length)];
    }
    if (!opponent) return res.status(400).json({ error: '对手不存在' });

    const playerPower = (character.attack || 0) + (character.defense || 0) + (character.hp || 0);
    const opponentPower = (opponent.attack || 0) + (opponent.defense || 0) + (opponent.hp || 0);
    const winChance = Math.min(0.9, Math.max(0.1, playerPower / (playerPower + opponentPower)));
    const won = Math.random() < winChance;

    const streak = won ? (character.win_streak || 0) + 1 : 0;
    character.win_streak = streak;
    character.arena_points = (character.arena_points || 0) + (won ? ARENA_REWARDS.win.arenaPoints : ARENA_REWARDS.lose.arenaPoints);
    character.arena_points = Math.max(0, character.arena_points - (opponent.arena_points || 0) * 0.1);

    let bonusReward = null;
    if (streak === 3) bonusReward = ARENA_REWARDS.streak3;
    else if (streak === 5) bonusReward = ARENA_REWARDS.streak5;
    else if (streak >= 10) bonusReward = ARENA_REWARDS.streak10;

    const reward = won ? ARENA_REWARDS.win : ARENA_REWARDS.lose;
    character.exp = (character.exp || 0) + reward.exp + (bonusReward ? bonusReward.exp : 0);
    character.spirit_stone = (character.spirit_stone || 0) + reward.spiritStone + (bonusReward ? bonusReward.spiritStone : 0);
    character.arena_points += bonusReward ? bonusReward.arenaPoints : 0;
    character.total_battles = (character.total_battles || 0) + 1;
    if (won) character.total_kills = (character.total_kills || 0) + 1;

    saveDatabase(db);
    res.json({
      won, opponent: { name: opponent.name, level: opponent.level, realm: opponent.realm },
      reward: { ...reward, ...(bonusReward || {}) },
      streak, arena_points: character.arena_points,
      message: won ? `击败${opponent.name}！连胜${streak}场` : `败给${opponent.name}，连胜中断`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/duel/challenge', auth, async (req, res) => {
  try {
    const { targetId, betAmount } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    if (!targetId) return res.status(400).json({ error: '缺少对手ID' });

    const target = db.characters.find(c => c.id === targetId);
    if (!target) return res.status(400).json({ error: '对手不存在' });

    if (betAmount && betAmount > 0) {
      if ((character.spirit_stone || 0) < betAmount) return res.status(400).json({ error: '灵石不足' });
      if ((target.spirit_stone || 0) < betAmount) return res.status(400).json({ error: '对手灵石不足' });
      character.spirit_stone -= betAmount;
      target.spirit_stone -= betAmount;
    }

    const playerPower = (character.attack || 0) + (character.defense || 0) + (character.hp || 0);
    const targetPower = (target.attack || 0) + (target.defense || 0) + (target.hp || 0);
    const winChance = Math.min(0.9, Math.max(0.1, playerPower / (playerPower + targetPower)));
    const won = Math.random() < winChance;

    const totalBet = (betAmount || 0) * 2;
    if (won && totalBet > 0) {
      character.spirit_stone += totalBet;
    }

    character.total_battles = (character.total_battles || 0) + 1;
    target.total_battles = (target.total_battles || 0) + 1;
    if (won) {
      character.total_kills = (character.total_kills || 0) + 1;
      character.duel_wins = (character.duel_wins || 0) + 1;
      target.duel_losses = (target.duel_losses || 0) + 1;
    } else {
      target.total_kills = (target.total_kills || 0) + 1;
      target.duel_wins = (target.duel_wins || 0) + 1;
      character.duel_losses = (character.duel_losses || 0) + 1;
    }

    const expReward = won ? 150 : 30;
    character.exp = (character.exp || 0) + expReward;
    saveDatabase(db);

    res.json({
      won, opponent: { name: target.name, level: target.level, realm: target.realm },
      betWon: won ? totalBet : 0,
      expReward,
      message: won ? `斗法胜利！${totalBet > 0 ? '赢得' + totalBet + '灵石' : ''}` : `斗法失败`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/war/info', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const member = db.guild_members.find(m => m.character_id === character.id);
    const sect = member ? db.guilds.find(g => g.id === member.guild_id) : null;

    res.json({
      sect: sect ? { id: sect.id, name: sect.name, level: sect.level || 1 } : null,
      memberCount: sect ? db.guild_members.filter(m => m.guild_id === sect.id).length : 0,
      warStatus: sect && sect.warStatus ? sect.warStatus : 'idle',
      warResults: sect && sect.warResults ? sect.warResults.slice(-5) : []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/war/sect-battle', auth, async (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });

    const myGuild = db.guilds.find(g => g.id === member.guild_id);
    if (!myGuild) return res.status(400).json({ error: '仙盟不存在' });

    const enemyGuilds = db.guilds.filter(g => g.id !== myGuild.id);
    if (enemyGuilds.length === 0) return res.status(400).json({ error: '无对手仙盟' });

    const enemy = enemyGuilds[Math.floor(Math.random() * enemyGuilds.length)];
    const myPower = db.guild_members.filter(m => m.guild_id === myGuild.id).reduce((sum, m) => {
      const c = db.characters.find(ch => ch.id === m.character_id);
      return sum + ((c?.attack || 0) + (c?.defense || 0) + (c?.hp || 0));
    }, 0);
    const enemyPower = db.guild_members.filter(m => m.guild_id === enemy.id).reduce((sum, m) => {
      const c = db.characters.find(ch => ch.id === m.character_id);
      return sum + ((c?.attack || 0) + (c?.defense || 0) + (c?.hp || 0));
    }, 0);

    const winChance = Math.min(0.85, Math.max(0.15, myPower / (myPower + enemyPower)));
    const won = Math.random() < winChance;

    const myMembers = db.guild_members.filter(m => m.guild_id === myGuild.id);
    for (const m of myMembers) {
      const c = db.characters.find(ch => ch.id === m.character_id);
      if (c) {
        c.exp = (c.exp || 0) + (won ? 200 : 50);
        c.spirit_stone = (c.spirit_stone || 0) + (won ? 100 : 20);
      }
    }

    if (!myGuild.warResults) myGuild.warResults = [];
    myGuild.warResults.push({ enemy: enemy.name, won, time: Date.now() });
    if (myGuild.warResults.length > 20) myGuild.warResults = myGuild.warResults.slice(-20);

    saveDatabase(db);
    res.json({
      won, myGuild: { name: myGuild.name, power: myPower },
      enemyGuild: { name: enemy.name, power: enemyPower },
      reward: { exp: won ? 200 : 50, spiritStone: won ? 100 : 20 },
      message: won ? `宗门战胜利！击败${enemy.name}` : `宗门战惜败于${enemy.name}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/war/guild-war', auth, async (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });

    const myGuild = db.guilds.find(g => g.id === member.guild_id);
    if (!myGuild) return res.status(400).json({ error: '仙盟不存在' });

    const enemyGuilds = db.guilds.filter(g => g.id !== myGuild.id);
    if (enemyGuilds.length === 0) return res.status(400).json({ error: '无对手仙盟' });

    const enemy = enemyGuilds[Math.floor(Math.random() * enemyGuilds.length)];

    const myMembers = db.guild_members.filter(m => m.guild_id === myGuild.id);
    const enemyMembers = db.guild_members.filter(m => m.guild_id === enemy.id);

    let myTotalPower = 0, enemyTotalPower = 0;
    for (const m of myMembers) {
      const c = db.characters.find(ch => ch.id === m.character_id);
      if (c) myTotalPower += (c.attack || 0) + (c.defense || 0) + (c.hp || 0);
    }
    for (const m of enemyMembers) {
      const c = db.characters.find(ch => ch.id === m.character_id);
      if (c) enemyTotalPower += (c.attack || 0) + (c.defense || 0) + (c.hp || 0);
    }

    const winChance = Math.min(0.85, Math.max(0.15, myTotalPower / (myTotalPower + enemyTotalPower)));
    const won = Math.random() < winChance;

    for (const m of myMembers) {
      const c = db.characters.find(ch => ch.id === m.character_id);
      if (c) {
        c.exp = (c.exp || 0) + (won ? 500 : 100);
        c.spirit_stone = (c.spirit_stone || 0) + (won ? 250 : 50);
        c.arena_points = (c.arena_points || 0) + (won ? 50 : 10);
      }
    }

    if (!myGuild.warResults) myGuild.warResults = [];
    myGuild.warResults.push({ enemy: enemy.name, won, type: 'guild_war', time: Date.now() });

    saveDatabase(db);
    res.json({
      won, myGuild: { name: myGuild.name, power: myTotalPower, members: myMembers.length },
      enemyGuild: { name: enemy.name, power: enemyTotalPower, members: enemyMembers.length },
      reward: { exp: won ? 500 : 100, spiritStone: won ? 250 : 50 },
      message: won ? `仙盟战大胜！击败${enemy.name}` : `仙盟战惜败于${enemy.name}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/modes', auth, (req, res) => {
  res.json({
    modes: [
      { id: 'explore', name: '野外探索', description: '挂机刷怪，获取经验和灵石' },
      { id: 'arena', name: '擂台战', description: '与其他玩家切磋，提升排名和竞技积分' },
      { id: 'duel', name: '斗法1v1', description: '指定对手，可押注灵石' },
      { id: 'dungeon', name: '副本挑战', description: '挑战副本Boss，获取稀有奖励' },
      { id: 'trial', name: '试炼之路', description: '逐层挑战，层数越高奖励越好' },
      { id: 'sect_war', name: '宗门战', description: '仙盟之间大规模团战' },
      { id: 'guild_war', name: '仙盟战', description: '仙盟间的领地争夺战' }
    ]
  });
});

module.exports = router;
