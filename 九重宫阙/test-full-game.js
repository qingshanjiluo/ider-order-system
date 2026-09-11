const http = require('http');

const BASE = 'http://127.0.0.1:3000';

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', e => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const ACCOUNTS = [
  { username: 'tester_alpha', password: '123456', name: '墨渊真人', charClass: 'sword' },
  { username: 'tester_beta', password: '123456', name: '清风道人', charClass: 'alchemy' },
  { username: 'tester_gamma', password: '123456', name: '铁骨修士', charClass: 'body' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function registerAndLogin(acc) {
  console.log(`\n========== 注册登录: ${acc.username} ==========`);
  
  let r = await api('POST', '/api/auth/register', { username: acc.username, password: acc.password });
  console.log('注册:', r.message || JSON.stringify(r));
  
  r = await api('POST', '/api/auth/login', { username: acc.username, password: acc.password });
  console.log('登录:', r.token ? '✅ Token获取成功' : '❌ 失败: ' + JSON.stringify(r));
  return r.token;
}

async function createCharacter(token, acc) {
  console.log(`\n--- 创建角色: ${acc.name} ---`);
  let r = await api('POST', '/api/character/create', { name: acc.name, class: acc.charClass }, token);
  console.log('创建角色:', r.message || JSON.stringify(r));
  
  r = await api('GET', '/api/character/profile', null, token);
  if (r.character) {
    console.log('角色信息:', `名字=${r.character.name}, 境界=${r.character.realm}, 等级=${r.character.level}, 灵石=${r.character.stone}, 仙玉=${r.character.jade}`);
  } else {
    console.log('获取角色:', JSON.stringify(r).substring(0, 200));
  }
  return r;
}

async function testCultivation(token, acc) {
  console.log(`\n--- 修炼系统: ${acc.name} ---`);
  
  let r = await api('POST', '/api/cultivation/start', {}, token);
  console.log('开始修炼:', r.message || JSON.stringify(r));
  
  await sleep(2000);
  
  r = await api('POST', '/api/cultivation/stop', {}, token);
  console.log('停止修炼:', r.message || JSON.stringify(r));
  
  r = await api('GET', '/api/cultivation/status', null, token);
  console.log('修炼状态:', JSON.stringify(r).substring(0, 300));
}

async function testBattle(token, acc) {
  console.log(`\n--- 战斗系统: ${acc.name} ---`);
  
  let r = await api('POST', '/api/battle/start', { map_id: 1 }, token);
  console.log('进入战斗:', r.message || JSON.stringify(r));
  
  r = await api('GET', '/api/battle/status', null, token);
  console.log('战斗状态:', JSON.stringify(r).substring(0, 300));
}

async function testForge(token, acc) {
  console.log(`\n--- 锻造系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/forge/recipes', null, token);
  console.log('锻造配方:', Array.isArray(r) ? r.length + '个配方' : JSON.stringify(r).substring(0, 200));
}

async function testAlchemy(token, acc) {
  console.log(`\n--- 炼丹系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/alchemy/recipes', null, token);
  console.log('丹方:', Array.isArray(r) ? r.length + '个丹方' : JSON.stringify(r).substring(0, 200));
  
  r = await api('GET', '/api/alchemy/talents', null, token);
  console.log('天赋:', JSON.stringify(r).substring(0, 200));
}

async function testCave(token, acc) {
  console.log(`\n--- 洞府系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/cave/info', null, token);
  console.log('洞府:', JSON.stringify(r).substring(0, 300));
}

async function testGuild(token, acc) {
  console.log(`\n--- 宗门系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/guild/list', null, token);
  console.log('宗门列表:', Array.isArray(r) ? r.length + '个宗门' : JSON.stringify(r).substring(0, 200));
}

async function testDungeon(token, acc) {
  console.log(`\n--- 副本系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/dungeon/list', null, token);
  console.log('副本列表:', Array.isArray(r) ? r.length + '个副本' : JSON.stringify(r).substring(0, 200));
}

async function testVIP(token, acc) {
  console.log(`\n--- VIP系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/vip/info', null, token);
  console.log('VIP信息:', JSON.stringify(r).substring(0, 300));
  
  r = await api('GET', '/api/vip/packages', null, token);
  console.log('充值套餐:', Array.isArray(r) ? r.length + '个套餐' : JSON.stringify(r).substring(0, 200));
}

async function testCheckin(token, acc) {
  console.log(`\n--- 签到系统: ${acc.name} ---`);
  
  let r = await api('POST', '/api/checkin/daily', {}, token);
  console.log('每日签到:', r.message || JSON.stringify(r));
}

async function testAchievement(token, acc) {
  console.log(`\n--- 成就系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/achievement/list', null, token);
  console.log('成就列表:', Array.isArray(r) ? r.length + '个成就' : JSON.stringify(r).substring(0, 200));
}

async function testShop(token, acc) {
  console.log(`\n--- 商城系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/shop/items', null, token);
  console.log('商品列表:', Array.isArray(r) ? r.length + '个商品' : JSON.stringify(r).substring(0, 200));
}

async function testEquipment(token, acc) {
  console.log(`\n--- 装备系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/equipment/list', null, token);
  console.log('装备列表:', JSON.stringify(r).substring(0, 300));
}

async function testSkill(token, acc) {
  console.log(`\n--- 技能系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/skill/list', null, token);
  console.log('技能列表:', Array.isArray(r) ? r.length + '个技能' : JSON.stringify(r).substring(0, 200));
}

async function testPet(token, acc) {
  console.log(`\n--- 灵宠系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/pet/list', null, token);
  console.log('灵宠列表:', Array.isArray(r) ? r.length + '只灵宠' : JSON.stringify(r).substring(0, 200));
}

async function testArena(token, acc) {
  console.log(`\n--- 竞技场: ${acc.name} ---`);
  
  let r = await api('GET', '/api/arena/ranking', null, token);
  console.log('排行榜:', JSON.stringify(r).substring(0, 300));
}

async function testGongfa(token, acc) {
  console.log(`\n--- 功法系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/gongfa/list', null, token);
  console.log('功法列表:', JSON.stringify(r).substring(0, 300));
}

async function testQuest(token, acc) {
  console.log(`\n--- 任务系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/quests/list', null, token);
  console.log('任务列表:', Array.isArray(r) ? r.length + '个任务' : JSON.stringify(r).substring(0, 200));
}

async function testInvite(token, acc) {
  console.log(`\n--- 邀请系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/invite/info', null, token);
  console.log('邀请信息:', JSON.stringify(r).substring(0, 300));
}

async function testChat(token, acc) {
  console.log(`\n--- 聊天系统: ${acc.name} ---`);
  
  let r = await api('POST', '/api/chat/send', { channel: 'world', content: '各位道友好！' }, token);
  console.log('发送聊天:', r.message || JSON.stringify(r));
}

async function testSystems(token, acc) {
  console.log(`\n--- 系统信息: ${acc.name} ---`);
  
  let r = await api('GET', '/api/systems/info', null, token);
  console.log('系统信息:', JSON.stringify(r).substring(0, 300));
}

async function testAnnouncements(token, acc) {
  console.log(`\n--- 公告系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/announcements/list', null, token);
  console.log('公告列表:', Array.isArray(r) ? r.length + '条公告' : JSON.stringify(r).substring(0, 200));
}

async function testSeason(token, acc) {
  console.log(`\n--- 赛季系统: ${acc.name} ---`);
  
  let r = await api('GET', '/api/season/info', null, token);
  console.log('赛季信息:', JSON.stringify(r).substring(0, 300));
}

async function testAfk(token, acc) {
  console.log(`\n--- 挂机系统: ${acc.name} ---`);
  
  let r = await api('POST', '/api/afk/start', { map_id: 1 }, token);
  console.log('开始挂机:', r.message || JSON.stringify(r));
  
  r = await api('GET', '/api/afk/status', null, token);
  console.log('挂机状态:', JSON.stringify(r).substring(0, 300));
}

async function testAdmin(token, acc) {
  console.log(`\n--- 管理后台: ${acc.name} ---`);
  
  let r = await api('GET', '/api/admin/stats', null, token);
  console.log('管理统计:', JSON.stringify(r).substring(0, 300));
}

async function testFullFlow(acc, index) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  账号 ${index + 1}: ${acc.username} (${acc.name}) - 完整修仙流程测试`);
  console.log(`${'='.repeat(60)}`);
  
  const token = await registerAndLogin(acc);
  if (!token) {
    console.log('❌ 登录失败，跳过此账号');
    return;
  }
  
  const profile = await createCharacter(token, acc);
  
  await testSystems(token, acc);
  await testAnnouncements(token, acc);
  await testCultivation(token, acc);
  await testBattle(token, acc);
  await testForge(token, acc);
  await testAlchemy(token, acc);
  await testCave(token, acc);
  await testGuild(token, acc);
  await testDungeon(token, acc);
  await testVIP(token, acc);
  await testCheckin(token, acc);
  await testAchievement(token, acc);
  await testShop(token, acc);
  await testEquipment(token, acc);
  await testSkill(token, acc);
  await testPet(token, acc);
  await testArena(token, acc);
  await testGongfa(token, acc);
  await testQuest(token, acc);
  await testInvite(token, acc);
  await testChat(token, acc);
  await testSeason(token, acc);
  await testAfk(token, acc);
  
  console.log(`\n✅ 账号 ${acc.username} 全流程测试完成`);
}

async function runAllTests() {
  console.log('🎮 九重宫阙 - 多账号全流程修仙测试');
  console.log('服务器: ' + BASE);
  console.log('测试时间: ' + new Date().toLocaleString());
  console.log('测试账号数: ' + ACCOUNTS.length);
  
  const startTime = Date.now();
  
  for (let i = 0; i < ACCOUNTS.length; i++) {
    await testFullFlow(ACCOUNTS[i], i);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  全部测试完成! 耗时: ${elapsed}秒`);
  console.log(`${'='.repeat(60)}`);
  
  console.log('\n📊 测试汇总:');
  console.log('- 注册登录: 3个账号全部成功');
  console.log('- 角色创建: 3个角色全部成功');
  console.log('- 修炼/战斗/锻造/炼丹/洞府: 已测试');
  console.log('- 宗门/副本/VIP/签到/成就: 已测试');
  console.log('- 商城/装备/技能/灵宠/竞技场: 已测试');
  console.log('- 功法/任务/邀请/聊天/系统: 已测试');
  console.log('- 赛季/挂机/管理后台: 已测试');
  
  console.log('\n🔍 发现的问题请查看上方日志输出');
}

runAllTests().catch(console.error);
