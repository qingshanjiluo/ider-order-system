/**
 * 艾德尔工单系统 - GitHub Actions 订单扫描器
 * 扫描已审核通过的工单，自动注册账号并开始刷怪
 * 内置防封检测：独立IP/机器码/指纹轮换/随机延迟
 * 完整流程：注册→创建角色(金灵根100)→绑定邀请码→装备技能/功法/武器→战斗+自动刷怪
 */
const crypto = require('crypto');
// Node.js 20+ 内置 fetch，无需 node-fetch
const antiDetect = require('./_anti_detect');

// ⚠️ 必须指向 Pages Functions —— 它是唯一实现完整 /api/gh/* 的 API，
//    包含 /api/gh/account-count（账号数守卫）与 report-account 的服务端
//    "已达订购上限(capped)"硬上限。
//    不要再指向遗留 Worker `ider-order-system.sifangzhiji.workers.dev`：
//    它缺少 /api/gh/account-count（返回 404），会让"已有账号数"恒为 0，
//    导致每次扫描对每张工单都新建 50 个账号（历史上 #193 曾达 4924 个）。
const WORKER_URL = process.env.ORDER_API_URL || 'https://ider-order-system.pages.dev';
const API_KEY = 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';
const API_BASE = process.env.API_BASE || 'https://ideer-game-api.sifangzhiji.workers.dev';
const CLIENT_VERSION = process.env.CLIENT_VERSION || '1.2.4';
const SIGN_KEY = process.env.SIGN_KEY || 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

// 启动前验证关键环境变量
const REQUIRED_ENV = { WORKER_URL, API_KEY, API_BASE, SIGN_KEY };
for (const [name, val] of Object.entries(REQUIRED_ENV)) {
  if (!val) {
    console.error(`错误: 环境变量 ${name} 未设置`);
    process.exit(1);
  }
}
console.log('[配置] WORKER_URL=' + WORKER_URL);
console.log('[配置] API_BASE=' + API_BASE);
console.log('[配置] CLIENT_VERSION=' + CLIENT_VERSION);

let _apiIdx = 0;
function setApiIdx(idx) { _apiIdx = idx; }

function makeSign(method, path, timestamp, bodyStr) {
  const hmac = crypto.createHmac('sha256', SIGN_KEY);
  hmac.update(method + '\n' + path + '\n' + timestamp + '\n' + bodyStr);
  return hmac.digest('hex');
}

