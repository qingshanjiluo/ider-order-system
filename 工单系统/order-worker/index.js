/**
 * 艾德尔工单自动执行 Worker
 * 替代缺失的 GitHub Actions，定时扫描并执行已审核工单
 * 支持：批量注册、传人月卡、传人派出、每日试炼、副本刷取
 * 包含防封检测、API签名、限速控制
 */

const MAX_ORDERS_PER_RUN = 3;
const MAX_ACCOUNTS_PER_ORDER = 5;
const ORDER_BATCH_DELAY_MS = 5000;
const ACCOUNT_DELAY_MS = 3000;

const ISP_IPS = [
  '61.148.','61.149.','61.150.','61.151.','61.152.',
  '114.241.','114.242.','114.243.','114.244.',
  '36.1.','36.2.','36.3.','36.4.','36.5.',
  '58.30.','58.31.','58.32.','58.33.',
  '120.0.','120.1.','120.2.',
  '111.192.','111.193.','111.194.','111.195.',
  '117.136.','117.137.','117.138.',
  '106.2.','106.3.','106.4.',
];
const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; SM-S908E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Xiaomi14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.144 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; V2183A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36',
];

function randomIP() {
  const p = ISP_IPS[Math.floor(Math.random() * ISP_IPS.length)];
  return p + (Math.floor(Math.random() * 254) + 1) + '.' + (Math.floor(Math.random() * 254) + 1);
}
function generateMachineId(idx) {
  const s = idx * 7 + Date.now() % 10000;
  const hex = Array.from({length:6}, (_,i) => ((s*(i+1))%256).toString(16).padStart(2,'0')).join(':').toUpperCase();
  return hex;
}
function buildHeaders(idx) {
  const ip = randomIP();
  const ua = USER_AGENTS[idx % USER_AGENTS.length];
  return {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'X-Forwarded-For': ip,
    'X-Real-IP': ip,
    'X-Client-IP': ip,
    'Cache-Control': 'no-cache',
  };
}

