/**
 * 艾德尔工单系统 - GitHub Actions 订单扫描器
 * 扫描已审核通过的工单，自动注册账号并开始刷怪
 * 内置防封检测：独立IP/机器码/指纹轮换/随机延迟
 * 完整流程：注册→创建角色(金灵根100)→绑定邀请码→装备技能/功法/武器→战斗+自动刷怪
 */
const crypto = require('crypto');
// Node.js 20+ 内置 fetch，无需 node-fetch
const antiDetect = require('./_anti_detect');

const WORKER_URL = process.env.WORKER_URL || 'https://ider-order-system.sifangzhiji.workers.dev';
const API_KEY = process.env.API_KEY || 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';
const API_BASE = process.env.API_BASE || 'https://idlexiuxianzhuan.cn';
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

async function workerApi(path, method = 'GET', body = null) {
  const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
  const url = WORKER_URL.replace(/\/+$/, '') + path;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  return r.json();
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

      // 上报 Worker：账号已创建
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: workerOrder.id, username, password,
        server_username: username, server_password: password,
        status: 'creating',
      });

      // 记录详细日志
      await workerApi('/api/gh/report-log', 'POST', {
        order_id: workerOrder.id, account_id: 0,
        log_type: 'register', message: '注册账号: ' + username,
        raw_output: JSON.stringify({ accountId: regData.accountId }),
      });

      // ── 2) 创建角色（金灵根100） ──
      const playerName = username.slice(0, 8);
      const createData = await apiRequest('POST', '/player/create', token, {
        name: playerName,
        spirit_roots: { metal: 100, wood: 0, water: 0, fire: 0, earth: 0 },
      });
      tsLog('[' + username + '] ✅ 角色创建成功: ' + (createData.player?.name || playerName) + ' (金灵根100)');
      const characterName = createData.player?.name || playerName;
      const createdResultData = {
        character_name: characterName,
        spirit_roots: createData.player?.spirit_roots || { metal: 100, wood: 0, water: 0, fire: 0, earth: 0 },
      };
      const spiritRoots = JSON.stringify(createdResultData.spirit_roots);
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: workerOrder.id, username, password,
        status: 'character_created',
        character_name: characterName,
        spirit_roots: spiritRoots,
        created_result: JSON.stringify(createdResultData),
      });
      await stepDelay();

      // 记录详细日志
      await workerApi('/api/gh/report-log', 'POST', {
        order_id: workerOrder.id, log_type: 'character',
        message: '创建角色: ' + characterName + ' (金灵根100)',
        raw_output: JSON.stringify(createdResultData),
      });

      // ── 3) 绑定邀请码 ──
      if (inviteCode) {
        try {
          const inviteData = await apiRequest('POST', '/invite/bind', token, { invite_code: inviteCode });
          tsLog('[' + username + '] ✅ 邀请码绑定成功, 邀请人: ' + (inviteData.inviter_name || '?'));
          await workerApi('/api/gh/report-log', 'POST', {
            order_id: workerOrder.id, log_type: 'invite',
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

      await workerApi('/api/gh/report-log', 'POST', {
        order_id: workerOrder.id, log_type: 'setup_complete',
        message: '账号配置完成: ' + JSON.stringify(setupLog),
      });

      return { username, password, ok: true };
    } catch (e) {
      const errMsg = e.message || '';
      tsLog('[' + username + '] ❌ 失败: ' + errMsg);

      // 检测是否为用户名重复错误 → 重试
      const isDuplicate = /已存在|已注册|重复|exists|already|taken/i.test(errMsg);
      if (isDuplicate && retry < 4) {
        tsLog('[' + username + '] ⚠️ 用户名重复，重新生成并重试...');
        usedNames.add(username);
        try {
          await workerApi('/api/gh/report-log', 'POST', {
            order_id: workerOrder.id, log_type: 'retry',
            message: '用户名重复，重试 #' + (retry + 1) + ': ' + errMsg,
          });
        } catch (e2) {}
        continue;
      }

      try {
        await workerApi('/api/gh/report-account', 'POST', {
          order_id: workerOrder.id, username, password: '',
          status: 'failed', error_msg: errMsg,
        });
        await workerApi('/api/gh/report-log', 'POST', {
          order_id: workerOrder.id, log_type: 'error',
          message: '注册失败: ' + errMsg,
          raw_output: errMsg,
        });
      } catch (e2) {}
      return { username, ok: false, error: errMsg };
    }
  }

  tsLog('❌ 用户名生成重试耗尽（5次），跳过该账号');
  return { username: '', ok: false, error: '重试耗尽' };
}

// ── 仙盟采集处理 ──
// 自动登录 → 加入/检查仙盟 → 完成仙盟日常任务 → 洞府采集
async function processAllianceDaily(order, orderIdx) {
  const username = order.game_account_name;
  const password = order.game_account_password;

  // 支持从 Worker 获取关联账号
  let accountsToProcess = [];
  if (username && password) {
    accountsToProcess = [{ username, password }];
  } else {
    tsLog('工单无游戏账号信息，从 Worker 获取关联账号...');
    try {
      const accountsData = await workerApi('/api/gh/accounts-by-order?order_id=' + order.id);
      if (accountsData.ok && accountsData.accounts && accountsData.accounts.length > 0) {
        accountsToProcess = accountsData.accounts.map(a => ({
          username: a.username || a.server_username,
          password: a.password || a.server_password,
        }));
        tsLog('获取到 ' + accountsToProcess.length + ' 个关联账号');
      } else {
        tsLog('  ❌ 无关联账号');
        return false;
      }
    } catch (e) {
      tsLog('  ❌ 获取关联账号失败: ' + e.message);
      return false;
    }
  }

  for (let accIdx = 0; accIdx < accountsToProcess.length; accIdx++) {
    const acc = accountsToProcess[accIdx];
    if (!acc.username || !acc.password) continue;

    tsLog('\n══ 仙盟日常 [' + (accIdx + 1) + '/' + accountsToProcess.length + '] ' + acc.username + ' ══');
    setApiIdx(orderIdx * 20 + accIdx * 10);

    try {
      const machineId = antiDetect.generateMachineId(orderIdx * 10 + accIdx);
      await antiDetect.randomDelay(1500);

      // 1) 登录
      const loginData = await apiRequest('POST', '/auth/login', '', { username: acc.username, password: acc.password, machine_id: machineId });
      const token = loginData.token;
      tsLog('[' + acc.username + '] ✅ 登录成功');
      await antiDetect.randomDelay(1500);

      // 2) 获取角色状态
      const stateData = await apiRequest('GET', '/player/state', token);
      const player = stateData.player;
      let allianceId = player?.alliance_id || 0;
      tsLog('[' + acc.username + '] 仙盟ID: ' + (allianceId || '无'));

      // 3) 检查/加入仙盟
      if (!allianceId) {
        try {
          const listData = await apiRequest('GET', '/alliance/list', token);
          const alliances = listData.alliances || [];
          // 优先加入指定仙盟，否则加入第一个有空位的
          const target = alliances.find(a => a.name === '天地一家大爱盟' && a.member_limit > (a.member_count || 0))
            || alliances.find(a => a.member_limit > (a.member_count || 0));
          if (target) {
            await apiRequest('POST', '/alliance/apply', token, { alliance_id: target.id });
            tsLog('[' + acc.username + '] ✅ 已申请加入仙盟: ' + target.name);
            await antiDetect.randomDelay(2000);
            // 重新获取状态
            const state2 = await apiRequest('GET', '/player/state', token);
            allianceId = state2.player?.alliance_id || 0;
          } else {
            tsLog('[' + acc.username + '] ⚠️ 无可用仙盟');
          }
        } catch (e) {
          tsLog('[' + acc.username + '] ⚠️ 仙盟申请跳过: ' + e.message);
        }
      }

      // 4) 仙盟日常任务
      const taskResults = [];
      if (allianceId) {
        const tasks = [
          { name: '灵池沐浴', path: '/alliance/spirit_pool/bathe' },
          { name: '仙园采摘', path: '/alliance/garden/pick' },
          { name: '悟道树冥想', path: '/alliance/enlightenment_tree/meditate' },
        ];
        for (const t of tasks) {
          try {
            await apiRequest('POST', t.path, token, { alliance_id: allianceId });
            tsLog('[' + acc.username + '] ✅ ' + t.name);
            taskResults.push(t.name);
          } catch (e) {
            tsLog('[' + acc.username + '] ⚠️ ' + t.name + '跳过: ' + e.message);
          }
          await antiDetect.randomDelay(1500);
        }
      }

      // 5) 洞府采集
      let caveStatus = '跳过';
      try {
        const caveData = await apiRequest('GET', '/online/cave/status', token);
        if (!caveData.gathering && (caveData.rare_remaining || 0) > 0) {
          await apiRequest('POST', '/online/cave/start', token, { type: 'field' });
          caveStatus = '已开启';
          tsLog('[' + acc.username + '] ✅ 洞府采集已开启');
        } else {
          caveStatus = caveData.gathering ? '采集中' : '灵气枯竭';
          tsLog('[' + acc.username + '] 洞府采集: ' + caveStatus);
        }
      } catch (e) {
        tsLog('[' + acc.username + '] 洞府跳过: ' + e.message);
      }

      // 6) 上报结果
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: order.id, username: acc.username, password: acc.password,
        server_username: acc.username, server_password: acc.password,
        status: 'farming', level: player?.level || 0,
        character_name: player?.name || acc.username,
      });

      await workerApi('/api/gh/report-log', 'POST', {
        order_id: order.id, log_type: 'alliance_daily',
        message: '[' + acc.username + '] 仙盟日常完成: ' + taskResults.join(', ') + ' | 洞府: ' + caveStatus,
      });

      if (accIdx < accountsToProcess.length - 1) {
        await antiDetect.smartPause(accIdx, 3, 30);
      }
    } catch (e) {
      tsLog('[' + acc.username + '] ❌ 失败: ' + e.message);
      try {
        await workerApi('/api/gh/report-log', 'POST', {
          order_id: order.id, log_type: 'error',
          message: '[' + acc.username + '] 仙盟日常失败: ' + e.message,
        });
      } catch (e2) {}
    }
  }

  return true;
}

