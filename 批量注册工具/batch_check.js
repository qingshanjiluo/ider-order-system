/**
 * 艾德尔修仙传 - 注册账号完整性检查修复工具
 *
 * ════════════════════════════════════════════════════════════
 *  📂 文件指向说明
 *  ════════════════════════════════════════════════════════════
 *  本工具读取「accounts.txt」（与注册工具 batch.js 共用）
 *  检查所有账号的：
 *    1. ✅ 技能是否装备（重击、火球术、治疗术）
 *    2. ✅ 铁剑是否装备
 *  如不完整，自动补装
 *  ════════════════════════════════════════════════════════════
 *
 * 使用：
 *   本地:  node batch_check.js
 *   CI:    CI=true node batch_check.js
 *   (该工具也支持独立账号文件检查：node batch_check.js --file=sell_accounts.txt)
 */
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================
// 常量
// ============================================================
const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

// 初始可学习的 3 个技能 ID 和名称（创建角色后自动解锁）
const STARTER_SKILL_IDS = [1, 2, 3];
const STARTER_SKILL_NAMES = { 1: '重击', 2: '火球术', 3: '治疗术' };

// 铁剑物品 ID（初始背包 slot 0,0 位置）
const IRON_SWORD_ITEM_ID = 11;

// ============================================================
// 签名 & API
// ============================================================
function makeSign(method, path, timestamp, bodyStr) {
  const data = method + '\n' + path + '\n' + timestamp + '\n' + bodyStr;
  const hmac = crypto.createHmac('sha256', SIGN_KEY);
  hmac.update(data);
  return hmac.digest('hex');
}

async function apiRequest(method, path, token, body) {
  if (token === undefined) token = '';
  if (body === undefined) body = null;
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = makeSign(method, path, timestamp, bodyStr);
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Version': CLIENT_VERSION,
    'X-Sign-T': String(timestamp),
    'X-Sign': sign
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const url = API_BASE + path;
  const opts = { method, headers, timeout: 30000 };
  if (bodyStr) opts.body = bodyStr;
  try {
    const r = await fetch(url, opts);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('非JSON响应(' + r.status + '): ' + text.slice(0, 200)); }
    if (!data || data.ok === false) { throw new Error(data && data.error ? data.error : '请求失败'); }
    return data;
  } catch (e) {
    if (e.message.includes('非JSON') || e.message.includes('请求失败')) throw e;
    throw new Error(path + ' 请求失败: ' + e.message);
  }
}

// ============================================================
// 日志
// ============================================================
const LOG_LEVELS = { INFO: 0, OK: 1, WARN: 2, ERR: 3 };
function log(level, tag, msg) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const icons = { INFO: 'ℹ', OK: '✓', WARN: '⚠', ERR: '✗' };
  console.log('[' + ts + '] [' + tag + '] ' + (icons[level] || '') + ' ' + msg);
}
function info(tag, msg) { log('INFO', tag, msg); }
function ok(tag, msg) { log('OK', tag, msg); }
function warn(tag, msg) { log('WARN', tag, msg); }
function err(tag, msg) { log('ERR', tag, msg); }

// ============================================================
// 延迟 + 安全数字
// ============================================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function int(v, def) { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : def; }

// ============================================================
// CI 检测
// ============================================================
const IS_CI = process.env.CI === 'true' || process.env.CI === '1';

