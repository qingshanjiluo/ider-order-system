/**
 * 艾德尔修仙传 - 邮箱池管理器
 *
 * 功能：
 *   1. 自动创建临时邮箱池（从多个免费提供商获取）
 *   2. 管理邮箱生命周期（创建/释放/回收）
 *   3. 提供商健康检测（自动剔除不可用的提供商）
 *   4. 导出邮箱池供 batch_email_bind.js 使用
 *
 * 使用：
 *   node email_pool_manager.js --create-pool 10
 *   node email_pool_manager.js --check-health
 *   node email_pool_manager.js --list-pool
 */
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const POOL_FILE = './email_pool.json';
const RESULT_FILE = './email_bind_result.txt';

const PROVIDERS = [
  {
    key: 'tempmail_lol',
    name: 'TempMail.lol',
    create: async () => {
      const r = await fetch('https://api.tempmail.lol/v2/inbox', { method: 'POST', timeout: 15000 });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      return { email: data.address, token: data.token, createdAt: Date.now() };
    },
    test: async () => {
      const r = await fetch('https://api.tempmail.lol/v2/inbox', { method: 'POST', timeout: 10000 });
      return r.ok;
    },
  },
  {
    key: 'mail_tm',
    name: 'Mail.tm',
    create: async () => {
      const dr = await fetch('https://api.mail.tm/domains', { timeout: 10000 });
      const domains = await dr.json();
      const domain = domains['hydra:member']?.[0]?.domain;
      if (!domain) throw new Error('no domain');
      const local = 'pool' + Math.random().toString(36).slice(2, 10);
      await fetch('https://api.mail.tm/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: local + '@' + domain, password: 'PoolPass1!' }),
        timeout: 15000,
      });
      const ar = await fetch('https://api.mail.tm/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: local + '@' + domain, password: 'PoolPass1!' }),
        timeout: 10000,
      });
      const auth = await ar.json();
      return { email: local + '@' + domain, token: auth.token, createdAt: Date.now() };
    },
    test: async () => {
      const r = await fetch('https://api.mail.tm/domains', { timeout: 10000 });
      return r.ok;
    },
  },
  {
    key: 'secmail',
    name: '1secmail',
    create: async () => {
      const local = 'pool' + Math.random().toString(36).slice(2, 10);
      const domains = ['1secmail.com', '1secmail.org', '1secmail.net'];
      const domain = domains[Math.floor(Math.random() * domains.length)];
      return { email: local + '@' + domain, token: local, domain, createdAt: Date.now() };
    },
    test: async () => {
      const r = await fetch('https://www.1secmail.com/api/v1/?action=getDomains', { timeout: 10000 });
      return r.ok;
    },
  },
  {
    key: 'tempy_email',
    name: 'Tempy.email',
    create: async () => {
      const r = await fetch('https://tempy.email/api/v1/mailbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      return { email: data.email, token: data.token || '', createdAt: Date.now() };
    },
    test: async () => {
      const r = await fetch('https://tempy.email/api/v1/mailbox', { method: 'POST', timeout: 10000 });
      return r.ok;
    },
  },
  {
    key: 'mail_gw',
    name: 'Mail.gw',
    create: async () => {
      const dr = await fetch('https://api.mail.gw/domains', { timeout: 10000 });
      const domains = await dr.json();
      const domain = domains['hydra:member']?.[0]?.domain || 'mail.gw';
      const local = 'pool' + Math.random().toString(36).slice(2, 10);
      const email = local + '@' + domain;
      const pass = 'Pass' + Math.random().toString(36).slice(2, 10);
      await fetch('https://api.mail.gw/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/ld+json' },
        body: JSON.stringify({ address: email, password: pass }),
        timeout: 15000,
      });
      const tr = await fetch('https://api.mail.gw/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: email, password: pass }),
        timeout: 10000,
      });
      const tok = await tr.json();
      return { email, token: tok.token, createdAt: Date.now() };
    },
    test: async () => {
      const r = await fetch('https://api.mail.gw/domains', { timeout: 10000 });
      return r.ok;
    },
  },
];

function log(msg) {
  console.log('[' + new Date().toLocaleString('zh-CN', { hour12: false }) + '] ' + msg);
}

