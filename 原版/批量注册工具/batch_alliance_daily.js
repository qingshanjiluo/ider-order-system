/**
 * 艾德尔修仙传 - 批量仙盟日常 + 洞府采集工具 🏯
 *
 * 功能:
 *   登录 → 检查/加入仙盟 → 沐浴 → 采摘 → 悟道 → 开启洞府采集
 *
 * 🛡️ 防封号:
 *   - 每账号独立伪造IP（31段真实中国运营商IP）
 *   - 独立 machine_id（6种格式防指纹）
 *   - 完整浏览器指纹轮换（UA/Sec-CH-UA/Accept-Language）
 *   - CDN代理链模拟（Via/X-Cache）
 *   - 操作间随机延迟 + 智能分段暂停
 *
 * 输入（环境变量）:
 *   ACCOUNTS          - 分号格式: user1,pass1;user2,pass2
 *   ACCOUNTS_FILE     - 账号文件路径
 *   CAVE_TYPE         - 采集类型: field(灵田) / mine(灵矿) 默认 field
 *   AUTO_JOIN_ALLIANCE - 是否自动加入仙盟: true/false 默认 true
 *   CI                - CI模式无交互
 *
 * 文件输入（优先级）:
 *   1. ACCOUNTS_FILE 指定路径
 *   2. accounts_email.txt（当前目录或上级目录）
 *   3. accounts.txt（当前目录或上级目录）
 */
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const antiDetect = require('./_anti_detect_shared');

const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

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
  const anti = antiDetect.buildAntiDetectHeaders(_apiIdx++);
  Object.assign(headers, anti);
  const r = await fetch(API_BASE + path, { method, headers, body: bodyStr || undefined, timeout: 30000 });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ts() { return new Date().toLocaleString('zh-CN', { hour12: false }); }
function log(tag, msg) { process.stdout.write('[' + ts() + '] [' + tag + '] ' + msg + '\n'); }