// ── 试炼测试处理 ──
// 用于测试试炼系统，验证词条组合效果
// 自动登录 → 获取试炼配置 → 逐个测试 → 上报结果
async function processTrialTest(order, orderIdx) {
  const username = order.game_account_name;
  const password = order.game_account_password;

  if (!username || !password) {
    tsLog('  ❌ 缺少游戏账号信息');
    return false;
  }

  setApiIdx(orderIdx * 20);
  try {
    const machineId = antiDetect.generateMachineId(orderIdx);
    await antiDetect.randomDelay(1500);

    // 1) 登录
    const loginData = await apiRequest('POST', '/auth/login', '', { username, password, machine_id: machineId });
    const token = loginData.token;
    tsLog('[' + username + '] ✅ 登录成功');
    await antiDetect.randomDelay(1500);

    // 2) 获取角色状态
    const stateData = await apiRequest('GET', '/player/state', token);
    const player = stateData.player;
    const level = player?.level || 0;
    tsLog('[' + username + '] 角色等级: Lv.' + level);

    // 3) 获取副本列表
    let dungeons = [];
    try {
      const dungeonListData = await apiRequest('GET', '/dungeon/list', token);
      dungeons = dungeonListData.dungeons || [];
    } catch (e) {
      tsLog('[' + username + '] ⚠️ 获取副本列表失败: ' + e.message);
      dungeons = [
        { id: 1, name: '荒石村试炼', level_min: 10 },
        { id: 2, name: '青竹林秘境', level_min: 30 },
        { id: 3, name: '清风镇剿匪', level_min: 50 },
      ];
    }

    // 4) 筛选可挑战的副本
    const availableDungeons = dungeons.filter(dg => level >= (dg.level_min || 0));
    tsLog('[' + username + '] 可挑战 ' + availableDungeons.length + ' 个副本');

    if (availableDungeons.length === 0) {
      tsLog('[' + username + '] ⚠️ 等级不足');
      return false;
    }

    // 5) 测试每个副本（使用空词条）
    const results = [];
    for (const dg of availableDungeons.slice(0, 3)) { // 最多测试3个
      tsLog('[' + username + '] 测试: ' + dg.name);
      try {
        const startData = await apiRequest('POST', '/dungeon-battle/start', token, {
          dungeon_id: dg.id,
          challenge_mode: 'trial_contract',
          contract_modifiers: [],
        });
        const battleId = startData.battle_id;
        if (!battleId) throw new Error('无battle_id');

        // 推进战斗
        let ended = false, victory = false;
        for (let r = 0; r < 60; r++) {
          const adv = await apiRequest('POST', '/dungeon-battle/advance?state=lite', token, { battle_id: battleId });
          ended = Boolean(adv.ended);
          victory = Boolean(adv.victory);
          if (ended) break;
          await sleep(50);
        }

        const coins = victory ? (Number(startData.trial_coins) || 0) : 0;
        results.push({ dungeonId: dg.id, name: dg.name, victory, coins });
        tsLog('[' + username + '] ' + (victory ? '✅' : '❌') + ' ' + dg.name + ' 试炼币: ' + coins);
      } catch (e) {
        tsLog('[' + username + '] ❌ ' + dg.name + ': ' + e.message);
        results.push({ dungeonId: dg.id, name: dg.name, victory: false, error: e.message });
      }
      await antiDetect.randomDelay(2000, 4000);
    }

    // 6) 上报结果
    const victoryCount = results.filter(r => r.victory).length;
    await workerApi('/api/gh/report-log', 'POST', {
      order_id: order.id, log_type: 'trial_test',
      message: '[' + username + '] 试炼测试完成: ' + victoryCount + '/' + results.length + ' 胜利',
      raw_output: JSON.stringify(results),
    });

    tsLog('[' + username + '] 📊 试炼测试完成: ' + victoryCount + '/' + results.length + ' 胜利');
    return true;
  } catch (e) {
    tsLog('[' + username + '] ❌ 失败: ' + e.message);
    return false;
  }
}