function getEnvInt(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function getEnvBool(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return v === 'true' || v === '1' || v === 'yes';
}

// ============================================================
// 账号结构
// ============================================================
class Account {
  constructor(username, password) {
    this.username = String(username || '').trim();
    this.password = String(password || '').trim();
    this.token = '';
    this.accountId = 0;
    this.playerName = '';
  }
  isValid() {
    return this.username.length >= 2 && this.password.length >= 6;
  }
}

// ============================================================
// 加载账号文件（读取所有行，包括已 # 标记的）
// ============================================================
function loadAccounts(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const lines = fs.readFileSync(filepath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'));
  const accounts = [];
  for (const line of lines) {
    // 去掉行首的 #（已标记完成的也可以检查）
    const cleanLine = line.replace(/^#+\s*/, '').trim();
    if (!cleanLine) continue;
    const parts = cleanLine.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      const acc = new Account(parts[0], parts[1]);
      if (acc.isValid()) accounts.push(acc);
    }
  }
  return accounts;
}

// ============================================================
// 检查修复引擎
// ============================================================
class CheckRepairEngine {
  constructor(account, options) {
    this.account = account;
    this.options = Object.assign({
      skipIronSword: false,   // 是否跳过铁剑检查
      skipSkills: false,      // 是否跳过技能检查
      delayBetweenFixes: 500  // 修复操作间隔(ms)
    }, options || {});
    this.stats = {
      hasIronSword: false,    // 已有铁剑
      hasAllSkills: false,    // 已有全部3技能
      fixedIronSword: false,  // 修复了铁剑
      fixedSkills: 0,         // 修复了多少个技能
      skillsBefore: [],       // 修复前已装备的技能ID
      skillsAfter: [],        // 修复后已装备的技能ID
      errors: []
    };
    this.player = null;
    this.inventory = [];
    this.equippedSkills = [];
    this.shouldStop = false;
  }

  stop() { this.shouldStop = true; }

  async delay(ms) {
    if (ms <= 0 || this.shouldStop) return;
    const step = 100;
    for (let i = 0; i < ms / step; i++) {
      if (this.shouldStop) return;
      await sleep(step);
    }
  }

  // ============================================================
  // 步骤1: 登录
  // ============================================================
  async login() {
    info(this.account.username, '正在登录...');
    const body = { username: this.account.username, password: this.account.password, machine_id: 'batch-check-tool' };
    const data = await apiRequest('POST', '/auth/login', '', body);
    this.account.token = data.token;
    this.account.accountId = int(data.accountId, 0);
    ok(this.account.username, '登录成功, accountId=' + this.account.accountId);
  }

  // ============================================================
  // 步骤2: 获取玩家同步数据
  // ============================================================
  async fetchPlayerData() {
    info(this.account.username, '正在获取角色数据...');
    const data = await apiRequest('GET', '/player/sync', this.account.token);
    const player = data && data.player ? data.player : data;
    this.player = player;

    // 获取已装备的技能
    this.equippedSkills = (Array.isArray(player.equipped_skills) ? player.equipped_skills : [])
      .map(id => int(id, 0))
      .filter(id => id > 0);

    // 获取背包（查找铁剑用）
    this.inventory = Array.isArray(player.inventory) ? player.inventory : [];

    return { player, equippedSkills: this.equippedSkills, inventory: this.inventory };
  }

  // ============================================================
  // 检查技能装备情况
  // ============================================================
  checkSkills() {
    const missing = [];
    const present = [];
    for (const skillId of STARTER_SKILL_IDS) {
      if (this.equippedSkills.includes(skillId)) {
        present.push(skillId);
      } else {
        missing.push(skillId);
      }
    }

    this.stats.hasAllSkills = missing.length === 0;
    this.stats.skillsBefore = [...this.equippedSkills];

    info(this.account.username, '技能检查: 已装备 ' + present.length + '/' + STARTER_SKILL_IDS.length + ' 个初始技能');
    for (const id of present) {
      ok(this.account.username, '  ✅ ' + STARTER_SKILL_NAMES[id] + ' (id=' + id + ') 已装备');
    }
    for (const id of missing) {
      warn(this.account.username, '  ❌ ' + STARTER_SKILL_NAMES[id] + ' (id=' + id + ') 未装备');
    }

    return { present, missing };
  }

  // ============================================================
  // 检查铁剑装备情况
  // ============================================================
  checkIronSword() {
    const equip = this.player && this.player.equipment ? this.player.equipment : {};
    // 装备栏中的武器
    const weapon = equip.weapon || null;

    if (weapon && String(weapon.name || '').includes('铁剑')) {
      this.stats.hasIronSword = true;
      ok(this.account.username, '  ✅ 铁剑已装备');
      return true;
    }

    // 检查背包是否有铁剑
    let foundInInventory = null;
    for (let p = 0; p < this.inventory.length; p++) {
      const row = this.inventory[p];
      if (!Array.isArray(row)) continue;
      for (let s = 0; s < row.length; s++) {
        const slot = row[s];
        if (slot && slot.item && String(slot.item.name || '').includes('铁剑')) {
          foundInInventory = { page: p, slotIndex: s, item: slot.item };
          break;
        }
      }
      if (foundInInventory) break;
    }

    if (foundInInventory) {
      warn(this.account.username, '  ❌ 铁剑在背包中（slot=' + foundInInventory.page + ',' + foundInInventory.slotIndex + '），尚未装备');
    } else {
      warn(this.account.username, '  ❌ 背包中未找到铁剑');
    }

    this.stats.hasIronSword = false;
    this._ironSwordLocation = foundInInventory;
    return false;
  }

  // ============================================================
  // 修复：装备缺失的技能
  // ============================================================
  async fixSkills(missingSkillIds) {
    if (!missingSkillIds || missingSkillIds.length === 0) return;

    info(this.account.username, '开始补装 ' + missingSkillIds.length + ' 个技能...');
    let fixed = 0;

    for (const skillId of missingSkillIds) {
      if (this.shouldStop) break;
      const skillName = STARTER_SKILL_NAMES[skillId] || ('技能#' + skillId);

      try {
        info(this.account.username, '装备技能: ' + skillName + ' (id=' + skillId + ')');
        await apiRequest('POST', '/player/equip_skill', this.account.token, { skill_id: skillId });
        ok(this.account.username, '  ✅ ' + skillName + ' 装备成功');
        fixed++;
        await this.delay(this.options.delayBetweenFixes);
      } catch (e) {
        // 如果报"已装备"或"已满"，不是错误
        if (e.message && (e.message.includes('已装备') || e.message.includes('已满') || e.message.includes('位置'))) {
          info(this.account.username, '  ' + skillName + ': ' + e.message + '（无需修复）');
          // 已装备也算成功
          fixed++;
        } else {
          warn(this.account.username, '  ❌ ' + skillName + ' 装备失败: ' + e.message);
          this.stats.errors.push({ skillId, skillName, error: e.message });
        }
        await this.delay(200);
      }
    }

    this.stats.fixedSkills = fixed;
    return fixed;
  }

  // ============================================================
  // 修复：装备铁剑
  // ============================================================
  async fixIronSword() {
    if (this.stats.hasIronSword) return false;

    // 如果已知铁剑在背包中的位置，直接装备
    if (this._ironSwordLocation) {
      const loc = this._ironSwordLocation;
      try {
        info(this.account.username, '正在装备铁剑（背包 ' + loc.page + ',' + loc.slotIndex + '）...');
        await apiRequest('POST', '/player/equip', this.account.token, {
          page: loc.page,
          slot_index: loc.slotIndex,
          expect_item_id: int(loc.item.id, 0)
        });
        ok(this.account.username, '  ✅ 铁剑装备成功');
        this.stats.fixedIronSword = true;
        return true;
      } catch (e) {
        warn(this.account.username, '  ❌ 铁剑装备失败: ' + e.message);
        this.stats.errors.push({ action: 'equip_iron_sword', error: e.message });
        return false;
      }
    }

    // 否则重新遍历背包查找
    try {
      const sync = await apiRequest('GET', '/player/sync', this.account.token);
      const player = sync && sync.player ? sync.player : sync;
      const inv = Array.isArray(player.inventory) ? player.inventory : [];
      let found = false;

      for (let p = 0; p < inv.length; p++) {
        if (this.shouldStop) break;
        const row = inv[p];
        if (!Array.isArray(row)) continue;
        for (let s = 0; s < row.length; s++) {
          const slot = row[s];
          if (slot && slot.item && String(slot.item.name || '').includes('铁剑')) {
            info(this.account.username, '正在装备铁剑（背包 ' + p + ',' + s + '）...');
            await apiRequest('POST', '/player/equip', this.account.token, {
              page: p,
              slot_index: s,
              expect_item_id: int(slot.item.id, 0)
            });
            ok(this.account.username, '  ✅ 铁剑装备成功');
            this.stats.fixedIronSword = true;
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        warn(this.account.username, '  ❌ 背包中未找到铁剑，可能已被卖出或分解');
        this.stats.errors.push({ action: 'find_iron_sword', error: '背包中未找到铁剑' });
      }

      return found;
    } catch (e) {
      warn(this.account.username, '  ❌ 查找/装备铁剑失败: ' + e.message);
      this.stats.errors.push({ action: 'fix_iron_sword', error: e.message });
      return false;
    }
  }

  // ============================================================
  // 重新获取装备后的技能列表（用于最终验证）
  // ============================================================
  async verifyFixes() {
    try {
      const data = await apiRequest('GET', '/player/sync', this.account.token);
      const player = data && data.player ? data.player : data;
      this.stats.skillsAfter = (Array.isArray(player.equipped_skills) ? player.equipped_skills : [])
        .map(id => int(id, 0)).filter(id => id > 0);

      const equip = player.equipment || {};
      const weapon = equip.weapon || null;

      ok(this.account.username, '最终确认: ' +
        '技能 ' + this.stats.skillsAfter.length + '/' + STARTER_SKILL_IDS.length + ' 个, ' +
        '铁剑 ' + (weapon && String(weapon.name || '').includes('铁剑') ? '✅' : '❌'));
    } catch (e) {
      warn(this.account.username, '验证失败: ' + e.message);
    }
  }

  // ============================================================
  // 运行完整检查修复流程
  // ============================================================
  async run() {
    this.shouldStop = false;
    const acc = this.account;

    console.log('');
    info('引擎', '═══ ' + acc.username + ' ═══');

    // 1. 登录
    try {
      await this.login();
      await this.delay(500);
    } catch (e) {
      err(acc.username, '登录失败: ' + e.message);
      this.stats.errors.push({ action: 'login', error: e.message });
      return this.stats;
    }

    // 2. 获取玩家数据
    try {
      await this.fetchPlayerData();
    } catch (e) {
      err(acc.username, '获取角色数据失败: ' + e.message);
      this.stats.errors.push({ action: 'fetch', error: e.message });
      return this.stats;
    }

    // 3. 检查技能
    let needsFix = false;
    if (!this.options.skipSkills) {
      const { present, missing } = this.checkSkills();

      if (missing.length > 0) {
        needsFix = true;
        await this.delay(500);

        // 修复缺失的技能
        await this.fixSkills(missing);
      } else {
        ok(acc.username, '技能齐全，无需修复');
      }
    }

    // 4. 检查铁剑
    if (!this.options.skipIronSword) {
      const hasIronSword = this.checkIronSword();

      if (!hasIronSword) {
        needsFix = true;
        await this.delay(500);

        // 修复铁剑
        await this.fixIronSword();
      }
    }

    // 5. 最终验证（如果有修复操作）
    if (needsFix) {
      await this.delay(800);
      await this.verifyFixes();
    }

    return this.stats;
  }
}

// ============================================================
// 结果持久化
// ============================================================
function saveResult(result) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = 'check_result_' + ts + '.json';
  try {
    fs.writeFileSync(filename, JSON.stringify(result, null, 2), 'utf-8');
    info('保存', '结果已保存: ' + filename);
  } catch (e) {
    warn('保存', '保存结果失败: ' + e.message);
  }
}

// ============================================================
// Banner & Help
// ============================================================
function showBanner() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║    艾德尔修仙传 - 注册账号完整性检查修复工具 v1.0      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  📂 账号文件：./accounts.txt                          ║');
  console.log('║     检查项：                                          ║');
  console.log('║     ① 技能 - 重击 / 火球术 / 治疗术                  ║');
  console.log('║     ② 装备 - 铁剑                                    ║');
  console.log('║     自动补装不完整项                                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
}

function showHelp() {
  console.log('');
  console.log('检查内容:');
  console.log('  📌 技能（3个初始技能）');
  console.log('     id=1  重击    active  physical');
  console.log('     id=2  火球术  active  magic');
  console.log('     id=3  治疗术  active  heal');
  console.log('');
  console.log('  📌 装备');
  console('     铁剑（id=11）装备到武器栏');
  console.log('');
  console.log('使用:');
  console.log('  node batch_check.js             正常检查修复');
  console.log('  node batch_check.js --help      显示帮助');
  console.log('  node batch_check.js --check-only 仅检查，不修复');
  console.log('  CI=true node batch_check.js     CI模式');
  console.log('');
}

// ============================================================
// 主函数
// ============================================================
async function main() {
  showBanner();

  // 解析命令行参数
  const args = process.argv.slice(2);
  const isHelp = args.includes('--help') || args.includes('-h');
  const checkOnly = args.includes('--check-only') || args.includes('-c');

  // 自定义账号文件
  let filepath = './accounts.txt';
  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      filepath = arg.slice(7);
    }
  }

  if (isHelp) {
    showHelp();
    process.exit(0);
  }

  // ============================================================
  // CI 模式
  // ============================================================
  if (IS_CI) {
    console.log('═══════════════════════════════════════════════');
    console.log('  检测到 CI 环境，自动使用环境变量配置');
    console.log('═══════════════════════════════════════════════');

    if (process.env.ACCOUNTS_DATA) {
      fs.writeFileSync(filepath, process.env.ACCOUNTS_DATA, 'utf-8');
    }
    if (process.env.ACCOUNTS_BASE64) {
      const buf = Buffer.from(process.env.ACCOUNTS_BASE64, 'base64');
      fs.writeFileSync(filepath, buf.toString('utf-8'), 'utf-8');
    }

    const accounts = loadAccounts(filepath);
    if (accounts.length === 0) {
      console.error('❌ CI 模式下未找到有效账号！');
      process.exit(1);
    }

    console.log('配置:');
    console.log('  📂 账号文件: ' + filepath);
    console.log('  👤 账号数: ' + accounts.length + ' 个');
    console.log('  🔍 模式: ' + (checkOnly ? '仅检查' : '检查并修复'));
    console.log('═══════════════════════════════════════════════');

    const overallStats = {
      totalAccounts: accounts.length,
      filepath: filepath,
      mode: checkOnly ? 'check-only' : 'check-and-repair',
      timestamp: new Date().toISOString(),
      accounts: []
    };
    let hasError = false;

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      console.log('');
      console.log('═══ 处理账号 [' + (i + 1) + '/' + accounts.length + ']: ' + acc.username + ' ═══');

      const engine = new CheckRepairEngine(acc, {
        skipSkills: false,
        skipIronSword: false
      });

      process.on('SIGTERM', () => { engine.stop(); });

      try {
        const stats = await engine.run();
        overallStats.accounts.push({
          username: acc.username,
          stats: {
            hasAllSkills: stats.hasAllSkills,
            hasIronSword: stats.hasIronSword,
            fixedSkills: stats.fixedSkills,
            fixedIronSword: stats.fixedIronSword,
            errors: stats.errors
          }
        });
        if (stats.errors.length > 0) hasError = true;
      } catch (e) {
        err(acc.username, '处理失败: ' + e.message);
        overallStats.accounts.push({ username: acc.username, error: e.message });
        hasError = true;
      }

      if (i < accounts.length - 1) {
        console.log('');
        info('引擎', '等待 2 秒后处理下一个账号...');
        await sleep(2000);
      }
    }

    saveResult(overallStats);

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('全部账号处理完成！');
    console.log('  总账号: ' + overallStats.totalAccounts);
    console.log('  异常数: ' + overallStats.accounts.filter(a => (a.stats && a.stats.errors && a.stats.errors.length > 0) || a.error).length);
    console.log('═══════════════════════════════════════════════');
    process.exit(hasError ? 1 : 0);
  }

  // ============================================================
  // 交互模式
  // ============================================================
  if (!fs.existsSync(filepath)) {
    console.log('未找到 ' + filepath + '（账号文件）');
    const createNew = await ask('是否手动输入账号? (Y/n): ');
    if (createNew.toLowerCase() !== 'n') {
      const input = await ask('请输入用户名: ');
      const pwd = await ask('请输入密码: ');
      if (input && pwd) {
        fs.writeFileSync(filepath, input + ',' + pwd, 'utf-8');
        console.log('已创建 ' + filepath);
      } else {
        console.log('无有效账号，退出');
        process.exit(0);
      }
    } else {
      process.exit(0);
    }
  }

  const accounts = loadAccounts(filepath);
  if (accounts.length === 0) {
    console.log('没有有效账号');
    process.exit(0);
  }

  console.log('当前 ' + accounts.length + ' 个账号:');
  for (const acc of accounts) {
    console.log('  [' + acc.username + ']');
  }

  if (checkOnly) {
    console.log('');
    console.log('⚠️  仅检查模式，不会进行修复');
  }

  console.log('');
  const confirm = await ask('是否开始检查' + (checkOnly ? '' : '修复') + '? (Y/n): ');
  if (confirm.toLowerCase() === 'n' || confirm.toLowerCase() === 'no') {
    console.log('已取消');
    process.exit(0);
  }

  const overallStats = {
    totalAccounts: accounts.length,
    filepath: filepath,
    mode: checkOnly ? 'check-only' : 'check-and-repair',
    timestamp: new Date().toISOString(),
    accounts: []
  };

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    console.log('');
    console.log('═══ 处理账号 [' + (i + 1) + '/' + accounts.length + ']: ' + acc.username + ' ═══');

    const engine = new CheckRepairEngine(acc, {
      skipSkills: false,
      skipIronSword: false
    });

    process.on('SIGINT', () => { engine.stop(); });

    try {
      const stats = await engine.run();
      overallStats.accounts.push({
        username: acc.username,
        stats: {
          hasAllSkills: stats.hasAllSkills,
          hasIronSword: stats.hasIronSword,
          fixedSkills: stats.fixedSkills,
          fixedIronSword: stats.fixedIronSword,
          errors: stats.errors
        }
      });
    } catch (e) {
      err(acc.username, '处理失败: ' + e.message);
      overallStats.accounts.push({ username: acc.username, error: e.message });
    }

    if (i < accounts.length - 1) {
      console.log('');
      info('引擎', '等待 2 秒后处理下一个账号...');
      await sleep(2000);
    }
  }

  saveResult(overallStats);

  // 输出汇总
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('📋 检查结果汇总');
  console.log('═══════════════════════════════════════════════');
  let allOk = 0;
  let hasIssue = 0;
  let hasError2 = 0;
  for (const a of overallStats.accounts) {
    const s = a.stats || {};
    const errs = (s.errors || []).length;
    const fixed = (s.fixedSkills || 0) + (s.fixedIronSword ? 1 : 0);
    if (errs > 0) {
      hasError2++;
      console.log('  ❌ ' + a.username + ' - 错误 ' + errs + ' 个');
    } else if (fixed > 0) {
      hasIssue++;
      console.log('  ⚠️  ' + a.username + ' - 已修复 ' + fixed + ' 项');
    } else if (s.hasAllSkills && s.hasIronSword) {
      allOk++;
      console.log('  ✅ ' + a.username + ' - 完整');
    } else {
      hasIssue++;
      console.log('  ⚠️  ' + a.username + ' - 不完整但未修复');
    }
  }
  console.log('');
  console.log('  完整: ' + allOk + ' | 已修复: ' + hasIssue + ' | 错误: ' + hasError2);
  console.log('═══════════════════════════════════════════════');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('按回车键退出...', () => { rl.close(); });
}

function ask(question) {
  if (IS_CI) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

// ============================================================
// 启动
// ============================================================
main().catch(e => {
  console.error('程序异常:', e.message);
  console.error(e.stack);
  process.exit(1);
});