// ─── 每个账号的处理 ──────────────────────────────────────
async function processAccount(username, password, idx, caveType, autoJoin, allianceName) {
  try {
    setApiIdx(idx * 20 + 1);
    const ipInfo = antiDetect.getIpInfo(idx);
    log(username, 'IP: ' + ipInfo.ip + ' (' + ipInfo.isp + '·' + ipInfo.province + ')');

    log(username, '登录中...');
    const machineId = antiDetect.generateMachineId(idx);
    const loginData = await apiRequest('POST', '/auth/login', '', { username, password, machine_id: machineId });
    const token = loginData.token;
    const accountId = loginData.accountId;
    log(username, '登录成功 accountId=' + accountId);
    await sleep(1500);

    log(username, '获取角色状态...');
    const stateData = await apiRequest('GET', '/player/state', token);
    const player = stateData.player;
    if (!player) return { status: 'error', error: '无角色', done: [] };
    const level = player.level || 0;
    log(username, '角色等级: ' + level);
    await sleep(1000);

    const done = [];
    let allianceId = player.alliance_id || 0;

    // ─── 仙盟 ───
    if (!allianceId) {
      log(username, '未加入仙盟');
      if (autoJoin) {
        log(username, '搜索目标仙盟「' + allianceName + '」...');
        try {
          const listData = await apiRequest('GET', '/alliance/list', token);
          const alliances = listData.alliances || [];
          const target = alliances.find(a => a.name === allianceName && a.member_limit > (a.member_count || 0));
          if (target) {
            log(username, '申请加入: ' + target.name + ' (ID=' + target.id + ')');
            await apiRequest('POST', '/alliance/apply', token, { alliance_id: target.id });
            log(username, '已提交申请');
            done.push('apply_alliance');
            await sleep(2000);
            const state2 = await apiRequest('GET', '/player/state', token);
            allianceId = state2.player?.alliance_id || 0;
            if (allianceId) log(username, '已加入仙盟 ID=' + allianceId);
            else log(username, '申请已提交，等待盟主批准');
          } else {
            log(username, '未找到「' + allianceName + '」，尝试其他可加入仙盟...');
            const fallback = alliances.find(a =>
              a.member_limit > (a.member_count || 0) && a.gate_level <= level
            ) || alliances.find(a => a.member_limit > (a.member_count || 0));
            if (fallback) {
              log(username, '申请加入: ' + fallback.name + ' (ID=' + fallback.id + ')');
              await apiRequest('POST', '/alliance/apply', token, { alliance_id: fallback.id });
              log(username, '已提交申请');
              done.push('apply_alliance');
            } else {
              log(username, '未找到可加入的仙盟');
            }
          }
        } catch (e) {
          log(username, '仙盟申请失败: ' + e.message);
        }
      } else {
        log(username, '自动加入已关闭，跳过');
      }
    } else {
      log(username, '已加入仙盟 ID=' + allianceId);
    }

    // ─── 仙盟日常操作 ───
    if (allianceId) {
      // 沐浴
      try {
        log(username, '灵池沐浴...');
        await apiRequest('POST', '/alliance/spirit_pool/bathe', token, { alliance_id: allianceId });
        log(username, '沐浴成功');
        done.push('bathe');
      } catch (e) {
        log(username, '沐浴跳过: ' + e.message);
      }
      await sleep(1500);

      // 采摘
      try {
        log(username, '仙园采摘...');
        await apiRequest('POST', '/alliance/garden/pick', token, { alliance_id: allianceId });
        log(username, '采摘成功');
        done.push('garden_pick');
      } catch (e) {
        log(username, '采摘跳过: ' + e.message);
      }
      await sleep(1500);

      // 悟道
      try {
        log(username, '悟道树冥想...');
        await apiRequest('POST', '/alliance/enlightenment_tree/meditate', token, { alliance_id: allianceId });
        log(username, '悟道成功');
        done.push('meditate');
      } catch (e) {
        log(username, '悟道跳过: ' + e.message);
      }
      await sleep(1000);
    }

    // ─── 洞府采集 ───
    try {
      log(username, '检查洞府状态...');
      const caveStatus = await apiRequest('GET', '/online/cave/status', token);
      if (caveStatus.gathering) {
        log(username, '已在采集中，跳过');
        done.push('already_gathering');
      } else if ((caveStatus.rare_remaining || 0) <= 0) {
        log(username, '灵气已枯竭，无法采集');
        done.push('no_rare');
      } else {
        log(username, '开启采集 type=' + caveType);
        await apiRequest('POST', '/online/cave/start', token, { type: caveType });
        log(username, '采集已开启');
        done.push('start_gather');
      }
    } catch (e) {
      log(username, '洞府跳过: ' + e.message);
    }

    return { status: 'success', done, allianceId };
  } catch (e) {
    log(username, '失败: ' + e.message);
    return { status: 'error', error: e.message, done: [] };
  }
}

// ─── 加载账号 ───────────────────────────────────────────
function loadAllAccounts() {
  const envAccounts = process.env.ACCOUNTS || '';
  const fileOverride = process.env.ACCOUNTS_FILE || '';
  let accounts = [];

  if (envAccounts.trim()) {
    const parts = envAccounts.split(';').filter(s => s.trim());
    for (const p of parts) {
      const [u, pw] = p.split(',').map(s => s.trim());
      if (u && pw) accounts.push({ username: u, password: pw });
    }
    if (accounts.length) log('输入', '从 ACCOUNTS 环境变量加载 ' + accounts.length + ' 个');
  }

  const searchPaths = fileOverride
    ? [fileOverride]
    : ['accounts_email.txt', '../accounts_email.txt', 'accounts.txt', '../accounts.txt'];

  if (!accounts.length) {
    for (const fp of searchPaths) {
      if (fs.existsSync(fp)) {
        const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
        for (const line of lines) {
          const [u, pw] = line.split(',').map(s => s.trim());
          if (u && pw) accounts.push({ username: u, password: pw });
        }
        if (accounts.length) { log('输入', '从 ' + fp + ' 加载 ' + accounts.length + ' 个'); break; }
      }
    }
  }

  return accounts;
}