// ── 每日试炼处理 ──
// 自动登录 → 遍历所有副本 → 每个副本进行试炼挑战（challenge_mode='trial_contract'）
// 注意：试炼和副本是不同的系统
//   试炼: challenge_mode='trial_contract', 掉落试炼币, 有词条加成
//   副本: challenge_mode='normal', 掉落材料/装备
async function processDailyTrial(order, orderIdx) {
  const username = order.game_account_name;
  const password = order.game_account_password;

  // 支持从 Worker 获取关联账号
  let accountsToProcess = [];
  if (username && password) {
    accountsToProcess = [{ username, password }];
  } else {
    tsLog('工单无游戏账号信息，从 Worker 获取关联账号...');
    try {
      const accountsData = await workerApi('/api/gh/accounts-by-order?order_id=' + order.id);
      if (accountsData.ok && accountsData.accounts && accountsData.accounts.length > 0) {
        accountsToProcess = accountsData.accounts.map(a => ({
          username: a.username || a.server_username,
          password: a.password || a.server_password,
        }));
        tsLog('获取到 ' + accountsToProcess.length + ' 个关联账号');
      } else {
        tsLog('  ❌ 无关联账号');
        return false;
      }
    } catch (e) {
      tsLog('  ❌ 获取关联账号失败: ' + e.message);
      return false;
    }
  }

  for (let accIdx = 0; accIdx < accountsToProcess.length; accIdx++) {
    const acc = accountsToProcess[accIdx];
    if (!acc.username || !acc.password) continue;

    tsLog('\n══ 每日试炼 [' + (accIdx + 1) + '/' + accountsToProcess.length + '] ' + acc.username + ' ══');
    setApiIdx(orderIdx * 20 + accIdx * 10);

    try {
      const machineId = antiDetect.generateMachineId(orderIdx * 10 + accIdx);
      await antiDetect.randomDelay(1500);

      // 1) 登录
      const loginData = await apiRequest('POST', '/auth/login', '', { username: acc.username, password: acc.password, machine_id: machineId });
      const token = loginData.token;
      tsLog('[' + acc.username + '] ✅ 登录成功');
      await antiDetect.randomDelay(1500);

      // 2) 获取角色状态
      const stateData = await apiRequest('GET', '/player/state', token);
      const player = stateData.player;
      const level = player?.level || 0;
      tsLog('[' + acc.username + '] 角色等级: Lv.' + level);

      // 3) 获取副本列表（试炼使用相同的副本列表）
      let dungeons = [];
      try {
        const dungeonListData = await apiRequest('GET', '/dungeon/list', token);
        dungeons = dungeonListData.dungeons || [];
        tsLog('[' + acc.username + '] 获取到 ' + dungeons.length + ' 个副本');
      } catch (e) {
        tsLog('[' + acc.username + '] ⚠️ 获取副本列表失败: ' + e.message);
        dungeons = [
          { id: 1, name: '荒石村试炼', level_min: 10 },
          { id: 2, name: '青竹林秘境', level_min: 30 },
          { id: 3, name: '清风镇剿匪', level_min: 50 },
        ];
      }

      // 4) 筛选当前等级可挑战的副本
      const availableDungeons = dungeons.filter(dg => level >= (dg.level_min || 0));
      tsLog('[' + acc.username + '] 当前等级可挑战 ' + availableDungeons.length + ' 个试炼');

      if (availableDungeons.length === 0) {
        tsLog('[' + acc.username + '] ⚠️ 等级不足，无法挑战试炼');
        continue;
      }

      // 5) 遍历每个副本进行试炼
      const results = [];
      let totalCoins = 0;

      for (let i = 0; i < availableDungeons.length; i++) {
        const dg = availableDungeons[i];
        const dungeonId = dg.id;
        const dungeonName = dg.name || ('试炼' + dungeonId);

        tsLog('[' + acc.username + '] 📍 [' + (i + 1) + '/' + availableDungeons.length + '] ' + dungeonName);

        try {
          // 开始试炼战斗（trial_contract 模式）
          const startData = await apiRequest('POST', '/dungeon-battle/start', token, {
            dungeon_id: dungeonId,
            challenge_mode: 'trial_contract',  // 试炼模式
            contract_modifiers: [],  // 无词条
          });
          const battleId = startData.battle_id;
          if (!battleId) throw new Error('无battle_id');

          const theoreticalCoins = Number(startData.trial_coins) || 0;
          tsLog('[' + acc.username + '] 战斗开始(battleId=' + battleId + '), 理论收益: ' + theoreticalCoins + ' 试炼币');

          // 自动推进战斗
          let ended = false, victory = false;
          for (let r = 0; r < 60; r++) {
            const adv = await apiRequest('POST', '/dungeon-battle/advance?state=lite', token, { battle_id: battleId });
            ended = Boolean(adv.ended);
            victory = Boolean(adv.victory);
            if (ended) break;
            await sleep(50);
          }

          const grantedCoins = victory ? theoreticalCoins : 0;
          totalCoins += grantedCoins;

          results.push({
            dungeonId, dungeonName, victory,
            theoreticalCoins, grantedCoins,
          });

          tsLog('[' + acc.username + '] ' + (victory ? '✅' : '❌') + ' ' + dungeonName + ' 胜利=' + victory + ' 收益: ' + grantedCoins + ' 试炼币');

          // 试炼间隔延迟
          await antiDetect.randomDelay(2000, 4000);
        } catch (e) {
          tsLog('[' + acc.username + '] ❌ ' + dungeonName + ' 失败: ' + e.message);
          results.push({ dungeonId, dungeonName, victory: false, error: e.message, theoreticalCoins: 0, grantedCoins: 0 });
          await antiDetect.randomDelay(1000, 2000);
        }
      }

      // 6) 汇总
      const victoryCount = results.filter(r => r.victory).length;
      tsLog('[' + acc.username + '] 📊 每日试炼完成: ' + victoryCount + '/' + results.length + ' 胜利, 总收益: ' + totalCoins + ' 试炼币');

      // 7) 上报结果
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: order.id, username: acc.username, password: acc.password,
        server_username: acc.username, server_password: acc.password,
        status: 'farming', level,
        character_name: player?.name || acc.username,
      });

      await workerApi('/api/gh/report-log', 'POST', {
        order_id: order.id, log_type: 'daily_trial',
        message: '[' + acc.username + '] 每日试炼完成: ' + victoryCount + '/' + results.length + ' 胜利, 总收益: ' + totalCoins + ' 试炼币',
        raw_output: JSON.stringify(results),
      });

      if (accIdx < accountsToProcess.length - 1) {
        await antiDetect.smartPause(accIdx, 3, 30);
      }
    } catch (e) {
      tsLog('[' + acc.username + '] ❌ 失败: ' + e.message);
      try {
        await workerApi('/api/gh/report-log', 'POST', {
          order_id: order.id, log_type: 'error',
          message: '[' + acc.username + '] 每日试炼失败: ' + e.message,
        });
      } catch (e2) {}
    }
  }

  return true;
}

