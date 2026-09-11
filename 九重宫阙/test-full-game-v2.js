const http = require('http');
const BASE = 'http://127.0.0.1:3000';

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ _html: data.substring(0,100) }); }
      });
    });
    req.on('error', e => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const ACCOUNTS = [
  { username: 'tester1', password: '123456', name: '墨渊真人' },
  { username: 'tester2', password: '123456', name: '清风道人' },
  { username: 'tester3', password: '123456', name: '铁骨修士' },
];

const results = { pass: 0, fail: 0, html: 0 };

function log(label, data) {
  if (data && data._html) { results.html++; console.log(`  ❌ ${label}: 返回HTML(路由缺失)`); }
  else if (data && (data.error || data.message === 'Not Found')) { results.fail++; console.log(`  ❌ ${label}: ${data.error||data.message}`); }
  else { results.pass++; const s = JSON.stringify(data); console.log(`  ✅ ${label}: ${s.length>120?s.substring(0,120)+'...':s}`); }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testAccount(acc, idx) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  账号${idx+1}: ${acc.username} (${acc.name})`);
  console.log(`${'='.repeat(60)}`);

  // 1. 注册
  let r = await api('POST', '/api/auth/register', { username: acc.username, password: acc.password, nickname: acc.name });
  const token = r.token;
  log('注册', r.token ? { token: '✅' } : r);
  if (!token) return;

  // 2. 登录
  r = await api('POST', '/api/auth/login', { username: acc.username, password: acc.password });
  log('登录', r.token ? { token: '✅' } : r);

  // 3. 角色信息
  r = await api('GET', '/api/character/', null, token);
  log('角色信息', r);

  // 4. 角色属性
  r = await api('GET', '/api/character/stats', null, token);
  log('角色属性', r);

  // 5. 装备列表
  r = await api('GET', '/api/character/equipments', null, token);
  log('装备列表', r);

  // 6. 功法列表
  r = await api('GET', '/api/character/gongfa', null, token);
  log('角色功法', r);

  // 7. 灵宠列表
  r = await api('GET', '/api/character/pets', null, token);
  log('角色灵宠', r);

  // 8. 背包
  r = await api('GET', '/api/character/inventory', null, token);
  log('背包', r);

  // 9. 灵根
  r = await api('GET', '/api/character/spirit-roots', null, token);
  log('灵根', r);

  // 10. 修炼状态
  r = await api('GET', '/api/cultivation/status', null, token);
  log('修炼状态', r);

  // 11. 修炼
  r = await api('POST', '/api/cultivation/cultivate', { duration: 10 }, token);
  log('修炼10秒', r);

  // 12. 境界信息
  r = await api('GET', '/api/cultivation/realm', null, token);
  log('境界信息', r);

  // 13. 是否可突破
  r = await api('GET', '/api/cultivation/can-breakthrough', null, token);
  log('可突破', r);

  // 14. 战斗敌人
  r = await api('GET', '/api/battle/enemy', null, token);
  log('战斗敌人', r);

  // 15. 战斗
  r = await api('POST', '/api/battle/battle', { map_id: 1 }, token);
  log('战斗', r);

  // 16. 战斗模式
  r = await api('GET', '/api/battle/modes', null, token);
  log('战斗模式', r);

  // 17. 锻造配方
  r = await api('GET', '/api/forge/recipes', null, token);
  log('锻造配方', r);

  // 18. 炼丹丹方
  r = await api('GET', '/api/alchemy/recipes', null, token);
  log('丹方', r);

  // 19. 洞府
  r = await api('GET', '/api/cave/info', null, token);
  log('洞府', r);

  // 20. 宗门列表
  r = await api('GET', '/api/guild/list', null, token);
  log('宗门列表', r);

  // 21. 副本列表
  r = await api('GET', '/api/dungeon/list', null, token);
  log('副本列表', r);

  // 22. VIP信息
  r = await api('GET', '/api/vip/info', null, token);
  log('VIP信息', r);

  // 23. 签到状态
  r = await api('GET', '/api/checkin/status', null, token);
  log('签到状态', r);

  // 24. 签到
  r = await api('POST', '/api/checkin/', {}, token);
  log('签到', r);

  // 25. 成就列表
  r = await api('GET', '/api/achievement/list', null, token);
  log('成就列表', r);

  // 26. 商城
  r = await api('GET', '/api/shop/items', null, token);
  log('商城商品', r);

  // 27. 技能列表
  r = await api('GET', '/api/skill/list', null, token);
  log('技能列表', r);

  // 28. 灵宠列表
  r = await api('GET', '/api/pet/list', null, token);
  log('灵宠列表', r);

  // 29. 竞技场排行
  r = await api('GET', '/api/battle/arena/rankings', null, token);
  log('竞技场排行', r);

  // 30. 功法列表
  r = await api('GET', '/api/gongfa/list', null, token);
  log('功法列表', r);

  // 31. 任务列表
  r = await api('GET', '/api/quests/list', null, token);
  log('任务列表', r);

  // 32. 邀请信息
  r = await api('GET', '/api/invite/info', null, token);
  log('邀请信息', r);

  // 33. 聊天频道
  r = await api('GET', '/api/chat/channels', null, token);
  log('聊天频道', r);

  // 34. 聊天记录
  r = await api('GET', '/api/chat/history', null, token);
  log('聊天记录', r);

  // 35. 赛季
  r = await api('GET', '/api/season/info', null, token);
  log('赛季信息', r);

  // 36. 挂机状态
  r = await api('GET', '/api/afk/status', null, token);
  log('挂机状态', r);

  // 37. 挂机开始
  r = await api('POST', '/api/afk/start', { map_id: 1 }, token);
  log('开始挂机', r);

  // 38. 公告
  r = await api('GET', '/api/announcements/list', null, token);
  log('公告列表', r);

  // 39. 系统信息
  r = await api('GET', '/api/systems/info', null, token);
  log('系统信息', r);

  // 40. 管理后台
  r = await api('GET', '/api/admin/stats', null, token);
  log('管理统计', r);

  // 41. 战斗技能
  r = await api('GET', '/api/battle/skills', null, token);
  log('战斗技能', r);

  // 42. 阵法
  r = await api('GET', '/api/formations/list', null, token);
  log('阵法列表', r);

  // 43. 法宝
  r = await api('GET', '/api/talismans/list', null, token);
  log('法宝列表', r);

  console.log(`  ✅ ${acc.username} 测试完成`);
}

async function main() {
  console.log('🎮 九重宫阙 - 多账号全流程修仙测试 v2');
  console.log('服务器: ' + BASE);
  console.log('时间: ' + new Date().toLocaleString());
  
  for (let i = 0; i < ACCOUNTS.length; i++) {
    await testAccount(ACCOUNTS[i], i);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('  📊 测试汇总');
  console.log(`${'='.repeat(60)}`);
  console.log(`  ✅ 通过: ${results.pass}`);
  console.log(`  ❌ 失败: ${results.fail}`);
  console.log(`  ⚠️  HTML返回(路由缺失): ${results.html}`);
  console.log(`  总计: ${results.pass + results.fail + results.html}`);
}

main().catch(console.error);