// ─── 主入口 ─────────────────────────────────────────────
async function main() {
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const caveType = (process.env.CAVE_TYPE || 'field').toLowerCase();
  const autoJoin = process.env.AUTO_JOIN_ALLIANCE !== 'false';
  const allianceName = process.env.ALLIANCE_NAME || '天地一家大爱盟';

  const accounts = loadAllAccounts();
  if (!accounts.length) {
    console.error('[错误] 没有找到账号');
    console.error('请通过 ACCOUNTS 环境变量或账号文件提供');
    process.exit(1);
  }

  if (!isCI) {
    console.log('\n===== 仙盟日常 + 洞府采集工具 =====');
    const start = await ask('起始序号(1-' + accounts.length + ', 默认1): ') || 1;
    const end = await ask('结束序号(1-' + accounts.length + ', 默认' + accounts.length + '): ') || accounts.length;
    const s = parseInt(start) - 1, e = parseInt(end);
    accounts.splice(0, s);
    accounts.splice(e - s);
    console.log('处理 ' + accounts.length + ' 个账号\n');
  }

  console.log('[配置] 账号: ' + accounts.length + ', 采集: ' + (caveType === 'field' ? '灵田' : '灵矿') + ', 自动加仙盟: ' + autoJoin + ', 目标仙盟: ' + allianceName);
  console.log('');

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < accounts.length; i++) {
    const { username, password } = accounts[i];
    const SEP = '───── ' + username + ' [' + (i+1) + '/' + accounts.length + '] ─────';
    console.log(SEP);

    const r = await processAccount(username, password, i, caveType, autoJoin, allianceName);
    results.push({ username, ...r });

    const dn = r.done?.length || 0;
    const icon = r.status === 'success' ? '✅' : '❌';
    console.log('  → ' + icon + ' 完成 ' + dn + ' 项: ' + (r.done?.join(', ') || r.error));

    const succ = results.filter(x => x.status === 'success').length;
    const fail = results.filter(x => x.status !== 'success').length;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log('[进度] ' + succ + '成功 ' + fail + '失败 | ' + Math.floor(elapsed/60) + 'm' + (elapsed%60) + 's');

    if (i < accounts.length - 1) {
      const d = 8000 + Math.floor(Math.random() * 5000);
      console.log('[等待] ' + Math.round(d/1000) + 's');
      await sleep(d);
    }

    if ((i + 1) % 3 === 0 && i < accounts.length - 1) {
      const pause = 25 + Math.floor(Math.random() * 20);
      console.log('[🛡️ 暂停] ' + pause + 's');
      await sleep(pause * 1000);
    }
    console.log('');
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  const finalSucc = results.filter(x => x.status === 'success').length;
  const finalFail = results.filter(x => x.status !== 'success').length;

  console.log('══════════════════════════════════');
  console.log('✅ 完成!');
  console.log('   成功: ' + finalSucc + ' / 失败: ' + finalFail);
  console.log('   耗时: ' + Math.floor(totalTime/60) + '分' + (totalTime%60) + '秒');
  console.log('');

  // 详情
  for (const r of results) {
    const icon = r.status === 'success' ? '✅' : '❌';
    const detail = r.done?.length ? r.done.join(', ') : r.error;
    console.log('  ' + icon + ' [' + r.username + '] ' + detail);
  }

  const output = {
    run_time: new Date().toISOString(),
    total: accounts.length,
    success: finalSucc,
    failed: finalFail,
    duration_seconds: totalTime,
    results: results.map(r => ({ username: r.username, status: r.status, done: r.done || [], error: r.error || '' })),
  };

  const outPath = 'alliance_daily_' + Date.now() + '.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log('\n结果: ' + outPath);

  if (process.env.GITHUB_STEP_SUMMARY) {
    let md = '# 🏯 仙盟日常 + 洞府采集\n\n| 账号 | 状态 | 操作 |\n|------|------|------|\n';
    for (const r of results) {
      const icon = r.status === 'success' ? '✅' : '❌';
      md += '| ' + r.username + ' | ' + icon + ' | ' + (r.done?.join(', ') || r.error) + ' |\n';
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md, 'utf-8');
  }

  if (finalFail > 0) process.exit(1);
}

if (require.main === module) {
  if (!process.env.CI) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    global.ask = q => new Promise(r => rl.question(q, a => { r(a); }));
    main().catch(e => { console.error('[致命] ' + e.message); process.exit(1); });
  } else {
    main().catch(e => { console.error('[致命] ' + e.message); process.exit(1); });
  }
}