// ── 副本刷取处理 ──
// 自动登录已有账号 → 遍历所有副本 → 每个副本战斗并自动推进
async function processDungeonFarm(order, orderIdx) {
  const username = order.game_account_name;
  const password = order.game_account_password;

  // 如果工单没有游戏账号信息，从 Worker 获取关联的账号
  let accountsToProcess = [];
  if (username && password) {
    accountsToProcess = [{ username, password }];
  } else {
    tsLog('工单无游戏账号信息，从 Worker 获取关联账号...');
    try {
      const accountsData = await workerApi('/api/gh/accounts-by-order?order_id=' + order.id);
      if (accountsData.ok && accountsData.accounts && accountsData.accounts.length > 0) {
        accountsToProcess = accountsData.accounts.map(a => ({
          username: a.username || a.server_username,
          password: a.password || a.server_password,
        }));
        tsLog('获取到 ' + accountsToProcess.length + ' 个关联账号');
      } else {
        tsLog('  ❌ 无关联账号，请先在工单中填写游戏账号信息');
        return false;
      }
    } catch (e) {
      tsLog('  ❌ 获取关联账号失败: ' + e.message);
      return false;
    }
  }

  // 处理每个账号
  for (let accIdx = 0; accIdx < accountsToProcess.length; accIdx++) {
    const acc = accountsToProcess[accIdx];
    if (!acc.username || !acc.password) {
      tsLog('  ⚠️ 账号 #' + (accIdx + 1) + ' 缺少凭据，跳过');
      continue;
    }

    tsLog('\n══ 账号 [' + (accIdx + 1) + '/' + accountsToProcess.length + '] ' + acc.username + ' ══');
    setApiIdx(orderIdx * 20 + accIdx * 10);

    try {
      const machineId = antiDetect.generateMachineId(orderIdx * 10 + accIdx);
      await antiDetect.randomDelay(1500);

      // 1) 登录
      const loginData = await apiRequest('POST', '/auth/login', '', { username: acc.username, password: acc.password, machine_id: machineId });
      const token = loginData.token;
      tsLog('[' + acc.username + '] ✅ 登录成功');
      await antiDetect.randomDelay(1500);

      // 2) 获取角色状态和玩家数据
      const stateData = await apiRequest('GET', '/player/state', token);
      const player = stateData.player;
      const level = player?.level || 0;
      const currentMapId = player?.current_map_id || 1;
      tsLog('[' + acc.username + '] 角色等级: Lv.' + level + ', 当前地图ID: ' + currentMapId);

      // 3) 获取副本列表（从 /dungeon/list 接口）
      let dungeons = [];
      try {
        const dungeonListData = await apiRequest('GET', '/dungeon/list', token);
        dungeons = dungeonListData.dungeons || [];
        tsLog('[' + acc.username + '] 获取到 ' + dungeons.length + ' 个副本');
      } catch (e) {
        tsLog('[' + acc.username + '] ⚠️ 获取副本列表失败: ' + e.message);
        // 使用默认副本列表（20个副本）
        dungeons = [
          { id: 1, name: '荒石村试炼', level_min: 10, daily_limit: 3, quality: 1 },
          { id: 2, name: '青竹林秘境', level_min: 30, daily_limit: 3, quality: 1 },
          { id: 3, name: '清风镇剿匪', level_min: 50, daily_limit: 3, quality: 1 },
          { id: 4, name: '迷雾森林深处', level_min: 70, daily_limit: 3, quality: 1 },
          { id: 5, name: '黑风山剿匪', level_min: 90, daily_limit: 3, quality: 2 },
          { id: 6, name: '乱石滩清剿', level_min: 110, daily_limit: 3, quality: 2 },
          { id: 7, name: '枯骨林深处', level_min: 130, daily_limit: 2, quality: 2 },
          { id: 8, name: '雷云峰之巅', level_min: 150, daily_limit: 2, quality: 3 },
          { id: 9, name: '烈焰谷核心', level_min: 170, daily_limit: 2, quality: 3 },
          { id: 10, name: '坠龙崖禁地', level_min: 190, daily_limit: 2, quality: 4 },
          { id: 11, name: '万剑冢深处', level_min: 210, daily_limit: 2, quality: 4 },
          { id: 12, name: '归墟之心', level_min: 230, daily_limit: 2, quality: 5 },
          { id: 13, name: '古战场遗址', level_min: 250, daily_limit: 2, quality: 5 },
          { id: 14, name: '无尽风域核心', level_min: 270, daily_limit: 2, quality: 6 },
          { id: 15, name: '魔渊深处', level_min: 290, daily_limit: 2, quality: 7 },
          { id: 16, name: '虚空裂隙禁地', level_min: 310, daily_limit: 2, quality: 8 },
          { id: 17, name: '天穹古墟秘境', level_min: 330, daily_limit: 2, quality: 8 },
          { id: 18, name: '九幽冥海深处', level_min: 350, daily_limit: 2, quality: 9 },
          { id: 19, name: '天劫雷池试炼', level_min: 370, daily_limit: 2, quality: 9 },
          { id: 20, name: '飞升天劫', level_min: 390, daily_limit: 2, quality: 9 },
        ];
      }

      // 4) 筛选当前等级可挑战的副本
      const availableDungeons = dungeons.filter(dg => level >= (dg.level_min || 0));
      tsLog('[' + acc.username + '] 当前等级可挑战 ' + availableDungeons.length + ' 个副本');

      if (availableDungeons.length === 0) {
        tsLog('[' + acc.username + '] ⚠️ 等级不足，无法挑战任何副本');
        await workerApi('/api/gh/report-log', 'POST', {
          order_id: order.id, log_type: 'dungeon_farm',
          message: '[' + acc.username + '] 等级不足(Lv.' + level + ')，无法挑战副本',
        });
        continue;
      }

      // 5) 遍历每个副本进行战斗
      const results = [];
      let totalDrops = [];

      for (let i = 0; i < availableDungeons.length; i++) {
        const dg = availableDungeons[i];
        const dungeonId = dg.id;
        const dungeonName = dg.name || ('副本' + dungeonId);

        tsLog('[' + acc.username + '] 📍 [' + (i + 1) + '/' + availableDungeons.length + '] ' + dungeonName + ' (等级要求' + (dg.level_min || '?') + ', 每日' + (dg.daily_limit || 2) + '次)');

        try {
          // 检查今日剩余次数
          let remaining = dg.daily_limit || 2;
          try {
            const detailData = await apiRequest('GET', '/dungeon/' + dungeonId, token);
            if (detailData.ok && detailData.dungeon) {
              remaining = detailData.dungeon.remaining_today || remaining;
            }
          } catch (e) {
            // 忽略，使用默认值
          }

          if (remaining <= 0) {
            tsLog('[' + acc.username + '] ⏭️ ' + dungeonName + ' 今日次数已用完，跳过');
            results.push({ dungeonId, dungeonName, status: 'skipped', reason: '次数用完' });
            continue;
          }

          tsLog('[' + acc.username + '] 剩余次数: ' + remaining + ', 开始挑战...');

          // 开始副本战斗（普通模式，非试炼）
          const startData = await apiRequest('POST', '/dungeon-battle/start', token, {
            dungeon_id: dungeonId,
            challenge_mode: 'normal',  // 普通副本模式，非试炼
          });
          const battleId = startData.battle_id;
          if (!battleId) throw new Error('无battle_id');

          tsLog('[' + acc.username + '] 战斗开始(battleId=' + battleId + ')');

          // 自动推进战斗
          let ended = false, victory = false;
          for (let r = 0; r < 60; r++) {
            const adv = await apiRequest('POST', '/dungeon-battle/advance?state=lite', token, { battle_id: battleId });
            ended = Boolean(adv.ended);
            victory = Boolean(adv.victory);
            if (ended) break;
            await sleep(50);
          }

          // 获取掉落物品
          const drops = [];
          if (victory && startData.rewards) {
            if (startData.rewards.items) {
              drops.push(...startData.rewards.items.map(item => item.item_name || item.name || '未知物品'));
            }
          }

          results.push({
            dungeonId, dungeonName, victory, drops,
            status: victory ? 'victory' : 'defeat',
          });

          tsLog('[' + acc.username + '] ' + (victory ? '✅' : '❌') + ' ' + dungeonName + ' ' + (victory ? '胜利' : '失败') + (drops.length > 0 ? ' 掉落: ' + drops.join(', ') : ''));

          totalDrops.push(...drops);

          // 副本间隔延迟
          await antiDetect.randomDelay(2000, 4000);
        } catch (e) {
          tsLog('[' + acc.username + '] ❌ ' + dungeonName + ' 失败: ' + e.message);
          results.push({ dungeonId, dungeonName, status: 'error', error: e.message });
          await antiDetect.randomDelay(1000, 2000);
        }
      }

      // 6) 汇总
      const victoryCount = results.filter(r => r.status === 'victory').length;
      const skippedCount = results.filter(r => r.status === 'skipped').length;
      const defeatCount = results.filter(r => r.status === 'defeat').length;
      tsLog('[' + acc.username + '] 📊 副本刷取完成: ' + victoryCount + '胜 ' + defeatCount + '负 ' + skippedCount + '跳过');
      if (totalDrops.length > 0) {
        tsLog('[' + acc.username + '] 📦 总掉落: ' + [...new Set(totalDrops)].join(', '));
      }

      // 7) 上报结果
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: order.id, username: acc.username, password: acc.password,
        server_username: acc.username, server_password: acc.password,
        status: 'farming', level,
        map_id: currentMapId,
        character_name: player?.name || acc.username,
      });

      await workerApi('/api/gh/report-log', 'POST', {
        order_id: order.id, log_type: 'dungeon_farm',
        message: '[' + acc.username + '] 副本刷取完成: ' + victoryCount + '胜 ' + defeatCount + '负 ' + skippedCount + '跳过',
        raw_output: JSON.stringify({ results, totalDrops: [...new Set(totalDrops)] }),
      });

      // 账号间隔延迟
      if (accIdx < accountsToProcess.length - 1) {
        await antiDetect.smartPause(accIdx, 3, 30);
      }
    } catch (e) {
      tsLog('[' + acc.username + '] ❌ 副本刷取失败: ' + e.message);
      try {
        await workerApi('/api/gh/report-log', 'POST', {
          order_id: order.id, log_type: 'error',
          message: '[' + acc.username + '] 副本刷取失败: ' + e.message,
        });
      } catch (e2) {}
    }
  }

  return true;
}

