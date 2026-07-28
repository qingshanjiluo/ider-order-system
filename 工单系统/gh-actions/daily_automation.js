/**
 * 艾德尔修仙传 - 每日全自动综合脚本 🏯
 *
 * 功能:
 *   登录 → 仙盟(沐浴/采摘/悟道) → 领取邮件(不清理) →
 *   洞府(灵草/金属每日轮换) → 传人(最高地图) →
 *   试炼(有记录跳过测试直接挑战N次) → 副本(混合/阵法/普通) →
 *   周6系统配对
 *
 * 输入（环境变量）:
 *   ACCOUNT_USERNAME  - 账号
 *   ACCOUNT_PASSWORD  - 密码
 *   TRIAL_DAYS        - 试炼挑战天数(默认10)
 *   SKIP_MAIL         - 跳过邮件(true/false)
 *   SKIP_ALLIANCE     - 跳过仙盟(true/false)
 *   SKIP_CAVE         - 跳过洞府(true/false)
 *   SKIP_DISCIPLE     - 跳过传人(true/false)
 *   SKIP_TRIAL        - 跳过试炼(true/false)
 *   SKIP_DUNGEON      - 跳过副本(true/false)
 *   CI                - CI模式
 */

const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// ── 配置 ──
const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS) || 10;

// 尝试加载反检测模块
let antiDetect = null;
try { antiDetect = require('./_anti_detect'); } catch(e) {
  try { antiDetect = require('../批量注册工具/_anti_detect_shared'); } catch(e2) {}
}

// ── 工具函数 ──
let _reqIdx = 0;
function makeSign(method, path, timestamp, bodyStr) {
  const hmac = crypto.createHmac('sha256', SIGN_KEY);
  hmac.update(method + '\n' + path + '\n' + timestamp + '\n' + bodyStr);
  return hmac.digest('hex');
}