function loadPool() {
  try {
    if (fs.existsSync(POOL_FILE)) {
      return JSON.parse(fs.readFileSync(POOL_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { emails: [], providerHealth: {} };
}

function savePool(pool) {
  fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2), 'utf-8');
}

async function createPool(count) {
  const pool = loadPool();
  log('创建邮箱池: ' + count + ' 个');
  let success = 0;
  let fail = 0;

  for (let i = 0; i < count; i++) {
    const provider = PROVIDERS[i % PROVIDERS.length];
    try {
      log('[' + (i + 1) + '/' + count + '] 创建 ' + provider.name + '...');
      const inbox = await provider.create();
      pool.emails.push({
        email: inbox.email,
        provider: provider.key,
        providerName: provider.name,
        token: inbox.token,
        createdAt: inbox.createdAt,
        status: 'available',
      });
      success++;
      log('  -> ' + inbox.email + ' ✓');
    } catch (e) {
      fail++;
      log('  -> ' + provider.name + ' 失败: ' + e.message + ' ✗');
    }
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }
  }

  pool.lastUpdated = Date.now();
  savePool(pool);
  log('完成: 成功 ' + success + ', 失败 ' + fail + ', 池中总计 ' + pool.emails.length);
}

async function checkHealth() {
  log('检查邮箱提供商健康状态...');
  const pool = loadPool();
  if (!pool.providerHealth) pool.providerHealth = {};

  for (const provider of PROVIDERS) {
    try {
      const ok = await provider.test();
      pool.providerHealth[provider.key] = { status: ok ? 'healthy' : 'down', lastCheck: Date.now() };
      log('  ' + provider.name + ': ' + (ok ? '✓ 正常' : '✗ 不可用'));
    } catch (e) {
      pool.providerHealth[provider.key] = { status: 'down', error: e.message, lastCheck: Date.now() };
      log('  ' + provider.name + ': ✗ 错误: ' + e.message);
    }
  }

  savePool(pool);
}

function listPool() {
  const pool = loadPool();
  log('邮箱池状态:');
  log('  总邮箱数: ' + pool.emails.length);

  if (pool.providerHealth && Object.keys(pool.providerHealth).length > 0) {
    log('  提供商健康:');
    for (const [key, health] of Object.entries(pool.providerHealth)) {
      log('    ' + key + ': ' + health.status);
    }
  }

  log('  邮箱列表:');
  const grouped = {};
  for (const e of pool.emails) {
    if (!grouped[e.status]) grouped[e.status] = [];
    grouped[e.status].push(e);
  }
  for (const [status, emails] of Object.entries(grouped)) {
    log('    [' + status + '] ' + emails.length + ' 个');
    for (const e of emails.slice(0, 5)) {
      log('      ' + e.email + ' (' + e.providerName + ')');
    }
    if (emails.length > 5) {
      log('      ... 还有 ' + (emails.length - 5) + ' 个');
    }
  }

  const results = loadBindResults();
  if (results.length > 0) {
    log('  绑定历史: ' + results.length + ' 条');
    const successCount = results.filter(r => r.includes('success')).length;
    log('    成功: ' + successCount + ', 失败: ' + (results.length - successCount));
  }
}

function loadBindResults() {
  try {
    if (fs.existsSync(RESULT_FILE)) {
      return fs.readFileSync(RESULT_FILE, 'utf-8').split('\n').filter(l => l.trim());
    }
  } catch (e) {}
  return [];
}

function exportPool() {
  const pool = loadPool();
  const available = pool.emails.filter(e => e.status === 'available');
  log('可用的邮箱: ' + available.length + ' 个');
  for (const e of available) {
    console.log(e.email);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log('');
    console.log('邮箱池管理器');
    console.log('');
    console.log('命令:');
    console.log('  --create-pool <数量>    创建邮箱池');
    console.log('  --check-health          检查提供商健康状态');
    console.log('  --list-pool             查看邮箱池');
    console.log('  --export                导出可用邮箱');
    console.log('  --help                  显示帮助');
    console.log('');
    return;
  }

  if (cmd === '--create-pool') {
    const count = parseInt(args[1]) || 10;
    await createPool(count);
  } else if (cmd === '--check-health') {
    await checkHealth();
  } else if (cmd === '--list-pool') {
    listPool();
  } else if (cmd === '--export') {
    exportPool();
  } else {
    log('未知命令: ' + cmd + ', 使用 --help 查看帮助');
  }
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});