// ── 自动推图处理 ──
// 自动登录 → 获取地图列表 → 逐个地图战斗并自动推进
// 与副本刷取不同，推图是刷野怪获取经验和装备
async function processAutoMap(order, orderIdx) {
  const username = order.game_account_name;
  const password = order.game_account_password;

  // 支持从 Worker 获取关联账号
  let accountsToProcess = [];
  if (username && password) {
    accountsToProcess = [{ username, password }];
  } else {
    tsLog('工单无游戏账号信息，从 Worker 获取关联账号...');
    try {
      const accountsData = await workerApi('/api/gh/accounts-by-order?order_id=' + order.id);
      if (accountsData.ok && accountsData.accounts && accountsData.accounts.length > 0) {
        accountsToProcess = accountsData.accounts.map(a => ({
          username: a.username || a.server_username,
          password: a.password || a.server_password,
        }));
        tsLog('获取到 ' + accountsToProcess.length + ' 个关联账号');
      } else {
        tsLog('  ❌ 无关联账号');
        return false;
      }
    } catch (e) {
      tsLog('  ❌ 获取关联账号失败: ' + e.message);
      return false;
    }
  }

  for (let accIdx = 0; accIdx < accountsToProcess.length; accIdx++) {
    const acc = accountsToProcess[accIdx];
    if (!acc.username || !acc.password) continue;

    tsLog('\n══ 自动推图 [' + (accIdx + 1) + '/' + accountsToProcess.length + '] ' + acc.username + ' ══');
    setApiIdx(orderIdx * 20 + accIdx * 10);

    try {
      const machineId = antiDetect.generateMachineId(orderIdx * 10 + accIdx);
      await antiDetect.randomDelay(1500);

      // 1) 登录
      const loginData = await apiRequest('POST', '/auth/login', '', { username: acc.username, password: acc.password, machine_id: machineId });
      const token = loginData.token;
      tsLog('[' + acc.username + '] ✅ 登录成功');
      await antiDetect.randomDelay(1500);

      // 2) 获取角色状态
      const stateData = await apiRequest('GET', '/player/state', token);
      const player = stateData.player;
      const level = player?.level || 0;
      let currentMapId = player?.current_map_id || 1;
      tsLog('[' + acc.username + '] 角色等级: Lv.' + level + ', 当前地图ID: ' + currentMapId);

      // 3) 获取地图列表
      let maps = [];
      try {
        const mapListData = await apiRequest('GET', '/maps', token);
        maps = mapListData.maps || [];
        tsLog('[' + acc.username + '] 获取到 ' + maps.length + ' 个地图');
      } catch (e) {
        tsLog('[' + acc.username + '] ⚠️ 获取地图列表失败: ' + e.message);
        // 使用默认地图列表
        maps = [
          { id: 1, name: '荒石村', level_min: 1 },
          { id: 2, name: '青竹林', level_min: 30 },
          { id: 3, name: '清风镇', level_min: 50 },
          { id: 4, name: '迷雾森林', level_min: 70 },
          { id: 5, name: '黑风山', level_min: 90 },
          { id: 6, name: '乱石滩', level_min: 110 },
          { id: 7, name: '枯骨林', level_min: 130 },
          { id: 8, name: '雷云峰', level_min: 150 },
          { id: 9, name: '烈焰谷', level_min: 170 },
          { id: 10, name: '坠龙崖', level_min: 190 },
        ];
      }

      // 4) 筛选当前等级可进入的地图
      const availableMaps = maps.filter(m => level >= (m.level_min || 0));
      tsLog('[' + acc.username + '] 当前等级可进入 ' + availableMaps.length + ' 个地图');

      if (availableMaps.length === 0) {
        tsLog('[' + acc.username + '] ⚠️ 无可用地图');
        continue;
      }

      // 5) 从最高级地图开始刷（效率最高）
      const sortedMaps = availableMaps.sort((a, b) => (b.level_min || 0) - (a.level_min || 0));
      const targetMap = sortedMaps[0];

      tsLog('[' + acc.username + '] 目标地图: ' + targetMap.name + ' (等级要求: ' + targetMap.level_min + ')');

      // 6) 切换到目标地图
      if (currentMapId !== targetMap.id) {
        try {
          await apiRequest('POST', '/player/set_map', token, { map_id: targetMap.id });
          tsLog('[' + acc.username + '] ✅ 已切换到 ' + targetMap.name);
          currentMapId = targetMap.id;
        } catch (e) {
          tsLog('[' + acc.username + '] ⚠️ 切换地图失败: ' + e.message);
        }
        await antiDetect.randomDelay(1000, 2000);
      }

      // 7) 开始自动战斗
      let battleResult = null;
      try {
        // 先检查是否已在战斗中
        const stateCheck = await apiRequest('GET', '/player/state', token);
        if (stateCheck.active_battle) {
          tsLog('[' + acc.username + '] 已在战斗中，跳过启动');
          battleResult = { status: 'already_in_battle' };
        } else {
          // 开始战斗
          const battleData = await apiRequest('POST', '/battle/start', token, {
            mapId: targetMap.id,
            poll_mode: false,
            auto_restart: true,
          });
          tsLog('[' + acc.username + '] ✅ 自动战斗已启动');
          battleResult = { status: 'started', map: targetMap.name };
        }
      } catch (e) {
        tsLog('[' + acc.username + '] ⚠️ 启动战斗失败: ' + e.message);
        battleResult = { status: 'error', error: e.message };
      }

      // 8) 设置自动重启战斗
      try {
        await apiRequest('POST', '/battle/auto_restart', token, {
          enabled: true,
          map_id: targetMap.id,
        });
        tsLog('[' + acc.username + '] ✅ 已设置自动续战');
      } catch (e) {
        tsLog('[' + acc.username + '] ⚠️ 设置自动续战失败: ' + e.message);
      }

      // 9) 上报结果
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: order.id, username: acc.username, password: acc.password,
        server_username: acc.username, server_password: acc.password,
        status: 'farming', level,
        map_id: currentMapId,
        map_name: targetMap.name,
        character_name: player?.name || acc.username,
      });

      await workerApi('/api/gh/report-log', 'POST', {
        order_id: order.id, log_type: 'auto_map',
        message: '[' + acc.username + '] 自动推图完成: 地图=' + targetMap.name + ', 状态=' + (battleResult?.status || 'unknown'),
        raw_output: JSON.stringify(battleResult),
      });

      if (accIdx < accountsToProcess.length - 1) {
        await antiDetect.smartPause(accIdx, 3, 30);
      }
    } catch (e) {
      tsLog('[' + acc.username + '] ❌ 自动推图失败: ' + e.message);
      try {
        await workerApi('/api/gh/report-log', 'POST', {
          order_id: order.id, log_type: 'error',
          message: '[' + acc.username + '] 自动推图失败: ' + e.message,
        });
      } catch (e2) {}
    }
  }

  return true;
}

