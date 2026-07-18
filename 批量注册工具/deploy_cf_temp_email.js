/**
 * 艾德尔修仙传 - Cloudflare 临时邮箱自部署助手
 *
 * 这是一个将 cloudflare_temp_email 项目部署到你自己的 Cloudflare 账号的辅助脚本。
 * 自建邮箱的优势：
 *   1. 完全免费（Cloudflare 免费计划即可）
 *   2. 无限邮箱数量，无 API 限额
 *   3. 自定义域名，不会被游戏/平台拉黑
 *   4. 数据完全自主可控
 *   5. 支持 API 创建邮箱和轮询收信
 *
 * 前置要求：
 *   1. 一个 Cloudflare 账号（免费）
 *   2. 一个 Cloudflare 管理的域名（可以在 Cloudflare 注册或接入）
 *   3. Node.js 18+
 *
 * 部署步骤（手动，因为需要 Cloudflare 登录）:
 *   见下方说明
 */

const fetch = require('node-fetch');
const readline = require('readline');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

function log(msg) {
  console.log('[' + new Date().toLocaleString('zh-CN', { hour12: false }) + '] ' + msg);
}

async function showGuide() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║      Cloudflare 临时邮箱自部署指南                        ║');
  console.log('║      项目: cloudflare_temp_email                          ║');
  console.log('║      仓库: github.com/dreamhunter2333/cloudflare_temp_email ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('┌─ 第1步: 准备环境');
  console.log('│');
  console.log('│  1. 安装 Wrangler CLI:');
  console.log('│     npm install -g wrangler');
  console.log('│');
  console.log('│  2. 登录 Cloudflare:');
  console.log('│     wrangler login');
  console.log('│');
  console.log('├─ 第2步: 克隆项目');
  console.log('│');
  console.log('│  git clone https://github.com/dreamhunter2333/cloudflare_temp_email.git');
  console.log('│  cd cloudflare_temp_email');
  console.log('│');
  console.log('├─ 第3步: 配置');
  console.log('│');
  console.log('│  编辑 wrangler.toml:');
  console.log('│  ────────────────────────────────────────────────');
  console.log('│  name = "temp-email"');
  console.log('│  main = "src/worker.js"');
  console.log('│  compatibility_date = "2024-01-01"');
  console.log('│');
  console.log('│  [vars]');
  console.log('│  ADMIN_PASSWORDS = "你设置的密码"');
  console.log('│  JWT_SECRET = "随机字符串"');
  console.log('│  DOMAIN = "mail.你的域名.com"');
  console.log('│');
  console.log('│  [[d1_databases]]');
  console.log('│  binding = "DB"');
  console.log('│  database_name = "temp-email-db"');
  console.log('│  database_id = "<创建D1后获取的ID>"');
  console.log('│  ────────────────────────────────────────────────');
  console.log('│');
  console.log('├─ 第4步: 创建 D1 数据库');
  console.log('│');
  console.log('│  wrangler d1 create temp-email-db');
  console.log('│  # → 输出的 database_id 填到 wrangler.toml');
  console.log('│');
  console.log('├─ 第5步: 配置域名邮件路由');
  console.log('│');
  console.log('│  在 Cloudflare Dashboard:');
  console.log('│  1. 进入域名 → Email → Email Routing');
  console.log('│  2. 启用 Email Routing');
  console.log('│  3. 添加 Catch-All 规则 → 发送到 Worker "temp-email"');
  console.log('│  4. 配置 MX 记录（如果提示需要）');
  console.log('│');
  console.log('├─ 第6步: 部署');
  console.log('│');
  console.log('│  npm install');
  console.log('│  wrangler d1 execute temp-email-db --file=./schema.sql');
  console.log('│  wrangler deploy');
  console.log('│');
  console.log('├─ 第7步: 测试');
  console.log('│');
  console.log('│  # 创建邮箱:');
  console.log('│  curl -X POST https://temp-email.你的用户名.workers.dev/api/email \\');
  console.log('│    -H "Authorization: Bearer 你的密码" \\');
  console.log('│    -H "Content-Type: application/json" \\');
  console.log('│    -d \'{"name": "test"}\'');
  console.log('│');
  console.log('│  # 查看邮件:');
  console.log('│  curl https://temp-email.你的用户名.workers.dev/api/emails/test@mail.你的域名.com \\');
  console.log('│    -H "Authorization: Bearer 你的密码"');
  console.log('│');
  console.log('└─ 完成!');
  console.log('');
  console.log('部署后在 batch_email_bind.js 中添加你的自建邮箱提供商:');
  console.log('');
  console.log('  // 在 EMAIL_PROVIDERS 中添加:');
  console.log('  cf_self: {');
  console.log('    name: "自建CF邮箱",');
  console.log('    createInbox: async () => {');
  console.log('      const name = "u" + Date.now().toString(36);');
  console.log('      const r = await fetch("https://你的worker域名/api/email", {');
  console.log('        method: "POST",');
  console.log('        headers: {');
  console.log('          "Authorization": "Bearer 你的密码",');
  console.log('          "Content-Type": "application/json"');
  console.log('        },');
  console.log('        body: JSON.stringify({ name })');
  console.log('      });');
  console.log('      return { email: name + "@mail.你的域名.com", token: name };');
  console.log('    },');
  console.log('    pollCode: async (inbox, maxWaitMs) => { ... },');
  console.log('  },');
  console.log('');
}

async function generateDeployFiles() {
  log('生成部署配置文件...');

  const domain = await ask('你的域名 (如 example.com): ');
  const adminPassword = await ask('管理密码: ');

  const jwtSecret = require('crypto').randomBytes(32).toString('hex');
  const subdomain = 'mail';

  console.log('');
  console.log('配置摘要:');
  console.log('  Worker名称: temp-email');
  console.log('  域名: ' + subdomain + '.' + domain);
  console.log('  密码: ' + adminPassword);
  console.log('  JWT密钥: ' + jwtSecret);
  console.log('');

  const wranglerConfig = `name = "temp-email"
main = "src/worker.js"
compatibility_date = "2024-01-01"

[vars]
ADMIN_PASSWORDS = "${adminPassword}"
JWT_SECRET = "${jwtSecret}"
DOMAIN = "${subdomain}.${domain}"

[[d1_databases]]
binding = "DB"
database_name = "temp-email-db"
database_id = "<REPLACE_WITH_DATABASE_ID>"
`;

  try {
    const dir = path.join(__dirname, 'cf_temp_email_config');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'wrangler.toml'), wranglerConfig, 'utf-8');
    log('配置文件已生成: ' + path.join(dir, 'wrangler.toml'));
    log('请将 database_id 替换为实际值');
  } catch (e) {
    log('生成失败: ' + e.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log('');
    console.log('Cloudflare 临时邮箱自部署助手');
    console.log('');
    console.log('命令:');
    console.log('  --guide             查看部署指南');
    console.log('  --generate-config   生成配置文件');
    console.log('  --help              显示帮助');
    console.log('');
    return;
  }

  if (cmd === '--guide') {
    await showGuide();
  } else if (cmd === '--generate-config') {
    const fs = require('fs');
    const path = require('path');
    await generateDeployFiles();
  } else {
    log('未知命令: ' + cmd);
  }
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});