async function apiRequest(method, path, token, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = makeSign(method, path, timestamp, bodyStr);
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Version': CLIENT_VERSION,
    'X-Sign-T': String(timestamp),
    'X-Sign': sign,
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  Object.assign(headers, antiDetect.buildAntiDetectHeaders(_apiIdx++));
  const r = await fetch(API_BASE + path, { method, headers, body: bodyStr || undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败(' + r.status + ')');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function tsLog(msg) {
  const now = new Date();
  const t = now.toLocaleString('zh-CN', { hour12: false });
  console.log(`[${t}] ${msg}`);
}

// 调用 Worker API。遇到非 2xx / 非 JSON / 带 error 字段的响应一律抛错，
// 绝不再把 404（{"error":"Not found"}）当成正常数据，否则计数守卫会被静默绕过。
async function workerApi(path, method = 'GET', body = null) {
  const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
  const url = WORKER_URL.replace(/\/+$/, '') + path;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Worker 非JSON响应(' + r.status + '): ' + text.slice(0, 120));
  }
  if (!r.ok) throw new Error('Worker 请求失败(' + r.status + '): ' + ((data && data.error) || text.slice(0, 120)));
  if (data && data.error) throw new Error('Worker 返回错误: ' + data.error);
  return data;
}

// 批量日志收集器（减少D1调用）
const logBatch = [];
let logFlushTimer = null;

function collectLog(log) {
  logBatch.push(log);
  // 每10条或定时刷新
  if (logBatch.length >= 10) {
    flushLogs();
  } else if (!logFlushTimer) {
    logFlushTimer = setTimeout(flushLogs, 5000);
  }
}

async function flushLogs() {
  if (logFlushTimer) { clearTimeout(logFlushTimer); logFlushTimer = null; }
  if (logBatch.length === 0) return;
  
  const logsToSend = logBatch.splice(0, 50);
  try {
    await workerApi('/api/gh/report-logs-batch', 'POST', { logs: logsToSend });
  } catch (e) {
    // 失败时尝试单条发送
    for (const log of logsToSend) {
      try { await workerApi('/api/gh/report-log', 'POST', log); } catch (e2) { /* 忽略 */ }
    }
  }
}

/**
 * 完整注册+配置流程（参照 batch.js 的 BatchEngine.processAccount）
 * 1) 注册 → 2) 创建角色(金灵根100) → 3) 绑定邀请码 →
 * 4) 装备技能(重击/火球术/治疗术) → 5) 装备铁剑 →
 * 6) 设置功法(吐纳法) → 7) 切换地图(荒石村) → 8) 开始战斗+自动刷怪
 * 含重试机制：如果用户名重复自动重试，最多5次
 */
async function registerAndSetup(workerOrder, orderIdx) {
  const inviteCode = workerOrder.invite_code || '';
  const usedNames = new Set();

  for (let retry = 0; retry < 5; retry++) {
    const apiIdx = orderIdx * 30 + retry * 5;
    setApiIdx(apiIdx);

    // 生成长度不超过16的用户名（确保角色名截取8字符后可读）
    const username = antiDetect.randomUsername(16, [...usedNames]);
    const password = antiDetect.randomPassword();

    if (retry > 0) {
      tsLog('[' + username + '] 重试第 ' + (retry + 1) + ' 次' + (inviteCode ? ' (邀请码: ' + inviteCode + ')' : ''));
    } else {
      tsLog('[' + username + '] 开始注册' + (inviteCode ? ' (邀请码: ' + inviteCode + ')' : ''));
    }

    // 预检：通过 Worker 查询用户名是否已存在
    try {
      const checkRes = await workerApi('/api/gh/check-username', 'POST', { username });
      if (checkRes.exists) {
        tsLog('[' + username + '] ⚠️ 用户名已被占用，重新生成...');
        usedNames.add(username);
        continue;
      }
    } catch (e) {
      // 预检接口失败则继续，后续会捕获游戏服错误
    }

    // ⚠️ 必须在 try 之外声明：catch 分支（重复重试 / 失败上报 / 错误日志）也要引用它。
    // 之前用 const 声明在 try 内，catch 里引用会抛
    // ReferenceError: accountId is not defined，导致整轮扫描崩溃退出。
    let accountId = 0;

    try {
      const machineId = antiDetect.generateMachineId(apiIdx);
      const stepDelay = () => antiDetect.randomDelay(1200, 2500);

      // ── 1) 注册账号 ──
      const regData = await apiRequest('POST', '/auth/register', '', {
        username, password, machine_id: machineId,
      });
      const token = regData.token;
      tsLog('[' + username + '] ✅ 注册成功 (accountId=' + regData.accountId + ')');
      await stepDelay();

      // 上报 Worker：账号已创建（返回 account_id）
      const reportRes = await workerApi('/api/gh/report-account', 'POST', {
        order_id: workerOrder.id, username, password,
        server_username: username, server_password: password,
        status: 'creating',
      });
      // 若已达订购数量上限（服务端硬上限），跳过本次注册
      if (reportRes.capped) {
        tsLog('[' + username + '] ⛔ 已达订购数量上限，跳过注册');
        return { username, ok: false, capped: true, error: reportRes.message || '已达上限' };
      }
      accountId = reportRes.account_id || 0;

      // ── 2) 创建角色（金灵根100），角色名冲突时自动加后缀重试 ──
      let playerName = username.slice(0, 12);
      let createData, characterName, createdResultData, spiritRoots;
      for (let nameRetry = 0; nameRetry < 15; nameRetry++) {
        if (nameRetry > 0) {
          var sfx = ['_'+nameRetry, '_'+Math.floor(Math.random()*999), String.fromCharCode(97+nameRetry%26), '_x'+nameRetry];
          playerName = username.slice(0, 8) + sfx[nameRetry % sfx.length];
          tsLog('[' + username + '] 角色名重试 #' + (nameRetry + 1) + ': ' + playerName);
        }
        try {
          createData = await apiRequest('POST', '/player/create', token, {
            name: playerName,
            spirit_roots: { metal: 100, wood: 0, water: 0, fire: 0, earth: 0 },
          });
          break;
        } catch (e) {
          if (/角色名已|已被使用|taken/i.test(e.message || '') && nameRetry < 9) {
            tsLog('[' + username + '] ⚠️ 角色名"' + playerName + '"已被占用，换名重试...');
            continue;
          }
          throw e;
        }
      }
      tsLog('[' + username + '] ✅ 角色创建成功: ' + (createData.player?.name || playerName) + ' (金灵根100)');
      characterName = createData.player?.name || playerName;
      createdResultData = {
        character_name: characterName,
        spirit_roots: createData.player?.spirit_roots || { metal: 100, wood: 0, water: 0, fire: 0, earth: 0 },
      };
      spiritRoots = JSON.stringify(createdResultData.spirit_roots);
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: workerOrder.id, username, password,
        status: 'character_created',
        character_name: characterName,
        spirit_roots: spiritRoots,
        created_result: JSON.stringify(createdResultData),
      });
      await stepDelay();

      // 记录详细日志（使用批量收集器）
      collectLog({
        order_id: workerOrder.id, username, account_id: accountId,
        log_type: 'character',
        message: '创建角色: ' + characterName + ' (金灵根100)',
        raw_output: JSON.stringify(createdResultData),
      });

      // ── 3) 绑定邀请码 ──
      if (inviteCode) {
        try {
          const inviteData = await apiRequest('POST', '/invite/bind', token, { invite_code: inviteCode });
          tsLog('[' + username + '] ✅ 邀请码绑定成功, 邀请人: ' + (inviteData.inviter_name || '?'));
          collectLog({
            order_id: workerOrder.id, username, account_id: accountId,
            log_type: 'invite',
            message: '邀请码绑定成功: ' + inviteCode + ', 邀请人: ' + (inviteData.inviter_name || '?'),
          });
        } catch (e) {
          tsLog('[' + username + '] ⚠️ 邀请码绑定失败: ' + e.message);
        }
        await stepDelay();
      }

      // ── 4) 装备初始3个技能（重击/火球术/治疗术） ──
      const starterSkills = [
        { id: 1, name: '重击' },
        { id: 2, name: '火球术' },
        { id: 3, name: '治疗术' },
      ];
      let equippedSkills = 0;
      const equippedSkillNames = [];
      for (const sk of starterSkills) {
        try {
          await apiRequest('POST', '/player/equip_skill', token, { skill_id: sk.id });
          equippedSkills++;
          equippedSkillNames.push(sk.name);
          tsLog('[' + username + '] ✅ 技能装备: ' + sk.name);
        } catch (e) {
          if (e.message && e.message.includes('已装备')) {
            equippedSkills++;
            equippedSkillNames.push(sk.name);
            tsLog('[' + username + '] ✅ 技能已装备: ' + sk.name);
          } else {
            tsLog('[' + username + '] ⚠️ 技能跳过(' + sk.name + '): ' + e.message);
          }
        }
        await sleep(300);
      }
      tsLog('[' + username + '] 技能装备完成: ' + equippedSkills + '/' + starterSkills.length);
      await stepDelay();

      // ── 5) 装备铁剑 ──
      let swordEquipped = false;
      try {
        const sync = await apiRequest('GET', '/player/sync', token);
        const inv = sync?.player?.inventory || [];
        for (let p = 0; p < inv.length && !swordEquipped; p++) {
          if (!inv[p]) continue;
          for (let s = 0; s < inv[p].length; s++) {
            const slot = inv[p][s];
            if (slot?.item && String(slot.item.name || '').includes('铁剑')) {
              await apiRequest('POST', '/player/equip', token, {
                page: p, slot_index: s, expect_item_id: Number(slot.item.id) || 0,
              });
              swordEquipped = true;
              tsLog('[' + username + '] ✅ 铁剑装备成功');
              break;
            }
          }
        }
        if (!swordEquipped) tsLog('[' + username + '] ⚠️ 背包中未找到铁剑');
      } catch (e) {
        tsLog('[' + username + '] ⚠️ 装备铁剑失败: ' + e.message);
      }
      await stepDelay();

      // ── 6) 设置主功法（吐纳法 id=1） ──
      let techniqueSet = false;
      try {
        await apiRequest('POST', '/player/set_technique', token, { slot: 'main', technique_id: 1 });
        techniqueSet = true;
        tsLog('[' + username + '] ✅ 功法设置: 吐纳法');
      } catch (e) {
        tsLog('[' + username + '] ⚠️ 功法跳过: ' + e.message);
      }
      await stepDelay();

      // ── 7) 切换地图到荒石村 ──
      let mapChanged = false;
      try {
        await apiRequest('POST', '/player/set_map', token, { map_id: 1 });
        mapChanged = true;
        tsLog('[' + username + '] ✅ 切换至荒石村');
      } catch (e) {
        tsLog('[' + username + '] ⚠️ 地图切换跳过: ' + e.message);
      }
      await stepDelay();

      // ── 8) 战斗 + 自动刷怪 ──
      let battleStarted = false;
      try {
        await apiRequest('POST', '/battle/start', token, { mapId: 1, poll_mode: false, auto_restart: false });
        battleStarted = true;
        tsLog('[' + username + '] ✅ 战斗已启动');
      } catch (e) {
        tsLog('[' + username + '] ⚠️ 战斗启动跳过: ' + e.message);
      }
      await sleep(500);
      let autoRestartSet = false;
      try {
        await apiRequest('POST', '/battle/auto_restart', token, { enabled: true, map_id: 1 });
        autoRestartSet = true;
        tsLog('[' + username + '] ✅ 自动刷怪已开启');
      } catch (e) {
        tsLog('[' + username + '] ⚠️ 自动刷怪跳过: ' + e.message);
      }

      const setupLog = {
        registered: true, character_created: true,
        skills: equippedSkillNames, iron_sword: swordEquipped,
        technique: techniqueSet, map: mapChanged,
        battle: battleStarted, auto_restart: autoRestartSet,
      };

      await workerApi('/api/gh/report-account', 'POST', {
        order_id: workerOrder.id, username, password,
        server_username: username, server_password: password,
        status: 'farming', level: 1,
        map_id: 1, map_name: '荒石村',
        character_name: characterName,
        spirit_roots: spiritRoots,
        skills: starterSkills.map(s => ({ id: s.id, name: s.name })),
        techniques: techniqueSet ? [{ id: 1, name: '吐纳法' }] : [],
        equipment: swordEquipped ? [{ name: '铁剑' }] : [],
        setup_status: 'farming',
        created_result: JSON.stringify(setupLog),
      });

      collectLog({
        order_id: workerOrder.id, username, account_id: accountId,
        log_type: 'setup_complete',
        message: '账号配置完成: ' + JSON.stringify(setupLog),
      });

      return { username, password, ok: true };
    } catch (e) {
      const errMsg = e.message || '';
      tsLog('[' + username + '] ❌ 失败: ' + errMsg);

      // 检测是否为用户名/角色名重复错误 → 重试
      const isDuplicate = /已存在|已注册|重复|角色名已|已被使用|exists|already|taken/i.test(errMsg);
      if (isDuplicate && retry < 4) {
        tsLog('[' + username + '] ⚠️ 用户名重复，重新生成并重试...');
        usedNames.add(username);
        collectLog({
          order_id: workerOrder.id, username, account_id: accountId,
          log_type: 'retry',
          message: '用户名重复，重试 #' + (retry + 1) + ': ' + errMsg,
        });
        continue;
      }

      try {
        await workerApi('/api/gh/report-account', 'POST', {
          order_id: workerOrder.id, username, password: '',
          status: 'failed', error_msg: errMsg,
        });
        collectLog({
          order_id: workerOrder.id, username, account_id: accountId,
          log_type: 'error',
          message: '注册失败: ' + errMsg,
          raw_output: errMsg,
        });
      } catch (e2) { tsLog('[' + username + '] ⚠️ 错误上报失败: ' + (e2.message || '').slice(0, 60)); }
      return { username, ok: false, error: errMsg };
    }
  }

  tsLog('❌ 用户名生成重试耗尽（5次），跳过该账号');
  await workerApi('/api/gh/report-account', 'POST', {
    order_id: workerOrder.id, username: '', password: '',
    status: 'failed', error_msg: '重试耗尽（5次用户名重复）',
  }).catch(() => {});
  return { username: '', ok: false, error: '重试耗尽' };
}