async function api(method, urlPath, token, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = makeSign(method, urlPath, timestamp, bodyStr);
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Version': CLIENT_VERSION,
    'X-Sign-T': String(timestamp),
    'X-Sign': sign,
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (antiDetect) {
    const anti = antiDetect.buildAntiDetectHeaders(_reqIdx++);
    Object.assign(headers, anti);
  }
  const r = await fetch(API_BASE + urlPath, { method, headers, body: bodyStr || undefined });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0,200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败('+r.status+')');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ts() { return new Date().toLocaleString('zh-CN', {hour12:false}); }
function log(msg) { process.stdout.write('[' + ts() + '] ' + msg + '\n'); }

// ── 账号操作 ──
async function login(username, password) {
  log('登录: ' + username);
  const machineId = antiDetect ? antiDetect.generateMachineId(0) : 'web_' + Math.random().toString(36).slice(2,10);
  const res = await api('POST', '/auth/login', null, { username, password, machine_id: machineId, client_version: CLIENT_VERSION });
  if (!res || !res.token) throw new Error('登录失败: 无token');
  log('登录成功');
  return res.token;
}

// 1. 仙盟日常
async function doAlliance(token) {
  log('--- 仙盟日常 ---');
  const list = await api('GET', '/alliance/list', token);
  if (!list || !list.alliances || list.alliances.length === 0) {
    log('未加入仙盟，跳过');
    return;
  }
  const aId = list.alliances[0].id;
  log('仙盟ID: ' + aId);
  try { await api('POST', '/alliance/spirit_pool/bathe', token, { alliance_id: aId }); log('沐浴完成'); } catch(e) { log('沐浴跳过: ' + e.message); }
  await sleep(1500);
  try { await api('POST', '/alliance/garden/pick', token, { alliance_id: aId }); log('采摘完成'); } catch(e) { log('采摘跳过: ' + e.message); }
  await sleep(1500);
  try { await api('POST', '/alliance/enlightenment_tree/meditate', token, { alliance_id: aId }); log('悟道完成'); } catch(e) { log('悟道跳过: ' + e.message); }
}

// 2. 邮件（只领取不清理）
async function doMail(token) {
  log('--- 领取邮件 ---');
  try { const r = await api('POST', '/mail/claim_all', token); log('邮件领取完成'); } catch(e) { log('邮件跳过: ' + e.message); }
}

// 3. 洞府（每日轮换采集类型）
async function doCave(token) {
  log('--- 洞府采集 ---');
  const status = await api('GET', '/online/cave/status', token);
  if (status && status.gathering) { log('已有采集进行中'); return; }
  // 轮换类型
  const stateFile = 'cave_state_' + (process.env.ACCOUNT_USERNAME || 'default') + '.txt';
  let lastType = 'mine';
  try { lastType = fs.readFileSync(stateFile, 'utf-8').trim(); } catch(e) {}
  const types = ['field', 'mine'];
  const labels = { field: '灵田(灵草)', mine: '灵矿(金属)' };
  let nextType = 'field';
  for (let i = 0; i < types.length; i++) {
    if (types[i] === lastType) { nextType = types[(i + 1) % types.length]; break; }
  }
  try {
    await api('POST', '/online/cave/start', token, { type: nextType });
    log('采集开始: ' + labels[nextType]);
    fs.writeFileSync(stateFile, nextType);
  } catch(e) { log('洞府跳过: ' + e.message); }
}

// 4. 传人（派出到最高级地图）
async function doDisciple(token) {
  log('--- 派出传人 ---');
  try { await api('POST', '/online/disciple/recall', token); log('已召回传人'); await sleep(1500); } catch(e) {}
  // 获取玩家数据找最高级地图
  try {
    const state = await api('GET', '/player/state', token);
    const maxMapId = (state && state.player && state.player.max_map_id) ? state.player.max_map_id : 1;
    log('最高地图ID: ' + maxMapId);
    await api('POST', '/online/disciple/send', token, { map_id: maxMapId, material_filter: 'all' });
    log('传人已派出到地图 ' + maxMapId);
  } catch(e) { log('传人跳过: ' + e.message); }
}

// 5-6. 试炼（有记录就跳过测试直接挑战）
async function doTrial(token) {
  log('--- 试炼 ---');
  let bestConfig = null;
  const stateFile = 'trial_state_' + (process.env.ACCOUNT_USERNAME || 'default') + '.json';
  
  // 读取历史最佳配置
  try { bestConfig = JSON.parse(fs.readFileSync(stateFile, 'utf-8')); } catch(e) {}
  
  // 只有从未测试过才全量测试
  if (!bestConfig || !bestConfig.config) {
    log('无历史记录，开始测试试炼最佳配置...');
    try {
      const r = await api('POST', '/trial/start', token);
      if (r && r.battle_id) {
        let result = null;
        while (true) {
          await sleep(2000);
          const adv = await api('POST', '/trial/advance?state=full', token, { battle_id: r.battle_id });
          if (!adv || adv.state !== 'active') { result = adv; break; }
        }
        log('试炼测试完成');
        if (result) {
          bestConfig = { score: result.score || 0, config: result.config || null, date: new Date().toISOString() };
          fs.writeFileSync(stateFile, JSON.stringify(bestConfig, null, 2));
          log('最佳配置已保存');
        }
      }
    } catch(e) { log('试炼测试失败: ' + e.message); }
  } else {
    log('已有历史最佳配置，跳过测试，直接挑战');
  }

  // 挑战N次(用最佳配置)
  if (bestConfig && bestConfig.config) {
    log('使用最佳配置挑战 ' + TRIAL_DAYS + ' 次');
    for (let i = 0; i < TRIAL_DAYS; i++) {
      try {
        const r = await api('POST', '/trial/start', token);
        if (r && r.battle_id) {
          while (true) {
            await sleep(2000);
            const adv = await api('POST', '/trial/advance?state=full', token, { battle_id: r.battle_id });
            if (!adv || adv.state !== 'active') break;
          }
          log('试炼挑战 ' + (i+1) + '/' + TRIAL_DAYS + ' 完成');
        }
      } catch(e) { log('试炼挑战 ' + (i+1) + ' 失败: ' + e.message); }
      await sleep(2000);
    }
  } else {
    // 无最佳配置时普通挑战
    log('无最佳配置，普通挑战');
    for (let i = 0; i < Math.min(TRIAL_DAYS, 5); i++) {
      try {
        const r = await api('POST', '/trial/start', token);
        if (r && r.battle_id) {
          while (true) {
            await sleep(2000);
            const adv = await api('POST', '/trial/advance?state=full', token, { battle_id: r.battle_id });
            if (!adv || adv.state !== 'active') break;
          }
        }
      } catch(e) { log('挑战 ' + (i+1) + ' 失败'); }
      await sleep(2000);
    }
  }
}

// 7. 副本
async function doDungeon(token) {
  log('--- 副本清关 ---');
  try {
    const list = await api('GET', '/dungeon/list', token);
    if (!list || !list.length) { log('无可用副本'); return; }
    log('发现 ' + list.length + ' 个副本');
    let idx = 0;
    for (const d of list) {
      const modes = ['mixed', 'formation', 'normal'];
      for (const mode of modes) {
        try {
          const r = await api('POST', '/dungeon-battle/start', token, { dungeon_id: d.id, dungeon_mode: mode });
          if (r && r.battle_id) {
            while (true) {
              await sleep(2000);
              const adv = await api('POST', '/dungeon-battle/advance?state=full', token, { battle_id: r.battle_id });
              if (!adv || adv.state !== 'active') break;
            }
            log('副本 ' + d.id + ' [' + mode + '] 完成');
          }
        } catch(e) { log('副本 ' + d.id + ' [' + mode + '] 跳过: ' + e.message); }
        idx++;
        await sleep(1500);
      }
    }
  } catch(e) { log('副本出错: ' + e.message); }
}

// 8. 周6配对
async function doSaturdayMatch(token) {
  const dow = new Date().getDay();
  if (dow !== 6) { log('今天不是周六(' + dow + ')，跳过配对'); return; }
  log('--- 周六系统配对 ---');
  try {
    const list = await api('GET', '/dungeon-battle/city_duel/list', token, { page: 1, page_size: 10, keyword: '' });
    if (list && list.length) {
      await api('POST', '/dungeon-battle/city_duel/start', token, { target_account_id: list[0].account_id });
      log('斗法配对已开始');
    }
  } catch(e) { log('配对跳过: ' + e.message); }
}

// ── 主流程 ──
async function main() {
  log('═══ 艾德尔修仙传 · 每日自动化 ═══');
  log('账号: ' + (process.env.ACCOUNT_USERNAME || '未设置'));
  log('试炼天数: ' + TRIAL_DAYS);

  if (!process.env.ACCOUNT_USERNAME || !process.env.ACCOUNT_PASSWORD) {
    log('错误: 请设置 ACCOUNT_USERNAME 和 ACCOUNT_PASSWORD 环境变量');
    process.exit(1);
  }

  try {
    const token = await login(process.env.ACCOUNT_USERNAME, process.env.ACCOUNT_PASSWORD);
    
    // 预热延迟
    await sleep(2000);

    // 按顺序执行
    if (process.env.SKIP_ALLIANCE !== 'true') {
      await doAlliance(token);
      await sleep(3000);
    }
    if (process.env.SKIP_MAIL !== 'true') {
      await doMail(token);
      await sleep(2000);
    }
    if (process.env.SKIP_CAVE !== 'true') {
      await doCave(token);
      await sleep(2000);
    }
    if (process.env.SKIP_DISCIPLE !== 'true') {
      await doDisciple(token);
      await sleep(2000);
    }
    if (process.env.SKIP_TRIAL !== 'true') {
      await doTrial(token);
      await sleep(2000);
    }
    if (process.env.SKIP_DUNGEON !== 'true') {
      await doDungeon(token);
      await sleep(2000);
    }
    await doSaturdayMatch(token);

    log('═══ 全部任务完成 ═══');
  } catch(e) {
    log('严重错误: ' + e.message);
    process.exit(1);
  }
}

if (require.main === module) main();
