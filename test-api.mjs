import https from 'https';

const BASE = 'ider-order-system.sifangzhiji.workers.dev';
const API_KEY = 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opt = {
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      rejectUnauthorized: false
    };
    const req = https.request(opt, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  const results = [];

  function t(method, path, status, ok, note) {
    results.push({ method, path, status, ok, note: note || '' });
  }

  t('方法', '路径', '状态码', '结果', '备注');
  t('----', '----', '---', '----', '----');

  // ====== 公开端点 ======
  let r;

  r = await fetch('https://' + BASE + '/api/config');
  t('GET', '/api/config', r.status, r.status === 200, '');

  r = await fetch('https://' + BASE + '/api/public/config');
  t('GET', '/api/public/config', r.status, r.status === 200, '');

  r = await fetch('https://' + BASE + '/api/announcements/active');
  t('GET', '/api/announcements/active', r.status, r.status === 200, '');

  r = await fetch('https://' + BASE + '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'test_review_123', password: 'Test123456', confirmPassword: 'Test123456', inviteCode: '' })
  });
  t('POST', '/api/auth/register', r.status, r.status === 200 || r.status === 201, r.status === 200 ? '用户已存在/注册成功' : r.body.slice(0, 80));

  r = await fetch('https://' + BASE + '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'test', password: 'Test123456' })
  });
  let userToken = '';
  if (r.status === 200) {
    try {
      const j = JSON.parse(r.body);
      userToken = j.token || (j.data && j.data.token) || '';
    } catch (e) { }
  }
  t('POST', '/api/auth/login', r.status, r.status === 200, userToken ? '获取token成功' : r.body.slice(0, 80));

  r = await fetch('https://' + BASE + '/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: 'test@test.com' })
  });
  t('POST', '/api/auth/forgot-password', r.status, r.status === 200, r.body.slice(0, 80));

  // ====== 需要登录的端点 ======
  const authHeaders = userToken ? { Authorization: 'Bearer ' + userToken } : {};
  const needAuth = [
    ['GET', '/api/stats'],
    ['GET', '/api/user/info'],
    ['GET', '/api/orders'],
    ['GET', '/api/orders/1'],
    ['GET', '/api/orders/1/activities'],
    ['GET', '/api/accounts'],
    ['GET', '/api/accounts/1'],
    ['GET', '/api/accounts/1/logs'],
    ['GET', '/api/invite/info'],
    ['GET', '/api/leaderboard/purchase'],
    ['GET', '/api/recharge/packages'],
    ['GET', '/api/market/items'],
  ];
  for (const [m, p] of needAuth) {
    r = await fetch('https://' + BASE + p, { method: m, headers: authHeaders });
    let note = '';
    if (!userToken) note = '未提供token';
    else if (r.status === 200) note = '正常返回';
    else if (r.status === 401) note = '未授权';
    else if (r.status === 404) note = '资源不存在';
    else note = r.body.slice(0, 80);
    t(m, p, r.status, r.status === 200, note);
  }

  // 创建测试工单
  r = await fetch('https://' + BASE + '/api/orders', {
    method: 'POST',
    headers: Object.assign({}, authHeaders),
    body: JSON.stringify({ serviceType: 'test', description: 'API test order' })
  });
  t('POST', '/api/orders (create)', r.status, r.status === 200 || r.status === 201, r.body.slice(0, 80));

  // ====== 管理员端点 ======
  r = await fetch('https://' + BASE + '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'test', password: 'Test123456' })
  });
  let adminToken = '';
  if (r.status === 200) {
    try {
      const j = JSON.parse(r.body);
      adminToken = j.token || (j.data && j.data.token) || '';
    } catch (e) { }
  }
  const adminHeaders = adminToken ? { Authorization: 'Bearer ' + adminToken } : {};
  const adminEndpoints = [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/orders'],
    ['GET', '/api/admin/accounts'],
    ['GET', '/api/admin/config'],
    ['GET', '/api/admin/coupons'],
    ['GET', '/api/admin/announcements'],
    ['GET', '/api/admin/ads'],
    ['GET', '/api/admin/recharge'],
    ['GET', '/api/admin/recharge-codes'],
    ['GET', '/api/admin/market/items'],
    ['GET', '/api/admin/market-orders'],
    ['GET', '/api/gh/approved-orders'],
    ['GET', '/api/gh/active-accounts'],
  ];
  for (const [m, p] of adminEndpoints) {
    r = await fetch('https://' + BASE + p, { method: m, headers: adminHeaders });
    let note = '';
    if (r.status === 401 || r.status === 403) note = '无管理员权限';
    else if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        note = j.error || j.message || '正常返回';
      } catch (e) { note = '正常返回(非JSON)'; }
    } else note = r.body.slice(0, 80);
    t(m, p, r.status, r.status === 200, note);
  }

  // ====== gh-actions 端点 ======
  const ghHeaders = { 'x-api-key': API_KEY };

  r = await fetch('https://' + BASE + '/api/gh/report-account', {
    method: 'POST',
    headers: Object.assign({}, ghHeaders),
    body: JSON.stringify({ username: 'test_verify', account: 'test_account', platform: 'test', status: 'active' })
  });
  t('POST', '/api/gh/report-account', r.status, r.status === 200, r.body.slice(0, 80));

  r = await fetch('https://' + BASE + '/api/gh/report-health', {
    method: 'POST',
    headers: Object.assign({}, ghHeaders),
    body: JSON.stringify({ status: 'healthy', uptime: 3600 })
  });
  t('POST', '/api/gh/report-health', r.status, r.status === 200, r.body.slice(0, 80));

  r = await fetch('https://' + BASE + '/api/gh/report-log', {
    method: 'POST',
    headers: Object.assign({}, ghHeaders),
    body: JSON.stringify({ level: 'info', message: 'API test', source: 'api-test' })
  });
  t('POST', '/api/gh/report-log', r.status, r.status === 200, r.body.slice(0, 80));

  // ====== 输出汇总 ======
  console.log('API 端点测试报告');
  console.log('Worker: ' + BASE);
  console.log('时间: ' + new Date().toISOString());
  console.log('');
  console.log('端点'.padEnd(50) + '方法'.padEnd(10) + '状态码'.padEnd(10) + '结果'.padEnd(12) + '备注');
  console.log(''.padEnd(120, '-'));
  for (const row of results) {
    console.log(
      row.path.padEnd(50) +
      row.method.padEnd(10) +
      String(row.status).padEnd(10) +
      (row.ok ? '✓ PASS'.padEnd(12) : '✗ FAIL'.padEnd(12)) +
      row.note
    );
  }
  console.log(''.padEnd(120, '-'));
  const passed = results.filter(r => r.ok !== undefined && r.ok).length;
  const failed = results.filter(r => r.ok !== undefined && !r.ok).length;
  console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
}

main().catch(console.error);