// ── 工单执行：购买邀请积分（批量注册账号） ──
async function dispatchOrder(order, orderIdx) {
  const orderType = order.order_type || '代练';

  // 平台只保留「购买邀请积分」工单；其余类型（历史遗留）不获取、不执行
  if (!['代练', '代打', '托管'].includes(orderType)) {
    tsLog('⛔ 工单类型「' + orderType + '」已下线，跳过');
    return false;
  }

  // 查询工单账号总数（含注册中/角色创建中/已完成，防止重复注册造成超量）
  // 注意：不能只用 valid（已交付挂机）数量，否则注册中的账号不被计入，
  // 每次扫描都会误以为"数量不足"而继续注册，导致严重超量注册。
  // 已满足计数 = 总数 - 失败/错误（失败账号需另补，不占名额）
  //
  // ⛔ 安全失败：取不到账号数就【绝不下单】。宁可这轮不处理（下轮再试），
  //    也不能把"读不到"当成"已有 0 个"——那正是历史上一轮超量注册 50 个的根因。
  let existingAccounts;
  let failedErrCount = 0;
  try {
    const countRes = await workerApi('/api/gh/account-count?order_id=' + order.id);
    const byStatus = countRes.by_status || {};
    const total = countRes.total != null ? countRes.total : countRes.valid;
    if (typeof total !== 'number') throw new Error('account-count 未返回 total 字段');
    failedErrCount = (byStatus.failed || 0) + (byStatus.error || 0);
    existingAccounts = Math.max(0, total - failedErrCount);
  } catch (e) {
    tsLog('⛔ 无法获取账号数量，跳过本工单（避免超量注册）: ' + e.message);
    return false;
  }
  // 目标账号数 = 订购数量 + 1（每个工单多发一个冗余，宁多勿少）
  const accountsToCreate = (order.quantity || (order.bonus_points ? Math.max(1, Math.ceil(order.bonus_points / 10)) : 1)) + 1;

  // 已有账号已达目标数量 → 跳过
  if (existingAccounts >= accountsToCreate) {
    tsLog('已有 ' + existingAccounts + '/' + accountsToCreate + ' 个账号（不含失败 ' + failedErrCount + '），无需补充');
    return true;
  }

  // 当前需要创建的账号数 = 目标 - 已有（每次最多不超过 50，防超时）
  const remaining = Math.max(0, accountsToCreate - existingAccounts);
  const maxToCreate = Math.min(remaining, 50);
  tsLog('类型: ' + orderType + ', 目标: ' + accountsToCreate + ', 已有: ' + existingAccounts + '（失败 ' + failedErrCount + '）, 本次创建: ' + maxToCreate + ' 个');

  for (let a = 0; a < maxToCreate; a++) {
    await antiDetect.randomDelay(5000);
    const r = await registerAndSetup(order, orderIdx * 10 + a);
    tsLog('结果 [' + (a + 1) + '/' + maxToCreate + ']: ' + (r.ok ? '✅ 注册成功 [' + r.username + ']' : (r.capped ? '⛔ 已达上限' : '❌ ' + r.error)));
    await antiDetect.smartPause(a, 3, 30);
    // 服务端已拒绝（达上限）→ 立即停止本次创建
    if (r.capped) { tsLog('⛔ 已达订购数量上限，停止本次创建'); break; }
    // 每创建一个后复查计数，已达目标即提前停止（防并发导致超量）
    if (r.ok) {
      try {
        const reCount = await workerApi('/api/gh/account-count?order_id=' + order.id);
        const rcTotal = reCount.total != null ? reCount.total : reCount.valid;
        const rcFailed = ((reCount.by_status || {}).failed || 0) + ((reCount.by_status || {}).error || 0);
        const rcExisting = Math.max(0, (rcTotal || 0) - rcFailed);
        if (rcExisting >= accountsToCreate) {
          tsLog('✅ 已达目标 ' + rcExisting + '/' + accountsToCreate + '，提前结束');
          break;
        }
      } catch (e) {
        // ⛔ 复查失败同样按安全失败处理：立刻停止本工单创建。
        //    原实现是"忽略复查失败"，这也是超量注册的成因之一。
        tsLog('⛔ 复查账号数量失败，立即停止本工单创建: ' + e.message);
        break;
      }
    }
  }
  return true;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  艾德尔工单系统 - 订单扫描器 v3.0');
  console.log('  时间: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════');

  if (!API_KEY) { console.error('错误: 未设置 API_KEY'); process.exit(1); }
  if (!WORKER_URL) { console.error('错误: 未设置 WORKER_URL'); process.exit(1); }

  tsLog('获取已审核通过的工单...');
  const data = await workerApi('/api/gh/approved-orders');
  if (!data.ok || !data.orders || !data.orders.length) {
    tsLog('没有待处理的工单');
    return;
  }

  tsLog('找到 ' + data.orders.length + ' 个待处理工单\n');

  for (let i = 0; i < data.orders.length; i++) {
    const order = data.orders[i];
    console.log('──── 工单 #' + order.id + ' [' + (i + 1) + '/' + data.orders.length + '] ────');
    console.log('  类型: ' + (order.order_type || '代练') + ', 邀请码: ' + (order.invite_code || '-'));

    const success = await dispatchOrder(order, i);

    if (!success) {
      tsLog('工单 #' + order.id + ' 本轮未处理（已跳过或失败），继续下一张');
      continue;
    }
    // 单张工单的完成校验失败不应终止整轮扫描
    try {
      const completeRes = await workerApi('/api/gh/complete-order', 'POST', { order_id: order.id });
      tsLog('工单 #' + order.id + ' 账号补充完成: ' + (completeRes.message || '') + ' (状态: ' + (completeRes.status || order.status) + ')');
    } catch (e) {
      tsLog('⚠️ 工单 #' + order.id + ' 完成校验失败（不影响后续工单）: ' + e.message);
    }
  }

  // 刷新剩余日志
  await flushLogs();

  console.log('\n═══════════════════════════════════════');
  console.log('  全部完成 ✓');
  console.log('═══════════════════════════════════════');
}

main().catch(e => {
  tsLog('❌ 致命错误: ' + e.message);
  process.exit(1);
});