// ── 工单类型分发 ──
async function dispatchOrder(order, orderIdx) {
  const orderType = order.order_type || '购买邀请积分';

  switch (orderType) {
    case '仙盟采集':
      return processAllianceDaily(order, orderIdx);
    case '试炼测试':
      return processTrialTest(order, orderIdx);
    case '每日试炼':
      return processDailyTrial(order, orderIdx);
    case '副本刷取':
      return processDungeonFarm(order, orderIdx);
    case '自动推图':
      return processAutoMap(order, orderIdx);
    case '购买邀请积分':
    default: {
      const existingAccounts = order.total_accounts_created || 0;
      if (existingAccounts > 0) {
        tsLog('已有 ' + existingAccounts + ' 个账号，跳过注册');
        return true;
      }
      const accountsToCreate = order.quantity || (order.bonus_points ? Math.max(1, Math.ceil(order.bonus_points / 120)) : 1);
      const maxAccounts = Math.min(accountsToCreate, 10);
      tsLog('类型: ' + orderType + ', 需创建账号: ' + maxAccounts + ' 个');

      for (let a = 0; a < maxAccounts; a++) {
        await antiDetect.randomDelay(5000);
        const r = await registerAndSetup(order, orderIdx * 10 + a);
        tsLog('结果 [' + (a + 1) + '/' + maxAccounts + ']: ' + (r.ok ? '✅ 注册成功 [' + r.username + ']' : '❌ ' + r.error));
        await antiDetect.smartPause(a, 3, 30);
      }
      return true;
    }
  }
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
    console.log('  类型: ' + (order.order_type || '购买邀请积分') + ', 邀请码: ' + (order.invite_code || '-'));

    const success = await dispatchOrder(order, i);

    const isSubscription = ['仙盟采集', '每日试炼', '副本刷取'].includes(order.order_type);
    if (success && !isSubscription) {
      const completeRes = await workerApi('/api/gh/complete-order', 'POST', { order_id: order.id });
      tsLog('工单 #' + order.id + ' 处理完成: ' + (completeRes.message || ''));
    } else if (success && isSubscription) {
      tsLog('工单 #' + order.id + ' 执行完成（订阅类，保持活跃）');
    } else {
      tsLog('工单 #' + order.id + ' 处理失败');
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  全部完成 ✓');
  console.log('═══════════════════════════════════════');
}

main().catch(e => {
  tsLog('❌ 致命错误: ' + e.message);
  process.exit(1);
});