function makeSign(method, path, timestamp, bodyStr, signKey) {
  const enc = new TextEncoder();
  const data = enc.encode(method + '\n' + path + '\n' + timestamp + '\n' + bodyStr);
  return crypto.subtle.importKey('raw', enc.encode(signKey), {name:'HMAC',hash:'SHA-256'}, false, ['sign'])
    .then(k => crypto.subtle.sign('HMAC', k, data))
    .then(sig => Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join(''));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomName() {
  const p = ['Celestial','Mystic','Shadow','Phoenix','Dragon','Thunder','Crystal','Iron','Jade','Silver','Golden','Dark','Light','Storm','Wind','Fire','Water','Earth','Star','Moon','Sun'];
  const r = ['Fox','Wolf','Tiger','Eagle','Lion','Bear','Falcon','Serpent','Owl','Crane','Deer','Knight','Blade','Soul','Spirit','Monk','Sage','Lord','King','Saint'];
  return p[Math.floor(Math.random()*p.length)] + r[Math.floor(Math.random()*r.length)] + (Math.floor(Math.random()*999)+1);
}

async function gameApi(method, path, token, body, env, idx) {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = await makeSign(method, path, ts, bodyStr, env.SIGN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Version': env.CLIENT_VERSION,
    'X-Sign-T': String(ts),
    'X-Sign': sign,
    ...buildHeaders(idx || 0),
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(env.GAME_API + path, {
    method, headers, body: bodyStr || undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('Non-JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data?.error || 'Request failed(' + r.status + ')');
  return data;
}

async function orderApi(path, method, body, env) {
  const headers = { 'X-API-Key': env.API_KEY, 'Content-Type': 'application/json' };
  const url = env.ORDER_API + path;
  const r = await fetch(url, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return r.json();
}

async function reportAccount(env, orderId, data) {
  try { await orderApi('/api/gh/report-account', 'POST', { order_id: orderId, ...data }); } catch(e) {}
}
async function reportLog(env, orderId, username, logType, message) {
  try { await orderApi('/api/gh/report-log', 'POST', { order_id: orderId, username, log_type: logType, message }); } catch(e) {}
}

// ═══════════════════════════════════════════
// 批量注册工单处理
// ═══════════════════════════════════════════
async function processBatchRegister(order, env) {
  const orderId = order.id;
  const quantity = Number(order.quantity) || 0;
  const inviteCode = order.invite_code || '';

  const countData = await orderApi('/api/gh/account-count?order_id=' + orderId);
  const existing = countData?.count || 0;
  const needed = quantity + 1 - existing;
  if (needed <= 0) {
    console.log(`  订单#${orderId} 已创建 ${existing}/${quantity} 个账号，跳过`);
    return true;
  }
  console.log(`  订单#${orderId} 需创建 ${needed} 个账号 (已有 ${existing}/${quantity})`);

  let created = 0;
  for (let i = 0; i < Math.min(needed, MAX_ACCOUNTS_PER_ORDER); i++) {
    try {
      const ok = await registerOneAccount(order, env, i);
      if (ok) created++;
      if (created % 3 === 0) {
        console.log(`    暂停 30s (已创建 ${created})...`);
        await sleep(30000 + Math.random() * 15000);
      } else {
        await sleep(ACCOUNT_DELAY_MS + Math.random() * 2000);
      }
    } catch(e) {
      console.log(`    注册失败: ${e.message}`);
      await sleep(5000);
    }
  }
  console.log(`  订单#${orderId} 本轮创建 ${created} 个账号`);
  if (created > 0) {
    await reportLog(env, orderId, '', 'batch_register', `本轮创建 ${created} 个账号`);
  }
  return true;
}

async function registerOneAccount(order, env, idx) {
  const orderId = order.id;
  const username = randomName();
  const password = 'A' + Math.random().toString(36).slice(2, 10) + '!1';
  const machineId = generateMachineId(idx);

  const checkData = await orderApi('/api/gh/check-username', 'POST', { username });
  if (checkData?.exists) throw new Error('Username exists');

  await reportAccount(env, orderId, { username, password, status: 'registering' });

  const regData = await gameApi('POST', '/auth/register', '', { username, password, machine_id: machineId }, env, idx);
  await sleep(1500);

  await reportAccount(env, orderId, { username, password, status: 'creating' });

  const charNames = [username.slice(0, 12), '仙友' + username.slice(0, 6), '道友' + (Math.floor(Math.random()*9000)+1000)];
  let charCreated = false;
  for (const name of charNames) {
    try {
      await gameApi('POST', '/player/create', regData.token, {
        name, spirit_roots: { metal: 100, wood: 20, water: 20, fire: 20, earth: 20 }
      }, env, idx);
      charCreated = true;
      break;
    } catch(e) {
      if (!e.message.includes('exists') && !e.message.includes('重复')) throw e;
      await sleep(1000);
    }
  }
  if (!charCreated) throw new Error('Character creation failed');

  await sleep(1000);

  if (order.invite_code) {
    try { await gameApi('POST', '/invite/bind', regData.token, { invite_code: order.invite_code }, env, idx); } catch(e) {}
  }

  for (const skillId of [1, 2, 3]) {
    try { await gameApi('POST', '/player/equip_skill', regData.token, { skill_id: skillId }, env, idx); } catch(e) {}
    await sleep(300);
  }

  try {
    const syncData = await gameApi('GET', '/player/sync', regData.token, null, env, idx);
    const inv = syncData?.player?.inventory || [];
    for (const page of inv) {
      if (!Array.isArray(page)) continue;
      for (let si = 0; si < page.length; si++) {
        const slot = page[si];
        if (slot?.item?.name === '铁剑' || slot?.item?.id === 1) {
          try { await gameApi('POST', '/player/equip', regData.token, { page: inv.indexOf(page), slot_index: si }, env, idx); } catch(e) {}
          break;
        }
      }
    }
  } catch(e) {}

  try { await gameApi('POST', '/player/set_technique', regData.token, { slot: 'main', technique_id: 1 }, env, idx); } catch(e) {}
  try { await gameApi('POST', '/player/set_map', regData.token, { map_id: 1 }, env, idx); } catch(e) {}
  await sleep(1000);
  try { await gameApi('POST', '/battle/start', regData.token, { mapId: 1, poll_mode: false, auto_restart: false }, env, idx); } catch(e) {}
  try { await gameApi('POST', '/battle/auto_restart', regData.token, { enabled: true, map_id: 1 }, env, idx); } catch(e) {}

  await reportAccount(env, orderId, {
    username, password, status: 'farming',
    level: 1, exp: 0,
    server_username: username, server_password: password,
  });
  await reportLog(env, orderId, username, 'register', `账号注册成功，开始挂机`);
  console.log(`    注册成功: ${username}`);
  return true;
}

// ═══════════════════════════════════════════
// 传人月卡工单处理
// ═══════════════════════════════════════════
async function processMonthlyCard(order, env) {
  const orderId = order.id;
  const username = order.game_account_name;
  const password = order.game_account_password;
  if (!username || !password) {
    console.log(`  订单#${orderId} 缺少账号信息`);
    return false;
  }

  try {
    const loginData = await gameApi('POST', '/auth/login', '', { username, password, machine_id: 'mc_' + Date.now() }, env, 0);
    const token = loginData.token;

    try {
      const syncData = await gameApi('GET', '/player/sync', token, null, env, 1);
      const player = syncData?.player;
      if (player) {
        await reportAccount(env, orderId, {
          username, password, status: 'farming',
          level: player.level || 1, exp: player.exp || 0,
        });
      }
    } catch(e) {}

    // 盟友日常
    try {
      const stateData = await gameApi('GET', '/player/state', token, null, env, 2);
      const allianceId = stateData?.player?.alliance_id;
      if (allianceId) {
        try { await gameApi('POST', '/alliance/spirit_pool/bathe', token, { alliance_id: allianceId }, env, 3); } catch(e) {}
        await sleep(1500);
        try { await gameApi('POST', '/alliance/garden/pick', token, { alliance_id: allianceId }, env, 4); } catch(e) {}
        await sleep(1500);
        try { await gameApi('POST', '/alliance/enlightenment_tree/meditate', token, { alliance_id: allianceId }, env, 5); } catch(e) {}
      }
    } catch(e) {}

    // 领取邮件
    try { await gameApi('POST', '/mail/claim_all', token, null, env, 6); } catch(e) {}

    await reportLog(env, orderId, username, 'monthly_card', '月卡日常完成');
    console.log(`  订单#${orderId} 月卡日常完成: ${username}`);
    return true;
  } catch(e) {
    console.log(`  订单#${orderId} 月卡失败: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════
// 传人派出工单处理
// ═══════════════════════════════════════════
async function processDispatch(order, env) {
  const orderId = order.id;
  const username = order.game_account_name;
  const password = order.game_account_password;
  if (!username || !password) {
    console.log(`  订单#${orderId} 缺少账号信息`);
    return false;
  }

  try {
    const loginData = await gameApi('POST', '/auth/login', '', { username, password, machine_id: 'dp_' + Date.now() }, env, 0);
    const token = loginData.token;

    // 召回传人
    try { await gameApi('POST', '/online/disciple/recall', token, null, env, 1); } catch(e) {}
    await sleep(2000);

    // 获取地图信息
    let mapId = 1;
    try {
      const syncData = await gameApi('GET', '/player/sync', token, null, env, 2);
      mapId = syncData?.player?.max_map_id || 1;
    } catch(e) {}

    // 材质轮换
    const mats = ['草木','金属','土石','液体','皮质','玉质'];
    const today = new Date().toISOString().slice(0, 10);
    const matIdx = (today.split('-').reduce((a,b) => a + Number(b), 0)) % mats.length;
    const mat = mats[matIdx];

    try {
      await gameApi('POST', '/online/disciple/send', token, {
        map_id: mapId, material_filter: mat
      }, env, 3);
    } catch(e) {}

    await reportLog(env, orderId, username, 'dispatch', `传人已派出到地图${mapId}采集${mat}`);
    console.log(`  订单#${orderId} 传人派出完成: ${username} -> 地图${mapId} ${mat}`);
    return true;
  } catch(e) {
    console.log(`  订单#${orderId} 传人派出失败: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════
// 每日试炼工单处理
// ═══════════════════════════════════════════
async function processDailyTrial(order, env) {
  const orderId = order.id;
  const username = order.game_account_name;
  const password = order.game_account_password;
  if (!username || !password) {
    console.log(`  订单#${orderId} 缺少账号信息`);
    return false;
  }

  try {
    const loginData = await gameApi('POST', '/auth/login', '', { username, password, machine_id: 'dt_' + Date.now() }, env, 0);
    const token = loginData.token;

    // 开始问心试炼
    try {
      const trialData = await gameApi('POST', '/trial/start', token, {}, env, 1);
      if (trialData?.battle_id) {
        // 推进战斗
        for (let i = 0; i < 60; i++) {
          await sleep(200);
          const adv = await gameApi('POST', '/trial/advance?state=lite', token, { battle_id: trialData.battle_id }, env, 2);
          if (adv?.ended) break;
        }
      }
    } catch(e) {
      console.log(`    问心试炼: ${e.message}`);
    }

    await reportLog(env, orderId, username, 'daily_trial', '每日试炼完成');
    console.log(`  订单#${orderId} 每日试炼完成: ${username}`);
    return true;
  } catch(e) {
    console.log(`  订单#${orderId} 每日试炼失败: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════
// 副本刷取工单处理
// ═══════════════════════════════════════════
async function processDungeonClear(order, env) {
  const orderId = order.id;
  const username = order.game_account_name;
  const password = order.game_account_password;
  if (!username || !password) {
    console.log(`  订单#${orderId} 缺少账号信息`);
    return false;
  }

  try {
    const loginData = await gameApi('POST', '/auth/login', '', { username, password, machine_id: 'dc_' + Date.now() }, env, 0);
    const token = loginData.token;

    let dungeons = [];
    try {
      const listData = await gameApi('GET', '/dungeon/list', token, null, env, 1);
      dungeons = listData?.dungeons || [];
    } catch(e) {}

    for (const dg of dungeons) {
      for (let round = 0; round < 2; round++) {
        try {
          const startData = await gameApi('POST', '/dungeon-battle/start', token, { dungeon_id: dg.id }, env, 2);
          if (!startData?.battle_id) continue;
          for (let i = 0; i < 60; i++) {
            await sleep(200);
            const adv = await gameApi('POST', '/dungeon-battle/advance?state=lite', token, { battle_id: startData.battle_id }, env, 3);
            if (adv?.ended) break;
          }
          await sleep(2000);
        } catch(e) {}
      }
    }

    await reportLog(env, orderId, username, 'dungeon_clear', `副本刷取完成，共${dungeons.length}个副本`);
    console.log(`  订单#${orderId} 副本刷取完成: ${username}`);
    return true;
  } catch(e) {
    console.log(`  订单#${orderId} 副本刷取失败: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════
// 升级引擎（替代 auto_levelup_all）
// ═══════════════════════════════════════════
async function processLevelUp(env) {
  let accounts = [];
  try {
    const data = await orderApi('/api/gh/all-accounts', 'GET', null, env);
    accounts = data?.accounts || [];
  } catch(e) {
    console.log('获取账号列表失败: ' + e.message);
    return;
  }
  if (accounts.length === 0) {
    console.log('没有需要升级的账号');
    return;
  }
  console.log(`升级引擎: ${accounts.length} 个账号待处理`);

  let processed = 0;
  for (const acct of accounts) {
    if (processed >= 20) break;
    try {
      await levelUpOneAccount(acct, env, processed);
      processed++;
      await sleep(2000 + Math.random() * 2000);
    } catch(e) {
      console.log(`  升级失败 ${acct.username}: ${e.message}`);
      await sleep(1000);
    }
  }
  console.log(`升级引擎: 本轮处理 ${processed} 个账号`);
}

async function levelUpOneAccount(acct, env, idx) {
  const orderId = acct.order_id;
  const username = acct.username || acct.server_username;
  const password = acct.password || acct.server_password;
  if (!username || !password) return;

  const loginData = await gameApi('POST', '/auth/login', '', {
    username, password, machine_id: 'lv_' + idx + '_' + Date.now()
  }, env, idx);
  const token = loginData.token;

  // 确保角色存在
  try {
    const syncData = await gameApi('GET', '/player/sync', token, null, env, idx);
    if (!syncData?.hasCharacter) {
      await gameApi('POST', '/player/create', token, {
        name: username.slice(0, 12),
        spirit_roots: { metal: 100, wood: 20, water: 20, fire: 20, earth: 20 }
      }, env, idx);
    }
  } catch(e) {}

  // 确保战斗中
  try {
    const stateData = await gameApi('GET', '/player/state', token, null, env, idx);
    const player = stateData?.player;
    const level = player?.level || 1;

    // 升级循环
    for (let i = 0; i < 50; i++) {
      try {
        const upData = await gameApi('POST', '/player/level_up', token, {}, env, idx);
        if (!upData?.ok) break;
      } catch(e) { break; }
    }

    // 突破
    const newLevel = level;
    if (newLevel >= 100) {
      try { await gameApi('POST', '/player/breakthrough', token, {}, env, idx); } catch(e) {}
    }

    // 报告状态
    try {
      const finalSync = await gameApi('GET', '/player/sync', token, null, env, idx);
      const p = finalSync?.player;
      await reportAccount(env, orderId, {
        username, password, status: 'farming',
        level: p?.level || level, exp: p?.exp || 0,
      });
      await reportLog(env, orderId, username, 'levelup', `升级完成，当前等级 ${p?.level || level}`);
    } catch(e) {}
  } catch(e) {}
}

// ═══════════════════════════════════════════
// 工单分发器
// ═══════════════════════════════════════════
function classifyOrder(order) {
  const type = String(order.order_type || '').trim();
  const hasAccount = Boolean(order.game_account_name);
  const isSubscription = hasAccount && Boolean(order.subscription_end);

  if (type.includes('批量注册') || type.includes('代练') || type.includes('代打') || type.includes('托管')) return 'batch_register';
  if (type.includes('传人派出') || type.includes('派遣')) return 'dispatch';
  if (type.includes('每日试炼')) return 'daily_trial';
  if (type.includes('副本刷取') || type.includes('副本')) return 'dungeon_clear';
  if (type.includes('试炼测试')) return 'trial_test';
  if (isSubscription) return 'monthly_card';
  if (hasAccount) return 'monthly_card';
  return 'batch_register';
}

async function dispatchOrder(order, env) {
  const type = classifyOrder(order);
  console.log(`订单#${order.id} [${order.order_type}] -> ${type}`);

  switch(type) {
    case 'batch_register': return processBatchRegister(order, env);
    case 'monthly_card': return processMonthlyCard(order, env);
    case 'dispatch': return processDispatch(order, env);
    case 'daily_trial': return processDailyTrial(order, env);
    case 'dungeon_clear': return processDungeonClear(order, env);
    case 'trial_test':
      try { await orderApi('/api/gh/process-trial-test', 'POST', { order_id: order.id, game_account_name: order.game_account_name }); } catch(e) {}
      return true;
    default: return processMonthlyCard(order, env);
  }
}

// ═══════════════════════════════════════════
// Worker 入口
// ═══════════════════════════════════════════
export default {
  async scheduled(event, env, ctx) {
    console.log(`[CRON] ${new Date().toISOString()} 开始执行`);
    ctx.waitUntil(run(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      ctx.waitUntil(run(env));
      return new Response(JSON.stringify({ ok: true, message: '执行已启动' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Order Worker', { status: 200 });
  }
};

async function run(env) {
  console.log('═══════════════════════════════════════');
  console.log('  工单自动执行系统');
  console.log('  时间: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════');

  // 1. 处理工单
  let orders = [];
  try {
    const data = await orderApi('/api/gh/approved-orders', 'GET', null, env);
    orders = data?.orders || [];
  } catch(e) {
    console.log('获取工单失败: ' + e.message);
    return;
  }
  console.log(`已审核工单: ${orders.length} 个`);

  let processed = 0;
  for (const order of orders) {
    if (processed >= MAX_ORDERS_PER_RUN) {
      console.log(`达到单次上限 ${MAX_ORDERS_PER_RUN}，剩余下次执行`);
      break;
    }
    try {
      await dispatchOrder(order, env);
      processed++;
      await sleep(ORDER_BATCH_DELAY_MS);
    } catch(e) {
      console.log(`订单#${order.id} 异常: ${e.message}`);
      await sleep(2000);
    }
  }

  // 2. 升级引擎
  try { await processLevelUp(env); } catch(e) { console.log('升级引擎异常: ' + e.message); }

  console.log(`[完成] 本轮处理 ${processed} 个工单`);
}
